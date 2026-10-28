import { Router, type Request, type Response } from 'express';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db/client.js';
import { contacts, inboxes, users } from '../db/schema.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { verifyToken } from '../lib/jwt.js';
import { findVisibleConversation } from '../lib/conversations.js';
import { broadcastLigacao } from '../lib/realtime.js';
import {
  AstraErro, astra, astraChave, astraUrl, caixasComLigacao, chamadas, clienteDe, encerrou, estadoSessao, ligacaoConfigurada,
  nomeDoUsuario, numeroEmLigacao, publico, travarNumero, type Chamada,
} from '../lib/ligacao.js';

// Telefone do CRM (lib/ligacao.ts): a consultora liga/atende pelo navegador. A chave do AstraCalls
// nunca vai pro navegador: a negociação (SDP) e o áudio por WebSocket passam por aqui.
export const ligacaoRouter = Router();
ligacaoRouter.use(['/ligacao', '/inboxes/:id/ligacao'], requireAuth);
const acc = (req: Request) => req.user!.accountId!;
const erro = (res: Response, status: number, message: string) => res.status(status).json({ message });

ligacaoRouter.get('/ligacao/estado', async (req, res) => {
  const caixas = ligacaoConfigurada() ? (await caixasComLigacao(acc(req))).map(c => c.id) : [];
  res.json({ configurada: ligacaoConfigurada(), caixas, ativas: [...chamadas.values()].filter(c => c.accountId === acc(req)).map(publico) });
});

function minha(req: Request, res: Response): Chamada | null {
  const c = chamadas.get(String(req.params.callId));
  if (!c || c.accountId !== acc(req)) { erro(res, 404, 'Essa ligação já terminou.'); return null }
  return c;
}

/** Ligar pro contato da conversa, pelo número (caixa) da conversa. */
ligacaoRouter.post('/ligacao/ligar', async (req, res) => {
  const u = req.user!;
  const conv = await findVisibleConversation(u, Number(req.body.conversation_id));
  if (!conv) return erro(res, 404, 'Conversa não encontrada.');
  const [inbox] = conv.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, conv.inboxId)) : [];
  if (!inbox?.callSessionId) return erro(res, 409, 'Este número ainda não está liberado pra ligação. A diretoria liga em Configurações › Canais.');
  const [contato] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  const telefone = (contato?.phone || '').replace(/\D/g, '');
  if (telefone.length < 12) return erro(res, 422, 'Esse contato não tem telefone pra ligar.');
  if (numeroEmLigacao(inbox.id)) return erro(res, 409, 'Esse número já está numa ligação agora. Tente em alguns segundos.');
  travarNumero(inbox.id, true);
  let callId: string;
  try {
    callId = (await astra<{ call: { callId: string } }>('POST', `/api/sessions/${encodeURIComponent(inbox.callSessionId)}/calls`,
      { phone: telefone, duration_ms: 3_600_000, record: false, video: false }, clienteDe(u.id))).call.callId;
  } catch (e) {
    travarNumero(inbox.id, false);
    return erro(res, 502, 'Não consegui ligar: ' + (e instanceof AstraErro ? e.message : 'tente de novo'));
  }
  const c: Chamada = {
    callId, sid: inbox.callSessionId, inboxId: inbox.id, accountId: acc(req), direcao: 'saida', telefone, nome: contato?.name || '',
    contactId: contato?.id ?? null, conversationId: conv.id, status: 'chamando', userId: u.id, userNome: await nomeDoUsuario(u.id),
    inicio: Date.now(), atendidaEm: null,
  };
  chamadas.set(callId, c);
  res.json({ chamada: publico(c) });
});

/** Negociação WebRTC: o navegador manda a oferta, devolvemos a resposta do AstraCalls. */
ligacaoRouter.post('/ligacao/:callId/sdp', async (req, res) => {
  const c = minha(req, res); if (!c) return;
  try {
    const r = await astra<{ sdp_answer: string }>('POST', `/api/sessions/${encodeURIComponent(c.sid)}/calls/${encodeURIComponent(c.callId)}/webrtc`, { sdp_offer: String(req.body.sdp_offer || '') }, clienteDe(req.user!.id));
    res.json({ sdp_answer: r.sdp_answer });
  } catch (e) { erro(res, 502, 'Áudio: ' + (e as Error).message) }
});

ligacaoRouter.post('/ligacao/:callId/atender', async (req, res) => {
  const c = minha(req, res); if (!c) return;
  if (c.direcao !== 'entrada') return erro(res, 400, 'Essa ligação não é recebida.');
  try { await astra('POST', `/api/sessions/${encodeURIComponent(c.sid)}/calls/${encodeURIComponent(c.callId)}/accept`, { record: false }, clienteDe(req.user!.id), 20_000) }
  catch (e) {
    if (e instanceof AstraErro && e.status === 409) return erro(res, 409, 'Outra pessoa já atendeu essa ligação.');
    return erro(res, 502, 'Não consegui atender: ' + (e as Error).message);
  }
  c.userId = req.user!.id; c.userNome = await nomeDoUsuario(req.user!.id);
  c.status = 'em_andamento'; c.atendidaEm = Date.now();
  travarNumero(c.inboxId, true);
  broadcastLigacao(c.accountId, { tipo: 'status', chamada: publico(c) });
  res.json({ chamada: publico(c) });
});

ligacaoRouter.post('/ligacao/:callId/recusar', async (req, res) => {
  const c = minha(req, res); if (!c) return;
  await astra('POST', `/api/sessions/${encodeURIComponent(c.sid)}/calls/${encodeURIComponent(c.callId)}/reject`, {}, clienteDe(req.user!.id), 20_000).catch(() => {});
  await encerrou(c, 'recusada');
  res.json({ ok: true });
});

ligacaoRouter.post('/ligacao/:callId/desligar', async (req, res) => {
  const c = minha(req, res); if (!c) return;
  await astra('DELETE', `/api/sessions/${encodeURIComponent(c.sid)}/calls/${encodeURIComponent(c.callId)}`, undefined, clienteDe(req.user!.id), 20_000).catch(() => {});
  await encerrou(c, 'desligada');
  res.json({ ok: true });
});

ligacaoRouter.post('/ligacao/:callId/espera', async (req, res) => {
  const c = minha(req, res); if (!c) return;
  const sim = !!req.body.ativa;
  try { await astra('POST', `/api/sessions/${encodeURIComponent(c.sid)}/calls/${encodeURIComponent(c.callId)}/${sim ? 'hold' : 'resume'}`, sim ? { moh: true } : {}, clienteDe(req.user!.id), 20_000) }
  catch (e) { return erro(res, 502, (e as Error).message) }
  res.json({ ok: true });
});

/** Diagnóstico do áudio do navegador (vai pro log). */
ligacaoRouter.post('/ligacao/:callId/diag', (req, res) => {
  console.log('[Ligação diag]', req.params.callId, JSON.stringify(req.body).slice(0, 500));
  res.json({ ok: true });
});

// --- configuração por caixa (diretoria) --------------------------------------------------------
async function caixaDaConta(req: Request, res: Response) {
  const [i] = await db.select().from(inboxes).where(and(eq(inboxes.id, Number(req.params.id)), eq(inboxes.accountId, acc(req))));
  if (!i) { erro(res, 404, 'Caixa não encontrada.'); return null }
  return i;
}

ligacaoRouter.get('/inboxes/:id/ligacao', requireOwner, async (req, res) => {
  const i = await caixaDaConta(req, res); if (!i) return;
  if (!ligacaoConfigurada()) return res.json({ configurada: false });
  if (!i.callSessionId) return res.json({ configurada: true, ligada: false });
  let s: any = null;
  try { s = (await astra<{ sessions: any[] }>('GET', '/api/sessions')).sessions.find(x => x.id === i.callSessionId) } catch { /* fora do ar */ }
  const ev = estadoSessao.get(i.callSessionId);
  res.json({ configurada: true, ligada: true, conectado: !!s?.paired, numero: s?.jid ? String(s.jid).split(/[:@]/)[0] : null, qr: !s?.paired ? ev?.qr ?? null : null });
});

/** Liga a ligação nesta caixa: cria a sessão no AstraCalls (se não tiver) e começa o QR. */
ligacaoRouter.post('/inboxes/:id/ligacao/conectar', requireOwner, async (req, res) => {
  const i = await caixaDaConta(req, res); if (!i) return;
  try {
    let sid = i.callSessionId;
    // sessão que já existe no AstraCalls (ex.: número conectado antes, no teste): só vincula
    const existente = String(req.body?.session_id || '');
    if (!sid && existente) {
      const s = (await astra<{ sessions: { id: string }[] }>('GET', '/api/sessions')).sessions.find(x => x.id === existente);
      if (!s) return erro(res, 404, 'Sessão de ligação não encontrada.');
      await db.update(inboxes).set({ callSessionId: existente }).where(eq(inboxes.id, i.id));
      return res.json({ ok: true });
    }
    if (!sid) {
      sid = (await astra<{ id: string }>('POST', '/api/sessions', { name: `${i.name} (CRM)` })).id;
      await db.update(inboxes).set({ callSessionId: sid }).where(eq(inboxes.id, i.id));
    }
    await astra('POST', `/api/sessions/${encodeURIComponent(sid)}/pair`).catch(e => { if (!/already paired/i.test((e as Error).message)) throw e });
    res.json({ ok: true });
  } catch (e) { erro(res, 502, 'Não consegui preparar a ligação: ' + (e as Error).message) }
});

/** Desliga a ligação desta caixa (desconecta o aparelho de ligação do WhatsApp). */
ligacaoRouter.delete('/inboxes/:id/ligacao', requireOwner, async (req, res) => {
  const i = await caixaDaConta(req, res); if (!i) return;
  if (i.callSessionId) {
    await astra('POST', `/api/sessions/${encodeURIComponent(i.callSessionId)}/logout`).catch(() => {});
    await astra('DELETE', `/api/sessions/${encodeURIComponent(i.callSessionId)}`).catch(() => {});
  }
  await db.update(inboxes).set({ callSessionId: null }).where(eq(inboxes.id, i.id));
  res.json({ ok: true });
});

// --- áudio por WebSocket (quando o WebRTC/UDP não passa) --------------------------------------
const wss = new WebSocketServer({ noServer: true, handleProtocols: p => (p.has('pcm16') ? 'pcm16' : false) });

/** "upgrade" do servidor HTTP. Rota: /ligacao/<callId>/ws?token=... (devolve false se não for dela). */
export async function tratarUpgradeLigacao(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const url = new URL(req.url || '', 'http://x');
  const m = url.pathname.match(/^\/ligacao\/([^/]+)\/ws$/);
  if (!m) return false;
  let userId = 0, accountId = 0;
  try {
    const claims = verifyToken(url.searchParams.get('token') || '');
    const [u] = await db.select().from(users).where(eq(users.id, Number(claims.sub)));
    if (u && u.jti === claims.jti && u.status === 'active') { userId = u.id; accountId = u.accountId! }
  } catch { /* token inválido */ }
  const c = chamadas.get(decodeURIComponent(m[1]));
  if (!userId || !c || c.accountId !== accountId) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return true }
  wss.handleUpgrade(req, socket, head, cliente => {
    const alvo = astraUrl().replace(/^http/, 'ws') + `/api/sessions/${encodeURIComponent(c.sid)}/calls/${encodeURIComponent(c.callId)}/ws?apiKey=${encodeURIComponent(astraChave())}`;
    const astraWs = new WebSocket(alvo, ['pcm16'], { headers: { 'X-Client-Id': clienteDe(userId) } });
    const fila: Buffer[] = [];
    astraWs.on('open', () => { for (const f of fila.splice(0)) astraWs.send(f) });
    cliente.on('message', (d: Buffer, bin: boolean) => {
      if (!bin) return;
      if (astraWs.readyState === WebSocket.OPEN) astraWs.send(d); else if (fila.length < 50) fila.push(d);
    });
    astraWs.on('message', (d: Buffer, bin: boolean) => { if (bin && cliente.readyState === WebSocket.OPEN) cliente.send(d) });
    const fechar = () => { try { cliente.close() } catch { /* */ } try { astraWs.close() } catch { /* */ } };
    cliente.on('close', fechar); astraWs.on('close', fechar);
    cliente.on('error', fechar); astraWs.on('error', e => { console.warn('[Ligação ws]', c.callId, (e as Error).message); fechar() });
  });
  return true;
}

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, inboxes, users } from '../db/schema.js';
import { broadcastLigacao, broadcastConversations } from './realtime.js';
import { findOrCreateConversation } from './conversations.js';
import { createMessage, rebroadcast } from './messages.js';
import { attach } from './storage.js';
import { mesmoTelefoneSql } from './mesclarContatos.js';
import { cache } from './cache.js';

// Ligação de voz pelo WhatsApp (pedido da dona, 28/10), igual ao telefone do InoovaCall:
// o AstraCalls roda no Coolify da Clara SEM domínio — só a API do CRM fala com ele, pela rede
// interna (ASTRACALLS_URL). A chave dele nunca vai pro navegador: a negociação de áudio (SDP) e o
// áudio por WebSocket passam pelo CRM (routes/ligacao.ts). Cada caixa de entrada tem a SUA sessão
// no AstraCalls (inboxes.call_session_id): é o mesmo número conectado como mais um aparelho.
// Enquanto a ligação dura, o disparo daquele número espera (o WhatsApp só aguenta uma por vez).

const URL_ASTRA = (process.env.ASTRACALLS_URL || '').replace(/\/$/, '');
const CHAVE = process.env.ASTRACALLS_API_KEY || '';
export const ligacaoConfigurada = () => !!(URL_ASTRA && CHAVE);
export const astraUrl = () => URL_ASTRA;
export const astraChave = () => CHAVE;
export const clienteDe = (userId: number) => `crm_${userId}`;

export class AstraErro extends Error { constructor(msg: string, public status: number) { super(msg) } }

/** Chamada à API do AstraCalls (rede interna). */
export async function astra<T = any>(metodo: string, caminho: string, corpo?: unknown, clientId?: string, timeoutMs = 30_000): Promise<T> {
  if (!ligacaoConfigurada()) throw new AstraErro('Ligação não configurada no servidor.', 503);
  const r = await fetch(URL_ASTRA + caminho, {
    method: metodo, signal: AbortSignal.timeout(timeoutMs),
    headers: { 'X-API-Key': CHAVE, 'Content-Type': 'application/json', ...(clientId ? { 'X-Client-Id': clientId } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  let j: any = null; try { j = txt ? JSON.parse(txt) : null } catch { /* resposta sem JSON */ }
  if (!r.ok) throw new AstraErro(j?.error || txt.slice(0, 200) || `erro ${r.status}`, r.status);
  return j as T;
}

// --- chamadas em andamento (em memória) ---------------------------------------------------------
export interface Chamada {
  callId: string; sid: string; inboxId: number; accountId: number;
  direcao: 'saida' | 'entrada'; telefone: string; nome: string; contactId: number | null; conversationId: number | null;
  status: 'chamando' | 'tocando' | 'em_andamento' | 'encerrada';
  userId: number | null; userNome: string; inicio: number; atendidaEm: number | null;
}
export const chamadas = new Map<string, Chamada>();

export const publico = (c: Chamada) => ({
  callId: c.callId, direcao: c.direcao, telefone: c.telefone, nome: c.nome, contactId: c.contactId, conversationId: c.conversationId,
  inboxId: c.inboxId, status: c.status, userId: c.userId, userNome: c.userNome, inicio: c.inicio, atendidaEm: c.atendidaEm,
});

/** O número está numa ligação? (o disparo espera) */
export const numeroEmLigacao = (inboxId: number) => !!cache.read(`em_ligacao_${inboxId}`);
export const travarNumero = (inboxId: number, sim: boolean) => (sim ? cache.write(`em_ligacao_${inboxId}`, true, 3 * 3600) : cache.delete(`em_ligacao_${inboxId}`));

/** Contato da conta pelo telefone (mesmo DDD + 8 últimos dígitos), sem grupo. */
export async function contatoPorTelefone(accountId: number, telefone: string) {
  if (telefone.replace(/\D/g, '').length < 10) return null;
  const [c] = await db.select().from(contacts).where(and(eq(contacts.accountId, accountId),
    sql`coalesce(${contacts.status}, '') <> 'grupo' AND coalesce(${contacts.jid}, '') NOT LIKE '%@g.us'`,
    mesmoTelefoneSql(contacts.phone, '+' + telefone.replace(/\D/g, '')))).orderBy(sql`${contacts.idJueri} IS NULL`, contacts.id).limit(1);
  return c ?? null;
}

// --- eventos do AstraCalls (SSE) ----------------------------------------------------------------
export function iniciarEventosLigacao() {
  if (!ligacaoConfigurada()) return;
  void (async () => {
    for (;;) {
      try {
        const r = await fetch(`${URL_ASTRA}/api/events?apiKey=${encodeURIComponent(CHAVE)}`, { headers: { Accept: 'text/event-stream' } });
        if (!r.ok || !r.body) throw new Error('sse ' + r.status);
        const leitor = r.body.getReader(), dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const linha = buf.slice(0, i).split('\n').find(l => l.startsWith('data:'));
            buf = buf.slice(i + 2);
            if (!linha) continue;
            try { await tratar(JSON.parse(linha.slice(5).trim())) } catch (e) { console.warn('[Ligação]', (e as Error).message) }
          }
        }
      } catch { /* AstraCalls fora do ar: tenta de novo */ }
      await new Promise(r => setTimeout(r, 3000));
    }
  })();
}

/** QR / estado de conexão das sessões (pra tela da caixa de entrada). */
export const estadoSessao = new Map<string, { state: string; paired: boolean; qr?: string; at: number }>();

async function tratar(ev: any) {
  if (ev?.type === 'session-qr' && ev.sessionId) { estadoSessao.set(ev.sessionId, { state: 'qr', paired: false, qr: ev.qr, at: Date.now() }); return }
  if (ev?.type === 'auth-state' && ev.sessionId) { estadoSessao.set(ev.sessionId, { state: ev.state, paired: !!ev.paired, qr: ev.qr || undefined, at: Date.now() }); return }
  if (ev?.type === 'session-list' && Array.isArray(ev.sessions)) {
    for (const s of ev.sessions) estadoSessao.set(s.id, { state: s.state, paired: !!s.paired, qr: estadoSessao.get(s.id)?.qr, at: Date.now() });
    return;
  }
  if (ev?.type === 'incoming') {
    // alguém ligando pro número de uma caixa: toca no CRM pra quem atende aquela caixa
    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.callSessionId, String(ev.sessionId)));
    if (!inbox?.accountId) return;
    const telefone = String(ev.phone || '').replace(/\D/g, '') || String(ev.peer || '').split('@')[0].replace(/\D/g, '');
    const contato = telefone ? await contatoPorTelefone(inbox.accountId, telefone) : null;
    const c: Chamada = {
      callId: ev.id, sid: ev.sessionId, inboxId: inbox.id, accountId: inbox.accountId, direcao: 'entrada', telefone,
      nome: contato?.name || ev.name || '', contactId: contato?.id ?? null, conversationId: null, status: 'tocando',
      userId: null, userNome: '', inicio: Date.now(), atendidaEm: null,
    };
    if (contato) c.conversationId = (await findOrCreateConversation(contato.id, inbox.id, { accountId: inbox.accountId, source: 'whatsapp' })).id;
    chamadas.set(c.callId, c);
    broadcastLigacao(c.accountId, { tipo: 'chegando', chamada: publico(c) });
    return;
  }
  const c = chamadas.get(String(ev?.id || ''));
  if (!c) return;
  if (ev.type === 'incoming-claimed') { broadcastLigacao(c.accountId, { tipo: 'atendida_por_outro', callId: c.callId }); return }
  if (ev.type === 'call-status') {
    const st = String(ev.status || '').toLowerCase();
    if (/connected|active|in_progress|answered/.test(st) && c.status !== 'em_andamento') { c.status = 'em_andamento'; c.atendidaEm = Date.now() }
    broadcastLigacao(c.accountId, { tipo: 'status', chamada: publico(c) });
    return;
  }
  if (ev.type === 'call-ended') await encerrou(c, String(ev.reason || ''));
}

const duracao = (seg: number) => (seg >= 60 ? `${Math.floor(seg / 60)}min ${seg % 60}s` : `${seg}s`);

/** Ligação terminou: libera o número, registra na conversa e avisa as telas. Idempotente. */
export async function encerrou(c: Chamada, motivo = '') {
  if (c.status === 'encerrada') return;
  const atendida = !!c.atendidaEm;
  c.status = 'encerrada';
  chamadas.delete(c.callId);
  travarNumero(c.inboxId, false);
  broadcastLigacao(c.accountId, { tipo: 'encerrada', callId: c.callId, motivo });
  if (!c.conversationId) return;
  const seg = atendida ? Math.round((Date.now() - c.atendidaEm!) / 1000) : 0;
  // saída: nota da equipe (não vai pro cliente); entrada: aparece como do cliente (perdida conta como não lida)
  const texto = c.direcao === 'saida'
    ? (atendida ? `Ligação feita por ${c.userNome || 'atendente'} (${duracao(seg)})` : `Ligação de ${c.userNome || 'atendente'} não atendida`)
    : (atendida ? `Ligação recebida, atendida por ${c.userNome || 'atendente'} (${duracao(seg)})` : 'Ligação perdida');
  try {
    const msg = await createMessage(c.direcao === 'saida'
      ? { accountId: c.accountId, conversationId: c.conversationId, senderType: 'User', senderId: c.userId, text: texto, isPrivate: true }
      : { accountId: c.accountId, conversationId: c.conversationId, senderType: 'Contact', senderId: c.contactId, text: texto, isPrivate: false } as any);
    // gravação (as duas vozes num MP3): o AstraCalls termina de gerar logo depois — vai anexada no registro
    if (atendida) void guardarGravacao(c.callId, msg.id)
    if (c.direcao === 'entrada' && !atendida) broadcastConversations(c.accountId, { event: 'conversation_updated', conversation: { id: c.conversationId, status: 'open' } });
  } catch (e) { console.warn('[Ligação] registrar', (e as Error).message) }
}

/** Baixa o MP3 da ligação do AstraCalls e anexa na mensagem de registro (fica no armazenamento do CRM). */
async function guardarGravacao(callId: string, messageId: number) {
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const r = await fetch(`${URL_ASTRA}/recordings/${encodeURIComponent(callId)}.mp3`, { headers: { 'X-API-Key': CHAVE }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 404) continue; // ainda gerando (ou ligação curta demais, menos de 3 s)
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) continue;
      const quando = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/[: ]/g, '-').slice(0, 16);
      await attach('Message', messageId, 'attachment', buf, `gravacao-ligacao-${quando}.mp3`, 'audio/mpeg');
      await rebroadcast(messageId);
      return;
    } catch { /* tenta de novo */ }
  }
  console.warn('[Ligação] gravação não encontrada', callId);
}

export async function nomeDoUsuario(userId: number) {
  const [u] = await db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, userId));
  return `${u?.f ?? ''} ${u?.l ?? ''}`.trim();
}

/** Caixas com ligação ligada (pra tela saber onde mostrar o botão). */
export async function caixasComLigacao(accountId: number) {
  return db.select({ id: inboxes.id }).from(inboxes).where(and(eq(inboxes.accountId, accountId), isNotNull(inboxes.callSessionId)));
}

// segurança: chamada "esquecida" (evento perdido) é encerrada depois de 2h
setInterval(() => { for (const c of chamadas.values()) if (Date.now() - c.inicio > 2 * 3600_000) void encerrou(c, 'timeout') }, 60_000);

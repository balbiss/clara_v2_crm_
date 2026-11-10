import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, globalSettings } from '../db/schema.js';
import { requireAuth, requirePerm } from '../middleware/auth.js';
import { globalSetting } from '../lib/openai.js';
import { fullName } from '../lib/users.js';
import { contatoAcessivel } from './pipelines.js';

// Ponte com o sistema de cadastro de revendedoras (cadastro.clarajoias.com.br — app SEPARADO).
// A atendente pede o formulário na conversa → o CRM chama a API do cadastro dizendo QUEM é a
// atendente (nome, e-mail, id) → volta o link pra mandar à cliente. O cadastro avisa cada mudança
// pelo webhook /webhooks/cadastros (assinado com HMAC) e o CRM guarda o resumo no contato
// (custom_attributes.cadastro_clara). Dado sensível (SPC, documentos) fica só no cadastro.
// Config: env CADASTROS_API_URL / CADASTROS_API_KEY / CADASTROS_WEBHOOK_SECRET, ou a tela
// Configurações › Central de integrações (global_settings com os mesmos nomes em minúsculas).
export const cadastroClaraRouter = Router();
/* eslint-disable @typescript-eslint/no-explicit-any */

async function config() {
  const url = (process.env.CADASTROS_API_URL || (await globalSetting('cadastros_api_url')) || '').replace(/\/+$/, '').replace(/\/api$/, '');
  const chave = process.env.CADASTROS_API_KEY || (await globalSetting('cadastros_api_key')) || '';
  const segredo = process.env.CADASTROS_WEBHOOK_SECRET || (await globalSetting('cadastros_webhook_secret')) || '';
  return { url, chave, segredo, ligado: !!(url && chave) };
}

async function chamar(method: 'GET' | 'POST', caminho: string, body?: unknown) {
  const { url, chave } = await config();
  const r = await fetch(url + '/api/integracao' + caminho, {
    method, signal: AbortSignal.timeout(15_000),
    headers: { 'X-Api-Key': chave, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json: any; try { json = JSON.parse(txt); } catch { json = { error: txt.slice(0, 200) }; }
  return { status: r.status, json };
}

/** Resumo que fica no contato (o que o CRM precisa pra mostrar e, depois, pros relatórios). */
const resumo = (c: any) => ({
  id: c.id, codigo: c.codigo, status: c.status, status_nome: c.status_nome, situacao: c.situacao || c.status, situacao_nome: c.situacao_nome || c.status_nome,
  motivo: c.motivo || null, consultora: c.consultora || null, consultora_email: c.consultora_email || null, crm_user_id: c.crm_user_id || null,
  origem: c.origem || null, link_formulario: c.link_formulario, link_dossie: c.link_dossie,
  liberado_em: c.liberado_em || null, iniciada_em: c.iniciada_em || null, atualizado_em: new Date().toISOString(),
});
async function guardarNoContato(accountId: number | null, contactId: number, c: any) {
  const conds = [eq(contacts.id, contactId), ...(accountId ? [eq(contacts.accountId, accountId)] : [])];
  await db.update(contacts).set({ customAttributes: sql`COALESCE(${contacts.customAttributes}, '{}'::jsonb) || ${JSON.stringify({ cadastro_clara: resumo(c) })}::jsonb` })
    .where(and(...conds));
}

// situação do cadastro desta cliente (o painel da conversa chama ao abrir)
cadastroClaraRouter.get('/cadastro_clara/contacts/:id', requireAuth, async (req, res) => {
  const cid = Number(req.params.id);
  const cfg = await config();
  if (!cfg.ligado) return res.json({ ligado: false });
  if (!(await contatoAcessivel(req, cid))) return res.status(403).json({ message: 'Essa cliente é da carteira de outra pessoa.' });
  try {
    const r = await chamar('GET', '/cadastros/' + cid);
    if (r.status === 404) return res.json({ ligado: true, cadastro: null });
    if (r.status >= 400) return res.status(502).json({ ligado: true, message: 'O sistema de cadastro respondeu com erro (' + r.status + ').' });
    await guardarNoContato(req.user!.accountId!, cid, r.json);
    res.json({ ligado: true, cadastro: resumo(r.json) });
  } catch (e) {
    res.status(502).json({ ligado: true, message: 'Sistema de cadastro fora do ar: ' + (e as Error).message });
  }
});

// "Gerar link do formulário": abre (ou reaproveita) o cadastro com a atendente logada como dona
cadastroClaraRouter.post('/cadastro_clara/contacts/:id/formulario', requireAuth, async (req, res) => {
  const cid = Number(req.params.id);
  const cfg = await config();
  if (!cfg.ligado) return res.status(422).json({ message: 'A ligação com o sistema de cadastro não está configurada (Configurações › Central de integrações).' });
  if (!(await contatoAcessivel(req, cid))) return res.status(403).json({ message: 'Essa cliente é da carteira de outra pessoa.' });
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, cid), eq(contacts.accountId, req.user!.accountId!))).limit(1);
  if (!c) return res.status(404).json({ message: 'Contato não encontrado.' });
  const u = req.user!;
  const nome = (c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '').trim();
  if (nome.length < 2) return res.status(422).json({ message: 'Coloque o nome da cliente no contato antes de gerar o formulário.' });
  try {
    const r = await chamar('POST', '/cadastros', {
      crm_lead_id: String(c.id), crm_contact_id: String(c.id), nome, telefone: c.phone || undefined, email: c.email || undefined, cpf: c.cpf || undefined,
      consultora: fullName(u) || u.email, consultora_email: u.email, crm_user_id: String(u.id),
      ...(req.body?.origem ? { origem: String(req.body.origem) } : {}), ...(req.body?.campanha ? { campanha: String(req.body.campanha) } : {}),
    });
    if (r.status >= 400) return res.status(502).json({ message: r.json?.error || 'O sistema de cadastro recusou (' + r.status + ').' });
    await guardarNoContato(u.accountId!, cid, r.json);
    res.json({ cadastro: resumo(r.json), aviso: r.json.aviso || null, ja_existia: !!r.json.ja_existia, link: r.json.link_formulario });
  } catch (e) {
    res.status(502).json({ message: 'Sistema de cadastro fora do ar: ' + (e as Error).message });
  }
});

// Avisos do cadastro (cada mudança de etapa). Confere a assinatura e guarda o resumo no contato.
cadastroClaraRouter.post('/webhooks/cadastros', async (req: Request & { rawBody?: Buffer }, res) => {
  const { segredo } = await config();
  if (segredo) {
    const esperado = 'sha256=' + crypto.createHmac('sha256', segredo).update(req.rawBody || Buffer.from('')).digest('hex');
    const veio = String(req.headers['x-cadastros-assinatura'] || '');
    if (veio.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(veio), Buffer.from(esperado))) return res.status(401).json({ error: 'assinatura inválida' });
  }
  const cad = req.body?.cadastro;
  const cid = Number(cad?.crm_contact_id || cad?.crm_lead_id);
  // cadastro que ainda não tem lead no CRM (ex.: quiz sem atendente) — responde ok pra não travar a fila de lá
  if (!cid) return res.json({ ok: true, ignorado: 'sem contato' });
  await guardarNoContato(null, cid, cad);
  res.json({ ok: true });
});

// Configuração (diretoria / quem tem Central de integrações)
cadastroClaraRouter.get('/cadastro_clara/config', requireAuth, requirePerm('config.integracoes'), async (req, res) => {
  const cfg = await config();
  const base = (process.env.API_PUBLIC_URL || process.env.API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.json({ url: cfg.url, tem_chave: !!cfg.chave, tem_segredo: !!cfg.segredo, por_env: !!process.env.CADASTROS_API_URL, webhook_url: base + '/webhooks/cadastros' });
});
cadastroClaraRouter.put('/cadastro_clara/config', requireAuth, requirePerm('config.integracoes'), async (req, res) => {
  const salvar = async (key: string, value: string) => {
    await db.insert(globalSettings).values({ key, value } as any).onConflictDoUpdate({ target: globalSettings.key, set: { value, updatedAt: new Date() } as any });
  };
  const url = String(req.body?.url ?? '').trim();
  if (url && !/^https?:\/\//.test(url)) return res.status(422).json({ message: 'O endereço tem que começar com https://' });
  if (req.body?.url !== undefined) await salvar('cadastros_api_url', url);
  if (req.body?.chave) await salvar('cadastros_api_key', String(req.body.chave).trim());
  if (req.body?.segredo) await salvar('cadastros_webhook_secret', String(req.body.segredo).trim());
  const cfg = await config();
  let teste: string | null = null;
  if (cfg.ligado) {
    try { const r = await chamar('GET', '/cadastros/teste-de-ligacao'); teste = r.status === 404 ? 'ok' : r.status === 401 ? 'chave recusada' : 'resposta ' + r.status; }
    catch (e) { teste = 'sem resposta: ' + (e as Error).message; }
  }
  res.json({ ok: true, teste });
});

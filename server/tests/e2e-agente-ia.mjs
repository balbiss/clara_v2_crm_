// Agente de IA de ponta a ponta, com uma OpenAI FALSA local (porta 3099) que responde de forma
// previsível e chama as ferramentas. As mensagens entram pelo webhook real do WhatsApp (WAHA).
// Precisa da API rodando (3011), do seed e do seed-kommo-estrutura. Rodar com tsx (usa a lib direto):
//   npx tsx tests/e2e-agente-ia.mjs
import 'dotenv/config';
import http from 'node:http';
import postgres from 'postgres';

const API = process.env.API_URL || 'http://localhost:3011';
const MOCK_PORT = 3099;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- OpenAI falsa ---------------------------------------------------------------------------------
const pedidos = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const send = obj => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) };
    if (req.url.endsWith('/audio/transcriptions')) return send({ text: 'quero ver o catálogo novo' });
    const b = JSON.parse(body || '{}');
    pedidos.push(b);
    const usage = { total_tokens: 100 };
    const msg = (content, tool_calls) => send({ choices: [{ message: { role: 'assistant', content, tool_calls } }], usage });
    const call = (name, args) => ({ id: 'c' + Math.random().toString(36).slice(2), type: 'function', function: { name, arguments: JSON.stringify(args) } });
    if (b.response_format?.type === 'json_object') {
      const sys = String(b.messages[0].content);
      if (sys.includes('perguntas')) return msg(JSON.stringify({ perguntas: ['Como funciona a maleta?', 'Qual o prazo do acerto?', 'Quero revender'] }));
      return msg(JSON.stringify({ name: 'Clara Atendimento', role: 'Consultora simpática da Clara Ferreira.', tone: 'friendly', guidelines: ['Chame a cliente pelo nome'], actions: [{ name: 'Falar com humano', when: [{ type: 'wants', value: 'falar com uma pessoa' }], do: [{ type: 'transfer' }] }] }));
    }
    const last = b.messages[b.messages.length - 1];
    if (last.role === 'tool') return msg('Prontinho, anotei aqui! 💖');
    const sys = String(b.messages[0].content);
    const ultimaCliente = [...b.messages].reverse().find(m => m.role === 'user')?.content || '';
    const acaoCom = txt => (sys.split('\n').map((l, i, all) => /^\[(a\d+)\]/.test(l) && all.slice(i, i + 4).join(' ').includes(txt) ? /^\[(a\d+)\]/.exec(l)[1] : null).find(Boolean));
    if (last.role === 'system' && String(last.content).includes('não respondeu')) return msg(null, [call('aplicar_acao', { acao: /ação (a\d+)/.exec(last.content)[1] })]);
    if (/humano/.test(ultimaCliente)) return msg(null, [call('registrar_intencao', { intencao: 'Falar com pessoa' }), call('transferir_para_atendente', { motivo: 'Cliente pediu atendimento humano' })]);
    if (/email/.test(ultimaCliente)) return msg(null, [call('registrar_intencao', { intencao: 'Passou e-mail' }), call('aplicar_acao', { acao: acaoCom('Preencher campo'), dados: { email: /\S+@\S+/.exec(ultimaCliente)[0] } })]);
    if (/preço/.test(ultimaCliente)) return msg(null, [call('registrar_intencao', { intencao: 'Pergunta preço' }), call('lacuna_de_conhecimento', { pergunta: 'Qual o preço do brinco?' })]);
    return msg('Olá! Sou a Clara IA, como posso ajudar? 😊');
  });
});
await new Promise(r => mock.listen(MOCK_PORT, r));

const prev = await sql`SELECT key, value FROM global_settings WHERE key IN ('openai_api_key', 'openai_base_url')`;
const setGs = async (key, value) => { await sql`INSERT INTO global_settings (key, value, created_at, updated_at) VALUES (${key}, ${value}, now(), now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value` };
await setGs('openai_base_url', `http://localhost:${MOCK_PORT}`);
await setGs('openai_api_key', 'sk-teste-local-000000000000000000000');

const login = await fetch(`${API}/users/sign_in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email: 'diretoria@teste.local', password: '123456' } }) });
const token = login.headers.get('authorization');
const api = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: token }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) };
};
const tag = Date.now().toString().slice(-7);
const phone = n => `55119${tag}${n}`;
const webhook = async (n, text) => {
  const chatId = `${phone(n)}@c.us`;
  await fetch(`${API}/webhooks/waha?inbox_id=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'message.any', payload: { id: `false_${chatId}_${Math.random().toString(36).slice(2, 12).toUpperCase()}`, from: chatId, body: text, fromMe: false, timestamp: Math.floor(Date.now() / 1000), _data: { notifyName: `IA Teste ${n}` } } }) });
};
const convOf = async n => (await sql`SELECT c.* FROM conversations c JOIN contacts ct ON ct.id = c.contact_id WHERE ct.jid = ${phone(n) + '@c.us'} ORDER BY c.id DESC LIMIT 1`)[0];
const botMsgs = async convId => sql`SELECT text, is_private FROM messages WHERE conversation_id = ${convId} AND sender_type = 'User' AND sender_id IS NULL AND is_private = false ORDER BY id`;
const waitBot = async (convId, count, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await botMsgs(convId)).length >= count) return true; await sleep(700) } return false };

const { data: pipes } = await api('GET', '/pipelines');
const varejo = pipes.find(p => p.slug === 'varejo');
const stageIA = varejo.pipeline_stages.find(s => s.kind === 'normal');
const outra = varejo.pipeline_stages.filter(s => s.kind === 'normal')[1];
const [tagVip] = await sql`INSERT INTO tags (account_id, name, color, created_at, updated_at) VALUES ((SELECT account_id FROM users WHERE email = 'diretoria@teste.local'), ${'ia_teste_' + tag}, '#888', now(), now()) RETURNING id`;
const spH = (new Date(Date.now() - 3 * 3600e3)).getUTCHours();
const foraHora = { days: [0, 1, 2, 3, 4, 5, 6], from: `${String((spH + 2) % 24).padStart(2, '0')}:00`, to: `${String((spH + 3) % 24).padStart(2, '0')}:00` };

// --- 1) criar, validar e ligar --------------------------------------------------------------------
const actions = [
  { id: 'a1', name: 'Pegar e-mail', when: [{ type: 'provides', value: 'email' }], do: [{ type: 'set_field', value: { field_key: 'email', label: 'E-mail' } }, { type: 'manage_tags', value: { mode: 'add', tag_ids: [Number(tagVip.id)] } }] },
  { id: 'a2', name: 'Humano', when: [{ type: 'wants', value: 'falar com humano' }], do: [{ type: 'transfer', value: {} }] },
  { id: 'a3', name: 'Fora do horário', when: [{ type: 'hours', value: foraHora }], do: [{ type: 'exact_message', value: 'Estamos fechados agora.' }] },
  { id: 'a4', name: 'Retomar', when: [{ type: 'no_reply', value: 1 }], do: [{ type: 'bring_up', value: 'perguntar se ainda tem interesse' }] },
  { id: 'a5', name: 'Boas-vindas', when: [{ type: 'first_time' }], do: [{ type: 'reply_info', value: 'Diga que a maleta tem 30 dias de acerto' }] },
];
const bad = await api('POST', '/ai_agents', { name: 'X', actions: [{ when: [], do: [{ type: 'transfer' }] }] });
check('valida: ação sem QUANDO é recusada', bad.status === 422 && /QUANDO/.test(bad.data.error));
const badDelay = await api('POST', '/ai_agents', { name: 'X', persona: { delay_seconds: 0 } });
check('valida: atraso fora de 1–86.400 s', badDelay.status === 422);
const { status: sc, data: agent } = await api('POST', '/ai_agents', { name: 'Clara IA ' + tag, persona: { role: 'Você é a Clara IA, consultora da Clara Ferreira Semijoias.', tone: 'friendly', length: 'short', language: 'auto', delay_seconds: 1, guidelines: ['Nunca prometa desconto'] }, actions, settings: { max_replies: 0 } });
check('cria agente', sc === 201 && agent.actions.length === 5);
const src = await api('POST', `/ai_agents/${agent.id}/sources`, { kind: 'faq', title: 'Maleta', pairs: [{ q: 'Como funciona a maleta?', a: 'A revendedora recebe a maleta consignada e acerta em 30 dias.' }] });
check('fonte de perguntas e respostas', src.status === 201 && src.data.content.includes('30 dias'));
const semCanal = await api('PUT', `/ai_agents/${agent.id}`, { active: true });
check('ligar sem canal é recusado (como no Kommo)', semCanal.status === 422 && semCanal.data.error === 'sem_canal');
const lig = await api('PUT', `/ai_agents/${agent.id}`, { active: true, channels: [{ inbox_id: 1, stage_ids: [stageIA.id] }] });
check('liga com canal + etapa', lig.status === 200 && lig.data.active);
const { data: ag2 } = await api('POST', '/ai_agents', { name: 'Outro ' + tag });
const conflito = await api('PUT', `/ai_agents/${ag2.id}`, { active: true, channels: [{ inbox_id: 1, stage_ids: [stageIA.id] }] });
check('cada etapa lança só um agente', conflito.status === 422 && conflito.data.error === 'etapa_ocupada');

// --- 2) etapa certa: só atende lead na etapa configurada -----------------------------------------
await webhook(1, 'oi, tudo bem?');
await sleep(1500);
let conv1 = await convOf(1);
check('mensagem chega e cria a conversa', !!conv1);
await sleep(10000);
check('lead fora da etapa: agente não responde', (await botMsgs(conv1.id)).length === 0);
await api('POST', `/pipelines/${varejo.id}/pipeline_cards`, { contact_id: conv1.contact_id, pipeline_stage_id: stageIA.id });
pedidos.length = 0;
await webhook(1, 'oi de novo');
check('lead na etapa: agente responde', await waitBot(conv1.id, 1), (await botMsgs(conv1.id)).map(m => m.text).join(' | '));
const sys1 = String(pedidos.find(p => p.tools)?.messages[0].content || '');
check('prompt leva persona e diretrizes', sys1.includes('Clara IA, consultora') && sys1.includes('Nunca prometa desconto'));
check('prompt leva a fonte (base de conhecimento)', sys1.includes('acerta em 30 dias'));
check('"Primeira vez" entra na 1ª resposta', sys1.includes('[a5]'));
check('ação fora do horário fica de fora', !sys1.includes('[a3]'));
check('"não respondeu em" não entra na resposta normal', !sys1.includes('[a4]'));
check('prompt leva a etapa do lead', sys1.includes(stageIA.name));
const [ses] = await sql`SELECT * FROM ai_agent_sessions WHERE conversation_id = ${conv1.id}`;
check('sessão ativa criada', ses?.status === 'active' && ses.replies === 1);

// --- 3) ação com dados: preencher campo + tag ------------------------------------------------------
pedidos.length = 0;
await webhook(1, 'meu email é ana.teste@clara.com');
await waitBot(conv1.id, 2);
const sys2 = String(pedidos.find(p => p.tools)?.messages[0].content || '');
check('"Primeira vez" não entra mais', !sys2.includes('[a5]'));
const [ct1] = await sql`SELECT email FROM contacts WHERE id = ${conv1.contact_id}`;
check('FAÇA "Preencher campo" grava o e-mail', ct1.email === 'ana.teste@clara.com', ct1.email);
const [tg] = await sql`SELECT 1 FROM contact_tags WHERE contact_id = ${conv1.contact_id} AND tag_id = ${tagVip.id}`;
check('FAÇA "Gerenciar tags" adiciona a tag', !!tg);
const [lg] = await sql`SELECT detail, tokens FROM ai_agent_logs WHERE conversation_id = ${conv1.id} AND kind = 'reply' ORDER BY id DESC LIMIT 1`;
check('registro com intenção, ações e tokens', lg.detail.intent === 'Passou e-mail' && lg.detail.actions_completed.length === 2 && lg.tokens === 200);
check('resposta final enviada', (await botMsgs(conv1.id)).at(-1).text === 'Prontinho, anotei aqui! 💖');

// --- 4) transferir para atendente ---------------------------------------------------------------
await webhook(1, 'quero falar com humano');
await waitBot(conv1.id, 3);
for (let i = 0; i < 20 && !(await sql`SELECT 1 FROM conversation_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.conversation_id = ${conv1.id} AND t.name = 'com_atendente'`).length; i++) await sleep(300);
const [ses2] = await sql`SELECT status FROM ai_agent_sessions WHERE conversation_id = ${conv1.id}`;
check('transferência: sessão "transferida"', ses2.status === 'transferred');
const notas = await sql`SELECT text FROM messages WHERE conversation_id = ${conv1.id} AND is_private = true`;
check('transferência: nota interna com o motivo', notas.some(n => n.text.includes('Cliente pediu atendimento humano')));
const tagsConv = await sql`SELECT t.name FROM conversation_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.conversation_id = ${conv1.id}`;
check('transferência: tag com_atendente na conversa', tagsConv.some(t => t.name === 'com_atendente'));
const antes = (await botMsgs(conv1.id)).length;
await webhook(1, 'alô?'); await sleep(10500);
check('depois de transferir o agente fica quieto', (await botMsgs(conv1.id)).length === antes);

// --- 5) painel da conversa: pausar, retomar, parar --------------------------------------------------
await webhook(2, 'olá'); await sleep(1500);
const conv2 = await convOf(2);
await api('POST', `/pipelines/${varejo.id}/pipeline_cards`, { contact_id: conv2.contact_id, pipeline_stage_id: stageIA.id });
await webhook(2, 'tem novidade?');
await waitBot(conv2.id, 1);
let { data: sess } = await api('GET', `/ai_sessions?contact_id=${conv2.contact_id}`);
check('painel "Agentes de IA ativos" lista o agente', sess.length === 1 && sess[0].agent_name === agent.name);
await api('PUT', `/ai_sessions/${sess[0].id}`, { status: 'paused' });
await webhook(2, 'e aí?'); await sleep(10500);
check('pausado: não responde', (await botMsgs(conv2.id)).length === 1);
await api('PUT', `/ai_sessions/${sess[0].id}`, { status: 'active' });
await webhook(2, 'voltei');
check('retomado: responde de novo', await waitBot(conv2.id, 2));

// --- 6) "Cliente não respondeu em X min" pelo relógio --------------------------------------------------
await sql`UPDATE messages SET created_at = created_at - interval '3 minutes' WHERE conversation_id = ${conv2.id}`;
const { tickAiAgents, enrichMedia } = await import('../src/lib/aiAgent.ts');
pedidos.length = 0;
await tickAiAgents();
const nr = (await botMsgs(conv2.id)).length;
const [fu] = await sql`SELECT detail FROM ai_agent_logs WHERE conversation_id = ${conv2.id} AND kind = 'reply' AND detail->>'followup' = 'a4'`;
check('relógio: retoma a conversa parada (ação a4)', nr === 3 && !!fu, `${nr} msgs`);
await tickAiAgents();
check('relógio: não retoma duas vezes a mesma resposta', (await botMsgs(conv2.id)).length === 3);

// --- 7) Automatize: "Parar agente de IA" ao entrar numa etapa -----------------------------------
const trig = await api('POST', `/pipeline_stages/${outra.id}/pipeline_triggers`, { action_type: 'ai_stop', event: 'enter', config: { agent_id: agent.id } });
const { data: card2 } = await api('GET', `/pipeline_cards?contact_id=${conv2.contact_id}`);
const c2 = (Array.isArray(card2) ? card2 : card2?.cards || []).find(c => Number(c.pipeline_id) === Number(varejo.id)) || (await sql`SELECT id FROM pipeline_cards WHERE contact_id = ${conv2.contact_id}`)[0];
await api('PUT', `/pipeline_cards/${c2.id}`, { pipeline_stage_id: outra.id });
await sleep(1500);
const [ses3] = await sql`SELECT status FROM ai_agent_sessions WHERE conversation_id = ${conv2.id}`;
check('Automatize "Parar agente de IA" encerra a sessão', ses3.status === 'stopped', `trigger ${trig.status}`);

// --- 8) áudio vira texto (OpenAI) ---------------------------------------------------------------------
const { attach } = await import('../src/lib/storage.ts');
const [audio] = await sql`INSERT INTO messages (account_id, conversation_id, sender_type, text, created_at, updated_at) VALUES (${conv2.account_id}, ${conv2.id}, 'Contact', '📎 Anexo recebido', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC') RETURNING id`;
let audioOk = true;
try { await attach('Message', Number(audio.id), 'attachment', Buffer.from('OggS-falso'), 'audio.ogg', 'audio/ogg') } catch (e) { audioOk = false; console.log('   (storage indisponível:', e.message, ')') }
if (audioOk) {
  await enrichMedia(conv2.id, { voice: true });
  const [m] = await sql`SELECT transcription FROM messages WHERE id = ${audio.id}`;
  check('áudio do cliente é transcrito pela OpenAI', m.transcription === 'quero ver o catálogo novo');
}

// --- 9) Modo de teste, sugestões, gerar agente, painel ----------------------------------------------
const t1 = await api('POST', `/ai_agents/${agent.id}/test`, { messages: [{ role: 'user', content: 'qual o preço do brinco?' }] });
check('Modo de teste responde e mostra lacuna de conhecimento', t1.status === 200 && t1.data.details.knowledge_gaps.length === 1 && t1.data.details.intent === 'Pergunta preço');
const t2 = await api('POST', `/ai_agents/${agent.id}/test`, { messages: [{ role: 'user', content: 'meu email é x@y.com' }] });
check('Modo de teste não mexe no CRM (simulado)', t2.status === 200 && t2.data.details.actions_completed.length === 2 && !(await sql`SELECT 1 FROM contacts WHERE email = 'x@y.com'`).length);
const ib = await api('POST', `/ai_agents/${agent.id}/icebreakers`);
check('sugestões de perguntas (ice breakers)', ib.data.icebreakers.length === 3 && ib.data.icebreakers[0] === 'Como funciona a maleta?');
const gen = await api('POST', '/ai_agents/generate', { mode: 'info', description: 'Semijoias por consignação', details: 'São Paulo, seg a sex' });
const { data: genFull } = await api('GET', `/ai_agents/${gen.data?.id}`);
check('"Construir meu Agente de IA" gera agente + fonte', gen.status === 201 && gen.data.name === 'Clara Atendimento' && genFull.sources.length === 1 && genFull.actions[0].do[0].type === 'transfer');
const { data: dash } = await api('GET', `/ai_agents/${agent.id}/dashboard`);
check('Painel: leads únicos, transferências, lacunas e canais', dash.unique_leads === 2 && dash.transfers === 1 && dash.gaps >= 0 && dash.por_canal.length === 1, JSON.stringify({ u: dash.unique_leads, t: dash.transfers, c: dash.por_canal }));
const { data: lista } = await api('GET', '/ai_agents');
const linha = lista.find(a => a.id === agent.id);
check('lista: canais, tokens e status', linha.channel_names.length === 1 && linha.tokens_used > 0 && linha.active === true);
const dup = await api('POST', `/ai_agents/${agent.id}/duplicate`);
const { data: dupFull } = await api('GET', `/ai_agents/${dup.data.id}`);
check('copiar agente (desligado, com fontes)', dup.status === 201 && dup.data.active === false && dupFull.sources.length === 1);
const off = await api('PUT', `/ai_agents/${agent.id}`, { active: false });
check('desligar agente', off.status === 200 && off.data.active === false);
const s = await api('GET', '/ai_settings');
check('chave da OpenAI aparece mascarada', s.data.has_key && !s.data.key_hint.includes('teste-local'));

// --- limpeza ----------------------------------------------------------------------------------------
for (const id of [agent.id, ag2.id, gen.data?.id, dup.data.id].filter(Boolean)) await api('DELETE', `/ai_agents/${id}`);
if (trig.data?.id) await api('DELETE', `/pipeline_triggers/${trig.data.id}`);
await sql`DELETE FROM contact_tags WHERE tag_id = ${tagVip.id}`; await sql`DELETE FROM tags WHERE id = ${tagVip.id}`;
await sql`DELETE FROM global_settings WHERE key IN ('openai_api_key', 'openai_base_url')`;
for (const p of prev) await setGs(p.key, p.value);
console.log(`\n${ok} ok, ${fail} falha(s)`);
mock.close(); await sql.end();
process.exit(fail ? 1 : 0);

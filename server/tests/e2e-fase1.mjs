// Teste ponta a ponta da Fase 1 contra o servidor local (porta 3011), simulando a WAHA.
// Rodar: servidor local no ar (npm run dev) + seed; precisa de socket.io-client instalado onde for executar.
import { io } from 'socket.io-client';

const API = 'http://localhost:3011';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };

async function login(email) {
  const r = await fetch(API + '/users/sign_in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password: '123456' } }) });
  return { token: r.headers.get('authorization'), user: (await r.json()).user };
}
const call = async (token, method, path, body) => {
  const r = await fetch(API + path, { method, headers: { Authorization: token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};
const webhook = (inboxId, event, payload) => fetch(`${API}/webhooks/waha?inbox_id=${inboxId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payload }) }).then(r => r.json());

const dir = await login('diretoria@teste.local');
const cons = await login('consultor@teste.local');
console.log('Login');
check('diretoria loga', !!dir.token && dir.user.role === 'diretoria');
check('consultor loga', !!cons.token && cons.user.role === 'consultor');

// tempo real
const events = [];
const sock = io(API, { auth: { token: dir.token }, transports: ['websocket'] });
sock.on('conversations', e => events.push(e));
await new Promise(r => sock.on('connect', r));

console.log('Caixa de entrada');
const phone = '55119' + String(Date.now()).slice(-8);
const inb = await call(dir.token, 'POST', '/inboxes', { inbox: { name: 'Comercial Teste', provider: 'waha', phone_number: phone, restrict_by_portfolio: false } });
check('diretoria cria caixa', inb.status === 201, JSON.stringify(inb.json));
const inboxId = inb.json.id;
const dup = await call(dir.token, 'POST', '/inboxes', { inbox: { name: 'Dup', provider: 'waha', phone_number: phone } });
check('mesmo número é recusado', dup.status === 422);
const consCria = await call(cons.token, 'POST', '/inboxes', { inbox: { name: 'X', provider: 'waha', phone_number: '5511000000001' } });
check('consultor NÃO cria caixa', consCria.status === 403);
const st = await call(dir.token, 'GET', `/inboxes/${inboxId}/status`);
check('status sem WAHA configurada = desconectado', st.json.connected === false);

console.log('Mensagem chegando (webhook)');
const cliente = '5516' + String(Date.now()).slice(-9);
const msgId = `false_${cliente}@c.us_3EB0${Date.now()}AA`;
await webhook(inboxId, 'message.any', { id: msgId, fromMe: false, from: `${cliente}@c.us`, body: 'Oi, tudo bem? Quero repor a maleta', timestamp: Math.floor(Date.now() / 1000), _data: { notifyName: 'Maria Revendedora' } });
await webhook(inboxId, 'message.any', { id: msgId, fromMe: false, from: `${cliente}@c.us`, body: 'Oi, tudo bem? Quero repor a maleta' });
await new Promise(r => setTimeout(r, 300));
let list = await call(dir.token, 'GET', '/conversations');
const conv = list.json.find(c => c.contact.phone === '+' + cliente);
check('conversa criada com contato pelo nome do WhatsApp', conv && conv.contact.name === 'Maria Revendedora', JSON.stringify(list.json).slice(0, 300));
check('lista leve: só a última mensagem', conv && conv.messages.length === 1 && conv.messages_loaded === false);
check('mensagem duplicada (mesmo id) ignorada + não lida = 1', conv && conv.unread === 1);
check('evento message_created em tempo real', events.some(e => e.event === 'message_created' && e.conversation_id === conv?.id));

console.log('Responder e celular');
await webhook(inboxId, 'message.any', { id: `true_${cliente}@c.us_3EB0${Date.now()}BB`, fromMe: true, to: `${cliente}@c.us`, body: 'Mandei pelo celular' });
const send = await call(dir.token, 'POST', `/conversations/${conv.id}/messages`, { text: 'Oi Maria! Já te mando' });
check('equipe responde (201)', send.status === 201 && send.json.message.senderType === 'agent');
const full = await call(dir.token, 'GET', `/conversations/${conv.id}`);
check('detalhe traz histórico completo (3 msgs)', full.json.messages.length === 3, String(full.json.messages?.length));
check('resposta pelo celular entra como equipe', full.json.messages[1]?.senderType === 'agent' && full.json.messages[1]?.text === 'Mandei pelo celular');
await webhook(inboxId, 'message.any', { id: `true_${cliente}@c.us_3EB0${Date.now()}CC`, fromMe: true, to: `${cliente}@c.us`, body: 'eco logo após envio' });
check('eco logo após envio do CRM é ignorado (trava anti-duplicação da v1)', (await call(dir.token, 'GET', `/conversations/${conv.id}`)).json.messages.length === 3);
await call(dir.token, 'POST', `/conversations/${conv.id}/mark_as_read`);
list = await call(dir.token, 'GET', '/conversations');
check('marcar como lida zera a bolinha', list.json.find(c => c.id === conv.id).unread === 0);

console.log('Pesquisa');
const s1 = await call(dir.token, 'GET', '/conversations/search?q=MALETA repor');
check('acha pelo texto da mensagem (sem acento/ordem)', s1.json.messages.some(m => m.conversation_id === conv.id));
const s2 = await call(dir.token, 'GET', `/conversations/search?q=${cliente.slice(-8, -4)}-${cliente.slice(-4)}`);
check('acha pelo telefone formatado', s2.json.conversations.some(c => c.conversation_id === conv.id));

console.log('Carteira (visibilidade)');
let cl = await call(cons.token, 'GET', '/conversations');
check('consultor NÃO vê conversa de ninguém', !cl.json.some(c => c.id === conv.id));
const g = await call(cons.token, 'GET', `/conversations/${conv.id}`);
check('consultor NÃO abre pelo id', g.status === 404);
const tr = await call(dir.token, 'PUT', `/conversations/${conv.id}`, { conversation: { user_id: cons.user.id }, transfer_note: 'cuida dela' });
check('transferência pra consultora', tr.status === 200 && tr.json.assignee_id === cons.user.id);
check('etiqueta com_atendente aplicada', tr.json.tags.some(t => t.name === 'com_atendente'));
check('nota privada de transferência', (await call(dir.token, 'GET', `/conversations/${conv.id}`)).json.messages.some(m => m.isPrivate && m.text.includes('cuida dela')));
cl = await call(cons.token, 'GET', '/conversations');
check('agora a consultora vê', cl.json.some(c => c.id === conv.id));

console.log('Etiquetas');
const t1 = await call(cons.token, 'POST', `/conversations/${conv.id}/tags`, { name: 'Nova Etiqueta' });
check('consultor NÃO cria etiqueta nova', t1.status === 403);
const t2 = await call(dir.token, 'POST', `/conversations/${conv.id}/tags`, { name: 'Prioridade Alta', color: '#ff0000' });
check('diretoria cria e aplica', t2.status === 200 && t2.json.name === 'prioridade_alta');
const t3 = await call(cons.token, 'POST', `/conversations/${conv.id}/tags`, { name: 'prioridade_alta' });
check('consultor aplica etiqueta existente', t3.status === 200);

console.log('Resolver');
const rs = await call(dir.token, 'PUT', `/conversations/${conv.id}`, { conversation: { status: 'resolved' } });
check('resolvida', rs.json.status === 'resolved');
check('atendente volta pro responsável da carteira (sem responsável = nulo)', rs.json.assignee_id === null);
check('agente_off aplicado', rs.json.tags.some(t => t.name === 'agente_off'));

console.log('Agendada');
const when = new Date(Date.now() + 2000).toISOString();
const sm = await call(dir.token, 'POST', `/conversations/${conv.id}/scheduled_messages`, { text: 'agendada', send_at: when });
check('agenda mensagem', sm.status === 201 && sm.json.status === 'pending');
const sl = await call(dir.token, 'GET', `/conversations/${conv.id}/scheduled_messages`);
check('lista agendadas pendentes', sl.json.length === 1);

console.log('Nova conversa por número');
const nc = await call(cons.token, 'POST', '/conversations', { phone: '(11) 98888-' + String(Date.now()).slice(-4) });
check('consultor inicia conversa com número novo', nc.status === 201 && nc.json.assignee_id === cons.user.id, JSON.stringify(nc.json).slice(0, 200));
const nc2 = await call(cons.token, 'POST', '/conversations', { phone: cliente.slice(2) });
check('número de outra carteira é recusado', nc2.status === 403, `status ${nc2.status}`);

console.log('Transcrição/arquivo');
const tx = await call(dir.token, 'GET', `/conversations/${conv.id}/transcript`);
check('transcrição em texto', tx.status === 200 && String(tx.json).includes('TRANSCRIÇÃO DA CONVERSA'));

sock.close();
console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);

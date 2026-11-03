// Consultora não manda por caixa de que não é membro (Bel, 2026-11-03: Ana Clara mandou pela Expansão).
// Rodar com o servidor local no ar (porta 3011) + seed (diretoria/consultor@teste.local, senha 123456).
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
const webhook = (inboxId, payload) => fetch(`${API}/webhooks/waha?inbox_id=${inboxId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'message.any', payload }) });

const dir = await login('diretoria@teste.local');
const cons = await login('consultor@teste.local');
const sufixo = String(Date.now()).slice(-8);
const expansao = (await call(dir.token, 'POST', '/inboxes', { inbox: { name: 'Expansão T' + sufixo, provider: 'waha', phone_number: '55119' + sufixo } })).json;
const minha = (await call(dir.token, 'POST', '/inboxes', { inbox: { name: 'Consultoras T' + sufixo, provider: 'waha', phone_number: '55118' + sufixo } })).json;
await call(dir.token, 'POST', `/inboxes/${minha.id}/members`, { user_id: cons.user.id });

// cliente chega pela Expansão; a revendedora é da carteira da consultora e a conversa fica com ela
const cliente = '5516' + String(Date.now()).slice(-9);
await webhook(expansao.id, { id: `false_${cliente}@c.us_3EB0${sufixo}`, fromMe: false, from: `${cliente}@c.us`, body: 'Oi', timestamp: Math.floor(Date.now() / 1000), _data: { notifyName: 'Mariela Teste' } });
await new Promise(r => setTimeout(r, 400));
const convExp = (await call(dir.token, 'GET', `/conversations?inbox_id=${expansao.id}`)).json.find(c => c.contact.phone === '+' + cliente);
await call(dir.token, 'PATCH', `/contacts/${convExp.contact.id}`, { contact: { user_id: cons.user.id } });
await call(dir.token, 'PATCH', `/conversations/${convExp.id}`, { conversation: { user_id: cons.user.id } });

console.log('Consultora na conversa da Expansão');
const vista = await call(cons.token, 'GET', `/conversations/${convExp.id}`);
check('ela enxerga a conversa (é dela)', vista.status === 200, vista.status);
check('can_send = false', vista.json.can_send === false, vista.json.can_send);
const envio = await call(cons.token, 'POST', `/conversations/${convExp.id}/messages`, { text: 'Bom dia' });
check('mensagem pela Expansão é recusada (403)', envio.status === 403 && envio.json.error === 'caixa_sem_acesso', JSON.stringify(envio.json));
const nota = await call(cons.token, 'POST', `/conversations/${convExp.id}/messages`, { text: 'nota interna', is_private: true });
check('nota interna continua liberada', nota.status === 201, nota.status);
const agenda = await call(cons.token, 'POST', `/conversations/${convExp.id}/scheduled_messages`, { text: 'x', send_at: new Date(Date.now() + 3600e3).toISOString() });
check('agendar pela Expansão é recusado', agenda.status === 403, agenda.status);

console.log('Abrir conversa nova');
const nova = await call(cons.token, 'POST', '/conversations', { contact_id: convExp.contact.id, inbox_id: expansao.id });
check('pedindo a Expansão, cai na caixa dela', nova.status === 201 && nova.json.inbox_id === minha.id && nova.json.id !== convExp.id, JSON.stringify({ s: nova.status, inbox: nova.json.inbox_id }));
const semCaixa = await call(cons.token, 'POST', '/conversations', { contact_id: convExp.contact.id });
check('sem escolher, também cai na dela (mesma conversa)', semCaixa.json.id === nova.json.id);
const novaVista = await call(cons.token, 'GET', `/conversations/${nova.json.id}`);
check('na conversa nova can_send = true', novaVista.json.can_send === true);
check('não oferece "abrir pela Expansão"', !novaVista.json.other_conversations.some(o => o.inbox_id === expansao.id), JSON.stringify(novaVista.json.other_conversations));
const envio2 = await call(cons.token, 'POST', `/conversations/${nova.json.id}/messages`, { text: 'Bom dia pelo meu número' });
check('manda pela caixa dela', envio2.status === 201, envio2.status);

console.log('Diretoria continua livre');
const dv = await call(dir.token, 'GET', `/conversations/${convExp.id}`);
check('diretoria can_send = true na Expansão', dv.json.can_send === true);
check('diretoria vê as duas conversas da cliente', dv.json.other_conversations.some(o => o.conversation_id === nova.json.id));

for (const c of [convExp.id, nova.json.id]) await call(dir.token, 'DELETE', `/conversations/${c}`);
for (const i of [expansao.id, minha.id]) await call(dir.token, 'DELETE', `/inboxes/${i}`);
console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);

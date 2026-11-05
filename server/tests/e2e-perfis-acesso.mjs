// Perfis de acesso (Configurações › Perfis de acesso) + carteira por número (dona/Bel, 2026-11-04).
// Rodar com o servidor local no ar (porta 3011) + seed (diretoria/gerente/consultor/financeiro@teste.local, senha 123456).
const API = 'http://localhost:3011';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };
async function login(email, password = '123456') {
  const r = await fetch(API + '/users/sign_in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password } }) });
  const j = await r.json();
  return { token: r.headers.get('authorization'), user: j.user };
}
const call = async (who, method, path, body) => {
  const r = await fetch(API + path, { method, headers: { Authorization: who.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};
const sufixo = String(Date.now()).slice(-7);
const lixo = { contatos: [], caixas: [], usuarios: [], perfis: [], conversas: [] };

const dir = await login('diretoria@teste.local');
const ger = await login('gerente@teste.local');
const cons = await login('consultor@teste.local');
const fin = await login('financeiro@teste.local');

console.log('1. Login devolve as permissões do perfil');
check('consultora: revendedoras só da carteira', cons.user.access?.['contatos.ver'] === 'carteira', JSON.stringify(cons.user.access));
check('gerente: revendedoras todas', ger.user.access?.['contatos.ver'] === 'todos');
check('financeiro: sem Minhas Revendedoras no menu', fin.user.access?.['menu.carteira'] === false);
check('diretoria: tudo liberado', Object.values(dir.user.access || {}).every(v => v === true || v === 'todos') && Object.keys(dir.user.access || {}).length > 40, Object.keys(dir.user.access || {}).length);
check('nome do perfil vem junto', cons.user.access_profile_name === 'Consultor', cons.user.access_profile_name);
const prof = await call(cons, 'GET', '/profile');
check('/profile também traz as permissões', prof.json.access?.['menu.conversas'] === true);

console.log('2. Tela de perfis');
const tela = await call(dir, 'GET', '/access_profiles');
check('catálogo com todas as áreas do CRM', tela.json.catalogo?.length >= 8 && tela.json.catalogo.flatMap(g => g.itens).length >= 45, tela.json.catalogo?.flatMap(g => g.itens).length);
check('os 4 perfis-base existem', ['Consultor', 'Gerente', 'Financeiro', 'Diretoria'].every(n => tela.json.perfis.some(p => p.name === n && p.sistema)));
check('consultora não abre a tela', (await call(cons, 'GET', '/access_profiles')).status === 403);
const pCons = tela.json.perfis.find(p => p.name === 'Consultor');
const pDir = tela.json.perfis.find(p => p.name === 'Diretoria');
check('Diretoria não é editável', pDir.editavel === false && (await call(dir, 'PUT', `/access_profiles/${pDir.id}`, { permissions: { 'menu.inicio': false } })).status === 422);
check('perfil-base não pode ser excluído', (await call(dir, 'DELETE', `/access_profiles/${pCons.id}`)).status === 422);
check('gerente não altera perfis', (await call(ger, 'PUT', `/access_profiles/${pCons.id}`, { permissions: { 'insights.gerencial': true } })).status === 403);

console.log('3. Padrão = como funcionava antes');
const c1 = (await call(dir, 'POST', '/contacts', { contact: { name: 'Teste Perfil ' + sufixo, phone: '+55169' + sufixo + '1', user_id: ger.user.id } })).json; lixo.contatos.push(c1.id);
check('consultora não exclui revendedora', (await call(cons, 'DELETE', `/contacts/${c1.id}`)).status === 403);
check('consultora não abre o Gerencial', (await call(cons, 'GET', '/insights/painel')).status === 403);
check('gerente abre o Gerencial', (await call(ger, 'GET', '/insights/painel')).status === 200);
check('consultora não cria tag', (await call(cons, 'POST', '/tags', { tag: { name: 'x' + sufixo } })).status === 403);
check('financeiro não abre grupos de usuários', (await call(fin, 'GET', '/sales_teams')).status === 403);
check('gerente abre grupos de usuários', (await call(ger, 'GET', '/sales_teams')).status === 200);
check('consultora não faz disparo', (await call(cons, 'GET', '/broadcasts')).status === 403);
check('consultora não vê revendedora de outra carteira', (await call(cons, 'GET', `/contacts/${c1.id}`)).status === 404);
check('gerente não mexe em usuários', (await call(ger, 'GET', '/round_robin_groups')).status === 403);

console.log('4. Mudar o perfil vale na hora');
const salvo = await call(dir, 'PUT', `/access_profiles/${pCons.id}`, { permissions: { 'insights.gerencial': true, 'contatos.ver': 'todos', 'contatos.excluir': true, 'item.que.nao.existe': true } });
check('salvou', salvo.status === 200 && salvo.json.permissions['insights.gerencial'] === true);
check('chave desconhecida é ignorada', !('item.que.nao.existe' in salvo.json.permissions));
check('consultora agora abre o Gerencial', (await call(cons, 'GET', '/insights/painel')).status === 200);
check('consultora agora vê revendedora de outra carteira', (await call(cons, 'GET', `/contacts/${c1.id}`)).status === 200);
const c2 = (await call(dir, 'POST', '/contacts', { contact: { name: 'Teste Perfil Excluir ' + sufixo, phone: '+55169' + sufixo + '2', user_id: ger.user.id } })).json;
const del = await call(cons, 'DELETE', `/contacts/${c2.id}`);
check('consultora agora exclui revendedora', del.status < 300, del.status);
check('login novo já vem com a mudança', (await login('consultor@teste.local')).user.access['insights.gerencial'] === true);
await call(dir, 'PUT', `/access_profiles/${pCons.id}`, { permissions: { 'insights.gerencial': false, 'contatos.ver': 'carteira', 'contatos.excluir': false } });
check('voltou ao padrão', (await call(cons, 'GET', '/insights/painel')).status === 403);

console.log('5. Perfil novo "Prospecção" (copiado do Consultor)');
const novo = await call(dir, 'POST', '/access_profiles', { name: 'Prospecção ' + sufixo, copiar_de: pCons.id });
check('criou', novo.status === 201 && novo.json.base_role === 'consultor', JSON.stringify(novo.json).slice(0, 200)); lixo.perfis.push(novo.json.id);
check('nome repetido é recusado', (await call(dir, 'POST', '/access_profiles', { name: 'Prospecção ' + sufixo, copiar_de: pCons.id })).status === 422);
check('não dá pra criar perfil tipo diretoria', (await call(dir, 'POST', '/access_profiles', { name: 'Chefe ' + sufixo, base_role: 'diretoria' })).status === 422);
await call(dir, 'PUT', `/access_profiles/${novo.json.id}`, { permissions: { 'contatos.ver': 'todos', 'conversas.ver': 'todos' } });
const email = `prosp${sufixo}@teste.local`;
const ag = await call(dir, 'POST', '/agents', { agent: { email, password: '123456', first_name: 'Prospectora', last_name: 'Teste', access_profile_id: novo.json.id } });
check('usuária criada com o perfil', ag.status === 201 && ag.json.access_profile_id === novo.json.id && ag.json.role === 'consultor', JSON.stringify(ag.json).slice(0, 160)); lixo.usuarios.push(ag.json.id);
const prosp = await login(email);
check('login mostra o perfil Prospecção', prosp.user.access_profile_name === 'Prospecção ' + sufixo, prosp.user.access_profile_name);
check('ela vê revendedora de qualquer carteira', (await call(prosp, 'GET', `/contacts/${c1.id}`)).status === 200);
check('consultora comum continua sem ver', (await call(cons, 'GET', `/contacts/${c1.id}`)).status === 404);
check('contagem de pessoas no perfil', (await call(dir, 'GET', '/access_profiles')).json.perfis.find(p => p.id === novo.json.id)?.usuarios === 1);
const mudaTipo = await call(dir, 'PUT', `/agents/${ag.json.id}`, { agent: { role: 'gerente' } });
check('trocar o tipo volta pro perfil-base', mudaTipo.json.access_profile_id === null && mudaTipo.json.role === 'gerente');
await call(dir, 'PUT', `/agents/${ag.json.id}`, { agent: { access_profile_id: novo.json.id } });
const apagou = await call(dir, 'DELETE', `/access_profiles/${novo.json.id}`);
check('excluir perfil novo', apagou.status === 204); lixo.perfis = [];
check('quem estava nele volta pro Consultor', (await login(email)).user.access_profile_name === 'Consultor');

console.log('6. Carteira por número');
const semCart = (await call(dir, 'POST', '/inboxes', { inbox: { name: 'Prospecção T' + sufixo, provider: 'waha', phone_number: '55117' + sufixo } })).json; lixo.caixas.push(semCart.id);
check('número novo nasce SEM carteira', semCart.restrict_by_portfolio === false, semCart.restrict_by_portfolio);
const comCart = (await call(dir, 'POST', '/inboxes', { inbox: { name: 'Consultoras T' + sufixo, provider: 'waha', phone_number: '55116' + sufixo, restrict_by_portfolio: true } })).json; lixo.caixas.push(comCart.id);
check('escolhendo "Consultoras" nasce com carteira', comCart.restrict_by_portfolio === true);
await call(dir, 'POST', `/inboxes/${semCart.id}/members`, { user_id: prosp.user.id });
await call(dir, 'POST', `/inboxes/${comCart.id}/members`, { user_id: cons.user.id });
const pc = await call(prosp, 'POST', '/conversations', { contact_id: c1.id, inbox_id: semCart.id });
check('Prospecção chama revendedora da carteira de outra pessoa', pc.status === 201 && pc.json.inbox_id === semCart.id, JSON.stringify(pc.json).slice(0, 160)); lixo.conversas.push(pc.json.id);
check('a conversa fica com quem chamou', pc.json.assignee_id === prosp.user.id, pc.json.assignee_id);
const pTel = await call(prosp, 'POST', '/conversations', { phone: '(16) 9' + sufixo + '1', inbox_id: semCart.id });
check('pelo telefone também', pTel.status === 201 && pTel.json.contact.id === c1.id, JSON.stringify(pTel.json).slice(0, 120));
const cc = await call(cons, 'POST', '/conversations', { contact_id: c1.id, inbox_id: comCart.id });
check('no número das Consultoras a carteira continua valendo', cc.status === 404, cc.status);
const cTel = await call(cons, 'POST', '/conversations', { phone: '(16) 9' + sufixo + '1', inbox_id: comCart.id });
check('pelo telefone também é barrado', cTel.status === 403 && cTel.json.error === 'fora_da_carteira', JSON.stringify(cTel.json));
const vista = await call(prosp, 'GET', `/conversations/${pc.json.id}`);
check('Prospecção vê a conversa no número dela', vista.status === 200 && vista.json.can_send === true);

console.log('7. Exceção por pessoa continua valendo');
await call(dir, 'PUT', `/agents/${cons.user.id}`, { agent: { permissions: { broadcast: true } } });
check('consultora com "Fazer disparos" abre disparos', (await call(cons, 'GET', '/broadcasts')).status === 200);
await call(dir, 'PUT', `/agents/${cons.user.id}`, { agent: { permissions: { broadcast: false } } });
check('desligando, volta a não poder', (await call(cons, 'GET', '/broadcasts')).status === 403);

// limpeza
for (const c of lixo.conversas) await call(dir, 'DELETE', `/conversations/${c}`);
for (const i of lixo.caixas) {
  for (const c of (await call(dir, 'GET', `/conversations?view=todas&inbox_id=${i}`)).json) await call(dir, 'DELETE', `/conversations/${c.id}`);
  await call(dir, 'DELETE', `/inboxes/${i}`);
}
for (const c of lixo.contatos) await call(dir, 'DELETE', `/contacts/${c}`);
for (const u of lixo.usuarios) await call(dir, 'DELETE', `/agents/${u}`);
console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);

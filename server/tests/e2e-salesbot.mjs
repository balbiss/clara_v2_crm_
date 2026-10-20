// Motor do Salesbot (padrão Kommo), cenário por cenário. API no ar (3011) + seed.
//   JOBS_DISABLED=true npx tsx tests/e2e-salesbot.mjs
import 'dotenv/config';
import postgres from 'postgres';

const API = process.env.API_URL || 'http://localhost:3011';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const bot = await import('../src/lib/salesbot.ts');
let ok = 0, fail = 0;
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`); };
const tk = (await fetch(`${API}/users/sign_in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email: 'diretoria@teste.local', password: '123456' } }) })).headers.get('authorization');
const api = async (method, path, body) => { const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: tk }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) }; };

// contato de teste com conversa
const [inbox] = await sql`SELECT id, account_id FROM inboxes ORDER BY id LIMIT 1`;
const mk = async nome => {
  const [c] = await sql`INSERT INTO contacts (account_id, name, phone, custom_attributes, created_at, updated_at) VALUES (${inbox.account_id}, ${nome}, ${'55149' + String(Date.now()).slice(-8)}, '{}'::jsonb, now(), now()) RETURNING id`;
  const [cv] = await sql`INSERT INTO conversations (account_id, contact_id, inbox_id, status, created_at, updated_at, last_activity_at) VALUES (${inbox.account_id}, ${c.id}, ${inbox.id}, 0, now(), now(), now()) RETURNING id`;
  return { id: c.id, conv: cv.id };
};
const msgs = async conv => (await sql`SELECT text, is_private FROM messages WHERE conversation_id = ${conv} ORDER BY id`).map(m => m.text);
const runOf = async (flowId, contactId) => (await sql`SELECT * FROM flow_runs WHERE flow_id = ${flowId} AND contact_id = ${contactId} ORDER BY id DESC LIMIT 1`)[0];
const [tagVip] = await sql`INSERT INTO tags (account_id, name, color, created_at, updated_at) VALUES (${inbox.account_id}, ${'bot-teste-' + Date.now()}, '#000', now(), now()) RETURNING id`;
const agentes = (await sql`SELECT id FROM users WHERE account_id = ${inbox.account_id} AND status = 'active' ORDER BY id LIMIT 2`).map(u => u.id);
const criados = [];

// 1) robô com botões, outra resposta, sem resposta, validação, campo, tags e round robin
const def = { start: 'm1', steps: {
  m1: { id: 'm1', type: 'message', text: 'Olá {{contact.first_name}}! Quer receber o catálogo?', buttons: [{ label: 'Sim', next: 'p1' }, { label: 'Não', next: 'tchau' }], on_other: 'outro', no_answer: { minutes: 10, next: 'lembrete' } },
  p1: { id: 'p1', type: 'message', text: 'Qual seu e-mail?', on_other: 'v1' },
  v1: { id: 'v1', type: 'validation', check: 'email', save_field: 'cf_email_bot', next: 'tag', fail_next: 'p1' },
  tag: { id: 'tag', type: 'action', action: 'manage_tags', config: { mode: 'add', tag_ids: [tagVip.id] }, next: 'rr' },
  rr: { id: 'rr', type: 'action', action: 'change_owner', config: { mode: 'round_robin', user_ids: agentes }, next: 'fim' },
  outro: { id: 'outro', type: 'message', text: 'Não entendi, responda Sim ou Não.', next: 'fim' },
  lembrete: { id: 'lembrete', type: 'message', text: 'Ainda está aí?', next: 'fim' },
  tchau: { id: 'tchau', type: 'message', text: 'Tudo bem, até mais!', next: 'fim' },
  fim: { id: 'fim', type: 'stop' },
} };
const bad = await api('POST', '/salesbots', { name: 'Robô quebrado', definition: { start: 'x', steps: { x: { id: 'x', type: 'message', text: 'oi', next: 'nao_existe' } } } });
check('definição apontando pra passo inexistente é recusada', bad.status === 422);
const cr = await api('POST', '/salesbots', { name: 'Robô teste e2e ' + Date.now(), definition: def, trigger_config: { event: 'manual' } });
check('cria robô', cr.status === 201); criados.push(cr.data.id);
const F = cr.data.id;

const a = await mk('Ana Teste Bot');
const run1 = await api('POST', `/salesbots/${F}/run`, { contact_id: a.id });
check('executar robô no lead (mesmo desligado)', run1.status === 201);
check('mensagem 1 com variável {{contact.first_name}}', (await msgs(a.conv)).includes('Olá Ana! Quer receber o catálogo?'));
check('robô fica esperando resposta', (await runOf(F, a.id)).status === 'waiting');
await bot.continueWithReply(a.conv, a.id, 'sim');
check('botão "Sim" (sem diferenciar maiúscula) vai pro passo certo', (await msgs(a.conv)).at(-1) === 'Qual seu e-mail?');
await bot.continueWithReply(a.conv, a.id, 'email-errado');
check('validação de e-mail falha e pergunta de novo', (await msgs(a.conv)).at(-1) === 'Qual seu e-mail?');
await bot.continueWithReply(a.conv, a.id, 'ana@teste.com');
const [ca] = await sql`SELECT custom_attributes, user_id FROM contacts WHERE id = ${a.id}`;
check('validação ok salva o campo do lead', ca.custom_attributes.cf_email_bot === 'ana@teste.com');
check('ação: adiciona a tag', (await sql`SELECT 1 FROM contact_tags WHERE contact_id = ${a.id} AND tag_id = ${tagVip.id}`).length === 1);
check('robô termina (done)', (await runOf(F, a.id)).status === 'done');

// 2) round robin: próximos leads alternam o responsável
const b = await mk('Bia Teste Bot'), c = await mk('Cris Teste Bot');
for (const x of [b, c]) { await api('POST', `/salesbots/${F}/run`, { contact_id: x.id }); await bot.continueWithReply(x.conv, x.id, 'Sim'); await bot.continueWithReply(x.conv, x.id, `${x.id}@t.com`) }
const donos = (await sql`SELECT user_id FROM contacts WHERE id IN (${a.id}, ${b.id}, ${c.id}) ORDER BY id`).map(r => r.user_id);
check(`Round Robin alterna os atendentes (${donos.join(' → ')})`, agentes.length < 2 || (donos[0] !== donos[1] && donos[0] === donos[2]));

// 3) outra resposta e sem resposta
const d = await mk('Duda Teste Bot');
await api('POST', `/salesbots/${F}/run`, { contact_id: d.id });
await bot.continueWithReply(d.conv, d.id, 'talvez');
check('resposta fora dos botões vai pra "Outra resposta"', (await msgs(d.conv)).at(-1) === 'Não entendi, responda Sim ou Não.');
const e = await mk('Edu Teste Bot');
await api('POST', `/salesbots/${F}/run`, { contact_id: e.id });
await sql`UPDATE flow_runs SET resume_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE flow_id = ${F} AND contact_id = ${e.id} AND status = 'waiting'`;
await bot.tickSalesbot();
check('"Sem resposta em 10 min" segue o caminho do lembrete', (await msgs(e.conv)).at(-1) === 'Ainda está aí?');

// 4) pausa com timer
const cp = await api('POST', '/salesbots', { name: 'Robô pausa ' + Date.now(), definition: { start: 'a', steps: { a: { id: 'a', type: 'message', text: 'Primeira', next: 'p' }, p: { id: 'p', type: 'pause', mode: 'timer', seconds: 3, next: 'b' }, b: { id: 'b', type: 'message', text: 'Depois da pausa', next: null } } } });
criados.push(cp.data.id);
const f = await mk('Fê Teste Bot');
await api('POST', `/salesbots/${cp.data.id}/run`, { contact_id: f.id });
check('pausa: segunda mensagem ainda não saiu', !(await msgs(f.conv)).includes('Depois da pausa'));
await new Promise(r => setTimeout(r, 3500)); await bot.tickSalesbot();
check('pausa: depois do tempo a mensagem sai', (await msgs(f.conv)).includes('Depois da pausa'));

// 5) gatilho por palavra-chave (mensagem recebida) e por conversa fechada
const tg = await api('POST', '/salesbots', { name: 'Robô gatilho ' + Date.now(), definition: { start: 'a', steps: { a: { id: 'a', type: 'message', text: 'Recebi seu pedido de catálogo!', next: null } } }, trigger_config: { event: 'incoming_message', keywords: ['catálogo'], cooldown_minutes: 60 } });
criados.push(tg.data.id); await api('PUT', `/salesbots/${tg.data.id}`, { active: true });
const g = await mk('Gabi Teste Bot');
const [conv] = await sql`SELECT * FROM conversations WHERE id = ${g.conv}`;
const convObj = { id: conv.id, accountId: conv.account_id, contactId: conv.contact_id, inboxId: conv.inbox_id };
check('mensagem sem a palavra não dispara', !(await bot.triggerOnIncoming(convObj, g.id, 'bom dia', false)));
check('mensagem com "catálogo" dispara o robô', await bot.triggerOnIncoming(convObj, g.id, 'quero o catálogo', false));
check('intervalo mínimo: não dispara de novo em seguida', !(await bot.triggerOnIncoming(convObj, g.id, 'e o catálogo?', false)));
const fe = await api('POST', '/salesbots', { name: 'Robô fechou ' + Date.now(), definition: { start: 'a', steps: { a: { id: 'a', type: 'message', text: 'Obrigada pelo contato! Avalie de 1 a 10.', next: null } } }, trigger_config: { event: 'conversation_closed' } });
criados.push(fe.data.id); await api('PUT', `/salesbots/${fe.data.id}`, { active: true });
const h = await mk('Helô Teste Bot');
await api('PUT', `/conversations/${h.conv}`, { conversation: { status: 'resolved' } }); await new Promise(r => setTimeout(r, 800));
check('fechar conversa dispara o robô "conversa fechada"', (await msgs(h.conv)).includes('Obrigada pelo contato! Avalie de 1 a 10.'));

// 6) lista com estatísticas e Automatize "Executar Robô"
const lista = await api('GET', '/salesbots');
const meu = lista.data.find(x => x.id === F);
check(`lista mostra total lançado / sessões / conversão (${meu.total_launched} / ${meu.active_sessions} / ${meu.conversion}%)`, meu.total_launched >= 5 && meu.conversion !== null);
check('robôs da Clara recriados', ['Confirma Agend. Dia Seguinte', 'Encerra Chat por falta de interação', 'Pesquisa de satisfação', 'Pós - pesquisa de satisfação'].every(n => lista.data.some(x => x.name === n)));
const dup = await api('POST', `/salesbots/${F}/duplicate`);
check('duplicar robô', dup.status === 201 && dup.data.name.endsWith('(cópia)')); criados.push(dup.data.id);

// limpeza
for (const id of criados) await api('DELETE', `/salesbots/${id}`);
for (const x of [a, b, c, d, e, f, g, h]) {
  await sql`DELETE FROM messages WHERE conversation_id = ${x.conv}`; await sql`DELETE FROM conversation_tags WHERE conversation_id = ${x.conv}`;
  await sql`DELETE FROM flow_runs WHERE contact_id = ${x.id}`; await sql`DELETE FROM conversations WHERE id = ${x.conv}`;
  await sql`DELETE FROM contact_tags WHERE contact_id = ${x.id}`; await sql`DELETE FROM activity_events WHERE contact_id = ${x.id}`; await sql`DELETE FROM contact_audit_events WHERE contact_id = ${x.id}`;
  await sql`DELETE FROM notes WHERE contact_id = ${x.id}`; await sql`DELETE FROM reseller_phones WHERE contact_id = ${x.id}`; await sql`DELETE FROM contacts WHERE id = ${x.id}`;
}
await sql`DELETE FROM tags WHERE id = ${tagVip.id}`;
console.log(`\n${ok} ok, ${fail} falha(s)`);
await sql.end();
process.exit(fail ? 1 : 0);

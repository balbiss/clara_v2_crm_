// Insights (Gerencial, Relatórios, Atividades) com dados de verdade: cria leads, ganha um, perde
// outro, define metas e confere cada número que as telas mostram.
// Precisa da API rodando (porta 3011), do seed e do scripts/seed-kommo-estrutura.ts.
//   node tests/e2e-insights.mjs
import 'dotenv/config';
import postgres from 'postgres';

const API = process.env.API_URL || 'http://localhost:3011';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const login = async (email) => (await fetch(`${API}/users/sign_in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password: '123456' } }) })).headers.get('authorization');
const token = await login('diretoria@teste.local');
const call = async (tok, method, path, body) => {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: tok }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) };
};
const api = (m, p, b) => call(token, m, p, b);
const get = async p => (await api('GET', p)).data;

const [me] = await sql`SELECT id FROM users WHERE email = 'diretoria@teste.local'`;
const uid = Number(me.id);
const { data: pipes } = await api('GET', '/pipelines');
const varejo = pipes.find(p => p.slug === 'varejo');
const first = varejo.pipeline_stages.filter(s => s.kind === 'normal').sort((a, b) => a.position - b.position)[0];
const won = varejo.pipeline_stages.find(s => s.kind === 'won');
const lost = varejo.pipeline_stages.find(s => s.kind === 'lost');

// antes
const p0 = await get(`/insights/painel?period=today&user_id=${uid}`);
const v0 = await get(`/insights/vendas?period=today&pipeline_id=${varejo.id}&user_id=${uid}`);
const a0 = await get(`/insights/atividades?period=today&user_id=${uid}`);
const m0 = await get('/insights/metas');

// três leads novos da Diana: um fica ativo, um é ganho (R$ 500), um é perdido
const tag = Date.now().toString().slice(-6);
const mk = async (n, value) => (await api('POST', `/pipelines/${varejo.id}/pipeline_cards`, { name: `Insights ${n} ${tag}`, phone: '55149' + tag + n, value, pipeline_stage_id: first.id })).data;
const ativo = await mk(1, 120), ganho = await mk(2, 500), perdido = await mk(3, 80);
check('cria 3 leads', !!(ativo?.id && ganho?.id && perdido?.id));
await sql`UPDATE contacts SET user_id = ${uid} WHERE id IN (${ativo.contact.id}, ${ganho.contact.id}, ${perdido.contact.id})`;
const rg = await api('PUT', `/pipeline_cards/${ganho.id}`, { pipeline_stage_id: won.id });
const rp = await api('PUT', `/pipeline_cards/${perdido.id}`, { pipeline_stage_id: lost.id, loss_reason: 'Preço' });
check('ganha e perde leads', rg.status === 200 && rp.status === 200, `${rg.status}/${rp.status} ${JSON.stringify(rg.data?.message || rp.data?.message || '')}`);

// Painel
const p1 = await get(`/insights/painel?period=today&user_id=${uid}`);
check('Painel: leads ganhos +1 e R$ 500', p1.leads.ganhos === p0.leads.ganhos + 1 && p1.leads.ganhos_valor === p0.leads.ganhos_valor + 500, `${p0.leads.ganhos}→${p1.leads.ganhos}`);
check('Painel: leads perdidos +1', p1.leads.perdidos === p0.leads.perdidos + 1);
check('Painel: leads ativos +1 (com R$ 120)', p1.leads.ativos === p0.leads.ativos + 1 && p1.leads.ativos_valor === p0.leads.ativos_valor + 120);
check('Painel: lead ativo sem tarefa conta em "sem tarefas"', p1.leads.sem_tarefa >= p0.leads.sem_tarefa + 1);
check('Painel: fontes de lead conta os contatos novos', p1.fontes_de_lead.reduce((s, f) => s + f.n, 0) >= p0.fontes_de_lead.reduce((s, f) => s + f.n, 0) + 3);
const tarefaRes = await api('POST', '/tarefas', { tarefa: { contact_id: ativo.contact.id, titulo: 'Ligar insights', tipo: 'manual_ligacao', vencimento_em: new Date(Date.now() + 3600e3).toISOString(), user_id: uid } });
const p2 = await get(`/insights/painel?period=today&user_id=${uid}`);
check('Painel: criar tarefa tira o lead de "sem tarefas"', tarefaRes.status === 201 && p2.leads.sem_tarefa === p1.leads.sem_tarefa - 1, `status ${tarefaRes.status}`);
check('Painel: tarefas abertas +1', p2.tarefas.abertas === p1.tarefas.abertas + 1);

// Painel: mensagens, não respondidas e tempo de resposta
const [inbox] = await sql`SELECT id FROM inboxes WHERE account_id = (SELECT account_id FROM users WHERE id = ${uid}) ORDER BY id LIMIT 1`;
const acc = (await sql`SELECT account_id FROM users WHERE id = ${uid}`)[0].account_id;
const [conv] = await sql`INSERT INTO conversations (account_id, contact_id, inbox_id, status, user_id, source) VALUES (${acc}, ${ativo.contact.id}, ${inbox.id}, 0, ${uid}, 'whatsapp') RETURNING id`;
await sql`INSERT INTO messages (account_id, conversation_id, sender_type, text, created_at) VALUES (${acc}, ${conv.id}, 'Contact', 'oi', (now() AT TIME ZONE 'UTC') - interval '10 minutes')`;
await sql`INSERT INTO messages (account_id, conversation_id, sender_type, sender_id, text, created_at) VALUES (${acc}, ${conv.id}, 'User', ${uid}, 'olá!', (now() AT TIME ZONE 'UTC') - interval '6 minutes')`;
await sql`INSERT INTO messages (account_id, conversation_id, sender_type, text, created_at) VALUES (${acc}, ${conv.id}, 'Contact', 'tem catálogo?', (now() AT TIME ZONE 'UTC') - interval '2 minutes')`;
const p3 = await get(`/insights/painel?period=today&user_id=${uid}`);
check('Painel: mensagens recebidas +2', p3.mensagens_recebidas.total === p2.mensagens_recebidas.total + 2, `${p2.mensagens_recebidas.total}→${p3.mensagens_recebidas.total}`);
check('Painel: conversa em andamento +1 e não respondida +1', p3.conversas.em_andamento === p2.conversas.em_andamento + 1 && p3.conversas.nao_respondidas === p2.conversas.nao_respondidas + 1);
check('Painel: mais tempo esperando ≥ 2 min', p3.conversas.mais_tempo_esperando_seg >= 115);
check('Painel: tempo de resposta conta a resposta de 4 min', p3.tempo_resposta.respostas >= 1 && p3.tempo_resposta.media_seg > 0);

// Análise de vendas
const v1 = await get(`/insights/vendas?period=today&pipeline_id=${varejo.id}&user_id=${uid}`);
const sv = id => v1.stages.find(s => Number(s.id) === Number(id));
const sv0 = id => v0.stages.find(s => Number(s.id) === Number(id));
check('Vendas: 3 leads novos no período', v1.novos.n === v0.novos.n + 3);
check('Vendas: etapa ganha recebeu 1', sv(won.id).entraram === sv0(won.id).entraram + 1);
check('Vendas: etapa perdida recebeu 1', sv(lost.id).entraram === sv0(lost.id).entraram + 1);
check('Vendas: lead ativo aparece na 1ª etapa agora', sv(first.id).atual === sv0(first.id).atual + 1);
check('Vendas: motivo de perda "Preço"', v1.motivos.some(m => m.motivo === 'Preço'));
check('Vendas: tempo médio na 1ª etapa calculado', sv(first.id).dias_medios !== null);

// Consolidado
const c1 = await get(`/insights/consolidado?period=today&pipeline_id=${varejo.id}&user_id=${uid}`);
const hoje = c1.serie.at(-1);
check('Consolidado: série de hoje com novos/ganhos/perdidos', hoje && hoje.novos >= 3 && hoje.ganhos >= 1 && hoje.perdidos >= 1, JSON.stringify(hoje));
check('Consolidado: por etapa e por usuário', c1.por_etapa.some(e => e.n >= 1) && c1.por_usuario.some(u => u.nome === 'Diana Diretoria'));
const cm = await get('/insights/consolidado?period=month&group=month');
check('Consolidado: agrupar por mês', cm.group === 'month' && cm.serie.every(s => /^\d{4}-\d{2}$/.test(s.k)));

// Relatório de atividades
const a1 = await get(`/insights/atividades?period=today&user_id=${uid}`);
const d0 = a0.usuarios[0], d1 = a1.usuarios[0];
check('Atividades: 1 linha só da Diana com filtro', a1.usuarios.length === 1 && d1.nome === 'Diana Diretoria');
check('Atividades: vendas totais +1 / R$ 500', d1.vendas === d0.vendas + 1 && d1.vendas_valor === d0.vendas_valor + 500);
check('Atividades: tarefas +1 e mensagens enviadas +1', d1.tarefas === d0.tarefas + 1 && d1.mensagens === d0.mensagens + 1);

// Metas
const put = await api('PUT', '/insights/metas', { month: m0.month, metas: [{ user_id: uid, meta_valor: 2000, meta_qtd: 4 }] });
const m1 = await get('/insights/metas');
const mm = m1.usuarios.find(u => Number(u.user_id) === uid);
const mm0 = m0.usuarios.find(u => Number(u.user_id) === uid);
check('Metas: salvar meta do mês', put.status === 204 && mm.meta_valor === 2000 && mm.meta_qtd === 4);
check('Metas: realizado conta a venda ganha', mm.real_qtd === mm0.real_qtd + 1 && mm.real_valor === mm0.real_valor + 500);
const outro = await api('PUT', '/insights/metas', { month: m0.month, metas: [{ user_id: 999999, meta_valor: 1 }] });
check('Metas: ignora usuário de outra conta', outro.status === 204 && !(await sql`SELECT 1 FROM sales_goals WHERE user_id = 999999`).length);

// Registro de atividades
const e1 = await get(`/insights/eventos?event_type=lead_won&q=Insights 2 ${tag}`);
check('Eventos: venda ganha registrada com antes/depois', e1.eventos.length === 1 && e1.eventos[0].evento === 'Venda ganha' && e1.eventos[0].value_before?.includes(first.name), JSON.stringify(e1.eventos[0] || {}));
const e2 = await get(`/insights/eventos?q=${tag}&object_type=lead`);
check('Eventos: busca + tipo de objeto', e2.eventos.length === 5 && e2.eventos.every(e => e.object_type === 'lead'), `${e2.eventos.length}`);
const e3 = await get(`/insights/eventos?q=${tag}&per=10&page=1`), e4 = await get(`/insights/eventos?q=${tag}&per=10&page=2`);
check('Eventos: paginação', e3.eventos.length <= 10 && (e3.has_more ? e4.eventos.length > 0 : e4.eventos.length === 0));
const e5 = await get('/insights/eventos?user_id=robo&per=100');
check('Eventos: filtro "Robô" só traz automação', e5.eventos.every(e => e.usuario === 'Robô' && e.user_id === null));
const e6 = await get(`/insights/eventos?period=today&q=${tag}`);
check('Eventos: filtro de período (hoje)', e6.eventos.length >= 5 && (await get(`/insights/eventos?period=yesterday&q=${tag}`)).eventos.length === 0);

// travas de perfil: consultora não vê painel/relatórios; nos eventos só vê os dela
const tokC = await login('consultor@teste.local');
const pc = await call(tokC, 'GET', '/insights/painel');
const ec = await call(tokC, 'GET', `/insights/eventos?user_id=${uid}`);
check('Consultora: painel bloqueado (403)', pc.status === 403, `status ${pc.status}`);
check('Consultora: eventos só dela', ec.status === 200 && ec.data.eventos.every(e => Number(e.user_id) !== uid), `status ${ec.status}`);

// limpeza
await sql`DELETE FROM messages WHERE conversation_id = ${conv.id}`; await sql`DELETE FROM conversations WHERE id = ${conv.id}`;
await sql`UPDATE sales_goals SET value_goal = 0, count_goal = 0 WHERE user_id = ${uid} AND month = ${m0.month}`;
for (const c of [ativo, ganho, perdido]) await api('DELETE', `/pipeline_cards/${c.id}`);

console.log(`\n${ok} ok, ${fail} falha(s)`);
await sql.end();
process.exit(fail ? 1 : 0);

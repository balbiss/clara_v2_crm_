// Teste ponta a ponta dos funis (estrutura do Kommo) e do motor do Automatize.
// Precisa da API rodando (porta 3011), do seed e do scripts/seed-kommo-estrutura.ts.
//   node tests/e2e-funis.mjs
import 'dotenv/config';
import postgres from 'postgres';

const API = process.env.API_URL || 'http://localhost:3011';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const login = await fetch(`${API}/users/sign_in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email: 'diretoria@teste.local', password: '123456' } }) });
const token = login.headers.get('authorization');
const api = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: token }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: r.status === 204 ? null : await r.json() };
};

const { data: pipes } = await api('GET', '/pipelines');
const varejo = pipes.find(p => p.slug === 'varejo');
const onb = pipes.find(p => p.slug === 'onboarding');
check('4 funis do Kommo', ['varejo', 'onboarding', 'atacado', 'prospeccao'].every(s => pipes.some(p => p.slug === s)));
check('Varejo tem ganha/perdida', varejo.pipeline_stages.some(s => s.kind === 'won') && varejo.pipeline_stages.some(s => s.kind === 'lost'));
const st = (p, name) => p.pipeline_stages.find(s => s.name === name);

// 1) novo lead com contato novo
const nome = 'Teste Funil ' + Date.now();
const { status: s1, data: card } = await api('POST', `/pipelines/${varejo.id}/pipeline_cards`, { name: nome, phone: '5514900000' + String(Date.now()).slice(-3), value: 350, pipeline_stage_id: st(varejo, 'Identificar lead').id });
check('cria lead com contato novo', s1 === 201 && card.contact?.name === nome, `status ${s1}`);
check('valor do lead', card.value === 350);

// 2) mover pra "Comprou" agenda o gatilho de +72h
await api('PUT', `/pipeline_cards/${card.id}`, { pipeline_stage_id: st(varejo, 'Comprou').id });
// diferença calculada no banco (colunas sem fuso — o driver as leria como horário local)
const [run] = await sql`SELECT id, round(extract(epoch FROM run_at - (now() AT TIME ZONE 'UTC')) / 3600)::int AS horas FROM pipeline_trigger_runs WHERE pipeline_card_id = ${card.id} AND status = 'pending'`;
check('Comprou agenda mover em 72h', run?.horas === 72, `${run?.horas}h`);

// 3) "vence" o atraso e roda o job: vai pra 3º Dia, que agenda tarefa +1h e mover +648h
await sql`UPDATE pipeline_trigger_runs SET run_at = now() - interval '1 minute' WHERE id = ${run.id}`;
const { tickPipelineTriggers } = await import('../src/lib/pipelines.ts').catch(() => ({}));
if (tickPipelineTriggers) await tickPipelineTriggers();
else await new Promise(r => setTimeout(r, 65_000)); // sem tsx: espera o job da API
const [c2] = await sql`SELECT pipeline_stage_id FROM pipeline_cards WHERE id = ${card.id}`;
check('job moveu pra 3º Dia - pós-venda', Number(c2.pipeline_stage_id) === st(varejo, '3º Dia - pós-venda').id);
const pend = await sql`SELECT run_at FROM pipeline_trigger_runs WHERE pipeline_card_id = ${card.id} AND status = 'pending' ORDER BY run_at`;
check('3º Dia agendou tarefa (+1h) e mover (+648h)', pend.length === 2);

// 4) sair da etapa cancela os atrasados pendentes
await api('PUT', `/pipeline_cards/${card.id}`, { pipeline_stage_id: st(varejo, 'Sem interesse').id });
const [{ n }] = await sql`SELECT count(*)::int n FROM pipeline_trigger_runs WHERE pipeline_card_id = ${card.id} AND status = 'pending'`;
check('mudar de etapa cancela os pendentes', n === 0);

// 5) perdido com motivo
const lost = st(varejo, 'Venda perdida');
const { data: perdido } = await api('PUT', `/pipeline_cards/${card.id}`, { pipeline_stage_id: lost.id, loss_reason: 'Desqualificado' });
check('venda perdida com motivo', perdido.loss_reason === 'Desqualificado' && !!perdido.closed_at);

// 6) Onboarding/Agendado: tags removidas + campo Onboarding = 1º mês, na hora
const { data: c3 } = await api('POST', `/pipelines/${onb.id}/pipeline_cards`, { name: nome + ' onb', pipeline_stage_id: st(onb, 'Agendado').id });
const [ct] = await sql`SELECT custom_attributes FROM contacts WHERE id = ${c3.contact.id}`;
check('Agendado preenche Onboarding = 1º mês', ct.custom_attributes?.cf_onboarding === '1º mês');

// 7) Iniciou na loja: etiqueta REVENDEDORA NOVA + tarefa
await api('PUT', `/pipeline_cards/${c3.id}`, { pipeline_stage_id: st(onb, 'Iniciou na loja').id });
const tg = await sql`SELECT t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ${c3.contact.id}`;
check('Iniciou na loja põe REVENDEDORA NOVA', tg.some(t => t.name === 'REVENDEDORA NOVA'));
const tk = await sql`SELECT titulo FROM tarefas WHERE contact_id = ${c3.contact.id} AND status = 'pendente'`;
check('Iniciou na loja cria a tarefa', tk.some(t => t.titulo === 'Revendedora iniciou!'));

// 8) gatilho por data: Data de Agendamento ontem +24h → tarefa "não compareceu" (Atacado/Agendado)
const atac = pipes.find(p => p.slug === 'atacado');
const ontem = new Date(Date.now() - 25 * 3600_000);
const dataBR = `${String(ontem.getDate()).padStart(2, '0')}/${String(ontem.getMonth() + 1).padStart(2, '0')}/${ontem.getFullYear()} ${String(ontem.getHours()).padStart(2, '0')}:${String(ontem.getMinutes()).padStart(2, '0')}`;
const { data: c4 } = await api('POST', `/pipelines/${atac.id}/pipeline_cards`, { name: nome + ' atac', pipeline_stage_id: st(atac, 'Agendado').id });
await sql`UPDATE contacts SET custom_attributes = jsonb_set(coalesce(custom_attributes,'{}'), '{data_agendamento}', to_jsonb(${dataBR}::text)) WHERE id = ${c4.contact.id}`;
if (tickPipelineTriggers) await tickPipelineTriggers();
const tk4 = await sql`SELECT titulo FROM tarefas WHERE contact_id = ${c4.contact.id} AND status = 'pendente'`;
check('24h depois da Data de Agendamento cria tarefa', tk4.some(t => t.titulo.startsWith('Passou a data')));

// limpeza
for (const c of [card, c3, c4]) {
  await sql`DELETE FROM pipeline_cards WHERE contact_id = ${c.contact.id}`;
  await sql`DELETE FROM tarefas WHERE contact_id = ${c.contact.id}`;
  await sql`DELETE FROM contact_tags WHERE contact_id = ${c.contact.id}`;
  await sql`DELETE FROM contact_audit_events WHERE contact_id = ${c.contact.id}`;
  await sql`DELETE FROM reseller_phones WHERE contact_id = ${c.contact.id}`;
  await sql`DELETE FROM contacts WHERE id = ${c.contact.id}`;
}
console.log(`\n${ok} ok, ${fail} falha(s)`);
await sql.end();
process.exit(fail ? 1 : 0);

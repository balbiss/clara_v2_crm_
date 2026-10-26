// Funil Consignado do Kommo (ciclo mensal da maleta) dentro da v2: funil de sistema cujas etapas são
// os status da régua (pipeline_stages.status_key). O card de cada revendedora acompanha o status
// (lib/pipelines syncConsignadoCard) e os gatilhos do Automatize rodam ao entrar na etapa.
// Gatilhos = docs do mapeamento (kommo-clara-mapeamento, seção Consignado), menos o que a régua já
// faz sozinha (mover 3º/10º/20º dia pelos dias do ciclo e criar a tarefa de cada um — jobs/regua).
// Robôs (mandam WhatsApp) entram DESLIGADOS — a diretoria liga no Automatize quando quiser.
// Idempotente: roda a cada start (bootstrap). Gatilhos só na criação do funil (não sobrescreve
// o que a diretoria editou); cards que faltam são criados SEM disparar gatilho.
//   npx tsx scripts/seed-consignado.ts
import 'dotenv/config';
import { and, asc, eq } from 'drizzle-orm';
import { db, sql } from '../src/db/client.js';
import { accounts, flows, pipelineStages, pipelineTriggers, pipelines, tags } from '../src/db/schema.js';
/* eslint-disable @typescript-eslint/no-explicit-any */

const H = 60;
const SLUG = 'consignado';
type T = { event?: string; delay?: number; action: string; config?: any; schedule?: any };
const task = (titulo: string, tipo: string, delay = 0, descricao?: string): T => ({ delay, action: 'create_task', config: { titulo, tipo, descricao } });
const addTags = (...names: string[]): T => ({ action: 'add_tags', config: { tag_names: names } });
const rmTags = (delay: number, ...names: string[]): T => ({ delay, action: 'remove_tags', config: { tag_names: names } });
const bot = (flow_name: string, delay = 0): T => ({ delay, action: 'start_flow', config: { flow_name } });
const toda_terca = (titulo: string, tipo: string): T => ({ event: 'schedule', action: 'create_task', config: { titulo, tipo }, schedule: { kind: 'weekly', weekday: 2, time: '09:00' } });

const ETAPAS: { key: string; name: string; color: string; description?: string; triggers?: T[] }[] = [
  { key: 'revendedor_ativo', name: 'Revendedor Ativo', color: '#ccff66', triggers: [
    { action: 'complete_tasks', config: { comment: 'Concluída ao voltar para Revendedor Ativo.' } },
    { action: 'set_field', config: { field_key: 'data_agendamento', value: '' } },
    addTags('REVENDEDORA ATIVA', 'CONSIGNADO'),
    rmTags(0, 'LISTA UPLOAD', 'LISTA DE TRANSMISSÃO', 'Não é Lead', 'REVENDEDORA NOVA', 'CADASTRO APROVADO', 'Cadastro NÃO aprovado', 'SEM MALETA', 'EX-REVENDEDORA', 'LISTA DE ATACADO'),
    { action: 'advance_field', config: { field_key: 'cf_onboarding', steps: ['1º mês', '2º mês', '3º mês', 'Veterano'] } },
    bot('Pesquisa de satisfação', 30),
    bot('Pós - pesquisa de satisfação', 2 * H),
  ] },
  { key: 'terceiro_dia', name: '3º Dia', color: '#fffeb2', description: 'Incentivo\nViu o catálogo?\nCompartilhar as fotos' },
  { key: 'decimo_dia', name: '10º Dia', color: '#ffcc66', description: 'Incentivo\nComo estão as vendas?\nPrazo da Limitada\nPeça que as clientes pediram' },
  { key: 'vigesimo_dia', name: '20º Dia', color: '#ffc8c8', description: 'Agendar o acerto\nVender até o último dia\nPegar encomendas', triggers: [bot('Confirma Agend. Dia Seguinte')] },
  { key: 'agendado', name: 'Agendado', color: '#99ccff', triggers: [
    { event: 'date_field', action: 'create_task', config: { date_field: 'data_agendamento', offset_minutes: 24 * H, tipo: 'manual_agendamento', titulo: 'VERIFICAR SITUAÇÃO - a data de agendamento já passou' } },
  ] },
  { key: 'reagendar', name: 'Reagendar', color: '#ffff99', triggers: [
    { action: 'set_field', config: { field_key: 'data_agendamento', value: '' } },
    { event: 'schedule', action: 'create_task', config: { titulo: 'Reagendar cliente', tipo: 'manual_agendamento' }, schedule: { kind: 'daily', time: '08:00' } },
  ] },
  { key: 'atrasada', name: 'Atrasada', color: '#ff8f92' },
  { key: 'suspensa_atraso', name: 'Suspensa por atraso', color: '#ff8f92' },
  { key: 'sem_maleta', name: 'Sem maleta', color: '#d5d8db', triggers: [
    addTags('SEM MALETA'),
    task('Reativação - tentativa 1', 'manual_ligar', 72 * H),
    task('Reativação - tentativa 2', 'manual_ligar', 240 * H),
    task('Reativação - tentativa 3', 'manual_ligar', 720 * H),
    rmTags(360 * H, 'REVENDEDORA ATIVA'),
    { delay: 1444 * H, action: 'move_stage', config: { target: 'reativacao' } },
    toda_terca('Reativar cliente', 'manual_ligar'),
  ] },
  { key: 'inativa_pendencia', name: 'Sem maleta (c/ pendência)', color: '#ffc8c8', triggers: [
    addTags('INADIMPLENTE'),
    rmTags(0, 'REVENDEDORA ATIVA'),
    task('Verificar pendência financeira', 'manual_cobranca', 72 * H),
  ] },
  { key: 'negativado_juridico', name: 'Negativado / Jurídico', color: '#d5d8db' },
  { key: 'resgate', name: 'Resgate', color: '#ffcc66', triggers: [toda_terca('RESGATAR MALETA', 'manual_cobranca')] },
  { key: 'reativacao', name: 'Reativação', color: '#e6e8ff', triggers: [
    rmTags(0, 'SEM MALETA'),
    addTags('EX-REVENDEDORA'),
    toda_terca('Reativar cliente', 'manual_ligar'),
  ] },
  { key: 'descadastrada', name: 'Descadastrada', color: '#d5d8db' },
];
const TAG_COLORS: Record<string, string> = { 'REVENDEDORA ATIVA': '#16a34a', CONSIGNADO: '#7c3aed', 'SEM MALETA': '#d97706', INADIMPLENTE: '#dc2626', 'EX-REVENDEDORA': '#6b7280' };

for (const account of await db.select().from(accounts).orderBy(asc(accounts.id))) {
  const accountId = account.id;
  let [pipe] = await db.select().from(pipelines).where(and(eq(pipelines.accountId, accountId), eq(pipelines.slug, SLUG)));
  const novo = !pipe;
  if (!pipe) [pipe] = await db.insert(pipelines).values({ accountId, name: 'Consignado', slug: SLUG, system: true, position: 0 }).returning();

  const stageByKey = new Map<string, number>();
  for (const s of await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, pipe.id))) if (s.statusKey) stageByKey.set(s.statusKey, s.id);
  for (const [i, e] of ETAPAS.entries()) {
    if (stageByKey.has(e.key)) continue;
    const [s] = await db.insert(pipelineStages).values({ pipelineId: pipe.id, name: e.name, color: e.color, description: e.description ?? null, position: i, statusKey: e.key }).returning();
    stageByKey.set(e.key, s.id);
  }

  if (novo) {
    const tagId = new Map<string, number>();
    for (const t of await db.select().from(tags).where(eq(tags.accountId, accountId))) tagId.set(t.name.toLowerCase(), t.id);
    const nomes = [...new Set(ETAPAS.flatMap(e => (e.triggers ?? []).flatMap(t => t.config?.tag_names ?? [])))] as string[];
    for (const name of nomes) {
      if (tagId.has(name.toLowerCase())) continue;
      const [t] = await db.insert(tags).values({ accountId, name, color: TAG_COLORS[name] || '#9ca3af' }).returning();
      tagId.set(name.toLowerCase(), t.id);
    }
    const flowId = new Map((await db.select({ id: flows.id, name: flows.name }).from(flows).where(eq(flows.accountId, accountId))).map(f => [f.name, f.id]));
    let n = 0;
    for (const e of ETAPAS) {
      for (const [i, t] of (e.triggers ?? []).entries()) {
        const config = { ...(t.config ?? {}) };
        if (config.target) { config.target_stage_id = stageByKey.get(config.target); delete config.target; }
        if (config.tag_names) { config.tag_ids = (config.tag_names as string[]).map(x => tagId.get(x.toLowerCase())).filter(Boolean); delete config.tag_names; }
        if (config.flow_name && flowId.has(config.flow_name)) config.flow_id = flowId.get(config.flow_name);
        await db.insert(pipelineTriggers).values({
          pipelineStageId: stageByKey.get(e.key)!, actionType: t.action, event: t.event ?? 'enter', delayMinutes: t.delay ?? 0,
          config, conditions: [], schedule: t.schedule ?? {}, position: i, active: t.action !== 'start_flow',
        });
        n++;
      }
    }
    console.log(`Funil Consignado criado: ${ETAPAS.length} etapas, ${n} gatilhos (robôs desligados).`);
  }

  // cards: toda revendedora com status da régua tem o seu card na etapa do status (sem disparar gatilho)
  const keys = [...stageByKey.keys()];
  if (!keys.length) continue;
  const criados = await sql.unsafe(`
    INSERT INTO pipeline_cards (pipeline_id, pipeline_stage_id, contact_id, stage_entered_at, created_at, updated_at)
    SELECT $1::bigint, s.id, c.id, coalesce(c.status_changed_at, c.updated_at, now()), now(), now()
    FROM contacts c JOIN pipeline_stages s ON s.pipeline_id = $1::bigint AND s.status_key = c.status
    WHERE c.account_id = $2::bigint
    ON CONFLICT (pipeline_id, contact_id) DO NOTHING RETURNING id`, [pipe.id, accountId]);
  const acertados = await sql.unsafe(`
    UPDATE pipeline_cards pc SET pipeline_stage_id = s.id, stage_entered_at = coalesce(c.status_changed_at, now()), updated_at = now()
    FROM contacts c, pipeline_stages s
    WHERE pc.pipeline_id = $1::bigint AND c.id = pc.contact_id AND s.pipeline_id = $1::bigint AND s.status_key = c.status AND pc.pipeline_stage_id <> s.id
    RETURNING pc.id`, [pipe.id]);
  if (criados.length || acertados.length) console.log(`Consignado: ${criados.length} card(s) criado(s), ${acertados.length} acertado(s) com o status.`);
}
await sql.end();
process.exit(0);

// Cria no v2 a ESTRUTURA do Kommo da Clara (mapeada em 20/10/2026 — ver docs/KOMMO_PARIDADE.md):
// funis Varejo / Onboarding / Atacado / Prospecção com etapas, check-lists e gatilhos do Automatize,
// motivos de perda, etiquetas e campos usados pelos gatilhos. Sem leads (decisão do dono).
// O Consignado continua sendo a régua (contact.status) — o Onboarding "entrega" pra ela no fim.
// Idempotente: funil que já existe (mesmo slug) é pulado.
//   npx tsx scripts/seed-kommo-estrutura.ts
import 'dotenv/config';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { accounts, contactFieldGroups, lossReasons, pipelineStages, pipelineTriggers, pipelines, tags } from '../src/db/schema.js';
/* eslint-disable @typescript-eslint/no-explicit-any */

const H = 60; // minutos por hora
type T = { event?: string; delay?: number; action: string; config?: any; conditions?: any[]; schedule?: any };
type S = { name: string; color: string; description?: string; triggers?: T[] };

const task = (titulo: string, tipo = 'manual_acompanhamento', delay = 0, descricao?: string): T => ({ delay, action: 'create_task', config: { titulo, tipo, descricao } });
const move = (stage: string, delay: number): T => ({ delay, action: 'move_stage', config: { target: stage } });
const addTags = (...names: string[]): T => ({ action: 'add_tags', config: { tag_names: names } });
const rmTags = (...names: string[]): T => ({ action: 'remove_tags', config: { tag_names: names } });

const FUNIS: { name: string; stages: S[] }[] = [
  {
    name: 'Varejo',
    stages: [
      { name: 'Identificar lead', color: '#99ccff' },
      { name: 'Lista de Clientes Varejo', color: '#ffff99' },
      { name: 'Comprou', color: '#ccff66', triggers: [move('Varejo/3º Dia - pós-venda', 72 * H)] },
      { name: '3º Dia - pós-venda', color: '#fffeb2', triggers: [task('VAREJO - 3º Dia - pós-venda', 'manual_mensagem', 1 * H), move('Varejo/1 Mês - pós-venda', 648 * H)] },
      { name: '1 Mês - pós-venda', color: '#ffcc66', triggers: [task('VAREJO - pós-venda de 1 mês', 'manual_mensagem', 1 * H), move('Varejo/2 Meses - pós-venda', 720 * H)] },
      { name: '2 Meses - pós-venda', color: '#ffc8c8', triggers: [task('VAREJO - pós-venda de 2 meses', 'manual_mensagem', 1 * H), move('Varejo/Lista de Clientes Varejo', 168 * H)] },
      { name: 'Sem interesse', color: '#d5d8db' },
    ],
  },
  {
    name: 'Onboarding',
    stages: [
      { name: 'Agendado', color: '#99ccff', triggers: [
        { event: 'date_field', action: 'start_flow', config: { date_field: 'data_agendamento', offset_minutes: -24 * H, flow_name: 'Confirma Agend. Dia Seguinte' } },
        { event: 'date_field', action: 'create_task', config: { date_field: 'data_agendamento', offset_minutes: 24 * H, tipo: 'manual_agendamento', titulo: 'Não compareceu na data agendada? Remarcar. Compareceu? Mover para "Iniciou na loja"' } },
        rmTags('LISTA UPLOAD', 'LISTA DE TRANSMISSÃO', 'Não é Lead', 'CLIENTE ATACADO', 'CADASTRO APROVADO', 'Cadastro NÃO aprovado', 'SEM MALETA', 'EX-REVENDEDORA', 'INADIMPLENTE', 'LISTA DE ATACADO'),
        { action: 'set_field', config: { field_key: 'cf_onboarding', value: '1º mês' } },
      ] },
      { name: 'Iniciou na loja', color: '#ffff99', triggers: [
        addTags('REVENDEDORA NOVA'),
        task('Revendedora iniciou!', 'manual_mensagem', 0, 'Enviar msg de boas-vindas\nPerguntar se entendeu como funciona o grupo de Pedido e Catálogo\nFalar sobre o objetivo do catálogo de peças enviado no grupo (peças da maleta dela)'),
        { event: 'schedule', action: 'move_stage', config: { target: 'Onboarding/1º Dia' }, schedule: { kind: 'daily', time: '07:00' } },
      ] },
      { name: '1º Dia', color: '#fffeb2', description: 'Conferir o check-list de inicialização\nEnviar material do desafio 90 dias', triggers: [
        task('1º dia de revenda', 'manual_mensagem', 0, 'Conferir se o check-list de inicialização foi feito\nEnviar material explicativo do desafio 90 dias'),
        move('Onboarding/3º Dia', 48 * H),
      ] },
      { name: '3º Dia', color: '#ffcc66', description: 'Lista de transmissão (100 pessoas)\nIdeias para as primeiras vendas', triggers: [
        task('3º dia de revenda', 'manual_mensagem', 0, 'Perguntar se conseguiu criar a lista de transmissão (100 pessoas)\nSe ainda não vendeu, dar uma ideia de como fazer as primeiras vendas'),
        move('Onboarding/7º Dia', 96 * H),
      ] },
      { name: '7º Dia', color: '#ccff66', description: 'Resultados da 1ª semana\nQuebrar medos e objeções', triggers: [
        task('7º dia de revenda', 'manual_mensagem', 0, 'Mensurar os resultados da primeira semana\nIdentificar e quebrar medos e objeções'),
        move('Onboarding/14º Dia', 168 * H),
      ] },
      { name: '14º Dia', color: '#ffc8c8', description: 'Resultados da 1ª quinzena\nLembrar que pode trocar peças da maleta', triggers: [
        task('14º dia de revenda', 'manual_mensagem', 0, 'Mensurar os resultados da primeira quinzena\nLembrar que se precisar de peça que não tem na maleta, pode vir trocar'),
        // no Kommo ia pro funil Consignado › 20º Dia; aqui o Consignado é a régua (contact.status)
        { delay: 144 * H, action: 'set_field', config: { field_key: 'status', value: 'vigesimo_dia' } },
      ] },
    ],
  },
  {
    name: 'Atacado',
    stages: [
      { name: 'Lista de Clientes Atacado', color: '#99ccff', triggers: [
        { action: 'set_field', config: { field_key: 'data_agendamento', value: '' } },
        { action: 'complete_tasks' },
        addTags('CLIENTE ATACADO'),
        rmTags('REVENDEDORA ATIVA', 'LISTA UPLOAD', 'LISTA DE TRANSMISSÃO', 'Não é Lead', 'CADASTRO APROVADO', 'Cadastro NÃO aprovado', 'CONSIGNADO', 'SEM MALETA', 'EX-REVENDEDORA', 'LISTA DE ATACADO'),
        move('Atacado/Reativação', 2880 * H),
      ] },
      { name: 'Agendado', color: '#ffff99', triggers: [
        { event: 'date_field', action: 'start_flow', config: { date_field: 'data_agendamento', offset_minutes: -24 * H, flow_name: 'Confirma Agend. Dia Seguinte' } },
        { event: 'date_field', action: 'create_task', config: { date_field: 'data_agendamento', offset_minutes: 24 * H, tipo: 'manual_acompanhamento', titulo: 'Passou a data de agendado. Verificar se já comprou e mover; se não, reagendar a nova compra.' } },
      ] },
      { name: 'Realizou compra', color: '#ccff66', triggers: [move('Atacado/3º Dia - pós-venda', 72 * H)] },
      { name: '3º Dia - pós-venda', color: '#fffeb2', description: 'Mensagem de incentivo\nPerguntar se conseguiu ver o catálogo\nInstruir compartilhar as fotos', triggers: [
        task('ATACADO - 3º dia pós-venda', 'manual_mensagem', 1 * H, 'Mensagem de incentivo\nPerguntar se conseguiu ver o catálogo\nInstruir compartilhar as fotos'),
        move('Atacado/10º Dia - pós-venda', 168 * H),
      ] },
      { name: '10º Dia - pós-venda', color: '#ffcc66', description: 'Mensagem de incentivo\nComo estão as vendas?\nIncentivar a divulgar fotos e pegar encomendas', triggers: [
        task('ATACADO - 10º dia pós-venda', 'manual_mensagem', 1 * H, 'Mensagem de incentivo\nComo estão as vendas?\nIncentivar a divulgar fotos, pegar encomendas'),
        move('Atacado/20º Dia - pós-venda', 240 * H),
      ] },
      { name: '20º Dia - pós-venda', color: '#ffc8c8', description: 'Agendar próxima compra\nFalar da nova coleção', triggers: [
        task('ATACADO - 20º dia pós-venda', 'manual_mensagem', 1 * H, 'Agendar próxima compra\nFalar da nova coleção'),
        task('ATACADO - 40 dias sem compra', 'manual_agendamento', 480 * H, 'Agendar próxima compra\nFalar da nova coleção'),
        move('Atacado/Lista de Clientes Atacado', 960 * H),
      ] },
      { name: 'Reativação', color: '#e6e8ff' },
      { name: 'Desqualificados', color: '#d5d8db' },
    ],
  },
  {
    name: 'Prospecção',
    stages: [
      { name: 'Interessado Consignado', color: '#99ccff' },
      { name: 'Interessado Atacado', color: '#ffff99' },
      { name: 'Formulário enviado', color: '#fffeb2' },
      { name: 'Formulário preenchido', color: '#ffcc66' },
      { name: 'Necessita avalista', color: '#ffc8c8' },
      { name: 'Cadastro aprovado', color: '#ccff66' },
      { name: 'Agendado para iniciar', color: '#87f2c0' },
      { name: 'Não aprovado (negativado)', color: '#d5d8db' },
    ],
  },
];

const TAGS: [string, string][] = [
  ['REVENDEDORA ATIVA', '#16a34a'], ['REVENDEDORA NOVA', '#0ea5e9'], ['EX-REVENDEDORA', '#6b7280'], ['SEM MALETA', '#d97706'],
  ['INADIMPLENTE', '#dc2626'], ['CONSIGNADO', '#7c3aed'], ['CLIENTE ATACADO', '#2563eb'], ['CLIENTE VAREJO', '#0891b2'],
  ['CADASTRO APROVADO', '#16a34a'], ['Cadastro NÃO aprovado', '#b91c1c'], ['LISTA UPLOAD', '#9ca3af'], ['LISTA DE TRANSMISSÃO', '#9ca3af'],
  ['LISTA DE ATACADO', '#9ca3af'], ['Não é Lead', '#9ca3af'], ['Lead Facebook', '#1877f2'], ['Lead Instagram', '#c13584'], ['Lead Indicação', '#059669'], ['Lead Tráfego', '#ea580c'],
];
const LOSS = ['Desqualificado', 'Fora do estado / Mora longe', 'Contato Interno (Equipe Clara)', 'Não é Lead'];
const CAMPOS = [
  { key: 'cf_onboarding', label: 'Onboarding' }, { key: 'cf_data_ultimo_acerto', label: 'Data Último Acerto/Compra' },
  { key: 'cf_data_inicio_revenda', label: 'Data de Início Revenda' }, { key: 'cf_aniversario', label: 'Aniversário' },
  { key: 'cf_cidade', label: 'Cidade' }, { key: 'cf_churn', label: 'Churn' }, { key: 'cf_motivo_churn', label: 'Motivo do Churn' },
  { key: 'cf_inadimplente', label: 'Inadimplente' }, { key: 'cf_valor_debito', label: 'Valor do débito' },
];

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const [account] = await db.select().from(accounts).orderBy(asc(accounts.id)).limit(1);
if (!account) throw new Error('Nenhuma conta no banco — rode o seed primeiro.');
const accountId = account.id;

// etiquetas
const tagId = new Map<string, number>();
for (const t of await db.select().from(tags).where(eq(tags.accountId, accountId))) tagId.set(t.name.toLowerCase(), t.id);
for (const [name, color] of TAGS) {
  if (tagId.has(name.toLowerCase())) continue;
  const [t] = await db.insert(tags).values({ accountId, name, color }).returning();
  tagId.set(name.toLowerCase(), t.id);
}

// campos personalizados
const campos = (Array.isArray(account.contactCustomFields) ? account.contactCustomFields : []) as { key: string; label: string }[];
const novos = CAMPOS.filter(c => !campos.some(x => x.key === c.key));
if (novos.length) await db.update(accounts).set({ contactCustomFields: [...campos, ...novos] }).where(eq(accounts.id, accountId));

// grupos de campos = abas do card do lead (Principal já existe; Dados e Financeiro como no Kommo)
const GRUPOS: [string, string[]][] = [
  ['Dados', ['cf_onboarding', 'cf_data_ultimo_acerto', 'cf_aniversario', 'cf_data_inicio_revenda', 'cf_cidade', 'cf_churn', 'cf_motivo_churn']],
  ['Financeiro', ['cf_inadimplente', 'cf_valor_debito']],
];
const grupos = await db.select().from(contactFieldGroups).where(eq(contactFieldGroups.accountId, accountId));
if (!grupos.length) await db.insert(contactFieldGroups).values({ accountId, name: 'Principal', position: 0, fieldKeys: ['venda', 'proximo_agendamento', 'limite_inicial', 'dia_fechamento', 'data_agendamento', 'obs_fechamento', 'dia_pf_fechamento', 'horario_fechamento', 'atraso', 'observacao_mes', 'meta', 'desafio_combinado', 'como_chegar_meta'] });
for (const [i, [name, keys]] of GRUPOS.entries()) {
  if (!grupos.some(g => g.name.toLowerCase() === name.toLowerCase())) await db.insert(contactFieldGroups).values({ accountId, name, position: i + 1, fieldKeys: keys });
}

// motivos de perda
const losses = (await db.select().from(lossReasons).where(eq(lossReasons.accountId, accountId))).map(r => r.name);
for (const [i, name] of LOSS.entries()) if (!losses.includes(name)) await db.insert(lossReasons).values({ accountId, name, position: i });

// funis + etapas (1ª passada), gatilhos (2ª passada, pra resolver "Funil/Etapa" de destino)
const stageId = new Map<string, number>();
const created: { pipe: string; stages: S[] }[] = [];
for (const [pi, f] of FUNIS.entries()) {
  const slug = slugify(f.name);
  const [exists] = await db.select().from(pipelines).where(and(eq(pipelines.accountId, accountId), eq(pipelines.slug, slug)));
  if (exists) {
    console.log(`Funil "${f.name}" já existe — pulado.`);
    for (const s of await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, exists.id))) stageId.set(`${f.name}/${s.name}`.toLowerCase(), s.id);
    continue;
  }
  const [p] = await db.insert(pipelines).values({ accountId, name: f.name, slug, position: pi + 1 }).returning();
  for (const [si, s] of f.stages.entries()) {
    const [row] = await db.insert(pipelineStages).values({ pipelineId: p.id, name: s.name, color: s.color, description: s.description ?? null, position: si }).returning();
    stageId.set(`${f.name}/${s.name}`.toLowerCase(), row.id);
  }
  await db.insert(pipelineStages).values([
    { pipelineId: p.id, name: 'Venda ganha', color: '#ccff66', kind: 'won', position: 1000 },
    { pipelineId: p.id, name: 'Venda perdida', color: '#d5d8db', kind: 'lost', position: 1001 },
  ]);
  created.push({ pipe: f.name, stages: f.stages });
  console.log(`Funil "${f.name}" criado com ${f.stages.length} etapas.`);
}

let nTriggers = 0;
for (const { pipe, stages } of created) {
  for (const s of stages) {
    for (const [i, t] of (s.triggers ?? []).entries()) {
      const config = { ...(t.config ?? {}) };
      if (config.target) { config.target_stage_id = stageId.get(String(config.target).toLowerCase()); delete config.target; }
      if (config.tag_names) { config.tag_ids = (config.tag_names as string[]).map(n => tagId.get(n.toLowerCase())).filter(Boolean); delete config.tag_names; }
      // robôs ainda não portados: gatilho fica criado mas DESLIGADO até o robô existir
      const active = t.action !== 'start_flow';
      await db.insert(pipelineTriggers).values({
        pipelineStageId: stageId.get(`${pipe}/${s.name}`.toLowerCase())!, actionType: t.action, event: t.event ?? 'enter',
        delayMinutes: t.delay ?? 0, config, conditions: t.conditions ?? [], schedule: t.schedule ?? {}, position: i, active,
      });
      nTriggers++;
    }
  }
}
console.log(`${nTriggers} gatilhos criados. Pronto.`);
process.exit(0);

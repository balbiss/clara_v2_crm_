// Perfis de acesso (Bel, 2026-11-04): o que cada perfil pode ver e fazer no CRM, configurável pela
// diretoria em Configurações › Perfis de acesso (no formato dos "Direitos de acesso" do Kommo).
//
// - CATALOGO: tudo que o CRM tem, agrupado por área. Cada item é "escopo" (Todas / Só da carteira) ou
//   "sim_nao" (pode / não pode). A tela é montada a partir daqui.
// - PADRAO: o que cada perfil-base fazia antes desta tela existir (as regras fixas da v1). Perfil novo
//   ou item novo no catálogo nasce com este padrão — ninguém ganha nem perde acesso sem a Bel mexer.
// - Diretoria vê e faz TUDO, sempre (não editável): ninguém consegue trancar a si mesmo pra fora.
// - Exceções por pessoa (cadastro do usuário) continuam valendo por cima do perfil quando LIGADAS:
//   view_all_contacts, broadcast, admin.
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accessProfiles, users } from '../db/schema.js';
import { roleName, roleValue, type Role, type User } from '../middleware/auth.js';

export type Escopo = 'todos' | 'carteira';
export type ItemTipo = 'escopo' | 'sim_nao';
export type ItemCatalogo = { key: string; label: string; desc?: string; tipo: ItemTipo };
export type GrupoCatalogo = { id: string; label: string; desc?: string; itens: ItemCatalogo[] };
export type Permissoes = Record<string, boolean | Escopo>;

const sn = (key: string, label: string, desc?: string): ItemCatalogo => ({ key, label, desc, tipo: 'sim_nao' });
const esc = (key: string, label: string, desc?: string): ItemCatalogo => ({ key, label, desc, tipo: 'escopo' });

export const CATALOGO: GrupoCatalogo[] = [
  { id: 'menu', label: 'Menu e telas', desc: 'Quais telas aparecem no menu (e podem ser abertas).', itens: [
    sn('menu.inicio', 'Início'),
    sn('menu.conversas', 'Conversas'),
    sn('menu.chat_equipe', 'Chat da Equipe'),
    sn('menu.consignado', 'Funil Consignado'),
    sn('menu.funis', 'Outros funis (Pipelines)'),
    sn('menu.calendario', 'Calendário'),
    sn('menu.contatos', 'Contatos'),
    sn('menu.carteira', 'Minhas Revendedoras'),
    sn('menu.inativas', 'Inativas'),
    sn('menu.atacado', 'Atacado'),
    sn('menu.pedidos_pendentes', 'Pedidos pendentes'),
    sn('menu.tarefas', 'Tarefas'),
    sn('menu.todos_leads', 'Todos os leads'),
    sn('menu.atividades', 'Registro de atividades', 'Histórico de tudo que foi feito no CRM (Insights › Atividades).'),
  ] },
  { id: 'inicio', label: 'Início', itens: [
    sn('inicio.equipe', 'Painel do Início mostra a equipe toda', 'Desligado: o Início mostra só os números da própria pessoa.'),
  ] },
  { id: 'conversas', label: 'Conversas (WhatsApp)', itens: [
    esc('conversas.ver', 'Quais conversas vê', 'Só da carteira: nos números com carteira, vê só as revendedoras dela; nos números sem carteira, vê todas as conversas do número.'),
    sn('conversas.enviar_qualquer_numero', 'Mandar mensagem por qualquer número', 'Desligado: só manda pelos números liberados pra ela (Gerenciar acesso do número).'),
    sn('conversas.atribuir_outros', 'Atribuir conversa a outra pessoa', 'Desligado: só atribui a si mesma (transferir com nota continua liberado).'),
    sn('conversas.excluir', 'Excluir conversa'),
  ] },
  { id: 'contatos', label: 'Revendedoras e contatos', itens: [
    esc('contatos.ver', 'Quais revendedoras vê', 'Só da carteira: as dela e as dos grupos de usuários (times) a que tem acesso.'),
    sn('contatos.trocar_responsavel', 'Trocar a responsável (carteira) da revendedora', 'Inclui a troca em massa na lista de revendedoras.'),
    sn('contatos.desconsiderar', 'Marcar revendedora como desconsiderada'),
    sn('contatos.excluir', 'Excluir revendedora'),
    sn('contatos.mesclar', 'Juntar revendedoras duplicadas'),
    sn('contatos.duplicados_jueri', 'Ver a lista de duplicados do Jueri'),
    sn('etiquetas.criar', 'Criar etiqueta nova na conversa/revendedora', 'Desligado: só escolhe entre as etiquetas que já existem.'),
  ] },
  { id: 'funis', label: 'Funis e leads', itens: [
    esc('funis.ver', 'Quais leads vê nos funis', 'Só da carteira: só os cards das revendedoras dela.'),
    sn('funis.excluir_lead', 'Excluir lead do funil'),
    sn('funis.configurar', 'Configurar funis (etapas, gatilhos, Automatize)'),
  ] },
  { id: 'tarefas', label: 'Tarefas e agenda', itens: [
    esc('tarefas.ver', 'Quais tarefas vê'),
    sn('tarefas.gerenciar', 'Criar, editar e excluir tarefas'),
    sn('agenda.equipe', 'Ver e marcar compromissos de outras pessoas', 'Desligado: no Calendário, só a própria agenda.'),
  ] },
  { id: 'disparos', label: 'Disparos', itens: [
    sn('disparos.usar', 'Fazer disparos', 'Também dá pra liberar pessoa por pessoa no cadastro do usuário ("Fazer disparos").'),
    sn('disparos.todas_revendedoras', 'Disparar para qualquer revendedora', 'Desligado: dispara só pra própria carteira, pelos números dela, com limite diário.'),
  ] },
  { id: 'insights', label: 'Insights e relatórios', itens: [
    sn('insights.gerencial', 'Painel Gerencial'),
    sn('insights.relatorios', 'Relatórios (vendas, consolidado, atividades, metas)'),
    sn('insights.metas_editar', 'Definir metas'),
    sn('insights.eventos_equipe', 'Ver atividades de outras pessoas', 'Desligado: no registro de atividades, vê só o que ela mesma fez.'),
    sn('avisos.gerencia', 'Receber avisos da gerência', 'Notificações marcadas para gerência/diretoria.'),
  ] },
  { id: 'config', label: 'Configurações', itens: [
    sn('config.trabalho', 'Configurações de trabalho e de chat'),
    sn('config.usuarios', 'Gestão de usuários (e rodízio)'),
    sn('config.grupos_usuarios', 'Grupos de usuários (times de vendas)'),
    sn('config.canais', 'Canais de WhatsApp (conectar número, QR, ligação, quem atende)'),
    sn('canais.reconectar', 'Reconectar os números dela (ler o QR quando o WhatsApp cair)', 'Só os números de que ela é membro, pelo aviso de desconectado. Não cria, apaga nem muda nada da caixa.'),
    sn('config.integracoes', 'Central de integrações (Jueri)'),
    sn('config.campos', 'Campos e grupos de campos'),
    sn('config.etiquetas', 'Tags (etiquetas)'),
    sn('config.motivos_perda', 'Motivos de perda'),
    sn('config.modelos', 'Modelos de mensagem'),
    sn('config.agente_ia', 'Agente de IA'),
    sn('config.robos', 'Robôs (Salesbot)'),
  ] },
];

export const TODAS_CHAVES = CATALOGO.flatMap(g => g.itens);
const TIPO = new Map(TODAS_CHAVES.map(i => [i.key, i.tipo]));

// Padrão de cada perfil-base = exatamente as regras fixas que existiam antes (gerente/diretoria =
// "carteira cheia", financeiro vê tudo mas não tem carteira, diretoria = configurações críticas).
const T = true, F = false;
type Base = Exclude<Role, 'diretoria'>;
const tabela: Record<string, [boolean | Escopo, boolean | Escopo, boolean | Escopo]> = {
  //                                 consultor   gerente    financeiro
  'menu.inicio':                     [T, T, T],
  'menu.conversas':                  [T, T, T],
  'menu.chat_equipe':                [T, T, T],
  'menu.consignado':                 [T, T, T],
  'menu.funis':                      [T, T, T],
  'menu.calendario':                 [T, T, T],
  'menu.contatos':                   [T, T, T],
  'menu.carteira':                   [T, T, F],
  'menu.inativas':                   [T, T, T],
  'menu.atacado':                    [T, T, T],
  'menu.pedidos_pendentes':          [T, T, T],
  'menu.tarefas':                    [T, T, F],
  'menu.todos_leads':                [F, T, F],
  'menu.atividades':                 [F, F, F],
  'inicio.equipe':                   [F, T, F],
  'conversas.ver':                   ['carteira', 'todos', 'todos'],
  'conversas.enviar_qualquer_numero':[F, T, T],
  'conversas.atribuir_outros':       [F, T, F],
  'conversas.excluir':               [F, T, F],
  'contatos.ver':                    ['carteira', 'todos', 'todos'],
  'contatos.trocar_responsavel':     [F, T, F],
  'contatos.desconsiderar':          [F, T, T],
  'contatos.excluir':                [F, T, F],
  'contatos.mesclar':                [F, T, F],
  'contatos.duplicados_jueri':       [F, F, F],
  'etiquetas.criar':                 [F, F, F],
  'funis.ver':                       ['carteira', 'todos', 'carteira'],
  'funis.excluir_lead':              [F, T, F],
  'funis.configurar':                [F, F, F],
  'tarefas.ver':                     ['carteira', 'todos', 'todos'],
  'tarefas.gerenciar':               [F, T, F],
  'agenda.equipe':                   [F, T, F],
  'disparos.usar':                   [F, T, F],
  'disparos.todas_revendedoras':     [F, T, F],
  'insights.gerencial':              [F, T, F],
  'insights.relatorios':             [F, T, F],
  'insights.metas_editar':           [F, T, F],
  'insights.eventos_equipe':         [F, T, F],
  'avisos.gerencia':                 [F, T, F],
  'config.trabalho':                 [F, F, F],
  'config.usuarios':                 [F, F, F],
  'config.grupos_usuarios':          [F, T, F],
  'config.canais':                   [F, F, F],
  'canais.reconectar':               [F, T, F],
  'config.integracoes':              [F, F, F],
  'config.campos':                   [F, F, F],
  'config.etiquetas':                [F, F, F],
  'config.motivos_perda':            [F, F, F],
  'config.modelos':                  [F, F, F],
  'config.agente_ia':                [F, F, F],
  'config.robos':                    [F, F, F],
};
const COLUNA: Record<Base, number> = { consultor: 0, gerente: 1, financeiro: 2 };

/** Tudo liberado (diretoria). */
export const TUDO: Permissoes = Object.fromEntries(TODAS_CHAVES.map(i => [i.key, i.tipo === 'escopo' ? 'todos' : true]));

export function padraoDoPerfil(role: Role): Permissoes {
  if (role === 'diretoria') return { ...TUDO };
  const col = COLUNA[role];
  return Object.fromEntries(TODAS_CHAVES.map(i => [i.key, tabela[i.key]?.[col] ?? (i.tipo === 'escopo' ? 'carteira' : false)]));
}

/** Limpa o que veio da tela: só chaves do catálogo, valores válidos; o que faltar fica com o padrão. */
export function normalizar(role: Role, p: unknown): Permissoes {
  const base = padraoDoPerfil(role);
  if (role === 'diretoria') return base;
  const src = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  for (const i of TODAS_CHAVES) {
    if (!(i.key in src)) continue;
    const v = src[i.key];
    if (i.tipo === 'escopo') { if (v === 'todos' || v === 'carteira') base[i.key] = v; }
    else base[i.key] = v === true || v === 'true';
  }
  return base;
}

// ---------- perfis da conta (cache curto; a tela invalida ao salvar) ----------
type PerfilRow = typeof accessProfiles.$inferSelect;
const cache = new Map<number, { at: number; perfis: PerfilRow[] }>();
const TTL = 15_000;
export const limparCachePerfis = (accountId: number) => cache.delete(accountId);

const NOMES: Record<Role, string> = { consultor: 'Consultor', gerente: 'Gerente', financeiro: 'Financeiro', diretoria: 'Diretoria' };
const ORDEM_BASE: Role[] = ['consultor', 'gerente', 'financeiro', 'diretoria'];

/** Os 4 perfis-base existem sempre (criados na primeira vez, com o padrão de hoje). */
export async function perfisDaConta(accountId: number): Promise<PerfilRow[]> {
  const c = cache.get(accountId);
  if (c && Date.now() - c.at < TTL) return c.perfis;
  let perfis = await db.select().from(accessProfiles).where(eq(accessProfiles.accountId, accountId)).orderBy(asc(accessProfiles.id));
  const faltam = ORDEM_BASE.filter(r => !perfis.some(p => p.sistema && roleName(p.baseRole) === r));
  if (faltam.length) {
    for (const r of faltam) {
      await db.insert(accessProfiles).values({ accountId, name: NOMES[r], baseRole: roleValue(r), permissions: padraoDoPerfil(r), sistema: true })
        .onConflictDoNothing();
    }
    perfis = await db.select().from(accessProfiles).where(eq(accessProfiles.accountId, accountId)).orderBy(asc(accessProfiles.id));
  }
  cache.set(accountId, { at: Date.now(), perfis });
  return perfis;
}

/** Perfil de uma pessoa: o escolhido no cadastro, senão o perfil-base do tipo dela. */
export function perfilDe(u: User, perfis: PerfilRow[]): PerfilRow | undefined {
  const escolhido = u.accessProfileId ? perfis.find(p => p.id === u.accessProfileId) : undefined;
  if (escolhido && escolhido.baseRole === u.role) return escolhido;
  return perfis.find(p => p.sistema && p.baseRole === (u.role ?? 0));
}

// permissões já calculadas por objeto de usuário (preenchido no requireAuth)
const resolvidas = new WeakMap<User, Permissoes>();

function aplicarExcecoes(u: User, p: Permissoes): Permissoes {
  const pp = (u.permissions ?? {}) as Record<string, unknown>;
  const out = { ...p };
  if (pp.view_all_contacts === true) { out['contatos.ver'] = 'todos'; out['funis.ver'] = 'todos'; out['tarefas.ver'] = 'todos'; }
  if (pp.broadcast === true) out['disparos.usar'] = true;
  if (pp.admin === true) out['conversas.ver'] = 'todos';
  return out;
}

/** Calcula e guarda as permissões da pessoa (uma consulta, com cache por conta). */
export async function carregarAcesso(u: User): Promise<Permissoes> {
  if (roleName(u.role) === 'diretoria') { resolvidas.set(u, TUDO); return TUDO; }
  const perfis = u.accountId ? await perfisDaConta(u.accountId) : [];
  const perfil = perfilDe(u, perfis);
  const p = aplicarExcecoes(u, perfil ? normalizar(roleName(u.role), perfil.permissions) : padraoDoPerfil(roleName(u.role)));
  resolvidas.set(u, p);
  return p;
}

/** Permissões já carregadas; quem não passou pelo requireAuth (jobs) cai no padrão do perfil-base. */
export function acessoDe(u: User): Permissoes {
  return resolvidas.get(u) ?? aplicarExcecoes(u, padraoDoPerfil(roleName(u.role)));
}

/** Pode? (itens sim/não; para escopo, 'todos' conta como sim) */
export function pode(u: User, key: string): boolean {
  if (roleName(u.role) === 'diretoria') return true;
  if (!TIPO.has(key)) throw new Error(`Permissão desconhecida: ${key}`);
  const v = acessoDe(u)[key];
  return v === true || v === 'todos';
}

/** Escopo de um item 'escopo': 'todos' ou 'carteira'. */
export function escopo(u: User, key: string): Escopo {
  if (roleName(u.role) === 'diretoria') return 'todos';
  return acessoDe(u)[key] === 'todos' ? 'todos' : 'carteira';
}

/** Quantas pessoas em cada perfil (pra tela). */
export async function contagemPorPerfil(accountId: number, perfis: PerfilRow[]) {
  const us = await db.select({ id: users.id, role: users.role, accessProfileId: users.accessProfileId, permissions: users.permissions, accountId: users.accountId })
    .from(users).where(and(eq(users.accountId, accountId), sql`${users.status} = 'active'`));
  const n = new Map<number, number>();
  for (const u of us) { const p = perfilDe(u as User, perfis); if (p) n.set(p.id, (n.get(p.id) ?? 0) + 1); }
  return n;
}

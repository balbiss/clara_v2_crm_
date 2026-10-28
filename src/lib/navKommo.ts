import { allowed, type NavRule } from './nav'

// Menu lateral no formato do Kommo (a equipe da Clara já conhece): Início, Comunicações, Pipelines,
// Calendário, Listas, Automações, Insights e, embaixo, Configurações / Ajuda / Notificações.
// As telas e as travas de perfil são as mesmas da v1 (lib/nav.ts) — só o agrupamento muda.
// color/sub/offline: caixas de entrada (números de WhatsApp) listadas embaixo de Conversas, como na v1
export type KNavLeaf = { path: string; label: string; rule: NavRule; badge?: 'conversas' | 'equipe'; color?: string; sub?: boolean; offline?: boolean }
export type KNavGroup = { id: string; label: string; icon: string; path?: string; rule?: NavRule; badge?: 'conversas' | 'equipe'; children?: KNavLeaf[] }

export const KOMMO_NAV: KNavGroup[] = [
  { id: 'inicio', label: 'Início', icon: 'home', path: '/dashboard', rule: 'all' },
  { id: 'comunicacoes', label: 'Comunicações', icon: 'chat', badge: 'conversas', children: [
    { path: '/conversas', label: 'Conversas', rule: 'all', badge: 'conversas' },
    { path: '/chat-equipe', label: 'Chat da Equipe', rule: 'all', badge: 'equipe' },
    { path: '/disparos', label: 'Disparos', rule: 'broadcast' },
  ] },
  { id: 'pipelines', label: 'Pipelines', icon: 'pipeline', children: [
    { path: '/funil', label: 'Consignado', rule: 'all' },
    // os funis personalizados (Varejo, Onboarding…) entram aqui dinamicamente
  ] },
  { id: 'calendario', label: 'Calendário', icon: 'calendar', path: '/calendario', rule: 'all' },
  { id: 'listas', label: 'Listas', icon: 'list', children: [
    { path: '/contatos', label: 'Contatos', rule: 'all' },
    { path: '/carteira', label: 'Minhas Revendedoras', rule: 'notFinance' },
    { path: '/inativas', label: 'Inativas', rule: 'all' },
    { path: '/atacado', label: 'Atacado', rule: 'all' },
    { path: '/pedidos-pendentes', label: 'Pedidos pendentes', rule: 'all' },
    { path: '/tarefas', label: 'Tarefas', rule: 'notFinance' },
    { path: '/pipelines/todos-leads', label: 'Todos os leads', rule: 'fullPortfolio' },
  ] },
  { id: 'agente-ia', label: 'Agente de IA', icon: 'ai', path: '/agente-ia', rule: 'critical' },
  { id: 'automacoes', label: 'Automações', icon: 'automation', children: [
    { path: '/fluxos', label: 'Robôs (Salesbot)', rule: 'critical' },
  ] },
  { id: 'insights', label: 'Insights', icon: 'insights', children: [
    { path: '/gerencial', label: 'Gerencial', rule: 'fullPortfolio' },
    { path: '/relatorios', label: 'Relatórios', rule: 'fullPortfolio' },
    { path: '/atividades', label: 'Atividades', rule: 'critical' },
  ] },
]

export const KOMMO_SETTINGS: KNavLeaf[] = [
  { path: '/settings/account', label: 'Conta', rule: 'critical' },
  { path: '/agentes', label: 'Usuários', rule: 'critical' },
  { path: '/settings/times-de-vendas', label: 'Times de Vendas', rule: 'fullPortfolio' },
  { path: '/settings/inboxes', label: 'Canais (WhatsApp)', rule: 'critical' },
  { path: '/settings/tags', label: 'Etiquetas', rule: 'critical' },
  { path: '/settings/campos-contato', label: 'Campos', rule: 'critical' },
  { path: '/settings/modelos-mensagem', label: 'Modelos de mensagem', rule: 'critical' },
]

/** Menu filtrado pelo perfil; grupos que ficam vazios somem. */
type NavInbox = { id: number; name: string; provider?: string; badge_short?: string; badge_color?: string; connected?: boolean }
export function kommoNavFor(role: string, pipelines: { slug: string; name: string }[], inboxes: NavInbox[] = [], perms?: Record<string, unknown> | null, consignadoVisivel = true) {
  return KOMMO_NAV.map(g => {
    if (!g.children) return allowed(g.rule || 'all', role, perms) ? g : null
    let children = g.children.filter(c => allowed(c.rule, role, perms))
    if (g.id === 'pipelines' && !consignadoVisivel) children = children.filter(c => c.path !== '/funil') // "Funis que vê" sem o Consignado
    if (g.id === 'pipelines') children = [...children, ...pipelines.map(p => ({ path: `/pipelines/${p.slug}`, label: p.name, rule: 'all' as NavRule }))]
    if (g.id === 'comunicacoes') {
      // cada número de WhatsApp (só os que a pessoa acessa) logo abaixo de Conversas, com a cor da caixa
      const caixas: KNavLeaf[] = inboxes.filter(i => ['waha', 'baileys'].includes(i.provider || '')).map(i => ({
        path: `/conversas/inbox/${i.id}`, label: i.badge_short || i.name, rule: 'all' as NavRule, color: i.badge_color, sub: true, offline: i.connected === false,
      }))
      const at = children.findIndex(c => c.path === '/conversas') + 1
      if (caixas.length) children = [...children.slice(0, at), ...caixas, ...children.slice(at)]
    }
    return children.length ? { ...g, children } : null
  }).filter((g): g is KNavGroup => !!g)
}

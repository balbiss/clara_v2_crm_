// Menu da Clara (mesmas telas e mesmas travas de perfil da v1), no formato de navegação do v2.
// broadcast = Disparos: gerência/diretoria, ou quem tem "Fazer disparos" ligado no usuário
export type NavRule = 'all' | 'notFinance' | 'fullPortfolio' | 'critical' | 'broadcast'
export interface NavItem { path: string; label: string; group: 'menu' | 'gestao' | 'ferramentas' | 'config'; rule: NavRule; badge?: 'conversas' | 'equipe' }

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Início', group: 'menu', rule: 'all' },
  { path: '/conversas', label: 'Conversas', group: 'menu', rule: 'all', badge: 'conversas' },
  { path: '/carteira', label: 'Minhas Revendedoras', group: 'menu', rule: 'notFinance' },
  { path: '/inativas', label: 'Inativas', group: 'menu', rule: 'all' },
  { path: '/atacado', label: 'Atacado', group: 'menu', rule: 'all' },
  { path: '/tarefas', label: 'Tarefas', group: 'menu', rule: 'notFinance' },
  { path: '/funil', label: 'Consignado', group: 'menu', rule: 'all' },
  { path: '/calendario', label: 'Calendário', group: 'menu', rule: 'all' },
  { path: '/chat-equipe', label: 'Chat da Equipe', group: 'menu', rule: 'all', badge: 'equipe' },

  { path: '/gerencial', label: 'Gerencial', group: 'gestao', rule: 'fullPortfolio' },
  { path: '/relatorios', label: 'Relatórios', group: 'gestao', rule: 'fullPortfolio' },
  { path: '/settings/times-de-vendas', label: 'Times de Vendas', group: 'gestao', rule: 'fullPortfolio' },
  { path: '/pipelines/todos-leads', label: 'Todos os leads', group: 'gestao', rule: 'fullPortfolio' },

  { path: '/fluxos', label: 'Fluxos', group: 'ferramentas', rule: 'critical' },
  { path: '/manual', label: 'Manual do Sistema', group: 'ferramentas', rule: 'all' },

  { path: '/settings/account', label: 'Conta', group: 'config', rule: 'critical' },
  { path: '/settings/inboxes', label: 'Caixas de Entrada', group: 'config', rule: 'critical' },
  { path: '/settings/tags', label: 'Etiquetas', group: 'config', rule: 'critical' },
  { path: '/settings/campos-contato', label: 'Campos do Contato', group: 'config', rule: 'critical' },
  { path: '/settings/modelos-mensagem', label: 'Modelos de Mensagem', group: 'config', rule: 'critical' },
  { path: '/agentes', label: 'Agentes', group: 'config', rule: 'critical' },
  { path: '/atividades', label: 'Atividades', group: 'config', rule: 'critical' },
]

export const GROUP_LABELS: Record<NavItem['group'], string> = { menu: 'Menu', gestao: 'Gestão', ferramentas: 'Ferramentas', config: 'Configurações' }

export function allowed(rule: NavRule, role: string, perms?: Record<string, unknown> | null) {
  if (rule === 'notFinance') return role !== 'financeiro'
  if (rule === 'fullPortfolio') return role === 'gerente' || role === 'diretoria'
  if (rule === 'broadcast') return role === 'gerente' || role === 'diretoria' || perms?.broadcast === true
  if (rule === 'critical') return role === 'diretoria'
  return true
}

export const ROLE_LABEL: Record<string, string> = { consultor: 'Consultor', gerente: 'Gerente', diretoria: 'Diretoria', financeiro: 'Financeiro' }
export const ini = (n: string) => (n || '').trim().split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || '?'

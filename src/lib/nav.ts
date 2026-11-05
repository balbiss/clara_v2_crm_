import { can } from './acesso'

// Menu da Clara. rule = chave do perfil de acesso (Configurações › Perfis de acesso), 'all' ou 'owner' (só diretoria).
export type NavRule = string
export interface NavItem { path: string; label: string; group: 'menu' | 'gestao' | 'ferramentas' | 'config'; rule: NavRule; badge?: 'conversas' | 'equipe' }

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Início', group: 'menu', rule: 'menu.inicio' },
  { path: '/conversas', label: 'Conversas', group: 'menu', rule: 'menu.conversas', badge: 'conversas' },
  { path: '/carteira', label: 'Minhas Revendedoras', group: 'menu', rule: 'menu.carteira' },
  { path: '/inativas', label: 'Inativas', group: 'menu', rule: 'menu.inativas' },
  { path: '/atacado', label: 'Atacado', group: 'menu', rule: 'menu.atacado' },
  { path: '/tarefas', label: 'Tarefas', group: 'menu', rule: 'menu.tarefas' },
  { path: '/funil', label: 'Consignado', group: 'menu', rule: 'menu.consignado' },
  { path: '/calendario', label: 'Calendário', group: 'menu', rule: 'menu.calendario' },
  { path: '/chat-equipe', label: 'Chat da Equipe', group: 'menu', rule: 'menu.chat_equipe', badge: 'equipe' },

  { path: '/gerencial', label: 'Gerencial', group: 'gestao', rule: 'insights.gerencial' },
  { path: '/relatorios', label: 'Relatórios', group: 'gestao', rule: 'insights.relatorios' },
  { path: '/settings/times-de-vendas', label: 'Times de Vendas', group: 'gestao', rule: 'config.grupos_usuarios' },
  { path: '/pipelines/todos-leads', label: 'Todos os leads', group: 'gestao', rule: 'menu.todos_leads' },

  { path: '/fluxos', label: 'Fluxos', group: 'ferramentas', rule: 'config.robos' },
  { path: '/manual', label: 'Manual do Sistema', group: 'ferramentas', rule: 'all' },

  { path: '/settings/account', label: 'Conta', group: 'config', rule: 'config.trabalho' },
  { path: '/settings/inboxes', label: 'Caixas de Entrada', group: 'config', rule: 'config.canais' },
  { path: '/settings/tags', label: 'Etiquetas', group: 'config', rule: 'config.etiquetas' },
  { path: '/settings/campos-contato', label: 'Campos do Contato', group: 'config', rule: 'config.campos' },
  { path: '/settings/modelos-mensagem', label: 'Modelos de Mensagem', group: 'config', rule: 'config.modelos' },
  { path: '/agentes', label: 'Agentes', group: 'config', rule: 'config.usuarios' },
  { path: '/atividades', label: 'Atividades', group: 'config', rule: 'menu.atividades' },
]

export const GROUP_LABELS: Record<NavItem['group'], string> = { menu: 'Menu', gestao: 'Gestão', ferramentas: 'Ferramentas', config: 'Configurações' }

// role/perms ficaram na assinatura por compatibilidade; quem decide é o perfil de acesso do usuário logado
export function allowed(rule: NavRule, role?: string, _perms?: Record<string, unknown> | null) {
  void _perms
  return can(rule, role ? { ...readUserSafe(), role } : undefined)
}
const readUserSafe = () => { try { return JSON.parse(localStorage.getItem('user') || 'null') || {} } catch { return {} } }

export const ROLE_LABEL: Record<string, string> = { consultor: 'Consultor', gerente: 'Gerente', diretoria: 'Diretoria', financeiro: 'Financeiro' }
export const ini = (n: string) => (n || '').trim().split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || '?'

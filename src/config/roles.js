// Os 4 perfis do briefing da Clara Ferreira (seção 30). Fonte única — antes esses
// arrays estavam copiados à mão em vários arquivos (router, DashboardLayout,
// RevendedorasAtivas, Reports, PipelineBoard, EditContactModal).
export const ROLE_LABELS = {
  consultor: 'Consultor',
  gerente: 'Gerente',
  diretoria: 'Diretoria',
  financeiro: 'Financeiro',
}

// Enxerga a carteira inteira (todas as revendedoras, de todos os consultores).
export const FULL_PORTFOLIO_ROLES = ['gerente', 'diretoria']

// Configurações críticas do sistema (Agentes, Caixas de Entrada, Etiquetas, Conta).
// Gerente NÃO entra aqui — opera a carteira, não mexe em config.
export const CRITICAL_CONFIG_ROLES = ['diretoria']

export function isFullPortfolio(user) {
  return !!user && FULL_PORTFOLIO_ROLES.includes(user.role)
}

export function isCriticalConfig(user) {
  return !!user && CRITICAL_CONFIG_ROLES.includes(user.role)
}

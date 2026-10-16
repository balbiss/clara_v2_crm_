// Régua de status da revendedora consignada (briefing seções 11-21).
// Um único campo `contact.status` guarda o valor — ativo ou inativo.

export const ACTIVE_STATUS_LABELS = {
  revendedor_ativo: 'Revendedor Ativo',
  terceiro_dia: '3° Dia',
  decimo_dia: '10° Dia',
  vigesimo_dia: '20° Dia',
  agendado: 'Agendado',
  reagendar: 'Reagendar',
  atrasada: 'Atrasada',
}

export const INACTIVE_STATUS_LABELS = {
  sem_maleta: 'Sem Maleta',
  inativa_pendencia: 'Inativa com Pendência',
  suspensa_atraso: 'Suspensa por Atraso',
  negativado_juridico: 'Negativado/Jurídico',
  resgate: 'Resgate',
  reativacao: 'Reativação',
  descadastrada: 'Descadastrada',
}

export const ALL_STATUS_LABELS = { ...ACTIVE_STATUS_LABELS, ...INACTIVE_STATUS_LABELS }

export const isActiveStatus = (status) =>
  Object.prototype.hasOwnProperty.call(ACTIVE_STATUS_LABELS, status || 'revendedor_ativo')

export const statusLabel = (status) => ALL_STATUS_LABELS[status || 'revendedor_ativo'] || status

export const STATUS_GROUPS = [
  { label: 'Ativas', keys: Object.keys(ACTIVE_STATUS_LABELS) },
  { label: 'Inativas', keys: Object.keys(INACTIVE_STATUS_LABELS) },
]

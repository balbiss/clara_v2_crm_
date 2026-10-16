// Campos comerciais do painel de contato (aba Principal) que a dona pode
// organizar em grupos próprios (Configurações → Campos do Contato). Chaves
// espelham ContactFieldGroup::ASSIGNABLE_FIELD_KEYS no backend -- "Dados do
// Jueri (sincronizado)" fica de fora de propósito, não é editável/reagrupável.
export const ASSIGNABLE_FIELDS = [
  { key: 'venda', label: 'Venda' },
  { key: 'proximo_agendamento', label: 'Próximo agendamento' },
  { key: 'limite_inicial', label: 'Limite Inicial' },
  { key: 'dia_fechamento', label: 'Dia Fechamento' },
  { key: 'data_agendamento', label: 'Data de Agendamento' },
  { key: 'obs_fechamento', label: 'Obs Fechamento' },
  { key: 'dia_pf_fechamento', label: 'Dia p/ Fechamento' },
  { key: 'horario_fechamento', label: 'Horário de Fechamento' },
  { key: 'atraso', label: 'Atraso' },
  { key: 'observacao_mes', label: 'Observação do mês' },
  { key: 'meta', label: 'Meta' },
  { key: 'desafio_combinado', label: 'Desafio combinado para o mês' },
  { key: 'como_chegar_meta', label: 'Como chegar na Meta' },
]

export const fieldLabel = (key) => ASSIGNABLE_FIELDS.find(f => f.key === key)?.label || key

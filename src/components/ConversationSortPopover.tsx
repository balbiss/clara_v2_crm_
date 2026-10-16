import { useSnapshot } from 'valtio'
import { conversationsStore } from '../store/conversations'
import { Dropdown, inputStyle, labelStyle } from './ui'

// Ordenação/status/tipo da lista (aplica na hora, como na v1)
export default function ConversationSortPopover({ isOpen }: { isOpen: boolean; onClose?: () => void }) {
  const store = useSnapshot(conversationsStore)
  const apply = (patch: Partial<{ status: string; sortBy: string; type: string }>) =>
    conversationsStore.setSortFilters({ status: store.sortStatus, sortBy: store.sortBy, type: store.sortType, ...patch })
  const row = (label: string, value: string, onChange: (v: string) => void, opts: [string, string][]) => (
    <div style={{ marginBottom: 10 }}>
      <span style={labelStyle}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, padding: '7px 10px', fontSize: 13 }}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
  return (
    <Dropdown open={isOpen} style={{ width: 240, padding: 14 }}>
      {row('Status', store.sortStatus, v => apply({ status: v }), [['open', 'Abertas'], ['resolved', 'Resolvidas'], ['snoozed', 'Adiadas'], ['all', 'Todas']])}
      {row('Ordenar por', store.sortBy, v => apply({ sortBy: v }), [['latest', 'Última atividade'], ['oldest', 'Mais antigas']])}
      {row('Tipo', store.sortType, v => apply({ type: v }), [['all', 'Todos'], ['mentions', 'Menções'], ['unread', 'Não lidas']])}
    </Dropdown>
  )
}

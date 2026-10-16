import { useSnapshot } from 'valtio'
import { conversationsStore } from '../store/conversations'
import '../styles/vue/ConversationSortPopover.scss'

// Porte de components/ConversationSortPopover.vue — aplica na hora ao trocar qualquer select.
export default function ConversationSortPopover({ isOpen }: { isOpen: boolean; onClose?: () => void }) {
  const store = useSnapshot(conversationsStore)
  if (!isOpen) return null
  const apply = (patch: Partial<{ status: string; sortBy: string; type: string }>) =>
    conversationsStore.setSortFilters({ status: store.sortStatus, sortBy: store.sortBy, type: store.sortType, ...patch })
  return (
    <div className="vs-ConversationSortPopover" style={{ display: 'contents' }}>
      <div className="sort-popover" onClick={e => e.stopPropagation()}>
        <div className="sort-row">
          <label>Status</label>
          <select value={store.sortStatus} onChange={e => apply({ status: e.target.value })} className="sort-select">
            <option value="open">Abertas</option>
            <option value="resolved">Resolvidas</option>
            <option value="snoozed">Adiadas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        <div className="sort-row">
          <label>Ordenar por</label>
          <select value={store.sortBy} onChange={e => apply({ sortBy: e.target.value })} className="sort-select">
            <option value="latest">Última atividade</option>
            <option value="oldest">Mais antigas</option>
          </select>
        </div>
        <div className="sort-row">
          <label>Tipo</label>
          <select value={store.sortType} onChange={e => apply({ type: e.target.value })} className="sort-select">
            <option value="all">Todos</option>
            <option value="mentions">Menções</option>
            <option value="unread">Não lidas</option>
          </select>
        </div>
      </div>
    </div>
  )
}

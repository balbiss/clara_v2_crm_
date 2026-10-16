import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Clock, CircleDashed, ChevronDown } from 'lucide-react'
import { conversationsStore } from '../store/conversations'
import { useClickOutside } from '../lib/hooks'
import SnoozeModal from './SnoozeModal'
import ResolveModal from './ResolveModal'
import '../styles/vue/ConversationStatusDropdown.scss'

// Porte de components/ConversationStatusDropdown.vue
type ResolveOptions = { kanbanStage: string; sendClosingMessage: boolean; closingMessageText: string }

export default function ConversationStatusDropdown({ conversationId, currentStatus = 'open' }: { conversationId: number; currentStatus?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [showResolve, setShowResolve] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen)

  const openSnooze = () => { setIsOpen(false); setShowSnooze(true) }
  const openResolve = () => { setIsOpen(false); setShowResolve(true) }
  const reopen = async () => { setIsOpen(false); await conversationsStore.updateConversationStatus(conversationId, 'open') }

  return (
    <div className="vs-ConversationStatusDropdown" style={{ display: 'contents' }}>
      <div className="status-dropdown-wrapper" ref={ref}>
        <div className="split-btn-group">
          {currentStatus !== 'resolved' && currentStatus !== 'snoozed'
            ? <button className="btn-main-action" onClick={openResolve}>Resolver</button>
            : currentStatus === 'snoozed'
              ? <button className="btn-main-action snoozed" onClick={reopen}>⏰ Adiado</button>
              : <button className="btn-main-action resolved" onClick={reopen}>✓ Resolvido</button>}
          <button className="btn-chevron" onClick={e => { e.stopPropagation(); setIsOpen(o => !o) }}><ChevronDown className="icon-sm" /></button>
        </div>
        {isOpen && (
          <div className="dropdown-menu">
            {currentStatus !== 'resolved' && <button className="dropdown-item" onClick={openResolve}><CheckCircle className="icon-sm" /><span>Resolver</span></button>}
            {currentStatus !== 'snoozed' && <button className="dropdown-item" onClick={openSnooze}><Clock className="icon-sm" /><span>Adiar</span></button>}
            {currentStatus !== 'open' && <button className="dropdown-item" onClick={reopen}><CircleDashed className="icon-sm" /><span>Deixar pendente</span></button>}
          </div>
        )}
      </div>
      {/* modais fora do wrapper (Teleport to body na v1) */}
      {showSnooze && createPortal(
        <SnoozeModal conversationId={conversationId} onClose={() => setShowSnooze(false)}
          onConfirm={async (until: string) => { setShowSnooze(false); await conversationsStore.snoozeConversation(conversationId, until) }} />,
        document.body)}
      {showResolve && createPortal(
        <ResolveModal conversationId={conversationId} onClose={() => setShowResolve(false)}
          onConfirm={async (opts: ResolveOptions) => { setShowResolve(false); await conversationsStore.resolveConversation(conversationId, opts) }} />,
        document.body)}
    </div>
  )
}

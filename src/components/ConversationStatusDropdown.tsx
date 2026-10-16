import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Clock, CircleDashed, ChevronDown } from 'lucide-react'
import { conversationsStore } from '../store/conversations'
import { useClickOutside } from '../lib/hooks'
import SnoozeModal from './SnoozeModal'
import ResolveModal from './ResolveModal'
import { Dropdown, MenuItem } from './ui'

// Resolver / adiar / reabrir (lógica da Clara v1)
type ResolveOptions = { kanbanStage: string; sendClosingMessage: boolean; closingMessageText: string }

export default function ConversationStatusDropdown({ conversationId, currentStatus = 'open' }: { conversationId: number; currentStatus?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [showResolve, setShowResolve] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen)
  const reopen = async () => { setIsOpen(false); await conversationsStore.updateConversationStatus(conversationId, 'open') }

  const main = currentStatus === 'snoozed'
    ? { label: '⏰ Adiada', bg: '#FFF6DB', color: '#5B4300', on: reopen }
    : currentStatus === 'resolved'
      ? { label: '✓ Resolvida', bg: 'var(--oliveSoft)', color: 'var(--olive)', on: reopen }
      : { label: 'Resolver', bg: 'var(--terra)', color: '#fff', on: () => setShowResolve(true) }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flex: 'none' }}>
      <button onClick={main.on} title={currentStatus === 'open' ? 'Encerrar atendimento' : 'Reabrir conversa'}
        style={{ padding: '7px 12px', border: 'none', borderRadius: '7px 0 0 7px', background: main.bg, color: main.color, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{main.label}</button>
      <button onClick={e => { e.stopPropagation(); setIsOpen(o => !o) }}
        style={{ padding: '7px 7px', border: 'none', borderLeft: '1px solid rgba(255,255,255,.25)', borderRadius: '0 7px 7px 0', background: main.bg, color: main.color, display: 'flex', alignItems: 'center' }}><ChevronDown size={14} /></button>
      <Dropdown open={isOpen}>
        {currentStatus !== 'resolved' && <MenuItem onClick={() => { setIsOpen(false); setShowResolve(true) }}><CheckCircle size={14} /> Resolver</MenuItem>}
        {currentStatus !== 'snoozed' && <MenuItem onClick={() => { setIsOpen(false); setShowSnooze(true) }}><Clock size={14} /> Adiar</MenuItem>}
        {currentStatus !== 'open' && <MenuItem onClick={reopen}><CircleDashed size={14} /> Deixar pendente</MenuItem>}
      </Dropdown>
      {showSnooze && createPortal(
        <SnoozeModal conversationId={conversationId} onClose={() => setShowSnooze(false)}
          onConfirm={async (until: string) => { setShowSnooze(false); await conversationsStore.snoozeConversation(conversationId, until) }} />, document.body)}
      {showResolve && createPortal(
        <ResolveModal conversationId={conversationId} onClose={() => setShowResolve(false)}
          onConfirm={async (opts: ResolveOptions) => { setShowResolve(false); await conversationsStore.resolveConversation(conversationId, opts) }} />, document.body)}
    </div>
  )
}

import { useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { Modal, btn, inputStyle, labelStyle } from './ui'

// Transferência exige nota de contexto — vira mensagem privada no chat (lógica da v1)
/* eslint-disable @typescript-eslint/no-explicit-any */
const LABELS: Record<string, string> = { corretor: 'Consultoras', suporte: 'Suporte', financeiro: 'Financeiro', manutencao: 'Manutenção' }

export default function TransferModal({ agents = [], currentAssigneeId = null, onClose, onConfirm }: {
  agents?: readonly any[]; currentAssigneeId?: number | null; onClose: () => void; onConfirm: (p: { userId: number; note: string }) => void
}) {
  const [userId, setUserId] = useState(currentAssigneeId ? String(currentAssigneeId) : '')
  const [note, setNote] = useState('')
  const groups: Record<string, any[]> = {}
  for (const a of agents) (groups[a.department || 'outros'] ||= []).push(a)
  const ok = !!userId && note.trim().length > 0
  return (
    <Modal title="Transferir conversa" subtitle="A nota aparece como mensagem privada no chat, só pra equipe." onClose={onClose}
      footer={<>
        <button onClick={onClose} style={btn('ghost')}>Cancelar</button>
        <button disabled={!ok} onClick={() => ok && onConfirm({ userId: parseInt(userId), note: note.trim() })} style={btn('primary', { opacity: ok ? 1 : 0.5 })}><ArrowRightLeft size={14} /> Transferir</button>
      </>}>
      <span style={labelStyle}>Transferir para</span>
      <select value={userId} onChange={e => setUserId(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
        <option value="">Selecionar pessoa…</option>
        {Object.entries(groups).map(([dept, list]) => (
          <optgroup key={dept} label={LABELS[dept] || dept}>{list.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}</optgroup>
        ))}
      </select>
      <span style={labelStyle}>Nota de contexto *</span>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={500} placeholder="Explique o motivo e o contexto pra quem vai assumir…" style={{ ...inputStyle, resize: 'vertical' }} />
      <span style={{ display: 'block', textAlign: 'right', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{note.length}/500</span>
    </Modal>
  )
}

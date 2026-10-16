import { useState } from 'react'
import { Modal, btn, inputStyle, labelStyle } from './ui'

// Adiar conversa (mesmas opções rápidas da Clara v1)
const addMinutes = (m: number) => { const d = new Date(); d.setMinutes(d.getMinutes() + m); return d.toISOString() }
const nextDayAt = (h: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.toISOString() }
const nextMondayAt = (h: number) => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(h, 0, 0, 0); return d.toISOString() }
const quickOptions = [
  { label: 'Em 30 minutos', icon: '⏱️', fn: () => addMinutes(30) },
  { label: 'Em 2 horas', icon: '⏰', fn: () => addMinutes(120) },
  { label: 'Amanhã às 9h', icon: '🌅', fn: () => nextDayAt(9) },
  { label: 'Amanhã às 14h', icon: '☀️', fn: () => nextDayAt(14) },
  { label: 'Segunda às 8h', icon: '📅', fn: () => nextMondayAt(8) },
]

export default function SnoozeModal({ onConfirm, onClose }: { conversationId: number; onConfirm: (iso: string) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('')
  return (
    <Modal title="Adiar conversa" subtitle="Você será avisado quando o tempo acabar e a conversa reabre sozinha." onClose={onClose} width={420}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {quickOptions.map(o => (
          <button key={o.label} onClick={() => onConfirm(o.fn())} className="hoverable"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--card)', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
            <span>{o.icon}</span>{o.label}
          </button>
        ))}
      </div>
      <span style={labelStyle}>Personalizado</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} min={new Date().toISOString().slice(0, 16)} style={inputStyle} />
        <button disabled={!custom} onClick={() => custom && onConfirm(new Date(custom).toISOString())} style={btn('primary', { opacity: custom ? 1 : 0.5 })}>Confirmar</button>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { X, AlarmClock } from 'lucide-react'
import '../styles/vue/SnoozeModal.scss'

// Porte de components/SnoozeModal.vue
const addMinutes = (minutes: number) => { const d = new Date(); d.setMinutes(d.getMinutes() + minutes); return d.toISOString() }
const nextDayAt = (hour: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const nextMondayAt = (hour: number) => {
  const d = new Date()
  const daysUntilMonday = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const quickOptions = [
  { label: 'Em 30 minutos', icon: '⏱️', fn: () => addMinutes(30) },
  { label: 'Em 2 horas', icon: '⏰', fn: () => addMinutes(120) },
  { label: 'Amanhã às 9h', icon: '🌅', fn: () => nextDayAt(9) },
  { label: 'Amanhã às 14h', icon: '☀️', fn: () => nextDayAt(14) },
  { label: 'Segunda às 8h', icon: '📅', fn: () => nextMondayAt(8) },
]

export default function SnoozeModal({ onConfirm, onClose }: { conversationId: number; onConfirm: (iso: string) => void; onClose: () => void }) {
  const [customTime, setCustomTime] = useState('')
  const confirmCustom = () => { if (customTime) onConfirm(new Date(customTime).toISOString()) }
  return (
    <div className="vs-SnoozeModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="snooze-modal">
          <div className="modal-header">
            <div className="modal-title-row">
              <AlarmClock className="modal-icon" />
              <h3>Adiar conversa</h3>
            </div>
            <button className="btn-close" onClick={onClose}><X size={16} /></button>
          </div>
          <p className="modal-subtitle">A IA continuará respondendo. Você será notificado quando o tempo acabar.</p>
          <div className="snooze-options">
            {quickOptions.map(opt => (
              <button key={opt.label} className="snooze-option" onClick={() => onConfirm(opt.fn())}>
                <span className="option-icon">{opt.icon}</span>
                <span className="option-label">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="custom-section">
            <label className="custom-label">Personalizado</label>
            <div className="custom-row">
              <input type="datetime-local" className="custom-input" value={customTime} onChange={e => setCustomTime(e.target.value)} min={new Date().toISOString().slice(0, 16)} />
              <button className="btn-confirm" onClick={confirmCustom} disabled={!customTime}>Confirmar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

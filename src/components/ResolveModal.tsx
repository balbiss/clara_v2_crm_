import { useState } from 'react'
import { X, CheckCircle } from 'lucide-react'
import '../styles/vue/ResolveModal.scss'

// Porte de components/ResolveModal.vue (opções do funil herdadas da v1 como estão).
const kanbanOptions = [
  { value: '', label: 'Não mover no funil', icon: '—' },
  { value: 'proposal', label: 'Proposta Feita', icon: '📋' },
  { value: 'won', label: 'Negócio Fechado 🎉', icon: '🏆' },
]

export default function ResolveModal({ onConfirm, onClose }: {
  conversationId: number
  onConfirm: (o: { kanbanStage: string; sendClosingMessage: boolean; closingMessageText: string }) => void
  onClose: () => void
}) {
  const [kanbanStage, setKanbanStage] = useState('')
  const [sendClosing, setSendClosing] = useState(false)
  const [closingText, setClosingText] = useState('Obrigado pelo seu contato! Encerramos seu atendimento por agora. Se precisar de algo mais, é só nos chamar. 😊')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const confirm = () => {
    setIsSubmitting(true)
    try { onConfirm({ kanbanStage, sendClosingMessage: sendClosing, closingMessageText: sendClosing ? closingText : '' }) }
    finally { setIsSubmitting(false) }
  }

  return (
    <div className="vs-ResolveModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="resolve-modal">
          <div className="modal-header">
            <div className="modal-title-row">
              <CheckCircle className="modal-icon" />
              <h3>Encerrar atendimento</h3>
            </div>
            <button className="btn-close" onClick={onClose}><X size={16} /></button>
          </div>
          <p className="modal-subtitle">A IA será pausada. Se o cliente mandar mensagem, a conversa reabrirá automaticamente.</p>
          <div className="field-group">
            <label className="field-label">Mover lead no funil para</label>
            <div className="kanban-options">
              {kanbanOptions.map(opt => (
                <button key={opt.value} className={`kanban-option${kanbanStage === opt.value ? ' active' : ''}`} onClick={() => setKanbanStage(opt.value)}>
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={sendClosing} onChange={e => setSendClosing(e.target.checked)} />
              <span>Enviar mensagem de encerramento no WhatsApp</span>
            </label>
            {sendClosing && <textarea className="closing-textarea" value={closingText} onChange={e => setClosingText(e.target.value)} rows={3} placeholder="Mensagem de encerramento..." />}
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button className="btn-resolve" onClick={confirm} disabled={isSubmitting}>
              <CheckCircle size={15} />
              {isSubmitting ? 'Encerrando...' : 'Encerrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

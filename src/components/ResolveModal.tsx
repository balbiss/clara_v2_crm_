import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { Modal, btn, inputStyle, labelStyle } from './ui'

// Encerrar atendimento (opções do funil herdadas da v1 como estão)
const kanbanOptions = [
  { value: '', label: 'Não mover no funil', icon: '—' },
  { value: 'proposal', label: 'Proposta feita', icon: '📋' },
  { value: 'won', label: 'Negócio fechado', icon: '🏆' },
]

export default function ResolveModal({ onConfirm, onClose }: {
  conversationId: number; onConfirm: (o: { kanbanStage: string; sendClosingMessage: boolean; closingMessageText: string }) => void; onClose: () => void
}) {
  const [stage, setStage] = useState('')
  const [send, setSend] = useState(false)
  const [text, setText] = useState('Obrigado pelo seu contato! Encerramos seu atendimento por agora. Se precisar de algo mais, é só nos chamar. 😊')
  return (
    <Modal title="Encerrar atendimento" subtitle="A IA é pausada. Se a revendedora mandar mensagem, a conversa reabre sozinha." onClose={onClose}
      footer={<>
        <button onClick={onClose} style={btn('ghost')}>Cancelar</button>
        <button onClick={() => onConfirm({ kanbanStage: stage, sendClosingMessage: send, closingMessageText: send ? text : '' })} style={btn('primary')}><CheckCircle size={14} /> Encerrar</button>
      </>}>
      <span style={labelStyle}>Mover no funil para</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {kanbanOptions.map(o => (
          <button key={o.value} onClick={() => setStage(o.value)}
            style={{ padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (stage === o.value ? 'var(--terra)' : 'var(--line)'), background: stage === o.value ? 'var(--terraSoft)' : 'var(--card)', color: stage === o.value ? 'var(--terra)' : 'var(--ink)' }}>
            {o.icon} {o.label}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} /> Enviar mensagem de encerramento no WhatsApp
      </label>
      {send && <textarea value={text} onChange={e => setText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />}
    </Modal>
  )
}

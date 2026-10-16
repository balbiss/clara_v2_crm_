import { useState } from 'react'
import { X, ArrowRightLeft } from 'lucide-react'
import '../styles/vue/TransferModal.scss'

// Porte de components/TransferModal.vue — transferência exige nota (vira mensagem privada)
/* eslint-disable @typescript-eslint/no-explicit-any */
const LABELS: Record<string, string> = { corretor: 'Corretores', suporte: 'Suporte', financeiro: 'Financeiro', manutencao: 'Manutenção' }

export default function TransferModal({ agents = [], currentAssigneeId = null, onClose, onConfirm }: {
  agents?: readonly any[]; currentAssigneeId?: number | null; onClose: () => void; onConfirm: (p: { userId: number; note: string }) => void
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>(currentAssigneeId ? String(currentAssigneeId) : '')
  const [note, setNote] = useState('')
  const groups: Record<string, any[]> = {}
  for (const a of agents) (groups[a.department || 'outros'] ||= []).push(a)
  const agentsByDept = Object.entries(groups).map(([dept, list]) => ({ dept, label: LABELS[dept] || dept, agents: list }))
  const canConfirm = !!selectedUserId && note.trim().length > 0
  const confirm = () => { if (canConfirm) onConfirm({ userId: parseInt(selectedUserId), note: note.trim() }) }

  return (
    <div className="vs-TransferModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="modal-box">
          <div className="modal-header">
            <div className="modal-title"><ArrowRightLeft size={16} /><span>Transferir Conversa</span></div>
            <button className="btn-close" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Transferir para</label>
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="select-field">
                <option value="">Selecionar agente...</option>
                {agentsByDept.map(g => (
                  <optgroup key={g.dept} label={'— ' + g.label}>
                    {g.agents.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nota de contexto <span className="required">*</span></label>
              <textarea value={note} onChange={e => setNote(e.target.value)} className="textarea-field" rows={4} maxLength={500}
                placeholder="Explique o motivo da transferência e o contexto para o próximo agente..." />
              <span className="char-count">{note.length}/500</span>
            </div>
            <div className="hint">A nota aparecerá como mensagem privada no chat, visível apenas para a equipe.</div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button className="btn-confirm" disabled={!canConfirm} onClick={confirm}><ArrowRightLeft size={14} /> Transferir</button>
          </div>
        </div>
      </div>
    </div>
  )
}

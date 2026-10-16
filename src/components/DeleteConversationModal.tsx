import { useState } from 'react'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import '../styles/vue/DeleteConversationModal.scss'

// Porte de components/DeleteConversationModal.vue — apaga só as mensagens; o cadastro fica.
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DeleteConversationModal({ isOpen, conversation, onClose, onDeleted }: { isOpen: boolean; conversation?: any; onClose: () => void; onDeleted?: () => void }) {
  const [loading, setLoading] = useState(false)
  if (!isOpen) return null
  const confirm = async () => {
    if (!conversation) return
    setLoading(true)
    try { await conversationsStore.deleteConversation(conversation.id); onDeleted?.(); onClose() }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao apagar conversa.', showConfirmButton: false, timer: 3500 }) }
    finally { setLoading(false) }
  }
  return (
    <div className="vs-DeleteConversationModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="delete-modal-content">
          <h2 className="delete-title">Apagar conversa</h2>
          <p className="delete-message">
            Isso apaga só o histórico de mensagens desta conversa.<br />
            O cadastro de <strong>{conversation?.contact?.name}</strong> (dados, notas, pedidos, etiquetas) continua intacto.
          </p>
          <div className="delete-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Não, Manter</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={loading}>{loading ? 'Apagando...' : 'Sim, Apagar Conversa'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

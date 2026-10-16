import { useState } from 'react'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import '../styles/vue/DeleteContactModal.scss'

// Porte de components/DeleteContactModal.vue
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DeleteContactModal({ isOpen, contact, onClose, onDeleted }: { isOpen: boolean; contact?: any; onClose: () => void; onDeleted?: () => void }) {
  const [loading, setLoading] = useState(false)
  if (!isOpen) return null
  const confirm = async () => {
    if (!contact) return
    setLoading(true)
    try { await conversationsStore.deleteContact(contact.id); onDeleted?.(); onClose() }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao excluir contato.', showConfirmButton: false, timer: 3500 }) }
    finally { setLoading(false) }
  }
  return (
    <div className="vs-DeleteContactModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="delete-modal-content">
          <h2 className="delete-title">Confirmar Exclusão</h2>
          <p className="delete-message">Você tem certeza que deseja excluir<br />{contact?.name}?</p>
          <div className="delete-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Não, Mantenha</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={loading}>{loading ? 'Excluindo...' : 'Sim, Excluir'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import '../styles/vue/MergeContactModal.scss'

// Porte de components/MergeContactModal.vue — destino = contatos das conversas carregadas
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MergeContactModal({ isOpen, contact, onClose }: { isOpen: boolean; contact?: any; onClose: () => void }) {
  const store = useSnapshot(conversationsStore)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [loading, setLoading] = useState(false)
  if (!isOpen) return null

  const seen = new Set<number>()
  const otherContacts: any[] = []
  if (contact) {
    store.conversations.forEach((c: any) => {
      if (c.contact && c.contact.id !== contact.id && !seen.has(c.contact.id)) { seen.add(c.contact.id); otherContacts.push(c.contact) }
    })
  }
  const close = () => { setSelectedContactId(''); onClose() }
  const merge = async () => {
    if (!contact || !selectedContactId) return
    setLoading(true)
    try { await conversationsStore.mergeContact(contact.id, Number(selectedContactId)); close() }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao mesclar contato.', showConfirmButton: false, timer: 3500 }) }
    finally { setLoading(false) }
  }

  return (
    <div className="vs-MergeContactModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Mesclar Contato</h2>
            <button className="close-btn" onClick={close}>&times;</button>
          </div>
          <div className="modal-body">
            <p className="description">
              Selecione o contato principal para onde deseja mover todas as conversas do contato <strong>{contact?.name}</strong>.
              <br /><br />
              <span className="warning-text">Aviso: O contato atual será excluído após a mesclagem.</span>
            </p>
            <div className="form-group">
              <label>Contato de Destino</label>
              <select value={selectedContactId} onChange={e => setSelectedContactId(e.target.value)} className="contact-select">
                <option value="" disabled>Selecione um contato</option>
                {otherContacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email || 'Sem dados'})</option>)}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={close}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={merge} disabled={!selectedContactId || loading}>{loading ? 'Mesclando...' : 'Confirmar Mesclagem'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

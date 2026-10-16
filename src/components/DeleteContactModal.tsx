import { useState } from 'react'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import { Modal, btn } from './ui'

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
    <Modal title="Apagar contato" width={400} onClose={onClose}
      subtitle={<>Tem certeza que deseja apagar <b>{contact?.name}</b>? Conversas, notas e pedidos dela também são apagados.</>}
      footer={<>
        <button onClick={onClose} style={btn('ghost')}>Não, manter</button>
        <button onClick={confirm} disabled={loading} style={btn('danger')}>{loading ? 'Apagando…' : 'Sim, apagar'}</button>
      </>}>{null}</Modal>
  )
}

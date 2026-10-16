import { useState } from 'react'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import { Modal, btn } from './ui'

// Apaga só o histórico de mensagens; o cadastro da revendedora fica (lógica da v1)
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
    <Modal title="Apagar conversa" width={420} onClose={onClose}
      subtitle={<>Isso apaga só o histórico de mensagens. O cadastro de <b>{conversation?.contact?.name}</b> (dados, notas, pedidos, etiquetas) continua intacto.</>}
      footer={<>
        <button onClick={onClose} style={btn('ghost')}>Não, manter</button>
        <button onClick={confirm} disabled={loading} style={btn('danger')}>{loading ? 'Apagando…' : 'Sim, apagar conversa'}</button>
      </>}>{null}</Modal>
  )
}

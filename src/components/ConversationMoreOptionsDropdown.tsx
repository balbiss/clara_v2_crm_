import { useState } from 'react'
import Swal from 'sweetalert2'
import { MoreVertical, VolumeX, Share, Loader2 } from 'lucide-react'
import api from '../api'
import { useClickOutside } from '../lib/hooks'
import '../styles/vue/ConversationMoreOptionsDropdown.scss'

// Porte de components/ConversationMoreOptionsDropdown.vue (bloquear/desbloquear, baixar transcrição)
export default function ConversationMoreOptionsDropdown({ conversationId, contactId, contactStatus = 'active', onContactBlocked, onContactUnblocked }: {
  conversationId: number; contactId: number; contactStatus?: string | null; onContactBlocked: () => void; onContactUnblocked: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen)

  const blockContact = async () => {
    setIsOpen(false)
    const result = await Swal.fire({
      title: 'Bloquear contato?', html: 'O contato não poderá mais enviar mensagens e a IA será pausada permanentemente para ele.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, bloquear', cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444',
    })
    if (!result.isConfirmed) return
    setIsLoading(true)
    try {
      await api.patch(`/contacts/${contactId}/block`)
      onContactBlocked()
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Contato bloqueado', showConfirmButton: false, timer: 3000 })
    } catch {
      Swal.fire('Erro', 'Não foi possível bloquear o contato.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const unblockContact = async () => {
    setIsOpen(false)
    setIsLoading(true)
    try {
      await api.patch(`/contacts/${contactId}/unblock`)
      onContactUnblocked()
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Contato desbloqueado', showConfirmButton: false, timer: 3000 })
    } catch {
      Swal.fire('Erro', 'Não foi possível desbloquear o contato.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const downloadTranscript = async () => {
    setIsOpen(false)
    setIsLoading(true)
    try {
      const response = await api.get(`/conversations/${conversationId}/transcript`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/plain' }))
      const link = document.createElement('a')
      link.href = url
      const disp = response.headers['content-disposition'] || ''
      const name = disp.match(/filename="?([^"]+)"?/)?.[1] || `transcricao_${conversationId}.txt`
      link.setAttribute('download', name)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Transcrição baixada!', showConfirmButton: false, timer: 3000 })
    } catch {
      Swal.fire('Erro', 'Não foi possível gerar a transcrição.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="vs-ConversationMoreOptionsDropdown" style={{ display: 'contents' }}>
      <div className="more-options-wrapper" ref={ref}>
        <button className="icon-btn" onClick={e => { e.stopPropagation(); setIsOpen(o => !o) }} disabled={isLoading}>
          {isLoading ? <Loader2 className="icon spinning" /> : <MoreVertical className="icon" />}
        </button>
        {isOpen && (
          <div className="dropdown-menu">
            {contactStatus !== 'blocked'
              ? <button className="dropdown-item danger" onClick={blockContact}><VolumeX className="icon-sm" /><span>Bloquear Contato</span></button>
              : <button className="dropdown-item success" onClick={unblockContact}><VolumeX className="icon-sm" /><span>Desbloquear Contato</span></button>}
            <div className="dropdown-divider"></div>
            <button className="dropdown-item" onClick={downloadTranscript}><Share className="icon-sm" /><span>Baixar Transcrição</span></button>
          </div>
        )}
      </div>
    </div>
  )
}

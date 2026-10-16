import { useState } from 'react'
import Swal from 'sweetalert2'
import { MoreVertical, VolumeX, Volume2, Share, Loader2 } from 'lucide-react'
import api from '../api'
import { useClickOutside } from '../lib/hooks'
import { Dropdown, MenuItem } from './ui'

// Bloquear/desbloquear contato e baixar transcrição (lógica da Clara v1)
export default function ConversationMoreOptionsDropdown({ conversationId, contactId, contactStatus = 'active', onContactBlocked, onContactUnblocked }: {
  conversationId: number; contactId: number; contactStatus?: string | null; onContactBlocked: () => void; onContactUnblocked: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen)
  const toast = (icon: 'success' | 'error', title: string) => Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 3000 })

  const blockContact = async () => {
    setIsOpen(false)
    const r = await Swal.fire({ title: 'Bloquear contato?', html: 'O contato não poderá mais enviar mensagens e a IA será pausada permanentemente para ele.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, bloquear', cancelButtonText: 'Cancelar', confirmButtonColor: '#B42318' })
    if (!r.isConfirmed) return
    setIsLoading(true)
    try { await api.patch(`/contacts/${contactId}/block`); onContactBlocked(); toast('success', 'Contato bloqueado') }
    catch { toast('error', 'Não foi possível bloquear o contato.') }
    finally { setIsLoading(false) }
  }
  const unblockContact = async () => {
    setIsOpen(false)
    setIsLoading(true)
    try { await api.patch(`/contacts/${contactId}/unblock`); onContactUnblocked(); toast('success', 'Contato desbloqueado') }
    catch { toast('error', 'Não foi possível desbloquear o contato.') }
    finally { setIsLoading(false) }
  }
  const downloadTranscript = async () => {
    setIsOpen(false)
    setIsLoading(true)
    try {
      const response = await api.get(`/conversations/${conversationId}/transcript`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/plain' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', (response.headers['content-disposition'] || '').match(/filename="?([^"]+)"?/)?.[1] || `transcricao_${conversationId}.txt`)
      document.body.appendChild(link); link.click(); link.remove()
      window.URL.revokeObjectURL(url)
      toast('success', 'Transcrição baixada!')
    } catch { toast('error', 'Não foi possível gerar a transcrição.') }
    finally { setIsLoading(false) }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button onClick={e => { e.stopPropagation(); setIsOpen(o => !o) }} disabled={isLoading} title="Mais opções"
        style={{ width: 32, height: 32, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>
        {isLoading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <MoreVertical size={15} />}
      </button>
      <Dropdown open={isOpen}>
        {contactStatus !== 'blocked'
          ? <MenuItem danger onClick={blockContact}><VolumeX size={14} /> Bloquear contato</MenuItem>
          : <MenuItem onClick={unblockContact}><Volume2 size={14} /> Desbloquear contato</MenuItem>}
        <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
        <MenuItem onClick={downloadTranscript}><Share size={14} /> Baixar transcrição</MenuItem>
      </Dropdown>
    </div>
  )
}

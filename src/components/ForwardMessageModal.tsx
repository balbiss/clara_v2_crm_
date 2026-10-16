import { useState } from 'react'
import Swal from 'sweetalert2'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { pickWhatsappInbox } from '../composables/useInboxPicker'
import { telefoneDigitado, useContactSearch, ContactResults } from './NewConversationModal'
import { Modal, btn, inputStyle } from './ui'

// Encaminhar mensagem/anexo pra outra revendedora (o anexo é copiado no backend)
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ForwardMessageModal({ isOpen, message, onClose }: { isOpen: boolean; message: any; onClose: () => void }) {
  const { query, resultados, isSearching, buscar, reset, input } = useContactSearch(isOpen)
  const [isSending, setIsSending] = useState(false)
  if (!isOpen) return null
  const t = message?.attachmentType || ''
  const tipo = t.startsWith('audio/') ? 'áudio' : t.startsWith('image/') ? 'foto' : t.startsWith('video/') ? 'vídeo' : t ? 'arquivo' : 'mensagem'
  // em anexo vindo do WhatsApp o texto é só marcador interno — não vai junto
  const texto = (() => {
    const tx = (message?.text || '').trim()
    if (!message?.attachmentType) return tx
    return tx.startsWith('📎') || tx.startsWith('[Áudio Transcrito]') ? '' : tx
  })()
  const close = () => { reset(); onClose() }
  const encaminhar = async (abrir: (inboxId: any) => Promise<any>, destino: string) => {
    const { inboxId, cancelled } = await pickWhatsappInbox()
    if (cancelled) return
    setIsSending(true)
    try {
      const conv = await abrir(inboxId)
      await api.post(`/conversations/${conv.id}/messages`, { text: texto, forward_message_id: message.id })
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Encaminhado para ${destino}`, showConfirmButton: false, timer: 3000 })
      close()
    } catch (e: any) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || e.response?.data?.error || 'Erro ao encaminhar.', showConfirmButton: false, timer: 3500 })
    } finally { setIsSending(false) }
  }
  const tel = telefoneDigitado(query)
  return (
    <Modal title={`Encaminhar ${tipo}`} subtitle="Sai pelo WhatsApp da caixa escolhida, como se você tivesse enviado." onClose={close}>
      <input ref={input} value={query} onChange={e => buscar(e.target.value)} placeholder="Nome ou telefone…" disabled={isSending} style={inputStyle} />
      {(isSending || isSearching) && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>{isSending ? 'Encaminhando…' : 'Buscando…'}</p>}
      {!isSending && !isSearching && query.trim() && resultados.length === 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
          Nenhuma revendedora encontrada.
          {tel && <button onClick={() => encaminhar(id => conversationsStore.startConversationWithPhone(query.replace(/\D/g, ''), id), tel)} style={btn('primary', { display: 'flex', width: '100%', marginTop: 10 })}>Encaminhar para {tel}</button>}
        </div>
      )}
      {resultados.length > 0 && <ContactResults resultados={resultados} disabled={isSending} onPick={c => encaminhar(id => conversationsStore.startConversation(c.id, id), c.name || c.phone)} />}
    </Modal>
  )
}

import { useEffect, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { Search } from 'lucide-react'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { pickWhatsappInbox } from '../composables/useInboxPicker'
import { telefoneDigitado } from './NewConversationModal'
import '../styles/vue/ForwardMessageModal.scss'

// Porte de components/ForwardMessageModal.vue — o anexo é copiado no backend (forward_message_id)
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ForwardMessageModal({ isOpen, message, onClose }: { isOpen: boolean; message: any; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const buscaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) { setQuery(''); setResultados([]); setTimeout(() => searchInput.current?.focus()) }
  }, [isOpen])

  const t = message?.attachmentType || ''
  const tipoLabel = t.startsWith('audio/') ? 'áudio' : t.startsWith('image/') ? 'foto' : t.startsWith('video/') ? 'vídeo' : t ? 'arquivo' : 'mensagem'
  // em anexo vindo do WhatsApp o text é só marcador interno — não manda isso junto
  const textoEncaminhado = (() => {
    if (!message) return ''
    const text = (message.text || '').trim()
    if (!message.attachmentType) return text
    if (text.startsWith('📎') || text.startsWith('[Áudio Transcrito]')) return ''
    return text
  })()

  const buscarContato = (q: string) => {
    setQuery(q)
    if (buscaTimeout.current) clearTimeout(buscaTimeout.current)
    if (!q.trim()) { setResultados([]); return }
    buscaTimeout.current = setTimeout(async () => {
      setIsSearching(true)
      try { setResultados((await api.get('/contacts', { params: { q, per_page: 8 } })).data) }
      catch (e) { console.error('Erro ao buscar revendedora:', e) }
      finally { setIsSearching(false) }
    }, 300)
  }

  const close = () => {
    if (buscaTimeout.current) clearTimeout(buscaTimeout.current)
    setQuery('')
    setResultados([])
    onClose()
  }

  const encaminhar = async (abrirConversa: (inboxId: any) => Promise<any>, destino: string) => {
    const { inboxId, cancelled } = await pickWhatsappInbox()
    if (cancelled) return
    setIsSending(true)
    try {
      const conv = await abrirConversa(inboxId)
      await api.post(`/conversations/${conv.id}/messages`, { text: textoEncaminhado, forward_message_id: message.id })
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Encaminhado para ${destino}`, showConfirmButton: false, timer: 3000 })
      close()
    } catch (e: any) {
      console.error('Erro ao encaminhar:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || e.response?.data?.error || 'Erro ao encaminhar.', showConfirmButton: false, timer: 3500 })
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null
  const tel = telefoneDigitado(query)
  return (
    <div className="vs-ForwardMessageModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Encaminhar {tipoLabel}</h2>
            <button className="close-btn" onClick={close}>&times;</button>
          </div>
          <div className="modal-body">
            <p className="description">Busque a revendedora pelo nome ou telefone. A mensagem sai pelo WhatsApp da caixa escolhida, como se você tivesse enviado.</p>
            <div className="form-group">
              <div className="contact-search">
                <Search className="icon-xs search-icon" />
                <input ref={searchInput} value={query} onChange={e => buscarContato(e.target.value)} type="text" placeholder="Buscar por nome ou telefone..." disabled={isSending} />
              </div>
              {isSending ? <div className="search-status">Encaminhando...</div>
                : isSearching ? <div className="search-status">Buscando...</div>
                  : query.trim() && resultados.length === 0 ? (
                    <div className="search-status">
                      Nenhuma revendedora encontrada.
                      {tel && <button type="button" className="btn-novo-numero" onClick={() => encaminhar(inboxId => conversationsStore.startConversationWithPhone(query.replace(/\D/g, ''), inboxId), tel)}>Encaminhar para {tel}</button>}
                    </div>
                  ) : null}
              {resultados.length > 0 && (
                <div className="contact-results">
                  {resultados.map(c => (
                    <button key={c.id} type="button" className="contact-result-item" disabled={isSending} onClick={() => encaminhar(inboxId => conversationsStore.startConversation(c.id, inboxId), c.name || c.phone)}>
                      <span className="contact-result-name">{c.name || 'Sem nome'}</span>
                      <span className="contact-result-phone">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

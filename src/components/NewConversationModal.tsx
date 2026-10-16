import { useEffect, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { Search } from 'lucide-react'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { pickWhatsappInbox } from '../composables/useInboxPicker'
import '../styles/vue/NewConversationModal.scss'

// Porte de components/NewConversationModal.vue
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Telefone com DDD (10-11 dígitos) ou com 55 (12-13) — permite abrir conversa com número novo. */
export function telefoneDigitado(query: string) {
  if (/[a-zA-ZÀ-ÿ]/.test(query)) return null
  const digitos = query.replace(/\D/g, '')
  if (digitos.length < 10 || digitos.length > 13) return null
  const local = digitos.length >= 12 ? digitos.slice(2) : digitos
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`
}

export default function NewConversationModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (c: any) => void }) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const buscaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) { setQuery(''); setResultados([]); setTimeout(() => searchInput.current?.focus()) }
  }, [isOpen])

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

  const iniciar = async (criarConversa: (inboxId: any) => Promise<any>) => {
    const { inboxId, cancelled } = await pickWhatsappInbox()
    if (cancelled) return
    setIsStarting(true)
    try {
      const conv = await criarConversa(inboxId)
      onCreated(conv)
      close()
    } catch (e: any) {
      console.error('Erro ao iniciar conversa:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || 'Erro ao iniciar conversa.', showConfirmButton: false, timer: 3500 })
    } finally {
      setIsStarting(false)
    }
  }

  if (!isOpen) return null
  const tel = telefoneDigitado(query)
  return (
    <div className="vs-NewConversationModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Nova Conversa</h2>
            <button className="close-btn" onClick={close}>&times;</button>
          </div>
          <div className="modal-body">
            <p className="description">Busque a revendedora pelo nome ou telefone pra abrir uma conversa nova com ela.</p>
            <div className="form-group">
              <div className="contact-search">
                <Search className="icon-xs search-icon" />
                <input ref={searchInput} value={query} onChange={e => buscarContato(e.target.value)} type="text" placeholder="Buscar por nome ou telefone..." disabled={isStarting} />
              </div>
              {isSearching ? (
                <div className="search-status">Buscando...</div>
              ) : query.trim() && resultados.length === 0 ? (
                <div className="search-status">
                  Nenhuma revendedora encontrada.
                  {tel
                    ? <button type="button" className="btn-novo-numero" disabled={isStarting} onClick={() => iniciar(inboxId => conversationsStore.startConversationWithPhone(query.replace(/\D/g, ''), inboxId))}>Iniciar conversa com {tel}</button>
                    : <span className="search-hint">Pra falar com alguém que ainda não está no CRM, digite o telefone com DDD.</span>}
                </div>
              ) : null}
              {resultados.length > 0 && (
                <div className="contact-results">
                  {resultados.map(c => (
                    <button key={c.id} type="button" className="contact-result-item" disabled={isStarting} onClick={() => iniciar(inboxId => conversationsStore.startConversation(c.id, inboxId))}>
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

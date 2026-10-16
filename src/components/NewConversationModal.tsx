import { useEffect, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { pickWhatsappInbox } from '../composables/useInboxPicker'
import { Modal, btn, inputStyle } from './ui'
import { ChatAvatar } from './ChatAvatar'

// Nova conversa: revendedora existente ou número novo (lógica da Clara v1)
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Telefone com DDD (10-11 dígitos) ou com 55 (12-13) — permite abrir conversa com número novo. */
export function telefoneDigitado(query: string) {
  if (/[a-zA-ZÀ-ÿ]/.test(query)) return null
  const d = query.replace(/\D/g, '')
  if (d.length < 10 || d.length > 13) return null
  const local = d.length >= 12 ? d.slice(2) : d
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`
}

/** Busca de revendedora com debounce (compartilhada com o Encaminhar). */
export function useContactSearch(isOpen: boolean) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isOpen) { setQuery(''); setResultados([]); setTimeout(() => input.current?.focus()) } }, [isOpen])
  const buscar = (q: string) => {
    setQuery(q)
    if (timer.current) clearTimeout(timer.current)
    if (!q.trim()) { setResultados([]); return }
    timer.current = setTimeout(async () => {
      setIsSearching(true)
      try { setResultados((await api.get('/contacts', { params: { q, per_page: 8 } })).data) }
      catch (e) { console.error('Erro ao buscar revendedora:', e) }
      finally { setIsSearching(false) }
    }, 300)
  }
  const reset = () => { if (timer.current) clearTimeout(timer.current); setQuery(''); setResultados([]) }
  return { query, resultados, isSearching, buscar, reset, input }
}

export function ContactResults({ resultados, disabled, onPick }: { resultados: any[]; disabled?: boolean; onPick: (c: any) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
      {resultados.map(c => (
        <button key={c.id} disabled={disabled} onClick={() => onPick(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--line)', background: 'var(--card)', textAlign: 'left' }}>
          <ChatAvatar nome={c.name || ''} foto={c.avatar_url} size={30} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{c.name || 'Sem nome'}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{c.phone}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default function NewConversationModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (c: any) => void }) {
  const { query, resultados, isSearching, buscar, reset, input } = useContactSearch(isOpen)
  const [isStarting, setIsStarting] = useState(false)
  if (!isOpen) return null
  const close = () => { reset(); onClose() }
  const iniciar = async (criar: (inboxId: any) => Promise<any>) => {
    const { inboxId, cancelled } = await pickWhatsappInbox()
    if (cancelled) return
    setIsStarting(true)
    try { onCreated(await criar(inboxId)); close() }
    catch (e: any) { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || 'Erro ao iniciar conversa.', showConfirmButton: false, timer: 3500 }) }
    finally { setIsStarting(false) }
  }
  const tel = telefoneDigitado(query)
  return (
    <Modal title="Nova conversa" subtitle="Busque a revendedora pelo nome ou telefone — ou digite um número novo com DDD." onClose={close}>
      <input ref={input} value={query} onChange={e => buscar(e.target.value)} placeholder="Nome ou telefone…" disabled={isStarting} style={inputStyle} />
      {isSearching && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>Buscando…</p>}
      {!isSearching && query.trim() && resultados.length === 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
          Nenhuma revendedora encontrada.
          {tel
            ? <button disabled={isStarting} onClick={() => iniciar(id => conversationsStore.startConversationWithPhone(query.replace(/\D/g, ''), id))} style={btn('primary', { display: 'flex', width: '100%', marginTop: 10 })}>Iniciar conversa com {tel}</button>
            : <span style={{ display: 'block', marginTop: 4 }}>Pra falar com alguém que ainda não está no CRM, digite o telefone com DDD.</span>}
        </div>
      )}
      {resultados.length > 0 && <ContactResults resultados={resultados} disabled={isStarting} onPick={c => iniciar(id => conversationsStore.startConversation(c.id, id))} />}
    </Modal>
  )
}

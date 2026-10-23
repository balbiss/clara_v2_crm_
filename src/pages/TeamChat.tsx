import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSnapshot } from 'valtio'
import { ChevronLeft, FileText, Mic, Paperclip, Search, Send, Square, X } from 'lucide-react'
import api from '../api'
import { internalChatStore } from '../store/internalChat'
import { toast } from '../components/ui2'
import { K } from '../lib/kommo'
import { prepareImage } from '../utils/prepareImage'

// Chat da Equipe: mensagens internas entre consultora, gerência, financeiro e diretoria (não tem
// nada a ver com o WhatsApp das revendedoras). Lista de colegas à esquerda, conversa à direita,
// texto, foto, documento e áudio gravado na hora. Tempo real pelo socket (store/internalChat).
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROSA = '#c8506a', VINHO = '#8e2a46', ROSA_CLARO = '#f0d0d7'
const PERFIL: Record<string, string> = { consultor: 'Consultora', gerente: 'Gerência', diretoria: 'Diretoria', financeiro: 'Financeiro' }
const nomeDe = (t: any) => `${t?.first_name || ''} ${t?.last_name || ''}`.trim() || 'Colega'
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const horaOuDia = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso), hoje = new Date()
  return d.toDateString() === hoje.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

function Avatar({ t, size = 40 }: { t: any; size?: number }) {
  const n = nomeDe(t)
  return t?.avatar_url
    ? <img src={t.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', background: ROSA_CLARO, color: VINHO, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.36, flex: 'none' }}>{iniciais(n)}</span>
}

export default function TeamChat() {
  const snap = useSnapshot(internalChatStore) as any
  const [busca, setBusca] = useState('')
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [mobileChat, setMobileChat] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const fim = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const me = snap.currentUser?.id

  useEffect(() => { internalChatStore.fetchThreads(); internalChatStore.setupWebSocket() }, [])
  // rede de segurança do tempo real: se um evento se perder (reconexão do socket), a cada 15 s
  // confere a lista e a conversa aberta com o servidor, sem mostrar "Carregando…"
  useEffect(() => {
    const t = setInterval(async () => {
      const id = internalChatStore.activeUserId
      await internalChatStore.fetchThreads()
      if (id) {
        try {
          const { data } = await api.get('/internal_messages', { params: { with: id } })
          if (internalChatStore.activeUserId === id && data.length !== (internalChatStore.messagesByUser[id] || []).length) internalChatStore.messagesByUser[id] = data
          const th = (internalChatStore.threads as any[]).find(x => x.id === id); if (th) th.unread_count = 0
        } catch { /* tenta de novo no próximo ciclo */ }
      }
    }, 15000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [snap.activeMessages.length, snap.activeUserId])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (snap.threads as any[]).filter(t => !q || nomeDe(t).toLowerCase().includes(q))
  }, [snap.threads, busca])
  const ativo = snap.activeThread

  const abrir = async (id: number) => { setTexto(''); setArquivo(null); setMobileChat(true); await internalChatStore.openThread(id) }
  const enviar = async (file: File | Blob | null = arquivo) => {
    if (enviando || (!texto.trim() && !file)) return
    setEnviando(true)
    try {
      let f = file as any
      if (f && f.type?.startsWith('image/') && f instanceof File) f = await prepareImage(f).catch(() => f)
      await internalChatStore.sendMessage(texto, f)
      setTexto(''); setArquivo(null)
    } catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível enviar.') } finally { setEnviando(false) }
  }
  const gravar = async () => {
    if (gravando) { rec.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      pedacos.current = []
      r.ondataavailable = e => { if (e.data.size) pedacos.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); setGravando(false)
        const blob = new Blob(pedacos.current, { type: r.mimeType || 'audio/webm' })
        if (blob.size) void enviar(new File([blob], 'audio.webm', { type: blob.type }))
      }
      rec.current = r; r.start(); setGravando(true)
    } catch { toast('error', 'Não foi possível usar o microfone. Libere o acesso no navegador.') }
  }

  const bolha = (m: any) => {
    const meu = m.sender_id === me
    const st: CSSProperties = { maxWidth: '72%', padding: '8px 12px', borderRadius: 10, fontSize: 14.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: meu ? ROSA_CLARO : '#fff', color: meu ? '#4a2430' : K.text, border: meu ? 'none' : `1px solid ${K.line}` }
    const tipo = m.attachment_type || ''
    return (
      <div key={m.id} data-testid="msg-equipe" style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
        <div style={st}>
          {m.attachment_url && (tipo.startsWith('image/')
            ? <a href={m.attachment_url} target="_blank" rel="noreferrer"><img src={m.attachment_url} alt="Foto" style={{ display: 'block', maxWidth: 260, maxHeight: 300, borderRadius: 6, marginBottom: m.text ? 6 : 0 }} /></a>
            : tipo.startsWith('audio/') ? <audio src={m.attachment_url} controls style={{ maxWidth: 240, height: 36, display: 'block', marginBottom: m.text ? 6 : 0 }} />
            : <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit', marginBottom: m.text ? 6 : 0 }}><FileText size={16} /> {m.attachment_name || 'Documento'}</a>)}
          {m.text && <span>{m.text}</span>}
          <div style={{ fontSize: 11.5, color: meu ? '#85525f' : K.muted, textAlign: 'right', marginTop: 3 }}>
            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{meu ? (m.read_at ? ' · lida' : ' · enviada') : ''}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`k-fullbleed k-teamchat${mobileChat ? ' k-teamchat-chat' : ''}`} style={{ margin: -24, height: 'calc(100vh - var(--top-h, 0px))', display: 'flex', background: K.bg, fontFamily: K.font, color: K.text, minHeight: 0 }}>
      <aside className="k-teamchat-lista" style={{ width: 320, flex: 'none', background: '#fff', borderRight: `1px solid ${K.line}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${K.line}` }}>
          <b style={{ fontSize: 16, letterSpacing: '.03em', textTransform: 'uppercase' }}>Chat da Equipe</b>
          <div style={{ position: 'relative', marginTop: 10 }}>
            <Search size={15} color={K.muted} style={{ position: 'absolute', left: 10, top: 10 }} />
            <input aria-label="Buscar colega" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colega" style={{ width: '100%', height: 34, padding: '0 10px 0 32px', border: `1px solid ${K.lineDark}`, borderRadius: 17, fontFamily: K.font, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {lista.map(t => (
            <button key={t.id} data-testid="colega" onClick={() => abrir(t.id)} aria-current={snap.activeUserId === t.id}
              style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${K.line}`, background: snap.activeUserId === t.id ? '#fbe9ee' : '#fff', cursor: 'pointer', fontFamily: K.font, textAlign: 'left' }}>
              <Avatar t={t} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14.5, color: K.text }}>{nomeDe(t)}</b>
                  <span style={{ fontSize: 12, color: K.muted, flex: 'none' }}>{horaOuDia(t.last_message_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: K.muted }}>{t.last_message || PERFIL[t.role] || ''}</span>
                  {t.unread_count > 0 && <span style={{ flex: 'none', minWidth: 20, height: 20, borderRadius: 10, background: ROSA, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{t.unread_count}</span>}
                </div>
              </div>
            </button>
          ))}
          {!snap.isLoadingThreads && !lista.length && <div style={{ padding: 20, color: K.muted, fontSize: 14 }}>Nenhum colega encontrado.</div>}
        </div>
      </aside>

      <section className="k-teamchat-conversa" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!ativo ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: K.muted, fontSize: 15, padding: 20, textAlign: 'center' }}>Escolha um colega na lista pra conversar.</div>
        ) : (<>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${K.line}`, minHeight: 56 }}>
            <button className="k-teamchat-voltar" title="Voltar" onClick={() => setMobileChat(false)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', display: 'none' }}><ChevronLeft size={20} /></button>
            <Avatar t={ativo} size={36} />
            <div><b style={{ fontSize: 15 }}>{nomeDe(ativo)}</b><div style={{ fontSize: 12.5, color: K.muted }}>{PERFIL[ativo.role] || ''}</div></div>
          </header>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', minHeight: 0 }}>
            {snap.isLoadingMessages && <div style={{ color: K.muted, fontSize: 13 }}>Carregando…</div>}
            {!snap.isLoadingMessages && !snap.activeMessages.length && <div style={{ color: K.muted, fontSize: 14, textAlign: 'center', marginTop: 30 }}>Nenhuma mensagem ainda. Diga oi!</div>}
            {(snap.activeMessages as any[]).map((m, i, arr) => {
              const novoDia = i === 0 || new Date(arr[i - 1].created_at).toDateString() !== new Date(m.created_at).toDateString()
              return <div key={m.id}>{novoDia && <div style={{ textAlign: 'center', fontSize: 12.5, color: K.muted, margin: '12px 0 6px', textTransform: 'capitalize' }}>{diaDe(m.created_at)}</div>}{bolha(m)}</div>
            })}
            <div ref={fim} />
          </div>
          <div style={{ background: '#fff', borderTop: `1px solid ${K.line}`, padding: '10px 14px' }}>
            {arquivo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 8, background: '#fcf0f3', padding: '6px 10px', borderRadius: 6 }}>
                <FileText size={15} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arquivo.name}</span>
                <button title="Tirar anexo" onClick={() => setArquivo(null)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={15} /></button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <input ref={fileInput} type="file" hidden onChange={e => { setArquivo(e.target.files?.[0] || null); e.target.value = '' }} />
              <button title="Anexar foto ou documento" onClick={() => fileInput.current?.click()} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', padding: 6 }}><Paperclip size={19} /></button>
              <textarea aria-label="Mensagem para a equipe" value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder={gravando ? 'Gravando áudio… clique no quadrado pra enviar' : 'Escreva uma mensagem'}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
                style={{ flex: 1, resize: 'none', maxHeight: 120, minHeight: 38, padding: '8px 12px', border: `1px solid ${K.lineDark}`, borderRadius: 19, fontFamily: K.font, fontSize: 14.5, boxSizing: 'border-box' }} />
              <button title={gravando ? 'Parar e enviar áudio' : 'Gravar áudio'} onClick={gravar} style={{ border: 'none', background: gravando ? '#fdecea' : 'none', borderRadius: '50%', color: gravando ? '#c0392b' : K.muted, cursor: 'pointer', padding: 8 }}>{gravando ? <Square size={17} /> : <Mic size={19} />}</button>
              <button title="Enviar" onClick={() => enviar()} disabled={enviando || (!texto.trim() && !arquivo)} style={{ height: 38, width: 38, borderRadius: '50%', border: 'none', background: (!texto.trim() && !arquivo) ? '#e9c1cb' : ROSA, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Send size={16} /></button>
            </div>
          </div>
        </>)}
      </section>
    </div>
  )
}

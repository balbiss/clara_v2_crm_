import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { AtSign, BellOff, Bell, ChevronLeft, ChevronRight, FileText, Mic, MoreHorizontal, Paperclip, Search, Send, Settings, Square, Star, Users, X } from 'lucide-react'
import { internalChatStore } from '../store/internalChat'
import { toast, confirmBox } from '../components/ui2'
import { K, kBtn, kInput } from '../lib/kommo'
import { useClickOutside } from '../lib/hooks'
import { prepareImage } from '../utils/prepareImage'

// "Chats da equipe" no layout do Kommo (Comunicações › Chats da equipe): lista de tópicos com busca,
// chip de filtro (Todos / Não lidos / Hoje / Destaque / período) e menu "…" (Criar um grupo, Ações
// múltiplas, Ordenar, Silenciar notificações). Tópico = conversa particular, grupo ou menção
// (colega marcado numa conversa com cliente, com "@" no avatar e atalho pra conversa do cliente).
// À direita: "Selecione um tópico para começar a enviar mensagens" ou a conversa aberta.
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROSA = '#c8506a', VINHO = '#8e2a46', ROSA_CLARO = '#f0d0d7'
const PERFIL: Record<string, string> = { consultor: 'Consultora', gerente: 'Gerência', diretoria: 'Diretoria', financeiro: 'Financeiro' }
const FILTROS: [string, string][] = [['all', 'Todos'], ['unread', 'Não lidos'], ['today', 'Hoje'], ['starred', 'Destaque']]
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'
const dataHora = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : ''
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const isoDia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const SOM_KEY = 'k-teamchat-silenciado'

function Avatar({ c, size = 44 }: { c: any; size?: number }) {
  const badge = c.kind === 'group' ? <Users size={11} /> : c.kind === 'mention' ? <AtSign size={11} /> : null
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      {c.avatar_url
        ? <img src={c.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
        : <span style={{ width: size, height: size, borderRadius: '50%', background: ROSA_CLARO, color: VINHO, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.34 }}>{c.kind === 'group' ? <Users size={size * 0.42} /> : iniciais(c.name || '')}</span>}
      {badge && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `1px solid ${K.lineDark}`, color: K.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>}
    </span>
  )
}

function Modal({ title, onClose, children, width = 460 }: any) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 4, padding: '22px 24px', fontFamily: K.font, color: K.text, position: 'relative' }}>
        <button title="Fechar" onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={18} /></button>
        <h2 style={{ margin: '0 0 14px', fontSize: 19, fontWeight: 400 }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** Escolher colegas (criar grupo / adicionar ao grupo). */
function EscolherColegas({ colegas, sel, setSel }: { colegas: any[]; sel: number[]; setSel: (v: number[]) => void }) {
  const [q, setQ] = useState('')
  const lista = colegas.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <input aria-label="Buscar colega no grupo" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar colega" style={{ ...kInput, marginBottom: 8 }} />
      <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${K.line}`, borderRadius: 3 }}>
        {lista.map(c => (
          <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', borderBottom: `1px solid ${K.line}`, cursor: 'pointer', fontSize: 14.5 }}>
            <input type="checkbox" checked={sel.includes(c.id)} onChange={e => setSel(e.target.checked ? [...sel, c.id] : sel.filter(x => x !== c.id))} />
            {c.name}<span style={{ color: K.muted, fontSize: 12.5 }}>{PERFIL[c.role] || ''}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function TeamChat() {
  const navigate = useNavigate()
  const snap = useSnapshot(internalChatStore) as any
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [mobileChat, setMobileChat] = useState(false)
  const [filtroAberto, setFiltroAberto] = useState(false)
  const [menu, setMenu] = useState(false)
  const [ordenar, setOrdenar] = useState(false)
  const [multi, setMulti] = useState(false)
  const [sel, setSel] = useState<number[]>([])
  const [novoGrupo, setNovoGrupo] = useState(false)
  const [config, setConfig] = useState(false)
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [membrosSel, setMembrosSel] = useState<number[]>([])
  const [semSom, setSemSom] = useState(() => { try { return localStorage.getItem(SOM_KEY) === '1' } catch { return false } })
  const rec = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const fim = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const filtroRef = useClickOutside<HTMLDivElement>(() => setFiltroAberto(false), filtroAberto)
  const menuRef = useClickOutside<HTMLDivElement>(() => { setMenu(false); setOrdenar(false) }, menu)
  const me = snap.currentUser?.id

  useEffect(() => { internalChatStore.fetchThreads(); internalChatStore.setupWebSocket() }, [])
  // rede de segurança do tempo real: confere com o servidor a cada 15 s
  useEffect(() => { const t = setInterval(() => { internalChatStore.fetchThreads(); internalChatStore.refreshActive().catch(() => {}) }, 15000); return () => clearInterval(t) }, [])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [snap.activeMessages.length, snap.activeChatId])
  useEffect(() => { const t = setTimeout(() => internalChatStore.fetchThreads(), 300); return () => clearTimeout(t) }, [snap.q, snap.filter, snap.sort, snap.from, snap.to])
  // notificações silenciadas pelo menu "…" (vale pra este navegador)
  useEffect(() => { const orig = internalChatStore.notify; internalChatStore.notify = (c: any, m: any) => { if (!semSom) orig.call(internalChatStore, c, m) }; return () => { internalChatStore.notify = orig } }, [semSom])

  const colegas = useMemo(() => (snap.chats as any[]).filter(c => c.kind === 'direct' && c.other_user_id).map(c => ({ id: c.other_user_id, name: c.name, role: c.role })), [snap.chats])
  const ativo = snap.activeChat
  const filtroLabel = snap.from || snap.to ? 'Período' : FILTROS.find(f => f[0] === snap.filter)?.[1] || 'Todos'

  const abrir = async (c: any) => {
    if (multi) { if (c.id) setSel(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id]); return }
    setTexto(''); setArquivo(null); setMobileChat(true)
    try { await internalChatStore.open(c) } catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível abrir.') }
  }
  const enviar = async (file: File | Blob | null = arquivo) => {
    if (enviando || (!texto.trim() && !file)) return
    setEnviando(true)
    try {
      let f: any = file
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
      r.onstop = () => { stream.getTracks().forEach(t => t.stop()); setGravando(false); const blob = new Blob(pedacos.current, { type: r.mimeType || 'audio/webm' }); if (blob.size) void enviar(new File([blob], 'audio.webm', { type: blob.type })) }
      rec.current = r; r.start(); setGravando(true)
    } catch { toast('error', 'Não foi possível usar o microfone. Libere o acesso no navegador.') }
  }
  const periodo = (dias: number | null) => {
    if (dias === null) { internalChatStore.from = ''; internalChatStore.to = '' } else { internalChatStore.from = isoDia(new Date(Date.now() - dias * 86400e3)); internalChatStore.to = isoDia(new Date()) }
    internalChatStore.filter = 'all'; setFiltroAberto(false)
  }
  const criarGrupo = async () => {
    try { const g = await internalChatStore.createGroup(nomeGrupo, membrosSel); setNovoGrupo(false); setNomeGrupo(''); setMembrosSel([]); await abrir(g) }
    catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível criar o grupo.') }
  }
  const acaoMultipla = async (acao: string) => {
    if (!sel.length) return
    await internalChatStore.bulk(sel, acao); setSel([]); setMulti(false)
    toast('success', 'Pronto.')
  }

  const item = (c: any) => {
    const marcado = !!c.id && sel.includes(c.id)
    const lm = c.last_message
    const quem = lm ? (lm.kind === 'system' ? '' : lm.sender_id === me ? 'Você: ' : c.kind !== 'direct' && lm.sender_name ? `${lm.sender_name}: ` : '') : ''
    return (
      <button key={c.id ?? `u${c.other_user_id}`} data-testid="topico" onClick={() => abrir(c)} aria-current={!!c.id && snap.activeChatId === c.id}
        style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${K.line}`, background: marcado || (!!c.id && snap.activeChatId === c.id) ? '#fbe9ee' : '#fff', cursor: 'pointer', fontFamily: K.font, textAlign: 'left' }}>
        {multi && <input type="checkbox" readOnly checked={marcado} disabled={!c.id} style={{ marginTop: 14 }} />}
        <Avatar c={c} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14.5, color: K.text }}>{c.name}</b>
            {c.starred && <Star size={13} fill="#f0a33a" color="#f0a33a" style={{ flex: 'none' }} />}
            {c.muted && <BellOff size={13} color={K.muted} style={{ flex: 'none' }} />}
            <span style={{ fontSize: 12, color: K.muted, flex: 'none' }}>{dataHora(lm?.created_at)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 2 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: K.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lm ? `${quem}${lm.text}` : PERFIL[c.role] || ''}</span>
            {c.unread_count > 0 && <span style={{ flex: 'none', minWidth: 20, height: 20, borderRadius: 10, background: c.muted ? '#c3c7cc' : ROSA, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{c.unread_count}</span>}
          </div>
        </div>
      </button>
    )
  }

  const bolha = (m: any, i: number, arr: any[]) => {
    const novoDia = i === 0 || new Date(arr[i - 1].created_at).toDateString() !== new Date(m.created_at).toDateString()
    const dia = novoDia ? <div style={{ textAlign: 'center', fontSize: 12.5, color: K.muted, margin: '12px 0 6px', textTransform: 'capitalize' }}>{diaDe(m.created_at)}</div> : null
    if (m.kind === 'system') return <div key={m.id}>{dia}<div data-testid="msg-sistema" style={{ textAlign: 'center', fontSize: 12.5, color: K.muted, margin: '6px 0' }}>{m.text}</div></div>
    const meu = m.sender_id === me
    const tipo = m.attachment_type || ''
    const mostrarNome = !meu && ativo?.kind !== 'direct' && (i === 0 || arr[i - 1].sender_id !== m.sender_id || novoDia)
    return (
      <div key={m.id}>{dia}
        <div data-testid="msg-equipe" style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start', margin: '3px 0' }}>
          <div style={{ maxWidth: '72%', padding: '8px 12px', borderRadius: 10, fontSize: 14.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: meu ? ROSA_CLARO : '#fff', color: meu ? '#4a2430' : K.text, border: meu ? 'none' : `1px solid ${K.line}` }}>
            {mostrarNome && <div style={{ fontSize: 12.5, fontWeight: 700, color: VINHO, marginBottom: 2 }}>{m.sender_name || 'Colega'}</div>}
            {m.attachment_url && (tipo.startsWith('image/')
              ? <a href={m.attachment_url} target="_blank" rel="noreferrer"><img src={m.attachment_url} alt="Foto" style={{ display: 'block', maxWidth: 260, maxHeight: 300, borderRadius: 6, marginBottom: m.text ? 6 : 0 }} /></a>
              : tipo.startsWith('audio/') ? <audio src={m.attachment_url} controls style={{ maxWidth: 240, height: 36, display: 'block', marginBottom: m.text ? 6 : 0 }} />
              : <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit', marginBottom: m.text ? 6 : 0 }}><FileText size={16} /> {m.attachment_name || 'Documento'}</a>)}
            {m.text && <span>{m.text}</span>}
            <div style={{ fontSize: 11.5, color: meu ? '#85525f' : K.muted, textAlign: 'right', marginTop: 3 }}>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      </div>
    )
  }

  const opcao: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '9px 14px', fontFamily: K.font, fontSize: 14, color: K.text, cursor: 'pointer' }
  const subtitulo = ativo ? (ativo.kind === 'group' ? `Grupo · ${ativo.members.length} participantes` : ativo.kind === 'mention' ? 'Menção · conversa com cliente' : PERFIL[ativo.role] || '') : ''

  return (
    <div className={`k-fullbleed k-teamchat${mobileChat ? ' k-teamchat-chat' : ''}`} style={{ margin: -24, height: 'calc(100vh - var(--top-h, 0px))', display: 'flex', background: K.bg, fontFamily: K.font, color: K.text, minHeight: 0 }}>
      <aside className="k-teamchat-lista" style={{ width: 364, flex: 'none', background: '#fff', borderRight: `1px solid ${K.line}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', minHeight: 64, borderBottom: `1px solid ${K.line}` }}>
          <Search size={17} color={K.muted} />
          <input aria-label="Buscar" value={snap.q} onChange={e => { internalChatStore.q = e.target.value }} placeholder="Buscar" style={{ flex: 1, border: 'none', outline: 'none', fontFamily: K.font, fontSize: 15, background: 'transparent' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: `1px solid ${K.line}`, position: 'relative' }}>
          <div ref={filtroRef} style={{ position: 'relative', flex: 1 }}>
            <button onClick={() => setFiltroAberto(v => !v)} aria-expanded={filtroAberto} style={{ border: '1px solid #b9d98a', background: '#e6f2d2', color: '#4f6b25', borderRadius: 2, padding: '2px 8px', fontFamily: K.font, fontSize: 13.5, cursor: 'pointer' }}>{filtroLabel}</button>
            {filtroAberto && (
              <div role="menu" aria-label="Filtro" style={{ position: 'absolute', top: 28, left: 0, zIndex: 30, width: 230, background: '#fff', border: `1px solid ${K.lineDark}`, borderRadius: 3, boxShadow: '0 6px 18px rgba(0,0,0,.12)', padding: '4px 0' }}>
                {FILTROS.map(([id, l]) => <button key={id} role="menuitem" onClick={() => { internalChatStore.filter = id; internalChatStore.from = ''; internalChatStore.to = ''; setFiltroAberto(false) }} style={{ ...opcao, fontWeight: snap.filter === id && !snap.from ? 700 : 400 }}>{l}</button>)}
                <div style={{ borderTop: `1px solid ${K.line}`, margin: '4px 0' }} />
                <button role="menuitem" onClick={() => periodo(7)} style={opcao}>Última semana</button>
                <button role="menuitem" onClick={() => periodo(30)} style={opcao}>Últimos 30 dias</button>
                <div style={{ display: 'flex', gap: 6, padding: '6px 14px' }}>
                  <input aria-label="De" type="date" value={snap.from} onChange={e => { internalChatStore.from = e.target.value; internalChatStore.filter = 'all' }} style={{ ...kInput, height: 30, fontSize: 12.5 }} />
                  <input aria-label="Até" type="date" value={snap.to} onChange={e => { internalChatStore.to = e.target.value; internalChatStore.filter = 'all' }} style={{ ...kInput, height: 30, fontSize: 12.5 }} />
                </div>
                {(snap.from || snap.to) && <button role="menuitem" onClick={() => periodo(null)} style={{ ...opcao, color: K.link }}>Limpar período</button>}
              </div>
            )}
          </div>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button title="Mais opções" onClick={() => setMenu(v => !v)} style={{ border: 'none', background: 'none', color: K.text, cursor: 'pointer', display: 'flex' }}><MoreHorizontal size={20} /></button>
            {menu && (
              <div role="menu" aria-label="Opções do chat" style={{ position: 'absolute', top: 26, right: 0, zIndex: 30, width: 230, background: '#fff', border: `1px solid ${K.lineDark}`, borderRadius: 3, boxShadow: '0 6px 18px rgba(0,0,0,.12)', padding: '4px 0' }}>
                <button role="menuitem" onClick={() => { const v = !semSom; setSemSom(v); try { localStorage.setItem(SOM_KEY, v ? '1' : '0') } catch { /* */ } setMenu(false) }} style={opcao}>{semSom ? <Bell size={15} /> : <BellOff size={15} />} {semSom ? 'Ativar notificações' : 'Silenciar'}</button>
                <button role="menuitem" onClick={() => { setMulti(true); setSel([]); setMenu(false) }} style={opcao}>Ações múltiplas</button>
                <button role="menuitem" onClick={() => setOrdenar(v => !v)} style={opcao}>Ordenar <ChevronRight size={14} style={{ marginLeft: 'auto' }} /></button>
                {ordenar && [['recent', 'Mais recentes'], ['unread', 'Não lidos primeiro']].map(([id, l]) => <button key={id} role="menuitem" onClick={() => { internalChatStore.sort = id; setMenu(false); setOrdenar(false) }} style={{ ...opcao, paddingLeft: 30, fontWeight: snap.sort === id ? 700 : 400 }}>{snap.sort === id ? '✓ ' : ''}{l}</button>)}
                <button role="menuitem" onClick={() => { internalChatStore.filter = 'starred'; setMenu(false) }} style={opcao}>Destaque</button>
                <button role="menuitem" onClick={() => { setNovoGrupo(true); setMenu(false) }} style={opcao}>Criar um grupo</button>
              </div>
            )}
          </div>
        </div>
        {multi && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', background: '#fcf0f3', borderBottom: `1px solid ${K.line}`, fontSize: 13 }}>
            <b style={{ width: '100%' }}>{sel.length} selecionado(s)</b>
            {[['read', 'Marcar como lido'], ['star', 'Destacar'], ['unstar', 'Tirar destaque'], ['mute', 'Silenciar'], ['unmute', 'Reativar som']].map(([a, l]) => <button key={a} onClick={() => acaoMultipla(a)} disabled={!sel.length} style={kBtn('ghost', { height: 28, padding: '0 10px', fontSize: 12, textTransform: 'none' })}>{l}</button>)}
            <button onClick={() => { setMulti(false); setSel([]) }} style={kBtn('flat', { height: 28, fontSize: 12, textTransform: 'none' })}>Cancelar</button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(snap.chats as any[]).map(item)}
          {!snap.isLoadingThreads && !snap.chats.length && <div style={{ padding: 20, color: K.muted, fontSize: 14 }}>Nenhum tópico encontrado.</div>}
        </div>
      </aside>

      <section className="k-teamchat-conversa" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!ativo ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: K.muted, fontSize: 15, padding: 20, textAlign: 'center' }}>Selecione um tópico para começar a enviar mensagens</div>
        ) : (<>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${K.line}`, minHeight: 64, flexWrap: 'wrap' }}>
            <button className="k-teamchat-voltar" title="Voltar" onClick={() => setMobileChat(false)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', display: 'none' }}><ChevronLeft size={20} /></button>
            <Avatar c={ativo} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 15.5 }}>{ativo.name}</b><div style={{ fontSize: 12.5, color: K.muted }}>{subtitulo}</div></div>
            {ativo.kind === 'mention' && ativo.conversation_id && <button onClick={() => navigate(`/conversas?abrir=${ativo.conversation_id}`)} style={kBtn('ghost', { textTransform: 'none', fontSize: 13 })}>Abrir conversa com o cliente</button>}
            <button title={ativo.starred ? 'Tirar destaque' : 'Destacar'} onClick={() => internalChatStore.setMember(ativo.id, { starred: !ativo.starred })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: ativo.starred ? '#f0a33a' : K.muted, display: 'flex' }}><Star size={18} fill={ativo.starred ? '#f0a33a' : 'none'} /></button>
            <button title={ativo.muted ? 'Reativar notificações' : 'Silenciar conversa'} onClick={() => internalChatStore.setMember(ativo.id, { muted: !ativo.muted })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted, display: 'flex' }}>{ativo.muted ? <BellOff size={18} /> : <Bell size={18} />}</button>
            {ativo.kind === 'group' && <button title="Configurações do grupo" onClick={() => { setNomeGrupo(ativo.name); setMembrosSel(ativo.members.map((m: any) => m.id).filter((id: number) => id !== me)); setConfig(true) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted, display: 'flex' }}><Settings size={18} /></button>}
          </header>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', minHeight: 0 }}>
            {snap.isLoadingMessages && <div style={{ color: K.muted, fontSize: 13 }}>Carregando…</div>}
            {!snap.isLoadingMessages && !snap.activeMessages.length && <div style={{ color: K.muted, fontSize: 14, textAlign: 'center', marginTop: 30 }}>Nenhuma mensagem ainda.</div>}
            {(snap.activeMessages as any[]).map(bolha)}
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

      {novoGrupo && (
        <Modal title="Criar um grupo" onClose={() => setNovoGrupo(false)}>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, color: K.muted, marginBottom: 12 }}>Nome do grupo<input aria-label="Nome do grupo" value={nomeGrupo} onChange={e => setNomeGrupo(e.target.value)} placeholder="Ex.: Time de Vendas 1" style={kInput} /></label>
          <div style={{ fontSize: 14, color: K.muted, marginBottom: 6 }}>Participantes</div>
          <EscolherColegas colegas={colegas} sel={membrosSel} setSel={setMembrosSel} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}><button onClick={() => setNovoGrupo(false)} style={kBtn('flat')}>Cancelar</button><button onClick={criarGrupo} disabled={!nomeGrupo.trim() || !membrosSel.length} style={kBtn('blue')}>Salvar</button></div>
        </Modal>
      )}
      {config && ativo?.kind === 'group' && (
        <Modal title="Configurações do grupo" onClose={() => setConfig(false)}>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, color: K.muted, marginBottom: 12 }}>Nome do grupo<input aria-label="Nome do grupo" value={nomeGrupo} onChange={e => setNomeGrupo(e.target.value)} style={kInput} /></label>
          <div style={{ fontSize: 14, color: K.muted, marginBottom: 6 }}>Participantes</div>
          <EscolherColegas colegas={colegas} sel={membrosSel} setSel={setMembrosSel} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={async () => { if (await confirmBox('Sair do grupo?', 'Você deixa de receber as mensagens dele.')) { await internalChatStore.leave(ativo.id); setConfig(false); setMobileChat(false) } }} style={kBtn('ghost', { color: '#c0392b', textTransform: 'none' })}>Sair do grupo</button>
            <span style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfig(false)} style={kBtn('flat')}>Cancelar</button>
              <button onClick={async () => {
                const atuais = ativo.members.map((m: any) => m.id).filter((id: number) => id !== me)
                try { await internalChatStore.updateGroup(ativo.id, { name: nomeGrupo, add_ids: membrosSel.filter(id => !atuais.includes(id)), remove_ids: atuais.filter((id: number) => !membrosSel.includes(id)) }); setConfig(false); await internalChatStore.refreshActive() }
                catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível salvar.') }
              }} disabled={!nomeGrupo.trim()} style={kBtn('blue')}>Salvar</button>
            </span>
          </div>
        </Modal>
      )}
    </div>
  )
}

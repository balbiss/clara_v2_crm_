import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import { Sparkles, Bell, CalendarDays, ChevronDown, ChevronRight, Copy, LogOut, Palette, Columns3, FileText, HelpCircle, Home, Menu, MessageSquare, PanelLeft, PieChart, Settings, Workflow, X } from 'lucide-react'
import api from '../api'
import { brand } from '../config/brand'
import { usePushNotifications } from '../composables/usePushNotifications'
import { useInstallPrompt } from '../composables/useInstallPrompt'
import { inboxesStore } from '../store/inboxes'
import { contactsStore } from '../store/contacts'
import { agentsStore } from '../store/agents'
import { pipelinesStore } from '../store/pipelines'
import { internalChatStore } from '../store/internalChat'
import { conversationsStore } from '../store/conversations'
import { resetSocket } from '../lib/realtime'
import { useWindowEvent, readUser } from '../lib/hooks'
import { allowed, ROLE_LABEL, ini } from '../lib/nav'
import { kommoNavFor } from '../lib/navKommo'
import { firstSettingsPath } from './SettingsLayout'
import { K } from '../lib/kommo'
import { LogoMark } from './Logo'

// Casca do app no visual do Kommo (menu lateral no rosa da marca da Clara, hsl(347 52% 88%), igual ao login — a equipe já conhece o Kommo),
// com toda a lógica do DashboardLayout da Clara v1: notificações, banners de caixa caída e de
// instalação, foto de perfil, revalidação de dados parados, avisos de lead atribuído/adiamento.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Notif = { id: number; title: string; message: string; link: string; created_at: string; read_at: string | null }
const STALE_AFTER_MS = 5 * 60 * 1000
// menu lateral no rosa da Clara (pedido da cliente: "essa cor e branco"), texto e logo em vinho pra dar leitura, item selecionado em branco
export const CLARA_ROSA = '#f0d0d7' // hsl(347, 52%, 88%) — cor da identidade da Clara
export const CLARA_VINHO = '#5a2433'
const SB_NAVY = { bg: CLARA_ROSA, text: '#4a2430', muted: '#85525f', line: 'rgba(90,36,51,.14)', activeBg: '#ffffff', active: '#8e2a46', icon: '#6d3f4b', iconActive: '#8e2a46', logo: CLARA_VINHO, strong: '#4a2430' }
const SB_LIGHT = { bg: '#ffffff', text: '#313942', muted: '#92989b', line: '#e3e5e8', activeBg: '#e8f0fe', active: '#2d74f0', icon: '#313942', iconActive: '#2d74f0', logo: '#172a39', strong: '#313942' }
type SBPalette = typeof SB_NAVY

/** Logo da Clara (PNG branco usado como máscara) pintada na cor do tema do menu. */
function ClaraLogo({ width, color }: { width: number; color: string }) {
  return <span role="img" aria-label="Clara Ferreira" style={{ display: 'block', width, aspectRatio: '1212 / 444', background: color, WebkitMaskImage: 'url(/logos/clara-ferreira-logo-white.png)', maskImage: 'url(/logos/clara-ferreira-logo-white.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'left center', maskPosition: 'left center' }} />
}
const isStale = (store: { lastFetchedAt: number | null }) => !store.lastFetchedAt || (Date.now() - store.lastFetchedAt) > STALE_AFTER_MS
const groupTitle: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--sideMuted)', margin: '18px 4px 4px' }
const iconBtn: CSSProperties = { width: 34, height: 34, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink)' }
const banner = (bg: string, color: string): CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: bg, color, fontSize: 13, borderBottom: '1px solid var(--line)' })

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const inboxesSnap = useSnapshot(inboxesStore) as any
  const pipelinesSnap = useSnapshot(pipelinesStore) as any
  const chatSnap = useSnapshot(internalChatStore) as any
  const convSnap = useSnapshot(conversationsStore) as any

  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'))
  const [sidebarOpen, setSidebarOpen] = useState(localStorage.getItem('sidebar_collapsed') !== 'true')
  const [menuTheme, setMenuTheme] = useState<'navy' | 'light'>(() => (localStorage.getItem('sidebar_theme') === 'light' ? 'light' : 'navy'))
  const SB: SBPalette = menuTheme === 'light' ? SB_LIGHT : SB_NAVY
  const [subMenu, setSubMenu] = useState<'tema' | 'menu' | null>(null)
  const changeMenuTheme = (v: 'navy' | 'light') => { setMenuTheme(v); localStorage.setItem('sidebar_theme', v); setSubMenu(null); setMenuOpen(false) }
  const [mobileNav, setMobileNav] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const unreadRef = useRef(0)
  unreadRef.current = unreadCount
  const isFirstFetch = useRef(true)
  const [currentUser, setCurrentUser] = useState<Record<string, any>>(() => readUser())
  const [profileOpen, setProfileOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // altura real do topo (cabeçalho + avisos) — a tela de Conversas ocupa só o resto
  const topRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', el.offsetHeight + 'px'))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [iosBanner, setIosBanner] = useState(false)
  const [androidDismissed, setAndroidDismissed] = useState(localStorage.getItem('android_install_banner_dismissed') === 'true')
  const { subscribe: subscribePush } = usePushNotifications()
  const { canInstall, isInstalled, isStandalone, promptInstall } = useInstallPrompt()

  const role = currentUser.role || 'consultor'
  const meNome = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.email || 'Usuário'
  const unreadConversas = convSnap.conversations.reduce((s: number, c: any) => s + (c.unread > 0 ? 1 : 0), 0)
  const disconnected = inboxesSnap.disconnectedInboxes.find((i: any) => !dismissed.has(i.id))
  const disconnectedKey = inboxesSnap.disconnectedInboxes.map((i: any) => i.id).join(',')
  useEffect(() => { // caixa reconectou: volta a avisar se cair de novo
    const ids = disconnectedKey ? disconnectedKey.split(',').map(Number) : []
    setDismissed(prev => { const n = new Set([...prev].filter(id => ids.includes(id))); return n.size === prev.size ? prev : n })
  }, [disconnectedKey])

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark'
    setTheme(t)
    localStorage.setItem('theme', t)
  }
  useEffect(() => { document.documentElement.style.setProperty('--k-panel-left', window.innerWidth <= 900 ? '0px' : sidebarOpen ? '240px' : '68px') }, [sidebarOpen])
  const toggleSidebar = () => {
    setSidebarOpen(o => { localStorage.setItem('sidebar_collapsed', String(o)); return !o })
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications')
      if (!isFirstFetch.current && data.unread_count > unreadRef.current && data.unread[0]) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: data.unread[0].title, text: data.unread[0].message, showConfirmButton: false, timer: 5000, timerProgressBar: true })
      }
      isFirstFetch.current = false
      setNotifications([...data.unread, ...data.read])
      setUnreadCount(data.unread_count)
    } catch (error) {
      console.error('Erro ao buscar notificações', error)
    }
  }, [])

  const markAsRead = async (n: Notif) => {
    if (!n.read_at) {
      try {
        await api.put(`/notifications/${n.id}/mark_as_read`)
        setUnreadCount(c => c - 1)
        setNotifications(l => l.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      } catch { /* ignora */ }
    }
    setNotifOpen(false)
    if (n.link) navigate(n.link)
  }
  const markAllAsRead = async () => {
    if (!unreadCount) return
    try {
      await api.put('/notifications/mark_all_read')
      setNotifications(l => l.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
      setUnreadCount(0)
    } catch (e) { console.error('Erro ao marcar todas como lidas', e) }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  // foto de perfil (cada um troca a própria)
  const persistAvatar = (url: string | null) => {
    const u = { ...currentUser, avatar_url: url }
    setCurrentUser(u)
    localStorage.setItem('user', JSON.stringify(u))
  }
  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return void Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Imagem muito grande (máx. 5MB).', showConfirmButton: false, timer: 3500 })
    const fd = new FormData()
    fd.append('avatar', file)
    setUploading(true)
    try { persistAvatar((await api.patch('/profile/avatar', fd, { headers: { 'Content-Type': undefined } })).data.avatar_url) }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao trocar a foto.', showConfirmButton: false, timer: 3500 }) }
    finally { setUploading(false) }
  }
  const removeAvatar = async () => {
    setUploading(true)
    try { await api.delete('/profile/avatar'); persistAvatar(null) } finally { setUploading(false) }
  }

  useEffect(() => {
    const revalidate = () => {
      if (isStale(inboxesStore)) inboxesStore.fetchInboxes()
      if (isStale(contactsStore)) contactsStore.fetchContacts()
      if (isStale(agentsStore)) agentsStore.fetchAgents()
      if (isStale(pipelinesStore)) pipelinesStore.fetchPipelines()
      if (isStale(conversationsStore)) { resetSocket(); conversationsStore.fetchConversations() }
    }
    let timer: ReturnType<typeof setInterval> | null = setInterval(fetchNotifications, 10000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications()
        if (!timer) timer = setInterval(fetchNotifications, 10000)
        revalidate()
      } else if (timer) { clearInterval(timer); timer = null }
    }
    const standalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    setIosBanner(/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone && localStorage.getItem('ios_install_banner_dismissed') !== 'true')
    subscribePush()
    const onSw = (ev: MessageEvent) => { if (ev.data?.type === 'NAVIGATE') navigate(ev.data.url) }
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onSw)
    if (!inboxesStore.isLoadedOnce) inboxesStore.fetchInboxes()
    if (!contactsStore.isLoadedOnce) contactsStore.fetchContacts()
    if (!agentsStore.isLoadedOnce) agentsStore.fetchAgents()
    if (!pipelinesStore.isLoadedOnce) pipelinesStore.fetchPipelines()
    if (!conversationsStore.lastFetchedAt) conversationsStore.fetchConversations()
    inboxesStore.startStatusPolling()
    internalChatStore.fetchThreads()
    internalChatStore.setupWebSocket()
    fetchNotifications()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', revalidate)
    document.addEventListener('click', revalidate, { capture: true })
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('click', revalidate, { capture: true })
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onSw)
      inboxesStore.stopStatusPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { setMobileNav(false); setMenuOpen(false); setNotifOpen(false) }, [location.pathname])

  useWindowEvent('lead-atribuido', e => {
    const { contact_name, conversation_id, assigned_by } = e.detail
    const origem = assigned_by === 'rodizio' ? 'via rodízio automático' : 'pelo gestor'
    Swal.fire({
      toast: true, position: 'top-end', icon: 'info', title: '📋 Novo lead atribuído a você!',
      html: `<strong>${contact_name}</strong><br><small style="color:#6b7280">${origem}</small>`,
      showConfirmButton: true, confirmButtonText: 'Ver conversa', confirmButtonColor: '#123C87', showCloseButton: true, timer: 12000, timerProgressBar: true,
      didOpen: () => {
        try {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext
          const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
          gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
        } catch { /* sem som */ }
      },
    }).then(r => { if (r.isConfirmed && conversation_id) navigate('/conversas') })
  })
  useWindowEvent('snooze-expired', e => {
    Swal.fire({
      toast: true, position: 'top-end', icon: 'info', title: '⏰ Conversa reativada!',
      html: `<strong>${e.detail.contact_name || 'Revendedora'}</strong><br><small style="color:#6b7280">O tempo de adiamento expirou — conversa reaberta.</small>`,
      showConfirmButton: true, confirmButtonText: 'Ver conversa', confirmButtonColor: '#123C87', showCloseButton: true, timer: 12000, timerProgressBar: true,
    }).then(r => { if (r.isConfirmed) navigate('/conversas') })
  })

  // menu no formato do Kommo (lib/navKommo.ts): grupos com seta que abrem/fecham, badge vermelho,
  // item ativo em azul-claro. Configurações / Ajuda / Notificações ficam no rodapé, igual ao Kommo.
  const nav = kommoNavFor(role, pipelinesSnap.pipelines)
  const badgeFor = (b?: string) => (b === 'conversas' ? unreadConversas : b === 'equipe' ? chatSnap.totalUnread : 0)
  const isActive = (path: string) => location.pathname === path || (path === '/conversas' && location.pathname.startsWith('/conversas')) || (path.startsWith('/pipelines/') && location.pathname.startsWith(path + '/'))
  const groupActive = (g: { path?: string; children?: { path: string }[] }) => (g.path ? isActive(g.path) : (g.children || []).some(c => isActive(c.path)))
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('nav_open_groups') || '{}') } catch { return {} } })
  const toggleGroup = (id: string) => setOpenGroups(o => { const n = { ...o, [id]: !o[id] }; localStorage.setItem('nav_open_groups', JSON.stringify(n)); return n })
  const go = (path: string, e?: React.MouseEvent) => { if (e && (e.ctrlKey || e.metaKey)) window.open(path, '_blank'); else navigate(path) }

  const redBadge = (n: number) => n > 0 && (
    <span style={{ minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9, background: '#e53935', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n > 999 ? '999+' : n}</span>
  )
  const row = (active: boolean, mobile: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: mobile ? '11px 12px' : '8px 12px', border: 'none', borderRadius: 6, flex: 'none',
    background: active ? SB.activeBg : 'transparent', color: active ? SB.active : SB.text, fontFamily: K.font, fontSize: 15, fontWeight: active ? 700 : 400, textAlign: 'left', cursor: 'pointer',
  })
  const navTree = (mobile = false) => nav.map(g => {
    const active = groupActive(g)
    const showText = mobile || sidebarOpen
    if (!g.children) {
      return (
        <button key={g.id} title={g.label} onClick={e => go(g.path!, e)} style={row(active, mobile)}>
          <NavIcon pal={SB} name={g.icon} active={active} />{showText && <span style={{ flex: 1 }}>{g.label}</span>}
        </button>
      )
    }
    const open = openGroups[g.id] ?? active
    const total = g.badge ? badgeFor(g.badge) : 0
    return (
      <div key={g.id}>
        <button title={g.label} onClick={() => { if (!showText) return go(g.children![0].path); toggleGroup(g.id) }} style={row(active && !open, mobile)}>
          <NavIcon pal={SB} name={g.icon} active={active} />
          {showText && <><span style={{ flex: 1, color: active ? SB.active : undefined, fontWeight: active ? 700 : 400 }}>{g.label}</span>{!open && redBadge(total)}<ChevronDown size={16} color={SB.muted} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} /></>}
        </button>
        {showText && open && g.children.map(c => (
          <button key={c.path} onClick={e => go(c.path, e)} style={{ ...row(isActive(c.path), mobile), padding: mobile ? '9px 12px 9px 46px' : '6px 12px 6px 46px', fontSize: 14 }}>
            <span style={{ flex: 1 }}>{c.label}</span>{redBadge(badgeFor(c.badge))}
          </button>
        ))}
      </div>
    )
  })

  const avatar = (size: number) => currentUser.avatar_url
    ? <img src={currentUser.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', background: '#fce4ec', color: '#c2185b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, flex: 'none' }}>{ini(meNome)}</span>

  const notifPanel = notifOpen && (
    <div style={{ position: 'fixed', left: sidebarOpen ? 248 : 76, bottom: 16, width: 340, background: '#fff', border: `1px solid ${K.line}`, borderRadius: 6, boxShadow: '0 8px 30px rgba(0,0,0,.18)', zIndex: 70, overflow: 'hidden', fontFamily: K.font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${K.line}` }}>
        <b style={{ fontSize: 15 }}>Centro de Notificação</b>
        {unreadCount > 0 && <button onClick={markAllAsRead} style={{ border: 'none', background: 'none', fontSize: 13, color: K.link, cursor: 'pointer' }}>Marcar todas como lidas</button>}
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {notifications.map(n => (
          <button key={n.id} onClick={() => markAsRead(n)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 8, padding: '10px 16px', border: 'none', borderBottom: `1px solid ${K.line}`, background: n.read_at ? '#fff' : '#f0f6ff', cursor: 'pointer', fontFamily: K.font }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.read_at ? 'transparent' : K.blue, flex: 'none', marginTop: 6 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: n.read_at ? 400 : 700, color: K.text }}>{n.title}</span>
              {n.message && <span style={{ display: 'block', fontSize: 13, color: K.muted, margin: '2px 0' }}>{n.message}</span>}
              <span style={{ display: 'block', fontSize: 12, color: K.muted }}>{new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
          </button>
        ))}
        {notifications.length === 0 && <p style={{ padding: 16, fontSize: 14, color: K.muted, margin: 0 }}>Nenhuma notificação por aqui.</p>}
      </div>
    </div>
  )

  const footer = (mobile = false) => {
    const showText = mobile || sidebarOpen
    const setActive = location.pathname.startsWith('/settings') || location.pathname.startsWith('/agentes')
    return (
      <div style={{ flex: 'none', borderTop: `1px solid ${SB.line}`, padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button title="Configurações" onClick={e => go(firstSettingsPath(role), e)} style={row(setActive, mobile)}>
          <NavIcon pal={SB} name="settings" active={setActive} />{showText && <span style={{ flex: 1 }}>Configurações</span>}
        </button>
        <button title="Ajuda" onClick={() => go('/manual')} style={row(isActive('/manual'), mobile)}><NavIcon pal={SB} name="help" active={isActive('/manual')} />{showText && <span style={{ flex: 1 }}>Ajuda</span>}</button>
        <button title="Centro de Notificação" onClick={() => { setNotifOpen(o => !o); setMenuOpen(false) }} style={row(notifOpen, mobile)}>
          <span style={{ position: 'relative', display: 'inline-flex' }}><NavIcon pal={SB} name="bell" active={notifOpen} />{!showText && unreadCount > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#e53935' }} />}</span>
          {showText && <><span style={{ flex: 1 }}>Centro de Notificação</span>{redBadge(unreadCount)}</>}
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setMenuOpen(o => !o); setNotifOpen(false) }} style={{ ...row(false, mobile), padding: '10px 8px', marginTop: 4 }}>
            {avatar(34)}
            {showText && (
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ display: 'block', fontSize: 14, color: SB.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meNome} | {ROLE_LABEL[role] || role}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: SB.muted }}>{brand.name}</span>
              </span>
            )}
          </button>
          {menuOpen && (
            <div className="k-user-menu" style={{ position: 'fixed', left: 10, bottom: 74, maxWidth: 'calc(100vw - 20px)', background: '#fff', border: `1px solid ${K.line}`, borderRadius: 6, width: 270, padding: '10px 0', boxShadow: '0 8px 24px rgba(0,0,0,.18)', zIndex: 70, color: K.text, fontFamily: K.font }}>
              <div style={{ padding: '2px 16px 8px' }}>
                <div style={{ fontSize: 15 }}>{meNome}</div>
                <div style={{ fontSize: 13, color: K.muted, display: 'flex', alignItems: 'center', gap: 5 }}>ID do usuário: {currentUser.id}<button title="Copiar ID" onClick={() => { navigator.clipboard?.writeText(String(currentUser.id)) }} style={{ border: 'none', background: 'none', padding: 0, color: K.muted, cursor: 'pointer', display: 'flex' }}><Copy size={12} /></button></div>
              </div>
              <button onClick={() => { setMenuOpen(false); navigate('/settings/perfil') }} style={kMenuItem}><Settings size={16} color={K.muted} /> Configurações de perfil</button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setSubMenu(s => (s === 'tema' ? null : 'tema'))} style={kMenuItem}><Palette size={16} color={K.muted} /><span style={{ flex: 1 }}>Tema</span><ChevronRight size={15} color={K.muted} /></button>
                {subMenu === 'tema' && (
                  <div className="k-submenu" style={kSubMenu}>
                    {([['navy', 'Menu rosa Clara'], ['light', 'Menu claro']] as const).map(([v, l]) => <button key={v} onClick={() => changeMenuTheme(v)} style={{ ...kMenuItem, fontWeight: menuTheme === v ? 700 : 400 }}>{menuTheme === v ? '✓ ' : ''}{l}</button>)}
                  </div>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setSubMenu(s => (s === 'menu' ? null : 'menu'))} style={kMenuItem}><PanelLeft size={16} color={K.muted} /><span style={{ flex: 1 }}>Menu esquerdo</span><ChevronRight size={15} color={K.muted} /></button>
                {subMenu === 'menu' && (
                  <div className="k-submenu" style={kSubMenu}>
                    {([[true, 'Expandido'], [false, 'Recolhido']] as const).map(([v, l]) => <button key={l} onClick={() => { if (sidebarOpen !== v) toggleSidebar(); setSubMenu(null); setMenuOpen(false) }} style={{ ...kMenuItem, fontWeight: sidebarOpen === v ? 700 : 400 }}>{sidebarOpen === v ? '✓ ' : ''}{l}</button>)}
                  </div>
                )}
              </div>
              <button onClick={logout} style={{ ...kMenuItem, color: '#f86161' }}><LogOut size={16} /> Sair</button>
              {role === 'diretoria' && (<>
                <div style={{ height: 1, background: K.line, margin: '8px 0' }} />
                <div style={{ padding: '2px 16px 8px' }}>
                  <div style={{ fontSize: 15 }}>{currentUser.account_name || brand.name}</div>
                  <div style={{ fontSize: 13, color: K.muted, display: 'flex', alignItems: 'center', gap: 5 }}>ID da área de trabalho: {currentUser.account_id}<button title="Copiar ID" onClick={() => { navigator.clipboard?.writeText(String(currentUser.account_id)) }} style={{ border: 'none', background: 'none', padding: 0, color: K.muted, cursor: 'pointer', display: 'flex' }}><Copy size={12} /></button></div>
                </div>
                <button onClick={() => { setMenuOpen(false); navigate('/settings/trabalho') }} style={kMenuItem}><Settings size={16} color={K.muted} /> Configurações de trabalho</button>
              </>)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div data-theme="light" style={{ minHeight: '100vh', background: K.bg, color: K.text, fontFamily: K.font }}>
      <aside className="app-sidebar" style={{ width: sidebarOpen ? 240 : 68, background: SB.bg, color: SB.text, borderRight: 'none', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'fixed', top: 0, left: 0, zIndex: 50, transition: 'width .18s ease' }}>
        <div style={{ flex: 'none', height: 64, padding: '0 14px 0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {sidebarOpen ? <ClaraLogo width={150} color={SB.logo} /> : <b title={brand.name} style={{ color: SB.logo, fontSize: 18, letterSpacing: '.04em', width: '100%', textAlign: 'center' }}>CF</b>}
          {sidebarOpen && <button onClick={toggleSidebar} title="Recolher menu" style={{ border: 'none', background: 'none', color: SB.text, padding: 4, cursor: 'pointer', display: 'flex' }}><PanelLeft size={20} strokeWidth={1.6} /></button>}
        </div>
        {!sidebarOpen && <button onClick={toggleSidebar} title="Abrir menu" style={{ border: 'none', background: 'none', color: SB.text, padding: '0 0 8px', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><PanelLeft size={20} strokeWidth={1.6} /></button>}
        <div style={{ borderTop: `1px solid ${SB.line}`, margin: '0 12px' }} />
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>{navTree()}</nav>
        {footer()}
      </aside>
      {notifPanel}

      <div className="content-col" style={{ marginLeft: sidebarOpen ? 240 : 68, minWidth: 0, display: 'flex', flexDirection: 'column', transition: 'margin-left .18s ease' }}>
        <div ref={topRef} style={{ position: 'sticky', top: 0, zIndex: 30 }}>
          <div className="topbar-mobile" style={{ display: 'none', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderBottom: `1px solid ${K.line}`, paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
            <button className="topbar-hamburger" onClick={() => setMobileNav(true)} aria-label="Abrir menu" style={{ width: 38, height: 38, border: `1px solid ${K.line}`, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: K.text }}><Menu size={19} /></button>
            <LogoMark size={26} /><b style={{ fontSize: 16 }}>{brand.name}</b>
          </div>
          {iosBanner && (
            <div style={banner('#e8f0fe', K.text)}>
              <span style={{ flex: 1 }}>Adicione o {brand.name} à Tela de Início pra receber notificações e usar em tela cheia.</span>
              <button onClick={() => { setIosBanner(false); localStorage.setItem('ios_install_banner_dismissed', 'true') }} style={{ border: 'none', background: 'none', color: K.muted }}><X size={15} /></button>
            </div>
          )}
          {canInstall && !isInstalled && !isStandalone && !androidDismissed && (
            <div style={banner('#e8f0fe', K.text)}>
              <span style={{ flex: 1 }}>Instale o {brand.name} no seu celular pra acesso rápido e notificações.</span>
              <button onClick={promptInstall} style={{ padding: '6px 12px', border: 'none', borderRadius: 3, background: K.blue, color: '#fff', fontSize: 13, fontWeight: 700 }}>Instalar</button>
              <button onClick={() => { setAndroidDismissed(true); localStorage.setItem('android_install_banner_dismissed', 'true') }} style={{ border: 'none', background: 'none', color: K.muted }}><X size={15} /></button>
            </div>
          )}
          {disconnected && (
            // aviso no rosa do menu (combina com o resto); o alerta fica no ícone
            <div className="k-alert-bar" style={{ ...banner(SB.bg, SB.strong), borderBottom: menuTheme === 'light' ? `1px solid ${SB.line}` : 'none', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 260px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: menuTheme === 'light' ? '#f5b83d' : '#a14a00', fontSize: 15 }}>⚠</span>O WhatsApp "{disconnected.name}" está desconectado. As mensagens não estão sendo enviadas nem recebidas.</span>
              {role === 'diretoria' && <button onClick={() => navigate('/settings/inboxes')} style={{ padding: '6px 14px', border: 'none', borderRadius: 3, background: '#8e2a46', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reconectar</button>}
              <button title="Fechar aviso" onClick={() => setDismissed(prev => new Set(prev).add(disconnected.id))} style={{ border: 'none', background: 'none', color: SB.muted, cursor: 'pointer', display: 'flex' }}><X size={15} /></button>
            </div>
          )}
        </div>
        <main className="app-main" style={{ flex: 1, padding: 24, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>

      {/* gaveta do celular */}
      <div hidden={!mobileNav} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
        <div onClick={() => setMobileNav(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} />
        <aside style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(86vw, 300px)', background: SB.bg, color: SB.text, display: 'flex', flexDirection: 'column', animation: 'slideInLeft .18s ease', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <ClaraLogo width={140} color={SB.logo} />
            <button onClick={() => setMobileNav(false)} aria-label="Fechar menu" style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${SB.line}`, background: 'none', color: SB.muted, fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>{navTree(true)}</nav>
          {footer(true)}
        </aside>
      </div>

      {profileOpen && (
        <div className="modal-overlay" onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, padding: 28, background: '#fff', borderRadius: 6, boxShadow: '0 20px 60px rgba(0,0,0,.25)', fontFamily: K.font }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 18px' }}>Meu perfil</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {avatar(64)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatar} />
                <button disabled={uploading} onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', border: 'none', borderRadius: 3, background: K.blue, color: '#fff', fontSize: 13, fontWeight: 700 }}>{uploading ? 'Enviando…' : 'Alterar foto'}</button>
                {currentUser.avatar_url && <button disabled={uploading} onClick={removeAvatar} style={{ padding: '8px 14px', border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', fontSize: 13 }}>Remover</button>}
              </div>
            </div>
            {[['Nome', meNome], ['E-mail', currentUser.email], ['Perfil', ROLE_LABEL[role] || role]].map(([k, val]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: `1px solid ${K.line}`, fontSize: 14 }}>
                <span style={{ color: K.muted }}>{k}</span><span>{val}</span>
              </div>
            ))}
            <button onClick={() => setProfileOpen(false)} style={{ width: '100%', marginTop: 18, padding: 11, border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', fontSize: 14, fontWeight: 700 }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Ícones de linha fina do menu do Kommo. */
function NavIcon({ name, active, pal = SB_NAVY }: { name: string; active?: boolean; pal?: SBPalette }) {
  const p = { size: 20, strokeWidth: 1.6, color: active ? pal.iconActive : pal.icon }
  const I = ({ home: Home, chat: MessageSquare, pipeline: Columns3, calendar: CalendarDays, list: FileText, automation: Workflow, ai: Sparkles, insights: PieChart, settings: Settings, help: HelpCircle, bell: Bell } as Record<string, typeof Home>)[name] || Home
  return <I {...p} style={{ flex: 'none' }} />
}

const kMenuItem: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 16px', border: 'none', background: 'none', fontFamily: "'PT Sans', Arial, sans-serif", fontSize: 15, color: '#313942', cursor: 'pointer' }
const kSubMenu: CSSProperties = { position: 'absolute', left: 'calc(100% + 4px)', top: 0, background: '#fff', border: '1px solid #e3e5e8', borderRadius: 6, width: 200, padding: '6px 0', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }
const menuItem: CSSProperties = { width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 6, fontSize: 13.5 }

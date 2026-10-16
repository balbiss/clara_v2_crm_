import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import { Bell, LogOut, Menu, X } from 'lucide-react'
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
import { NAV_ITEMS, GROUP_LABELS, allowed, ROLE_LABEL, ini, type NavItem } from '../lib/nav'
import Logo, { LogoMark } from './Logo'

// Casca do app no visual do Visita IA v2 (sidebar escura, topbar branca, gaveta no celular),
// com toda a lógica do DashboardLayout da Clara v1: notificações, banners de caixa caída e de
// instalação, foto de perfil, revalidação de dados parados, avisos de lead atribuído/adiamento.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Notif = { id: number; title: string; message: string; link: string; created_at: string; read_at: string | null }
const STALE_AFTER_MS = 5 * 60 * 1000
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

  // itens do menu por perfil; pipelines personalizados entram em "Gestão"
  const items = NAV_ITEMS.filter(i => allowed(i.rule, role))
  const pipelineItems: NavItem[] = allowed('fullPortfolio', role)
    ? pipelinesSnap.pipelines.map((p: any) => ({ path: `/pipelines/${p.slug}`, label: p.name, group: 'gestao', rule: 'fullPortfolio' }))
    : []
  const groups = (['menu', 'gestao', 'ferramentas', 'config'] as const).map(g => ({
    g, list: [...items.filter(i => i.group === g), ...(g === 'gestao' ? pipelineItems : [])],
  })).filter(x => x.list.length)
  const badgeFor = (it: NavItem) => (it.badge === 'conversas' ? unreadConversas : it.badge === 'equipe' ? chatSnap.totalUnread : 0)
  const isActive = (path: string) => location.pathname === path || (path === '/conversas' && location.pathname.startsWith('/conversas'))

  const navButton = (it: NavItem, mobile = false) => {
    const active = isActive(it.path)
    const badge = badgeFor(it)
    const showText = mobile || sidebarOpen
    return (
      <button key={it.path}
        onClick={e => { if (e.ctrlKey || e.metaKey) window.open(it.path, '_blank'); else navigate(it.path) }}
        onAuxClick={e => { if (e.button === 1) window.open(it.path, '_blank') }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: mobile ? '13px 14px' : '10px 12px', border: 'none', borderRadius: mobile ? 10 : 8,
          fontSize: mobile ? 15 : 13.5, fontWeight: active ? 700 : 500, textAlign: 'left', width: '100%', flex: 'none',
          background: active ? 'rgba(76,141,240,.16)' : 'transparent', color: active ? 'var(--side-accent)' : (mobile ? 'var(--sideInk)' : 'var(--sideMuted)'),
        }}>
        <span style={{ width: 7, height: 7, flex: 'none', transform: 'rotate(45deg)', background: active ? 'var(--side-accent)' : '#3a4456' }} />
        {showText && <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>}
        {showText && badge > 0 && (
          <span style={{ minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9, background: 'var(--side-accent)', color: '#08111F', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
        )}
      </button>
    )
  }

  const avatar = (size: number) => currentUser.avatar_url
    ? <img src={currentUser.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--terraSoft)', color: 'var(--terra)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flex: 'none' }}>{ini(meNome)}</span>

  const q = query.trim()
  const goSearch = () => { if (q) navigate(`/contatos?q=${encodeURIComponent(q)}`) }

  return (
    <div data-theme={theme} style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <aside className="app-sidebar" style={{ width: sidebarOpen ? 248 : 68, background: 'var(--side)', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'fixed', top: 0, left: 0, zIndex: 50, transition: 'width .18s ease' }}>
        <div style={{ flex: 'none', padding: '22px 20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, overflow: 'hidden', color: 'var(--sideInk)' }}>
            {sidebarOpen ? <Logo markSize={26} wordSize={11} showCrm={false} gap={9} /> : <LogoMark size={26} />}
          </div>
          <button onClick={toggleSidebar} style={{ background: 'none', border: '1px solid #243043', color: 'var(--sideMuted)', width: 26, height: 26, borderRadius: 6, flex: 'none', fontSize: 13, lineHeight: 1 }}>{sidebarOpen ? '‹' : '›'}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map(({ g, list }, idx) => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sidebarOpen && <p style={{ ...groupTitle, marginTop: idx === 0 ? 4 : 18 }}>{GROUP_LABELS[g]}</p>}
              {list.map(it => navButton(it))}
            </div>
          ))}
        </div>
        <div style={{ flex: 'none', borderTop: '1px solid #1c2636', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: sidebarOpen ? 'flex-start' : 'center' }}>
            {avatar(26)}
            {sidebarOpen && (
              <>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.95)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meNome}</span>
                  <span style={{ display: 'block', fontSize: 9, color: 'var(--sideMuted)', textTransform: 'uppercase', fontWeight: 600 }}>{ROLE_LABEL[role] || role}</span>
                </span>
                <button onClick={logout} title="Sair" style={{ border: 'none', background: 'none', color: 'var(--sideMuted)', padding: 4, borderRadius: 6, flex: 'none' }}><LogOut size={14} strokeWidth={2} /></button>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className="content-col" style={{ marginLeft: sidebarOpen ? 248 : 68, minWidth: 0, display: 'flex', flexDirection: 'column', transition: 'margin-left .18s ease' }}>
        <div ref={topRef} style={{ position: 'sticky', top: 0, zIndex: 30 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--card)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <button className="topbar-hamburger" onClick={() => setMobileNav(true)} aria-label="Abrir menu"
              style={{ display: 'none', width: 38, height: 38, flex: 'none', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>
              <Menu size={19} strokeWidth={2} />
            </button>
            <span className="topbar-logo" style={{ display: 'none' }}><LogoMark size={26} /></span>
            <div className="top-search" style={{ flex: 1, maxWidth: 420, position: 'relative' }}>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') goSearch() }}
                placeholder="Buscar revendedoras por nome ou telefone…"
                style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 13.5 }} />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 11, height: 11, border: '1.4px solid var(--muted)', borderRadius: '50%' }} />
            </div>
            <div style={{ flex: 1 }} />
            <button className="topbar-theme" onClick={toggleTheme} title="Alternar tema" style={iconBtn}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: theme === 'dark' ? 'var(--sideInk)' : 'var(--ink)', boxShadow: 'inset 4px 0 0 ' + (theme === 'dark' ? 'var(--card)' : 'transparent') }} />
            </button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setNotifOpen(o => !o); setMenuOpen(false) }} title="Notificações" style={{ ...iconBtn, position: 'relative' }}>
                <Bell size={17} strokeWidth={2} />
                {unreadCount > 0 && <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 17, height: 17, padding: '0 4px', background: 'var(--terra)', color: '#fff', borderRadius: 9, fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              {notifOpen && (
                <div className="topbar-dropdown" style={{ position: 'absolute', right: 0, top: 42, width: 320, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 12px 28px rgba(8,17,31,.16)', zIndex: 40, animation: 'fadeUp .12s ease', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>Notificações</span>
                    {unreadCount > 0 && <button onClick={markAllAsRead} style={{ border: 'none', background: 'none', fontSize: 11.5, color: 'var(--terra)', fontWeight: 600 }}>Marcar todas como lidas</button>}
                  </div>
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {notifications.map(n => (
                      <button key={n.id} onClick={() => markAsRead(n)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--line)', background: n.read_at ? 'none' : 'var(--terraSoft)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: n.read_at ? 'transparent' : 'var(--terra)', flex: 'none', marginTop: 5 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: n.read_at ? 500 : 700 }}>{n.title}</span>
                          {n.message && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', margin: '2px 0' }}>{n.message}</span>}
                          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)' }}>{new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                      </button>
                    ))}
                    {notifications.length === 0 && <p style={{ padding: '16px 14px', fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>Nenhuma notificação por aqui.</p>}
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setMenuOpen(o => !o); setNotifOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 8, padding: '5px 10px 5px 5px', flex: 'none' }}>
                {avatar(26)}
                <span className="topbar-profile-text" style={{ textAlign: 'left', lineHeight: 1.25 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{meNome}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{ROLE_LABEL[role] || role}</span>
                </span>
              </button>
              {menuOpen && (
                <div className="topbar-dropdown" style={{ position: 'absolute', right: 0, top: 46, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, minWidth: 184, padding: 6, boxShadow: '0 12px 28px rgba(8,17,31,.12)', animation: 'fadeUp .14s ease', zIndex: 40 }}>
                  <button onClick={() => { setMenuOpen(false); setProfileOpen(true) }} style={menuItem}>Meu perfil</button>
                  <button onClick={() => { setMenuOpen(false); navigate('/manual') }} style={menuItem}>Manual</button>
                  <div style={{ height: 1, background: 'var(--line)', margin: '5px 0' }} />
                  <button onClick={logout} style={{ ...menuItem, color: 'var(--terra)' }}>Sair</button>
                </div>
              )}
            </div>
          </header>
          {iosBanner && (
            <div style={banner('var(--terraSoft)', 'var(--ink)')}>
              <span style={{ flex: 1 }}>Adicione o {brand.name} à Tela de Início pra receber notificações e usar em tela cheia.</span>
              <button onClick={() => { setIosBanner(false); localStorage.setItem('ios_install_banner_dismissed', 'true') }} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><X size={15} /></button>
            </div>
          )}
          {canInstall && !isInstalled && !isStandalone && !androidDismissed && (
            <div style={banner('var(--terraSoft)', 'var(--ink)')}>
              <span style={{ flex: 1 }}>Instale o {brand.name} no seu celular pra acesso rápido e notificações.</span>
              <button onClick={promptInstall} style={{ padding: '6px 12px', border: 'none', borderRadius: 7, background: 'var(--terra)', color: '#fff', fontSize: 12.5, fontWeight: 600 }}>Instalar</button>
              <button onClick={() => { setAndroidDismissed(true); localStorage.setItem('android_install_banner_dismissed', 'true') }} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><X size={15} /></button>
            </div>
          )}
          {disconnected && (
            <div style={banner('var(--terraSoft)', 'var(--terra)')}>
              <span style={{ flex: 1 }}>⚠️ O WhatsApp "{disconnected.name}" está desconectado. As mensagens não estão sendo enviadas nem recebidas.</span>
              {role === 'diretoria' && <button onClick={() => navigate('/settings/inboxes')} style={{ padding: '6px 12px', border: 'none', borderRadius: 7, background: 'var(--terra)', color: '#fff', fontSize: 12.5, fontWeight: 600 }}>Reconectar</button>}
              <button onClick={() => setDismissed(prev => new Set(prev).add(disconnected.id))} style={{ border: 'none', background: 'none', color: 'var(--terra)' }}><X size={15} /></button>
            </div>
          )}
        </div>
        <main className="app-main" style={{ flex: 1, padding: '22px 34px 48px', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>

      {/* gaveta do celular */}
      <div hidden={!mobileNav} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
        <div onClick={() => setMobileNav(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(4,7,12,.55)', backdropFilter: 'blur(2px)' }} />
        <aside style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(86vw, 320px)', background: 'var(--side)', display: 'flex', flexDirection: 'column', animation: 'slideInLeft .18s ease', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 16px', color: 'var(--sideInk)' }}>
            <Logo markSize={26} wordSize={11} showCrm={false} gap={9} />
            <button onClick={() => setMobileNav(false)} aria-label="Fechar menu" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #243043', background: 'none', color: 'var(--sideMuted)', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 16px' }}>
            {groups.map(({ g, list }) => (
              <div key={g}>
                <p style={{ ...groupTitle, fontSize: 9.5, margin: '14px 6px 6px' }}>{GROUP_LABELS[g]}</p>
                {list.map(it => navButton(it, true))}
              </div>
            ))}
          </div>
          <div style={{ flex: 'none', borderTop: '1px solid #1c2636', padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            {avatar(32)}
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--sideInk)' }}>{meNome}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--sideMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{ROLE_LABEL[role] || role}</span>
            </span>
            <button onClick={logout} aria-label="Sair" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #243043', background: 'none', color: 'var(--sideMuted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LogOut size={16} strokeWidth={2} /></button>
          </div>
        </aside>
      </div>

      {profileOpen && (
        <div className="modal-overlay" onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,26,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 20px 60px rgba(10,15,26,.25)' }}>
            <h2 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 24, margin: '0 0 18px' }}>Meu perfil</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {avatar(64)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatar} />
                <button disabled={uploading} onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: 'var(--terra)', color: '#fff', fontSize: 13, fontWeight: 600 }}>{uploading ? 'Enviando…' : 'Alterar foto'}</button>
                {currentUser.avatar_url && <button disabled={uploading} onClick={removeAvatar} style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 13 }}>Remover</button>}
              </div>
            </div>
            {[['Nome', meNome], ['E-mail', currentUser.email], ['Perfil', ROLE_LABEL[role] || role]].map(([k, val]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13.5 }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span><span style={{ fontWeight: 600 }}>{val}</span>
              </div>
            ))}
            <button onClick={() => setProfileOpen(false)} style={{ width: '100%', marginTop: 18, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 14, fontWeight: 600 }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}

const menuItem: CSSProperties = { width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 6, fontSize: 13.5 }

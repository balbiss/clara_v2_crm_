import { useEffect, useRef, useState, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import {
  Search, Inbox, MessageCircle, Hash, Tag, BarChart2, Settings, ChevronDown, Users, Home, Kanban, Briefcase, User, Palette, Power,
  Sun, Moon, Monitor, CornerDownLeft, ArrowUp, ArrowDown, Bell, CalendarDays, Badge, Activity, GitBranch, TrendingUp, BookOpen,
  Menu, X, ChevronLeft, ChevronRight, UserX, ListChecks, Plus, MoreVertical, GripVertical, Users2, Package, LayoutGrid, MessageSquareText,
} from 'lucide-react'
import api from '../api'
import { brand } from '../config/brand'
import { ROLE_LABELS, isFullPortfolio as isFullPortfolioRole, isCriticalConfig as isCriticalConfigRole } from '../config/roles'
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
import { VLink } from '../components/VLink'
import '../styles/vue/DashboardLayout.scss'

// Porte de views/DashboardLayout.vue (menu lateral, notificações, perfil, tema, banners).
type Notif = { id: number; title: string; message: string; link: string; created_at: string; read_at: string | null }
const themes = [
  { id: 'light', name: 'Claro', icon: Sun },
  { id: 'dark', name: 'Escuro', icon: Moon },
  { id: 'system', name: 'Sistema', icon: Monitor },
]
const STALE_AFTER_MS = 5 * 60 * 1000
const isStale = (store: { lastFetchedAt: number | null }) => !store.lastFetchedAt || (Date.now() - store.lastFetchedAt) > STALE_AFTER_MS

export default function DashboardLayout() {
  const navigate = useNavigate()
  const inboxesSnap = useSnapshot(inboxesStore) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const pipelinesSnap = useSnapshot(pipelinesStore) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const chatSnap = useSnapshot(internalChatStore) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const [headerSearchQuery, setHeaderSearchQuery] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [autoOffline, setAutoOffline] = useState(false)
  const [isConversasOpen, setIsConversasOpen] = useState(true)
  const [isPipelinesOpen, setIsPipelinesOpen] = useState(false)
  const [isPipelinesMenuOpen, setIsPipelinesMenuOpen] = useState(false)
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false)
  const [reorderList, setReorderList] = useState<{ id: number; name: string; position: number }[]>([])
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(localStorage.getItem('sidebar_collapsed') === 'true')
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const unreadRef = useRef(0)
  unreadRef.current = unreadCount
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<Record<string, any>>(() => ({ first_name: '', last_name: '', email: '', account_name: '', ...readUser() }))
  const [, setTags] = useState([])
  const [showIosInstallBanner, setShowIosInstallBanner] = useState(false)
  const [androidInstallDismissed, setAndroidInstallDismissed] = useState(localStorage.getItem('android_install_banner_dismissed') === 'true')
  const [dismissedInboxIds, setDismissedInboxIds] = useState<Set<number>>(new Set())
  const [isThemePaletteOpen, setIsThemePaletteOpen] = useState(false)
  const [selectedThemeIndex, setSelectedThemeIndex] = useState(0)
  const [themeSearchQuery, setThemeSearchQuery] = useState('')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const profileFileInputRef = useRef<HTMLInputElement>(null)
  const isFirstFetch = useRef(true)

  const { subscribe: subscribePush } = usePushNotifications()
  const { canInstall, isInstalled, isStandalone: isAppStandalone, promptInstall } = useInstallPrompt()

  const isFullPortfolio = isFullPortfolioRole(currentUser)
  const isCriticalConfig = isCriticalConfigRole(currentUser)
  const isFinanceiro = currentUser.role === 'financeiro'
  const roleLabel = (ROLE_LABELS as Record<string, string>)[currentUser.role] || currentUser.role
  const userInitials = () => ((currentUser.first_name || '')[0] || '') + ((currentUser.last_name || '')[0] || '') || '?'
  const userDisplayName = () => `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.email || 'Usuário'
  const accountName = () => currentUser.account_name || brand.name

  const showAndroidInstallBanner = canInstall && !isInstalled && !isAppStandalone && !androidInstallDismissed
  const disconnectedInboxBanner = inboxesSnap.disconnectedInboxes.find(i => !dismissedInboxIds.has(i.id))

  // se a caixa reconectar, tira do "dispensado" pra alertar de novo caso caia outra vez
  const disconnectedKey = inboxesSnap.disconnectedInboxes.map(i => i.id).join(',')
  useEffect(() => {
    const ids = disconnectedKey ? disconnectedKey.split(',').map(Number) : []
    setDismissedInboxIds(prev => { const n = new Set([...prev].filter(id => ids.includes(id))); return n.size === prev.size ? prev : n })
  }, [disconnectedKey])

  const goToContactSearch = () => {
    if (!headerSearchQuery.trim()) return
    navigate(`/contatos?q=${encodeURIComponent(headerSearchQuery.trim())}`)
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications')
      const newUnreadCount = response.data.unread_count
      // toast quando chega notificação nova
      if (!isFirstFetch.current && newUnreadCount > unreadRef.current) {
        const latest = response.data.unread[0]
        if (latest) Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: latest.title, text: latest.message, showConfirmButton: false, timer: 5000, timerProgressBar: true })
      }
      isFirstFetch.current = false
      setNotifications([...response.data.unread, ...response.data.read])
      setUnreadCount(newUnreadCount)
    } catch (error) {
      console.error('Erro ao buscar notificações', error)
    }
  }, [])

  const toggleNotifications = () => {
    setIsNotificationsOpen(v => !v)
    if (isSettingsOpen) setIsSettingsOpen(false)
  }

  const markAsRead = async (n: Notif) => {
    if (!n.read_at) {
      try {
        await api.put(`/notifications/${n.id}/mark_as_read`)
        setUnreadCount(c => c - 1)
        setNotifications(list => list.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      } catch { /* ignore */ }
    }
    setIsNotificationsOpen(false)
    if (n.link) navigate(n.link)
  }

  const markAllAsRead = async () => {
    if (unreadCount === 0) return
    try {
      await api.put('/notifications/mark_all_read')
      setNotifications(list => list.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Erro ao marcar todas como lidas', error)
    }
  }

  const fetchTags = useCallback(async () => {
    try { setTags((await api.get('/tags')).data) } catch (error) { console.error('Erro ao carregar tags', error) }
  }, [])

  const dismissAndroidBanner = () => { setAndroidInstallDismissed(true); localStorage.setItem('android_install_banner_dismissed', 'true') }
  const dismissIosBanner = () => { setShowIosInstallBanner(false); localStorage.setItem('ios_install_banner_dismissed', 'true') }
  const dismissDisconnectedBanner = () => {
    if (disconnectedInboxBanner) setDismissedInboxIds(prev => new Set(prev).add(disconnectedInboxBanner.id))
  }

  const toggleSidebarCollapsed = () => {
    const v = !isSidebarCollapsed
    setIsSidebarCollapsed(v)
    localStorage.setItem('sidebar_collapsed', String(v))
  }
  const closeMobileSidebar = () => setIsMobileSidebarOpen(false)

  const openThemePalette = () => { setShowUserMenu(false); setIsThemePaletteOpen(true); setSelectedThemeIndex(0) }
  const openProfileModal = () => { setShowUserMenu(false); setIsProfileModalOpen(true) }

  const applyTheme = (themeId: string) => {
    if (themeId === 'dark') document.body.classList.add('dark-theme')
    else if (themeId === 'light') document.body.classList.remove('dark-theme')
    else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark-theme')
    else document.body.classList.remove('dark-theme')
    localStorage.setItem('theme', themeId)
    setIsThemePaletteOpen(false)
  }

  // foto de perfil: salva avatar_url no 'user' do localStorage pra refletir em todo lugar
  const persistAvatarUrl = (url: string | null) => {
    const updated = { ...currentUser, avatar_url: url }
    setCurrentUser(updated)
    localStorage.setItem('user', JSON.stringify(updated))
  }
  const onAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Imagem muito grande (máx. 5MB).', showConfirmButton: false, timer: 3500 })
      return
    }
    const formData = new FormData()
    formData.append('avatar', file)
    setIsUploadingAvatar(true)
    try {
      const { data } = await api.patch('/profile/avatar', formData, { headers: { 'Content-Type': undefined } })
      persistAvatarUrl(data.avatar_url)
    } catch (err) {
      console.error('Erro ao trocar foto de perfil:', err)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao trocar a foto.', showConfirmButton: false, timer: 3500 })
    } finally {
      setIsUploadingAvatar(false)
    }
  }
  const removeAvatar = async () => {
    setIsUploadingAvatar(true)
    try { await api.delete('/profile/avatar'); persistAvatarUrl(null) } catch (err) { console.error('Erro ao remover foto de perfil:', err) } finally { setIsUploadingAvatar(false) }
  }

  // paleta de tema (Ctrl/Cmd+K)
  const paletteOpenRef = useRef(false)
  paletteOpenRef.current = isThemePaletteOpen
  const selectedRef = useRef(0)
  selectedRef.current = selectedThemeIndex
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!paletteOpenRef.current) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openThemePalette() }
        return
      }
      if (e.key === 'Escape') setIsThemePaletteOpen(false)
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedThemeIndex(i => (i + 1) % themes.length) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedThemeIndex(i => (i - 1 + themes.length) % themes.length) }
      else if (e.key === 'Enter') { e.preventDefault(); applyTheme(themes[selectedRef.current].id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Revalida dados parados quando a aba volta / janela ganha foco / 1ª interação (igual à v1)
  useEffect(() => {
    const revalidateStaleStores = () => {
      if (isStale(inboxesStore)) inboxesStore.fetchInboxes()
      if (isStale(contactsStore)) contactsStore.fetchContacts()
      if (isStale(agentsStore)) agentsStore.fetchAgents()
      if (isStale(pipelinesStore)) pipelinesStore.fetchPipelines()
      if (isStale(conversationsStore)) {
        // PC que dormiu: força reconectar o tempo real (socket "zumbi")
        resetSocket()
        conversationsStore.fetchConversations()
      }
    }
    let notificationInterval: ReturnType<typeof setInterval> | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications()
        if (!notificationInterval) notificationInterval = setInterval(fetchNotifications, 10000)
        revalidateStaleStores()
      } else if (notificationInterval) {
        clearInterval(notificationInterval)
        notificationInterval = null
      }
    }

    const ua = navigator.userAgent
    const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    setShowIosInstallBanner(/iPhone|iPad|iPod/.test(ua) && !iosStandalone && localStorage.getItem('ios_install_banner_dismissed') !== 'true')

    subscribePush() // pede permissão de push depois do login (silencioso se negado)

    // navegação disparada pelo toque na notificação push
    const onSwMessage = (event: MessageEvent) => { if (event.data?.type === 'NAVIGATE') navigate(event.data.url) }
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onSwMessage)

    if (!inboxesStore.isLoadedOnce) inboxesStore.fetchInboxes()
    if (!contactsStore.isLoadedOnce) contactsStore.fetchContacts()
    if (!agentsStore.isLoadedOnce) agentsStore.fetchAgents()
    if (!pipelinesStore.isLoadedOnce) pipelinesStore.fetchPipelines()
    inboxesStore.startStatusPolling()

    // chat interno ativo em qualquer tela (badge de não lidas + toast)
    internalChatStore.fetchThreads()
    internalChatStore.setupWebSocket()

    applyTheme(localStorage.getItem('theme') || 'system')

    fetchNotifications()
    notificationInterval = setInterval(fetchNotifications, 10000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', revalidateStaleStores)
    document.addEventListener('click', revalidateStaleStores, { capture: true })
    document.addEventListener('keydown', revalidateStaleStores, { capture: true })
    fetchTags()
    window.addEventListener('tags-updated', fetchTags)

    return () => {
      if (notificationInterval) clearInterval(notificationInterval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', revalidateStaleStores)
      document.removeEventListener('click', revalidateStaleStores, { capture: true })
      document.removeEventListener('keydown', revalidateStaleStores, { capture: true })
      window.removeEventListener('tags-updated', fetchTags)
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onSwMessage)
      inboxesStore.stopStatusPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useWindowEvent('lead-atribuido', (e) => {
    const { contact_name, conversation_id, assigned_by } = e.detail
    const origem = assigned_by === 'rodizio' ? 'via rodízio automático' : 'pelo gestor'
    Swal.fire({
      toast: true, position: 'top-end', icon: 'info', title: '📋 Novo lead atribuído a você!',
      html: `<strong>${contact_name}</strong><br><small style="color:#6b7280">${origem}</small>`,
      showConfirmButton: true, confirmButtonText: 'Ver conversa', confirmButtonColor: '#ff007f', showCloseButton: true, timer: 12000, timerProgressBar: true,
      didOpen: () => {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          const ctx = new AudioCtx()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
        } catch { /* sem áudio */ }
      },
    }).then(result => { if (result.isConfirmed && conversation_id) navigate('/conversas') })
  })

  useWindowEvent('snooze-expired', (e) => {
    const { contact_name } = e.detail
    Swal.fire({
      toast: true, position: 'top-end', icon: 'info', title: '⏰ Conversa reativada!',
      html: `<strong>${contact_name || 'Revendedora'}</strong><br><small style="color:#6b7280">O tempo de adiamento expirou — conversa reaberta.</small>`,
      showConfirmButton: true, confirmButtonText: 'Ver conversa', confirmButtonColor: '#ff007f', showCloseButton: true, timer: 12000, timerProgressBar: true,
    }).then(result => { if (result.isConfirmed) navigate('/conversas') })
  })

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  const createPipeline = async () => {
    setIsPipelinesMenuOpen(false)
    const { value: name } = await Swal.fire({
      title: 'Novo pipeline', input: 'text', inputPlaceholder: 'Ex: Atacado, Prospecção...',
      showCancelButton: true, confirmButtonColor: '#ff007f', confirmButtonText: 'Criar', cancelButtonText: 'Cancelar',
    })
    if (!name || !String(name).trim()) return
    const pipeline = await pipelinesStore.createPipeline(String(name).trim())
    navigate(`/pipelines/${pipeline.slug}`)
  }
  const openReorderModal = () => {
    setIsPipelinesMenuOpen(false)
    setReorderList([...pipelinesStore.pipelines].sort((a, b) => a.position - b.position))
    setIsReorderModalOpen(true)
  }
  const moveReorderItem = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= reorderList.length) return
    const list = [...reorderList]
    ;[list[index], list[target]] = [list[target], list[index]]
    setReorderList(list)
  }
  const saveReorder = async () => {
    await pipelinesStore.reorderPipelines(reorderList)
    setIsReorderModalOpen(false)
  }

  const ThemeIcon = ({ i }: { i: number }) => { const I = themes[i].icon; return <I className="icon-sm" /> }

  return (
    <div className="vs-DashboardLayout" style={{ display: 'contents' }}>
      <div className="chatwoot-layout">
        {isMobileSidebarOpen && <div className="mobile-overlay" onClick={closeMobileSidebar}></div>}

        <aside className={`sidebar${isMobileSidebarOpen ? ' mobile-open' : ''}${isSidebarCollapsed ? ' collapsed' : ''}`}>
          <button className="sidebar-collapse-btn" onClick={toggleSidebarCollapsed} title={isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>
            {isSidebarCollapsed ? <ChevronRight className="icon-xs" /> : <ChevronLeft className="icon-xs" />}
          </button>

          <div className="workspace-header">
            <div className="workspace-info">
              <div className="workspace-avatar">{(accountName()[0] || 'I').toUpperCase()}</div>
              <span className="workspace-name">{accountName()}</span>
            </div>
            <ChevronDown className="icon-sm" />
          </div>

          <div className="header-actions">
            <div className="search-bar">
              <Search className="icon-sm" />
              <input type="text" placeholder="Pesquisar contatos..." value={headerSearchQuery}
                onChange={e => setHeaderSearchQuery(e.target.value)} onKeyUp={e => { if (e.key === 'Enter') goToContactSearch() }} />
            </div>

            <div className="notifications-wrapper">
              <button className="icon-btn" onClick={toggleNotifications}>
                <Bell className="icon" />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>
              {isNotificationsOpen && (
                <div className="notifications-dropdown">
                  <div className="notifications-header">
                    <h3>Notificações</h3>
                    {unreadCount > 0 && <button className="btn-mark-all" onClick={markAllAsRead}>Marcar todas como lidas</button>}
                  </div>
                  <div className="notifications-list">
                    {notifications.length === 0 && <div className="no-notifications">Nenhuma notificação nova.</div>}
                    {notifications.map(notif => (
                      <div key={notif.id} className={`notification-item${!notif.read_at ? ' unread' : ''}`} onClick={() => markAsRead(notif)}>
                        <div className="notif-content">
                          <h4>{notif.title}</h4>
                          <p>{notif.message}</p>
                          <span className="notif-time">{new Date(notif.created_at).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {!notif.read_at && <div className="unread-dot"></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <nav className="nav-menu">
            <VLink to="/dashboard" className="nav-item"><Home className="icon" /><span>Início</span></VLink>
            {!isFinanceiro && <VLink to="/carteira" className="nav-item"><Users className="icon" /><span>Minhas Revendedoras</span></VLink>}
            <VLink to="/inativas" className="nav-item"><UserX className="icon" /><span>Inativas</span></VLink>
            <VLink to="/atacado" className="nav-item"><Package className="icon" /><span>Atacado</span></VLink>
            {!isFinanceiro && <VLink to="/tarefas" className="nav-item"><ListChecks className="icon" /><span>Tarefas</span></VLink>}
            {isFullPortfolio && <VLink to="/gerencial" className="nav-item"><BarChart2 className="icon" /><span>Gerencial</span></VLink>}
            {isFullPortfolio && <VLink to="/relatorios" className="nav-item"><TrendingUp className="icon" /><span>Relatórios</span></VLink>}
            {isFullPortfolio && <VLink to="/settings/times-de-vendas" className="nav-item"><Users2 className="icon" /><span>Times de Vendas</span></VLink>}

            <div className="settings-section">
              <div className="settings-header" onClick={() => setIsConversasOpen(v => !v)}>
                <div className="left"><MessageCircle className="icon-sm" /><span>Comunicações</span></div>
                <ChevronDown className={`icon-xs chevron-icon${isConversasOpen ? ' rotate' : ''}`} />
              </div>
              <div className="settings-menu" style={{ display: isConversasOpen ? undefined : 'none' }}>
                <VLink to="/conversas" className="nav-item sub-item" exactActiveClass="active"><MessageCircle className="icon-sm" /> Inbox de chat</VLink>
                {inboxesSnap.inboxes.map(inbox => (
                  <VLink key={inbox.id} to={`/conversas/inbox/${inbox.id}`} className="nav-item sub-item inbox-sub-item" exactActiveClass="active">
                    <span className={`inbox-status-dot${inbox.connected === true ? ' connected' : ''}${inbox.connected === false ? ' disconnected' : ''}`}></span>
                    {inbox.name}
                  </VLink>
                ))}
                <VLink to="/chat-equipe" className="nav-item sub-item" exactActiveClass="active">
                  <Users className="icon-sm" /> Chat da Equipe
                  {chatSnap.totalUnread > 0 && <span className="nav-unread-badge">{chatSnap.totalUnread}</span>}
                </VLink>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-header pipelines-header">
                <div className="left" onClick={() => setIsPipelinesOpen(v => !v)}><Kanban className="icon-sm" /><span>Pipelines</span></div>
                <div className="pipelines-header-actions">
                  {isFullPortfolio && (
                    <button className="icon-btn-inline" title="Mais opções" onClick={e => { e.stopPropagation(); setIsPipelinesMenuOpen(v => !v) }}><MoreVertical className="icon-xs" /></button>
                  )}
                  <ChevronDown className={`icon-xs chevron-icon${isPipelinesOpen ? ' rotate' : ''}`} onClick={() => setIsPipelinesOpen(v => !v)} />
                </div>
                {isPipelinesMenuOpen && <div className="pipelines-menu-overlay" onClick={() => setIsPipelinesMenuOpen(false)}></div>}
                {isPipelinesMenuOpen && (
                  <div className="pipelines-dropdown">
                    <button className="pipelines-dropdown-item" onClick={e => { e.stopPropagation(); createPipeline() }}><Plus className="icon-xs" /> Adicionar funil de vendas</button>
                    <button className="pipelines-dropdown-item" onClick={e => { e.stopPropagation(); openReorderModal() }}><GripVertical className="icon-xs" /> Reordenar pipelines</button>
                  </div>
                )}
              </div>
              <div className="settings-menu" style={{ display: isPipelinesOpen ? undefined : 'none' }}>
                <VLink to="/funil" className="nav-item sub-item" exactActiveClass="active"><Badge className="icon-sm" /> Consignado</VLink>
                {isFullPortfolio && (
                  <>
                    {pipelinesSnap.pipelines.map(p => (
                      <VLink key={p.id} to={`/pipelines/${p.slug}`} className="nav-item sub-item" exactActiveClass="active"><Hash className="icon-sm" /> {p.name}</VLink>
                    ))}
                    <VLink to="/pipelines/todos-leads" className="nav-item sub-item" exactActiveClass="active"><ListChecks className="icon-sm" /> Todos os leads</VLink>
                  </>
                )}
              </div>
            </div>

            {isReorderModalOpen && (
              <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setIsReorderModalOpen(false) }}>
                <div className="reorder-modal">
                  <div className="reorder-modal-header">
                    <h3>Reordenar pipelines</h3>
                    <button className="close-btn" onClick={() => setIsReorderModalOpen(false)}>&times;</button>
                  </div>
                  <div className="reorder-modal-body">
                    {reorderList.map((p, index) => (
                      <div key={p.id} className="reorder-item">
                        <GripVertical className="icon-sm reorder-grip" />
                        <span className="reorder-name">{p.name}</span>
                        <div className="reorder-arrows">
                          <button disabled={index === 0} onClick={() => moveReorderItem(index, -1)} title="Mover pra cima"><ArrowUp className="icon-xs" /></button>
                          <button disabled={index === reorderList.length - 1} onClick={() => moveReorderItem(index, 1)} title="Mover pra baixo"><ArrowDown className="icon-xs" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="reorder-modal-footer">
                    <button className="btn-cancel" onClick={() => setIsReorderModalOpen(false)}>Cancelar</button>
                    <button className="btn-primary" onClick={saveReorder}>Salvar ordem</button>
                  </div>
                </div>
              </div>
            )}

            <VLink to="/calendario" className="nav-item"><CalendarDays className="icon" /><span>Calendário</span></VLink>
            <VLink to="/manual" className="nav-item"><BookOpen className="icon" /><span>Manual do Sistema</span></VLink>
            {isCriticalConfig && <VLink to="/fluxos" className="nav-item"><GitBranch className="icon" /><span>Fluxos</span></VLink>}

            {isCriticalConfig && (
              <div className="nav-section settings-section">
                <div className="settings-header" onClick={() => setIsSettingsOpen(v => !v)}>
                  <div className="left"><Settings className="icon-sm" /><span>Configurações</span></div>
                  <ChevronDown className={`icon-xs chevron-icon${isSettingsOpen ? ' rotate' : ''}`} />
                </div>
                <div className="settings-menu" style={{ display: isSettingsOpen ? undefined : 'none' }}>
                  <VLink to="/settings/account" className="nav-item sub-item" activeClass="active"><Briefcase className="icon-sm" /> Conta</VLink>
                  <VLink to="/settings/inboxes" className="nav-item sub-item"><Inbox className="icon-sm" /> Caixas de Entrada</VLink>
                  <VLink to="/settings/tags" className="nav-item sub-item" activeClass="active"><Tag className="icon-sm" /> Etiquetas</VLink>
                  <VLink to="/settings/campos-contato" className="nav-item sub-item" activeClass="active"><LayoutGrid className="icon-sm" /> Campos do Contato</VLink>
                  <VLink to="/settings/modelos-mensagem" className="nav-item sub-item" activeClass="active"><MessageSquareText className="icon-sm" /> Modelos de Mensagem</VLink>
                  <VLink to="/agentes" className="nav-item sub-item" activeClass="active"><Badge className="icon-sm" /> Agentes</VLink>
                  <VLink to="/atividades" className="nav-item sub-item" activeClass="active"><Activity className="icon-sm" /> Atividades</VLink>
                </div>
              </div>
            )}

            <button type="button" className="nav-item nav-item-btn" onClick={toggleNotifications}>
              <Bell className="icon" />
              <span>Central de Notificação</span>
              {unreadCount > 0 && <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
          </nav>

          <div className="sidebar-bottom">
            {showUserMenu && (
              <div className="user-popup-menu">
                <div className="menu-row">
                  <span>Disponibilidade</span>
                  <div className="status-selector"><div className="status-dot online"></div><span>Online</span><ChevronDown className="icon-xs" /></div>
                </div>
                <div className="menu-row">
                  <span>Marcar offline automaticamente</span>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={autoOffline} onChange={e => setAutoOffline(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
                <div className="menu-divider"></div>
                <a href="#" className="menu-item" onClick={e => { e.preventDefault(); openProfileModal() }}><User className="icon-sm" /> Configurações do Perfil</a>
                <a href="#" className="menu-item" onClick={e => { e.preventDefault(); openThemePalette() }}><Palette className="icon-sm" /> Alterar Tema</a>
                <a href="#" className="menu-item logout" onClick={handleLogout}><Power className="icon-sm" /> Encerrar sessão</a>
              </div>
            )}
            <div className={`user-profile${showUserMenu ? ' active' : ''}`} onClick={() => setShowUserMenu(v => !v)}>
              <div className="avatar-wrapper">
                {currentUser.avatar_url ? <img src={currentUser.avatar_url} className="avatar avatar-photo" /> : <div className="avatar">{userInitials()}</div>}
                <div className="status-indicator online"></div>
              </div>
              <div className="user-info">
                <span className="name">{userDisplayName()}</span>
                <span className="email">{currentUser.email}</span>
                <span className={`role-badge role-${currentUser.role}`}>{roleLabel}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="mobile-topbar">
            <button className="mobile-menu-btn" onClick={() => setIsMobileSidebarOpen(v => !v)}>
              {isMobileSidebarOpen ? <X className="icon" /> : <Menu className="icon" />}
            </button>
            <span className="mobile-brand">{accountName()}</span>
          </div>
          {showIosInstallBanner && (
            <div className="ios-install-banner">
              <span>Adicione o {brand.name} à Tela de Início pra receber notificações e usar em tela cheia.</span>
              <button className="ios-install-banner-close" onClick={dismissIosBanner}><X className="icon-sm" /></button>
            </div>
          )}
          {showAndroidInstallBanner && (
            <div className="ios-install-banner">
              <span>Instale o {brand.name} no seu celular pra acesso rápido e notificações.</span>
              <button className="install-cta-btn" onClick={promptInstall}>Instalar</button>
              <button className="ios-install-banner-close" onClick={dismissAndroidBanner}><X className="icon-sm" /></button>
            </div>
          )}
          {disconnectedInboxBanner && (
            <div className="disconnected-banner">
              <span>⚠️ O WhatsApp "{disconnectedInboxBanner.name}" está desconectado. As mensagens não estão sendo enviadas nem recebidas.</span>
              <VLink to="/settings/inboxes" className="install-cta-btn">Reconectar</VLink>
              <button className="ios-install-banner-close" onClick={dismissDisconnectedBanner}><X className="icon-sm" /></button>
            </div>
          )}
          <div style={{ display: 'contents' }} onClick={closeMobileSidebar}>
            <Outlet />
          </div>
        </main>

        {isThemePaletteOpen && (
          <div className="palette-overlay" onClick={e => { if (e.target === e.currentTarget) setIsThemePaletteOpen(false) }}>
            <div className="palette-modal">
              <div className="palette-header">
                <input type="text" value={themeSearchQuery} onChange={e => setThemeSearchQuery(e.target.value)} placeholder="Pesquisar ou pular para" autoFocus />
              </div>
              <div className="palette-body">
                <div className="palette-group">Tema</div>
                {themes.map((theme, index) => (
                  <div key={theme.id} className={`palette-item${index === selectedThemeIndex ? ' active' : ''}`} onClick={() => applyTheme(theme.id)} onMouseOver={() => setSelectedThemeIndex(index)}>
                    <ThemeIcon i={index} />
                    <span>{theme.name}</span>
                  </div>
                ))}
              </div>
              <div className="palette-footer">
                <div className="shortcut-group"><kbd><CornerDownLeft className="icon-xs" /></kbd><span>to select</span></div>
                <div className="shortcut-group"><kbd><ArrowDown className="icon-xs" /></kbd><kbd><ArrowUp className="icon-xs" /></kbd><span>to navigate</span></div>
                <div className="shortcut-group"><kbd>esc</kbd><span>to close</span></div>
              </div>
            </div>
          </div>
        )}

        {isProfileModalOpen && (
          <div className="profile-overlay" onClick={e => { if (e.target === e.currentTarget) setIsProfileModalOpen(false) }}>
            <div className="profile-modal">
              <div className="profile-modal-header">
                <h3>Configurações do Perfil</h3>
                <button className="profile-modal-close" onClick={() => setIsProfileModalOpen(false)}><X className="icon-sm" /></button>
              </div>
              <div className="profile-modal-body">
                <div className="profile-avatar-block">
                  <div className="profile-avatar-preview">
                    {currentUser.avatar_url ? <img src={currentUser.avatar_url} /> : <div className="profile-avatar-fallback">{userInitials()}</div>}
                  </div>
                  <input type="file" ref={profileFileInputRef} accept="image/*" className="hidden-file-input" onChange={onAvatarSelected} />
                  <div className="profile-avatar-actions">
                    <button className="btn-change-photo" disabled={isUploadingAvatar} onClick={() => profileFileInputRef.current?.click()}>{isUploadingAvatar ? 'Enviando...' : 'Alterar foto'}</button>
                    {currentUser.avatar_url && <button className="btn-remove-photo" disabled={isUploadingAvatar} onClick={removeAvatar}>Remover</button>}
                  </div>
                </div>
                <div className="profile-info-block">
                  <div className="profile-info-row"><span className="label">Nome</span><span className="value">{userDisplayName()}</span></div>
                  <div className="profile-info-row"><span className="label">E-mail</span><span className="value">{currentUser.email}</span></div>
                  <div className="profile-info-row"><span className="label">Perfil</span><span className="value">{roleLabel}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ref, useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react'
import {
  Filter, ArrowDownUp, MoreVertical, Paperclip, Smile, CheckCheck, Send, Info, X, ExternalLink, Mail, Phone, Copy, MessageCircle,
  Edit2, GitMerge, Trash2, Minus, Plus, ChevronDown, Sparkles, Loader2, BotOff, Bot, Mic, Pencil, Forward,
  Search, MoreHorizontal, ChevronLeft, Clock,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import SnoozeModal from '../components/SnoozeModal'
import ResolveModal from '../components/ResolveModal'
import { K, kBtn, kInput, TIPOS_TAREFA } from '../lib/kommo'
import KField from '../components/KField'
import FieldSetup from '../components/FieldSetup'
import AiSessionsBar from '../components/AiSessionsBar'
import api from '../api'
import { conversationsStore, isSemResposta } from '../store/conversations'
import { prepareImage } from '../utils/prepareImage'
import { ACTIVE_STATUS_LABELS, INACTIVE_STATUS_LABELS, statusLabel } from '../constants/regua'
import { nivelInfo } from '../constants/nivel'
import { useContactFields } from '../composables/useContactFields'
import { useLocal, useWindowEvent } from '../lib/hooks'
import ConversationFilterPopover from '../components/ConversationFilterPopover'
import ConversationSortPopover from '../components/ConversationSortPopover'
import ConversationStatusDropdown from '../components/ConversationStatusDropdown'
import ConversationMoreOptionsDropdown from '../components/ConversationMoreOptionsDropdown'
import EditContactModal from '../components/EditContactModal'
import MergeContactModal from '../components/MergeContactModal'
import DeleteContactModal from '../components/DeleteContactModal'
import NewConversationModal from '../components/NewConversationModal'
import DeleteConversationModal from '../components/DeleteConversationModal'
import ScheduleMessageModal from '../components/ScheduleMessageModal'
import TransferModal from '../components/TransferModal'
import ForwardMessageModal from '../components/ForwardMessageModal'
import { serif, inputStyle, labelStyle, btn, Card, Field, PILL, Tag, Dropdown, MenuItem } from '../components/ui'
import { ChatAvatar } from '../components/ChatAvatar'
import { inboxesStore } from '../store/inboxes'

// Porte de views/Conversas.vue (lógica da v1) no layout do Kommo: lista | card do lead | histórico.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any

const SIDEBAR_FILTER_LABELS: Record<string, string> = { participantes: 'Chats da equipe', mencoes: 'Menções', 'nao-atendidas': 'Não atendidas' }
const DEPT_LABELS: Record<string, string> = { corretor: 'Consultoras', suporte: 'Suporte', financeiro: 'Financeiro', manutencao: 'Manutenção' }
const detailsTabs = [
  { id: 'principal', label: 'Principal' }, { id: 'dados', label: 'Dados' }, { id: 'financeiro', label: 'Financeiro' },
  { id: 'estatisticas', label: 'Números' }, { id: 'configuracoes', label: 'Ajustes' },
]
const statusOptions = [{ group: 'Ativas', options: ACTIVE_STATUS_LABELS }, { group: 'Inativas', options: INACTIVE_STATUS_LABELS }]
const dadosFields = [
  { key: 'cpf', label: 'CPF', source: 'contact' },
  { key: 'birth_date', label: 'Data de Nascimento', source: 'contact', format: 'date' },
  { key: 'nivel', label: 'Nível', source: 'contact' },
  { key: 'instagram', label: 'Instagram', source: 'attr' },
  { key: 'id_jueri', label: 'ID Jueri (ERP)', source: 'attr' },
  { key: 'origem', label: 'Origem do lead', source: 'attr' },
  { key: 'gerente_jueri_nome', label: 'Gerente no Jueri', source: 'attr' },
  { key: 'gerente_jueri_id', label: 'ID do Gerente no Jueri', source: 'attr' },
  { key: 'supervisor_nome', label: 'Supervisor no Jueri', source: 'attr' },
  { key: 'rg', label: 'RG', source: 'attr' },
  { key: 'profissao', label: 'Profissão', source: 'attr' },
  { key: 'razao_social', label: 'Razão Social', source: 'attr' },
  { key: 'nome_fantasia', label: 'Nome Fantasia', source: 'attr' },
  { key: 'cnpj', label: 'CNPJ', source: 'attr' },
  { key: 'observacao_jueri', label: 'Observação (Jueri)', source: 'attr' },
  { key: 'observacao_interna_jueri', label: 'Observação Interna (Jueri)', source: 'attr' },
  { key: 'local_trabalho', label: 'Local de trabalho', source: 'attr' },
  { key: 'website_jueri', label: 'Site / link da revendedora', source: 'attr' },
  { key: 'referencia_nome', label: 'Contato de referência', source: 'attr' },
  { key: 'referencia_telefone', label: 'Telefone de referência', source: 'attr' },
  { key: 'status_cadastral_jueri', label: 'Status cadastral (Jueri)', source: 'attr' },
  { key: 'data_criacao_jueri', label: 'Cadastrado no Jueri em', source: 'attr', format: 'datetime' },
  { key: 'data_ultima_alteracao_jueri', label: 'Última alteração no Jueri', source: 'attr', format: 'datetime' },
  { key: 'data_inativacao_jueri', label: 'Data de Inativação (Jueri)', source: 'attr', format: 'date' },
]
const PEDIDO_STATUS_LABELS: Record<number, string> = { 1: 'Aberto', 2: 'Baixado', 3: 'Cancelado', 4: 'Perdido' }
const PEDIDO_STATUS_CLASSES: Record<number, string> = { 1: 'aberto', 2: 'baixado', 3: 'cancelado', 4: 'perdido' }
const LIFECYCLE_EVENT_LABELS: Record<string, string> = { iniciada: 'Iniciada', churn: 'Churn', reativacao: 'Reativação' }
const TAG_COLORS = ['#6b7280', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
// "📎 Anexo recebido" é só o texto guardado quando chega mídia — na tela some (o balão mostra o
// áudio/foto) e na lista vira "Áudio", "Foto", "Vídeo" ou "Arquivo".
const isMediaPlaceholder = (t?: string | null) => !!t && t.startsWith('📎')
const mediaLabel = (text?: string | null, type?: string | null) => {
  if (!isMediaPlaceholder(text) && (text || !type)) return text || ''
  const ct = type || ''
  return ct.startsWith('audio/') ? 'Áudio' : ct.startsWith('image/') ? 'Foto' : ct.startsWith('video/') ? 'Vídeo' : ct ? 'Arquivo' : String(text).replace(/^📎\s*/, '').replace('Anexo recebido', 'Arquivo')
}

const normalizar = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const formatSearchDate = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === hoje.getFullYear() ? undefined : '2-digit' })
}
// "2026-11-01" sem hora vira meia-noite UTC (dia anterior em GMT-3); força horário local
const formatDate = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(String(iso).includes('T') ? iso : `${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}
const formatPhoneDisplay = (phone: string | null) => (phone ? phone.replace(/^\+?55/, '').trim() || phone : null)
const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)
const brl = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const formatMessageTime = (isoString: string) => {
  if (!isoString || !isoString.includes('T')) return isoString
  const date = new Date(isoString)
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dayStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${dayStr}, ${timeStr}`
}
const formatRecordingTime = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`
const formatAiRemaining = (seconds: number) => {
  if (!seconds || seconds <= 0) return '0 min'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} min${s > 0 ? ` ${s}s` : ''}` : `${s}s`
}
const humanizeKey = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const daysInStage = (contact: Any) => {
  const since = contact?.status_changed_at || contact?.created_at
  if (!since) return null
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)
  return days >= 0 ? days : null
}

function WhatsappIcon({ source }: { source: string }) {
  if (source === 'instagram') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="url(#ig-grad-list)"><defs><linearGradient id="ig-grad-list" x1="0" x2="1" y1="1" y2="0"><stop offset="0%" stopColor="#f09433" /><stop offset="50%" stopColor="#dc2743" /><stop offset="100%" stopColor="#bc1888" /></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" /></svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path fill="#fff" d="M12.04 4.6c-4.07 0-7.38 3.31-7.38 7.38 0 1.3.34 2.57.99 3.69l-1.05 3.83 3.92-1.03a7.35 7.35 0 0 0 3.52.9h.01c4.07 0 7.38-3.31 7.38-7.38a7.34 7.34 0 0 0-2.16-5.22 7.34 7.34 0 0 0-5.23-2.17zm4.32 10.55c-.18.51-.9.94-1.47 1.06-.4.08-.91.15-2.65-.57-2.23-.92-3.66-3.18-3.77-3.33-.11-.15-.9-1.2-.9-2.29 0-1.09.57-1.63.77-1.85.18-.2.45-.32.7-.32.09 0 .16 0 .23.01.2.01.3.02.44.33.16.38.54 1.3.59 1.4.05.1.08.22.02.35-.06.13-.09.2-.18.31-.09.11-.19.25-.27.34-.09.1-.19.2-.08.4.11.2.5.82 1.07 1.32.75.65 1.38.86 1.57.96.15.07.32.06.43-.06.14-.15.33-.4.51-.65.13-.18.3-.21.51-.13.21.08 1.32.62 1.55.74.22.11.37.17.42.26.05.1.05.56-.13 1.08z" />
    </svg>
  )
}

export default function Conversas() {
  const params = useParams()
  const [query] = useSearchParams()
  const navigate = useNavigate()
  const store = useSnapshot(conversationsStore) as Any
  const conv = store.activeConversation as Any
  const { allFields: principalFields, labelOf: fieldLabelOf, fieldOf } = useContactFields()
  const [detailsOpen, setDetailsOpen] = useState(() => window.innerWidth > 1150)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)
  useEffect(() => { const f = () => setIsMobile(window.innerWidth <= 900); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])

  const [s, v] = useLocal(() => ({
    newMessageText: '',
    isPrivateMessage: false,
    isEmojiPickerOpen: false,
    mobileView: 'list' as 'list' | 'chat' | 'details',
    searchQuery: '',
    searchResults: null as Any,
    isSearching: false,
    highlightedMessageId: null as number | null,
    isScheduleModalOpen: false,
    scheduledMessages: [] as Any[],
    isAssigning: false,
    showTransferModal: false,
    forwardingMessage: null as Any,
    isAttachmentsOpen: false,
    isDadosJueriOpen: false,
    isUnassignedOpen: false,
    activeDetailsTab: 'principal',
    isEditingName: false,
    editingName: '',
    editingFieldKey: null as string | null,
    editingFieldValue: '',
    isChangingStatus: false,
    contactFieldGroups: [] as Any[],
    openGroupIds: [] as number[],
    showQuickInfo: false,
    isNotesOpen: false,
    newNoteText: '',
    isSavingNote: false,
    isGeneratingSummary: false,
    isEditModalOpen: false,
    isMergeModalOpen: false,
    isDeleteModalOpen: false,
    isDeleteConversationModalOpen: false,
    isNewConversationModalOpen: false,
    isFilterPopoverOpen: false,
    isSortPopoverOpen: false,
    isDetailsMenuOpen: false,
    selectedFile: null as File | null,
    selectedFilePreview: null as string | null,
    messageTemplates: [] as Any[],
    transcribingIds: {} as Record<number, boolean>,
    isRecording: false,
    recordingSeconds: 0,
    aiPauseStatus: { paused: false, remaining_seconds: 0 },
    newTagName: '',
    newTagColor: TAG_COLORS[0],
    allTags: [] as Any[],
    showTagSuggestions: false,
  }))

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const fieldInputRef = useRef<HTMLInputElement>(null)
  const recorder = useRef<{ mediaRecorder: MediaRecorder | null; chunks: Blob[]; stream: MediaStream | null; interval: ReturnType<typeof setInterval> | null }>({ mediaRecorder: null, chunks: [], stream: null, interval: null })
  const sending = useRef(false)

  const listTitle = SIDEBAR_FILTER_LABELS[params.filter || ''] || 'Todas as conversas'
  const isSearchActive = v.searchQuery.trim().length >= 2
  /** Conversa ativa no proxy (pra mutar), o `conv` acima é só leitura. */
  const activeProxy = () => conversationsStore.activeConversation as Any

  // --- pesquisa (backend, com debounce de 400ms) ----------------------------------------------
  const searchSeq = useRef(0)
  useEffect(() => {
    const q = v.searchQuery
    if (q.trim().length < 2) { s.searchResults = null; return }
    const t = setTimeout(async () => {
      const seq = ++searchSeq.current
      s.isSearching = true
      try {
        const { data } = await api.get('/conversations/search', { params: { q: q.trim() } })
        if (seq === searchSeq.current) s.searchResults = data
      } catch (e) {
        console.error('Erro na pesquisa:', e)
        if (seq === searchSeq.current) s.searchResults = { conversations: [], messages: [] }
      } finally {
        if (seq === searchSeq.current) s.isSearching = false
      }
    }, 400)
    return () => clearTimeout(t)
  }, [v.searchQuery, s])

  const clearSearch = () => { s.searchQuery = ''; s.searchResults = null }

  // trecho em volta da 1ª palavra encontrada, com as palavras marcadas (sem acento)
  const highlightParts = (text: string) => {
    const original = text || ''
    const palavras = normalizar(v.searchQuery).split(/\s+/).filter(Boolean)
    const norm = normalizar(original)
    let inicio = 0
    const primeira = palavras.length ? norm.indexOf(palavras[0]) : -1
    if (primeira > 60) inicio = primeira - 40
    const fim = Math.min(original.length, inicio + 180)
    const trecho = (inicio > 0 ? '…' : '') + original.slice(inicio, fim) + (fim < original.length ? '…' : '')
    const trechoNorm = normalizar(trecho)
    const marcas = new Array(trecho.length).fill(false)
    palavras.forEach(p => {
      let idx = trechoNorm.indexOf(p)
      while (idx !== -1) { for (let i = idx; i < idx + p.length; i++) marcas[i] = true; idx = trechoNorm.indexOf(p, idx + p.length) }
    })
    const parts: { text: string; hit: boolean }[] = []
    for (let i = 0; i < trecho.length; i++) {
      const last = parts[parts.length - 1]
      if (last && last.hit === marcas[i]) last.text += trecho[i]
      else parts.push({ text: trecho[i], hit: marcas[i] })
    }
    return parts
  }

  const openConversationMobile = (convId: number) => {
    conversationsStore.setActiveConversation(convId)
    s.mobileView = 'chat'
  }

  const openSearchResult = async (convId: number, messageId: number | null = null) => {
    if (!conversationsStore.conversations.some((c: Any) => c.id === convId)) {
      try {
        const { data } = await api.get(`/conversations/${convId}`)
        conversationsStore.conversations.push(data)
      } catch {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível abrir essa conversa.', showConfirmButton: false, timer: 3500 })
        return
      }
    }
    openConversationMobile(convId)
    if (!messageId) return
    s.highlightedMessageId = messageId
    setTimeout(() => document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500)
    setTimeout(() => { if (s.highlightedMessageId === messageId) s.highlightedMessageId = null }, 4000)
  }

  // --- agendadas --------------------------------------------------------------------------------
  const fetchScheduledMessages = async (id: number) => {
    try { s.scheduledMessages = (await api.get(`/conversations/${id}/scheduled_messages`)).data }
    catch (error) { console.error('Error fetching scheduled messages:', error) }
  }
  const onMessageScheduled = (m: Any) => {
    s.scheduledMessages.push(m)
    s.scheduledMessages.sort((a, b) => new Date(a.send_at).getTime() - new Date(b.send_at).getTime())
  }
  const cancelScheduledMessage = async (msgId: number) => {
    if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return
    try {
      await api.delete(`/conversations/${conversationsStore.activeConversation.id}/scheduled_messages/${msgId}`)
      s.scheduledMessages = s.scheduledMessages.filter(m => m.id !== msgId)
    } catch (error) {
      console.error('Error canceling scheduled message:', error)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao cancelar agendamento.', showConfirmButton: false, timer: 3500 })
    }
  }

  // --- atendente --------------------------------------------------------------------------------
  const agentsByDepartment = (() => {
    const groups: Record<string, Any[]> = {}
    ;(store.agents || []).forEach((a: Any) => { const d = a.department || 'corretor'; (groups[d] ||= []).push(a) })
    return ['corretor', 'suporte', 'financeiro', 'manutencao'].filter(d => groups[d]?.length).map(d => ({ dept: d, label: DEPT_LABELS[d] || d, agents: groups[d] }))
  })()

  const handleAssign = async (userId: string) => {
    if (!conversationsStore.activeConversation) return
    s.isAssigning = true
    try {
      await conversationsStore.assignConversation(conversationsStore.activeConversation.id, userId ? parseInt(userId) : null)
    } catch (error) {
      console.error('Error assigning conversation:', error)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao atribuir a conversa.', showConfirmButton: false, timer: 3500 })
    } finally {
      s.isAssigning = false
    }
  }
  const handleTransfer = async ({ userId, note }: { userId: number; note: string }) => {
    if (!conversationsStore.activeConversation) return
    s.isAssigning = true
    try {
      await conversationsStore.transferConversation(conversationsStore.activeConversation.id, userId, note)
      s.showTransferModal = false
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Conversa transferida!', showConfirmButton: false, timer: 3000 })
    } catch {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao transferir conversa.', showConfirmButton: false, timer: 3500 })
    } finally {
      s.isAssigning = false
    }
  }

  // --- painel: nome, campos, etapa ---------------------------------------------------------------
  const getAttr = (key: string) => conv?.contact?.custom_attributes?.[key]

  const startEditingName = () => {
    s.editingName = conv?.contact?.name || ''
    s.isEditingName = true
    setTimeout(() => { nameInputRef.current?.focus(); nameInputRef.current?.select() })
  }
  const saveContactName = async () => {
    if (!s.isEditingName) return
    s.isEditingName = false
    const contact = activeProxy()?.contact
    const novoNome = s.editingName.trim()
    if (!contact?.id || !novoNome || novoNome === contact.name) return
    try {
      await conversationsStore.updateContact(contact.id, { name: novoNome })
      if (contact.id_jueri) Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Nome salvo.', text: 'Essa revendedora é do Jueri: se o nome lá for diferente, ele volta na próxima sincronização.', showConfirmButton: false, timer: 6000 })
    } catch (e) {
      console.error('Erro ao salvar nome:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível salvar o nome.', showConfirmButton: false, timer: 3000 })
    }
  }

  const startEditingField = (key: string) => {
    s.editingFieldValue = getAttr(key) || ''
    s.editingFieldKey = key
    setTimeout(() => fieldInputRef.current?.focus())
  }
  const saveFieldValue = async () => {
    const key = s.editingFieldKey
    if (!key) return
    s.editingFieldKey = null
    const contact = activeProxy()?.contact
    const novoValor = s.editingFieldValue.trim()
    if (!contact?.id || novoValor === (contact.custom_attributes?.[key] || '')) return
    // o backend troca custom_attributes inteiro: manda o objeto completo só com o campo alterado
    const custom = { ...(contact.custom_attributes || {}) }
    if (novoValor) custom[key] = novoValor
    else delete custom[key]
    try { await conversationsStore.updateContact(contact.id, { custom_attributes: custom }) }
    catch (e) {
      console.error('Erro ao salvar campo:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível salvar.', showConfirmButton: false, timer: 3000 })
    }
  }

  const changeContactStatus = async (newStatus: string) => {
    const contact = activeProxy()?.contact
    if (!contact?.id || !newStatus || newStatus === contact.status) return
    s.isChangingStatus = true
    try { await conversationsStore.updateContact(contact.id, { status: newStatus }) }
    catch (e) {
      console.error('Erro ao mudar status:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao mudar etapa/status.', showConfirmButton: false, timer: 3000 })
    } finally {
      s.isChangingStatus = false
    }
  }

  const toggleGroup = (id: number) => {
    s.openGroupIds = s.openGroupIds.includes(id) ? s.openGroupIds.filter(x => x !== id) : [...s.openGroupIds, id]
  }
  const assignedKeys = new Set(v.contactFieldGroups.flatMap((g: Any) => g.field_keys || []))
  const unassignedFields = principalFields.filter((f: Any) => !assignedKeys.has(f.key))

  const enderecoCompleto = (() => { // (mantido da v1; não exibido hoje)
    const c = conv?.contact
    if (!c) return null
    const l1 = [c.street, c.address_number].filter(Boolean).join(', ')
    const l2 = [c.neighborhood, c.city, c.state].filter(Boolean).join(' - ')
    return [l1, l2, c.cep].filter(Boolean).join(' · ') || null
  })()
  void enderecoCompleto

  const getDadoValue = (f: Any) => {
    const c = conv?.contact
    if (!c) return null
    const raw = f.source === 'attr' ? c.custom_attributes?.[f.key] : c[f.key]
    if (!raw) return null
    if (f.format === 'date') return formatDate(raw)
    if (f.format === 'datetime') return formatDateTime(String(raw).replace(' ', 'T'))
    return raw
  }
  const reservedAttrKeys = [...principalFields.map((f: Any) => f.key), ...dadosFields.filter(f => f.source === 'attr').map(f => f.key), 'pedidos', 'telefones_adicionais']
  const extraAttributes = (() => {
    const custom = conv?.contact?.custom_attributes || {}
    return Object.keys(custom).filter(k => !reservedAttrKeys.includes(k) && custom[k]).map(k => ({ key: k, label: humanizeKey(k), value: custom[k] }))
  })()

  const pedidos = Array.isArray(conv?.contact?.pedidos) ? [...conv.contact.pedidos].sort((a: Any, b: Any) => new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime()) : []
  const totalVendido = pedidos.filter((p: Any) => p.status_id === 2).reduce((acc: number, p: Any) => acc + (parseFloat(p.valor_total) || 0), 0)
  const totalEmAberto = pedidos.filter((p: Any) => p.status_id === 1).reduce((acc: number, p: Any) => acc + (parseFloat(p.valor_total) || 0), 0)
  const totalMessagesCount = conv?.messages?.length || 0
  const daysAsClient = (() => {
    const created = conv?.contact?.created_at
    if (!created) return null
    const days = Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000)
    return days >= 0 ? days : null
  })()
  const lastMessageAt = conv?.messages?.length ? conv.messages[conv.messages.length - 1].timestamp : null
  const activeTagsCount = conv?.tags?.length || 0
  const lifecycleEvents = conv?.contact?.lifecycle_events || []
  const pedidosFechadosCount = pedidos.filter((p: Any) => p.status_id === 2).length
  const conversationAttachments = conv?.messages ? [...conv.messages].filter((m: Any) => m.attachmentUrl).reverse() : []
  const contactQuickInfoLines = (() => {
    const c = conv?.contact
    if (!c) return []
    const lines: { label: string; value: string }[] = []
    if (c.phone) lines.push({ label: 'Telefone', value: c.phone })
    if (c.email) lines.push({ label: 'E-mail', value: c.email })
    if (c.city) lines.push({ label: 'Cidade', value: `${c.city}${c.state ? '/' + c.state : ''}` })
    return lines
  })()

  // --- notas, resumo -----------------------------------------------------------------------------
  const saveNote = async () => {
    const contactId = conversationsStore.activeConversation?.contact?.id
    if (!contactId || !s.newNoteText.trim()) return
    s.isSavingNote = true
    try {
      await conversationsStore.addNote(contactId, s.newNoteText.trim())
      s.newNoteText = ''
    } catch (error) {
      console.error('Error saving note:', error)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao salvar nota.', showConfirmButton: false, timer: 3500 })
    } finally {
      s.isSavingNote = false
    }
  }

  const generateSummary = async () => {
    if (!conversationsStore.activeConversation) return
    s.isGeneratingSummary = true
    try {
      const response = await api.post(`/conversations/${conversationsStore.activeConversation.id}/generate_summary`)
      s.isPrivateMessage = true
      s.newMessageText = response.data.summary
    } catch (error) {
      console.error('Error generating summary:', error)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: (error as Any)?.response?.data?.error || 'Erro ao gerar resumo da conversa.', showConfirmButton: false, timer: 5000 })
    } finally {
      s.isGeneratingSummary = false
    }
  }

  // --- rolagem ---------------------------------------------------------------------------------
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = messagesContainerRef.current || document.querySelector('.chat-messages')
      if (el) el.scrollTop = el.scrollHeight
    })
  }
  const msgCount = conv?.messages?.length
  useEffect(() => { if (store.activeConversationId) scrollToBottom() }, [store.activeConversationId, msgCount])
  useWindowEvent('new-message', (e) => { if (e.detail && e.detail.conversationId === conversationsStore.activeConversationId) scrollToBottom() })

  const focusMessageInput = () => {
    const input = document.querySelector('.chat-input-area textarea') as HTMLTextAreaElement | null
    if (!input) return
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    input.focus()
    input.classList.add('input-focus-flash')
    setTimeout(() => input.classList.remove('input-focus-flash'), 600)
  }

  // --- ciclo de vida da tela -------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      // vindo de "Iniciar conversa": a lista pode ter só a recém-criada — busca completo mesmo assim
      if (conversationsStore.conversations.length === 0 || query.get('abrir')) await conversationsStore.fetchConversations()
      if (conversationsStore.agents.length === 0) conversationsStore.fetchAgents()
      api.get('/contact_field_groups').then(({ data }) => { s.contactFieldGroups = data }).catch(e => console.error('Erro ao buscar grupos de campos:', e))
      api.get('/message_templates').then(({ data }) => { s.messageTemplates = data }).catch(e => console.error('Erro ao buscar modelos de mensagem:', e))
      if (params.inboxId) conversationsStore.setSidebarInboxId(params.inboxId)
      else conversationsStore.setSidebarFilter(params.filter || 'all')
      if (query.get('abrir')) { conversationsStore.setActiveConversation(Number(query.get('abrir'))); s.mobileView = 'chat' }
      conversationsStore.setupWebSocket()
      scrollToBottom()
      fetchAllTags()
    })()
    const closeAll = () => {
      s.isEmojiPickerOpen = false
      s.isFilterPopoverOpen = false
      s.isSortPopoverOpen = false
      s.isDetailsMenuOpen = false
      s.showTagSuggestions = false
      s.showQuickInfo = false
    }
    document.addEventListener('click', closeAll)
    return () => { document.removeEventListener('click', closeAll); stopMic() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // troca de filtro/caixa pelo menu lateral
  const firstRoute = useRef(true)
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return }
    if (params.inboxId) conversationsStore.setSidebarInboxId(params.inboxId)
    else conversationsStore.setSidebarFilter(params.filter || 'all')
  }, [params.filter, params.inboxId])

  // agendadas + status da IA acompanham a conversa aberta
  useEffect(() => {
    const id = store.activeConversationId
    s.aiPauseStatus = { paused: false, remaining_seconds: 0 }
    if (!id) { s.scheduledMessages = []; return }
    fetchScheduledMessages(id)
    const fetchAiStatus = async () => {
      try { s.aiPauseStatus = (await api.get(`/conversations/${id}/ai_status`)).data }
      catch { s.aiPauseStatus = { paused: false, remaining_seconds: 0 } }
    }
    fetchAiStatus()
    const t = setInterval(fetchAiStatus, 15000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeConversationId])

  const resumeAi = async () => {
    const id = conversationsStore.activeConversationId
    if (!id) return
    try { await api.post(`/conversations/${id}/resume_ai`); s.aiPauseStatus = { paused: false, remaining_seconds: 0 } }
    catch (e) { console.error('Erro ao reativar IA:', e) }
  }

  // --- anexo / envio -----------------------------------------------------------------------------
  const setSelectedFile = (file: File) => {
    // ref(): o File não pode ser "embrulhado" pelo valtio — ler file.name pelo proxy dá
    // "Illegal invocation" e derruba a tela inteira (tela branca ao anexar imagem)
    s.selectedFile = ref(file)
    s.selectedFilePreview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
  }
  const handlePaste = (event: React.ClipboardEvent) => {
    // Ctrl+V com print/imagem copiada vira anexo
    const items = event.clipboardData?.items
    if (!items) return
    const imageItem = Array.from(items).find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    event.preventDefault()
    const file = imageItem.getAsFile()
    if (file) setSelectedFile(file)
  }
  const clearSelectedFile = () => {
    if (s.selectedFilePreview) { URL.revokeObjectURL(s.selectedFilePreview); s.selectedFilePreview = null }
    s.selectedFile = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const notifySendError = (error: Any) => {
    const status = error?.response?.status
    let detalhe = error?.response?.data?.message
    if (!detalhe && status === 413) detalhe = 'Arquivo grande demais.'
    if (!detalhe && !error?.response) detalhe = 'Sem resposta do servidor (conexão caiu ou arquivo grande demais).'
    if (!detalhe && status) detalhe = `Erro ${status} no servidor.`
    Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível enviar a mensagem.', text: detalhe || 'Tente novamente.', showConfirmButton: false, timer: 6000 })
  }
  const handleSendMessage = async () => {
    if (sending.current || !(s.newMessageText.trim() || s.selectedFile)) return
    sending.current = true
    // só limpa o campo depois que o backend confirmar (senão a falha passava despercebida)
    try {
      const arquivo = s.selectedFile ? await prepareImage(s.selectedFile) : null
      await conversationsStore.sendMessage(s.newMessageText, s.isPrivateMessage, arquivo)
      s.newMessageText = ''
      clearSelectedFile()
      scrollToBottom()
    } catch (error) {
      console.error('Error sending message:', error)
      notifySendError(error)
    } finally {
      sending.current = false
    }
  }

  // modelos de mensagem: "/" abre a lista; escolher substitui o texto (dá pra editar antes de enviar)
  const slashSuggestions = (() => {
    const text = v.newMessageText
    if (!text.startsWith('/')) return []
    const term = text.slice(1).trim().toLowerCase()
    return v.messageTemplates.filter((t: Any) => !term || t.nome.toLowerCase().includes(term) || (t.categoria || '').toLowerCase().includes(term)).slice(0, 8)
  })()
  const applyTemplate = async (template: Any) => {
    s.newMessageText = template.mensagem || ''
    if (!template.attachment_url) { clearSelectedFile(); return }
    try {
      const response = await fetch(template.attachment_url)
      const blob = await response.blob()
      const filename = decodeURIComponent(template.attachment_url.split('/').pop().split('?')[0] || 'anexo')
      setSelectedFile(new File([blob], filename, { type: template.attachment_type || blob.type }))
    } catch (e) {
      console.error('Erro ao carregar áudio do modelo:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao carregar o áudio do modelo.', showConfirmButton: false, timer: 3500 })
    }
  }

  // botão "T": transcreve o áudio sob demanda (fica salvo no backend)
  const transcribeAudio = async (msgId: number) => {
    if (s.transcribingIds[msgId]) return
    s.transcribingIds[msgId] = true
    try {
      const { data } = await api.post(`/conversations/${conversationsStore.activeConversation.id}/messages/${msgId}/transcribe`)
      const m = activeProxy()?.messages?.find((x: Any) => x.id === msgId)
      if (m) m.transcription = data.transcription
    } catch (error: Any) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: error.response?.data?.error || 'Falha ao transcrever o áudio.', showConfirmButton: false, timer: 4000 })
    } finally {
      delete s.transcribingIds[msgId]
    }
  }

  // gravação de áudio na hora (MediaRecorder): clica pra gravar, clica de novo pra enviar
  const startRecording = async () => {
    const r = recorder.current
    try { r.stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch (err) {
      console.error('Erro ao acessar microfone:', err)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível acessar o microfone.', showConfirmButton: false, timer: 3500 })
      return
    }
    r.chunks = []
    r.mediaRecorder = new MediaRecorder(r.stream)
    r.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) r.chunks.push(e.data) }
    r.mediaRecorder.start()
    s.isRecording = true
    s.recordingSeconds = 0
    r.interval = setInterval(() => { s.recordingSeconds++ }, 1000)
  }
  function stopMic() {
    const r = recorder.current
    r.stream?.getTracks().forEach(t => t.stop())
    r.stream = null
    if (r.interval) clearInterval(r.interval)
    s.isRecording = false
    s.recordingSeconds = 0
  }
  const cancelRecording = () => {
    const mr = recorder.current.mediaRecorder
    if (mr && mr.state !== 'inactive') { mr.onstop = null; mr.stop() }
    stopMic()
  }
  const finishRecording = () => {
    const r = recorder.current
    const mr = r.mediaRecorder
    if (!mr || mr.state === 'inactive') return
    mr.onstop = () => {
      const blob = new Blob(r.chunks, { type: 'audio/webm' })
      stopMic()
      if (blob.size === 0) return
      const audioFile = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
      conversationsStore.sendMessage('', s.isPrivateMessage, audioFile).then(scrollToBottom).catch((error: Any) => { console.error('Error sending audio:', error); notifySendError(error) })
    }
    mr.stop()
  }

  // --- etiquetas -----------------------------------------------------------------------------------
  const fetchAllTags = async () => {
    try { s.allTags = (await api.get('/tags')).data } catch (e) { console.error('Erro ao buscar etiquetas da conta:', e) }
  }
  const tagSuggestions = (() => {
    const q = v.newTagName.trim().toLowerCase()
    const already = new Set((conv?.tags || []).map((t: Any) => t.id))
    return v.allTags.filter((t: Any) => !already.has(t.id)).filter((t: Any) => !q || t.name.toLowerCase().includes(q))
  })()
  const addTag = async () => {
    const convId = conversationsStore.activeConversationId
    const name = s.newTagName.trim()
    if (!convId || !name) return
    try {
      await api.post(`/conversations/${convId}/tags`, { name, color: s.newTagColor })
      s.newTagName = ''
      s.newTagColor = TAG_COLORS[0]
      s.showTagSuggestions = false
      fetchAllTags()
    } catch (e: Any) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || 'Erro ao adicionar etiqueta.', showConfirmButton: false, timer: 3500 })
    }
  }
  const pickTagSuggestion = (tag: Any) => {
    s.newTagName = tag.name
    s.newTagColor = tag.color
    s.showTagSuggestions = false
    addTag()
  }
  const removeTag = async (tagId: number) => {
    const convId = conversationsStore.activeConversationId
    if (!convId) return
    try { await api.delete(`/conversations/${convId}/tags/${tagId}`) }
    catch (e) {
      console.error('Erro ao remover etiqueta:', e)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao remover etiqueta.', showConfirmButton: false, timer: 3000 })
    }
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const semResposta = store.sidebarFilteredConversations.filter(isSemResposta).length
  const minhas = store.sidebarFilteredConversations.filter((c: Any) => c.assignee_id === store.currentUser.id).length
  const naoAtribuidas = store.sidebarFilteredConversations.filter((c: Any) => !c.assignee).length
  const inboxes = useSnapshot(inboxesStore) as Any
  const tabs = [
    { id: 'all', label: 'Todas', n: store.sidebarFilteredConversations.length },
    { id: 'sem-resposta', label: 'Sem resposta', n: semResposta },
    { id: 'minhas', label: 'Minhas', n: minhas },
    { id: 'nao-atribuidos', label: 'Não atribuídas', n: naoAtribuidas },
  ]
  const fieldRow = (key: string, label: string) => (v.editingFieldKey === key ? (
    <div key={key} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</span>
      <input ref={fieldInputRef} value={v.editingFieldValue} style={{ ...inputStyle, padding: '7px 10px', fontSize: 12.5 }}
        onChange={e => { s.editingFieldValue = e.target.value }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveFieldValue() } else if (e.key === 'Escape') { e.preventDefault(); s.editingFieldKey = null } }}
        onBlur={saveFieldValue} />
    </div>
  ) : <Field key={key} label={label} value={getAttr(key) || 'Clique pra preencher'} empty={!getAttr(key)} onClick={() => startEditingField(key)} />)
  const toggle = (open: boolean) => (open ? <Minus size={14} color="var(--muted)" /> : <Plus size={14} color="var(--muted)" />)
  const small: React.CSSProperties = { fontSize: 12.5, color: 'var(--muted)', margin: 0 }
  const chipBtn = (on: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid ' + (on ? 'var(--terra)' : 'var(--line)'), background: on ? 'var(--terra)' : 'var(--bg)', color: on ? '#fff' : 'var(--muted)' })
  const squareBtn: React.CSSProperties = { width: 34, height: 34, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }

  // separador de dia entre as mensagens (padrão do v2)
  let lastDay = ''
  const dayOf = (iso: string) => {
    const d = new Date(iso)
    const hoje = new Date()
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
    if (d.toDateString() === hoje.toDateString()) return 'Hoje'
    if (d.toDateString() === ontem.toDateString()) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' }).replace('.', '')
  }
  const hora = (iso: string) => (iso && iso.includes('T') ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : iso)
  const listTime = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toDateString() === new Date().toDateString() ? hora(iso) : dayOf(iso) + ' ' + hora(iso)
  }
  // ===================== layout do Kommo (Comunicações › Inbox de chat) =====================
  // lista | card do lead (painel escuro + abas) | histórico (tarefas + bloco do WhatsApp + composer)
  const showDetails = isMobile ? v.mobileView === 'details' : detailsOpen
  // colunas encolhem em tela menor (notebook) em vez de empurrar o histórico pra fora da tela
  const gridCols = isMobile ? '1fr' : conv && showDetails ? 'minmax(240px,340px) minmax(270px,330px) minmax(0,1fr)' : 'minmax(260px,365px) minmax(0,1fr)'
  const me = store.currentUser || {}
  const canCreateTask = ['gerente', 'diretoria'].includes(me.role)

  // tarefas pendentes do contato (aparecem no topo do histórico, igual ao Kommo)
  const [tasks, setTasks] = useState<Any[]>([])
  const [taskResult, setTaskResult] = useState<Record<number, string>>({})
  const contactId = conv?.contact?.id
  const loadTasks = async (id = contactId) => { if (!id) return setTasks([]); try { setTasks((await api.get('/tarefas', { params: { contact_id: id, status: 'pendente' } })).data) } catch { setTasks([]) } }
  useEffect(() => { loadTasks() }, [contactId])
  const completeTask = async (t: Any) => {
    try { await api.patch(`/tarefas/${t.id}/complete`, { resultado: taskResult[t.id] || null }); setTasks(ts => ts.filter(x => x.id !== t.id)); Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tarefa concluída.', showConfirmButton: false, timer: 2500 }) }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível concluir.', showConfirmButton: false, timer: 3000 }) }
  }

  // funil do lead no cabeçalho: Consignado (régua) pra revendedora; senão o 1º funil em que está
  const [cards, setCards] = useState<Any[]>([])
  const [pipes, setPipes] = useState<Any[]>([])
  useEffect(() => { if (contactId) api.get('/pipeline_cards', { params: { contact_id: contactId } }).then(r => setCards(r.data)).catch(() => setCards([])) }, [contactId])
  useEffect(() => { api.get('/pipelines').then(r => setPipes(r.data)).catch(() => {}) }, [])
  const card = cards[0]
  const cardPipe = card && pipes.find(p => p.id === card.pipeline_id)
  const regua = !!conv?.contact?.id_jueri || !card
  const reguaKeys = [...Object.keys(ACTIVE_STATUS_LABELS), ...Object.keys(INACTIVE_STATUS_LABELS)]
  const stageIdx = regua ? reguaKeys.indexOf(conv?.contact?.status || 'revendedor_ativo') : (cardPipe?.pipeline_stages || []).findIndex((x: Any) => x.id === card?.pipeline_stage_id)
  const stageTotal = regua ? Object.keys(ACTIVE_STATUS_LABELS).length : (cardPipe?.pipeline_stages || []).length
  const stageDays = regua ? daysInStage(conv?.contact) : card ? Math.floor((Date.now() - new Date(card.stage_entered_at).getTime()) / 86_400_000) : null
  const moveCard = async (stageId: number) => {
    try { const { data } = await api.put(`/pipeline_cards/${card.id}`, { pipeline_stage_id: stageId }); setCards(cs => cs.map(c => (c.id === data.id ? data : c))); loadTasks() }
    catch (e: Any) { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || 'Erro ao mudar etapa.', showConfirmButton: false, timer: 3000 }) }
  }

  // composer: Bate-papo / Nota / Tarefa (o "Bate-papo ▾" do Kommo)
  const [mode, setMode] = useState<'chat' | 'nota' | 'tarefa'>('chat')
  const [modeOpen, setModeOpen] = useState(false)
  const [taskForm, setTaskForm] = useState({ tipo: 'manual_acompanhamento', vencimento: '', titulo: '' })
  useEffect(() => { s.isPrivateMessage = mode === 'nota' }, [mode])
  const createTask = async () => {
    if (!taskForm.titulo.trim() || !contactId) return
    try {
      await api.post('/tarefas', { tarefa: { contact_id: contactId, tipo: taskForm.tipo, titulo: taskForm.titulo, vencimento_em: taskForm.vencimento ? new Date(taskForm.vencimento).toISOString() : new Date().toISOString() } })
      setTaskForm(f => ({ ...f, titulo: '', vencimento: '' })); setMode('chat'); loadTasks()
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tarefa criada.', showConfirmButton: false, timer: 2500 })
    } catch (e: Any) { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || e.response?.data?.error || 'Não foi possível criar a tarefa.', showConfirmButton: false, timer: 3500 }) }
  }

  const [listMenu, setListMenu] = useState(false)
  const [headMenu, setHeadMenu] = useState(false)
  const [tabMenu, setTabMenu] = useState(false)
  const [tagBox, setTagBox] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [showResolve, setShowResolve] = useState(false)
  const [runBot, setRunBot] = useState(false)
  const [botOpts, setBotOpts] = useState<Any[]>([])
  useEffect(() => { if (runBot) api.get('/salesbots/options').then(r => setBotOpts(r.data)).catch(() => setBotOpts([])) }, [runBot])
  const executarRobo = async (b: Any) => {
    try { await api.post(`/salesbots/${b.id}/run`, { contact_id: conv.contact.id, conversation_id: conv.id }); setRunBot(false); Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Robô "${b.name}" iniciado.`, showConfirmButton: false, timer: 2500 }) }
    catch (e: Any) { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || 'Não foi possível iniciar o robô.', showConfirmButton: false, timer: 3500 }) }
  }
  // card do lead no rosa da Clara (hsl(347 52% 88%)), texto em vinho — pedido da cliente
  const dark = '#f0d0d7', ink = '#4a2430', inkMuted = '#85525f', inkSoft = '#9a6b77'
  const convNo = (c: Any) => 'A' + String(c.id).padStart(5, '0')
  const tabsK = v.contactFieldGroups.length
    ? v.contactFieldGroups.map((g: Any, i: number) => ({ id: i === 0 ? 'principal' : 'g' + g.id, label: g.name, group: g }))
    : [{ id: 'principal', label: 'Principal', group: null }]
  const moreTabs = [{ id: 'configuracoes', label: 'Ajustes' }, ...(me.role === 'diretoria' ? [{ id: 'setup', label: 'Configurações' }] : [])]
  const activeTab = tabsK.find((x: Any) => x.id === v.activeDetailsTab)
  const fieldsOfGroup = (g: Any) => (g?.field_keys || []).map((k: string) => fieldOf(k)).filter((fd: Any) => fd && !fd.hidden)
  const saveField = async (key: string, value: Any) => {
    const contact = activeProxy()?.contact
    if (!contact?.id) return
    const custom = { ...(contact.custom_attributes || {}) }
    if (value === '' || value == null || (Array.isArray(value) && !value.length)) delete custom[key]; else custom[key] = value
    try { await conversationsStore.updateContact(contact.id, { custom_attributes: custom }) }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Não foi possível salvar.', showConfirmButton: false, timer: 3000 }) }
  }
  const uploadField = async (key: string, file: File) => {
    const contact = activeProxy()?.contact
    if (!contact?.id) return
    const fd = new FormData(); fd.append('file', file)
    try { const { data } = await api.post(`/contacts/${contact.id}/field_file`, fd, { params: { key }, headers: { 'Content-Type': undefined } }); contact.custom_attributes = data.custom_attributes }
    catch (e: Any) { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: e.response?.data?.message || 'Não foi possível enviar o arquivo.', showConfirmButton: false, timer: 3500 }) }
  }
  const kfield = (fd: Any) => <KField key={fd.key} field={fd} value={getAttr(fd.key)} onSave={(val: Any) => saveField(fd.key, val)} onUpload={(f: File) => uploadField(fd.key, f)} />
  // linha de campo no jeito do Kommo: rótulo cinza à esquerda, valor (ou "...") à direita, clica e edita
  const rowK = (key: string, label: string) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', minHeight: 32, gap: 10 }}>
      <span title={label} style={{ width: '42%', flex: 'none', color: K.muted, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {v.editingFieldKey === key
        ? <input ref={fieldInputRef} value={v.editingFieldValue} onChange={e => { s.editingFieldValue = e.target.value }} onBlur={saveFieldValue}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveFieldValue() } else if (e.key === 'Escape') { e.preventDefault(); s.editingFieldKey = null } }}
            style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: `1px solid ${K.blue}`, outline: 'none', fontFamily: K.font, fontSize: 14, padding: '3px 0', background: 'none' }} />
        : <span onClick={() => startEditingField(key)} style={{ flex: 1, minWidth: 0, fontSize: 14, color: getAttr(key) ? K.text : K.muted, cursor: 'text', overflowWrap: 'anywhere' }}>{getAttr(key) || '...'}</span>}
    </div>
  )
  const roRow = (label: string, value: Any, key?: string) => (
    <div key={key || label} style={{ display: 'flex', alignItems: 'center', minHeight: 32, gap: 10 }}>
      <span style={{ width: '42%', flex: 'none', color: K.muted, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: value ? K.text : K.muted, overflowWrap: 'anywhere' }}>{value || '...'}</span>
    </div>
  )
  const sectionK = (title: string) => <div key={'sec-' + title} style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: K.muted, margin: '16px 0 4px' }}>{title}</div>
  const kSmallBtn: React.CSSProperties = { whiteSpace: 'nowrap', height: 30, padding: '0 12px', border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', fontFamily: K.font, fontSize: 13, color: K.text, cursor: 'pointer' }
  const menuK: React.CSSProperties = { position: 'absolute', zIndex: 40, background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,.14)', padding: '6px 0', minWidth: 210 }
  const menuItemK: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 16px', fontFamily: K.font, fontSize: 14, color: K.text, cursor: 'pointer' }

  return (
    <div className="conv-fullbleed" style={{ fontFamily: K.font, color: K.text }}>
      <div className="conv-grid conv-grid-3" style={{ gridTemplateColumns: gridCols }}>
        {/* ---------------- lista ---------------- */}
        <div className="conv-col" data-hide={v.mobileView !== 'list' ? '1' : '0'} style={{ borderRight: `1px solid ${K.line}`, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 3 }}>
          <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: `1px solid ${K.line}`, flex: 'none' }}>
            <Search size={18} color={K.text} />
            <input value={v.searchQuery} placeholder="Buscar" onChange={e => { s.searchQuery = e.target.value }} onKeyDown={e => { if (e.key === 'Escape') clearSearch() }}
              style={{ flex: 1, border: 'none', outline: 'none', fontFamily: K.font, fontSize: 16, background: 'none', color: K.text }} />
            {v.searchQuery && <button title="Limpar pesquisa" onClick={clearSearch} style={{ border: 'none', background: 'none', color: K.muted, display: 'flex', cursor: 'pointer' }}><X size={15} /></button>}
          </div>
          {!isSearchActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: `1px solid ${K.line}`, flex: 'none', position: 'relative' }}>
              <button onClick={() => setListMenu(m => !m)} title="Trocar filtro" style={{ fontFamily: K.font, fontSize: 13, padding: '2px 8px', border: '1px solid #b9d98a', background: '#e6f2d2', color: '#4f6b25', borderRadius: 2, cursor: 'pointer' }}>
                {(tabs.find(t => t.id === store.currentFilter) || tabs[0]).id === 'all' ? 'Conversas abertas' : tabs.find(t => t.id === store.currentFilter)?.label}
                {store.advancedFilters.length > 0 && ` + ${store.advancedFilters.length} filtro(s)`}
              </button>
              {params.inboxId && <span style={{ fontSize: 12.5, color: K.muted }}>{inboxes.inboxes.find((i: Any) => String(i.id) === String(params.inboxId))?.name}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: K.muted }}>Total: {store.filteredConversations.length}</span>
              <button title="Mais opções" onClick={e => { stop(e); setListMenu(m => !m) }} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', color: K.text }}><MoreHorizontal size={18} /></button>
              {listMenu && (
                <div style={{ ...menuK, top: '100%', right: 10 }} onClick={stop}>
                  <div style={{ padding: '4px 16px', fontSize: 11.5, fontWeight: 700, color: K.muted, textTransform: 'uppercase' }}>Mostrar</div>
                  {tabs.map(t => (
                    <button key={t.id} onClick={() => { conversationsStore.setFilter(t.id); setListMenu(false) }} style={{ ...menuItemK, background: (store.currentFilter === t.id || (t.id === 'all' && !tabs.some(x => x.id === store.currentFilter))) ? '#fcf0f3' : 'none' }}>
                      <span style={{ flex: 1 }}>{t.id === 'all' ? 'Conversas abertas' : t.label}</span><span style={{ color: K.muted }}>{t.n}</span>
                    </button>
                  ))}
                  {inboxes.inboxes.length > 1 && (<>
                    <div style={{ borderTop: `1px solid ${K.line}`, margin: '6px 0' }} />
                    <div style={{ padding: '4px 16px', fontSize: 11.5, fontWeight: 700, color: K.muted, textTransform: 'uppercase' }}>Canal</div>
                    <button onClick={() => { navigate('/conversas'); setListMenu(false) }} style={{ ...menuItemK, background: !params.inboxId ? '#fcf0f3' : 'none' }}>Todos os canais</button>
                    {inboxes.inboxes.map((i: Any) => <button key={i.id} onClick={() => { navigate(`/conversas/inbox/${i.id}`); setListMenu(false) }} style={{ ...menuItemK, background: String(params.inboxId) === String(i.id) ? '#fcf0f3' : 'none' }}>{i.name}{i.connected === false ? ' (desconectada)' : ''}</button>)}
                  </>)}
                  <div style={{ borderTop: `1px solid ${K.line}`, margin: '6px 0' }} />
                  <button onClick={() => { setListMenu(false); s.isFilterPopoverOpen = true }} style={menuItemK}><Filter size={14} /> Filtro avançado</button>
                  <button onClick={() => { setListMenu(false); s.isSortPopoverOpen = true }} style={menuItemK}><ArrowDownUp size={14} /> Ordenar</button>
                  <button onClick={() => { setListMenu(false); s.isNewConversationModalOpen = true }} style={menuItemK}><Plus size={14} /> Nova conversa</button>
                </div>
              )}
              <div style={{ position: 'absolute', top: '100%', right: 10 }}>
                <ConversationFilterPopover isOpen={v.isFilterPopoverOpen} initialFilters={store.advancedFilters} onClose={() => { s.isFilterPopoverOpen = false }} onApply={(f: Any) => conversationsStore.setAdvancedFilters(f)} />
                <ConversationSortPopover isOpen={v.isSortPopoverOpen} onClose={() => { s.isSortPopoverOpen = false }} />
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {isSearchActive ? (
              v.isSearching && !v.searchResults ? <p style={{ fontSize: 14, color: K.muted, padding: 20, textAlign: 'center' }}>Pesquisando…</p> : v.searchResults ? (
                <>
                  {v.searchResults.conversations.length > 0 && <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: K.muted, margin: '14px 16px 6px' }}>Contatos</p>}
                  {v.searchResults.conversations.map((r: Any) => (
                    <button key={'c' + r.conversation_id} onClick={() => openSearchResult(r.conversation_id)} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: `1px solid ${K.line}`, background: 'none', fontFamily: K.font, cursor: 'pointer' }}>
                      <span style={{ display: 'flex', gap: 8 }}><b style={{ flex: 1, fontSize: 14 }}>{r.contact_name}</b><span style={{ fontSize: 12, color: K.muted }}>{formatSearchDate(r.last_activity_iso)}</span></span>
                      <span style={{ display: 'block', fontSize: 13, color: K.muted, marginTop: 2 }}>{r.contact_phone}{r.inbox_name && ' · ' + r.inbox_name}{r.status === 'resolved' && ' · Fechada'}</span>
                    </button>
                  ))}
                  {v.searchResults.messages.length > 0 && <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: K.muted, margin: '14px 16px 6px' }}>Mensagens</p>}
                  {v.searchResults.messages.map((m: Any) => (
                    <button key={'m' + m.id} onClick={() => openSearchResult(m.conversation_id, m.id)} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: `1px solid ${K.line}`, background: 'none', fontFamily: K.font, cursor: 'pointer' }}>
                      <span style={{ display: 'flex', gap: 8 }}><b style={{ flex: 1, fontSize: 14 }}>{m.contact_name}</b><span style={{ fontSize: 12, color: K.muted }}>{formatSearchDate(m.timestamp)}</span></span>
                      <span style={{ display: 'block', fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
                        {m.sender && <span style={{ color: K.muted }}>{m.sender}: </span>}
                        {highlightParts(m.text).map((part, i) => (part.hit ? <mark key={i} style={{ background: '#fff3a8', fontWeight: 700 }}>{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>))}
                      </span>
                    </button>
                  ))}
                  {!v.searchResults.conversations.length && !v.searchResults.messages.length && <p style={{ fontSize: 14, color: K.muted, padding: '40px 20px', textAlign: 'center' }}>Nada encontrado para "{v.searchQuery}".</p>}
                </>
              ) : null
            ) : (
              <>
                {store.filteredConversations.map((c: Any) => {
                  const on = c.id === store.activeConversationId
                  const last = c.messages?.[c.messages.length - 1]
                  const fg = on ? '#fff' : K.text
                  return (
                    <button key={c.id} onClick={() => openConversationMobile(c.id)}
                      style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px 10px 16px', border: 'none', borderBottom: `1px solid ${on ? K.blue : K.line}`, background: on ? K.blue : c.unread > 0 ? '#fcf0f3' : '#fff', fontFamily: K.font, cursor: 'pointer' }}>
                      <span style={{ position: 'relative', flex: 'none' }}>
                        <ChatAvatar nome={c.contact.name || ''} foto={c.contact.avatar_url} size={42} />
                        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: '50%', background: '#fff', padding: 1, display: 'flex' }}><WhatsappIcon source={c.source || 'whatsapp'} /></span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b style={{ flex: '0 1 auto', minWidth: 0, fontSize: 15, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.contact.name}</b>
                          <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '0 4px', borderRadius: 2, background: on ? 'rgba(255,255,255,.25)' : '#7dbb2d', color: '#fff' }}>{convNo(c)}</span>
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: 13, color: on ? '#fff' : K.muted, whiteSpace: 'nowrap' }}>{listTime(c.last_activity_iso)}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: on ? '#fff' : c.unread > 0 ? K.text : '#5c6670', fontWeight: c.unread > 0 ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {(last?.senderType === 'agent' ? (last.agentName || 'Você') : c.contact.name) + ': ' + mediaLabel(c.preview, last?.attachmentType)}
                          </span>
                          {c.unread > 0 && <span style={{ flex: 'none', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#e53935', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread > 99 ? '99+' : c.unread}</span>}
                        </span>
                      </span>
                    </button>
                  )
                })}
                {store.filteredConversations.length === 0 && (
                  <div style={{ padding: '44px 20px', textAlign: 'center', color: K.muted, fontSize: 14 }}>Nenhuma conversa neste filtro.</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---------------- card do lead (painel escuro do Kommo) ---------------- */}
        {conv && showDetails && (
          <div className="conv-col conv-details" data-hide='0' style={{ borderRight: `1px solid ${K.line}`, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ background: dark, color: ink, padding: '16px 18px 0', flex: 'none', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <button title="Fechar card" onClick={() => { if (isMobile) s.mobileView = 'chat'; else setDetailsOpen(false) }} style={{ border: 'none', background: 'none', color: inkMuted, cursor: 'pointer', padding: '4px 0', display: 'flex' }}><ChevronLeft size={18} /></button>
                {v.isEditingName ? (
                  <input ref={nameInputRef} value={v.editingName} maxLength={120} onChange={e => { s.editingName = e.target.value }} onBlur={saveContactName}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveContactName() } else if (e.key === 'Escape') { e.preventDefault(); s.isEditingName = false } }}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', borderBottom: `1px solid ${ink}`, color: ink, fontFamily: K.font, fontSize: 22, fontWeight: 700, outline: 'none' }} />
                ) : (
                  <h2 onClick={startEditingName} title="Clique pra editar o nome" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 700, textTransform: 'uppercase', cursor: 'text', overflowWrap: 'anywhere' }}>{conv.contact.name}</h2>
                )}
                <div style={{ position: 'relative' }}>
                  <button title="Mais" onClick={e => { stop(e); setHeadMenu(m => !m) }} style={{ border: 'none', background: 'none', color: ink, cursor: 'pointer', display: 'flex', padding: 4 }}><MoreHorizontal size={20} /></button>
                  {headMenu && (
                    <div style={{ ...menuK, top: '100%', right: 0, color: K.text }} onClick={stop}>
                      <button onClick={() => { setHeadMenu(false); s.isEditModalOpen = true }} style={menuItemK}><Edit2 size={14} /> Editar contato</button>
                      <button onClick={() => { setHeadMenu(false); navigate('/settings/tags') }} style={menuItemK}># Gerenciar tags</button>
                      <button onClick={() => { setHeadMenu(false); navigate(`/contatos/${conv.contact.id}`) }} style={menuItemK}><ExternalLink size={14} /> Abrir ficha completa</button>
                      <button disabled={!conv.assignee_id} onClick={() => { setHeadMenu(false); s.showTransferModal = true }} style={{ ...menuItemK, opacity: conv.assignee_id ? 1 : 0.45 }}><Forward size={14} /> Transferir com nota</button>
                      <button onClick={() => { setHeadMenu(false); s.isScheduleModalOpen = true }} style={menuItemK}><Clock size={14} /> Agendar mensagem</button>
                      <button onClick={() => { setHeadMenu(false); setRunBot(true) }} style={menuItemK}><Bot size={14} /> Executar robô</button>
                      <button onClick={() => { setHeadMenu(false); s.isMergeModalOpen = true }} style={menuItemK}><GitMerge size={14} /> Mesclar contato</button>
                      <div style={{ borderTop: `1px solid ${K.line}`, margin: '6px 0' }} />
                      <button onClick={() => { setHeadMenu(false); s.isDeleteConversationModalOpen = true }} style={{ ...menuItemK, color: '#e53935' }}><MessageCircle size={14} /> Apagar conversa</button>
                      <button onClick={() => { setHeadMenu(false); s.isDeleteModalOpen = true }} style={{ ...menuItemK, color: '#e53935' }}><Trash2 size={14} /> Apagar contato</button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, margin: '10px 0 0 26px', position: 'relative' }}>
                <span style={{ fontSize: 14, color: inkMuted, marginRight: 2 }}>#{conv.contact.id}</span>
                {(conv.tags || []).map((t: Any) => (
                  <span key={t.id} title="Clique pra remover" onClick={() => removeTag(t.id)} style={{ fontSize: 13, textTransform: 'uppercase', padding: '1px 7px', border: `1px solid ${t.color || '#7f8b97'}`, background: 'rgba(255,255,255,.6)', color: ink, borderRadius: 2, cursor: 'pointer' }}>{t.name}</span>
                ))}
                <button onClick={e => { stop(e); setTagBox(b => !b) }} style={{ fontSize: 11.5, textTransform: 'uppercase', padding: '2px 7px', border: '1px solid rgba(90,36,51,.35)', background: 'none', color: ink, borderRadius: 2, cursor: 'pointer' }}>#adicionar tags</button>
                {tagBox && (
                  <div onClick={stop} style={{ ...menuK, top: '100%', left: 0, padding: 10, width: 260, color: K.text }}>
                    <input autoFocus value={v.newTagName} onChange={e => { s.newTagName = e.target.value; s.showTagSuggestions = true }} onKeyUp={e => { if (e.key === 'Enter') { addTag(); setTagBox(false) } }} placeholder="Buscar ou criar tag" style={kInput} />
                    <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
                      {tagSuggestions.map((t: Any) => <button key={t.id} onClick={() => { pickTagSuggestion(t); setTagBox(false) }} style={{ ...menuItemK, padding: '6px 4px' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color }} />{t.name}</button>)}
                    </div>
                    {v.newTagName.trim() && <button onClick={() => { addTag(); setTagBox(false) }} style={{ ...kBtn('blue'), marginTop: 6, width: '100%', justifyContent: 'center' }}>Criar "{v.newTagName.trim()}"</button>}
                  </div>
                )}
              </div>
              {/* funil › etapa (dias) + barra de progresso */}
              <div style={{ margin: '14px 0 0 26px' }}>
                <div style={{ fontSize: 13, color: inkMuted }}>{regua ? 'Consignado' : cardPipe?.name}</div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>{regua ? statusLabel(conv.contact.status) : cardPipe?.pipeline_stages.find((x: Any) => x.id === card?.pipeline_stage_id)?.name}</span>
                  {stageDays != null && <span style={{ fontSize: 14, color: inkMuted, marginLeft: 6 }}>({stageDays} dias)</span>}
                  <span style={{ flex: 1 }} />
                  <ChevronDown size={16} color={inkMuted} />
                  {regua ? (
                    <select aria-label="Etapa" value={conv.contact.status || 'revendedor_ativo'} disabled={v.isChangingStatus} onChange={e => changeContactStatus(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
                      {statusOptions.map(grp => <optgroup key={grp.group} label={grp.group}>{Object.entries(grp.options).map(([key, label]) => <option key={key} value={key}>{label as string}</option>)}</optgroup>)}
                    </select>
                  ) : (
                    <select aria-label="Etapa" value={card?.pipeline_stage_id} onChange={e => moveCard(Number(e.target.value))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
                      {(cardPipe?.pipeline_stages || []).map((x: Any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  )}
                </div>
                <div style={{ height: 3, background: 'rgba(90,36,51,.18)', borderRadius: 2, margin: '7px 0 0' }}>
                  <div style={{ height: 3, borderRadius: 2, background: '#8e2a46', width: `${stageTotal ? Math.min(100, ((Math.max(stageIdx, 0) + 1) / stageTotal) * 100) : 0}%` }} />
                </div>
              </div>
              {/* abas */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, margin: '16px 0 0 26px', position: 'relative' }}>
                {/* as abas rolam de lado dentro do painel quando não cabem (nunca passam da borda) */}
                <div className="k-tabs" style={{ flex: 1, minWidth: 0, display: 'flex', gap: 16, overflowX: 'auto', scrollbarWidth: 'none', paddingRight: 14, maskImage: 'linear-gradient(90deg, #000 calc(100% - 22px), transparent)', WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 22px), transparent)' }}>
                  {tabsK.map(tab => {
                    const on = v.activeDetailsTab === tab.id
                    return <button key={tab.id} onClick={e => { s.activeDetailsTab = tab.id; (e.currentTarget as HTMLElement).scrollIntoView({ inline: 'nearest', block: 'nearest' }) }} style={{ flex: 'none', whiteSpace: 'nowrap', border: 'none', background: 'none', padding: '0 0 9px', fontFamily: K.font, fontSize: 14.5, fontWeight: 700, color: on ? ink : inkSoft, borderBottom: `2px solid ${on ? ink : 'transparent'}`, cursor: 'pointer' }}>{tab.label}</button>
                  })}
                </div>
                <button title="Mais abas" onClick={e => { stop(e); setTabMenu(m => !m) }} style={{ border: 'none', background: 'none', color: moreTabs.some(t => t.id === v.activeDetailsTab) ? ink : inkSoft, padding: '0 0 9px', cursor: 'pointer', display: 'flex' }}><MoreHorizontal size={18} /></button>
                {tabMenu && (
                  <div style={{ ...menuK, top: '100%', right: 0, color: K.text }} onClick={stop}>
                    {moreTabs.map(t => <button key={t.id} onClick={() => { s.activeDetailsTab = t.id; setTabMenu(false) }} style={{ ...menuItemK, background: v.activeDetailsTab === t.id ? '#fcf0f3' : 'none' }}>{t.label}</button>)}
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px 24px 44px' }}>
              {activeTab && (
                <>
                  {activeTab.id === 'principal' && (
                    <div style={{ display: 'flex', alignItems: 'center', minHeight: 32, gap: 10 }}>
                      <span style={{ width: '42%', flex: 'none', color: K.muted, fontSize: 14 }}>Usuário responsável</span>
                      <select value={conv.assignee_id || ''} onChange={e => handleAssign(e.target.value)} disabled={v.isAssigning} style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontFamily: K.font, fontSize: 14, color: K.text, padding: 0, cursor: 'pointer' }}>
                        <option value="">Não atribuído</option>
                        {agentsByDepartment.map(group => <optgroup key={group.dept} label={group.label}>{group.agents.map((agent: Any) => <option key={agent.id} value={agent.id}>{agent.first_name} {agent.last_name}</option>)}</optgroup>)}
                      </select>
                    </div>
                  )}
                  {activeTab.group ? fieldsOfGroup(activeTab.group).map(kfield) : principalFields.filter((fd: Any) => !fd.hidden).map(kfield)}
                  {activeTab.id === 'principal' && (<>
                    {unassignedFields.filter((fd: Any) => !fd.hidden).length > 0 && sectionK('Outros')}
                    {unassignedFields.filter((fd: Any) => !fd.hidden).map(kfield)}
                    {sectionK('Contato')}
                    {roRow('Telefone', formatPhoneDisplay(conv.contact.phone))}
                    {roRow('E-mail', conv.contact.email)}
                    {roRow('Carteira', conv.contact.custom_attributes?.gerente_jueri_nome)}
                    {sectionK('Notas')}
                    {(conv.contact?.notes || []).map((n: Any) => (
                      <div key={n.id} style={{ fontSize: 13.5, padding: '6px 0', borderBottom: `1px solid ${K.line}` }}>
                        <span style={{ display: 'block', fontSize: 12, color: K.muted }}>{n.author} · {new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{n.content}</span>
                      </div>
                    ))}
                    <textarea value={v.newNoteText} onChange={e => { s.newNoteText = e.target.value }} placeholder="Adicionar nota…" rows={2} style={{ ...kInput, height: 'auto', padding: 8, marginTop: 8, resize: 'vertical' }} />
                    {v.newNoteText.trim() && <button onClick={saveNote} disabled={v.isSavingNote} style={{ ...kBtn('blue'), marginTop: 6 }}>{v.isSavingNote ? 'Salvando…' : 'Salvar nota'}</button>}
                  </>)}
                  {/^dados/i.test(activeTab.label) && (<>
                    {sectionK('Cadastro')}
                    {roRow('E-mail', conv.contact.email)}
                    {(conv.contact.reseller_phones || []).map((tp: Any) => roRow(tp.label || 'Telefone adicional', tp.phone, 't-' + tp.id))}
                    {roRow('Data de cadastro', formatDate(conv.contact.created_at))}
                    {sectionK('Dados do Jueri (sincronizado)')}
                    {dadosFields.map(fd => roRow(fd.label, getDadoValue(fd), 'j-' + fd.key))}
                    {extraAttributes.filter(a => !fieldOf(a.key)?.label || fieldOf(a.key)?.label === a.key).map(a => roRow(a.label, String(a.value), 'x-' + a.key))}
                    {sectionK('Anexos da conversa')}
                    {conversationAttachments.length ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {conversationAttachments.map((a: Any) => (
                          <a key={a.id} href={a.attachmentUrl} target="_blank" rel="noreferrer" style={{ aspectRatio: '1', border: `1px solid ${K.line}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: K.muted }}>
                            {a.attachmentType?.startsWith('image/') ? <img src={a.attachmentUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : mediaLabel('📎', a.attachmentType)}
                          </a>
                        ))}
                      </div>
                    ) : <p style={{ fontSize: 13.5, color: K.muted, margin: 0 }}>Nenhum anexo.</p>}
                  </>)}
                  {/^financ/i.test(activeTab.label) && (<>
                    {sectionK('Resumo')}
                    {roRow('Total vendido', brl(totalVendido))}
                    {roRow('Em aberto', brl(totalEmAberto))}
                    {sectionK('Pedidos / acertos (Jueri)')}
                    {pedidos.length ? pedidos.map((p: Any) => (
                      <div key={p.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${K.line}`, fontSize: 13.5 }}>
                        <span style={{ fontSize: 11.5, textTransform: 'uppercase', padding: '0 6px', border: `1px solid ${K.lineDark}`, borderRadius: 2, color: K.muted }}>{PEDIDO_STATUS_LABELS[p.status_id] || '—'}</span>
                        <span style={{ flex: 1, color: K.muted }}>{formatDate(p.data_criacao)}</span><b>{brl(p.valor_total)}</b>
                      </div>
                    )) : <p style={{ fontSize: 13.5, color: K.muted, margin: 0 }}>Nenhum pedido sincronizado.</p>}
                  </>)}
                  {/^estat/i.test(activeTab.label) && (<>
                    {sectionK('Números')}
                    {roRow('Dias como revendedora', daysAsClient)}
                    {roRow('Dias na etapa', stageDays)}
                    {roRow('Mensagens', totalMessagesCount)}
                    {roRow('Pedidos baixados', pedidosFechadosCount)}
                    {roRow('Tags', activeTagsCount)}
                    {roRow('Última interação', formatDateTime(lastMessageAt))}
                    {sectionK('Ciclo de vida')}
                    {lifecycleEvents.length ? lifecycleEvents.map((ev: Any) => roRow(LIFECYCLE_EVENT_LABELS[ev.event_type] || ev.event_type, formatDateTime(ev.occurred_at), 'ev' + ev.id)) : <p style={{ fontSize: 13.5, color: K.muted, margin: 0 }}>Nenhum marco registrado.</p>}
                  </>)}
                </>
              )}

              {v.activeDetailsTab === 'setup' && <FieldSetup onClose={() => { s.activeDetailsTab = 'principal' }} onChanged={() => api.get('/contact_field_groups').then(r => { s.contactFieldGroups = r.data })} />}

              {v.activeDetailsTab === 'configuracoes' && (
                <>
                  {roRow('Criado em', formatDateTime(conv.contact.created_at))}
                  {roRow('Última mudança de etapa', formatDateTime(conv.contact.status_changed_at))}
                  {sectionK('Mensagens agendadas')}
                  {v.scheduledMessages.length ? v.scheduledMessages.map((m: Any) => (
                    <div key={m.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${K.line}`, fontSize: 13.5 }}>
                      <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 12.5, color: K.link }}>{new Date(m.send_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b>{m.text}</span>
                      <button title="Cancelar envio" onClick={() => cancelScheduledMessage(m.id)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={14} /></button>
                    </div>
                  )) : <p style={{ fontSize: 13.5, color: K.muted, margin: 0 }}>Nenhuma.</p>}
                  <button onClick={() => { s.isScheduleModalOpen = true }} style={{ ...kSmallBtn, marginTop: 8 }}>+ Agendar mensagem</button>
                  {sectionK('Ações')}
                  <button onClick={() => { s.isMergeModalOpen = true }} style={{ ...kSmallBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><GitMerge size={14} /> Mesclar com outro contato</button>
                  <button onClick={() => { s.isDeleteModalOpen = true }} style={{ ...kSmallBtn, display: 'flex', alignItems: 'center', gap: 6, color: '#e53935' }}><Trash2 size={14} /> Apagar este contato</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---------------- histórico (feed do Kommo) ---------------- */}
        <div className="conv-col" data-hide={v.mobileView === 'chat' ? '0' : '1'} style={{ background: '#f5f5f5', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {conv ? (
            <>
              {(isMobile || !showDetails) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${K.line}`, flex: 'none' }}>
                  <button className="conv-back" onClick={() => { s.mobileView = 'list' }} style={{ display: 'none', border: 'none', background: 'none', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
                  <button onClick={() => { if (isMobile) s.mobileView = 'details'; else setDetailsOpen(true) }} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', textAlign: 'left', fontFamily: K.font, cursor: 'pointer' }}>
                    <ChatAvatar nome={conv.contact.name || ''} foto={conv.contact.avatar_url} size={34} />
                    <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 15 }}>{conv.contact.name}</b><span style={{ fontSize: 13, color: K.link }}>Abrir card do lead</span></span>
                  </button>
                </div>
              )}

              <div ref={messagesContainerRef} className="chat-messages" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, padding: '18px clamp(10px, 2vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* bloco do WhatsApp: mensagens da conversa num cartão branco */}
                <div style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, boxShadow: '0 3px 0 -1px #fff, 0 3px 0 0 #e3e5e8, 0 6px 0 -1px #fff, 0 6px 0 0 #e3e5e8', padding: '14px 18px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: '#5c6670', marginBottom: 12 }}>
                    <span style={{ width: 14, height: 14, display: 'flex' }}><WhatsappIcon source="whatsapp" /></span>{conv.inbox_phone || conv.inbox_name || 'WhatsApp'}
                  </div>
                  {conv.messages.map((msg: Any) => {
                    const day = dayOf(msg.timestamp)
                    const sep = day !== lastDay
                    lastDay = day
                    const out = msg.senderType === 'agent'
                    const hit = v.highlightedMessageId === msg.id
                    const head = `${formatDate(msg.timestamp) || ''} ${hora(msg.timestamp)} ${out ? (msg.agentName || 'Você') : conv.contact.name}`
                    if (msg.isPrivate) {
                      return (
                        <div key={msg.id} id={'msg-' + msg.id} style={{ margin: '8px 0', padding: '8px 12px', background: '#fffbe6', border: '1px solid #f1e0a0', borderRadius: 3, fontSize: 14 }}>
                          <span style={{ display: 'block', fontSize: 12.5, color: K.muted, marginBottom: 2 }}>{head} · Nota</span>
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        </div>
                      )
                    }
                    return (
                      <div key={msg.id} id={'msg-' + msg.id}>
                        {sep && <div style={{ textAlign: 'center', fontSize: 12.5, color: K.muted, margin: '10px 0' }}>{day}</div>}
                        <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, margin: '4px 0' }}>
                          {!out && <ChatAvatar nome={conv.contact.name || ''} foto={conv.contact.avatar_url} size={34} />}
                          <div style={{ maxWidth: '74%', padding: '8px 12px', borderRadius: 6, fontSize: 14.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', outline: hit ? '2px solid #f0a33a' : undefined, ...(out ? { background: '#f0d0d7', color: '#4a2430' } : { background: '#f1f2f4', color: K.text }) }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, opacity: 1, color: out ? '#85525f' : K.muted, marginBottom: 3 }}>
                              {head}{out && <><CheckCheck size={13} /> Entregue</>}
                            </span>
                            {msg.attachmentUrl && (
                              msg.attachmentType?.startsWith('image/') ? (
                                <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 6 }}><img src={msg.attachmentUrl} alt="Anexo" onLoad={scrollToBottom} style={{ display: 'block', maxWidth: 260, maxHeight: 320, borderRadius: 4, objectFit: 'cover', cursor: 'zoom-in' }} /></a>
                              ) : msg.attachmentType?.startsWith('audio/') ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <audio src={msg.attachmentUrl} controls style={{ maxWidth: 240, height: 36 }} />
                                  {!msg.transcription && <button disabled={!!v.transcribingIds[msg.id]} onClick={() => transcribeAudio(msg.id)} title={v.transcribingIds[msg.id] ? 'Transcrevendo…' : 'Transcrever áudio'} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid currentColor', background: 'none', color: 'inherit', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{v.transcribingIds[msg.id] ? '…' : 'T'}</button>}
                                </span>
                              ) : msg.attachmentType?.startsWith('video/') ? (
                                <video src={msg.attachmentUrl} controls onLoadedData={scrollToBottom} style={{ display: 'block', maxWidth: 280, maxHeight: 360, borderRadius: 4, marginBottom: 6, background: '#000' }} />
                              ) : (
                                <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid currentColor', borderRadius: 3, marginBottom: 6, color: 'inherit', fontSize: 13 }}><Paperclip size={14} /> Ver anexo</a>
                              )
                            )}
                            {msg.transcription && <span style={{ display: 'block', fontSize: 13, fontStyle: 'italic', opacity: 0.85, marginBottom: 4 }}>Transcrição: “{msg.transcription}”</span>}
                            {msg.text && !(msg.attachmentUrl && isMediaPlaceholder(msg.text)) && <span style={{ display: 'block' }}>{isMediaPlaceholder(msg.text) ? mediaLabel(msg.text, msg.attachmentType) : msg.text}</span>}
                            {(msg.attachmentUrl || msg.text) && <button onClick={() => { s.forwardingMessage = { ...msg } }} title="Encaminhar" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', color: 'inherit', opacity: 0.7, fontSize: 12, padding: 0, marginTop: 4, cursor: 'pointer' }}><Forward size={11} /> Encaminhar</button>}
                          </div>
                          {out && <ChatAvatar nome={msg.agentName || me.first_name || ''} foto={null} size={34} />}
                        </div>
                      </div>
                    )
                  })}
                  {conv.messages.length === 0 && <p style={{ fontSize: 14, color: K.muted, textAlign: 'center', margin: '20px 0' }}>Nenhuma mensagem ainda.</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {conv.status === 'open' || !conv.status ? (<>
                      <button onClick={() => setShowResolve(true)} style={kSmallBtn}>Fechar conversa</button>
                      <button onClick={() => setShowSnooze(true)} style={kSmallBtn}>Colocar em espera</button>
                    </>) : (
                      <button onClick={() => conversationsStore.updateConversationStatus(conv.id, 'open')} style={kSmallBtn}>{conv.status === 'snoozed' ? 'Em espera — reabrir' : 'Fechada — reabrir'}</button>
                    )}
                    <button onClick={generateSummary} disabled={v.isGeneratingSummary} style={{ ...kSmallBtn, display: 'flex', alignItems: 'center', gap: 5 }}>{v.isGeneratingSummary ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />} Resumo</button>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#7dbb2d', whiteSpace: 'nowrap', marginLeft: 'auto' }}>Nº {convNo(conv)}</span>
                  </div>
                </div>

                {/* tarefas pendentes, com borda rosa quando atrasadas (igual ao Kommo) */}
                {tasks.map(t => {
                  const late = t.vencimento_em && new Date(t.vencimento_em) < new Date()
                  const dias = late ? Math.floor((Date.now() - new Date(t.vencimento_em).getTime()) / 86_400_000) : 0
                  return (
                    <div key={t.id} style={{ display: 'flex', gap: 12, background: '#fff', border: `1px solid ${late ? '#f3a5b5' : K.line}`, borderRadius: 3, padding: '12px 14px' }}>
                      <Clock size={30} color={late ? '#e2557a' : K.muted} strokeWidth={1.3} style={{ flex: 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: K.muted }}>{formatDateTime(t.vencimento_em)}{late && <span style={{ color: '#e2557a' }}> ({dias} dias)</span>} {t.user ? `para ${t.user.first_name || ''}` : ''}</div>
                        <div style={{ fontSize: 14.5, margin: '3px 0 2px' }}><b>{TIPOS_TAREFA[t.tipo] || t.tipo}</b> — {t.titulo}</div>
                        {t.descricao && <div style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{t.descricao.split('\n').map((l: string) => '-' + l).join('\n')}</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <input value={taskResult[t.id] || ''} onChange={e => setTaskResult(r => ({ ...r, [t.id]: e.target.value }))} placeholder="Adicionar resultado" style={{ ...kInput, flex: '1 1 160px' }} />
                          <button onClick={() => completeTask(t)} style={{ height: 36, padding: '0 14px', border: 'none', borderRadius: 3, background: '#c5cbd1', color: '#fff', fontFamily: K.font, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Tarefa concluída</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {v.aiPauseStatus.paused && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', background: '#fffbe6', color: '#6b5300', fontSize: 13.5, borderTop: '1px solid #f1e0a0' }}>
                  <BotOff size={15} /><span style={{ flex: 1 }}>IA pausada — <b>{formatAiRemaining(v.aiPauseStatus.remaining_seconds)}</b> para voltar sozinha</span>
                  <button onClick={resumeAi} style={kSmallBtn}>Reativar agora</button>
                </div>
              )}

              <AiSessionsBar contactId={conv.contact.id} refreshKey={conv.messages?.length} />
              {/* composer: "Bate-papo ▾ com Nome:" */}
              <div style={{ margin: '0 clamp(8px, 2vw, 22px) 14px', background: '#fff', border: `1px solid ${mode === 'nota' ? '#f1e0a0' : K.line}`, borderRadius: 3, padding: '10px 14px', position: 'relative', flex: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, marginBottom: 6, position: 'relative', flexWrap: 'wrap' }}>
                  <button onClick={e => { stop(e); setModeOpen(o => !o) }} style={{ border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 14, textDecoration: 'underline dotted', cursor: 'pointer' }}>{mode === 'chat' ? 'Bate-papo' : mode === 'nota' ? 'Nota' : 'Tarefa'}</button>
                  {mode === 'chat' && <>com <span style={{ color: K.link }}>{conv.contact.name}</span>{conv.inbox_name && <span style={{ color: K.muted }}> · pelo {conv.inbox_name}</span>}:</>}
                  {modeOpen && (
                    <div style={{ ...menuK, bottom: '100%', left: 0 }} onClick={stop}>
                      <button onClick={() => { setMode('chat'); setModeOpen(false) }} style={menuItemK}>Bate-papo</button>
                      <button onClick={() => { setMode('nota'); setModeOpen(false) }} style={menuItemK}>Nota</button>
                      {canCreateTask && <button onClick={() => { setMode('tarefa'); setModeOpen(false) }} style={menuItemK}>Tarefa</button>}
                    </div>
                  )}
                </div>

                {mode === 'tarefa' ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="datetime-local" value={taskForm.vencimento} onChange={e => setTaskForm(f => ({ ...f, vencimento: e.target.value }))} style={{ ...kInput, width: 210 }} />
                    <select value={taskForm.tipo} onChange={e => setTaskForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...kInput, width: 200 }}>{Object.entries(TIPOS_TAREFA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <input value={taskForm.titulo} onChange={e => setTaskForm(f => ({ ...f, titulo: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') createTask() }} placeholder="O que precisa ser feito" style={{ ...kInput, flex: 1, minWidth: 180 }} />
                    <button onClick={createTask} disabled={!taskForm.titulo.trim()} style={kBtn('blue')}>Definir</button>
                  </div>
                ) : v.isRecording ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={cancelRecording} title="Cancelar gravação" style={kSmallBtn}><X size={15} /></button>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e53935', animation: 'pulse 1s infinite' }} />Gravando áudio… {formatRecordingTime(v.recordingSeconds)}</span>
                    <button onClick={finishRecording} style={kBtn('blue')}><Send size={14} /> Enviar</button>
                  </div>
                ) : (
                  <>
                    {slashSuggestions.length > 0 && (
                      <div style={{ ...menuK, left: 0, right: 0, bottom: '100%', marginBottom: 4, maxHeight: 260, overflowY: 'auto' }}>
                        <div style={{ padding: '4px 16px', fontSize: 11.5, fontWeight: 700, color: K.muted, textTransform: 'uppercase' }}>Modelos de mensagem</div>
                        {slashSuggestions.map((tpl: Any) => (
                          <button key={tpl.id} onClick={() => applyTemplate(tpl)} style={menuItemK}><b style={{ color: K.link }}>{tpl.nome}</b><span style={{ flex: 1, minWidth: 0, color: K.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.mensagem || 'Anexo'}</span></button>
                        ))}
                      </div>
                    )}
                    {v.selectedFile && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, border: `1px solid ${K.line}`, borderRadius: 3, marginBottom: 6 }}>
                        {v.selectedFilePreview ? <img src={v.selectedFilePreview} style={{ width: 40, height: 40, objectFit: 'cover' }} /> : <Paperclip size={16} />}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.selectedFile.name}</span>
                        <button onClick={clearSelectedFile} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={15} /></button>
                      </div>
                    )}
                    <textarea value={v.newMessageText} rows={2} onChange={e => { s.newMessageText = e.target.value }} onPaste={handlePaste}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); handleSendMessage() } }}
                      placeholder={mode === 'nota' ? 'Escreva uma nota (só a equipe vê)' : 'Escreva uma mensagem · / para modelos'}
                      style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontFamily: K.font, fontSize: 15, color: K.text, background: 'none', minHeight: 40, maxHeight: 160, fieldSizing: 'content' } as React.CSSProperties} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <input type="file" ref={fileInputRef} hidden onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f) }} />
                      {mode === 'chat' && <>
                        <button title="Anexar arquivo" onClick={() => fileInputRef.current?.click()} style={{ border: 'none', background: 'none', color: K.muted, padding: 6, display: 'flex', cursor: 'pointer' }}><Paperclip size={17} /></button>
                        <div style={{ position: 'relative' }}>
                          <button title="Emojis" onClick={e => { stop(e); s.isEmojiPickerOpen = !s.isEmojiPickerOpen }} style={{ border: 'none', background: 'none', color: K.muted, padding: 6, display: 'flex', cursor: 'pointer' }}><Smile size={17} /></button>
                          {v.isEmojiPickerOpen && <div onClick={stop} style={{ position: 'absolute', bottom: 36, left: 0, zIndex: 30 }}><EmojiPicker emojiStyle={EmojiStyle.NATIVE} onEmojiClick={e => { s.newMessageText += e.emoji }} lazyLoadEmojis /></div>}
                        </div>
                        {!v.newMessageText.trim() && !v.selectedFile && <button title="Gravar áudio" onClick={startRecording} style={{ border: 'none', background: 'none', color: K.muted, padding: 6, display: 'flex', cursor: 'pointer' }}><Mic size={17} /></button>}
                      </>}
                      <span style={{ flex: 1 }} />
                      <button onClick={handleSendMessage} disabled={!v.newMessageText.trim() && !v.selectedFile} style={{ ...kBtn('blue'), opacity: v.newMessageText.trim() || v.selectedFile ? 1 : 0.5 }}>{mode === 'nota' ? 'Salvar nota' : 'Enviar'}</button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: K.muted, fontSize: 15, padding: 40, textAlign: 'center' }}>Selecione uma conversa à esquerda.</div>
          )}
        </div>

        {/* modais */}
        <EditContactModal isOpen={v.isEditModalOpen} contact={conv?.contact} onClose={() => { s.isEditModalOpen = false }} />
        <MergeContactModal isOpen={v.isMergeModalOpen} contact={conv?.contact} onClose={() => { s.isMergeModalOpen = false }} />
        <DeleteContactModal isOpen={v.isDeleteModalOpen} contact={conv?.contact} onClose={() => { s.isDeleteModalOpen = false }} />
        <DeleteConversationModal isOpen={v.isDeleteConversationModalOpen} conversation={conv} onClose={() => { s.isDeleteConversationModalOpen = false }} />
        <NewConversationModal isOpen={v.isNewConversationModalOpen} onClose={() => { s.isNewConversationModalOpen = false }}
          onCreated={(c: Any) => { conversationsStore.setActiveConversation(c.id); s.mobileView = 'chat' }} />
        <ForwardMessageModal isOpen={!!v.forwardingMessage} message={v.forwardingMessage} onClose={() => { s.forwardingMessage = null }} />
        {v.showTransferModal && <TransferModal agents={store.agents} currentAssigneeId={conv?.assignee_id} onClose={() => { s.showTransferModal = false }} onConfirm={handleTransfer} />}
        <ScheduleMessageModal isOpen={v.isScheduleModalOpen} conversationId={conv?.id} onClose={() => { s.isScheduleModalOpen = false }} onScheduled={onMessageScheduled} />
        {conv && runBot && createPortal(
          <div className="modal-overlay" onClick={() => setRunBot(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={stop} style={{ width: 420, maxWidth: '100%', background: '#fff', borderRadius: 4, padding: 22, fontFamily: K.font }}>
              <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700 }}>Executar robô</h2>
              <p style={{ margin: '0 0 14px', fontSize: 14, color: K.muted }}>O robô roda agora para {conv.contact.name}.</p>
              {botOpts.map((b: Any) => <button key={b.id} onClick={() => executarRobo(b)} style={{ ...menuItemK, border: `1px solid ${K.line}`, borderRadius: 3, marginBottom: 6 }}><Bot size={14} /> {b.name}{!b.active && <span style={{ color: K.muted, fontSize: 12.5 }}> (desligado)</span>}</button>)}
              {!botOpts.length && <p style={{ fontSize: 14, color: K.muted }}>Nenhum robô criado ainda (Automações › Robôs).</p>}
              <div style={{ textAlign: 'right', marginTop: 8 }}><button onClick={() => setRunBot(false)} style={kBtn('ghost')}>Fechar</button></div>
            </div>
          </div>, document.body)}
        {conv && showSnooze && createPortal(<SnoozeModal conversationId={conv.id} onClose={() => setShowSnooze(false)} onConfirm={async (until: string) => { setShowSnooze(false); await conversationsStore.snoozeConversation(conv.id, until) }} />, document.body)}
        {conv && showResolve && createPortal(<ResolveModal conversationId={conv.id} onClose={() => setShowResolve(false)} onConfirm={async (opts: Any) => { setShowResolve(false); await conversationsStore.resolveConversation(conv.id, opts) }} />, document.body)}
      </div>
    </div>
  )
}

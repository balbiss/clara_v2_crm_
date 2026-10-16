import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react'
import {
  Filter, ArrowDownUp, MoreVertical, Paperclip, Smile, CheckCheck, Send, Info, X, ExternalLink, Mail, Phone, Copy, MessageCircle,
  Edit2, GitMerge, Trash2, Minus, Plus, ChevronDown, Sparkles, Loader2, BotOff, Bot, Mic, Pencil, Forward,
} from 'lucide-react'
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

// Porte de views/Conversas.vue (lista + chat + painel da revendedora).
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
  const { allFields: principalFields, labelOf: fieldLabelOf } = useContactFields()
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
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao gerar resumo da conversa.', showConfirmButton: false, timer: 3500 })
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
    s.selectedFile = file
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
  const showDetails = isMobile ? v.mobileView === 'details' : detailsOpen
  const gridCols = isMobile ? '1fr' : conv && showDetails ? '340px minmax(0,1fr) 340px' : '340px minmax(0,1fr)'

  return (
    <div className="conv-fullbleed">
      <div className="conv-grid conv-grid-3" style={{ gridTemplateColumns: gridCols }}>
        {/* ---------------- lista ---------------- */}
        <div className="conv-col" data-hide={v.mobileView !== 'list' ? '1' : '0'} style={{ borderRight: '1px solid var(--line)', background: 'var(--card)', display: 'flex', flexDirection: 'column', overflow: 'visible', minHeight: 0, position: 'relative', zIndex: 3 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ ...serif, fontSize: 21, margin: 0, flex: 1 }}>{listTitle}</h1>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{store.filteredConversations.length}</span>
              <button title="Nova conversa" style={squareBtn} onClick={e => { stop(e); s.isNewConversationModalOpen = true }}><Plus size={16} /></button>
              <div style={{ position: 'relative' }}>
                <button title="Filtrar" style={{ ...squareBtn, borderColor: store.advancedFilters.length ? 'var(--terra)' : 'var(--line)', color: store.advancedFilters.length ? 'var(--terra)' : 'var(--ink)' }}
                  onClick={e => { stop(e); s.isFilterPopoverOpen = !s.isFilterPopoverOpen; s.isSortPopoverOpen = false }}><Filter size={15} /></button>
                <ConversationFilterPopover isOpen={v.isFilterPopoverOpen} initialFilters={store.advancedFilters}
                  onClose={() => { s.isFilterPopoverOpen = false }} onApply={(f: Any) => conversationsStore.setAdvancedFilters(f)} />
              </div>
              <div style={{ position: 'relative' }}>
                <button title="Ordenar" style={squareBtn} onClick={e => { stop(e); s.isSortPopoverOpen = !s.isSortPopoverOpen; s.isFilterPopoverOpen = false }}><ArrowDownUp size={15} /></button>
                <ConversationSortPopover isOpen={v.isSortPopoverOpen} onClose={() => { s.isSortPopoverOpen = false }} />
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <input value={v.searchQuery} placeholder="Pesquisar nome, telefone ou mensagem…" style={{ ...inputStyle, paddingRight: 32 }}
                onChange={e => { s.searchQuery = e.target.value }} onKeyDown={e => { if (e.key === 'Escape') clearSearch() }} />
              {v.searchQuery && <button title="Limpar pesquisa" onClick={clearSearch} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: 'var(--muted)', display: 'flex' }}><X size={14} /></button>}
            </div>
            {inboxes.inboxes.length > 1 && !isSearchActive && (
              <select value={params.inboxId || ''} style={inputStyle}
                onChange={e => navigate(e.target.value ? `/conversas/inbox/${e.target.value}` : '/conversas')}>
                <option value="">Todas as caixas</option>
                {inboxes.inboxes.map((i: Any) => <option key={i.id} value={i.id}>{i.name}{i.connected === false ? ' (desconectada)' : ''}</option>)}
              </select>
            )}
            {!isSearchActive && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {tabs.map(t => (
                  <button key={t.id} style={chipBtn(store.currentFilter === t.id)} onClick={() => conversationsStore.setFilter(t.id)}>
                    {t.label}<span style={{ opacity: 0.75, fontWeight: 700 }}>{t.n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {isSearchActive ? (
              v.isSearching && !v.searchResults ? <p style={{ ...small, padding: 20, textAlign: 'center' }}>Pesquisando…</p> : v.searchResults ? (
                <>
                  {v.searchResults.conversations.length > 0 && <p style={{ ...labelStyle, margin: '14px 16px 6px' }}>Revendedoras</p>}
                  {v.searchResults.conversations.map((r: Any) => (
                    <button key={'c' + r.conversation_id} onClick={() => openSearchResult(r.conversation_id)} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: '1px solid var(--line)', background: 'none' }}>
                      <span style={{ display: 'flex', gap: 8 }}><b style={{ flex: 1, fontSize: 13.5 }}>{r.contact_name}</b><span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{formatSearchDate(r.last_activity_iso)}</span></span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.contact_phone}{r.inbox_name && ' · ' + r.inbox_name}{r.status === 'resolved' && ' · Resolvida'}</span>
                    </button>
                  ))}
                  {v.searchResults.messages.length > 0 && <p style={{ ...labelStyle, margin: '14px 16px 6px' }}>Mensagens</p>}
                  {v.searchResults.messages.map((m: Any) => (
                    <button key={'m' + m.id} onClick={() => openSearchResult(m.conversation_id, m.id)} style={{ width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: '1px solid var(--line)', background: 'none' }}>
                      <span style={{ display: 'flex', gap: 8 }}><b style={{ flex: 1, fontSize: 13.5 }}>{m.contact_name}</b><span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{formatSearchDate(m.timestamp)}</span></span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink)', marginTop: 3, lineHeight: 1.5 }}>
                        {m.sender && <span style={{ color: 'var(--muted)' }}>{m.sender}: </span>}
                        {highlightParts(m.text).map((part, i) => (part.hit ? <mark key={i} style={{ background: 'var(--terraSoft)', color: 'var(--terra)', fontWeight: 700 }}>{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>))}
                      </span>
                      {m.inbox_name && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.inbox_name}</span>}
                    </button>
                  ))}
                  {!v.searchResults.conversations.length && !v.searchResults.messages.length && <p style={{ ...small, padding: '40px 20px', textAlign: 'center' }}>Nada encontrado para "{v.searchQuery}".</p>}
                </>
              ) : null
            ) : (
              <>
                {store.filteredConversations.map((c: Any) => {
                  const on = c.id === store.activeConversationId
                  const last = c.messages?.[c.messages.length - 1]
                  return (
                    <button key={c.id} onClick={() => openConversationMobile(c.id)}
                      style={{ width: '100%', display: 'flex', gap: 11, alignItems: 'center', padding: '13px 14px', border: 'none', borderBottom: '1px solid var(--line)', background: on ? 'var(--bg)' : 'transparent', boxShadow: 'inset 3px 0 0 ' + (on ? 'var(--terra)' : 'transparent') }}>
                      <ChatAvatar nome={c.contact.name || ''} foto={c.contact.avatar_url} size={38} />
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.contact.name}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{listTime(c.last_activity_iso)}</span>
                        </span>
                        {c.tags?.length > 0 && <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{c.tags.slice(0, 2).map((t: Any) => <Tag key={t.id} name={t.name} color={t.color} />)}{c.tags.length > 2 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>+{c.tags.length - 2}</span>}</span>}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {c.inbox_name && <span title={'Caixa: ' + c.inbox_name + (c.inbox_phone ? ' (' + c.inbox_phone + ')' : '')} style={{ flex: 'none', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, color: 'var(--olive)', background: 'var(--oliveSoft)' }}>{c.inbox_name}</span>}
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: c.unread > 0 ? 'var(--ink)' : 'var(--muted)', fontWeight: c.unread > 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(last?.senderType === 'agent' ? 'Você: ' : '') + (c.preview || '')}</span>
                          {c.unread > 0 && <span style={{ flex: 'none', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--olive)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread > 99 ? '99+' : c.unread}</span>}
                        </span>
                        {c.assignee && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Atendente: {c.assignee}</span>}
                      </span>
                    </button>
                  )
                })}
                {store.filteredConversations.length === 0 && (
                  <div style={{ padding: '44px 20px', textAlign: 'center' }}>
                    <p style={{ fontSize: 13.5, margin: '0 0 4px' }}>Nenhuma conversa neste filtro.</p>
                    <p style={small}>Ajuste os filtros, a caixa ou a aba.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---------------- chat ---------------- */}
        <div className="conv-col" data-hide={v.mobileView === 'chat' ? '0' : '1'} style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {conv ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'var(--card)', flex: 'none' }}>
                <button className="conv-back" onClick={() => { s.mobileView = 'list' }} style={{ display: 'none', width: 30, height: 30, flex: 'none', border: '1px solid var(--line)', borderRadius: 8, background: 'none', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>‹</button>
                <button onClick={() => { if (isMobile) s.mobileView = 'details'; else setDetailsOpen(o => !o) }} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', textAlign: 'left', padding: 0 }}>
                  <ChatAvatar nome={conv.contact.name || ''} foto={conv.contact.avatar_url} size={38} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.contact.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                      #{conv.id}{conv.contact.id_jueri ? ' · ' + statusLabel(conv.contact.status) : ''}{conv.assignee ? ' · ' + conv.assignee : ''}{conv.inbox_name ? ' · pela caixa ' + conv.inbox_name : ''}
                    </span>
                  </span>
                </button>
                <ConversationStatusDropdown conversationId={conv.id} currentStatus={conv.status} />
                <ConversationMoreOptionsDropdown conversationId={conv.id} contactId={conv.contact?.id} contactStatus={conv.contact?.status}
                  onContactBlocked={() => { activeProxy().contact.status = 'blocked' }}
                  onContactUnblocked={() => { activeProxy().contact.status = 'active' }} />
                <button onClick={() => { if (isMobile) s.mobileView = 'details'; else setDetailsOpen(o => !o) }} style={btn('ghost', { padding: '7px 12px', fontSize: 12.5 })}>
                  {detailsOpen ? 'Ocultar ficha' : 'Ver revendedora'}
                </button>
              </div>

              <div ref={messagesContainerRef} className="chat-messages" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conv.messages.map((msg: Any) => {
                  const day = dayOf(msg.timestamp)
                  const sep = day !== lastDay
                  lastDay = day
                  const out = msg.senderType === 'agent'
                  const bubble: React.CSSProperties = msg.isPrivate
                    ? { background: '#FFF6DB', border: '1px solid #F1D37A', color: '#5B4300' }
                    : out ? { background: 'var(--terra)', color: '#fff' } : { background: 'var(--card)', border: '1px solid var(--line)' }
                  const hit = v.highlightedMessageId === msg.id
                  return (
                    <div key={msg.id} id={'msg-' + msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sep && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}>
                          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>{day}</span>
                          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                        <span style={{ maxWidth: '72%', padding: '11px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', outline: hit ? '2px solid var(--olive)' : undefined, ...bubble }}>
                          {(msg.isPrivate || (out && msg.agentName)) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', background: msg.isPrivate ? 'rgba(91,67,0,.1)' : 'rgba(255,255,255,.18)', padding: '3px 8px', borderRadius: 20, marginBottom: 7 }}>
                              {msg.isPrivate ? 'Nota privada' : ''}{msg.isPrivate && msg.agentName ? ' · ' : ''}{msg.agentName || ''}
                            </span>
                          )}
                          {msg.attachmentUrl && (
                            msg.attachmentType?.startsWith('image/') ? (
                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 6 }}>
                                <img src={msg.attachmentUrl} alt="Anexo" onLoad={scrollToBottom} style={{ display: 'block', maxWidth: 260, maxHeight: 320, borderRadius: 8, objectFit: 'cover', cursor: 'zoom-in' }} />
                              </a>
                            ) : msg.attachmentType?.startsWith('audio/') ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <audio src={msg.attachmentUrl} controls style={{ maxWidth: 240, height: 36 }} />
                                {!msg.transcription && (
                                  <button disabled={!!v.transcribingIds[msg.id]} onClick={() => transcribeAudio(msg.id)} title={v.transcribingIds[msg.id] ? 'Transcrevendo…' : 'Transcrever áudio'}
                                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid currentColor', background: 'none', color: 'inherit', fontWeight: 800, fontSize: 12, opacity: 0.85 }}>{v.transcribingIds[msg.id] ? '…' : 'T'}</button>
                                )}
                              </span>
                            ) : msg.attachmentType?.startsWith('video/') ? (
                              <video src={msg.attachmentUrl} controls onLoadedData={scrollToBottom} style={{ display: 'block', maxWidth: 280, maxHeight: 360, borderRadius: 8, marginBottom: 6, background: '#000' }} />
                            ) : (
                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', border: '1px solid currentColor', borderRadius: 8, marginBottom: 6, color: 'inherit', fontSize: 12.5 }}>
                                <Paperclip size={14} /> Ver anexo
                              </a>
                            )
                          )}
                          {msg.transcription && <span style={{ display: 'block', fontSize: 12.5, fontStyle: 'italic', opacity: 0.85, marginBottom: 4 }}>Transcrição: “{msg.transcription}”</span>}
                          {msg.text && <span style={{ display: 'block' }}>{msg.text}</span>}
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontSize: 10.5, opacity: 0.75, marginTop: 5 }}>
                            {!msg.isPrivate && (msg.attachmentUrl || msg.text) && (
                              <button onClick={() => { s.forwardingMessage = { ...msg } }} title="Encaminhar" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', color: 'inherit', fontSize: 10.5, padding: 0 }}><Forward size={11} /> Encaminhar</button>
                            )}
                            {hora(msg.timestamp)}
                            {out && <CheckCheck size={13} strokeWidth={2.5} />}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                })}
                {conv.messages.length === 0 && <p style={{ ...small, textAlign: 'center', marginTop: 40 }}>Não há mensagens nesta conversa ainda.</p>}
              </div>

              {v.aiPauseStatus.paused && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', background: '#FFF6DB', color: '#5B4300', fontSize: 12.5, borderTop: '1px solid #F1D37A' }}>
                  <BotOff size={15} /><span style={{ flex: 1 }}>IA pausada — <b>{formatAiRemaining(v.aiPauseStatus.remaining_seconds)}</b> para voltar sozinha</span>
                  <button onClick={resumeAi} style={btn('ghost', { padding: '5px 10px', fontSize: 12 })}><Bot size={13} /> Reativar agora</button>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px 14px', position: 'relative', background: 'var(--card)', flex: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <button style={chipBtn(!v.isPrivateMessage)} onClick={() => { s.isPrivateMessage = false }}>Responder</button>
                  <button style={chipBtn(v.isPrivateMessage)} onClick={() => { s.isPrivateMessage = true }}>Nota privada</button>
                  {!v.isPrivateMessage && conv.inbox_name && <span title={conv.inbox_phone || ''} style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 4 }}>Enviando por <b style={{ color: 'var(--ink)' }}>{conv.inbox_name}</b></span>}
                  <span style={{ flex: 1 }} />
                  <button onClick={generateSummary} disabled={v.isGeneratingSummary} style={btn('soft', { padding: '5px 10px', fontSize: 12 })}>
                    {v.isGeneratingSummary ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
                    {v.isGeneratingSummary ? 'Resumindo…' : 'Gerar resumo'}
                  </button>
                </div>

                {slashSuggestions.length > 0 && !v.isRecording && (
                  <div style={{ position: 'absolute', left: 18, right: 18, bottom: '100%', marginBottom: 6, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 6, boxShadow: '0 12px 28px rgba(28,27,26,.14)', maxHeight: 280, overflowY: 'auto', zIndex: 5 }}>
                    <p style={{ ...labelStyle, margin: '6px 10px 8px' }}>Modelos de mensagem</p>
                    {slashSuggestions.map((tpl: Any) => (
                      <button key={tpl.id} onClick={() => applyTemplate(tpl)} style={{ width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'none', borderRadius: 6, fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ color: 'var(--terra)', fontWeight: 700, fontSize: 12.5, flex: 'none' }}>{tpl.nome}</span>
                        {tpl.attachment_url && <Paperclip size={12} color="var(--muted)" />}
                        {tpl.categoria && <span style={{ ...PILL, border: '1px solid var(--line)', color: 'var(--muted)' }}>{tpl.categoria}</span>}
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.mensagem || (tpl.attachment_url ? 'Anexo' : '')}</span>
                      </button>
                    ))}
                  </div>
                )}

                {v.isRecording ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={cancelRecording} title="Cancelar gravação" style={squareBtn}><X size={16} /></button>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#D92D20', animation: 'pulse 1s infinite' }} />Gravando áudio… {formatRecordingTime(v.recordingSeconds)}
                    </span>
                    <button onClick={finishRecording} style={btn('primary')}><Send size={14} /> Enviar</button>
                  </div>
                ) : (
                  <>
                    {v.selectedFile && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, border: '1px solid var(--line)', borderRadius: 8, marginBottom: 8, background: 'var(--bg)' }}>
                        {v.selectedFilePreview ? <img src={v.selectedFilePreview} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} /> : <Paperclip size={18} />}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.selectedFile.name}</span>
                        <button onClick={clearSelectedFile} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><X size={15} /></button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <input type="file" ref={fileInputRef} hidden onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f) }} />
                      <button title="Anexar arquivo" onClick={() => fileInputRef.current?.click()} style={{ ...squareBtn, width: 38, height: 38, color: 'var(--muted)' }}><Paperclip size={16} /></button>
                      <div style={{ position: 'relative', flex: 'none' }}>
                        <button title="Emojis" onClick={e => { stop(e); s.isEmojiPickerOpen = !s.isEmojiPickerOpen }} style={{ ...squareBtn, width: 38, height: 38, color: 'var(--muted)' }}><Smile size={16} /></button>
                        {v.isEmojiPickerOpen && (
                          <div onClick={stop} style={{ position: 'absolute', bottom: 46, left: 0, zIndex: 30 }}>
                            <EmojiPicker emojiStyle={EmojiStyle.NATIVE} onEmojiClick={e => { s.newMessageText += e.emoji }} lazyLoadEmojis theme={(document.querySelector('[data-theme="dark"]') ? 'dark' : 'light') as Any} />
                          </div>
                        )}
                      </div>
                      {!v.newMessageText.trim() && !v.selectedFile && (
                        <button title="Gravar áudio" onClick={startRecording} style={{ ...squareBtn, width: 38, height: 38, color: 'var(--muted)' }}><Mic size={16} /></button>
                      )}
                      <textarea value={v.newMessageText} rows={1} onChange={e => { s.newMessageText = e.target.value }} onPaste={handlePaste}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); handleSendMessage() } }}
                        placeholder={v.isPrivateMessage ? 'Nota privada (só a equipe vê) · digite / para modelos' : 'Mensagem · Shift+Enter pula linha · digite / para modelos'}
                        style={{ flex: 1, minWidth: 0, padding: '10px 14px', border: '1px solid ' + (v.isPrivateMessage ? '#F1D37A' : 'var(--line)'), borderRadius: 8, background: v.isPrivateMessage ? '#FFFBEB' : 'var(--bg)', fontSize: 13.5, resize: 'none', minHeight: 40, maxHeight: 140, fieldSizing: 'content' } as React.CSSProperties} />
                      <button onClick={handleSendMessage} style={btn('primary', { padding: '11px 20px' })}>Enviar</button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
              <span style={{ width: 64, height: 64, border: '1.5px solid var(--line)', borderRadius: '16px 16px 4px 16px', marginBottom: 24, display: 'block' }} />
              <h2 style={{ ...serif, fontSize: 28, margin: '0 0 10px' }}>Conversas</h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--muted)', margin: 0, maxWidth: '38ch' }}>Selecione uma conversa à esquerda para ver o histórico da revendedora, responder e abrir a ficha completa.</p>
            </div>
          )}
        </div>

        {/* ---------------- ficha da revendedora ---------------- */}
        {conv && showDetails && (
          <div className="conv-col conv-details" data-hide='0' style={{ borderLeft: '1px solid var(--line)', background: 'var(--bg)', overflowY: 'auto', minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button className="conv-back" onClick={() => { s.mobileView = 'chat' }} style={{ ...btn('ghost', { padding: '5px 10px', fontSize: 12 }), display: 'none' }}>‹ Conversa</button>
                <span style={{ flex: 1 }} />
                <div style={{ position: 'relative' }}>
                  <button title="Mais opções" onClick={e => { stop(e); s.isDetailsMenuOpen = !s.isDetailsMenuOpen }} style={{ ...squareBtn, width: 30, height: 30 }}><MoreVertical size={14} /></button>
                  <Dropdown open={v.isDetailsMenuOpen}>
                    <MenuItem onClick={() => { s.isMergeModalOpen = true; s.isDetailsMenuOpen = false }}><GitMerge size={14} /> Mesclar contato</MenuItem>
                    <MenuItem danger onClick={() => { s.isDeleteConversationModalOpen = true; s.isDetailsMenuOpen = false }}><MessageCircle size={14} /> Apagar conversa</MenuItem>
                  </Dropdown>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
                <ChatAvatar nome={conv.contact.name || ''} foto={conv.contact.avatar_url} size={64} />
                {v.isEditingName ? (
                  <input ref={nameInputRef} value={v.editingName} maxLength={120} style={{ ...inputStyle, textAlign: 'center', fontWeight: 600 }}
                    onChange={e => { s.editingName = e.target.value }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveContactName() } else if (e.key === 'Escape') { e.preventDefault(); s.isEditingName = false } }}
                    onBlur={saveContactName} />
                ) : (
                  <h3 onClick={startEditingName} title="Clique pra editar o nome" style={{ ...serif, fontSize: 22, margin: '4px 0 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {conv.contact.name} <Pencil size={13} color="var(--muted)" />
                  </h3>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                  <span style={{ ...PILL, border: '1px solid var(--line)', color: 'var(--muted)' }}>#{conv.contact.id}</span>
                  {conv.contact.id_jueri
                    ? conv.contact.nivel && <span style={{ ...PILL, color: nivelInfo(conv.contact.nivel).color, background: nivelInfo(conv.contact.nivel).bg }}>{nivelInfo(conv.contact.nivel).emoji} {nivelInfo(conv.contact.nivel).nome}</span>
                    : <span style={{ ...PILL, background: 'var(--oliveSoft)', color: 'var(--olive)' }}>Novo contato</span>}
                  {conv.contact.id_jueri && <span style={{ ...PILL, background: 'var(--terraSoft)', color: 'var(--terra)' }}>{statusLabel(conv.contact.status)}{daysInStage(conv.contact) ? ` · ${daysInStage(conv.contact)}d` : ''}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Phone size={12} /> {formatPhoneDisplay(conv.contact.phone) || 'Sem telefone'}</span>
                  {conv.contact.email && <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Mail size={12} /> {conv.contact.email}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={focusMessageInput} style={btn('ghost', { padding: '6px 10px', fontSize: 12 })}><MessageCircle size={13} /> Responder</button>
                  <button onClick={() => navigate(`/contatos/${conv.contact.id}`)} style={btn('ghost', { padding: '6px 10px', fontSize: 12 })}><ExternalLink size={13} /> Perfil completo</button>
                </div>
              </div>
            </div>

            {/* abas da ficha: linha única com traço azul na aba aberta (padrão do v2) */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', margin: '0 2px' }}>
              {detailsTabs.map(tab => {
                const on = v.activeDetailsTab === tab.id
                return (
                  <button key={tab.id} onClick={() => { s.activeDetailsTab = tab.id }}
                    style={{ flex: 1, padding: '9px 2px 10px', border: 'none', background: 'none', fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? 'var(--terra)' : 'var(--muted)', boxShadow: on ? 'inset 0 -2px 0 var(--terra)' : 'none', whiteSpace: 'nowrap' }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {v.activeDetailsTab === 'principal' && (
              <>
                <Card title="Atendimento">
                  <Field label="Atendente" value={conv.assignee || 'Não atribuído'} empty={!conv.assignee} />
                  <Field label="Carteira" value={conv.contact.custom_attributes?.gerente_jueri_nome || 'Sem time'} empty={!conv.contact.custom_attributes?.gerente_jueri_nome} />
                  <select value={conv.assignee_id || ''} onChange={e => handleAssign(e.target.value)} disabled={v.isAssigning} style={{ ...inputStyle, marginTop: 10 }}>
                    <option value="">Nenhum atendente</option>
                    {agentsByDepartment.map(group => (
                      <optgroup key={group.dept} label={group.label}>
                        {group.agents.map((agent: Any) => <option key={agent.id} value={agent.id}>{agent.first_name} {agent.last_name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <button disabled={!conv.assignee_id || v.isAssigning} onClick={() => { s.showTransferModal = true }} style={btn('ghost', { flex: '1 1 auto', fontSize: 12, padding: '8px 10px', opacity: !conv.assignee_id ? 0.5 : 1 })}>Transferir com nota</button>
                    <button onClick={() => { s.isEditModalOpen = true }} style={btn('soft', { flex: '1 1 auto', fontSize: 12, padding: '8px 10px' })}><Edit2 size={13} /> Editar campos</button>
                  </div>
                </Card>

                {v.contactFieldGroups.map((group: Any) => {
                  const open = v.openGroupIds.includes(group.id)
                  return (
                    <Card key={group.id} title={group.name} right={toggle(open)} onHeaderClick={() => toggleGroup(group.id)}>
                      {open && ((group.field_keys || []).length
                        ? (group.field_keys || []).map((key: string) => fieldRow(key, fieldLabelOf(key)))
                        : <p style={small}>Nenhum campo neste grupo ainda. Adicione em Configurações → Campos do Contato.</p>)}
                    </Card>
                  )
                })}
                {unassignedFields.length > 0 && (
                  <Card title="Outros" right={toggle(v.isUnassignedOpen)} onHeaderClick={() => { s.isUnassignedOpen = !s.isUnassignedOpen }}>
                    {v.isUnassignedOpen && unassignedFields.map((f: Any) => fieldRow(f.key, f.label))}
                  </Card>
                )}
                <Card title="Dados do Jueri (sincronizado)" right={toggle(v.isDadosJueriOpen)} onHeaderClick={() => { s.isDadosJueriOpen = !s.isDadosJueriOpen }}>
                  {v.isDadosJueriOpen && (
                    <>
                      {dadosFields.map(f => <Field key={'j-' + f.key} label={f.label} value={getDadoValue(f) || '—'} empty={!getDadoValue(f)} />)}
                      {extraAttributes.map(a => <Field key={'x-' + a.key} label={a.label} value={String(a.value)} />)}
                    </>
                  )}
                </Card>

                <Card title="Etiquetas">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {(conv.tags || []).map((t: Any) => <Tag key={t.id} name={t.name} color={t.color} onRemove={() => removeTag(t.id)} />)}
                    {!conv.tags?.length && <span style={small}>Nenhuma etiqueta</span>}
                  </div>
                  <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
                    <input value={v.newTagName} onChange={e => { s.newTagName = e.target.value }} onKeyUp={e => { if (e.key === 'Enter') addTag() }}
                      onFocus={() => { s.showTagSuggestions = true }} onClick={e => { stop(e); s.showTagSuggestions = true }}
                      placeholder="Escolha ou crie uma etiqueta…" autoComplete="off" style={{ ...inputStyle, fontSize: 12.5 }} />
                    <button onClick={addTag} disabled={!v.newTagName.trim()} style={btn('primary', { padding: '8px 12px', opacity: v.newTagName.trim() ? 1 : 0.5 })}><Plus size={13} /></button>
                    {v.showTagSuggestions && tagSuggestions.length > 0 && (
                      <div onClick={stop} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 220, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 12px 28px rgba(8,17,31,.14)', zIndex: 20, padding: 4 }}>
                        {tagSuggestions.map((t: Any) => (
                          <button key={t.id} onClick={() => pickTagSuggestion(t)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', border: 'none', background: 'none', borderRadius: 6, fontSize: 12.5, textAlign: 'left' }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color }} />{t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {TAG_COLORS.map(c => <button key={c} title={c} onClick={() => { s.newTagColor = c }} style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: v.newTagColor === c ? '2px solid var(--ink)' : '2px solid transparent' }} />)}
                  </div>
                </Card>

                <Card title="Mensagens agendadas" right={<button onClick={() => { s.isScheduleModalOpen = true }} style={{ border: 'none', background: 'none', color: 'var(--terra)', fontSize: 12, fontWeight: 700 }}>+ Agendar</button>}>
                  {v.scheduledMessages.length ? v.scheduledMessages.map((m: Any) => (
                    <div key={m.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--terra)' }}>{new Date(m.send_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        {m.text && <span style={{ display: 'block', fontSize: 12.5 }}>{m.text.length > 60 ? m.text.substring(0, 60) + '…' : m.text}</span>}
                        {m.attachmentUrl && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>📎 {m.attachmentName || 'Anexo'}</span>}
                      </span>
                      <button title="Cancelar envio" onClick={() => cancelScheduledMessage(m.id)} style={{ border: 'none', background: 'none', color: 'var(--muted)', alignSelf: 'flex-start' }}><X size={14} /></button>
                    </div>
                  )) : <p style={small}>Ainda não há mensagens agendadas.</p>}
                </Card>

                <Card title="Notas da revendedora" right={toggle(v.isNotesOpen)} onHeaderClick={() => { s.isNotesOpen = !s.isNotesOpen }}>
                  {v.isNotesOpen && (
                    <>
                      {conv.contact?.notes?.length ? conv.contact.notes.map((n: Any) => (
                        <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 6 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}><b>{n.author}</b>{new Date(n.created_at).toLocaleDateString('pt-BR')}</span>
                          <span style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{n.content}</span>
                        </div>
                      )) : <p style={{ ...small, marginBottom: 8 }}>Nenhuma nota adicionada.</p>}
                      <textarea value={v.newNoteText} onChange={e => { s.newNoteText = e.target.value }} placeholder="Adicionar nova nota…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                      <button onClick={saveNote} disabled={v.isSavingNote || !v.newNoteText.trim()} style={btn('primary', { width: '100%', marginTop: 6, opacity: v.newNoteText.trim() ? 1 : 0.5 })}>{v.isSavingNote ? 'Salvando…' : 'Salvar nota'}</button>
                    </>
                  )}
                </Card>

                <Card title="Anexos da conversa" right={toggle(v.isAttachmentsOpen)} onHeaderClick={() => { s.isAttachmentsOpen = !s.isAttachmentsOpen }}>
                  {v.isAttachmentsOpen && (conversationAttachments.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {conversationAttachments.map((a: Any) => (
                        <a key={a.id} href={a.attachmentUrl} target="_blank" rel="noreferrer" style={{ aspectRatio: '1', borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontSize: 11, color: 'var(--muted)' }}>
                          {a.attachmentType?.startsWith('image/') ? <img src={a.attachmentUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📎 Arquivo'}
                        </a>
                      ))}
                    </div>
                  ) : <p style={small}>Nenhum anexo nesta conversa.</p>)}
                </Card>
              </>
            )}

            {v.activeDetailsTab === 'dados' && (
              <Card title="Dados">
                <Field label="E-mail" value={conv.contact.email || '—'} empty={!conv.contact.email} />
                {(conv.contact.reseller_phones || []).map((t: Any) => <Field key={'t-' + t.id} label={t.label || 'Telefone adicional'} value={t.phone} />)}
                <Field label="Data de cadastro" value={formatDate(conv.contact.created_at) || '—'} empty={!conv.contact.created_at} />
                {conv.contact.bio && <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: '10px 0 0' }}>{conv.contact.bio}</p>}
                <button onClick={() => { s.isEditModalOpen = true }} style={btn('soft', { width: '100%', marginTop: 10, fontSize: 12.5 })}><Edit2 size={13} /> Editar campos</button>
              </Card>
            )}

            {v.activeDetailsTab === 'financeiro' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['Total vendido', brl(totalVendido), 'var(--olive)'], ['Em aberto', brl(totalEmAberto), totalEmAberto > 0 ? '#B54708' : 'var(--ink)']].map(([k, val, color]) => (
                    <div key={k} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
                      <span style={{ display: 'block', ...labelStyle }}>{k}</span>
                      <span style={{ ...serif, fontSize: 22, color }}>{val}</span>
                    </div>
                  ))}
                </div>
                <Card title="Pedidos / acertos">
                  <p style={{ ...small, marginBottom: 8 }}>Sincronizado do Jueri — baixa e cancelamento são feitos lá.</p>
                  {pedidos.length ? pedidos.map((p: Any) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 12.5 }}>
                      <span style={{ ...PILL, background: p.status_id === 1 ? 'var(--terraSoft)' : p.status_id === 2 ? 'var(--oliveSoft)' : 'var(--line)', color: p.status_id === 1 ? 'var(--terra)' : p.status_id === 2 ? 'var(--olive)' : 'var(--muted)' }}>{PEDIDO_STATUS_LABELS[p.status_id] || 'Desconhecido'}</span>
                      <span style={{ flex: 1, color: 'var(--muted)' }}>{formatDate(p.data_criacao)}</span>
                      <b>{brl(p.valor_total)}</b>
                    </div>
                  )) : <p style={small}>Nenhum pedido sincronizado ainda.</p>}
                </Card>
              </>
            )}

            {v.activeDetailsTab === 'estatisticas' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['Dias como revendedora', daysAsClient ?? '—'], ['Dias na etapa', daysInStage(conv.contact) ?? '—'],
                    ['Mensagens', totalMessagesCount], ['Pedidos baixados', pedidosFechadosCount],
                    ['Etiquetas', activeTagsCount], ['Última interação', formatDateTime(lastMessageAt) || '—'],
                  ].map(([k, val]) => (
                    <div key={k as string} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
                      <span style={{ display: 'block', ...serif, fontSize: typeof val === 'string' && val.length > 8 ? 14 : 24 }}>{val}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</span>
                    </div>
                  ))}
                </div>
                <Card title="Ciclo de vida">
                  {lifecycleEvents.length ? lifecycleEvents.map((ev: Any) => (
                    <div key={ev.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
                      <span style={{ width: 8, height: 8, marginTop: 5, flex: 'none', transform: 'rotate(45deg)', background: ev.event_type === 'churn' ? '#B42318' : 'var(--terra)' }} />
                      <span style={{ fontSize: 12.5 }}>
                        <b>{LIFECYCLE_EVENT_LABELS[ev.event_type] || ev.event_type}</b>
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>{formatDateTime(ev.occurred_at)}{ev.metadata?.pecas_abertas != null ? ` · ${ev.metadata.pecas_abertas} peças abertas` : ''}</span>
                      </span>
                    </div>
                  )) : <p style={small}>Nenhum marco registrado ainda pra essa revendedora.</p>}
                </Card>
              </>
            )}

            {v.activeDetailsTab === 'configuracoes' && (
              <>
                <Card title="Funil consignado">
                  <span style={{ display: 'block', ...labelStyle, marginTop: 4 }}>Etapa atual</span>
                  <select value={conv.contact.status || 'revendedor_ativo'} disabled={v.isChangingStatus} onChange={e => changeContactStatus(e.target.value)} style={inputStyle}>
                    {statusOptions.map(grp => (
                      <optgroup key={grp.group} label={grp.group}>
                        {Object.entries(grp.options).map(([key, label]) => <option key={key} value={key}>{label as string}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div style={{ marginTop: 8 }}>
                    <Field label="Criado em" value={formatDateTime(conv.contact.created_at) || '—'} empty={!conv.contact.created_at} />
                    <Field label="Última mudança de etapa" value={formatDateTime(conv.contact.status_changed_at) || '—'} empty={!conv.contact.status_changed_at} />
                  </div>
                </Card>
                <Card title="Ações">
                  <button onClick={() => { s.isMergeModalOpen = true }} style={btn('ghost', { width: '100%', marginBottom: 6 })}><GitMerge size={14} /> Mesclar com outro contato</button>
                  <button onClick={() => { s.isDeleteModalOpen = true }} style={btn('ghost', { width: '100%', color: '#B42318' })}><Trash2 size={14} /> Apagar este contato</button>
                </Card>
              </>
            )}
          </div>
        )}

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
      </div>
    </div>
  )
}

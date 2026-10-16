import { Fragment, useEffect, useRef } from 'react'
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
import '../styles/vue/Conversas.scss'

// Porte de views/Conversas.vue (lista + chat + painel da revendedora).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any

const SIDEBAR_FILTER_LABELS: Record<string, string> = { participantes: 'Chats da equipe', mencoes: 'Menções', 'nao-atendidas': 'Não atendidas' }
const DEPT_LABELS: Record<string, string> = { corretor: 'Consultoras', suporte: 'Suporte', financeiro: 'Financeiro', manutencao: 'Manutenção' }
const detailsTabs = [
  { id: 'principal', label: 'Principal' }, { id: 'dados', label: 'Dados' }, { id: 'financeiro', label: 'Financeiro' },
  { id: 'estatisticas', label: 'Estatísticas' }, { id: 'configuracoes', label: 'Configurações' },
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
  const fieldRow = (key: string, label: string) => (
    <div className="lead-field" key={key}>
      <span className="lf-label">{label}</span>
      {v.editingFieldKey === key ? (
        <input ref={fieldInputRef} value={v.editingFieldValue} className="lf-input"
          onChange={e => { s.editingFieldValue = e.target.value }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveFieldValue() } else if (e.key === 'Escape') { e.preventDefault(); s.editingFieldKey = null } }}
          onBlur={saveFieldValue} />
      ) : (
        <span className={`lf-value lf-editable${!getAttr(key) ? ' empty' : ''}`} title="Clique pra preencher" onClick={() => startEditingField(key)}>{getAttr(key) || 'Clique pra preencher'}</span>
      )}
    </div>
  )
  const accordionToggle = (open: boolean) => (open ? <Minus className="icon-sm" /> : <Plus className="icon-sm" />)
  const semResposta = store.sidebarFilteredConversations.filter(isSemResposta).length
  const minhas = store.sidebarFilteredConversations.filter((c: Any) => c.assignee_id === store.currentUser.id).length
  const naoAtribuidas = store.sidebarFilteredConversations.filter((c: Any) => !c.assignee).length

  return (
    <div className="vs-Conversas" style={{ display: 'contents' }}>
      <div className="conversations-container">
        {/* Lista de conversas */}
        <div className={`conv-list-pane${v.mobileView !== 'list' ? ' mobile-hidden' : ''}`}>
          <div className="list-header">
            <div className="header-top">
              <h2>{listTitle} <span className="badge">Abertas</span></h2>
              <div className="actions" style={{ position: 'relative', display: 'flex', gap: '0.5rem' }}>
                <button className="icon-btn" title="Nova conversa" onClick={e => { stop(e); s.isNewConversationModalOpen = true }}><Plus className="icon" /></button>
                <div style={{ position: 'relative' }}>
                  <button className="icon-btn" onClick={e => { stop(e); s.isFilterPopoverOpen = !s.isFilterPopoverOpen; s.isSortPopoverOpen = false }}><Filter className="icon" /></button>
                  <ConversationFilterPopover isOpen={v.isFilterPopoverOpen} initialFilters={store.advancedFilters}
                    onClose={() => { s.isFilterPopoverOpen = false }} onApply={(f: Any) => conversationsStore.setAdvancedFilters(f)} />
                </div>
                <div style={{ position: 'relative' }}>
                  <button className="icon-btn" onClick={e => { stop(e); s.isSortPopoverOpen = !s.isSortPopoverOpen; s.isFilterPopoverOpen = false }}><ArrowDownUp className="icon" /></button>
                  <ConversationSortPopover isOpen={v.isSortPopoverOpen} onClose={() => { s.isSortPopoverOpen = false }} />
                </div>
              </div>
            </div>

            <div className="conv-search">
              <input value={v.searchQuery} type="text" placeholder="Pesquisar nome, telefone ou mensagem..."
                onChange={e => { s.searchQuery = e.target.value }} onKeyDown={e => { if (e.key === 'Escape') clearSearch() }} />
              {v.searchQuery && <button className="conv-search-clear" title="Limpar pesquisa" onClick={clearSearch}><X className="icon-xxs" /></button>}
            </div>

            <div className="tabs" style={{ display: isSearchActive ? 'none' : undefined }}>
              <button className={`tab${store.currentFilter === 'all' ? ' active' : ''}`} onClick={() => conversationsStore.setFilter('all')}>
                Todos <span className="count">{store.sidebarFilteredConversations.length}</span>
              </button>
              <button className={`tab${store.currentFilter === 'sem-resposta' ? ' active' : ''}`} onClick={() => conversationsStore.setFilter('sem-resposta')}>
                Sem resposta <span className="count">{semResposta}</span>
              </button>
              <button className={`tab${store.currentFilter === 'minhas' ? ' active' : ''}`} onClick={() => conversationsStore.setFilter('minhas')}>
                Minhas <span className="count">{minhas}</span>
              </button>
              <button className={`tab${store.currentFilter === 'nao-atribuidos' ? ' active' : ''}`} onClick={() => conversationsStore.setFilter('nao-atribuidos')}>
                Não atribuídas <span className="count">{naoAtribuidas}</span>
              </button>
            </div>
          </div>

          {isSearchActive && (
            <div className="conv-list search-results">
              {v.isSearching && !v.searchResults ? (
                <div className="all-loaded">Pesquisando...</div>
              ) : v.searchResults ? (
                <>
                  {v.searchResults.conversations.length > 0 && <div className="search-section-title">Revendedoras</div>}
                  {v.searchResults.conversations.map((r: Any) => (
                    <div key={'c' + r.conversation_id} className="search-result" onClick={() => openSearchResult(r.conversation_id)}>
                      <div className="search-result-top">
                        <strong>{r.contact_name}</strong>
                        <span className="search-result-date">{formatSearchDate(r.last_activity_iso)}</span>
                      </div>
                      <div className="search-result-sub">{r.contact_phone}{r.inbox_name && <span> · 📱 {r.inbox_name}</span>}{r.status === 'resolved' && <span> · Resolvida</span>}</div>
                    </div>
                  ))}
                  {v.searchResults.messages.length > 0 && <div className="search-section-title">Mensagens</div>}
                  {v.searchResults.messages.map((m: Any) => (
                    <div key={'m' + m.id} className="search-result" onClick={() => openSearchResult(m.conversation_id, m.id)}>
                      <div className="search-result-top">
                        <strong>{m.contact_name}</strong>
                        <span className="search-result-date">{formatSearchDate(m.timestamp)}</span>
                      </div>
                      <div className="search-result-snippet">
                        {m.sender && <span className="search-result-sender">{m.sender}: </span>}
                        {highlightParts(m.text).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>))}
                      </div>
                      {m.inbox_name && <div className="search-result-sub">📱 {m.inbox_name}</div>}
                    </div>
                  ))}
                  {!v.searchResults.conversations.length && !v.searchResults.messages.length && (
                    <div className="all-loaded" style={{ marginTop: '2rem' }}>Nada encontrado para "{v.searchQuery}".</div>
                  )}
                </>
              ) : null}
            </div>
          )}

          <div className="conv-list" style={{ display: isSearchActive ? 'none' : undefined }}>
            {store.filteredConversations.map((c: Any) => (
              <div key={c.id} className={`conv-item${c.unread > 0 ? ' unread' : ''}${c.id === store.activeConversationId ? ' active' : ''}`} onClick={() => openConversationMobile(c.id)}>
                <div className="conv-avatar" style={{ backgroundColor: c.contact.avatarBg, color: 'white', overflow: 'hidden' }}>
                  {c.contact.avatar_url
                    ? <img src={c.contact.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : <span className="avatar-text">{c.contact.avatarInitials}</span>}
                </div>
                <div className="conv-info">
                  <div className="conv-title-row">
                    <span className="conv-name">
                      {c.contact.name}
                      <span className={`channel-icon ${c.source}`} title={c.source === 'instagram' ? 'Instagram' : 'WhatsApp'}><WhatsappIcon source={c.source} /></span>
                    </span>
                    <span className="conv-time">{formatMessageTime(c.timestamp)}</span>
                  </div>
                  <div className="conv-preview">
                    {c.unread > 0 && <span className="unread-badge"></span>}
                    <span className="conv-preview-text">{c.preview}</span>
                  </div>
                  {((c.tags && c.tags.length > 0) || c.assignee || c.inbox_name) && (
                    <div className="conv-tags">
                      {c.inbox_name && <span className="conv-tag conv-tag-inbox" title={'Caixa: ' + c.inbox_name + (c.inbox_phone ? ' (' + c.inbox_phone + ')' : '')}>📱 {c.inbox_name}</span>}
                      {c.tags.map((tag: Any) => <span key={tag.id} className="conv-tag" style={{ background: tag.color, color: '#fff' }}>{tag.name}</span>)}
                      {c.assignee && <span className="conv-tag conv-tag-agent" title={'Atendente: ' + c.assignee}>👤 {c.assignee}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {store.filteredConversations.length > 0
              ? <div className="all-loaded">Todas as conversas carregadas 🎉</div>
              : <div className="all-loaded" style={{ marginTop: '2rem' }}>Não há conversas ativas neste grupo.</div>}
          </div>
        </div>

        {/* Chat */}
        <div className={`chat-pane${v.mobileView === 'list' ? ' mobile-hidden' : ''}`}>
          {conv && (
            <div className="chat-header">
              <div className="chat-title">
                <button className="btn-back-mobile" onClick={() => { s.mobileView = 'list' }} title="Voltar">←</button>
                <div className="conv-avatar" style={{ backgroundColor: conv.contact.avatarBg, color: 'white', overflow: 'hidden' }}>
                  {conv.contact.avatar_url
                    ? <img src={conv.contact.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : <span>{conv.contact.avatarInitials}</span>}
                </div>
                <div className="title-info">
                  <h3>{conv.contact.name}</h3>
                  <span className="ticket-id">#{conv.id}</span>
                </div>
              </div>
              <div className="chat-actions">
                <button className="btn-details-mobile" onClick={() => { s.mobileView = 'details' }} title="Detalhes do contato"><Info className="icon-sm" /></button>
                <ConversationStatusDropdown conversationId={conv.id} currentStatus={conv.status} />
                <ConversationMoreOptionsDropdown conversationId={conv.id} contactId={conv.contact?.id} contactStatus={conv.contact?.status}
                  onContactBlocked={() => { activeProxy().contact.status = 'blocked' }}
                  onContactUnblocked={() => { activeProxy().contact.status = 'active' }} />
              </div>
            </div>
          )}

          {conv && (
            <div className="chat-messages" ref={messagesContainerRef}>
              {conv.messages.map((msg: Any) => (
                <div key={msg.id} id={'msg-' + msg.id} className={`message-wrapper ${msg.senderType}${v.highlightedMessageId === msg.id ? ' search-hit' : ''}`}>
                  {msg.senderType === 'contact' && (
                    <div className="msg-avatar">
                      {conv.contact.avatar_url ? <img src={conv.contact.avatar_url} /> : <span>{conv.contact.avatarInitials}</span>}
                    </div>
                  )}
                  <div className="message-content">
                    <div className={`bubble${msg.isPrivate ? ' private' : ''}`}>
                      {msg.attachmentUrl && (
                        <div className="attachment-preview">
                          {msg.attachmentType?.startsWith('image/') ? (
                            <a href={msg.attachmentUrl} target="_blank" title="Clique para ampliar" className="image-link">
                              <img src={msg.attachmentUrl} className="msg-image" onLoad={scrollToBottom} />
                            </a>
                          ) : msg.attachmentType?.startsWith('audio/') ? (
                            <div className="audio-row">
                              <audio src={msg.attachmentUrl} controls className="msg-audio"></audio>
                              {!msg.transcription && (
                                <button className={`transcribe-btn${v.transcribingIds[msg.id] ? ' loading' : ''}`} disabled={!!v.transcribingIds[msg.id]}
                                  title={v.transcribingIds[msg.id] ? 'Transcrevendo...' : 'Transcrever áudio'} onClick={() => transcribeAudio(msg.id)}>
                                  {v.transcribingIds[msg.id] ? '…' : 'T'}
                                </button>
                              )}
                            </div>
                          ) : msg.attachmentType?.startsWith('video/') ? (
                            <div className="video-wrapper">
                              <video src={msg.attachmentUrl} controls className="msg-video" onLoadedData={scrollToBottom}></video>
                              <a href={msg.attachmentUrl} target="_blank" download className="media-download-link">Baixar Vídeo</a>
                            </div>
                          ) : (
                            <a href={msg.attachmentUrl} target="_blank" className="msg-doc">📎 Ver Anexo</a>
                          )}
                        </div>
                      )}
                      {msg.transcription && <div className="msg-transcription">{msg.transcription}</div>}
                      {msg.text && <div className="msg-text">{msg.text}</div>}
                      <div className="bubble-meta">
                        {!msg.isPrivate && (msg.attachmentUrl || msg.text) && (
                          <button className="forward-btn" title="Encaminhar" onClick={() => { s.forwardingMessage = { ...msg } }}><Forward className="icon-xxs" /> Encaminhar</button>
                        )}
                        <span className="time">{formatMessageTime(msg.timestamp)}</span>
                        {msg.senderType === 'agent' && <CheckCheck className="icon-xxs" />}
                      </div>
                    </div>
                  </div>
                  {msg.senderType === 'agent' && (
                    <div className="msg-avatar agent-avatar">
                      {msg.agentAvatarUrl ? <img src={msg.agentAvatarUrl} /> : msg.agentName ? <span>{msg.agentName.charAt(0).toUpperCase()}</span> : <span>A</span>}
                    </div>
                  )}
                </div>
              ))}
              {conv.messages.length === 0 && (
                <div className="empty-state">
                  <div className="icon-circle"><MessageCircle className="icon-lg" /></div>
                  <p>Não há mensagens nesta conversa ainda.</p>
                </div>
              )}
            </div>
          )}

          {conv && v.aiPauseStatus.paused && (
            <div className="ai-paused-banner">
              <BotOff className="banner-icon" />
              <span>IA pausada — <strong>{formatAiRemaining(v.aiPauseStatus.remaining_seconds)}</strong> para voltar automaticamente</span>
              <button className="btn-resume-ai" onClick={resumeAi}><Bot className="icon-xs" /> Reativar agora</button>
            </div>
          )}

          {conv && (
            <div className="chat-input-area">
              <div className="input-tabs">
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button className={`input-tab${!v.isPrivateMessage ? ' active' : ''}`} onClick={() => { s.isPrivateMessage = false }}>Responder</button>
                  <button className={`input-tab${v.isPrivateMessage ? ' active' : ''}`} onClick={() => { s.isPrivateMessage = true }}>Mensagem Privada</button>
                  {!v.isPrivateMessage && conv.inbox_name && (
                    <span className="sending-via" title={conv.inbox_phone || ''}>Enviando por: <strong>{conv.inbox_name}</strong></span>
                  )}
                </div>
                <button className="btn-magic-sm" onClick={generateSummary} disabled={v.isGeneratingSummary}>
                  {v.isGeneratingSummary ? <Loader2 className="icon-sm spin" /> : <Sparkles className="icon-sm" />}
                  <span className="btn-magic-label">{v.isGeneratingSummary ? 'Resumindo...' : 'Gerar Resumo'}</span>
                </button>
              </div>
              <div className="input-box">
                {v.isRecording ? (
                  <div className="recording-bar">
                    <button className="cancel-recording-btn" onClick={cancelRecording} title="Cancelar gravação"><X className="icon-sm" /></button>
                    <div className="recording-indicator"><span className="recording-dot"></span>Gravando áudio... {formatRecordingTime(v.recordingSeconds)}</div>
                    <button className="btn-send" onClick={finishRecording} title="Enviar áudio"><Send className="icon-sm" /> Enviar</button>
                  </div>
                ) : (
                  <>
                    {v.selectedFile && (
                      <div className="file-preview-area">
                        <div className="file-preview-content">
                          {v.selectedFilePreview ? <img src={v.selectedFilePreview} className="preview-img" /> : <div className="file-icon">📄</div>}
                          <span className="file-name">{v.selectedFile.name}</span>
                        </div>
                        <button className="clear-file-btn" onClick={clearSelectedFile}>&times;</button>
                      </div>
                    )}
                    {slashSuggestions.length > 0 && (
                      <div className="slash-suggestions">
                        {slashSuggestions.map((tpl: Any) => (
                          <button key={tpl.id} type="button" className="slash-suggestion-item" onClick={() => applyTemplate(tpl)}>
                            <span className="slash-suggestion-nome">{tpl.nome} {tpl.attachment_url && <Paperclip className="icon-xxs" />}</span>
                            {tpl.categoria && <span className="slash-suggestion-categoria">{tpl.categoria}</span>}
                            <span className="slash-suggestion-preview">{tpl.mensagem || (tpl.attachment_url ? 'Anexo' : '')}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea value={v.newMessageText} onChange={e => { s.newMessageText = e.target.value }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); handleSendMessage() } }}
                      onPaste={handlePaste}
                      placeholder={v.isPrivateMessage ? 'Digite uma nota privada... (dica: use / pra abrir um modelo salvo)' : 'Digite sua mensagem aqui... (dica: use / pra abrir um modelo salvo)'} />
                    <div className="input-actions">
                      <div className="left-actions">
                        <input type="file" ref={fileInputRef} onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f) }} hidden />
                        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo"><Paperclip className="icon-sm" /></button>
                        <div className="emoji-wrapper">
                          <button className="icon-btn" onClick={e => { stop(e); s.isEmojiPickerOpen = !s.isEmojiPickerOpen }}><Smile className="icon-sm" /></button>
                          {v.isEmojiPickerOpen && (
                            <div className="emoji-picker-container" onClick={stop}>
                              <EmojiPicker emojiStyle={EmojiStyle.NATIVE} onEmojiClick={e => { s.newMessageText += e.emoji }} lazyLoadEmojis />
                            </div>
                          )}
                        </div>
                        {!v.newMessageText.trim() && !v.selectedFile && (
                          <button className="icon-btn" onClick={startRecording} title="Gravar áudio"><Mic className="icon-sm" /></button>
                        )}
                        {v.aiPauseStatus.paused && (
                          <div className="ai-paused-pill">
                            <BotOff className="pill-icon" />
                            <span>IA pausada · {formatAiRemaining(v.aiPauseStatus.remaining_seconds)}</span>
                            <button className="pill-resume" onClick={resumeAi} title="Reativar IA agora"><Bot className="pill-icon" /></button>
                          </div>
                        )}
                      </div>
                      <button className="btn-send" onClick={handleSendMessage}>Enviar (↵)</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Painel da revendedora */}
        {conv && (
          <div className={`details-pane${v.mobileView !== 'details' ? ' mobile-hidden' : ''}`}>
            <div className="details-header-top">
              <h3>Contatos</h3>
              <div className="details-header-actions">
                <div className="details-menu-wrapper">
                  <button className="icon-btn" onClick={e => { stop(e); s.isDetailsMenuOpen = !s.isDetailsMenuOpen }} title="Mais opções"><MoreVertical className="icon-sm" /></button>
                  {v.isDetailsMenuOpen && (
                    <div className="details-menu" onClick={stop}>
                      <button className="details-menu-item" onClick={() => { s.isMergeModalOpen = true; s.isDetailsMenuOpen = false }}><GitMerge className="icon-xs" /> Mesclar contato</button>
                      <button className="details-menu-item danger" onClick={() => { s.isDeleteConversationModalOpen = true; s.isDetailsMenuOpen = false }}><MessageCircle className="icon-xs" /> Apagar conversa</button>
                    </div>
                  )}
                </div>
                <button className="icon-btn details-close-mobile" onClick={() => { s.mobileView = 'chat' }} title="Voltar pra conversa"><X className="icon-sm" /></button>
              </div>
            </div>

            <div className="contact-profile">
              <div className="contact-avatar" style={{ backgroundColor: conv.contact.avatarBg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', overflow: 'hidden' }}>
                {conv.contact.avatar_url
                  ? <img src={conv.contact.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : <span>{conv.contact.avatarInitials}</span>}
              </div>
              <div className="contact-name-row" style={{ position: 'relative' }}>
                {v.isEditingName ? (
                  <input ref={nameInputRef} value={v.editingName} className="contact-name-input" maxLength={120}
                    onChange={e => { s.editingName = e.target.value }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveContactName() } else if (e.key === 'Escape') { e.preventDefault(); s.isEditingName = false } }}
                    onBlur={saveContactName} />
                ) : (
                  <h4 className="contact-name-editable" title="Clique pra editar o nome" onClick={startEditingName}>
                    {conv.contact.name}
                    <Pencil className="icon-xs contact-name-pencil" />
                  </h4>
                )}
                <Info className="icon-xs contact-quick-info" onClick={e => { stop(e); s.showQuickInfo = !s.showQuickInfo }}><title>Ver telefone/e-mail/cidade</title></Info>
                <ExternalLink className="icon-xs contact-open-profile" onClick={() => navigate(`/contatos/${conv.contact.id}`)}><title>Abrir perfil completo</title></ExternalLink>
                {v.showQuickInfo && (
                  <div className="quick-info-popover" onClick={stop}>
                    {contactQuickInfoLines.length ? contactQuickInfoLines.map(line => (
                      <div className="quick-info-row" key={line.label}>
                        <span className="quick-info-label">{line.label}</span>
                        <span className="quick-info-value">{line.value}</span>
                      </div>
                    )) : <p className="quick-info-empty">Sem informações adicionais</p>}
                  </div>
                )}
              </div>

              {conv.contact.id && (
                <div className="lead-badges">
                  <span className="lead-id-badge">#{conv.contact.id}</span>
                  {conv.contact.id_jueri
                    ? (conv.contact.nivel && (
                      <span className="lead-tag nivel-tag" style={{ color: nivelInfo(conv.contact.nivel).color, backgroundColor: nivelInfo(conv.contact.nivel).bg }}>
                        {nivelInfo(conv.contact.nivel).emoji} {nivelInfo(conv.contact.nivel).nome.toUpperCase()}
                      </span>))
                    : <span className="lead-tag lead-tag-novo">NOVO CONTATO</span>}
                </div>
              )}

              {conv.contact.id_jueri && (
                <div className="lead-stage-row">
                  <span className="stage-pipeline">Consignado</span>
                  <span className="stage-badge">{statusLabel(conv.contact.status)}</span>
                  {!!daysInStage(conv.contact) && <span className="stage-days">({daysInStage(conv.contact)} dias)</span>}
                  <ChevronDown className="icon-xs" style={{ marginLeft: 'auto' }} />
                </div>
              )}

              <div className="contact-attributes">
                <div className="attr-row">
                  <Phone className="icon-xs" />
                  <span>{formatPhoneDisplay(conv.contact.phone) || 'Indisponível'}</span>
                  {conv.contact.phone && <Copy className="icon-xs action-icon" />}
                </div>
                <div className="attr-row">
                  <Mail className="icon-xs" />
                  <span>{conv.contact.email || 'Indisponível'}</span>
                </div>
              </div>

              <div className="contact-actions-row">
                <button className="action-btn" title="Focar Mensagem" onClick={focusMessageInput}><MessageCircle className="icon-sm" /></button>
                <button className="action-btn" title="Mesclar Contato" onClick={() => { s.isMergeModalOpen = true }}><GitMerge className="icon-sm" /></button>
              </div>
            </div>

            <div className="details-tabs">
              {detailsTabs.map(tab => (
                <button key={tab.id} className={`details-tab${v.activeDetailsTab === tab.id ? ' active' : ''}`} onClick={() => { s.activeDetailsTab = tab.id }}>{tab.label}</button>
              ))}
            </div>

            {v.activeDetailsTab === 'principal' && (
              <>
                <div className="accordion-card">
                  <div className="card-header"><h3>Principal</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                    <div className="lead-field"><span className="lf-label">Atendente</span><span className="lf-value">{conv.assignee || 'Não atribuído'}</span></div>
                    <div className="lead-field">
                      <span className="lf-label">Carteira</span>
                      <span className={`lf-value${!conv.contact.custom_attributes?.gerente_jueri_nome ? ' empty' : ''}`}>{conv.contact.custom_attributes?.gerente_jueri_nome || 'Sem time'}</span>
                    </div>
                    <button className="lead-fields-edit" onClick={() => { s.isEditModalOpen = true }}><Edit2 className="icon-xs" /> Editar campos</button>
                  </div>
                </div>

                {v.contactFieldGroups.map((group: Any) => (
                  <div className="accordion-card" key={group.id}>
                    <div className="card-header" onClick={() => toggleGroup(group.id)} style={{ cursor: 'pointer' }}>
                      <h3>{group.name}</h3>
                      {accordionToggle(v.openGroupIds.includes(group.id))}
                    </div>
                    {v.openGroupIds.includes(group.id) && (
                      <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                        {(group.field_keys || []).map((key: string) => fieldRow(key, fieldLabelOf(key)))}
                        {(!group.field_keys || group.field_keys.length === 0) && <p className="empty-text">Nenhum campo neste grupo ainda. Adicione em Configurações → Campos do Contato.</p>}
                      </div>
                    )}
                  </div>
                ))}

                {unassignedFields.length > 0 && (
                  <div className="accordion-card">
                    <div className="card-header" onClick={() => { s.isUnassignedOpen = !s.isUnassignedOpen }} style={{ cursor: 'pointer' }}>
                      <h3>Outros</h3>
                      {accordionToggle(v.isUnassignedOpen)}
                    </div>
                    {v.isUnassignedOpen && <div className="card-body" style={{ paddingTop: '0.5rem' }}>{unassignedFields.map((f: Any) => fieldRow(f.key, f.label))}</div>}
                  </div>
                )}

                <div className="accordion-card">
                  <div className="card-header" onClick={() => { s.isDadosJueriOpen = !s.isDadosJueriOpen }} style={{ cursor: 'pointer' }}>
                    <h3>Dados do Jueri (sincronizado)</h3>
                    {accordionToggle(v.isDadosJueriOpen)}
                  </div>
                  {v.isDadosJueriOpen && (
                    <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                      {dadosFields.map(f => (
                        <div className="lead-field" key={'jueri-' + f.key}>
                          <span className="lf-label">{f.label}</span>
                          <span className={`lf-value${!getDadoValue(f) ? ' empty' : ''}`}>{getDadoValue(f) || '...'}</span>
                        </div>
                      ))}
                      {extraAttributes.map(attr => (
                        <div className="lead-field" key={'extra-' + attr.key}>
                          <span className="lf-label">{attr.label}</span>
                          <span className="lf-value">{String(attr.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="accordion-card">
                  <div className="card-header"><h3>Mensagens agendadas</h3><Minus className="icon-sm" /></div>
                  <div className="card-body">
                    <button className="btn-text-blue" onClick={() => { s.isScheduleModalOpen = true }}><Plus className="icon-xs" /> Agendar mensagem</button>
                    {v.scheduledMessages.length > 0 ? (
                      <div className="scheduled-list-ui">
                        {v.scheduledMessages.map((msg: Any) => (
                          <div key={msg.id} className="scheduled-item-ui">
                            <div className="sch-header">
                              <span className="sch-time">{new Date(msg.send_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              <button className="icon-btn-cancel" onClick={() => cancelScheduledMessage(msg.id)} title="Cancelar envio"><X className="icon-xxs" /></button>
                            </div>
                            <div className="sch-content">
                              {msg.text && <p>{msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text}</p>}
                              {msg.attachmentUrl && <div className="sch-attachment">📎 {msg.attachmentName || 'Anexo'}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="empty-text">Ainda não há mensagens agendadas.</p>}
                  </div>
                </div>

                <div className="accordion-card">
                  <div className="card-header"><h3>Atendente</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem', paddingBottom: '1rem' }}>
                    <select className="assign-select" value={conv.assignee_id || ''} onChange={e => handleAssign(e.target.value)} disabled={v.isAssigning}>
                      <option value="">Nenhum (Não atribuído)</option>
                      {agentsByDepartment.map(group => (
                        <optgroup key={group.dept} label={'— ' + group.label}>
                          {group.agents.map((agent: Any) => <option key={agent.id} value={agent.id}>{agent.first_name} {agent.last_name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <button className="btn-transfer" disabled={!conv.assignee_id || v.isAssigning} onClick={() => { s.showTransferModal = true }}>Transferir com nota</button>
                  </div>
                </div>

                <div className="accordion-card">
                  <div className="card-header"><h3>Etiquetas</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem', paddingBottom: '1rem' }}>
                    <div className="tag-chips">
                      {(conv.tags || []).map((tag: Any) => (
                        <span key={tag.id} className="tag-chip" style={{ background: tag.color }}>
                          {tag.name}
                          <button className="tag-remove" onClick={() => removeTag(tag.id)} title="Remover etiqueta (reativa a IA se for 'agente_off')">×</button>
                        </span>
                      ))}
                      {!conv.tags?.length && <span className="empty-text">Nenhuma etiqueta</span>}
                    </div>
                    <div className="tag-add-row" style={{ position: 'relative' }}>
                      <input value={v.newTagName} onChange={e => { s.newTagName = e.target.value }}
                        onKeyUp={e => { if (e.key === 'Enter') addTag() }}
                        onFocus={() => { s.showTagSuggestions = true }}
                        onClick={e => { stop(e); s.showTagSuggestions = true }}
                        placeholder="Nova etiqueta ou escolha uma já existente..." className="tag-input" autoComplete="off" />
                      <button className="btn-add-tag" onClick={addTag} disabled={!v.newTagName.trim()}><Plus className="icon-xs" /> Adicionar</button>
                      {v.showTagSuggestions && tagSuggestions.length > 0 && (
                        <div className="tag-suggestions" onClick={stop}>
                          {tagSuggestions.map((tag: Any) => (
                            <button key={tag.id} type="button" className="tag-suggestion-item" onClick={() => pickTagSuggestion(tag)}>
                              <span className="tag-suggestion-dot" style={{ background: tag.color }}></span>
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="tag-color-picker">
                      {TAG_COLORS.map(c => (
                        <button key={c} className={`tag-color-dot${v.newTagColor === c ? ' active' : ''}`} style={{ background: c }} onClick={() => { s.newTagColor = c }} title={c}></button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {v.activeDetailsTab === 'dados' && (
              <>
                <div className="lead-fields">
                  <div className="lead-field">
                    <span className="lf-label">E-mail</span>
                    <span className={`lf-value${!conv.contact.email ? ' empty' : ''}`}>{conv.contact.email || '...'}</span>
                  </div>
                  {(conv.contact.reseller_phones || []).map((tel: Any) => (
                    <div className="lead-field" key={'tel-' + tel.id}>
                      <span className="lf-label">{tel.label || 'Telefone adicional'}</span>
                      <span className="lf-value">{tel.phone}</span>
                    </div>
                  ))}
                  <div className="lead-field">
                    <span className="lf-label">Data de cadastro</span>
                    <span className={`lf-value${!conv.contact.created_at ? ' empty' : ''}`}>{formatDate(conv.contact.created_at) || '...'}</span>
                  </div>
                  <button className="lead-fields-edit" onClick={() => { s.isEditModalOpen = true }}><Edit2 className="icon-xs" /> Editar campos</button>
                </div>
                {conv.contact?.bio && (
                  <div className="accordion-card">
                    <div className="card-header"><h3>Descrição</h3></div>
                    <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>{conv.contact.bio}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {v.activeDetailsTab === 'financeiro' && (
              <>
                <div className="fin-summary">
                  <div className="fin-card"><span className="fin-label">Total vendido</span><span className="fin-value positive">{brl(totalVendido)}</span></div>
                  <div className="fin-card"><span className="fin-label">Em aberto</span><span className={`fin-value${totalEmAberto > 0 ? ' warn' : ''}`}>{brl(totalEmAberto)}</span></div>
                </div>
                <div className="accordion-card">
                  <div className="card-header"><h3>Pedidos / Acertos</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <p className="empty-text" style={{ margin: 0 }}>Sincronizado automaticamente do Jueri — baixa/cancelamento de pedido é feito lá, não aqui.</p>
                    {pedidos.length > 0 ? (
                      <div className="pedido-list">
                        {pedidos.map((p: Any) => (
                          <div className="pedido-item" key={p.id}>
                            <span className={`pedido-status status-${PEDIDO_STATUS_CLASSES[p.status_id] || 'desconhecido'}`}>{PEDIDO_STATUS_LABELS[p.status_id] || 'Desconhecido'}</span>
                            <span className="pedido-date">{formatDate(p.data_criacao)}</span>
                            <span className="pedido-valor">{brl(p.valor_total)}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="empty-text">Nenhum pedido sincronizado ainda.</p>}
                  </div>
                </div>
              </>
            )}

            {v.activeDetailsTab === 'estatisticas' && (
              <>
                <div className="stat-grid">
                  <div className="stat-card"><span className="stat-value">{daysAsClient !== null ? daysAsClient : '...'}</span><span className="stat-label">Dias como revendedora</span></div>
                  <div className="stat-card"><span className="stat-value">{daysInStage(conv.contact) ?? '...'}</span><span className="stat-label">Dias na etapa atual</span></div>
                  <div className="stat-card"><span className="stat-value">{totalMessagesCount}</span><span className="stat-label">Mensagens trocadas</span></div>
                  <div className="stat-card"><span className="stat-value">{pedidosFechadosCount}</span><span className="stat-label">Pedidos baixados</span></div>
                  <div className="stat-card"><span className="stat-value">{activeTagsCount}</span><span className="stat-label">Etiquetas ativas</span></div>
                  <div className="stat-card"><span className="stat-value stat-value-sm">{formatDateTime(lastMessageAt) || '...'}</span><span className="stat-label">Última interação</span></div>
                </div>
                <div className="accordion-card">
                  <div className="card-header"><h3>Linha do tempo do ciclo de vida</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                    {lifecycleEvents.length > 0 ? (
                      <div className="lifecycle-timeline">
                        {lifecycleEvents.map((ev: Any) => (
                          <div className={`lifecycle-item event-${ev.event_type}`} key={ev.id}>
                            <span className="lifecycle-dot"></span>
                            <div className="lifecycle-body">
                              <span className="lifecycle-label">{LIFECYCLE_EVENT_LABELS[ev.event_type] || ev.event_type}</span>
                              <span className="lifecycle-date">{formatDateTime(ev.occurred_at)}</span>
                              {ev.metadata?.pecas_abertas != null && <span className="lifecycle-meta">{ev.metadata.pecas_abertas} peças abertas</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="empty-text">Nenhum marco registrado ainda pra essa revendedora.</p>}
                  </div>
                </div>
              </>
            )}

            {v.activeDetailsTab === 'configuracoes' && (
              <>
                <div className="accordion-card">
                  <div className="card-header"><h3>Funil</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className="lead-field"><span className="lf-label">Pipeline</span><span className="lf-value">Consignado</span></div>
                    <div className="lead-field">
                      <span className="lf-label">Etapa atual</span>
                      <select className="status-select" value={conv.contact.status || 'revendedor_ativo'} disabled={v.isChangingStatus} onChange={e => changeContactStatus(e.target.value)}>
                        {statusOptions.map(grp => (
                          <optgroup key={grp.group} label={grp.group}>
                            {Object.entries(grp.options).map(([key, label]) => <option key={key} value={key}>{label as string}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="lead-field"><span className="lf-label">Atendente</span><span className={`lf-value${!conv.assignee ? ' empty' : ''}`}>{conv.assignee || 'Não atribuído'}</span></div>
                    <div className="lead-field">
                      <span className="lf-label">Carteira</span>
                      <span className={`lf-value${!conv.contact.custom_attributes?.gerente_jueri_nome ? ' empty' : ''}`}>{conv.contact.custom_attributes?.gerente_jueri_nome || 'Sem time'}</span>
                    </div>
                  </div>
                </div>
                <div className="accordion-card">
                  <div className="card-header"><h3>Datas</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className="lead-field"><span className="lf-label">Criado em</span><span className={`lf-value${!conv.contact.created_at ? ' empty' : ''}`}>{formatDateTime(conv.contact.created_at) || '...'}</span></div>
                    <div className="lead-field"><span className="lf-label">Última mudança de etapa</span><span className={`lf-value${!conv.contact.status_changed_at ? ' empty' : ''}`}>{formatDateTime(conv.contact.status_changed_at) || '...'}</span></div>
                  </div>
                </div>
                <div className="accordion-card">
                  <div className="card-header"><h3>Ações</h3></div>
                  <div className="card-body" style={{ paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="btn-text-blue" onClick={() => { s.isMergeModalOpen = true }}><GitMerge className="icon-xs" /> Mesclar com outro contato</button>
                    <button className="btn-text-blue danger-text" onClick={() => { s.isDeleteModalOpen = true }}><Trash2 className="icon-xs" /> Apagar este contato</button>
                  </div>
                </div>
              </>
            )}

            {v.activeDetailsTab === 'principal' && (
              <>
                <div className="accordion-card">
                  <div className="card-header" onClick={() => { s.isNotesOpen = !s.isNotesOpen }} style={{ cursor: 'pointer' }}>
                    <h3>Notas do contato</h3>
                    {accordionToggle(v.isNotesOpen)}
                  </div>
                  {v.isNotesOpen && (
                    <div className="card-body" style={{ paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {conv.contact?.notes?.length > 0 ? (
                        <div className="notes-list">
                          {conv.contact.notes.map((note: Any) => (
                            <div className="note-item" key={note.id}>
                              <div className="note-header">
                                <span className="note-author">{note.author}</span>
                                <span className="note-time">{new Date(note.created_at).toLocaleDateString('pt-BR')}</span>
                              </div>
                              <div className="note-content">{note.content}</div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="empty-text">Nenhuma nota adicionada.</p>}
                      <div className="add-note-box" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <textarea value={v.newNoteText} onChange={e => { s.newNoteText = e.target.value }} placeholder="Adicionar nova nota..." rows={2} className="note-textarea"></textarea>
                        <button className="btn-primary" style={{ padding: '0.4rem', fontSize: '0.85rem' }} onClick={saveNote} disabled={v.isSavingNote || !v.newNoteText.trim()}>
                          {v.isSavingNote ? 'Salvando...' : 'Salvar Nota'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="accordion-card">
                  <div className="card-header" onClick={() => { s.isAttachmentsOpen = !s.isAttachmentsOpen }} style={{ cursor: 'pointer' }}>
                    <h3>Anexos</h3>
                    {accordionToggle(v.isAttachmentsOpen)}
                  </div>
                  {v.isAttachmentsOpen && (
                    <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                      {conversationAttachments.length > 0 ? (
                        <div className="attachments-gallery">
                          {conversationAttachments.map((att: Any) => (
                            <a key={att.id} href={att.attachmentUrl} target="_blank" className="attachment-thumb">
                              {att.attachmentType?.startsWith('image/') ? <img src={att.attachmentUrl} alt="Anexo" /> : <div className="attachment-doc"><span>📎</span><small>Documento</small></div>}
                            </a>
                          ))}
                        </div>
                      ) : <p className="empty-text">Nenhum anexo nesta conversa.</p>}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Modais */}
        <EditContactModal isOpen={v.isEditModalOpen} contact={conv?.contact} onClose={() => { s.isEditModalOpen = false }} />
        <MergeContactModal isOpen={v.isMergeModalOpen} contact={conv?.contact} onClose={() => { s.isMergeModalOpen = false }} />
        <DeleteContactModal isOpen={v.isDeleteModalOpen} contact={conv?.contact} onClose={() => { s.isDeleteModalOpen = false }} />
        <DeleteConversationModal isOpen={v.isDeleteConversationModalOpen} conversation={conv} onClose={() => { s.isDeleteConversationModalOpen = false }} />
        <NewConversationModal isOpen={v.isNewConversationModalOpen} onClose={() => { s.isNewConversationModalOpen = false }}
          onCreated={(c: Any) => { conversationsStore.setActiveConversation(c.id); s.mobileView = 'chat' }} />
        <ForwardMessageModal isOpen={!!v.forwardingMessage} message={v.forwardingMessage} onClose={() => { s.forwardingMessage = null }} />
        {v.showTransferModal && (
          <TransferModal agents={store.agents} currentAssigneeId={conv?.assignee_id} onClose={() => { s.showTransferModal = false }} onConfirm={handleTransfer} />
        )}
        <ScheduleMessageModal isOpen={v.isScheduleModalOpen} conversationId={conv?.id} onClose={() => { s.isScheduleModalOpen = false }} onScheduled={onMessageScheduled} />
      </div>
    </div>
  )
}

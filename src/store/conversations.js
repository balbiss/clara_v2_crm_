import { proxy } from 'valtio'
import api from '../api'
import { getSocket, isSocketConnected } from '../lib/realtime'

// Porte de store/conversations.js da v1 (Pinia → valtio, mesma lógica).
// Diferença de desempenho: a lista (GET /conversations) traz só a ÚLTIMA mensagem de cada
// conversa (messages_loaded: false); o histórico completo é buscado ao abrir a conversa.

// Filtro "Criada em" (Clara, 2026-09-25) — compara no fuso do navegador.
const matchesDateBucket = (isoString, bucket) => {
  if (!isoString) return false
  const date = new Date(isoString)
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(now)
  if (bucket === 'hoje') return startOfDay(date).getTime() === today.getTime()
  if (bucket === 'ontem') {
    const ontem = new Date(today); ontem.setDate(ontem.getDate() - 1)
    return startOfDay(date).getTime() === ontem.getTime()
  }
  if (bucket === '7dias') {
    const d = new Date(today); d.setDate(d.getDate() - 7)
    return date >= d
  }
  if (bucket === '30dias') {
    const d = new Date(today); d.setDate(d.getDate() - 30)
    return date >= d
  }
  if (bucket === 'mes_atual') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  if (bucket === 'mes_passado') {
    const mp = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return date.getFullYear() === mp.getFullYear() && date.getMonth() === mp.getMonth()
  }
  return false
}

// Última mensagem foi do cliente = ninguém da equipe respondeu ainda (≠ "não lida").
export const isSemResposta = (conv) => {
  const msgs = conv.messages || []
  const last = msgs[msgs.length - 1]
  return !!(last && last.senderType === 'contact')
}

let healthTimer = null

/** @type {any} */
export const conversationsStore = proxy({
  conversations: [],
  agents: [],
  activeConversationId: null,
  currentFilter: 'todos', // todos, minhas, nao-atribuidos, sem-resposta
  sidebarFilter: 'all',
  sidebarInboxId: null,
  // paginação da lista (100 por vez; "carregar mais" ao rolar até o fim)
  page: 1,
  hasMore: false,
  loadingMore: false,
  sortStatus: 'open',
  sortBy: 'latest',
  sortType: 'all',
  advancedFilters: [],
  wsReady: false,
  lastFetchedAt: null,
  currentUser: (() => {
    try { return JSON.parse(localStorage.getItem('user')) || { first_name: 'Usuário', email: '' } }
    catch { return { first_name: 'Usuário', email: '' } }
  })(),

  get activeConversation() {
    return this.conversations.find(c => c.id === this.activeConversationId) || null
  },

  get sidebarFilteredConversations() {
    const state = this
    // conversa criada por "Iniciar conversa" só entra na lista depois de ter mensagem
    // (a aberta continua visível mesmo vazia)
    let filtered = state.conversations.filter(c => (c.messages && c.messages.length > 0) || c.id === state.activeConversationId)

    // se o funil (filtro avançado) já escolhe status, ele manda — não soma com o ⇅
    const advancedStatus = state.advancedFilters?.some(f => f.attribute === 'status' && f.operator && f.value)
    if (!advancedStatus && state.sortStatus !== 'all') filtered = filtered.filter(c => c.status === state.sortStatus)

    if (state.sortType === 'unread') filtered = filtered.filter(c => c.unread > 0)
    else if (state.sortType === 'mentions') filtered = filtered.filter(() => false)

    if (state.sidebarFilter === 'mencoes') {
      filtered = filtered.filter(() => false)
    } else if (state.sidebarFilter === 'participantes') {
      // "Chats da equipe" = atribuídas a OUTRO membro
      filtered = filtered.filter(c => c.assignee_id && c.assignee_id !== state.currentUser.id)
    } else if (state.sidebarFilter === 'nao-atendidas') {
      filtered = filtered.filter(c => c.status === 'open' && c.unread > 0)
    }

    if (state.sidebarInboxId) filtered = filtered.filter(c => String(c.inbox_id) === String(state.sidebarInboxId))
    return filtered
  },

  get filteredConversations() {
    const state = this
    let filtered = this.sidebarFilteredConversations

    if (state.currentFilter === 'minhas') filtered = filtered.filter(c => c.assignee_id === state.currentUser.id)
    else if (state.currentFilter === 'nao-atribuidos') filtered = filtered.filter(c => !c.assignee)
    else if (state.currentFilter === 'sem-resposta') filtered = filtered.filter(isSemResposta)

    if (state.advancedFilters && state.advancedFilters.length > 0) {
      state.advancedFilters.forEach(filter => {
        if (!filter.attribute || !filter.operator || !filter.value) return
        filtered = filtered.filter(c => {
          let actualValue
          if (filter.attribute === 'status') {
            if (filter.value === 'all') return filter.operator !== 'not_equal_to'
            actualValue = c.status
          } else if (filter.attribute === 'assignee') {
            actualValue = c.assignee_id ? String(c.assignee_id) : 'unassigned'
          } else if (filter.attribute === 'carteira') {
            actualValue = c.contact?.custom_attributes?.gerente_jueri_nome || ''
          } else if (filter.attribute === 'sem_resposta') {
            actualValue = isSemResposta(c) ? 'sim' : 'nao'
          } else if (filter.attribute === 'criada_em') {
            const matches = matchesDateBucket(c.created_at_iso, filter.value)
            return filter.operator === 'not_equal_to' ? !matches : matches
          }
          if (filter.operator === 'equal_to') return actualValue === filter.value
          if (filter.operator === 'not_equal_to') return actualValue !== filter.value
          return true
        })
      })
    }

    // last_activity_iso é a data de verdade (timestamp é só "HH:MM" pra exibir)
    const sortValue = (c) => new Date(c.last_activity_iso || c.timestamp).getTime() || 0
    if (state.sortBy === 'oldest') filtered = [...filtered].sort((a, b) => sortValue(a) - sortValue(b))
    else filtered = [...filtered].sort((a, b) => sortValue(b) - sortValue(a))
    return filtered
  },

  async fetchConversations() {
    try {
      const response = await api.get('/conversations', { params: { inbox_id: this.sidebarInboxId || undefined, per_page: 100 } })
      this.page = 1
      this.hasMore = response.data.length === 100
      // mantém a conversa aberta mesmo se ela não estiver entre as 100 mais recentes
      const aberta = this.conversations.find(c => c.id === this.activeConversationId)
      const anteriores = new Map(this.conversations.map(c => [c.id, c]))
      this.conversations = response.data.map(nova => {
        const antiga = anteriores.get(nova.id)
        // histórico já carregado não pode ser trocado pela versão "só a última mensagem"
        if (antiga?.messages_loaded) {
          const ultimaNova = nova.messages[nova.messages.length - 1]
          const temTudo = !ultimaNova || antiga.messages.some(m => m.id === ultimaNova.id)
          if (!temTudo) this.loadFullConversation(nova.id)
          return { ...nova, messages: antiga.messages, messages_loaded: true }
        }
        return nova
      })
      if (aberta && !this.conversations.some(c => c.id === aberta.id)) {
        this.conversations.push(aberta)
        this.loadFullConversation(aberta.id)
      }
      this.lastFetchedAt = Date.now()
      if (!this.activeConversationId) {
        this.activeConversationId = this.sidebarFilteredConversations[0]?.id || null
        if (this.activeConversationId) this.loadFullConversation(this.activeConversationId)
      }
      this.setupWebSocket()
    } catch (error) {
      console.error('Error fetching conversations:', error)
    }
  },

  /** Busca o histórico completo de uma conversa (GET /conversations/:id). */
  async loadFullConversation(id) {
    try {
      const { data } = await api.get(`/conversations/${id}`)
      const idx = this.conversations.findIndex(c => c.id === data.id)
      if (idx !== -1) this.conversations[idx] = { ...data, unread: this.conversations[idx].unread }
      else this.conversations.push(data)
      return data
    } catch (error) {
      console.error('Error loading conversation:', error)
    }
  },

  // inicia (ou reabre) a conversa de uma revendedora sem mensagem ainda (régua: 3º/10º/20º dia)
  async startConversation(contactId, inboxId = null) {
    return this._createConversation({ contact_id: contactId }, inboxId)
  },

  // número não cadastrado: o backend reaproveita o contato se o telefone existir
  async startConversationWithPhone(phone, inboxId = null) {
    return this._createConversation({ phone }, inboxId)
  },

  async _createConversation(payload, inboxId) {
    if (inboxId) payload.inbox_id = inboxId
    const { data } = await api.post('/conversations', payload)
    const existing = this.conversations.findIndex(c => c.id === data.id)
    if (existing !== -1) this.conversations[existing] = data
    else this.conversations.unshift(data)
    return data
  },

  async fetchAgents() {
    try {
      const response = await api.get('/agents')
      this.agents = response.data
    } catch (error) {
      console.error('Error fetching agents:', error)
    }
  },

  async assignConversation(conversationId, userId) {
    const response = await api.put(`/conversations/${conversationId}`, { conversation: { user_id: userId } })
    const conv = this.conversations.find(c => c.id === conversationId)
    if (conv) { conv.assignee_id = response.data.assignee_id; conv.assignee = response.data.assignee }
  },

  async transferConversation(conversationId, userId, note) {
    const response = await api.put(`/conversations/${conversationId}`, { conversation: { user_id: userId }, transfer_note: note })
    const conv = this.conversations.find(c => c.id === conversationId)
    if (conv) { conv.assignee_id = response.data.assignee_id; conv.assignee = response.data.assignee }
    return response.data
  },

  setActiveConversation(id) {
    this.activeConversationId = id
    const conv = this.conversations.find(c => c.id === id)
    if (conv) {
      const hadUnread = conv.unread > 0
      conv.unread = 0
      // persiste no banco (unread_count), senão volta a contar no próximo refetch
      if (hadUnread) api.post(`/conversations/${id}/mark_as_read`).catch(() => {})
      if (!conv.messages_loaded) this.loadFullConversation(id)
    }
  },

  setFilter(filterType) { this.currentFilter = filterType },

  setSidebarFilter(filterType) {
    const trocouCaixa = this.sidebarInboxId != null
    this.sidebarFilter = filterType
    this.sidebarInboxId = null
    this.reconcileActiveConversation()
    if (trocouCaixa) this.fetchConversations()
  },

  setSidebarInboxId(inboxId) {
    const trocouCaixa = String(this.sidebarInboxId) !== String(inboxId)
    this.sidebarInboxId = inboxId
    this.sidebarFilter = null
    this.reconcileActiveConversation()
    // a lista vem do servidor já filtrada por caixa (senão só apareciam as que estavam entre as 100 da conta)
    if (trocouCaixa) this.fetchConversations()
  },

  /** Próximas 100 conversas (rolou até o fim da lista). */
  async loadMore() {
    if (this.loadingMore || !this.hasMore) return
    this.loadingMore = true
    try {
      const { data } = await api.get('/conversations', { params: { inbox_id: this.sidebarInboxId || undefined, per_page: 100, page: this.page + 1 } })
      const ids = new Set(this.conversations.map(c => c.id))
      this.conversations.push(...data.filter(c => !ids.has(c.id)))
      this.page += 1
      this.hasMore = data.length === 100
    } catch (error) {
      console.error('Erro ao carregar mais conversas:', error)
    } finally {
      this.loadingMore = false
    }
  },

  // ao trocar de filtro/caixa, não deixa aberta uma conversa que não pertence ao filtro
  reconcileActiveConversation() {
    const stillVisible = this.sidebarFilteredConversations.some(c => c.id === this.activeConversationId)
    if (!stillVisible) {
      this.activeConversationId = this.sidebarFilteredConversations[0]?.id || null
      if (this.activeConversationId) this.loadFullConversation(this.activeConversationId)
    }
  },

  setSortFilters({ status, sortBy, type }) {
    this.sortStatus = status
    this.sortBy = sortBy
    this.sortType = type
  },

  setAdvancedFilters(filters) { this.advancedFilters = filters },

  async sendMessage(text, isPrivate = false, file = null) {
    // lança erro em vez de engolir (Bel, 2026-10-01: mensagem sumia sem aviso)
    if (!this.activeConversationId || (!text.trim() && !file)) throw new Error('Nenhuma conversa ativa ou mensagem vazia')
    let response
    if (file) {
      const formData = new FormData()
      formData.append('text', text)
      formData.append('is_private', isPrivate)
      formData.append('attachment', file, file.name || 'audio.webm')
      response = await api.post(`/conversations/${this.activeConversationId}/messages`, formData, { headers: { 'Content-Type': undefined } })
    } else {
      response = await api.post(`/conversations/${this.activeConversationId}/messages`, { text, is_private: isPrivate })
    }
    const newMsg = response.data.message
    const conv = this.conversations.find(c => c.id === this.activeConversationId)
    if (conv) {
      if (!conv.messages) conv.messages = []
      if (!conv.messages.some(m => m.id === newMsg.id)) conv.messages.push(newMsg)
      conv.preview = newMsg.text
      conv.timestamp = newMsg.timestamp
    }
  },

  async updateContact(contactId, data) {
    const response = await api.put(`/contacts/${contactId}`, { contact: data })
    this.conversations.forEach(c => { if (c.contact && c.contact.id === contactId) Object.assign(c.contact, response.data) })
  },

  async deleteContact(contactId) {
    await api.delete(`/contacts/${contactId}`)
    this.conversations = this.conversations.filter(c => !c.contact || c.contact.id !== contactId)
    if (this.activeConversation && this.activeConversation.contact.id === contactId) this.activeConversationId = null
  },

  async deleteConversation(conversationId) {
    await api.delete(`/conversations/${conversationId}`)
    this.conversations = this.conversations.filter(c => c.id !== conversationId)
    if (this.activeConversationId === conversationId) this.activeConversationId = null
  },

  async addNote(contactId, content) {
    const response = await api.post(`/contacts/${contactId}/add_note`, { content })
    this.conversations.forEach(c => {
      if (c.contact && c.contact.id === contactId) {
        if (!c.contact.notes) c.contact.notes = []
        c.contact.notes.unshift({ id: response.data.id, content: response.data.content, created_at: response.data.created_at, author: response.data.user?.first_name || 'Sistema' })
      }
    })
  },

  async mergeContact(contactId, targetContactId) {
    await api.post(`/contacts/${contactId}/merge`, { target_contact_id: targetContactId })
    await this.fetchConversations()
  },

  async updateConversationStatus(conversationId, status) {
    try {
      const response = await api.put(`/conversations/${conversationId}`, { conversation: { status } })
      const conv = this.conversations.find(c => c.id === conversationId)
      if (conv) { conv.status = response.data.status; conv.snoozed_until = response.data.snoozed_until || null }
    } catch (error) {
      console.error('Error updating conversation status:', error)
    }
  },

  async snoozeConversation(conversationId, snoozedUntil) {
    const response = await api.put(`/conversations/${conversationId}`, { conversation: { status: 'snoozed', snoozed_until: snoozedUntil } })
    const conv = this.conversations.find(c => c.id === conversationId)
    if (conv) { conv.status = 'snoozed'; conv.snoozed_until = response.data.snoozed_until }
  },

  async resolveConversation(conversationId, { kanbanStage, sendClosingMessage, closingMessageText }) {
    await api.put(`/conversations/${conversationId}`, {
      conversation: { status: 'resolved' },
      kanban_stage: kanbanStage || '',
      send_closing_message: sendClosingMessage,
      closing_message_text: closingMessageText || '',
    })
    const conv = this.conversations.find(c => c.id === conversationId)
    if (conv) { conv.status = 'resolved'; conv.snoozed_until = null }
  },

  setupWebSocket() {
    if (this.wsReady) return
    this.wsReady = true
    // sem conexão em tempo real, recarrega a lista a cada 12s (igual ao health-check da v1)
    if (!healthTimer) healthTimer = setInterval(() => { if (!isSocketConnected()) conversationsStore.fetchConversations() }, 12000)
    const socket = getSocket()
    socket.on('conversations', (payload) => conversationsStore.handleEvent(payload))
    // reconectou depois de cair: busca o que pode ter perdido
    socket.io.on('reconnect', () => conversationsStore.fetchConversations())
  },

  handleEvent(payload) {
    try {
      if (!payload) return
      if (payload.event === 'message_created') {
        const { conversation_id, message: newMsg } = payload
        const conv = this.conversations.find(c => Number(c.id) === Number(conversation_id))
        if (conv) {
          if (!conv.messages) conv.messages = []
          const existingIdx = conv.messages.findIndex(m => m.id === newMsg.id)
          if (existingIdx === -1) {
            conv.messages.push(newMsg)
            conv.preview = newMsg.text
            conv.timestamp = newMsg.timestamp
            conv.last_activity_iso = newMsg.timestamp
            if (Number(conversation_id) !== Number(this.activeConversationId)) conv.unread = (conv.unread || 0) + 1
            window.dispatchEvent(new CustomEvent('new-message', { detail: { conversationId: conversation_id } }))
          } else {
            // reenvio da mesma mensagem (anexo terminou de baixar): atualiza em vez de ignorar
            conv.messages[existingIdx] = { ...conv.messages[existingIdx], ...newMsg }
            conv.preview = newMsg.text
          }
        } else {
          this.fetchConversations()
        }
      } else if (payload.event === 'inbox_updated') {
        window.dispatchEvent(new CustomEvent('inbox-updated', { detail: payload }))
      } else if (payload.event === 'contact_updated') {
        window.dispatchEvent(new CustomEvent('contact-updated', { detail: payload }))
      } else if (payload.event === 'conversation_tags_updated') {
        const conv = this.conversations.find(c => c.id === payload.conversation_id)
        if (conv) conv.tags = payload.tags
      } else if (payload.event === 'conversation_updated') {
        const conv = this.conversations.find(c => Number(c.id) === Number(payload.conversation?.id))
        if (conv) {
          const { messages, messages_loaded, ...rest } = payload.conversation
          Object.assign(conv, rest)
          // payload completo (com histórico) substitui; parcial mantém as mensagens atuais
          if (messages_loaded && messages) { conv.messages = messages; conv.messages_loaded = true }
        } else {
          this.fetchConversations()
        }
      } else if (payload.event === 'snooze_expired') {
        const conv = this.conversations.find(c => Number(c.id) === Number(payload.conversation_id))
        if (conv) { conv.status = 'open'; conv.snoozed_until = null }
        window.dispatchEvent(new CustomEvent('snooze-expired', { detail: payload }))
      } else if (payload.event === 'lead_atribuido') {
        if (Number(payload.assigned_to_user_id) === Number(this.currentUser?.id)) {
          window.dispatchEvent(new CustomEvent('lead-atribuido', { detail: payload }))
        }
      }
    } catch (error) {
      console.error('WS message error:', error)
    }
  },
})

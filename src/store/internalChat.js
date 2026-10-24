import { proxy } from 'valtio'
import Swal from 'sweetalert2'
import api from '../api'
import { getSocket } from '../lib/realtime'

// "Chats da equipe" (modelo do Kommo): conversas particulares, grupos e menções. A lista vem do
// servidor já resumida (nome, última mensagem, não lidas, destaque, silenciar); as mensagens de cada
// conversa ficam em messagesByChat. Tempo real pelo canal 'internal_chat' (evento 'team_chat').
const previewFor = (msg) => {
  if (msg.text) return msg.text
  const t = msg.attachment_type || ''
  if (t.startsWith('image/')) return 'Foto'
  if (t.startsWith('audio/')) return 'Áudio'
  if (t.startsWith('video/')) return 'Vídeo'
  return msg.attachment_name || 'Arquivo'
}

/** @type {any} */
export const internalChatStore = proxy({
  chats: [],
  activeChatId: null,
  messagesByChat: {},
  filter: 'all',
  sort: 'recent',
  q: '',
  from: '',
  to: '',
  wsReady: false,
  isLoadingThreads: false,
  isLoadingMessages: false,
  currentUser: (() => { try { return JSON.parse(localStorage.getItem('user')) || {} } catch { return {} } })(),

  // activeChatId nulo = nenhuma aberta (colega sem conversa também tem id nulo — não confundir)
  get activeChat() { return this.activeChatId == null ? null : this.chats.find(c => c.id === this.activeChatId) || null },
  get activeMessages() { return this.activeChatId == null ? [] : this.messagesByChat[this.activeChatId] || [] },
  // contador do menu: não conta conversa silenciada (igual ao Kommo)
  get totalUnread() { return this.chats.reduce((s, c) => s + (c.muted ? 0 : c.unread_count || 0), 0) },

  async fetchThreads() {
    this.isLoadingThreads = true
    try {
      const { data } = await api.get('/team_chats', { params: { filter: this.filter, sort: this.sort, q: this.q || undefined, from: this.from || undefined, to: this.to || undefined } })
      this.chats = data
    } catch (error) {
      console.error('Erro ao buscar os chats da equipe:', error)
    } finally {
      this.isLoadingThreads = false
    }
  },

  /** Abre uma conversa da lista (colega sem conversa ainda = cria a particular). */
  async open(item) {
    let id = item.id
    if (!id) {
      const { data } = await api.post('/team_chats/direct', { user_id: item.other_user_id })
      id = data.id
      const i = this.chats.findIndex(c => !c.id && c.other_user_id === item.other_user_id)
      if (i >= 0) this.chats.splice(i, 1, data); else this.chats.unshift(data)
    }
    this.activeChatId = id
    this.isLoadingMessages = true
    try {
      const { data } = await api.get(`/team_chats/${id}/messages`)
      this.messagesByChat[id] = data
      const c = this.chats.find(c => c.id === id)
      if (c) c.unread_count = 0
    } finally {
      this.isLoadingMessages = false
    }
    return id
  },

  async refreshActive() {
    const id = this.activeChatId
    if (!id) return
    const { data } = await api.get(`/team_chats/${id}/messages`)
    if (this.activeChatId === id && data.length !== (this.messagesByChat[id] || []).length) this.messagesByChat[id] = data
    const c = this.chats.find(c => c.id === id)
    if (c) c.unread_count = 0
  },

  // file opcional — foto, documento ou áudio gravado na hora
  async sendMessage(text, file = null) {
    const trimmed = (text || '').trim()
    const id = this.activeChatId
    if (!id || (!trimmed && !file)) return
    const fd = new FormData()
    if (trimmed) fd.append('text', trimmed)
    if (file) fd.append('attachment', file, file.name || 'audio.webm')
    const { data } = await api.post(`/team_chats/${id}/messages`, fd, { headers: { 'Content-Type': undefined } })
    this.pushMessage(id, data)
    return data
  },

  pushMessage(chatId, msg) {
    if (!this.messagesByChat[chatId]) this.messagesByChat[chatId] = []
    if (!this.messagesByChat[chatId].some(m => m.id === msg.id)) this.messagesByChat[chatId].push(msg)
    const c = this.chats.find(c => c.id === chatId)
    if (c) {
      c.last_message = { text: previewFor(msg), kind: msg.kind, sender_id: msg.sender_id, sender_name: msg.sender_name, created_at: msg.created_at }
      c.last_message_at = msg.created_at
    }
  },

  async createGroup(name, memberIds) {
    const { data } = await api.post('/team_chats/group', { name, member_ids: memberIds })
    this.chats.unshift(data)
    return data
  },
  async updateGroup(id, body) {
    const { data } = await api.put(`/team_chats/${id}`, body)
    const i = this.chats.findIndex(c => c.id === id); if (i >= 0) this.chats[i] = data
    return data
  },
  async leave(id) {
    await api.post(`/team_chats/${id}/leave`)
    this.chats = this.chats.filter(c => c.id !== id)
    if (this.activeChatId === id) this.activeChatId = null
  },
  async setMember(id, body) {
    const { data } = await api.patch(`/team_chats/${id}/member`, body)
    const i = this.chats.findIndex(c => c.id === id); if (i >= 0) this.chats[i] = data
  },
  async bulk(ids, action) {
    await api.post('/team_chats/bulk', { ids, action })
    await this.fetchThreads()
  },

  setupWebSocket() {
    if (this.wsReady) return
    this.wsReady = true
    getSocket().on('internal_chat', (payload) => internalChatStore.handleEvent(payload))
  },

  handleEvent(payload) {
    try {
      const me = this.currentUser.id
      if (payload?.event === 'team_chat_removed' && (payload.member_ids || []).includes(me)) {
        this.chats = this.chats.filter(c => c.id !== payload.chat_id)
        if (this.activeChatId === payload.chat_id) this.activeChatId = null
        return
      }
      if (payload?.event !== 'team_chat' || !(payload.member_ids || []).includes(me)) return
      const msg = payload.message
      const c = this.chats.find(c => c.id === payload.chat_id)
      if (!c) { this.fetchThreads(); return }
      this.pushMessage(payload.chat_id, msg)
      const minha = msg.sender_id === me
      if (minha || msg.kind !== 'text') return
      if (this.activeChatId === payload.chat_id && document.visibilityState === 'visible' && location.pathname.startsWith('/chat-equipe')) {
        api.post(`/team_chats/${payload.chat_id}/read`).catch(() => {})
      } else {
        c.unread_count = (c.unread_count || 0) + 1
        if (!c.muted) this.notify(c, msg)
      }
    } catch (e) {
      console.error('Erro processando mensagem do chat da equipe:', e)
    }
  },

  notify(chat, msg) {
    const titulo = chat.kind === 'direct' ? chat.name : `${msg.sender_name || 'Colega'} · ${chat.name}`
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: titulo, text: previewFor(msg), showConfirmButton: false, timer: 4500, timerProgressBar: true })
  },
})


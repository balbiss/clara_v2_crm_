import { proxy } from 'valtio'
import Swal from 'sweetalert2'
import api from '../api'
import { getSocket } from '../lib/realtime'

const previewFor = (msg) => {
  if (msg.text) return msg.text
  if (msg.attachment_type?.startsWith('image/')) return 'Foto'
  if (msg.attachment_type?.startsWith('audio/')) return 'Áudio'
  if (msg.attachment_type) return msg.attachment_name || 'Documento'
  return ''
}

// Chat interno da equipe (sem relação com WhatsApp). Porte de store/internalChat.js da v1.
/** @type {any} */
export const internalChatStore = proxy({
  threads: [],
  activeUserId: null,
  messagesByUser: {},
  wsReady: false,
  isLoadingThreads: false,
  isLoadingMessages: false,
  currentUser: (() => { try { return JSON.parse(localStorage.getItem('user')) || {} } catch { return {} } })(),

  get activeMessages() { return this.messagesByUser[this.activeUserId] || [] },
  get activeThread() { return this.threads.find(t => t.id === this.activeUserId) || null },
  get totalUnread() { return this.threads.reduce((sum, t) => sum + (t.unread_count || 0), 0) },

  async fetchThreads() {
    this.isLoadingThreads = true
    try {
      const { data } = await api.get('/internal_messages/threads')
      this.threads = data
    } catch (error) {
      console.error('Erro ao buscar conversas internas:', error)
    } finally {
      this.isLoadingThreads = false
    }
  },

  async openThread(userId) {
    this.activeUserId = userId
    this.isLoadingMessages = true
    try {
      const { data } = await api.get('/internal_messages', { params: { with: userId } })
      this.messagesByUser[userId] = data
      const t = this.threads.find(t => t.id === userId)
      if (t) t.unread_count = 0
    } catch (error) {
      console.error('Erro ao abrir conversa interna:', error)
    } finally {
      this.isLoadingMessages = false
    }
  },

  // file opcional — foto, documento ou áudio gravado na hora (Blob)
  async sendMessage(text, file = null) {
    const trimmed = (text || '').trim()
    if (!this.activeUserId || (!trimmed && !file)) return
    const formData = new FormData()
    formData.append('recipient_id', this.activeUserId)
    if (trimmed) formData.append('text', trimmed)
    if (file) formData.append('attachment', file, file.name || 'audio.webm')
    // Content-Type undefined: o navegador gera o boundary do multipart
    const { data } = await api.post('/internal_messages', formData, { headers: { 'Content-Type': undefined } })
    if (!this.messagesByUser[this.activeUserId]) this.messagesByUser[this.activeUserId] = []
    if (!this.messagesByUser[this.activeUserId].some(m => m.id === data.id)) this.messagesByUser[this.activeUserId].push(data)
    const t = this.threads.find(t => t.id === this.activeUserId)
    if (t) { t.last_message = previewFor(data); t.last_message_at = data.created_at }
    return data
  },

  setupWebSocket() {
    if (this.wsReady) return
    this.wsReady = true
    getSocket().on('internal_chat', (payload) => internalChatStore.handleEvent(payload))
  },

  handleEvent(payload) {
    try {
      if (!payload || payload.event !== 'internal_message_created') return
      const msg = payload.message
      const me = this.currentUser.id
      if (msg.sender_id !== me && msg.recipient_id !== me) return
      const otherId = msg.sender_id === me ? msg.recipient_id : msg.sender_id
      const isIncoming = msg.recipient_id === me
      const isViewingThread = this.activeUserId === otherId
      if (!this.messagesByUser[otherId]) this.messagesByUser[otherId] = []
      if (!this.messagesByUser[otherId].some(m => m.id === msg.id)) this.messagesByUser[otherId].push(msg)
      const t = this.threads.find(t => t.id === otherId)
      if (t) {
        t.last_message = previewFor(msg)
        t.last_message_at = msg.created_at
        if (isIncoming && !isViewingThread) {
          t.unread_count = (t.unread_count || 0) + 1
          this.notifyNewMessage(t, msg)
        } else if (isIncoming && isViewingThread) {
          // conversa aberta: marca como lida no servidor
          api.get('/internal_messages', { params: { with: otherId } }).catch(() => {})
        }
      } else {
        this.fetchThreads().then(() => {
          if (isIncoming) {
            const newT = internalChatStore.threads.find(t => t.id === otherId)
            if (newT) internalChatStore.notifyNewMessage(newT, msg)
          }
        })
      }
    } catch (e) {
      console.error('Erro processando mensagem do chat interno:', e)
    }
  },

  // toast estilo WhatsApp quando chega mensagem de um colega fora da conversa aberta
  notifyNewMessage(thread, msg) {
    const name = `${thread.first_name || ''} ${thread.last_name || ''}`.trim() || 'Colega'
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: name, text: previewFor(msg), showConfirmButton: false, timer: 4500, timerProgressBar: true })
  },
})

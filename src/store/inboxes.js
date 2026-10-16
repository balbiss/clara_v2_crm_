import { proxy } from 'valtio'
import api from '../api'

// Porte de store/inboxes.js da v1 (Pinia → valtio: mesma mutação direta).
let pollTimer = null
const CONNECTABLE = ['baileys', 'waha', 'instagram']

/** @type {any} */
export const inboxesStore = proxy({
  inboxes: [],
  isLoading: false,
  isLoadedOnce: false,
  lastFetchedAt: null,

  get disconnectedInboxes() {
    return this.inboxes.filter(i => CONNECTABLE.includes(i.provider) && i.connected === false)
  },

  async fetchInboxes() {
    if (!this.isLoadedOnce) this.isLoading = true
    try {
      const response = await api.get('/inboxes')
      // mescla os status já conhecidos pra não piscar
      this.inboxes = response.data.map(newInbox => {
        const oldInbox = this.inboxes.find(i => i.id === newInbox.id)
        return {
          ...newInbox,
          connected: oldInbox && oldInbox.connected !== undefined ? oldInbox.connected : (CONNECTABLE.includes(newInbox.provider) ? undefined : null),
        }
      })
      this.isLoadedOnce = true
      this.lastFetchedAt = Date.now()
      this.inboxes.forEach(inbox => { if (CONNECTABLE.includes(inbox.provider)) this.checkStatus(inbox.id) })
    } catch (error) {
      console.error('Failed to fetch inboxes:', error)
    } finally {
      this.isLoading = false
    }
  },

  async checkStatus(id) {
    try {
      const response = await api.get(`/inboxes/${id}/status`)
      const inbox = this.inboxes.find(i => i.id === id)
      if (inbox) inbox.connected = response.data.connected
    } catch {
      const inbox = this.inboxes.find(i => i.id === id)
      if (inbox) inbox.connected = false
    }
  },

  // reconsulta a cada 60s pra detectar queda mesmo navegando fora de Configurações
  startStatusPolling() {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      inboxesStore.inboxes.forEach(inbox => { if (CONNECTABLE.includes(inbox.provider)) inboxesStore.checkStatus(inbox.id) })
    }, 60000)
  },

  stopStatusPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  },

  removeInbox(id) {
    this.inboxes = this.inboxes.filter(i => i.id !== id)
  },
})

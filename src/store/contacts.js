import { proxy } from 'valtio'
import api from '../api'

/** @type {any} */
export const contactsStore = proxy({
  contacts: [],
  isLoading: false,
  isLoadedOnce: false,
  lastFetchedAt: null,

  async fetchContacts() {
    if (!this.isLoadedOnce) this.isLoading = true
    try {
      // a carteira passa de 300 — o endpoint pagina (máx 200), então busca todas as páginas:
      // Ativas/Inativas filtram no cliente e precisam do conjunto completo
      const perPage = 200
      let page = 1
      let all = []
      while (true) {
        const response = await api.get('/contacts', { params: { page, per_page: perPage } })
        all = all.concat(response.data)
        if (response.data.length < perPage) break
        page += 1
      }
      this.contacts = all
      this.isLoadedOnce = true
      this.lastFetchedAt = Date.now()
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    } finally {
      this.isLoading = false
    }
  },

  removeContact(id) {
    this.contacts = this.contacts.filter(c => c.id !== id)
  },
})

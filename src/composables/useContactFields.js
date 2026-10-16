import { proxy, useSnapshot } from 'valtio'
import api from '../api'
import { ASSIGNABLE_FIELDS } from '../constants/contactFields'

// Campos do painel de contato = 13 fixos + os que a dona criou em Configurações → Campos do Contato.
// Estado compartilhado entre telas — busca uma vez só.
const state = proxy({ customFields: [] })
let carregando = null

const carregar = (forcar = false) => {
  if (!carregando || forcar) {
    carregando = api.get('/contact_custom_fields')
      .then(({ data }) => { state.customFields = data || [] })
      .catch(e => { console.error('Erro ao buscar campos personalizados:', e); carregando = null })
  }
  return carregando
}

export function useContactFields() {
  carregar()
  const snap = useSnapshot(state)
  const allFields = [...ASSIGNABLE_FIELDS, ...snap.customFields]
  const labelOf = (key) => allFields.find(f => f.key === key)?.label || key
  return { customFields: snap.customFields, allFields, labelOf, reloadCustomFields: () => carregar(true) }
}

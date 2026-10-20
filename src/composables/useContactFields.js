import { proxy, useSnapshot } from 'valtio'
import api from '../api'
import { ASSIGNABLE_FIELDS } from '../constants/contactFields'

// Campos do lead/contato = 13 fixos + os criados na aba "Configurar" (padrão Kommo). Vêm do backend
// já com tipo, opções de lista, etapas obrigatórias, "só API" e "oculto" (?all=1).
// Estado compartilhado entre telas — busca uma vez só.
const state = proxy({ customFields: [], fields: [] })
let carregando = null

const carregar = (forcar = false) => {
  if (!carregando || forcar) {
    carregando = api.get('/contact_custom_fields', { params: { all: 1 } })
      .then(({ data }) => {
        state.fields = data || []
        state.customFields = (data || []).filter(f => !f.builtin)
      })
      .catch(e => { console.error('Erro ao buscar campos personalizados:', e); carregando = null })
  }
  return carregando
}

export function useContactFields() {
  carregar()
  const snap = useSnapshot(state)
  const allFields = snap.fields.length ? snap.fields : ASSIGNABLE_FIELDS
  const labelOf = (key) => allFields.find(f => f.key === key)?.label || key
  const fieldOf = (key) => allFields.find(f => f.key === key) || { key, label: key, type: 'text' }
  return { customFields: snap.customFields, allFields, labelOf, fieldOf, reloadCustomFields: () => carregar(true) }
}

export const reloadContactFields = () => carregar(true)

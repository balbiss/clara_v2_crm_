import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { Plus, Trash2 } from 'lucide-react'
import api from '../api'
import { agentsStore } from '../store/agents'
import { useLocal } from '../lib/hooks'
import '../styles/vue/ConversationFilterPopover.scss'

// Porte de components/ConversationFilterPopover.vue
/* eslint-disable @typescript-eslint/no-explicit-any */
const attributes = [
  { value: 'status', label: 'Status' }, { value: 'assignee', label: 'Responsável' }, { value: 'carteira', label: 'Carteira' },
  { value: 'sem_resposta', label: 'Sem resposta' }, { value: 'criada_em', label: 'Criada em' },
]
const operators = [{ value: 'equal_to', label: '= Igual a' }, { value: 'not_equal_to', label: '!= Diferente de' }]
const newFilter = () => ({ id: Date.now() + Math.random(), attribute: 'status', operator: 'equal_to', value: 'open' })

export default function ConversationFilterPopover({ isOpen, initialFilters = [], onClose, onApply }: {
  isOpen: boolean; initialFilters?: readonly any[]; onClose: () => void; onApply: (f: any[]) => void
}) {
  const agents = useSnapshot(agentsStore)
  const [s, v] = useLocal(() => ({
    localFilters: initialFilters.length > 0 ? JSON.parse(JSON.stringify(initialFilters)) : [newFilter()],
    teams: [] as any[],
  }))

  useEffect(() => {
    if (!agentsStore.isLoadedOnce) agentsStore.fetchAgents()
    api.get('/sales_teams').then(({ data }) => { s.teams = data }).catch(e => console.error('Erro ao buscar times de vendas (filtro Carteira):', e))
  }, [s])

  const getValuesForAttribute = (attr: string) => {
    if (attr === 'status') return [{ value: 'open', label: 'Abertas' }, { value: 'resolved', label: 'Resolvidas' }, { value: 'snoozed', label: 'Adiadas' }, { value: 'all', label: 'Todas' }]
    if (attr === 'assignee') return [{ value: 'unassigned', label: 'Não atribuído' }, ...agents.agents.map((a: any) => ({ value: String(a.id), label: `${a.first_name || ''} ${a.last_name || ''}`.trim() }))]
    if (attr === 'carteira') return v.teams.map((t: any) => ({ value: t.nome, label: t.nome }))
    if (attr === 'sem_resposta') return [{ value: 'sim', label: 'Sim, aguardando resposta' }, { value: 'nao', label: 'Não, já foi respondida' }]
    if (attr === 'criada_em') return [
      { value: 'hoje', label: 'Hoje' }, { value: 'ontem', label: 'Ontem' }, { value: '7dias', label: 'Últimos 7 dias' },
      { value: '30dias', label: 'Últimos 30 dias' }, { value: 'mes_atual', label: 'Este mês' }, { value: 'mes_passado', label: 'Mês passado' },
    ]
    return []
  }
  const addFilter = () => { s.localFilters.push(newFilter()) }
  const removeFilter = (id: number) => { s.localFilters = s.localFilters.filter((f: any) => f.id !== id) }
  const clearFilters = () => { s.localFilters = []; onApply([]); onClose() }
  const applyFilters = () => { onApply(JSON.parse(JSON.stringify(s.localFilters))); onClose() }

  if (!isOpen) return null
  return (
    <div className="vs-ConversationFilterPopover" style={{ display: 'contents' }}>
      <div className="filter-popover" onClick={e => e.stopPropagation()}>
        <h3 className="popover-title">Filtrar conversas</h3>
        <div className="filters-list">
          {v.localFilters.map((filter: any, index: number) => (
            <div key={filter.id} className="filter-row">
              <select value={filter.attribute} onChange={e => { s.localFilters[index].attribute = e.target.value }} className="filter-select attr-select">
                {attributes.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <select value={filter.operator} onChange={e => { s.localFilters[index].operator = e.target.value }} className="filter-select op-select">
                {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filter.value} onChange={e => { s.localFilters[index].value = e.target.value }} className="filter-select val-select">
                {getValuesForAttribute(filter.attribute).map((val: any) => <option key={val.value} value={val.value}>{val.label}</option>)}
              </select>
              <button className="action-icon add-icon" onClick={addFilter} title="Adicionar condição AND"><Plus className="icon-sm" /></button>
              <button className="action-icon trash-icon" onClick={() => removeFilter(filter.id)} title="Remover regra"><Trash2 className="icon-sm" /></button>
            </div>
          ))}
        </div>
        <div className="popover-actions-bottom">
          <button className="add-filter-text-btn" onClick={addFilter}>Adicionar filtro</button>
          <div className="right-actions">
            <button className="btn-secondary" onClick={clearFilters}>Limpar filtros</button>
            <button className="btn-primary" onClick={applyFilters}>Aplicar filtros</button>
          </div>
        </div>
      </div>
    </div>
  )
}

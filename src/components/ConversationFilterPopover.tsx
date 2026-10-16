import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { Plus, Trash2 } from 'lucide-react'
import api from '../api'
import { agentsStore } from '../store/agents'
import { useLocal } from '../lib/hooks'
import { btn, inputStyle, Dropdown, serif } from './ui'

// Filtro avançado da lista de conversas (lógica da Clara v1, visual do v2)
/* eslint-disable @typescript-eslint/no-explicit-any */
const attributes = [
  { value: 'status', label: 'Status' }, { value: 'assignee', label: 'Responsável' }, { value: 'carteira', label: 'Carteira' },
  { value: 'sem_resposta', label: 'Sem resposta' }, { value: 'criada_em', label: 'Criada em' },
]
const operators = [{ value: 'equal_to', label: 'é igual a' }, { value: 'not_equal_to', label: 'é diferente de' }]
const newFilter = () => ({ id: Date.now() + Math.random(), attribute: 'status', operator: 'equal_to', value: 'open' })
const sel = { ...inputStyle, padding: '7px 8px', fontSize: 12.5 }

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

  const valuesFor = (attr: string) => {
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

  return (
    <Dropdown open={isOpen} style={{ left: 0, right: 'auto', width: 440, padding: 16 }}>
      <h3 style={{ ...serif, fontSize: 19, margin: '0 0 12px' }}>Filtrar conversas</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {v.localFilters.map((f: any, i: number) => (
          <div key={f.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={f.attribute} onChange={e => { s.localFilters[i].attribute = e.target.value }} style={sel}>
              {attributes.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <select value={f.operator} onChange={e => { s.localFilters[i].operator = e.target.value }} style={sel}>
              {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={f.value} onChange={e => { s.localFilters[i].value = e.target.value }} style={sel}>
              {valuesFor(f.attribute).map((x: any) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <button title="Remover regra" onClick={() => { s.localFilters = s.localFilters.filter((x: any) => x.id !== f.id) }} style={{ border: 'none', background: 'none', color: 'var(--muted)', flex: 'none' }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <button onClick={addFilter} style={{ border: 'none', background: 'none', color: 'var(--terra)', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Adicionar condição</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => { s.localFilters = []; onApply([]); onClose() }} style={btn('ghost', { padding: '7px 12px', fontSize: 12.5 })}>Limpar</button>
        <button onClick={() => { onApply(JSON.parse(JSON.stringify(s.localFilters))); onClose() }} style={btn('primary', { padding: '7px 12px', fontSize: 12.5 })}>Aplicar</button>
      </div>
    </Dropdown>
  )
}

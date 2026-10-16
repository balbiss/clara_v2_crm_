import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { Plus, Pencil, Trash2, Lock, Unlock, RefreshCw, X, Check, ShieldAlert } from 'lucide-react'
import api from '../api'
import { agentsStore } from '../store/agents'
import { btn, inputStyle } from '../components/ui'
import { PageHead, DataTable, IconBtn, Badge, Section, toast, confirmBox } from '../components/ui2'
import { readUser } from '../lib/hooks'

// Equipe (usuários do CRM) + rodízio de atribuição + grupos de rodízio
/* eslint-disable @typescript-eslint/no-explicit-any */
const DEPT: Record<string, { label: string; tone: 'blue' | 'green' | 'amber' | 'red' }> = {
  corretor: { label: 'Consultora', tone: 'blue' }, suporte: { label: 'Suporte', tone: 'green' },
  financeiro: { label: 'Financeiro', tone: 'amber' }, manutencao: { label: 'Manutenção', tone: 'red' },
}

export default function Agents() {
  const navigate = useNavigate()
  const store = useSnapshot(agentsStore) as any
  const me = readUser()
  const [groups, setGroups] = useState<any[]>([])
  const [showGroups, setShowGroups] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)

  const loadGroups = async () => { try { setGroups((await api.get('/round_robin_groups')).data) } catch (e) { console.error('Erro ao carregar grupos de rodízio', e) } }
  useEffect(() => { agentsStore.fetchAgents(); loadGroups() }, [])

  const createGroup = async () => {
    const name = newGroup.trim()
    if (!name) return
    try { const { data } = await api.post('/round_robin_groups', { round_robin_group: { name } }); setGroups(g => [...g, data]); setNewGroup('') } catch { toast('error', 'Erro ao criar grupo.') }
  }
  const saveGroup = async () => {
    if (!editing || !editing.name.trim()) return
    try { const { data } = await api.put(`/round_robin_groups/${editing.id}`, { round_robin_group: { name: editing.name.trim() } }); setGroups(g => g.map(x => (x.id === data.id ? data : x))); setEditing(null) } catch { toast('error', 'Erro ao renomear grupo.') }
  }
  const deleteGroup = async (g: any) => {
    if (!(await confirmBox(`Excluir o grupo "${g.name}"?`, 'As consultoras e números vinculados voltam a usar o rodízio geral da conta.', 'Sim, excluir'))) return
    try { await api.delete(`/round_robin_groups/${g.id}`); setGroups(x => x.filter(y => y.id !== g.id)); agentsStore.fetchAgents() } catch { toast('error', 'Erro ao excluir grupo.') }
  }

  // fila por grupo: só consultoras ativas no rodízio, ordenadas pela posição
  const consultoras = store.agents.filter((a: any) => a.available_for_roundrobin && a.status === 'active' && a.department === 'corretor')
  const sortFn = (a: any, b: any) => (a.queue_position ?? 9999) - (b.queue_position ?? 9999)
  const buckets: { group: any | null; agents: any[] }[] = groups.map(g => ({ group: g, agents: consultoras.filter((a: any) => a.round_robin_group_id === g.id).sort(sortFn) }))
  const semGrupo = consultoras.filter((a: any) => !a.round_robin_group_id).sort(sortFn)
  if (semGrupo.length > 0 || groups.length === 0) buckets.push({ group: null, agents: semGrupo })
  const queuePos = (a: any) => {
    const b = buckets.find(x => (x.group?.id ?? null) === (a.round_robin_group_id ?? null))
    const i = b ? b.agents.findIndex(x => x.id === a.id) : -1
    return i === -1 ? '?' : i + 1
  }

  const block = async (a: any) => { if (await confirmBox(`Bloquear ${a.first_name}?`, 'A pessoa perde o acesso ao CRM até ser desbloqueada.', 'Sim, bloquear')) { try { await api.patch(`/agents/${a.id}/block`); agentsStore.fetchAgents() } catch { toast('error', 'Erro ao bloquear.') } } }
  const unblock = async (a: any) => { try { await api.patch(`/agents/${a.id}/unblock`); agentsStore.fetchAgents() } catch { toast('error', 'Erro ao desbloquear.') } }
  const remove = async (a: any) => {
    if (!(await confirmBox('Apagar esta pessoa?', 'A exclusão é permanente. Se ela tiver histórico, prefira bloquear.', 'Sim, apagar'))) return
    try { await api.delete(`/agents/${a.id}`); agentsStore.fetchAgents() } catch (e: any) { toast('error', e.response?.data?.error || 'Erro ao apagar.') }
  }
  const toggleRR = async (a: any) => {
    setToggling(a.id)
    try { const { data } = await api.patch(`/agents/${a.id}/toggle_roundrobin`); agentsStore.agents = agentsStore.agents.map((x: any) => (x.id === a.id ? { ...x, ...data } : x)) }
    catch { toast('error', 'Erro ao alterar rodízio.') } finally { setToggling(null) }
  }

  return (
    <div>
      <PageHead title="Agentes" subtitle="Usuários do CRM, perfis de acesso e fila de rodízio.">
        <button onClick={() => setShowGroups(s => !s)} style={btn('ghost')}>{showGroups ? 'Fechar grupos' : 'Grupos de rodízio'}</button>
        <button onClick={() => navigate('/agentes/novo')} style={btn('primary')}><Plus size={15} /> Novo agente</button>
      </PageHead>

      {showGroups && (
        <Section title="Grupos de rodízio" description="Ex.: Venda, Locação, Equipe do João. Cada número de WhatsApp pode ser ligado a um grupo em Caixas de Entrada.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {groups.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {editing?.id === g.id ? (
                  <>
                    <input autoFocus value={editing?.name ?? ""} onChange={e => { const v = e.target.value; setEditing(p => (p ? { ...p, name: v } : p)) }} onKeyUp={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setEditing(null) }} style={inputStyle} />
                    <IconBtn title="Salvar" onClick={saveGroup}><Check size={14} /></IconBtn>
                    <IconBtn title="Cancelar" onClick={() => setEditing(null)}><X size={14} /></IconBtn>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{g.name}</span>
                    <IconBtn title="Renomear" onClick={() => setEditing({ id: g.id, name: g.name })}><Pencil size={14} /></IconBtn>
                    <IconBtn title="Excluir" danger onClick={() => deleteGroup(g)}><Trash2 size={14} /></IconBtn>
                  </>
                )}
              </div>
            ))}
            {groups.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum grupo criado. Sem grupos, o rodízio usa todas as consultoras da conta.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newGroup} onChange={e => setNewGroup(e.target.value)} onKeyUp={e => { if (e.key === 'Enter') createGroup() }} placeholder="Nome do novo grupo (ex.: Locação)" style={inputStyle} />
            <button onClick={createGroup} style={btn('ghost')}><Plus size={14} /> Adicionar</button>
          </div>
        </Section>
      )}

      {buckets.some(b => b.agents.length > 0) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 20 }}>
          {buckets.filter(b => b.agents.length > 0).map(b => (
            <div key={b.group?.id ?? 'sem'} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                <RefreshCw size={13} /> Fila — {b.group ? b.group.name : 'conta inteira'}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>Novos leads vão para o 1º da fila.</p>
              {b.agents.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 13.5 }}>
                  <b style={{ width: 26, color: 'var(--terra)' }}>{i + 1}º</b>
                  <span style={{ flex: 1 }}>{a.first_name} {a.last_name}</span>
                  {i === 0 && <Badge tone="blue">próximo</Badge>}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : !store.isLoading && <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}><RefreshCw size={14} /> Nenhuma consultora na fila de rodízio. Ative o rodízio nas pessoas abaixo.</p>}

      <DataTable loading={store.isLoading && !store.agents.length} empty="Nenhum agente cadastrado."
        columns={[{ label: 'Status' }, { label: 'Nome' }, { label: 'Departamento' }, { label: 'E-mail' }, { label: 'WhatsApp' }, { label: 'Rodízio' }, { label: 'Ações', width: 130, align: 'right' }]}
        rows={store.agents.map((a: any) => [
          <Badge key="s" tone={a.status === 'blocked' ? 'red' : 'green'}>{a.status === 'blocked' ? 'Bloqueado' : 'Ativo'}</Badge>,
          <span key="n" style={{ fontWeight: 600 }}>{a.first_name} {a.last_name} {a.role === 'diretoria' && <span style={{ marginLeft: 6 }}><Badge tone="blue"><ShieldAlert size={10} style={{ verticalAlign: -1 }} /> Diretoria</Badge></span>}</span>,
          <Badge key="d" tone={(DEPT[a.department] || DEPT.corretor).tone}>{(DEPT[a.department] || DEPT.corretor).label}</Badge>,
          <span key="e" style={{ color: 'var(--muted)' }}>{a.email}</span>,
          <span key="w" style={{ color: 'var(--muted)' }}>{a.phone || '—'}</span>,
          a.department === 'corretor' || !a.department ? (
            <button key="r" disabled={toggling === a.id || a.status === 'blocked'} onClick={() => toggleRR(a)} title={a.available_for_roundrobin ? 'Remover da fila' : 'Adicionar à fila'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', fontSize: 12.5, color: a.available_for_roundrobin ? 'var(--terra)' : 'var(--muted)', fontWeight: 600 }}>
              <span style={{ position: 'relative', width: 30, height: 17, borderRadius: 9, background: a.available_for_roundrobin ? 'var(--terra)' : 'var(--line)' }}>
                <span style={{ position: 'absolute', top: 2, left: a.available_for_roundrobin ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
              </span>
              {a.available_for_roundrobin ? `${queuePos(a)}º na fila` : 'Desligado'}
            </button>
          ) : <span key="r" style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>,
          <span key="a" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <IconBtn title="Editar" onClick={() => navigate(`/agentes/${a.id}/editar`)}><Pencil size={14} /></IconBtn>
            {a.id !== me.id ? (
              <>
                {a.status === 'active' ? <IconBtn title="Bloquear" onClick={() => block(a)}><Lock size={14} /></IconBtn> : <IconBtn title="Desbloquear" onClick={() => unblock(a)}><Unlock size={14} /></IconBtn>}
                <IconBtn title="Excluir" danger onClick={() => remove(a)}><Trash2 size={14} /></IconBtn>
              </>
            ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>(você)</span>}
          </span>,
        ])} />
    </div>
  )
}

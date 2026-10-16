import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { UserX } from 'lucide-react'
import { contactsStore } from '../store/contacts'
import { agentsStore } from '../store/agents'
import { INACTIVE_STATUS_LABELS, statusLabel } from '../constants/regua'
import { PageHead, DataTable, Badge } from '../components/ui2'
import { SearchBox, Chips, Toolbar, NameCell, EmptyBlock, agentNames, fmtDate, statusTone } from '../components/lists'

// Revendedoras Inativas: lista com filtro pelos 7 sub-status de inativa (sem funil/kanban).
/* eslint-disable @typescript-eslint/no-explicit-any */
const OPTIONS = [{ value: 'all', label: 'Todos os status' }, ...Object.entries(INACTIVE_STATUS_LABELS).map(([value, label]) => ({ value, label: label as string }))]

export default function RevendedorasInativas() {
  const navigate = useNavigate()
  const store = useSnapshot(contactsStore) as any
  const agents = useSnapshot(agentsStore) as any
  const [loading, setLoading] = useState(!contactsStore.isLoadedOnce)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const names = agentNames(agents.agents)

  useEffect(() => {
    (async () => {
      try { if (!contactsStore.isLoadedOnce) await contactsStore.fetchContacts(); if (!agentsStore.isLoadedOnce) await agentsStore.fetchAgents() } finally { setLoading(false) }
    })()
  }, [])

  const keys = Object.keys(INACTIVE_STATUS_LABELS)
  const list = useMemo(() => {
    let l = store.contacts.filter((c: any) => keys.includes(c.status))
    if (status !== 'all') l = l.filter((c: any) => c.status === status)
    const s = q.trim().toLowerCase()
    if (s) l = l.filter((c: any) => (c.name || `${c.first_name || ''} ${c.last_name || ''}`).toLowerCase().includes(s) || (c.phone || '').includes(s) || (c.city || '').toLowerCase().includes(s))
    return [...l].sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [store.contacts, status, q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHead title="Inativas" subtitle={`${list.length} revendedora${list.length === 1 ? '' : 's'} fora do ciclo ativo`} />
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Buscar por nome, telefone ou cidade…" /></Toolbar>
      <div style={{ marginBottom: 16 }}><Chips options={OPTIONS} value={status} onChange={setStatus} /></div>
      <DataTable loading={loading} empty={<EmptyBlock icon={<UserX size={26} />} title="Nenhuma revendedora inativa encontrada" text="Ajuste os filtros, ou ninguém está fora do ciclo ativo hoje." />}
        columns={[{ label: 'Revendedora' }, { label: 'Status' }, { label: 'Telefone' }, { label: 'Cidade' }, { label: 'Responsável anterior' }, { label: 'Motivo' }, { label: 'Atualizado' }]}
        onRowClick={i => navigate(`/contatos/${list[i].id}`)}
        rows={list.map((c: any) => [
          <NameCell key="n" c={c} />, <Badge key="s" tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>,
          c.phone || '—', c.city || '—', names[c.user_id] || 'Não atribuído', c.custom_attributes?.motivo_inativacao || '—', fmtDate(c.updated_at) || '—',
        ])} />
    </div>
  )
}

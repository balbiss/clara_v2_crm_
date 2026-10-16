import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { AlertTriangle, Clock, MessageCircle, Users, X } from 'lucide-react'
import api from '../api'
import { contactsStore } from '../store/contacts'
import { agentsStore } from '../store/agents'
import { ACTIVE_STATUS_LABELS, statusLabel } from '../constants/regua'
import { isFullPortfolio as isFullPortfolioRole } from '../config/roles'
import { nivelInfo, nivelLimpo, NIVEL_META } from '../constants/nivel'
import { readUser } from '../lib/hooks'
import { btn } from '../components/ui'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { PageHead, DataTable, Badge, toast } from '../components/ui2'
import { SearchBox, Chips, Toolbar, selectStyle, NameCell, EmptyBlock, useStartConversation, agentNames, brl, fmtDate, statusTone } from '../components/lists'

// Minhas Revendedoras (ativas): carteira em ciclo consignado, filtros, atribuição em lote,
// próxima tarefa de cada uma e "Time Travel" (quem estava ativa numa data passada).
/* eslint-disable @typescript-eslint/no-explicit-any */
const NIVEL_ORDEM = ['Pré-consignado', 'Consignado', 'Safira', 'Rubi', 'Esmeralda', 'Diamante']
const STAGES = [{ value: 'all', label: 'Todas as etapas' }, ...Object.entries(ACTIVE_STATUS_LABELS).map(([value, label]) => ({ value, label: label as string }))]
// "Dias com maleta" = desde o início do ciclo ativo (cycle_started_at), não desde a última sub-etapa
const daysInCycle = (c: any) => {
  const since = c?.cycle_started_at || c?.status_changed_at || c?.created_at
  if (!since) return null
  const d = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)
  return d >= 0 ? d : null
}
const isAtrasada = (c: any) => c.status === 'atrasada' || (daysInCycle(c) ?? 0) > 35
const hojeISO = () => new Date().toISOString().slice(0, 10)

// dd/mm hh:mm em duas linhas curtas (cabe na tabela sem rolagem lateral)
const shortDT = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return <span style={{ whiteSpace: 'nowrap', lineHeight: 1.35 }}>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}<br /><span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></span>
}

export default function RevendedorasAtivas() {
  const navigate = useNavigate()
  const store = useSnapshot(contactsStore) as any
  const agents = useSnapshot(agentsStore) as any
  const isFull = isFullPortfolioRole(readUser())
  const { start, busyId } = useStartConversation()
  const [loading, setLoading] = useState(!contactsStore.isLoadedOnce)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('all')
  const [resp, setResp] = useState('all')
  const [nivel, setNivel] = useState('all')
  const [tt, setTt] = useState('')
  const [snapshot, setSnapshot] = useState<any[]>([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [bulkTarget, setBulkTarget] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [tarefas, setTarefas] = useState<Record<number, any>>({})
  const names = agentNames(agents.agents)

  useEffect(() => {
    (async () => {
      try {
        if (!contactsStore.isLoadedOnce) await contactsStore.fetchContacts()
        if (!agentsStore.isLoadedOnce) await agentsStore.fetchAgents()
        const { data } = await api.get('/tarefas', { params: { status: 'pendente' } })
        const m: Record<number, any> = {}
        data.forEach((t: any) => { if (!m[t.contact_id]) m[t.contact_id] = t })
        setTarefas(m)
      } catch (e) { console.error('Erro ao buscar tarefas:', e) } finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => {
    if (!tt) return
    setSnapLoading(true)
    api.get('/contacts/ativas', { params: { data: tt } }).then(({ data }) => setSnapshot(data.revendedoras)).catch(e => { console.error('Erro no Time Travel:', e); setSnapshot([]) }).finally(() => setSnapLoading(false))
  }, [tt])

  const activeKeys = Object.keys(ACTIVE_STATUS_LABELS)
  const actives = useMemo(() => store.contacts.filter((c: any) => activeKeys.includes(c.status || 'revendedor_ativo')), [store.contacts]) // eslint-disable-line react-hooks/exhaustive-deps
  const nivelOptions = useMemo(() => {
    const presentes = new Set<string>(actives.map((c: any) => nivelLimpo(c.nivel)).filter(Boolean))
    const ord = NIVEL_ORDEM.filter(n => presentes.has(n)), outros = [...presentes].filter(n => !NIVEL_ORDEM.includes(n))
    return [{ value: 'all', label: 'Todos os níveis' }, ...[...ord, ...outros].map(n => ({ value: n, label: `${(NIVEL_META as any)[n]?.emoji || '•'} ${n}` }))]
  }, [actives])

  const byResp = (list: any[]) => (!isFull || resp === 'all') ? list : resp === 'none' ? list.filter(c => !c.user_id) : list.filter(c => String(c.user_id) === resp)
  const bySearch = (list: any[]) => { const s = q.trim().toLowerCase(); return s ? list.filter(c => (c.name || `${c.first_name || ''} ${c.last_name || ''}`).toLowerCase().includes(s) || (c.phone || '').includes(s)) : list }
  const filtered = useMemo(() => {
    let l = actives
    if (stage !== 'all') l = l.filter((c: any) => (c.status || 'revendedor_ativo') === stage)
    if (nivel !== 'all') l = l.filter((c: any) => nivelLimpo(c.nivel) === nivel)
    return [...bySearch(byResp(l))].sort((a, b) => (daysInCycle(b) ?? 0) - (daysInCycle(a) ?? 0))
  }, [actives, stage, nivel, q, resp, isFull]) // eslint-disable-line react-hooks/exhaustive-deps
  const filteredSnap = bySearch(byResp(snapshot))
  const totalValor = filtered.reduce((s: number, c: any) => s + (parseFloat(c.valor_aberto) || 0), 0)
  const allSel = filtered.length > 0 && filtered.every((c: any) => selected.includes(c.id))

  const applyBulk = async () => {
    if (!selected.length || !bulkTarget) return
    setBulkBusy(true)
    try {
      await api.patch('/contacts/bulk_assign', { contact_ids: selected, user_id: bulkTarget === 'null' ? null : Number(bulkTarget) })
      await contactsStore.fetchContacts()
      setSelected([]); setBulkTarget('')
    } catch { toast('error', 'Erro ao atribuir em lote.') } finally { setBulkBusy(false) }
  }

  const subtitle = tt
    ? `Snapshot de ${fmtDate(tt)} — ${filteredSnap.length} revendedora${filteredSnap.length === 1 ? '' : 's'} ativa${filteredSnap.length === 1 ? '' : 's'} naquela data`
    : `Carteira em ciclo consignado — ${filtered.length} ativa${filtered.length === 1 ? '' : 's'}, ${brl(totalValor) || 'R$ 0,00'} em maleta aberta`

  return (
    <div>
      <PageHead title="Minhas revendedoras" subtitle={subtitle} />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome ou telefone…" />
        {isFull && (
          <select value={resp} onChange={e => setResp(e.target.value)} style={selectStyle}>
            <option value="all">Todos os responsáveis</option><option value="none">Sem responsável</option>
            {agents.agents.map((a: any) => <option key={a.id} value={String(a.id)}>{names[a.id]}</option>)}
          </select>
        )}
        {!tt && <select value={nivel} onChange={e => setNivel(e.target.value)} style={selectStyle}>{nivelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
        <span title="Time Travel: quem estava ativa em uma data" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 8, padding: '0 6px 0 10px', background: 'var(--card)', height: 38 }}>
          <Clock size={15} color="var(--muted)" />
          <input type="date" value={tt} max={hojeISO()} onChange={e => setTt(e.target.value)} style={{ border: 'none', background: 'none', fontSize: 13 }} />
          {tt && <button title="Voltar para hoje" onClick={() => setTt('')} style={{ border: 'none', background: 'none', color: 'var(--muted)', display: 'flex' }}><X size={14} /></button>}
        </span>
      </Toolbar>
      {!tt && <div style={{ marginBottom: 16 }}><Chips options={STAGES} value={stage} onChange={setStage} /></div>}

      {isFull && selected.length > 0 && !tt && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', background: 'var(--terraSoft)', borderRadius: 10, marginBottom: 14, fontSize: 13.5 }}>
          <b>{selected.length} selecionada{selected.length === 1 ? '' : 's'}</b>
          <select value={bulkTarget} onChange={e => setBulkTarget(e.target.value)} style={selectStyle}>
            <option value="" disabled>Atribuir para…</option><option value="null">Sem responsável</option>
            {agents.agents.map((a: any) => <option key={a.id} value={a.id}>{names[a.id]}</option>)}
          </select>
          <button disabled={!bulkTarget || bulkBusy} onClick={applyBulk} style={btn('primary', { padding: '7px 14px', opacity: bulkTarget ? 1 : 0.5 })}>{bulkBusy ? 'Aplicando…' : 'Aplicar'}</button>
          <button onClick={() => setSelected([])} style={{ border: 'none', background: 'none', color: 'var(--muted)', fontWeight: 600 }}>Cancelar</button>
        </div>
      )}
      {tt && <p style={{ fontSize: 13, color: 'var(--muted)', background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>Snapshot reconstruído de <b>{fmtDate(tt)}</b> — etapa da régua e tarefas não se aplicam a datas passadas, só o volume de peças em aberto naquele momento.</p>}

      {tt ? (
        <DataTable loading={snapLoading} empty={<EmptyBlock icon={<Clock size={26} />} title="Nenhuma revendedora ativa nessa data" text={`Ninguém tinha peças em aberto acima do limiar em ${fmtDate(tt)}.`} />}
          columns={[{ label: 'Revendedora' }, { label: 'Telefone' }, { label: 'Peças em aberto' }, { label: 'Pedidos abertos' }, { label: 'Responsável' }]}
          onRowClick={i => navigate(`/contatos/${filteredSnap[i].id}`)}
          rows={filteredSnap.map(c => [<NameCell key="n" c={c} />, c.phone || '—', c.pecas_abertas, c.pedidos_abertos_count, names[c.user_id] || 'Não atribuído'])} />
      ) : (
        <DataTable compact loading={loading} empty={<EmptyBlock icon={<Users size={26} />} title="Nenhuma revendedora ativa encontrada" text="Ajuste os filtros ou aguarde novas revendedoras entrarem em ciclo." />}
          columns={[
            ...(isFull ? [{ label: <input type="checkbox" checked={allSel} onChange={() => setSelected(allSel ? [] : filtered.map((c: any) => c.id))} onClick={e => e.stopPropagation()} />, width: 36 }] : []),
            { label: 'Revendedora' }, { label: 'Nível' }, { label: 'Etapa' }, { label: 'Tarefa' }, { label: 'Dias maleta' }, { label: 'Peças' }, { label: 'Valor aberto' },
            { label: 'Previsão acerto' }, { label: 'Agendamento' }, { label: 'Interação' }, { label: 'Alerta' }, { label: 'Carteira' }, { label: '', width: 38 },
          ]}
          onRowClick={i => navigate(`/contatos/${filtered[i].id}`)}
          rows={filtered.map((c: any) => [
            ...(isFull ? [<input key="ck" type="checkbox" checked={selected.includes(c.id)} onClick={e => e.stopPropagation()} onChange={() => setSelected(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])} />] : []),
            <NameCell key="n" c={c} />,
            c.nivel ? <span key="v" style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: nivelInfo(c.nivel).color, background: nivelInfo(c.nivel).bg, whiteSpace: 'nowrap' }}>{nivelInfo(c.nivel).emoji} {nivelInfo(c.nivel).nome}</span> : '—',
            <Badge key="e" tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>,
            <span key="t" style={{ color: 'var(--muted)' }}>{tarefas[c.id]?.titulo || '—'}</span>,
            daysInCycle(c) !== null ? `${daysInCycle(c)} dias` : '—',
            c.pecas_abertas_atual ?? '—', brl(c.valor_aberto) || '—', fmtDate(c.data_prevista_acerto) || '—', shortDT(c.proximo_agendamento_em), shortDT(c.ultima_interacao_em),
            isAtrasada(c) ? <Badge key="a" tone="red"><AlertTriangle size={10} style={{ verticalAlign: -1 }} /> Atrasada</Badge> : <span key="a" style={{ color: 'var(--plantao)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap' }}>Em dia</span>,
            <span key="c" style={{ whiteSpace: 'nowrap' }}>{c.custom_attributes?.gerente_jueri_nome || 'Sem time'}</span>,
            <button key="m" title="Iniciar conversa no WhatsApp" disabled={busyId === c.id} onClick={e => { e.stopPropagation(); start(c) }}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WhatsAppIcon size={24} /></button>,
          ])} />
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { ArrowDownUp, Check, Download, Filter, MessageCircle, MoreVertical, X } from 'lucide-react'
import { contactsStore } from '../store/contacts'
import { ALL_STATUS_LABELS, statusLabel } from '../constants/regua'
import { useClickOutside } from '../lib/hooks'
import { btn } from '../components/ui'
import { PageHead, Badge } from '../components/ui2'
import { ChatAvatar } from '../components/ChatAvatar'
import { Modal } from '../components/ui'
import { SearchBox, contactName, EmptyBlock, statusTone, useStartConversation } from '../components/lists'
import { Dropdown, MenuItem } from '../components/ui'

// Contatos: todos os cadastros visíveis ao usuário, com busca, filtros, ordenação, exportação CSV
// e "Enviar mensagem" (abre a conversa da revendedora escolhida).
/* eslint-disable @typescript-eslint/no-explicit-any */
const SORTS = [{ value: 'newest', label: 'Mais recentes' }, { value: 'oldest', label: 'Mais antigos' }, { value: 'name_asc', label: 'Nome A → Z' }, { value: 'name_desc', label: 'Nome Z → A' }]
const TEMPS: Record<string, { label: string; color: string }> = { hot: { label: 'Quente', color: '#ef4444' }, warm: { label: 'Morno', color: '#f59e0b' }, cold: { label: 'Frio', color: '#6b7280' } }
const iconBtn = (active: boolean): React.CSSProperties => ({ position: 'relative', width: 38, height: 38, border: '1px solid ' + (active ? 'var(--terra)' : 'var(--line)'), borderRadius: 8, background: active ? 'var(--terraSoft)' : 'var(--card)', color: active ? 'var(--terra)' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' })

export default function Contacts() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const store = useSnapshot(contactsStore) as any
  const { start } = useStartConversation()
  const [q, setQ] = useState(params.get('q') || '')
  const [sort, setSort] = useState('newest')
  const [statuses, setStatuses] = useState<string[]>([])
  const [temps, setTemps] = useState<string[]>([])
  const [menu, setMenu] = useState<'filter' | 'sort' | 'more' | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendQ, setSendQ] = useState('')
  const ref = useClickOutside<HTMLDivElement>(() => setMenu(null), menu !== null)

  useEffect(() => { contactsStore.fetchContacts() }, [])
  useEffect(() => { setQ(params.get('q') || '') }, [params])

  const hasTemps = store.contacts.some((c: any) => c.temperature)
  const list = useMemo(() => {
    let l: any[] = store.contacts
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(c => contactName(c).toLowerCase().includes(s) || (c.phone || '').includes(s) || (c.email || '').toLowerCase().includes(s))
    if (statuses.length) l = l.filter(c => statuses.includes(c.status || 'revendedor_ativo'))
    if (temps.length) l = l.filter(c => temps.includes(c.temperature))
    return [...l].sort((a, b) => sort === 'name_asc' ? contactName(a).localeCompare(contactName(b)) : sort === 'name_desc' ? contactName(b).localeCompare(contactName(a))
      : sort === 'oldest' ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [store.contacts, q, statuses, temps, sort])

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const filterCount = statuses.length + temps.length

  const exportCsv = () => {
    const header = ['Nome', 'Telefone', 'E-mail', 'Etapa', 'Cidade', 'Origem']
    const rows = list.map(c => [contactName(c), c.phone || '', c.email || '', statusLabel(c.status), c.city || '', c.source || ''])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    Object.assign(document.createElement('a'), { href: url, download: 'contatos.csv' }).click()
    URL.revokeObjectURL(url)
    setMenu(null)
  }

  const sendList = useMemo(() => {
    const s = sendQ.toLowerCase()
    return (s ? store.contacts.filter((c: any) => contactName(c).toLowerCase().includes(s) || (c.phone || '').includes(s)) : store.contacts).slice(0, 12)
  }, [store.contacts, sendQ])

  const check = (on: boolean) => <span style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid ' + (on ? 'var(--terra)' : 'var(--line)'), background: on ? 'var(--terra)' : 'none', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{on && <Check size={11} />}</span>

  return (
    <div>
      <PageHead title="Contatos" subtitle={`${list.length} contato${list.length === 1 ? '' : 's'}${q || filterCount ? ' com os filtros aplicados' : ''}`}>
        <SearchBox value={q} onChange={setQ} placeholder="Pesquisar nome, telefone ou e-mail…" />
        <div ref={ref} style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button title="Filtrar" style={iconBtn(filterCount > 0)} onClick={() => setMenu(m => (m === 'filter' ? null : 'filter'))}>
              <Filter size={16} />{filterCount > 0 && <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 17, height: 17, borderRadius: 9, background: 'var(--terra)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{filterCount}</span>}
            </button>
            <Dropdown open={menu === 'filter'} style={{ width: 250, padding: 12, maxHeight: 420, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12.5, fontWeight: 700 }}>
                Filtrar por etapa {filterCount > 0 && <button onClick={() => { setStatuses([]); setTemps([]) }} style={{ border: 'none', background: 'none', color: 'var(--terra)', fontWeight: 700, fontSize: 12 }}>Limpar</button>}
              </div>
              {Object.entries(ALL_STATUS_LABELS).map(([v, label]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, cursor: 'pointer' }} onClick={() => toggle(statuses, setStatuses, v)}>{check(statuses.includes(v))}{label as string}</label>
              ))}
              {hasTemps && (
                <>
                  <div style={{ margin: '10px 0 6px', fontSize: 12.5, fontWeight: 700 }}>Temperatura</div>
                  {Object.entries(TEMPS).map(([v, t]) => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, cursor: 'pointer' }} onClick={() => toggle(temps, setTemps, v)}>{check(temps.includes(v))}<span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />{t.label}</label>
                  ))}
                </>
              )}
            </Dropdown>
          </div>
          <div style={{ position: 'relative' }}>
            <button title="Ordenar" style={iconBtn(sort !== 'newest')} onClick={() => setMenu(m => (m === 'sort' ? null : 'sort'))}><ArrowDownUp size={16} /></button>
            <Dropdown open={menu === 'sort'}>
              {SORTS.map(o => <MenuItem key={o.value} onClick={() => { setSort(o.value); setMenu(null) }}>{sort === o.value ? <Check size={13} /> : <span style={{ width: 13 }} />} {o.label}</MenuItem>)}
            </Dropdown>
          </div>
          <div style={{ position: 'relative' }}>
            <button title="Mais opções" style={iconBtn(false)} onClick={() => setMenu(m => (m === 'more' ? null : 'more'))}><MoreVertical size={16} /></button>
            <Dropdown open={menu === 'more'}><MenuItem onClick={exportCsv}><Download size={14} /> Exportar CSV ({list.length})</MenuItem></Dropdown>
          </div>
        </div>
        <button onClick={() => setSendOpen(true)} style={btn('primary')}><MessageCircle size={14} /> Enviar mensagem</button>
      </PageHead>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {store.isLoading && !store.contacts.length && Array.from({ length: 5 }, (_, i) => <div key={i} style={{ height: 64, borderRadius: 12, background: 'var(--skel)', animation: 'pulse 1.2s infinite' }} />)}
        {list.slice(0, 300).map(c => (
          <button key={c.id} onClick={() => navigate(`/contatos/${c.id}`)} className="hoverable"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', textAlign: 'left' }}>
            <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={38} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14 }}>{contactName(c)}</b>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{c.phone || 'Sem telefone'}{c.email ? ` · ${c.email}` : ''}</span>
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {c.temperature && TEMPS[c.temperature] && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: TEMPS[c.temperature].color + '22', color: TEMPS[c.temperature].color }}>{TEMPS[c.temperature].label}</span>}
              {c.source && <Badge>{c.source}</Badge>}
              <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
            </span>
          </button>
        ))}
        {!store.isLoading && list.length === 0 && <EmptyBlock icon={<MessageCircle size={26} />} title={q || filterCount ? 'Nenhum contato encontrado para os filtros aplicados.' : 'Nenhum contato cadastrado.'} />}
        {list.length > 0 && <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>Exibindo {Math.min(list.length, 300)} de {store.contacts.length} contatos{list.length > 300 ? ' — refine a busca para ver os demais' : ''}</p>}
      </div>

      {sendOpen && (
        <Modal title="Enviar mensagem" subtitle="Escolha o contato para abrir a conversa no WhatsApp." onClose={() => setSendOpen(false)}>
          <input autoFocus value={sendQ} onChange={e => setSendQ(e.target.value)} placeholder="Buscar contato…" style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 13.5, marginBottom: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
            {sendList.map((c: any) => (
              <button key={c.id} onClick={() => { setSendOpen(false); start(c) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--line)', background: 'var(--card)', textAlign: 'left' }}>
                <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={30} />
                <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13.5 }}>{contactName(c)}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.phone || 'Sem telefone'}</span></span>
                <MessageCircle size={15} color="var(--terra)" />
              </button>
            ))}
            {sendList.length === 0 && <p style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', margin: 0 }}>Nenhum contato encontrado.</p>}
          </div>
        </Modal>
      )}
      <span style={{ display: 'none' }}><X /></span>
    </div>
  )
}

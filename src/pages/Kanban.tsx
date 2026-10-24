import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { ArrowDownUp, Info, List, ListChecks, MoreHorizontal, Phone, Plus, Zap } from 'lucide-react'
import api from '../api'
import { contactsStore } from '../store/contacts'
import { Modal, btn, inputStyle } from '../components/ui'
import { PageHead, toast } from '../components/ui2'
import { ChatAvatar } from '../components/ChatAvatar'
import { SearchBox, brl, contactName } from '../components/lists'
import { useClickOutside, useWindowEvent } from '../lib/hooks'

// Consignado: a régua da revenda em colunas (mesmos nomes/checklists que a Clara usava no Kommo).
// Mover o card só troca contact.status — o backend registra a mudança no histórico.
// Revendedora não é criada aqui: só vem do Jueri, então "Adicionar" busca quem já existe.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Col = { id: string; name: string; color: string; checklist?: string[]; note?: string }
const COLUMNS: Col[] = [
  { id: 'revendedor_ativo', name: 'Revendedor ativo', color: '#123C87' },
  { id: 'terceiro_dia', name: '3° dia', color: '#1E77E2', checklist: ['Mensagem de incentivo', 'Perguntar se conseguiu ver o catálogo', 'Instruir compartilhar as fotos'] },
  { id: 'decimo_dia', name: '10° dia', color: '#0E7C66', checklist: ['Mensagem de incentivo', 'Perguntar como estão as vendas', 'Lembrar do prazo'] },
  { id: 'vigesimo_dia', name: '20° dia', color: '#7c3aed', checklist: ['Agendar o acerto', 'Incentivar a vender mais até o último dia', 'Pegar encomendas para o próximo mês'] },
  { id: 'agendado', name: 'Agendado', color: '#d97706', note: 'Lembrar de incluir a Data de Agendamento na Revendedora ao movê-la para esta etapa. Depois de feito o acerto, mover a Revendedora para Revendedor Ativo e incluir a Data do Último Acerto.' },
  { id: 'reagendar', name: 'Reagendar', color: '#db2777' },
  { id: 'atrasada', name: 'Atrasada', color: '#B42318' },
]
const IDS = COLUMNS.map(c => c.id)
// sem status só é revendedora ativa se tiver cadastro no Jueri; contato comum do WhatsApp fica fora da régua
const statusOf = (c: any) => c.status || (c.id_jueri ? 'revendedor_ativo' : '')

function MoveMenu({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button title="Mover para…" onClick={() => setOpen(o => !o)} style={{ width: 24, height: 24, border: 'none', borderRadius: 6, background: open ? 'var(--bg)' : 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={15} /></button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 30, minWidth: 170, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 5, boxShadow: '0 12px 28px rgba(8,17,31,.14)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '5px 8px' }}>Mover para…</div>
          {COLUMNS.filter(c => c.id !== current).map(c => (
            <button key={c.id} onClick={() => { setOpen(false); onPick(c.id) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', border: 'none', background: 'none', borderRadius: 6, fontSize: 12.5, textAlign: 'left', color: 'var(--ink)' }} className="hoverable">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />{c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Kanban() {
  const navigate = useNavigate()
  const store = useSnapshot(contactsStore) as any
  const [loading, setLoading] = useState(!contactsStore.isLoadedOnce)
  const [q, setQ] = useState('')
  const [sortByName, setSortByName] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [hideChecklists, setHideChecklists] = useState(false)
  const [addTo, setAddTo] = useState<string | null>(null)
  const [addQ, setAddQ] = useState('')

  const load = async () => { try { await contactsStore.fetchContacts() } finally { setLoading(false) } }
  useEffect(() => { if (!contactsStore.isLoadedOnce) load() }, [])
  useWindowEvent('contact-updated', () => { contactsStore.fetchContacts() })

  // só revendedoras em ciclo (régua ativa); inativas e atacado têm telas próprias
  const byCol = useMemo(() => {
    const s = q.trim().toLowerCase()
    const map: Record<string, any[]> = Object.fromEntries(IDS.map(id => [id, []]))
    store.contacts.forEach((c: any) => {
      const st = statusOf(c)
      if (!IDS.includes(st)) return
      if (s && !contactName(c).toLowerCase().includes(s) && !(c.phone || '').includes(s)) return
      map[st].push(c)
    })
    if (sortByName) Object.values(map).forEach(l => l.sort((a, b) => contactName(a).localeCompare(contactName(b), 'pt-BR')))
    return map
  }, [store.contacts, q, sortByName])
  const total = Object.values(byCol).reduce((n, l) => n + l.length, 0)

  const move = async (contactId: number, to: string) => {
    const c = contactsStore.contacts.find((x: any) => x.id === contactId)
    if (!c || statusOf(c) === to) return
    const from = c.status
    c.status = to
    try { await api.put(`/contacts/${contactId}`, { contact: { status: to } }) }
    catch { c.status = from; toast('error', 'Não foi possível salvar a nova etapa.') }
  }

  const addList = useMemo(() => {
    if (!addTo) return []
    const s = addQ.toLowerCase()
    return store.contacts.filter((c: any) => statusOf(c) !== addTo && (!s || contactName(c).toLowerCase().includes(s) || (c.phone || '').includes(s))).slice(0, 20)
  }, [store.contacts, addTo, addQ])
  const addExisting = async (c: any) => { setAddTo(null); await move(c.id, addTo!) }

  const iconBtn = (on: boolean): React.CSSProperties => ({ width: 36, height: 36, border: '1px solid ' + (on ? 'var(--terra)' : 'var(--line)'), borderRadius: 8, background: on ? 'var(--terraSoft)' : 'var(--card)', color: on ? 'var(--terra)' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' })

  return (
    <div>
      <PageHead title="Consignado" subtitle={`${total} revendedora${total === 1 ? '' : 's'} na régua do mês — arraste o card para mudar de etapa.`}>
        <div style={{ width: 240, display: 'flex' }}><SearchBox value={q} onChange={setQ} placeholder="Pesquisar nome ou telefone…" /></div>
        <button title={sortByName ? 'Ordenado por nome (A-Z) — clique pra desfazer' : 'Ordenar por nome (A-Z)'} onClick={() => setSortByName(s => !s)} style={iconBtn(sortByName)}><ArrowDownUp size={15} /></button>
        <button title={hideChecklists ? 'Mostrar check-lists' : 'Esconder check-lists'} onClick={() => setHideChecklists(h => !h)} style={iconBtn(hideChecklists)}><ListChecks size={15} /></button>
        <button title="Ver como lista" onClick={() => navigate('/carteira')} style={iconBtn(false)}><List size={15} /></button>
        <button onClick={() => navigate('/funil/automatize')} style={btn('ghost')}><Zap size={14} /> Automatize</button>
        <button onClick={() => { setAddQ(''); setAddTo('revendedor_ativo') }} style={btn('primary')}><Plus size={15} /> Adicionar</button>
      </PageHead>

      {loading ? <p style={{ color: 'var(--muted)' }}>Carregando o Consignado…</p> : (
        <div className="kanban-board" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, height: 'calc(100vh - 275px)', minHeight: 420, alignItems: 'stretch' }}>
          {COLUMNS.map(col => {
            const cards = byCol[col.id]
            const over = overCol === col.id
            const venda = cards.reduce((s, c) => s + (parseFloat(c.custom_attributes?.venda) || 0), 0)
            return (
              <div key={col.id}
                onDragOver={e => { e.preventDefault(); if (overCol !== col.id) setOverCol(col.id) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
                onDrop={() => { setOverCol(null); if (dragId) move(dragId, col.id); setDragId(null) }}
                style={{ flex: '0 0 236px', display: 'flex', flexDirection: 'column', background: over ? 'var(--terraSoft)' : 'var(--card-2)', border: '1px solid ' + (over ? 'var(--terra)' : 'transparent'), borderRadius: 12, minHeight: 0, transition: 'background .12s' }}>
                <div style={{ padding: '10px 10px 8px 12px', borderTop: `3px solid ${col.color}`, borderRadius: '12px 12px 0 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ flex: 1, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}>{col.name}</b>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--card)', borderRadius: 20, padding: '1px 8px' }}>{cards.length}</span>
                    <button title="Adicionar revendedora nesta etapa" onClick={() => { setAddQ(''); setAddTo(col.id) }} style={{ width: 24, height: 24, border: 'none', borderRadius: 6, background: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={15} /></button>
                  </div>
                  {venda > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{brl(venda)} em vendas</div>}
                  {!hideChecklists && col.checklist && (
                    <div style={{ marginTop: 8, background: 'var(--card)', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                      <b style={{ display: 'block', color: 'var(--ink)', fontSize: 11, marginBottom: 2 }}>Check-list do {col.name.toLowerCase()}:</b>
                      {col.checklist.map(i => <div key={i}>• {i}</div>)}
                    </div>
                  )}
                  {!hideChecklists && col.note && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, background: '#FFF1D6', color: '#7A4A00', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, lineHeight: 1.45 }}>
                      <Info size={13} style={{ flex: 'none', marginTop: 1 }} /><span>{col.note}</span>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 8px', display: 'flex', flexDirection: 'column', gap: 7, minHeight: 80 }}>
                  {cards.map(c => {
                    const v = parseFloat(c.custom_attributes?.venda) || 0
                    return (
                      <div key={c.id} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }} onDragEnd={() => { setDragId(null); setOverCol(null) }}
                        onClick={() => navigate(`/contatos/${c.id}`)}
                        style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 10px', cursor: 'grab', opacity: dragId === c.id ? 0.45 : 1, boxShadow: '0 1px 2px rgba(8,17,31,.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={26} />
                          <b style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactName(c)}</b>
                          <MoveMenu current={col.id} onPick={to => move(c.id, to)} />
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 20, background: 'var(--terraSoft)', color: 'var(--terra)' }}>CONSIGNADO</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 20, background: 'var(--plantaoSoft)', color: 'var(--plantao)' }}>REVENDEDORA ATIVA</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 7, fontSize: 11.5, color: 'var(--muted)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{c.phone || 'Sem telefone'}</span>
                          {v > 0 && <b style={{ color: 'var(--plantao)' }}>{brl(v)}</b>}
                        </div>
                      </div>
                    )
                  })}
                  {cards.length === 0 && <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', margin: '14px 0' }}>Nenhuma revendedora nessa etapa.</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addTo && (
        <Modal title="Adicionar revendedora" subtitle={`Ela vai para a etapa "${COLUMNS.find(c => c.id === addTo)?.name}". Revendedora nova precisa ser sincronizada do Jueri primeiro.`} onClose={() => setAddTo(null)}>
          <input autoFocus value={addQ} onChange={e => setAddQ(e.target.value)} placeholder="Buscar por nome ou telefone…" style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
            {addList.map((c: any) => (
              <button key={c.id} onClick={() => addExisting(c)} className="hoverable" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--line)', background: 'var(--card)', textAlign: 'left' }}>
                <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={28} />
                <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13 }}>{contactName(c)}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.phone || 'Sem telefone'}</span></span>
              </button>
            ))}
            {addList.length === 0 && <p style={{ padding: 18, margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Nenhum resultado. Revendedora não encontrada precisa ser sincronizada do Jueri primeiro.</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

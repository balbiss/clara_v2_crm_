import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, LayoutGrid, MoreHorizontal, Search, Zap } from 'lucide-react'
import api from '../api'
import { Modal } from '../components/ui'
import { toast } from '../components/ui2'
import { ChatAvatar } from '../components/ChatAvatar'
import { useClickOutside, readUser } from '../lib/hooks'
import { K, brlK, kBtn, kInput } from '../lib/kommo'

// Funis no visual do Kommo (Varejo, Onboarding, Atacado, Prospecção…): colunas por etapa com
// "N leads: R$X", cards com contato em cinza e nome do lead em azul, tags e o ponto da tarefa.
// Arrastar pra baixo mostra as zonas VENDA PERDIDA / VENDA GANHA / EXCLUIR, igual ao Kommo.
/* eslint-disable @typescript-eslint/no-explicit-any */

const isOwner = () => readUser()?.role === 'diretoria'

function TaskDot({ at }: { at?: string | null }) {
  if (!at) return <span title="Sem tarefas" style={{ width: 8, height: 8, borderRadius: '50%', background: K.red, opacity: 0.35 }} />
  const late = Math.floor((Date.now() - new Date(at).getTime()) / 86400_000)
  if (late >= 1) return <span title={`Tarefa atrasada há ${late} dia(s)`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: K.red, fontSize: 12 }}>{late}d<span style={{ width: 8, height: 8, borderRadius: '50%', background: K.red }} /></span>
  return <span title="Tem tarefa" style={{ width: 8, height: 8, borderRadius: '50%', background: K.orange }} />
}

function LeadCard({ card, onOpen, onDragStart, onDragEnd, dragging }: { card: any; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; dragging: boolean }) {
  const c = card.contact || {}
  const nome = c.name || c.phone || `Lead #${card.id}`
  return (
    <div draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }} onDragEnd={onDragEnd} onClick={onOpen}
      style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: 3, padding: '9px 10px 8px', cursor: 'pointer', opacity: dragging ? 0.4 : 1, display: 'flex', gap: 9 }}>
      <ChatAvatar nome={nome} foto={c.avatar_url} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, fontSize: 13, color: K.text }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.user?.name || c.phone || ''}</span>
          <span style={{ color: K.muted, flex: 'none' }}>{new Date(card.stage_entered_at || card.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        <div style={{ color: K.link, fontSize: 15, lineHeight: 1.35, margin: '2px 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {(c.tags || []).slice(0, 3).map((t: any) => (
            <span key={t.id} style={{ fontSize: 11, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 2, border: `1px solid ${t.color || K.lineDark}`, color: t.color || K.muted, background: '#fff', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
          ))}
          <span style={{ flex: 1 }} />
          {card.value > 0 && <span style={{ fontSize: 12, color: K.muted, marginRight: 6 }}>{brlK(card.value)}</span>}
          <TaskDot at={card.next_task_at} />
        </div>
      </div>
    </div>
  )
}

export default function Funis() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [pipes, setPipes] = useState<any[]>([])
  const [cards, setCards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [novo, setNovo] = useState<{ stageId?: number } | null>(null)
  const [perda, setPerda] = useState<{ cardId: number } | null>(null)
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenu(false), menu)

  // Consignado é funil de sistema (etapas = status da régua) — a tela dele é /funil
  const funis = pipes.filter(p => !p.system)
  const pipe = funis.find(p => p.slug === slug) || funis[0]
  const stages = (pipe?.pipeline_stages || []).filter((s: any) => s.kind === 'normal')
  const won = pipe?.pipeline_stages.find((s: any) => s.kind === 'won')
  const lost = pipe?.pipeline_stages.find((s: any) => s.kind === 'lost')

  const loadPipes = async () => { const { data } = await api.get('/pipelines'); setPipes(data); return data.filter((p: any) => !p.system) }
  const loadCards = async (p = pipe) => { if (!p) return; const { data } = await api.get(`/pipelines/${p.id}/pipeline_cards`); setCards(data) }
  useEffect(() => { loadPipes().then(d => { if (!slug && d[0]) navigate(`/pipelines/${d[0].slug}`, { replace: true }) }).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (pipe) { setCards([]); loadCards(pipe) } }, [pipe?.id])

  const byStage = useMemo(() => {
    const s = q.trim().toLowerCase()
    const m: Record<number, any[]> = {}
    cards.forEach(c => {
      if (s && !(`${c.contact?.name || ''} ${c.contact?.phone || ''}`.toLowerCase().includes(s))) return
      ;(m[c.pipeline_stage_id] ||= []).push(c)
    })
    return m
  }, [cards, q])
  const ativos = stages.flatMap((s: any) => byStage[s.id] || [])
  const totalAtivo = ativos.reduce((n: number, c: any) => n + (c.value || 0), 0)

  const move = async (cardId: number, stageId: number, extra: any = {}) => {
    const prev = cards
    setCards(cs => cs.map(c => c.id === cardId ? { ...c, pipeline_stage_id: stageId, stage_entered_at: new Date().toISOString() } : c))
    try { const { data } = await api.put(`/pipeline_cards/${cardId}`, { pipeline_stage_id: stageId, ...extra }); setCards(cs => cs.map(c => c.id === cardId ? data : c)); loadPipes() }
    catch (e: any) { setCards(prev); toast('error', e.response?.data?.message || 'Não foi possível mover o lead.') }
  }
  const drop = async (target: string) => {
    const id = dragId; setDragId(null); setOver(null)
    if (!id) return
    if (target === 'lost') return setPerda({ cardId: id })
    if (target === 'won') return won && move(id, won.id)
    if (target === 'delete') {
      if (!window.confirm('Excluir este lead do funil? O contato continua salvo.')) return
      await api.delete(`/pipeline_cards/${id}`); setCards(cs => cs.filter(c => c.id !== id)); loadPipes(); return
    }
    move(id, Number(target))
  }

  if (loading) return <p style={{ fontFamily: K.font, color: K.muted, padding: 20 }}>Carregando funis…</p>
  if (!pipe) return <p style={{ fontFamily: K.font, padding: 20 }}>Nenhum funil ainda. {isOwner() && 'Crie o primeiro em Automatize.'}</p>

  return (
    <div className="k-fullbleed" style={{ fontFamily: K.font, color: K.text, margin: -24, minHeight: 'calc(100vh - 0px)', background: K.boardBg, display: 'flex', flexDirection: 'column' }}>
      {/* barra do topo, igual ao Kommo */}
      <div className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', flex: 'none', flexWrap: 'wrap' }}>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenu(m => !m)} style={{ border: 'none', background: 'none', display: 'flex', alignItems: 'center', gap: 6, fontFamily: K.font, fontSize: 16, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: K.text, cursor: 'pointer' }}>
            {pipe.name}<ChevronDown size={16} color={K.muted} />
          </button>
          {menu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50, background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: '6px 0' }}>
              {funis.map(p => (
                <button key={p.id} onClick={() => { setMenu(false); navigate(`/pipelines/${p.slug}`) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: p.id === pipe.id ? '#f0f4fa' : 'none', padding: '8px 16px', fontFamily: K.font, fontSize: 14, color: K.text, cursor: 'pointer' }}>{p.name}</button>
              ))}
              <div style={{ borderTop: `1px solid ${K.line}`, margin: '6px 0' }} />
              <button onClick={() => navigate('/funil')} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 16px', fontFamily: K.font, fontSize: 14, color: K.text, cursor: 'pointer' }}>Consignado (régua)</button>
            </div>
          )}
        </div>
        <LayoutGrid size={16} color={K.blue} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${K.line}`, paddingLeft: 16, height: '100%' }}>
          <Search size={16} color={K.muted} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar e filtrar" style={{ border: 'none', outline: 'none', flex: 1, fontFamily: K.font, fontSize: 15, color: K.text, background: 'none' }} />
          <span style={{ color: K.muted, fontSize: 15, whiteSpace: 'nowrap' }}>{ativos.length} leads: <b style={{ color: K.text, fontWeight: 400 }}>{brlK(totalAtivo)}</b></span>
        </div>
        <button title="Mais" style={kBtn('flat', { padding: '0 8px' })}><MoreHorizontal size={18} /></button>
        {isOwner() && <button onClick={() => navigate(`/pipelines/${pipe.slug}/automatize`)} style={kBtn('ghost')}><Zap size={15} color="#f5a623" fill="#f5a623" /> Automatize</button>}
        <button onClick={() => setNovo({})} style={kBtn('blue')}>Novo lead</button>
      </div>

      {/* colunas */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', padding: '0 12px', minHeight: 0 }}>
        {stages.map((s: any) => {
          const list = byStage[s.id] || []
          const total = list.reduce((n: number, c: any) => n + (c.value || 0), 0)
          const isOver = over === String(s.id)
          return (
            <div key={s.id} onDragOver={e => { e.preventDefault(); setOver(String(s.id)) }} onDrop={() => drop(String(s.id))}
              style={{ flex: '0 0 304px', display: 'flex', flexDirection: 'column', padding: '0 6px', minHeight: 0, background: isOver ? 'rgba(200,80,106,.06)' : 'none' }}>
              <div style={{ textAlign: 'center', padding: '16px 0 0', flex: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                <div style={{ fontSize: 13, color: K.muted, margin: '3px 0 9px' }}>{list.length} leads: {brlK(total)}</div>
                <div style={{ height: 3, background: s.color || '#99ccff' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0 90px' }}>
                {s.description && (
                  <div style={{ fontSize: 13, color: K.muted, lineHeight: 1.45, padding: '2px 4px 6px', whiteSpace: 'pre-line' }}>
                    {`Check-list de ${s.name.toLowerCase()}:\n` + s.description.split('\n').map((l: string) => '-' + l).join('\n')}
                  </div>
                )}
                {list.map(c => (
                  <LeadCard key={c.id} card={c} dragging={dragId === c.id} onOpen={() => navigate(`/contatos/${c.contact?.id}`)}
                    onDragStart={() => setDragId(c.id)} onDragEnd={() => { setDragId(null); setOver(null) }} />
                ))}
                <button onClick={() => setNovo({ stageId: s.id })} style={{ border: `1px dashed ${K.lineDark}`, background: 'none', color: K.muted, fontFamily: K.font, fontSize: 13, padding: '8px', borderRadius: 3, cursor: 'pointer' }}>+ Adição rápida</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* zonas de arrastar do Kommo */}
      {dragId && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 84, display: 'flex', zIndex: 60 }}>
          {[{ id: 'lost', label: 'Venda perdida', bg: '#f86161' }, { id: 'won', label: 'Venda ganha', bg: '#7dbb2d' }, { id: 'delete', label: 'Excluir', bg: '#9aa4ad' }].map(z => (
            <div key={z.id} onDragOver={e => { e.preventDefault(); setOver(z.id) }} onDragLeave={() => setOver(null)} onDrop={() => drop(z.id)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: z.bg, opacity: over === z.id ? 1 : 0.85, color: '#fff', fontFamily: K.font, fontSize: 15, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,.4)' }}>
              {z.label}
            </div>
          ))}
        </div>
      )}

      {novo && <NovoLead pipe={pipe} stages={stages} stageId={novo.stageId} onClose={() => setNovo(null)} onCreated={c => { setCards(cs => [c, ...cs]); loadPipes() }} />}
      {perda && lost && <MotivoPerda onClose={() => setPerda(null)} onPick={motivo => { move(perda.cardId, lost.id, { loss_reason: motivo }); setPerda(null) }} />}
    </div>
  )
}

function NovoLead({ pipe, stages, stageId, onClose, onCreated }: { pipe: any; stages: any[]; stageId?: number; onClose: () => void; onCreated: (c: any) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [value, setValue] = useState('')
  const [stage, setStage] = useState<number>(stageId || stages[0]?.id)
  const [busca, setBusca] = useState<any[]>([])
  const [existing, setExisting] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<number>(0)
  useEffect(() => {
    window.clearTimeout(timer.current)
    if (existing || name.trim().length < 2) { setBusca([]); return }
    timer.current = window.setTimeout(() => api.get('/contacts', { params: { q: name, per_page: 6 } }).then(r => setBusca(r.data)).catch(() => {}), 300)
  }, [name, existing])
  const salvar = async () => {
    setSaving(true)
    try {
      const { data } = await api.post(`/pipelines/${pipe.id}/pipeline_cards`, existing ? { contact_id: existing.id, pipeline_stage_id: stage, value } : { name, phone, value, pipeline_stage_id: stage })
      onCreated(data); onClose(); toast('success', 'Lead criado.')
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível criar o lead.') } finally { setSaving(false) }
  }
  const lbl = { display: 'block', fontFamily: K.font, fontSize: 13, color: K.muted, margin: '12px 0 4px' }
  return (
    <Modal title="Novo lead" subtitle={`Funil ${pipe.name}`} onClose={onClose}
      footer={<><button onClick={onClose} style={kBtn('ghost')}>Cancelar</button><button disabled={saving || (!existing && !name.trim() && !phone.trim())} onClick={salvar} style={kBtn('blue')}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
      <label style={lbl}>Contato</label>
      {existing ? (
        <div style={{ ...kInput, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{existing.name || existing.phone}<button onClick={() => setExisting(null)} style={{ border: 'none', background: 'none', color: K.link, cursor: 'pointer' }}>trocar</button></div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nome (busca contato existente)" style={kInput} />
          {busca.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#fff', border: `1px solid ${K.line}`, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              {busca.map(c => <button key={c.id} onClick={() => { setExisting(c); setBusca([]) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}>{c.name || '—'} <span style={{ color: K.muted }}>{c.phone}</span></button>)}
            </div>
          )}
        </div>
      )}
      {!existing && (<><label style={lbl}>Telefone</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="55 14 9…" style={kInput} /></>)}
      <label style={lbl}>Venda (R$)</label>
      <input value={value} onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" style={kInput} />
      <label style={lbl}>Etapa</label>
      <select value={stage} onChange={e => setStage(Number(e.target.value))} style={kInput}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    </Modal>
  )
}

function MotivoPerda({ onClose, onPick }: { onClose: () => void; onPick: (m: string) => void }) {
  const [list, setList] = useState<any[]>([])
  useEffect(() => { api.get('/loss_reasons').then(r => setList(r.data)) }, [])
  return (
    <Modal title="Motivo da perda" subtitle="Registre por que a venda foi perdida." onClose={onClose}>
      {list.map(r => (
        <button key={r.id} onClick={() => onPick(r.name)} style={{ display: 'block', width: '100%', textAlign: 'left', border: `1px solid ${K.line}`, background: '#fff', borderRadius: 3, padding: '10px 12px', marginBottom: 6, fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}>{r.name}</button>
      ))}
      <button onClick={() => onPick('')} style={{ ...kBtn('flat'), color: K.muted, textTransform: 'none', fontWeight: 400 }}>Sem motivo</button>
    </Modal>
  )
}

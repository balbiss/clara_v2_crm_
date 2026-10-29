import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, LayoutGrid, MoreHorizontal, Search, SlidersHorizontal, X, Zap } from 'lucide-react'
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

// Filtro do quadro (Bel, 29/10): responsável, data de criação e o valor de campos do cadastro
type CampoFiltro = { key: string; valor?: string; de?: string; ate?: string }
type Filtro = { responsavel: string; criado_de: string; criado_ate: string; campos: CampoFiltro[] }
const FILTRO_VAZIO: Filtro = { responsavel: '', criado_de: '', criado_ate: '', campos: [] }
const temValor = (c: CampoFiltro) => !!(c.key && (c.valor?.trim() || c.de || c.ate))
const ehData = (t?: string) => ['date', 'date_time', 'birthday'].includes(t || '')

function PainelFiltro({ filtro, onChange, onClose }: { filtro: Filtro; onChange: (f: Filtro) => void; onClose: () => void }) {
  const [agentes, setAgentes] = useState<any[]>([])
  const [campos, setCampos] = useState<any[]>([])
  useEffect(() => {
    api.get('/agents').then(r => setAgentes(r.data.filter((a: any) => a.status !== 'blocked'))).catch(() => {})
    api.get('/contact_custom_fields', { params: { all: 1 } }).then(r => setCampos([{ key: 'cidade', label: 'Cidade', type: 'text' },
      ...r.data.filter((c: any) => !c.hidden && !['file', 'checkbox'].includes(c.type))])).catch(() => {})
  }, [])
  const set = (p: Partial<Filtro>) => onChange({ ...filtro, ...p })
  const setCampo = (i: number, p: Partial<CampoFiltro>) => set({ campos: filtro.campos.map((c, j) => j === i ? { ...c, ...p } : c) })
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: K.muted, margin: '0 0 5px' }
  const inp: React.CSSProperties = { ...kInput, width: '100%', boxSizing: 'border-box' }
  return (
    <div style={{ position: 'absolute', top: 'calc(100% + 1px)', left: 0, zIndex: 50, width: 'min(420px, calc(100vw - 32px))', maxHeight: '75vh', overflowY: 'auto', background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 16, fontFamily: K.font, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={lbl}>Responsável</span>
        <select value={filtro.responsavel} onChange={e => set({ responsavel: e.target.value })} style={inp}>
          <option value="">Todos</option>
          <option value="nenhum">Sem responsável</option>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()}</option>)}
        </select>
      </div>
      <div>
        <span style={lbl}>Data de criação do lead</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={filtro.criado_de} onChange={e => set({ criado_de: e.target.value })} style={inp} />
          <span style={{ color: K.muted, fontSize: 13 }}>até</span>
          <input type="date" value={filtro.criado_ate} onChange={e => set({ criado_ate: e.target.value })} style={inp} />
        </div>
      </div>
      <div>
        <span style={lbl}>Campos do cadastro</span>
        {filtro.campos.map((c, i) => {
          const def = campos.find(x => x.key === c.key)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderTop: i ? `1px solid ${K.line}` : 'none' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={c.key} onChange={e => setCampo(i, { key: e.target.value, valor: '', de: '', ate: '' })} style={inp}>
                  <option value="">Escolha o campo…</option>
                  {campos.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <button onClick={() => set({ campos: filtro.campos.filter((_, j) => j !== i) })} title="Tirar" style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
              </div>
              {c.key && (ehData(def?.type) ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="date" value={c.de || ''} onChange={e => setCampo(i, { de: e.target.value })} style={inp} />
                  <span style={{ color: K.muted, fontSize: 13 }}>até</span>
                  <input type="date" value={c.ate || ''} onChange={e => setCampo(i, { ate: e.target.value })} style={inp} />
                </div>
              ) : def?.options?.length ? (
                <select value={c.valor || ''} onChange={e => setCampo(i, { valor: e.target.value })} style={inp}>
                  <option value="">Qualquer</option>
                  {def.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={c.valor || ''} onChange={e => setCampo(i, { valor: e.target.value })} placeholder="Contém…" style={inp} />
              ))}
            </div>
          )
        })}
        <button onClick={() => set({ campos: [...filtro.campos, { key: '' }] })} style={{ border: 'none', background: 'none', color: K.link, fontFamily: K.font, fontSize: 14, cursor: 'pointer', padding: '4px 0' }}>+ Filtrar por um campo</button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => onChange(FILTRO_VAZIO)} style={kBtn('ghost')}>Limpar</button>
        <button onClick={onClose} style={kBtn('blue')}>Pronto</button>
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
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VAZIO)
  const [abrirFiltro, setAbrirFiltro] = useState(false)
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenu(false), menu)
  const filtroRef = useClickOutside<HTMLDivElement>(() => setAbrirFiltro(false), abrirFiltro)

  // Consignado é funil de sistema (etapas = status da régua) — a tela dele é /funil
  const funis = pipes.filter(p => !p.system)
  const pipe = funis.find(p => p.slug === slug) || funis[0]
  const stages = (pipe?.pipeline_stages || []).filter((s: any) => s.kind === 'normal')
  const won = pipe?.pipeline_stages.find((s: any) => s.kind === 'won')
  const lost = pipe?.pipeline_stages.find((s: any) => s.kind === 'lost')

  const loadPipes = async () => { const { data } = await api.get('/pipelines'); setPipes(data); return data.filter((p: any) => !p.system) }
  // busca e filtro rodam no servidor (o texto procura também dentro das conversas e dos campos do cadastro)
  const params = () => ({ q: q.trim() || undefined, responsavel: filtro.responsavel || undefined, criado_de: filtro.criado_de || undefined, criado_ate: filtro.criado_ate || undefined,
    campos: filtro.campos.some(temValor) ? JSON.stringify(filtro.campos.filter(temValor)) : undefined })
  const pedido = useRef(0)
  const loadCards = async (p = pipe) => {
    if (!p) return
    const n = ++pedido.current
    const { data } = await api.get(`/pipelines/${p.id}/pipeline_cards`, { params: params() })
    if (n === pedido.current) setCards(data) // ignora resposta atrasada de uma busca anterior
  }
  useEffect(() => { loadPipes().then(d => { if (!slug && d[0]) navigate(`/pipelines/${d[0].slug}`, { replace: true }) }).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (pipe) { setCards([]); loadCards(pipe) } }, [pipe?.id])
  const primeiraBusca = useRef(true)
  useEffect(() => {
    if (primeiraBusca.current) { primeiraBusca.current = false; return }
    const t = window.setTimeout(() => loadCards(), 400)
    return () => clearTimeout(t)
  }, [q, filtro])

  const byStage = useMemo(() => {
    const m: Record<number, any[]> = {}
    cards.forEach(c => { (m[c.pipeline_stage_id] ||= []).push(c) })
    return m
  }, [cards])
  const nFiltros = (filtro.responsavel ? 1 : 0) + (filtro.criado_de || filtro.criado_ate ? 1 : 0) + filtro.campos.filter(temValor).length
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

  // arrastar o fundo do quadro (fora dos cards e botões) rola pros lados, como no Kommo
  const boardRef = useRef<HTMLDivElement>(null)
  const arrastarQuadro = (e: React.MouseEvent) => {
    const el = boardRef.current
    if (!el || e.button !== 0 || (e.target as HTMLElement).closest('[draggable="true"], button, input, a, select, textarea')) return
    const x0 = e.clientX, s0 = el.scrollLeft
    const mover = (ev: MouseEvent) => { el.scrollLeft = s0 - (ev.clientX - x0) }
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); el.style.cursor = 'grab' }
    el.style.cursor = 'grabbing'
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar)
  }

  if (loading) return <p style={{ fontFamily: K.font, color: K.muted, padding: 20 }}>Carregando funis…</p>
  if (!pipe) return <p style={{ fontFamily: K.font, padding: 20 }}>Nenhum funil ainda. {isOwner() && 'Crie o primeiro em Automatize.'}</p>

  return (
    <div className="k-fullbleed" style={{ fontFamily: K.font, color: K.text, margin: -24, height: 'calc(100vh - var(--top-h, 0px))', overflow: 'hidden', background: K.boardBg, display: 'flex', flexDirection: 'column' }}>
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
        <div ref={filtroRef} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${K.line}`, paddingLeft: 16, height: '100%', position: 'relative' }}>
          <button onClick={() => setAbrirFiltro(a => !a)} title="Filtro" style={{ border: 'none', background: nFiltros ? '#fcf0f3' : 'none', borderRadius: 3, padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4, color: nFiltros ? K.text : K.muted, fontFamily: K.font, fontSize: 13, cursor: 'pointer' }}>
            <SlidersHorizontal size={16} />{nFiltros > 0 && <b>{nFiltros}</b>}
          </button>
          <Search size={16} color={K.muted} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar: nome, telefone, campo ou trecho da conversa" style={{ border: 'none', outline: 'none', flex: 1, minWidth: 120, fontFamily: K.font, fontSize: 15, color: K.text, background: 'none' }} />
          {(nFiltros > 0 || q) && <button onClick={() => { setQ(''); setFiltro(FILTRO_VAZIO) }} style={{ border: 'none', background: 'none', color: K.link, fontFamily: K.font, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Limpar filtro</button>}
          <span style={{ color: K.muted, fontSize: 15, whiteSpace: 'nowrap' }}>{ativos.length} leads: <b style={{ color: K.text, fontWeight: 400 }}>{brlK(totalAtivo)}</b></span>
          {abrirFiltro && <PainelFiltro filtro={filtro} onChange={setFiltro} onClose={() => setAbrirFiltro(false)} />}
        </div>
        <button title="Mais" style={kBtn('flat', { padding: '0 8px' })}><MoreHorizontal size={18} /></button>
        {isOwner() && <button onClick={() => navigate(`/pipelines/${pipe.slug}/automatize`)} style={kBtn('ghost')}><Zap size={15} color="#f5a623" fill="#f5a623" /> Automatize</button>}
        <button onClick={() => setNovo({})} style={kBtn('blue')}>Novo lead</button>
      </div>

      {/* colunas: o quadro tem a altura da tela (cada coluna rola por dentro), então a barra de rolagem
          lateral fica sempre visível embaixo; dá também pra arrastar o fundo pra andar pros lados (Bel, 28/10) */}
      <div ref={boardRef} className="k-board" onMouseDown={arrastarQuadro} style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', overflowY: 'hidden', padding: '0 12px', minHeight: 0, cursor: 'grab' }}>
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

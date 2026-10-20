import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Columns3, List, MoreHorizontal, Settings, Trash2 } from 'lucide-react'
import api from '../api'
import { Modal } from '../components/ui'
import { toast, confirmBox } from '../components/ui2'
import { useClickOutside, readUser } from '../lib/hooks'
import { K, kBtn, kInput, TIPOS_TAREFA } from '../lib/kommo'

// Calendário no visual do Kommo: os 3 ícones do topo trocam entre quadro de tarefas (colunas
// Atrasadas/Hoje/Amanhã…), lista de tarefas e calendário (dia/semana/mês). No calendário entram
// os agendamentos (eventos) e as tarefas pendentes, cada uma no horário do prazo.
/* eslint-disable @typescript-eslint/no-explicit-any */

type View = 'board' | 'list' | 'calendar'
type Span = 'day' | 'week' | 'month'
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const AG_TIPOS: Record<string, string> = { reuniao: 'Reunião', entrega_maleta: 'Entrega de maleta', acerto: 'Acerto', outro: 'Outro' }
const HOUR_PX = 48
const fullPortfolio = () => ['gerente', 'diretoria'].includes(readUser()?.role)

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)) // semana começa na segunda, como no Kommo
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const localInput = (d: Date) => `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function loadPrefs() { try { return { startHour: 8, weekend: true, ...JSON.parse(localStorage.getItem('cal_prefs') || '{}') } } catch { return { startHour: 8, weekend: true } } }

export default function Calendario({ initialView = 'calendar' as View }) {
  const navigate = useNavigate()
  const [view, setView] = useState<View>(initialView)
  const [span, setSpan] = useState<Span>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [mine, setMine] = useState(true)
  const [userId, setUserId] = useState<string>('')
  const [q, setQ] = useState('')
  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [spanMenu, setSpanMenu] = useState(false)
  const [more, setMore] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [evEdit, setEvEdit] = useState<any>(null)
  const [taskOpen, setTaskOpen] = useState<any>(null)
  const spanRef = useClickOutside<HTMLDivElement>(() => setSpanMenu(false), spanMenu)
  const moreRef = useClickOutside<HTMLDivElement>(() => setMore(false), more)
  const gridRef = useRef<HTMLDivElement>(null)
  const me = readUser()

  const range = useMemo(() => {
    if (span === 'day') return [startOfDay(cursor), startOfDay(cursor)]
    if (span === 'week') { const a = startOfWeek(cursor); return [a, addDays(a, 6)] }
    const a = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeek(a)
    return [gridStart, addDays(gridStart, 41)]
  }, [cursor, span])

  const load = async () => {
    const who = mine ? me.id : userId || undefined
    try {
      const [ev, tk] = await Promise.all([
        api.get('/agendamentos', { params: { de: ymd(range[0]), ate: ymd(range[1]), user_id: who } }),
        api.get('/tarefas', { params: { status: 'pendente', user_id: who } }),
      ])
      setEvents(ev.data); setTasks(tk.data)
    } catch { toast('error', 'Não foi possível carregar o calendário.') }
  }
  useEffect(() => { load() }, [range[0].getTime(), range[1].getTime(), mine, userId])
  useEffect(() => { if (fullPortfolio()) api.get('/agents').then(r => setAgents(r.data)).catch(() => {}) }, [])
  useEffect(() => { if (view === 'calendar' && span !== 'month' && gridRef.current) gridRef.current.scrollTop = prefs.startHour * HOUR_PX }, [view, span])

  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase())
  const evs = events.filter(e => match(`${e.titulo} ${e.contact?.name || ''}`))
  const tks = tasks.filter(t => t.vencimento_em && match(`${t.titulo} ${t.contact?.name || ''}`))

  const step = (dir: number) => setCursor(c => span === 'day' ? addDays(c, dir) : span === 'week' ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1))
  const label = span === 'day'
    ? `${cursor.getDate()} ${MESES[cursor.getMonth()]}. ${cursor.getFullYear()}`
    : span === 'week'
      ? `${range[0].getDate()} – ${range[1].getDate()} ${MESES[range[1].getMonth()]}. ${range[1].getFullYear()}`
      : `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`
  const days = span === 'day' ? [range[0]] : Array.from({ length: 7 }, (_, i) => addDays(range[0], i)).filter(d => prefs.weekend || (d.getDay() !== 0 && d.getDay() !== 6))

  const iconBtn = (on: boolean) => ({ border: 'none', background: 'none', padding: 6, cursor: 'pointer', display: 'flex', color: on ? K.blue : '#b6bcc2' })
  const newAt = (d: Date) => setEvEdit({ titulo: '', tipo: 'outro', inicio: localInput(d), fim: localInput(new Date(d.getTime() + 3600_000)), descricao: '', contact_id: null, user_id: me.id })

  return (
    <div className="k-fullbleed" style={{ fontFamily: K.font, color: K.text, margin: -24, height: 'calc(100vh - var(--top-h, 0px))', minHeight: 560, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* barra do topo */}
      <div className="k-topbar" style={{ minHeight: 64, borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 0 20px', flex: 'none', flexWrap: 'wrap' }}>
        <button title="Quadro de tarefas" onClick={() => setView('board')} style={iconBtn(view === 'board')}><Columns3 size={20} /></button>
        <button title="Lista de tarefas" onClick={() => setView('list')} style={iconBtn(view === 'list')}><List size={20} /></button>
        <button title="Calendário" onClick={() => setView('calendar')} style={iconBtn(view === 'calendar')}><CalendarDays size={20} /></button>
        {view === 'calendar' && (<>
          <button title="Anterior" onClick={() => step(-1)} style={{ ...iconBtn(true), color: K.text, marginLeft: 16 }}><ChevronLeft size={20} /></button>
          <button onClick={() => setCursor(new Date())} title="Ir para hoje" style={{ border: 'none', background: 'none', fontFamily: K.font, fontSize: 16, color: K.text, cursor: 'pointer', minWidth: 150 }}>{label}</button>
          <button title="Próximo" onClick={() => step(1)} style={{ ...iconBtn(true), color: K.text }}><ChevronRight size={20} /></button>
          <div ref={spanRef} style={{ position: 'relative', marginLeft: 12 }}>
            <button onClick={() => setSpanMenu(m => !m)} style={{ border: 'none', background: 'none', fontFamily: K.font, fontSize: 16, color: K.text, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>{{ day: 'Dia', week: 'Semana', month: 'Mês' }[span]}<ChevronDown size={16} color={K.muted} /></button>
            {spanMenu && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 40, background: '#fff', border: `1px solid ${K.line}`, boxShadow: '0 4px 16px rgba(0,0,0,.14)', padding: '6px 0', minWidth: 140 }}>
                {(['day', 'week', 'month'] as Span[]).map(s => <button key={s} onClick={() => { setSpan(s); setSpanMenu(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: span === s ? '#fcf0f3' : 'none', padding: '8px 16px', fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}>{{ day: 'Dia', week: 'Semana', month: 'Mês' }[s]}</button>)}
              </div>
            )}
          </div>
        </>)}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${K.line}`, height: '100%', paddingLeft: 16, marginLeft: 16 }}>
          <button onClick={() => { setMine(m => !m); setUserId('') }} title={mine ? 'Mostrando só os seus — clique pra ver de todos' : 'Mostrar só os meus'}
            style={{ fontFamily: K.font, fontSize: 14, padding: '3px 8px', border: `1px solid ${mine ? '#b9d98a' : K.lineDark}`, background: mine ? '#e6f2d2' : '#fff', color: mine ? '#4f6b25' : K.muted, borderRadius: 2, cursor: 'pointer' }}>{mine ? 'Meus eventos' : 'Todos os eventos'}</button>
          {!mine && fullPortfolio() && (
            <select value={userId} onChange={e => setUserId(e.target.value)} style={{ ...kInput, width: 180, height: 30 }}>
              <option value="">Todos os usuários</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()}</option>)}
            </select>
          )}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtro" style={{ flex: 1, border: 'none', outline: 'none', fontFamily: K.font, fontSize: 15, color: K.text, background: 'none' }} />
        </div>
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button title="Mais" onClick={() => setMore(m => !m)} style={{ ...iconBtn(true), color: K.text }}><MoreHorizontal size={18} /></button>
          {more && (
            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 40, background: '#fff', border: `1px solid ${K.line}`, boxShadow: '0 4px 16px rgba(0,0,0,.14)', padding: '6px 0', minWidth: 200 }}>
              <button onClick={() => { setMore(false); load(); toast('success', 'Atualizado.') }} style={menuItem}>Atualizar</button>
              <button onClick={() => { setMore(false); setCursor(new Date()) }} style={menuItem}>Ir para hoje</button>
              <button onClick={() => { setMore(false); setPrefs((p: any) => { const n = { ...p, weekend: !p.weekend }; localStorage.setItem('cal_prefs', JSON.stringify(n)); return n }) }} style={menuItem}>{prefs.weekend ? 'Esconder fim de semana' : 'Mostrar fim de semana'}</button>
            </div>
          )}
        </div>
        <button onClick={() => setPrefsOpen(true)} title="Configurações de agendamento" style={kBtn('ghost', { marginLeft: 6 })}><Settings size={14} /><span className="k-hide-narrow">Configurações de agendamento</span></button>
        <button onClick={() => newAt(new Date(Math.ceil(Date.now() / 3600_000) * 3600_000))} style={kBtn('blue', { marginLeft: 8 })}>Novo evento</button>
      </div>

      {view === 'calendar' && span !== 'month' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${K.line}`, flex: 'none' }}>
            <div style={{ width: 90, flex: 'none', textAlign: 'right', padding: '10px 10px', fontSize: 13, color: K.muted }}>GMT-3</div>
            {days.map(d => <div key={d.toISOString()} style={{ flex: 1, textAlign: 'center', padding: '10px 0', fontSize: 15, color: sameDay(d, new Date()) ? K.blue : K.muted, borderLeft: `1px solid ${K.line}` }}>{DOW[d.getDay()]} {d.getDate()}</div>)}
          </div>
          <div style={{ display: 'flex', borderBottom: `1px solid ${K.line}`, flex: 'none', minHeight: 72 }}>
            <div style={{ width: 90, flex: 'none', textAlign: 'right', padding: '10px', fontSize: 13, color: K.muted }}>Dia todo</div>
            {days.map(d => (
              <div key={d.toISOString()} style={{ flex: 1, borderLeft: `1px solid ${K.line}`, background: sameDay(d, new Date()) ? '#fdf3f5' : undefined, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {evs.filter(e => !e.fim_em && sameDay(new Date(e.inicio_em), d) && new Date(e.inicio_em).getHours() === 0 && new Date(e.inicio_em).getMinutes() === 0).map(e => <EventChip key={'e' + e.id} ev={e} onClick={() => setEvEdit(fromEvent(e))} />)}
              </div>
            ))}
          </div>
          <div ref={gridRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', position: 'relative', height: 24 * HOUR_PX }}>
              <div style={{ width: 90, flex: 'none' }}>
                {Array.from({ length: 24 }, (_, h) => <div key={h} style={{ height: HOUR_PX, textAlign: 'right', padding: '0 10px', fontSize: 13, color: K.muted, transform: 'translateY(-8px)' }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</div>)}
              </div>
              {days.map(d => (
                <div key={d.toISOString()} onClick={e => { const y = e.clientY - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top; const min = Math.floor(y / (HOUR_PX / 2)) * 30; const t = new Date(d); t.setMinutes(min); newAt(t) }}
                  style={{ flex: 1, position: 'relative', borderLeft: `1px solid ${K.line}`, background: sameDay(d, new Date()) ? '#fdf3f5' : undefined, cursor: 'pointer' }}>
                  {Array.from({ length: 48 }, (_, i) => <div key={i} style={{ height: HOUR_PX / 2, borderTop: `1px solid ${i % 2 ? '#f3f4f6' : K.line}` }} />)}
                  {evs.filter(e => sameDay(new Date(e.inicio_em), d) && !(!e.fim_em && new Date(e.inicio_em).getHours() === 0 && new Date(e.inicio_em).getMinutes() === 0)).map(e => {
                    const a = new Date(e.inicio_em), b = e.fim_em ? new Date(e.fim_em) : new Date(a.getTime() + 3600_000)
                    const top = (a.getHours() + a.getMinutes() / 60) * HOUR_PX, h = Math.max(22, ((b.getTime() - a.getTime()) / 3600_000) * HOUR_PX)
                    return <div key={'e' + e.id} onClick={ev => { ev.stopPropagation(); setEvEdit(fromEvent(e)) }} title={e.titulo}
                      style={{ position: 'absolute', left: 3, right: 3, top, height: h, background: '#dbe9fc', borderLeft: `3px solid ${K.blue}`, borderRadius: 2, padding: '2px 6px', fontSize: 13, overflow: 'hidden', cursor: 'pointer' }}>
                      <b>{hhmm(a)}</b> {e.titulo}{e.contact && <span style={{ color: K.muted }}> · {e.contact.name}</span>}
                    </div>
                  })}
                  {tks.filter(t => sameDay(new Date(t.vencimento_em), d)).map(t => {
                    const a = new Date(t.vencimento_em)
                    const late = a < new Date()
                    return <div key={'t' + t.id} onClick={ev => { ev.stopPropagation(); setTaskOpen(t) }} title={t.titulo}
                      style={{ position: 'absolute', left: 3, right: 3, top: (a.getHours() + a.getMinutes() / 60) * HOUR_PX, height: 22, background: late ? '#fde8ec' : '#fff6e0', borderLeft: `3px solid ${late ? '#e2557a' : K.orange}`, borderRadius: 2, padding: '1px 6px', fontSize: 12.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                      ☐ {hhmm(a)} {t.titulo}
                    </div>
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'calendar' && span === 'month' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'auto repeat(6, 1fr)', minHeight: 0 }}>
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => <div key={d} style={{ textAlign: 'center', padding: 8, fontSize: 14, color: K.muted, borderBottom: `1px solid ${K.line}` }}>{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => addDays(range[0], i)).map(d => {
            const dayEvs = evs.filter(e => sameDay(new Date(e.inicio_em), d)), dayTks = tks.filter(t => sameDay(new Date(t.vencimento_em), d))
            return (
              <div key={d.toISOString()} onClick={() => { const t = new Date(d); t.setHours(9); newAt(t) }} style={{ borderRight: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, padding: 4, overflow: 'hidden', background: sameDay(d, new Date()) ? '#fdf3f5' : undefined, opacity: d.getMonth() === cursor.getMonth() ? 1 : 0.45, cursor: 'pointer', minHeight: 0 }}>
                <div style={{ fontSize: 13, color: sameDay(d, new Date()) ? K.blue : K.muted, textAlign: 'right' }}>{d.getDate()}</div>
                {dayEvs.slice(0, 3).map(e => <EventChip key={'e' + e.id} ev={e} onClick={() => setEvEdit(fromEvent(e))} />)}
                {dayTks.slice(0, 2).map(t => <div key={'t' + t.id} onClick={ev => { ev.stopPropagation(); setTaskOpen(t) }} style={{ fontSize: 12, padding: '1px 4px', marginTop: 2, background: '#fff6e0', borderLeft: `3px solid ${K.orange}`, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>☐ {t.titulo}</div>)}
                {dayEvs.length + dayTks.length > 5 && <div style={{ fontSize: 12, color: K.muted }}>+{dayEvs.length + dayTks.length - 5}</div>}
              </div>
            )
          })}
        </div>
      )}

      {view === 'board' && <TaskBoard tasks={tks} onOpen={setTaskOpen} />}
      {view === 'list' && <TaskList tasks={tks} onOpen={setTaskOpen} onLead={id => navigate(`/contatos/${id}`)} />}

      {evEdit && <EventForm ev={evEdit} agents={agents} onClose={() => setEvEdit(null)} onSaved={() => { setEvEdit(null); load() }} />}
      {taskOpen && <TaskModal task={taskOpen} onClose={() => setTaskOpen(null)} onDone={() => { setTaskOpen(null); load() }} onLead={id => navigate(`/contatos/${id}`)} />}
      {prefsOpen && (
        <Modal title="Configurações de agendamento" onClose={() => setPrefsOpen(false)} footer={<button onClick={() => { localStorage.setItem('cal_prefs', JSON.stringify(prefs)); setPrefsOpen(false); if (gridRef.current) gridRef.current.scrollTop = prefs.startHour * HOUR_PX }} style={kBtn('blue')}>Salvar</button>}>
          <label style={lbl}>Início do expediente (o calendário abre nesse horário)</label>
          <select value={prefs.startHour} onChange={e => setPrefs((p: any) => ({ ...p, startHour: Number(e.target.value) }))} style={kInput}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={prefs.weekend} onChange={e => setPrefs((p: any) => ({ ...p, weekend: e.target.checked }))} /> Mostrar sábado e domingo</label>
        </Modal>
      )}
    </div>
  )
}

const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 16px', fontFamily: K.font, fontSize: 14, color: K.text, cursor: 'pointer' }
const lbl: React.CSSProperties = { display: 'block', fontFamily: K.font, fontSize: 13, color: K.muted, margin: '14px 0 5px' }
const fromEvent = (e: any) => ({ id: e.id, titulo: e.titulo, tipo: e.tipo, inicio: localInput(new Date(e.inicio_em)), fim: e.fim_em ? localInput(new Date(e.fim_em)) : '', descricao: e.descricao || '', contact_id: e.contact_id, contact: e.contact, user_id: e.user_id })

function EventChip({ ev, onClick }: { ev: any; onClick: () => void }) {
  return <div onClick={e => { e.stopPropagation(); onClick() }} style={{ fontSize: 12, padding: '1px 4px', marginTop: 2, background: '#dbe9fc', borderLeft: `3px solid ${K.blue}`, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer' }}>{hhmm(new Date(ev.inicio_em))} {ev.titulo}</div>
}

function EventForm({ ev, agents, onClose, onSaved }: { ev: any; agents: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(ev)
  const [busca, setBusca] = useState('')
  const [opts, setOpts] = useState<any[]>([])
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  useEffect(() => {
    if (busca.trim().length < 2) { setOpts([]); return }
    const t = setTimeout(() => api.get('/contacts', { params: { q: busca, per_page: 6 } }).then(r => setOpts(r.data)).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [busca])
  const save = async () => {
    const body = { agendamento: { titulo: f.titulo, tipo: f.tipo, descricao: f.descricao, inicio_em: new Date(f.inicio).toISOString(), fim_em: f.fim ? new Date(f.fim).toISOString() : null, contact_id: f.contact_id || null, user_id: f.user_id } }
    try { if (f.id) await api.put(`/agendamentos/${f.id}`, body); else await api.post('/agendamentos', body); toast('success', 'Evento salvo.'); onSaved() }
    catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível salvar.') }
  }
  const del = async () => { if (await confirmBox('Excluir evento?', f.titulo)) { await api.delete(`/agendamentos/${f.id}`); onSaved() } }
  return (
    <Modal title={f.id ? 'Evento' : 'Novo evento'} onClose={onClose}
      footer={<>{f.id && <button onClick={del} style={kBtn('flat', { color: '#e53935', marginRight: 'auto' })}><Trash2 size={14} /> Excluir</button>}<button onClick={onClose} style={kBtn('ghost')}>Cancelar</button><button onClick={save} disabled={!f.titulo.trim()} style={kBtn('blue')}>Salvar</button></>}>
      <label style={{ ...lbl, marginTop: 0 }}>Título</label>
      <input autoFocus value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Acerto da maleta" style={kInput} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><label style={lbl}>Início</label><input type="datetime-local" value={f.inicio} onChange={e => set('inicio', e.target.value)} style={kInput} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>Fim</label><input type="datetime-local" value={f.fim} onChange={e => set('fim', e.target.value)} style={kInput} /></div>
      </div>
      <label style={lbl}>Tipo</label>
      <select value={f.tipo} onChange={e => set('tipo', e.target.value)} style={kInput}>{Object.entries(AG_TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <label style={lbl}>Lead / contato</label>
      {f.contact_id ? (
        <div style={{ ...kInput, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{f.contact?.name || `#${f.contact_id}`}<button onClick={() => { set('contact_id', null); set('contact', null) }} style={{ border: 'none', background: 'none', color: K.link, cursor: 'pointer' }}>trocar</button></div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" style={kInput} />
          {opts.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#fff', border: `1px solid ${K.line}`, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
            {opts.map(c => <button key={c.id} onClick={() => { set('contact_id', c.id); set('contact', c); setBusca(''); setOpts([]) }} style={menuItem}>{c.name || '—'} <span style={{ color: K.muted }}>{c.phone}</span></button>)}
          </div>}
        </div>
      )}
      {fullPortfolio() && agents.length > 0 && (<>
        <label style={lbl}>Responsável</label>
        <select value={f.user_id || ''} onChange={e => set('user_id', Number(e.target.value))} style={kInput}>{agents.map(a => <option key={a.id} value={a.id}>{a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()}</option>)}</select>
      </>)}
      <label style={lbl}>Descrição</label>
      <textarea value={f.descricao} onChange={e => set('descricao', e.target.value)} rows={3} style={{ ...kInput, height: 'auto', padding: 10 }} />
    </Modal>
  )
}

function TaskModal({ task, onClose, onDone, onLead }: { task: any; onClose: () => void; onDone: () => void; onLead: (id: number) => void }) {
  const [res, setRes] = useState('')
  const done = async () => {
    try { await api.patch(`/tarefas/${task.id}/complete`, { resultado: res || null }); toast('success', 'Tarefa concluída.'); onDone() }
    catch { toast('error', 'Não foi possível concluir.') }
  }
  return (
    <Modal title={TIPOS_TAREFA[task.tipo] || 'Tarefa'} subtitle={new Date(task.vencimento_em).toLocaleString('pt-BR')} onClose={onClose}
      footer={<><button onClick={onClose} style={kBtn('ghost')}>Fechar</button><button onClick={done} style={kBtn('blue')}>Tarefa concluída</button></>}>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}><b>{task.titulo}</b></p>
      {task.descricao && <p style={{ whiteSpace: 'pre-line', fontSize: 14, margin: '0 0 10px' }}>{task.descricao}</p>}
      {task.contact && <button onClick={() => onLead(task.contact.id)} style={{ border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}>{task.contact.name}</button>}
      <input value={res} onChange={e => setRes(e.target.value)} placeholder="Adicionar resultado" style={{ ...kInput, marginTop: 12 }} />
    </Modal>
  )
}

/** Quadro de tarefas do Kommo: colunas por prazo. */
function TaskBoard({ tasks, onOpen }: { tasks: any[]; onOpen: (t: any) => void }) {
  const hoje = startOfDay(new Date()), amanha = addDays(hoje, 1), depois = addDays(hoje, 2), semana = addDays(startOfWeek(hoje), 7)
  const cols = [
    { id: 'late', name: 'Tarefas atrasadas', color: '#ff8f92', test: (d: Date) => d < new Date() },
    { id: 'today', name: 'Tarefas para hoje', color: '#99ccff', test: (d: Date) => d >= new Date() && d < amanha },
    { id: 'tomorrow', name: 'Tarefas para amanhã', color: '#ffcc66', test: (d: Date) => d >= amanha && d < depois },
    { id: 'week', name: 'Esta semana', color: '#ccff66', test: (d: Date) => d >= depois && d < semana },
    { id: 'later', name: 'Depois', color: '#d5d8db', test: (d: Date) => d >= semana },
  ]
  return (
    <div style={{ flex: 1, display: 'flex', overflowX: 'auto', minHeight: 0, padding: '0 12px' }}>
      {cols.map(c => {
        const list = tasks.filter(t => c.test(new Date(t.vencimento_em)))
        return (
          <div key={c.id} style={{ flex: '0 0 290px', display: 'flex', flexDirection: 'column', padding: '0 6px', minHeight: 0 }}>
            <div style={{ textAlign: 'center', padding: '16px 0 0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{c.name}</div>
              <div style={{ fontSize: 13, color: K.muted, margin: '3px 0 9px' }}>{list.length} tarefas</div>
              <div style={{ height: 3, background: c.color }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              {list.map(t => (
                <div key={t.id} onClick={() => onOpen(t)} style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, padding: '9px 10px', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13, color: c.id === 'late' ? '#e2557a' : K.muted }}>{new Date(t.vencimento_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {TIPOS_TAREFA[t.tipo] || t.tipo}</div>
                  <div style={{ color: K.link, fontSize: 15, margin: '2px 0' }}>{t.contact?.name || '—'}</div>
                  <div style={{ fontSize: 14 }}>{t.titulo}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Lista de tarefas do Kommo. */
function TaskList({ tasks, onOpen, onLead }: { tasks: any[]; onOpen: (t: any) => void; onLead: (id: number) => void }) {
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: K.muted, borderBottom: `1px solid ${K.line}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 14, borderBottom: `1px solid ${K.line}` }
  const sorted = [...tasks].sort((a, b) => new Date(a.vencimento_em).getTime() - new Date(b.vencimento_em).getTime())
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: K.font }}>
        <thead><tr><th style={th}>Prazo</th><th style={th}>Responsável</th><th style={th}>Lead</th><th style={th}>Tipo</th><th style={th}>Tarefa</th><th style={th} /></tr></thead>
        <tbody>
          {sorted.map(t => {
            const late = new Date(t.vencimento_em) < new Date()
            return (
              <tr key={t.id}>
                <td style={{ ...td, color: late ? '#e2557a' : K.text, whiteSpace: 'nowrap' }}>{new Date(t.vencimento_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={td}>{t.user ? `${t.user.first_name || ''} ${t.user.last_name || ''}`.trim() : '—'}</td>
                <td style={td}>{t.contact ? <button onClick={() => onLead(t.contact.id)} style={{ border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}>{t.contact.name}</button> : '—'}</td>
                <td style={td}>{TIPOS_TAREFA[t.tipo] || t.tipo}</td>
                <td style={td}>{t.titulo}</td>
                <td style={td}><button onClick={() => onOpen(t)} style={{ ...kBtn('ghost'), height: 28, fontSize: 12 }}>Abrir</button></td>
              </tr>
            )
          })}
          {!sorted.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: K.muted, padding: 40 }}>Nenhuma tarefa pendente.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

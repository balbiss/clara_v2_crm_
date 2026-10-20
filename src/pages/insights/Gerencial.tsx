import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, Settings, X } from 'lucide-react'
import api from '../../api'
import { K } from '../../lib/kommo'
import { PeriodBar, useAgents, useSavedPeriod, qs, dur, brl } from '../../lib/insightsUi'

// Insights › Gerencial = "Painel" do Kommo: fundo azul, nome da conta no meio, filtro de período e
// usuário, e os blocos MENSAGENS RECEBIDAS, CONVERSAS EM ANDAMENTO / NÃO RESPONDIDAS, TEMPO DE
// RESPOSTA, MAIS TEMPO ESPERANDO, FONTES DE LEAD, LEADS GANHOS / ATIVOS / PERDIDOS / SEM TAREFAS e
// TAREFAS. "Configurações" escolhe quais blocos aparecem; "Atividades" abre o registro de atividades.
/* eslint-disable @typescript-eslint/no-explicit-any */

const WIDGETS: [string, string][] = [
  ['mensagens', 'Mensagens recebidas'], ['andamento', 'Conversas em andamento'], ['nao_respondidas', 'Conversas não respondidas'],
  ['tempo_resposta', 'Tempo de resposta'], ['esperando', 'Mais tempo esperando'], ['fontes', 'Fontes de lead'],
  ['ganhos', 'Leads ganhos'], ['ativos', 'Leads ativos'], ['perdidos', 'Leads perdidos'], ['sem_tarefa', 'Leads sem tarefas'], ['tarefas', 'Tarefas'],
]
const RING = ['#c8506a', '#7dbb2d', '#f0a33a', '#f37575', '#9b6bff', '#27c3c3', '#ffd34d', '#c3c7cc']

function Tile({ title, children, span = 1, rows = 1, onClick }: { title: string; children: ReactNode; span?: number; rows?: number; onClick?: () => void }) {
  return (
    <section aria-label={title} onClick={onClick} className="k-dash-tile"
      style={{ gridColumn: `span ${span}`, gridRow: `span ${rows}`, background: 'rgba(70,20,36,.78)', borderRadius: 8, padding: '16px 14px', color: '#fff', minHeight: 150, display: 'flex', flexDirection: 'column', cursor: onClick ? 'pointer' : 'default', boxShadow: '0 4px 14px rgba(0,0,0,.18)', minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>{title}</h3>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: 8, minHeight: 0 }}>{children}</div>
    </section>
  )
}
const big: CSSProperties = { fontSize: 44, fontWeight: 700, lineHeight: 1.1 }
const sub: CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,.65)', marginTop: 4 }

function Ring({ items }: { items: { fonte: string; n: number }[] }) {
  const total = items.reduce((s, i) => s + i.n, 0)
  let acc = 0
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
      <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="Fontes de lead">
        <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="14" />
        {total > 0 && items.map((it, i) => {
          const len = (it.n / total) * 289; const off = acc; acc += len
          return <circle key={it.fonte} cx="60" cy="60" r="46" fill="none" stroke={RING[i % RING.length]} strokeWidth="14" strokeDasharray={`${len} ${289 - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />
        })}
        <text x="60" y="66" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700">{total}</text>
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13.5, display: 'grid', gap: 6, minWidth: 0 }}>
        {items.map((it, i) => <li key={it.fonte} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: RING[i % RING.length], flex: 'none' }} />{it.fonte} <b>{it.n}</b></li>)}
        {!items.length && <li style={sub}>Nenhum lead novo no período</li>}
      </ul>
    </div>
  )
}

function Bars({ data }: { data: { d: string; n: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.n))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90, marginTop: 'auto' }} aria-label="Mensagens por dia">
      {data.map(d => <div key={d.d} title={`${d.d.split('-').reverse().join('/')}: ${d.n}`} style={{ flex: 1, maxWidth: 28, height: `${(d.n / max) * 100}%`, minHeight: 3, background: '#c8506a', borderRadius: '3px 3px 0 0' }} />)}
      {!data.length && <div style={{ width: 100, borderTop: '1px solid rgba(255,255,255,.6)' }} />}
    </div>
  )
}

export default function Gerencial() {
  const navigate = useNavigate()
  const agents = useAgents()
  const [f, setF] = useSavedPeriod('k-painel-filtro', { period: 'week', user_id: '' })
  const [d, setD] = useState<any>(null)
  const [cfg, setCfg] = useState(false)
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('k-painel-ocultos') || '[]') } catch { return [] } })
  const toggleW = (id: string) => { const n = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id]; setHidden(n); try { localStorage.setItem('k-painel-ocultos', JSON.stringify(n)) } catch { /* */ } }
  useEffect(() => {
    if (f.period === 'custom' && (!f.from || !f.to)) return
    let vivo = true
    api.get(`/insights/painel?${qs(f)}`).then(r => { if (vivo) setD(r.data) }).catch(() => {})
    return () => { vivo = false }
  }, [f.period, f.from, f.to, f.user_id]) // eslint-disable-line react-hooks/exhaustive-deps
  const show = (id: string) => !hidden.includes(id)
  const leadsTo = (_q: string) => () => navigate('/pipelines')

  return (
    <div className="k-fullbleed k-painel" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', fontFamily: K.font, color: '#fff', background: 'linear-gradient(135deg, #a93d58 0%, #c8506a 45%, #8e2a46 100%)', padding: '20px 30px 40px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => navigate('/atividades')} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 36, padding: '0 18px', border: 'none', borderRadius: 6, background: '#4a1828', color: '#fff', fontFamily: K.font, fontWeight: 700, fontSize: 13, letterSpacing: '.04em', cursor: 'pointer', boxShadow: '0 3px 10px rgba(0,0,0,.25)' }}><List size={18} /> ATIVIDADES</button>
      </div>
      <h1 style={{ textAlign: 'center', fontSize: 36, margin: '16px 0 24px', fontWeight: 700, textShadow: '0 2px 6px rgba(0,0,0,.2)' }}>Clara Ferreira</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', position: 'relative' }}>
        <PeriodBar dark value={f} onChange={setF} agents={agents} />
        <button onClick={() => setCfg(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 18px', border: '1px solid rgba(255,255,255,.8)', borderRadius: 20, background: 'transparent', color: '#fff', fontFamily: K.font, fontSize: 15, cursor: 'pointer' }}><Settings size={16} /> Configurações</button>
      </div>

      <div className="k-dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, marginTop: 34 }}>
        {show('mensagens') && <Tile title="Mensagens recebidas" span={2} rows={2}>
          <div style={big}>{d?.mensagens_recebidas.total ?? '–'}</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 13.5 }}>{d?.mensagens_recebidas.por_canal.map((c: any) => <div key={c.nome}>{c.nome}: <b>{c.n}</b></div>)}</div>
          <Bars data={d?.mensagens_recebidas.por_dia || []} />
        </Tile>}
        {show('andamento') && <Tile title="Conversas em andamento" onClick={() => navigate('/conversas')}><div style={big}>{d?.conversas.em_andamento ?? 0}</div><div style={sub}>abertas agora</div></Tile>}
        {show('nao_respondidas') && <Tile title="Conversas não respondidas" onClick={() => navigate('/conversas')}><div style={{ ...big, color: d?.conversas.nao_respondidas ? '#ff9a9a' : '#fff' }}>{d?.conversas.nao_respondidas ?? 0}</div><div style={sub}>a última mensagem é do cliente</div></Tile>}
        {show('fontes') && <Tile title="Fontes de lead" span={2} rows={2}><Ring items={d?.fontes_de_lead || []} /></Tile>}
        {show('tempo_resposta') && <Tile title="Tempo de resposta"><div style={{ ...big, fontSize: 32 }}>{d ? (d.tempo_resposta.respostas ? dur(d.tempo_resposta.media_seg) : '—') : '–'}</div><div style={sub}>média · {d?.tempo_resposta.respostas ?? 0} respostas</div></Tile>}
        {show('esperando') && <Tile title="Mais tempo esperando"><div style={{ ...big, fontSize: 32 }}>{d ? (d.conversas.nao_respondidas ? dur(d.conversas.mais_tempo_esperando_seg) : '—') : '–'}</div><div style={sub}>cliente sem resposta há mais tempo</div></Tile>}
        {show('ganhos') && <Tile title="Leads ganhos" onClick={leadsTo('?status=won')}><div style={big}>{d?.leads.ganhos ?? 0}</div><div style={sub}>{brl(d?.leads.ganhos_valor)}</div></Tile>}
        {show('ativos') && <Tile title="Leads ativos" onClick={leadsTo('')}><div style={big}>{d?.leads.ativos ?? 0}</div><div style={sub}>{brl(d?.leads.ativos_valor)}</div></Tile>}
        {show('perdidos') && <Tile title="Leads perdidos" onClick={leadsTo('?status=lost')}><div style={big}>{d?.leads.perdidos ?? 0}</div><div style={sub}>{brl(d?.leads.perdidos_valor)}</div></Tile>}
        {show('sem_tarefa') && <Tile title="Leads sem tarefas" onClick={leadsTo('?sem_tarefa=1')}><div style={{ ...big, color: d?.leads.sem_tarefa ? '#ffd34d' : '#fff' }}>{d?.leads.sem_tarefa ?? 0}</div><div style={sub}>leads ativos sem tarefa aberta</div></Tile>}
        {show('tarefas') && <Tile title="Tarefas" span={2} onClick={() => navigate('/calendario')}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><div style={{ ...big, fontSize: 34 }}>{d?.tarefas.abertas ?? 0}</div><div style={sub}>abertas</div></div>
            <div><div style={{ ...big, fontSize: 34, color: d?.tarefas.atrasadas ? '#ff9a9a' : '#fff' }}>{d?.tarefas.atrasadas ?? 0}</div><div style={sub}>atrasadas</div></div>
            <div><div style={{ ...big, fontSize: 34 }}>{d?.tarefas.concluidas ?? 0}</div><div style={sub}>concluídas no período</div></div>
          </div>
        </Tile>}
      </div>

      {cfg && (
        <div onClick={() => setCfg(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-label="Configurações do painel" onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)', background: '#fff', color: K.text, borderRadius: 4, padding: '22px 24px', position: 'relative' }}>
            <button title="Fechar" onClick={() => setCfg(false)} style={{ position: 'absolute', top: 14, right: 14, border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={18} /></button>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 400 }}>Configurações do painel</h2>
            <p style={{ margin: '0 0 14px', color: K.muted, fontSize: 14 }}>Escolha os blocos que aparecem no painel.</p>
            {WIDGETS.map(([id, label]) => (
              <label key={id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', fontSize: 15, cursor: 'pointer', borderBottom: `1px solid ${K.line}` }}>
                <input type="checkbox" checked={show(id)} onChange={() => toggleW(id)} /> {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

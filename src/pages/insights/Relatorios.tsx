import { useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter } from 'lucide-react'
import api from '../../api'
import { toast } from '../../components/ui2'
import { K, kBtn, kInput } from '../../lib/kommo'
import { PeriodBar, useAgents, useSavedPeriod, qs, brl, type Period } from '../../lib/insightsUi'

// Insights › Relatórios: as telas de relatório do Kommo, cada uma numa aba —
// ANÁLISE DE VENDAS (ganhos e perdas por etapa), RELATÓRIO CONSOLIDADO (gráfico dia/semana/mês +
// leads por etapa e por usuário), RELATÓRIO DE ATIVIDADES (tabela por usuário) e RELATÓRIO DE META
// (barras "Por venda / Por quantidade" com "Definir metas").
/* eslint-disable @typescript-eslint/no-explicit-any */

const ABAS: [string, string][] = [['vendas', 'Análise de vendas'], ['consolidado', 'Relatório consolidado'], ['atividades', 'Relatório de atividades'], ['metas', 'Relatório de meta']]
const box: CSSProperties = { background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, padding: '16px 18px', marginBottom: 16, minWidth: 0 }
const h2: CSSProperties = { margin: '0 0 12px', fontSize: 14, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.text }
const th: CSSProperties = { textAlign: 'left', padding: '12px 14px', fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.muted, borderBottom: `1px solid ${K.line}`, whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '11px 14px', fontSize: 15, borderBottom: `1px solid ${K.line}` }
const Vazio = () => <div style={{ textAlign: 'center', color: K.muted, padding: '40px 10px', fontSize: 18 }}>Dados insuficientes para o relatório</div>

function Vendas({ f, pipelineId }: { f: Period; pipelineId: string }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get(`/insights/vendas?${qs({ ...f, pipeline_id: pipelineId })}`).then(r => setD(r.data)).catch(() => {}) }, [f, pipelineId])
  if (!d) return null
  if (!d.pipeline) return <div style={box}><Vazio /></div>
  const normais = d.stages.filter((s: any) => s.kind === 'normal')
  const ganho = d.stages.find((s: any) => s.kind === 'won'); const perda = d.stages.find((s: any) => s.kind === 'lost')
  const topo = Math.max(1, d.novos.n, ...normais.map((s: any) => s.entraram))
  return (
    <>
      <div style={box}>
        <h2 style={h2}>Leads · {d.pipeline.name}</h2>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
          <div style={{ minWidth: 110, textAlign: 'center' }}><div style={{ color: K.muted, fontSize: 12.5, textTransform: 'uppercase', fontWeight: 700 }}>Novo</div><div style={{ fontSize: 46, color: K.text }}>{d.novos.n}</div><div style={{ color: K.muted }}>{brl(d.novos.v)}</div></div>
          {normais.map((s: any) => (
            <div key={s.id} data-testid="vendas-etapa" style={{ minWidth: 170, flex: 1, borderTop: `4px solid ${s.color}`, background: '#fafbfc', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.name}>{s.name}</div>
              <div style={{ fontSize: 13, color: K.muted, marginTop: 6 }}>agora</div>
              <div style={{ fontSize: 26 }}>{s.atual}</div><div style={{ color: K.muted, fontSize: 13 }}>{brl(s.atual_valor)}</div>
              <div style={{ fontSize: 13, color: K.muted, marginTop: 8 }}>entraram no período</div>
              <div style={{ fontSize: 22 }}>{s.entraram}</div>
              <div style={{ fontSize: 13, color: K.muted, marginTop: 6 }}>tempo médio na etapa: {s.dias_medios == null ? '—' : `${s.dias_medios.toFixed(1).replace('.', ',')} d.`}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="k-rel-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16 }}>
        <div style={box}>
          <h2 style={h2}>Funil de conversão</h2>
          {normais.map((s: any) => {
            const pct = Math.round((s.entraram / topo) * 100)
            return (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 54px minmax(0,2fr)', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                <b style={{ textAlign: 'right', fontSize: 15 }}>{pct}%</b>
                <div style={{ background: '#f1f3f5', height: 18 }}><div style={{ width: `${pct}%`, height: '100%', background: s.color }} /></div>
              </div>
            )
          })}
        </div>
        <div style={box}>
          <h2 style={h2}>Ganhos e perdas</h2>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div><div style={{ color: K.green, fontWeight: 700 }}>{ganho?.name || 'Ganho'}</div><div style={{ fontSize: 30 }} data-testid="ganhos">{ganho?.entraram ?? 0}</div><div style={{ color: K.muted }}>{brl(ganho?.atual_valor)} no total</div></div>
            <div><div style={{ color: K.red, fontWeight: 700 }}>{perda?.name || 'Perdido'}</div><div style={{ fontSize: 30 }} data-testid="perdas">{perda?.entraram ?? 0}</div></div>
          </div>
          <h2 style={{ ...h2, marginTop: 18 }}>Motivos de perda</h2>
          {d.motivos.length ? d.motivos.map((m: any) => <div key={m.motivo} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${K.line}` }}><span>{m.motivo}</span><b>{m.n}</b></div>) : <div style={{ color: K.muted }}>Nenhuma perda no período.</div>}
        </div>
      </div>
    </>
  )
}

function Linha({ serie }: { serie: any[] }) {
  if (!serie.length) return <Vazio />
  const W = 760, H = 220, P = 30
  const max = Math.max(1, ...serie.flatMap(s => [s.novos, s.ganhos, s.perdidos]))
  const x = (i: number) => P + (serie.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (serie.length - 1))
  const y = (v: number) => H - P - (v / max) * (H - 2 * P)
  const path = (k: string) => serie.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s[k])}`).join(' ')
  const cores: [string, string, string][] = [['novos', '#4c8bf7', 'Novos'], ['ganhos', '#7dbb2d', 'Ganhos'], ['perdidos', '#f37575', 'Perdidos']]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Leads no período">
        {[0, 0.5, 1].map(t => <g key={t}><line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="#eceef0" /><text x={4} y={y(max * t) + 4} fontSize="11" fill={K.muted}>{Math.round(max * t)}</text></g>)}
        {cores.map(([k, c]) => <path key={k} d={path(k)} fill="none" stroke={c} strokeWidth="2.5" />)}
        {cores.map(([k, c]) => serie.map((s, i) => <circle key={k + i} cx={x(i)} cy={y(s[k])} r="3.5" fill={c}><title>{`${s.k}: ${s[k]}`}</title></circle>))}
        {serie.map((s, i) => (serie.length <= 12 || i % Math.ceil(serie.length / 12) === 0) && <text key={s.k} x={x(i)} y={H - 8} fontSize="11" fill={K.muted} textAnchor="middle">{s.k.split('-').reverse().slice(0, 2).join('/')}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 13.5 }}>{cores.map(([k, c, l]) => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c, marginRight: 6 }} />{l}</span>)}</div>
    </div>
  )
}

function Consolidado({ f, pipelineId }: { f: Period; pipelineId: string }) {
  const [group, setGroup] = useState('day')
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get(`/insights/consolidado?${qs({ ...f, pipeline_id: pipelineId, group })}`).then(r => setD(r.data)).catch(() => {}) }, [f, pipelineId, group])
  if (!d) return null
  const tab = (on: boolean): CSSProperties => ({ border: 'none', background: 'none', borderBottom: on ? `2px solid ${K.blue}` : '2px solid transparent', color: on ? K.blueDark : K.muted, fontWeight: 700, fontSize: 12.5, letterSpacing: '.04em', padding: '4px 8px', cursor: 'pointer', fontFamily: K.font })
  const totalEt = d.por_etapa.reduce((s: number, e: any) => s + e.n, 0) || 1
  const totalUs = d.por_usuario.reduce((s: number, e: any) => s + e.n, 0) || 1
  return (
    <>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...h2, margin: 0, flex: 1 }}>Leads</h2>
          <div role="tablist">{[['day', 'DIA'], ['week', 'SEMANA'], ['month', 'MÊS']].map(([id, l]) => <button key={id} role="tab" aria-selected={group === id} onClick={() => setGroup(id)} style={tab(group === id)}>{l}</button>)}</div>
        </div>
        <Linha serie={d.serie} />
      </div>
      <div className="k-rel-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={box}>
          <h2 style={h2}>Estágios do funil de vendas</h2>
          {d.por_etapa.length ? d.por_etapa.map((e: any) => <div key={e.name} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}><b style={{ width: 46, fontSize: 18 }}>{Math.round((e.n / totalEt) * 100)}%</b><span style={{ borderLeft: `3px solid ${e.color}`, paddingLeft: 10 }}>{e.name}<div style={{ color: K.muted, fontSize: 13 }}>{e.n} leads · {brl(e.v)}</div></span></div>) : <Vazio />}
        </div>
        <div style={box}>
          <h2 style={h2}>Leads por usuário</h2>
          {d.por_usuario.length ? d.por_usuario.map((e: any) => <div key={e.nome} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}><b style={{ width: 46, fontSize: 18 }}>{Math.round((e.n / totalUs) * 100)}%</b><span style={{ borderLeft: `3px solid ${K.blue}`, paddingLeft: 10 }}>{e.nome}<div style={{ color: K.muted, fontSize: 13 }}>{e.n} leads · {brl(e.v)}</div></span></div>) : <Vazio />}
        </div>
        <div style={box}>
          <h2 style={h2}>Tarefas</h2>
          <div style={{ display: 'grid', gap: 8, fontSize: 15 }}><div>Criadas no período: <b>{d.tarefas.criadas}</b></div><div>Concluídas no período: <b>{d.tarefas.concluidas}</b></div><div>Atrasadas agora: <b style={{ color: d.tarefas.atrasadas ? K.red : K.text }}>{d.tarefas.atrasadas}</b></div></div>
        </div>
      </div>
    </>
  )
}

function Atividades({ f }: { f: Period }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get(`/insights/atividades?${qs(f)}`).then(r => setD(r.data)).catch(() => {}) }, [f])
  if (!d) return null
  return (
    <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
        <thead><tr>{['Nome', 'Leads em processo', 'Mensagens enviadas', 'Notas adicionadas', 'Total de tarefas', 'Tarefas concluídas', 'Vendas totais'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {d.usuarios.map((u: any) => (
            <tr key={u.id} data-testid="ativ-linha">
              <td style={{ ...td, color: K.link }}>{u.nome}</td><td style={td}>{u.leads_em_processo}</td><td style={td}>{u.mensagens}</td><td style={td}>{u.notas}</td>
              <td style={td}>{u.tarefas}</td><td style={td}>{u.tarefas_concluidas}</td><td style={td}>{u.vendas} · {brl(u.vendas_valor)}</td>
            </tr>
          ))}
          {!d.usuarios.length && <tr><td colSpan={7} style={{ ...td, color: K.muted, textAlign: 'center' }}>Nenhum usuário.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function Metas() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [modo, setModo] = useState<'valor' | 'qtd'>('valor')
  const [d, setD] = useState<any>(null)
  const [editar, setEditar] = useState<any[] | null>(null)
  const load = () => api.get(`/insights/metas?month=${month}`).then(r => setD(r.data)).catch(() => {})
  useEffect(() => { load() }, [month]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null
  const meta = (u: any) => (modo === 'valor' ? u.meta_valor : u.meta_qtd)
  const real = (u: any) => (modo === 'valor' ? u.real_valor : u.real_qtd)
  const fmt = (n: number) => (modo === 'valor' ? brl(n) : String(n))
  const tot = { meta: d.usuarios.reduce((s: number, u: any) => s + meta(u), 0), real: d.usuarios.reduce((s: number, u: any) => s + real(u), 0) }
  const barra = (nome: string, m: number, r: number, bold = false) => {
    const pct = m > 0 ? Math.min(150, (r / m) * 100) : 0
    return (
      <div key={nome} data-testid="meta-linha" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 190px) minmax(0, 1fr) 150px', gap: 12, alignItems: 'center', padding: '10px 0' }}>
        <span style={{ fontWeight: bold ? 700 : 400 }}>{nome}</span>
        <div style={{ position: 'relative', height: 22, background: '#eceeef' }}>
          <div style={{ width: `${Math.min(100, (pct / 150) * 100)}%`, height: '100%', background: m > 0 && r < m * 0.5 ? '#f08f8f' : '#aecb85' }} />
          <div style={{ position: 'absolute', left: `${(100 / 150) * 100}%`, top: -6, bottom: -6, borderLeft: `1px dashed ${K.muted}` }} title="Meta" />
        </div>
        <span style={{ fontSize: 13.5, color: K.muted }}>{m > 0 ? `${fmt(r)} de ${fmt(m)} · ${Math.round((r / m) * 100)}%` : `${fmt(r)} · sem meta`}</span>
      </div>
    )
  }
  const salvar = async () => {
    try { await api.put('/insights/metas', { month, metas: editar }); toast('success', 'Metas salvas.'); setEditar(null); load() } catch { toast('error', 'Não foi possível salvar as metas.') }
  }
  return (
    <>
      <div style={{ ...box, color: K.muted, fontSize: 15 }}>Estabeleça metas para focar sua equipe e expandir seus negócios. Elas permitem acompanhar as vendas de cada pessoa no mês e o desempenho do time.</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input type="month" aria-label="Mês" value={month} onChange={e => setMonth(e.target.value)} style={{ ...kInput, width: 170 }} />
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: `1px solid ${K.lineDark}`, borderRadius: 3, overflow: 'hidden' }}>
          {([['valor', 'Por venda'], ['qtd', 'Por quantidade']] as const).map(([id, l]) => <button key={id} aria-pressed={modo === id} onClick={() => setModo(id)} style={{ border: 'none', padding: '0 14px', height: 34, background: modo === id ? '#fff' : '#f0f1f2', fontWeight: 700, fontFamily: K.font, color: K.text, cursor: 'pointer' }}>{l}</button>)}
        </div>
        <button onClick={() => setEditar(d.usuarios.map((u: any) => ({ user_id: u.user_id, nome: u.nome, meta_valor: u.meta_valor, meta_qtd: u.meta_qtd })))} style={kBtn('ghost', { textTransform: 'none', fontSize: 14 })}>Definir metas</button>
      </div>
      <div style={box}>
        {barra('Total', tot.meta, tot.real, true)}
        <h3 style={{ margin: '14px 0 4px', fontSize: 17 }}>Seção de vendas</h3>
        {d.usuarios.map((u: any) => barra(u.nome, meta(u), real(u)))}
      </div>
      {editar && (
        <div onClick={() => setEditar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-label="Definir metas" onClick={e => e.stopPropagation()} style={{ width: 'min(620px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 4, padding: '22px 24px' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 19, fontWeight: 400 }}>Definir metas · {month.split('-').reverse().join('/')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px 110px', gap: 8, alignItems: 'center', fontSize: 13, color: K.muted, fontWeight: 700, textTransform: 'uppercase' }}><span>Usuário</span><span>Meta em R$</span><span>Nº de vendas</span></div>
            {editar.map((g, i) => (
              <div key={g.user_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px 110px', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span>{g.nome}</span>
                <input aria-label={`Meta em R$ de ${g.nome}`} type="number" min={0} value={g.meta_valor} onChange={e => setEditar(editar.map((x, j) => (j === i ? { ...x, meta_valor: e.target.value } : x)))} style={kInput} />
                <input aria-label={`Nº de vendas de ${g.nome}`} type="number" min={0} value={g.meta_qtd} onChange={e => setEditar(editar.map((x, j) => (j === i ? { ...x, meta_qtd: e.target.value } : x)))} style={kInput} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setEditar(null)} style={kBtn('flat')}>Cancelar</button>
              <button onClick={salvar} style={kBtn('blue')}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function Relatorios() {
  const [sp, setSp] = useSearchParams()
  const aba = ABAS.some(([id]) => id === sp.get('aba')) ? sp.get('aba')! : 'vendas'
  const agents = useAgents()
  const [f, setF] = useSavedPeriod('k-relatorios-filtro', { period: 'month', user_id: '' })
  const [pipes, setPipes] = useState<any[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [filtro, setFiltro] = useState(true)
  useEffect(() => { api.get('/pipelines').then(r => setPipes((r.data || []).filter((p: any) => !p.system))).catch(() => {}) }, [])
  const ready = f.period !== 'custom' || (f.from && f.to)
  const tab = (on: boolean): CSSProperties => ({ border: 'none', background: 'none', padding: '0 4px', height: 64, borderBottom: on ? `3px solid ${K.blue}` : '3px solid transparent', color: on ? K.text : K.muted, fontFamily: K.font, fontSize: 14, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' })

  return (
    <div className="k-fullbleed" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', background: K.bg, fontFamily: K.font, color: K.text }}>
      <div className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px', overflowX: 'auto' }}>
        {aba !== 'metas' && <button onClick={() => setFiltro(v => !v)} aria-expanded={filtro} style={kBtn('ghost', { textTransform: 'none', fontSize: 14, flex: 'none' })}><Filter size={15} /> Filtro</button>}
        <div role="tablist" style={{ display: 'flex', gap: 22 }}>
          {ABAS.map(([id, label]) => <button key={id} role="tab" aria-selected={aba === id} onClick={() => setSp({ aba: id })} style={tab(aba === id)}>{label}</button>)}
        </div>
      </div>
      <div style={{ padding: 24 }}>
        {filtro && aba !== 'metas' && (
          <div style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <PeriodBar value={f} onChange={setF} agents={agents} />
            {aba !== 'atividades' && (
              <select aria-label="Funil" value={pipelineId} onChange={e => setPipelineId(e.target.value)} style={{ ...kInput, width: 220 }}>
                <option value="">{aba === 'vendas' ? 'Primeiro funil' : 'Todos os funis'}</option>
                {pipes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        )}
        {ready && aba === 'vendas' && <Vendas f={f} pipelineId={pipelineId} />}
        {ready && aba === 'consolidado' && <Consolidado f={f} pipelineId={pipelineId} />}
        {ready && aba === 'atividades' && <Atividades f={f} />}
        {aba === 'metas' && <Metas />}
      </div>
    </div>
  )
}

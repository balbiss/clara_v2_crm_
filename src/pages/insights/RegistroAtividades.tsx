import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import api from '../../api'
import { K, kBtn, kInput } from '../../lib/kommo'
import { useClickOutside } from '../../lib/hooks'
import { PERIODS, useAgents, agentName, qs, dataBR } from '../../lib/insightsUi'

// Insights › Atividades = "Registro de atividades" do Kommo (/events/list): busca "Filtro" no topo
// (abre painel com período, usuário, tipo de objeto e eventos), tabela DATA · USUÁRIO · TIPO DE
// OBJETO · NOME DO OBJETO · ATIVIDADES · VALOR ANTES · VALOR DEPOIS, setas de página e
// "Mostrar linhas". Quem é "Robô" foi a automação (Automatize / Salesbot).
/* eslint-disable @typescript-eslint/no-explicit-any */

type F = { q: string; period: string; from: string; to: string; user_id: string; object_type: string; event_type: string[] }
const VAZIO: F = { q: '', period: '', from: '', to: '', user_id: '', object_type: '', event_type: [] }
const OBJETOS: [string, string][] = [['', 'Todos'], ['lead', 'Lead'], ['contato', 'Contato'], ['tarefa', 'Tarefa'], ['nota', 'Nota']]
const th: CSSProperties = { textAlign: 'left', padding: '12px 14px', fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.muted, borderBottom: `1px solid ${K.line}`, whiteSpace: 'nowrap', background: '#fff' }
const td: CSSProperties = { padding: '10px 14px', fontSize: 14.5, borderBottom: `1px solid ${K.line}`, verticalAlign: 'top', maxWidth: 260, overflowWrap: 'anywhere' }

export default function RegistroAtividades() {
  const navigate = useNavigate()
  const agents = useAgents()
  const [f, setF] = useState<F>(VAZIO)
  const [draft, setDraft] = useState<F>(VAZIO)
  const [painel, setPainel] = useState(false)
  const [page, setPage] = useState(1)
  const [per, setPer] = useState(() => { try { return Number(localStorage.getItem('k-eventos-per')) || 50 } catch { return 50 } })
  const [d, setD] = useState<any>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setPainel(false), painel)

  useEffect(() => {
    const params: any = { page, per, q: f.q, user_id: f.user_id, object_type: f.object_type, event_type: f.event_type.join(',') }
    if (f.period) Object.assign(params, { period: f.period, from: f.from, to: f.to })
    let vivo = true
    api.get(`/insights/eventos?${qs(params)}`).then(r => { if (vivo) setD(r.data) }).catch(() => {})
    return () => { vivo = false }
  }, [f, page, per])

  const aplicar = (n: F) => { setF(n); setPage(1); setPainel(false) }
  const ativos = [f.period && PERIODS.find(p => p[0] === f.period)?.[1], f.user_id && (f.user_id === 'robo' ? 'Robô' : agentName(agents.find(a => String(a.id) === f.user_id) || {})), f.object_type && OBJETOS.find(o => o[0] === f.object_type)?.[1], f.event_type.length && `${f.event_type.length} evento(s)`].filter(Boolean) as string[]
  const sel: CSSProperties = { ...kInput }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !d) return
      if (e.key === 'ArrowRight' && d.has_more) setPage(p => p + 1)
      if (e.key === 'ArrowLeft') setPage(p => Math.max(1, p - 1))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [d])

  return (
    <div className="k-fullbleed" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', background: K.bg, fontFamily: K.font, color: K.text }}>
      <div ref={ref} className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', position: 'relative', flexWrap: 'wrap' }}>
        <Search size={17} color={K.muted} />
        {ativos.map(a => <span key={a} style={{ background: '#eef4fe', color: K.blueDark, borderRadius: 3, padding: '3px 8px', fontSize: 13.5 }}>{a}</span>)}
        <input aria-label="Filtro" placeholder="Filtro" value={draft.q} onFocus={() => setPainel(true)} onChange={e => setDraft({ ...draft, q: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') aplicar({ ...f, q: draft.q }) }}
          style={{ flex: 1, minWidth: 140, border: 'none', outline: 'none', height: 40, fontFamily: K.font, fontSize: 15, color: K.text, background: 'transparent' }} />
        {(ativos.length > 0 || f.q) && <button title="Limpar filtro" onClick={() => { setDraft(VAZIO); aplicar(VAZIO) }} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={16} /></button>}
        {painel && (
          <div role="dialog" aria-label="Filtro de eventos" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, background: '#fff', borderBottom: `1px solid ${K.lineDark}`, boxShadow: '0 8px 20px rgba(0,0,0,.12)', padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13.5, color: K.muted }}>Período
              <select aria-label="Período" value={draft.period} onChange={e => setDraft({ ...draft, period: e.target.value })} style={sel}>
                <option value="">Todo o período</option>{PERIODS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
              {draft.period === 'custom' && <span style={{ display: 'flex', gap: 6 }}><input type="date" aria-label="De" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} style={sel} /><input type="date" aria-label="Até" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} style={sel} /></span>}
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 13.5, color: K.muted }}>Usuário
              <select aria-label="Usuário" value={draft.user_id} onChange={e => setDraft({ ...draft, user_id: e.target.value })} style={sel}>
                <option value="">Todos</option><option value="robo">Robô (automações)</option>{agents.map(a => <option key={a.id} value={a.id}>{agentName(a)}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 13.5, color: K.muted }}>Tipo de objeto
              <select aria-label="Tipo de objeto" value={draft.object_type} onChange={e => setDraft({ ...draft, object_type: e.target.value })} style={sel}>{OBJETOS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
            </label>
            <div style={{ display: 'grid', gap: 6, fontSize: 13.5, color: K.muted, gridRow: 'span 2' }}>Eventos
              <div style={{ border: `1px solid ${K.lineDark}`, borderRadius: 3, maxHeight: 180, overflowY: 'auto', padding: '4px 8px', color: K.text }}>
                {(d?.tipos || []).map((t: any) => (
                  <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={draft.event_type.includes(t.id)} onChange={e => setDraft({ ...draft, event_type: e.target.checked ? [...draft.event_type, t.id] : draft.event_type.filter(x => x !== t.id) })} /> {t.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <button onClick={() => aplicar(draft)} style={kBtn('blue')}>Aplicar</button>
              <button onClick={() => { setDraft(VAZIO); aplicar(VAZIO) }} style={kBtn('flat')}>Redefinir</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 14px' }}>
        <div style={{ background: '#fff', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>{['Data', 'Usuário', 'Tipo de objeto', 'Nome do objeto', 'Atividades', 'Valor antes', 'Valor depois'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {d?.eventos.map((e: any) => (
                <tr key={e.id} data-testid="evento">
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{dataBR(e.created_at)}</td>
                  <td style={td}>{e.usuario}</td>
                  <td style={td}>{OBJETOS.find(o => o[0] === e.object_type)?.[1] || e.object_type}</td>
                  <td style={td}>{e.contact_id ? <button onClick={() => navigate(`/contatos/${e.contact_id}`)} style={{ border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 14.5, cursor: 'pointer', textAlign: 'left' }}>{e.object_name || `#${e.contact_id}`}</button> : (e.object_name || '—')}</td>
                  <td style={td}>{e.evento}</td>
                  <td style={{ ...td, color: K.muted }}>{e.value_before || ''}</td>
                  <td style={td}>{e.value_after || ''}</td>
                </tr>
              ))}
              {d && !d.eventos.length && <tr><td colSpan={7} style={{ ...td, color: '#e5534b' }}>Desculpe, não há eventos com esses parâmetros. <button onClick={() => { setDraft(VAZIO); aplicar(VAZIO) }} style={{ border: 'none', background: 'none', padding: 0, color: K.text, textDecoration: 'underline', fontFamily: K.font, fontSize: 14.5, cursor: 'pointer' }}>Mostrar tudo</button></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
          <button title="Página anterior" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ border: 'none', background: 'none', cursor: page > 1 ? 'pointer' : 'default', color: page > 1 ? K.text : K.lineDark }}><ChevronLeft size={18} /></button>
          <span style={{ fontSize: 14 }} aria-label="Página">{page}</span>
          <button title="Próxima página" disabled={!d?.has_more} onClick={() => setPage(p => p + 1)} style={{ border: 'none', background: 'none', cursor: d?.has_more ? 'pointer' : 'default', color: d?.has_more ? K.text : K.lineDark }}><ChevronRight size={18} /></button>
          <span style={{ fontSize: 12.5, color: K.muted, fontStyle: 'italic' }}>← Ctrl →</span>
          <span style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: K.muted, fontSize: 14.5 }}>Mostrar linhas:
            <select aria-label="Mostrar linhas" value={per} onChange={e => { const n = Number(e.target.value); setPer(n); setPage(1); try { localStorage.setItem('k-eventos-per', String(n)) } catch { /* */ } }} style={{ ...kInput, width: 76 }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

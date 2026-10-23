import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cake, CalendarClock, CheckCircle2, MessageCircle, Search, Sparkles, Users } from 'lucide-react'
import api from '../api'
import { toast } from '../components/ui2'
import { K } from '../lib/kommo'

// Início ("Meu dia"): tarefas de hoje, carteira em números, acertos da semana, conversas esperando
// resposta e aniversariantes — sempre da carteira de quem entrou. Gerência/diretoria ganha o
// ranking da equipe e as novidades do Jueri de hoje. Dados: GET /inicio.
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROSA = '#c8506a', VINHO = '#8e2a46'
const box: CSSProperties = { background: '#fff', border: `1px solid ${K.line}`, borderRadius: 6, padding: '16px 18px', minWidth: 0 }
const dataBR = (iso: string) => iso.split('-').reverse().join('/')
const ddmm = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const ha = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000))
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60); if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24); return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const CARTEIRA: [string, string][] = [['ativas', 'Ativas'], ['revendedor_ativo', '1º dia'], ['terceiro_dia', '3º dia'], ['decimo_dia', '10º dia'], ['vigesimo_dia', '20º dia'], ['agendado', 'Agendadas'], ['reagendar', 'Reagendar'], ['atrasada', 'Atrasadas'], ['sem_maleta', 'Sem maleta']]
const MARCOS: Record<string, string> = { iniciada: 'ativada pela 1ª vez', reativacao: 'reativada', ciclo_reiniciado: 'levou maleta nova', churn: 'ficou sem maleta' }

function Bloco({ titulo, icone, extra, children }: { titulo: string; icone: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={titulo} style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: ROSA, display: 'flex' }}>{icone}</span>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', flex: 1 }}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}
const Vazio = ({ children }: { children: ReactNode }) => <div style={{ color: K.muted, fontSize: 14, padding: '10px 0' }}>{children}</div>
const linha: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${K.line}`, fontSize: 14.5 }
const link: CSSProperties = { border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 14.5, cursor: 'pointer', textAlign: 'left' }

function BuscaRapida() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<any[]>([])
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(t.current)
    if (q.trim().length < 2) { setRes([]); return }
    t.current = setTimeout(() => { api.get(`/contacts?q=${encodeURIComponent(q.trim())}&per_page=8`).then(r => setRes(Array.isArray(r.data) ? r.data : r.data.contacts || [])).catch(() => setRes([])) }, 300)
  }, [q])
  return (
    <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 460 }}>
      <Search size={16} color={K.muted} style={{ position: 'absolute', left: 12, top: 11 }} />
      <input aria-label="Buscar revendedora" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar revendedora por nome ou telefone" style={{ width: '100%', height: 38, padding: '0 12px 0 36px', border: `1px solid ${K.lineDark}`, borderRadius: 20, fontFamily: K.font, fontSize: 14.5, boxSizing: 'border-box', background: '#fff' }} />
      {res.length > 0 && (
        <div role="listbox" style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 20, background: '#fff', border: `1px solid ${K.lineDark}`, borderRadius: 6, boxShadow: '0 8px 20px rgba(0,0,0,.12)', overflow: 'hidden' }}>
          {res.map(c => (
            <button key={c.id} role="option" onClick={() => navigate(`/contatos/${c.id}`)} style={{ display: 'flex', width: '100%', gap: 10, padding: '9px 12px', border: 'none', borderBottom: `1px solid ${K.line}`, background: '#fff', cursor: 'pointer', fontFamily: K.font, fontSize: 14, textAlign: 'left' }}>
              <span style={{ flex: 1 }}>{c.name || c.phone}</span><span style={{ color: K.muted }}>{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Inicio() {
  const navigate = useNavigate()
  const [d, setD] = useState<any>(null)
  const [concluindo, setConcluindo] = useState<number | null>(null)
  const load = () => api.get('/inicio').then(r => setD(r.data)).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [])
  const concluir = async (id: number) => {
    setConcluindo(id)
    try { await api.patch(`/tarefas/${id}/complete`, { resultado: 'Concluída pelo Início' }); toast('success', 'Tarefa concluída.'); await load() }
    catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível concluir.') } finally { setConcluindo(null) }
  }
  if (!d) return <div style={{ padding: 40, color: K.muted, fontFamily: K.font }}>Carregando…</div>
  const dataLonga = new Date(`${d.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="k-fullbleed k-inicio" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', background: K.bg, fontFamily: K.font, color: K.text, padding: '22px 24px 40px', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 260px' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: VINHO }}>{saudacao()}{d.usuario.nome ? `, ${d.usuario.nome}` : ''}!</h1>
          <div style={{ color: K.muted, fontSize: 14.5, marginTop: 2, textTransform: 'capitalize' }}>{dataLonga}{d.usuario.time ? ' · visão da equipe' : ' · sua carteira'}</div>
        </div>
        <BuscaRapida />
      </header>

      <section aria-label="Carteira" className="k-inicio-carteira" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 10, marginBottom: 16 }}>
        {CARTEIRA.map(([k, l], i) => (
          <button key={k} onClick={() => navigate('/carteira')} style={{ ...box, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: K.font, background: i === 0 ? ROSA : '#fff', color: i === 0 ? '#fff' : K.text, borderColor: i === 0 ? ROSA : K.line }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: i === 0 ? '#fff' : k === 'atrasada' && d.carteira[k] ? '#c0392b' : VINHO }}>{(d.carteira[k] || 0).toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: 13, opacity: i === 0 ? 0.95 : 1, color: i === 0 ? '#fff' : K.muted }}>{l}</div>
          </button>
        ))}
      </section>

      <div className="k-inicio-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <Bloco titulo="Tarefas de hoje" icone={<CheckCircle2 size={18} />} extra={<span style={{ fontSize: 13, color: K.muted }}>{d.tarefas.hoje} hoje{d.tarefas.atrasadas ? <> · <b style={{ color: '#c0392b' }}>{d.tarefas.atrasadas} atrasadas</b></> : null}</span>}>
            {!d.tarefas.lista.length && <Vazio>Nenhuma tarefa pra hoje. 🎉</Vazio>}
            {d.tarefas.lista.map((t: any) => {
              const atrasada = !!t.vencimento && new Date(t.vencimento) < new Date(`${d.hoje}T00:00:00-03:00`)
              return (
                <div key={t.id} data-testid="tarefa" style={linha}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</div>
                    <button onClick={() => navigate(`/contatos/${t.contact_id}`)} style={{ ...link, fontSize: 13.5 }}>{t.contato}</button>
                    <span style={{ fontSize: 13, color: atrasada ? '#c0392b' : K.muted }}> · {atrasada ? `atrasada desde ${ddmm(t.vencimento.slice(0, 10))}` : t.vencimento ? `até ${hora(t.vencimento)}` : 'sem horário'}</span>
                  </div>
                  <button onClick={() => concluir(t.id)} disabled={concluindo === t.id} style={{ flex: 'none', height: 30, padding: '0 12px', border: `1px solid ${ROSA}`, borderRadius: 15, background: '#fff', color: VINHO, fontFamily: K.font, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{concluindo === t.id ? '…' : 'Concluir'}</button>
                </div>
              )
            })}
          </Bloco>

          <Bloco titulo="Esperando resposta" icone={<MessageCircle size={18} />} extra={<span style={{ fontSize: 13, color: d.esperando.total ? '#c0392b' : K.muted }}>{d.esperando.total} conversa(s)</span>}>
            {!d.esperando.lista.length && <Vazio>Ninguém esperando resposta. 👏</Vazio>}
            {d.esperando.lista.map((c: any) => (
              <button key={c.conversation_id} data-testid="esperando" onClick={() => navigate(`/conversas?abrir=${c.conversation_id}`)} style={{ ...linha, width: '100%', border: 'none', borderTop: `1px solid ${K.line}`, background: 'none', cursor: 'pointer', fontFamily: K.font, textAlign: 'left' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{c.nome}</div>
                  <div style={{ color: K.muted, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.texto}</div>
                </div>
                <span style={{ flex: 'none', fontSize: 12.5, color: '#c0392b' }}>{ha(c.desde)}</span>
              </button>
            ))}
          </Bloco>

          {d.usuario.time && d.ranking && (
            <Bloco titulo="Equipe" icone={<Users size={18} />} extra={d.sem_responsavel ? <button onClick={() => navigate('/carteira')} style={{ ...link, fontSize: 13, color: '#c0392b' }}>{d.sem_responsavel} ativas sem responsável</button> : undefined}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 420 }}>
                  <thead><tr>{['Pessoa', 'Ativas', 'Tarefas atrasadas', 'Esperando resposta'].map(h => <th key={h} style={{ textAlign: h === 'Pessoa' ? 'left' : 'right', padding: '6px 4px', fontSize: 12, color: K.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${K.line}` }}>{h}</th>)}</tr></thead>
                  <tbody>{d.ranking.map((r: any) => (
                    <tr key={r.id} data-testid="ranking">
                      <td style={{ padding: '7px 4px', borderBottom: `1px solid ${K.line}` }}>{r.nome}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', borderBottom: `1px solid ${K.line}`, fontWeight: 700, color: VINHO }}>{r.ativas}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', borderBottom: `1px solid ${K.line}`, color: r.tarefas_atrasadas ? '#c0392b' : K.muted }}>{r.tarefas_atrasadas}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', borderBottom: `1px solid ${K.line}`, color: r.esperando ? '#c0392b' : K.muted }}>{r.esperando}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Bloco>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <Bloco titulo="Acertos da semana" icone={<CalendarClock size={18} />} extra={<span style={{ fontSize: 13, color: K.muted }}>{d.acertos.length}</span>}>
            {!d.acertos.length && <Vazio>Nenhum acerto previsto nos próximos 7 dias.</Vazio>}
            {d.acertos.map((a: any) => (
              <div key={a.id} data-testid="acerto" style={linha}>
                <span style={{ flex: 'none', width: 46, fontWeight: 700, color: a.data === d.hoje ? '#c0392b' : VINHO }}>{a.data === d.hoje ? 'Hoje' : ddmm(a.data)}</span>
                <button onClick={() => navigate(`/contatos/${a.id}`)} style={{ ...link, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome || a.phone}</button>
                <span style={{ flex: 'none', fontSize: 13, color: K.muted }}>{a.pecas} peças</span>
              </div>
            ))}
          </Bloco>

          {d.usuario.time && d.novidades && (
            <Bloco titulo="Novidades do Jueri hoje" icone={<Sparkles size={18} />}>
              {!d.novidades.marcos.length && !d.novidades.cadastros.length && <Vazio>Nada novo hoje ainda.</Vazio>}
              {d.novidades.cadastros.map((c: any, i: number) => <div key={'c' + i} style={linha}><span style={{ flex: 1 }}>🆕 {c.texto}</span><span style={{ fontSize: 12.5, color: K.muted }}>{hora(c.em)}</span></div>)}
              {d.novidades.marcos.map((m: any, i: number) => (
                <div key={'m' + i} data-testid="novidade" style={linha}>
                  <button onClick={() => navigate(`/contatos/${m.contact_id}`)} style={{ ...link, flex: 1, minWidth: 0 }}>{m.nome}</button>
                  <span style={{ fontSize: 13, color: m.tipo === 'churn' ? '#c0392b' : '#1e7b34' }}>{MARCOS[m.tipo] || m.tipo}</span>
                </div>
              ))}
            </Bloco>
          )}

          <Bloco titulo="Aniversariantes da semana" icone={<Cake size={18} />}>
            {!d.aniversarios.length && <Vazio>Nenhum aniversário nos próximos 7 dias.</Vazio>}
            {d.aniversarios.map((a: any) => (
              <div key={a.id} data-testid="aniversario" style={linha}>
                <span style={{ flex: 'none', width: 46, fontWeight: 700, color: a.dia === d.hoje.slice(5) ? '#c0392b' : VINHO }}>{a.dia === d.hoje.slice(5) ? 'Hoje' : a.dia.split('-').reverse().join('/')}</span>
                <button onClick={() => navigate(`/contatos/${a.id}`)} style={{ ...link, flex: 1 }}>{a.nome || a.phone}</button>
              </div>
            ))}
          </Bloco>
        </div>
      </div>
      <p style={{ color: K.muted, fontSize: 12.5, marginTop: 18 }}>Atualiza sozinho a cada minuto · {dataBR(d.hoje)}</p>
    </div>
  )
}

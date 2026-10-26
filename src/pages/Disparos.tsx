import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Paperclip, Pause, Play, Plus, Send, X } from 'lucide-react'
import api from '../api'
import { confirmBox, toast } from '../components/ui2'
import { K, kBtn, kInput } from '../lib/kommo'
import { ACTIVE_STATUS_LABELS, INACTIVE_STATUS_LABELS } from '../constants/regua'

// Comunicações › Disparos: mensagem (ou robô) pra uma lista filtrada, saindo por um número escolhido,
// um de cada vez, com intervalo aleatório, limite por dia e horário (motor em server/src/lib/disparos.ts).
// Só gerência e diretoria. Antes de cada envio o servidor confere se o número tem WhatsApp.
/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS: Record<string, [string, string]> = {
  draft: ['Rascunho', K.muted], scheduled: ['Agendado', '#6d3b5e'], running: ['Enviando', '#5f7d6a'], paused: ['Pausado', '#a07f45'],
  done: ['Concluído', '#4f6d8a'], cancelled: ['Cancelado', K.muted],
}
const MOTIVO: Record<string, string> = {
  fora_do_horario: 'Fora do horário de envio — continua sozinho no próximo horário',
  limite_diario: 'Limite do dia atingido — continua amanhã',
  numero_desconectado: 'O número está desconectado — continua quando reconectar',
  whatsapp_instavel: 'O WhatsApp não respondeu — tentando de novo em instantes',
  sem_numero: 'O número desse disparo foi apagado',
  manual: 'Pausado por você',
}
const RECIP: Record<string, string> = { pending: 'Na fila', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou', skipped: 'Pulada', cancelled: 'Cancelada' }
const ERRO: Record<string, string> = { sem_whatsapp: 'número sem WhatsApp', pediu_para_sair: 'pediu pra não receber', contato_bloqueado: 'contato bloqueado', envio_falhou: 'o WhatsApp recusou', robo_nao_rodou: 'o robô não rodou' }

const fmtDataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const card = { background: '#fff', border: `1px solid ${K.line}`, borderRadius: 4, padding: 18 }
const lbl = { display: 'block', fontSize: 13, color: K.muted, margin: '14px 0 6px' } as const

function Chip({ cor, children }: { cor: string; children: ReactNode }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: cor, color: '#fff', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</span>
}

export default function Disparos() {
  const { id } = useParams()
  if (id === 'novo') return <NovoDisparo />
  if (id) return <DetalheDisparo id={Number(id)} />
  return <ListaDisparos />
}

function Progresso({ c }: { c: any }) {
  const feito = c.sent + c.failed + c.skipped + c.cancelled
  const pct = c.total ? Math.round((feito / c.total) * 100) : 0
  return (
    <div>
      <div style={{ height: 6, background: '#eee', borderRadius: 3 }}><div style={{ height: 6, width: `${pct}%`, background: '#8e2a46', borderRadius: 3 }} /></div>
      <div style={{ fontSize: 12.5, color: K.muted, marginTop: 4 }}>{c.sent} enviadas · {c.pending} na fila · {c.failed + c.skipped} não enviadas · {c.replied} responderam</div>
    </div>
  )
}

function ListaDisparos() {
  const navigate = useNavigate()
  const [lista, setLista] = useState<any[] | null>(null)
  useEffect(() => {
    const load = () => api.get('/broadcasts').then(r => setLista(r.data)).catch(() => setLista([]))
    load(); const t = setInterval(load, 10000); return () => clearInterval(t)
  }, [])
  return (
    <div style={{ fontFamily: K.font, color: K.text, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Disparos</h1>
        <span style={{ flex: 1 }} />
        <button onClick={() => navigate('/disparos/novo')} style={kBtn('blue')}><Plus size={15} /> Novo disparo</button>
      </div>
      <p style={{ color: K.muted, fontSize: 14, marginTop: 0 }}>Mensagem para várias pessoas de uma vez, uma de cada vez, com intervalo entre os envios pra proteger o número.</p>
      {lista === null ? <p style={{ color: K.muted }}>Carregando…</p> : !lista.length ? (
        <div style={{ ...card, textAlign: 'center', color: K.muted, padding: 40 }}>Nenhum disparo ainda.</div>
      ) : lista.map(b => (
        <button key={b.id} onClick={() => navigate(`/disparos/${b.id}`)} style={{ ...card, display: 'block', width: '100%', textAlign: 'left', marginBottom: 10, cursor: 'pointer', fontFamily: K.font }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <b style={{ fontSize: 15 }}>{b.name}</b>
            <Chip cor={STATUS[b.status]?.[1] || K.muted}>{STATUS[b.status]?.[0] || b.status}</Chip>
            {b.inbox && <Chip cor={b.inbox.color}>{b.inbox.short}</Chip>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: K.muted }}>{b.created_by} · {fmtDataHora(b.created_at)}</span>
          </div>
          <Progresso c={b.counts} />
        </button>
      ))}
    </div>
  )
}

function DetalheDisparo({ id }: { id: number }) {
  const navigate = useNavigate()
  const [b, setB] = useState<any>(null)
  const [filtro, setFiltro] = useState('')
  const load = () => api.get(`/broadcasts/${id}`, { params: { status: filtro || undefined } }).then(r => setB(r.data)).catch(() => navigate('/disparos'))
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [id, filtro]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <p style={{ fontFamily: K.font, color: K.muted }}>Carregando…</p>
  const acao = async (a: 'pause' | 'resume' | 'cancel') => {
    if (a === 'cancel' && !(await confirmBox('Cancelar o disparo?', 'Quem ainda não recebeu não vai receber mais. Não dá pra desfazer.', 'Sim, cancelar'))) return
    await api.post(`/broadcasts/${id}/${a}`); load()
  }
  const ativo = ['running', 'scheduled'].includes(b.status)
  return (
    <div style={{ fontFamily: K.font, color: K.text, maxWidth: 1000 }}>
      <button onClick={() => navigate('/disparos')} style={{ ...kBtn('flat'), padding: 0, marginBottom: 10, textTransform: 'none', fontWeight: 400, color: K.muted }}><ChevronLeft size={16} /> Disparos</button>
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{b.name}</h1>
          <Chip cor={STATUS[b.status]?.[1] || K.muted}>{STATUS[b.status]?.[0] || b.status}</Chip>
          <span style={{ flex: 1 }} />
          {ativo && <button onClick={() => acao('pause')} style={kBtn('ghost')}><Pause size={14} /> Pausar</button>}
          {b.status === 'paused' && <button onClick={() => acao('resume')} style={kBtn('blue')}><Play size={14} /> Retomar</button>}
          {!['done', 'cancelled'].includes(b.status) && <button onClick={() => acao('cancel')} style={kBtn('flat', { color: K.muted })}><X size={14} /> Cancelar</button>}
        </div>
        {b.pause_reason && !['done', 'cancelled'].includes(b.status) && <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff8e6', border: '1px solid #f1d27a', borderRadius: 3, fontSize: 13.5 }}>{MOTIVO[b.pause_reason] || b.pause_reason}{b.next_send_at && b.pause_reason !== 'manual' ? ` (próxima tentativa: ${fmtDataHora(b.next_send_at)})` : ''}</div>}
        {b.status === 'scheduled' && <div style={{ marginTop: 10, fontSize: 13.5 }}>Começa em {fmtDataHora(b.scheduled_at)}</div>}
        <div style={{ marginTop: 14 }}><Progresso c={b.counts} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14, fontSize: 13.5 }}>
          <div><span style={{ color: K.muted }}>Número</span><br />{b.inbox ? <><Chip cor={b.inbox.color}>{b.inbox.short}</Chip> {b.inbox.phone_number}</> : '—'}</div>
          <div><span style={{ color: K.muted }}>Ritmo</span><br />{b.min_interval_seconds} a {b.max_interval_seconds} s entre envios, até {b.daily_limit} por dia, das {b.start_hour}h às {b.end_hour}h</div>
          <div><span style={{ color: K.muted }}>Criado por</span><br />{b.created_by} em {fmtDataHora(b.created_at)}</div>
        </div>
        <div style={{ marginTop: 14, padding: 12, background: '#fcf0f3', borderRadius: 4, fontSize: 14, whiteSpace: 'pre-wrap' }}>
          {b.flow_id ? <>Robô: <b>{b.flow_name}</b></> : b.text}
          {b.attachment && <div style={{ marginTop: 6 }}><a href={b.attachment.url} target="_blank" rel="noreferrer" style={{ color: K.link }}><Paperclip size={13} /> {b.attachment.name}</a></div>}
        </div>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['', 'Todas'], ['sent', 'Enviadas'], ['pending', 'Na fila'], ['replied', 'Responderam'], ['failed', 'Falharam'], ['skipped', 'Puladas']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ ...kBtn(filtro === k ? 'blue' : 'ghost'), height: 30, padding: '0 10px', textTransform: 'none' }}>{l}</button>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: 'left', color: K.muted }}><th style={{ padding: 6 }}>Contato</th><th style={{ padding: 6 }}>Telefone</th><th style={{ padding: 6 }}>Situação</th><th style={{ padding: 6 }}>Enviada em</th></tr></thead>
            <tbody>
              {b.recipients.map((r: any) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${K.line}` }}>
                  <td style={{ padding: 6 }}><a href={`/contatos/${r.contact_id}`} onClick={e => { e.preventDefault(); navigate(`/contatos/${r.contact_id}`) }} style={{ color: K.link }}>{r.name || r.phone}</a></td>
                  <td style={{ padding: 6 }}>{r.phone}</td>
                  <td style={{ padding: 6 }}>{RECIP[r.status] || r.status}{r.error ? ` (${ERRO[r.error] || r.error})` : ''}{r.replied_at ? ' · respondeu' : ''}</td>
                  <td style={{ padding: 6 }}>{fmtDataHora(r.sent_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!b.recipients.length && <p style={{ color: K.muted, textAlign: 'center' }}>Ninguém nesta lista.</p>}
        </div>
      </div>
    </div>
  )
}

function Multi({ opcoes, valor, onChange, vazio }: { opcoes: [any, string][]; valor: any[]; onChange: (v: any[]) => void; vazio: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {!opcoes.length && <span style={{ fontSize: 13, color: K.muted }}>{vazio}</span>}
      {opcoes.map(([v, l]) => {
        const on = valor.includes(v)
        return <button key={String(v)} type="button" onClick={() => onChange(on ? valor.filter(x => x !== v) : [...valor, v])} style={{ fontFamily: K.font, fontSize: 12.5, padding: '4px 9px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? K.blueDark : K.lineDark}`, background: on ? '#fbe9ee' : '#fff', color: on ? K.blueDark : K.text }}>{l}</button>
      })}
    </div>
  )
}

function NovoDisparo() {
  const navigate = useNavigate()
  const location = useLocation() as any
  const contactIds: number[] = location.state?.contact_ids || []
  const [passo, setPasso] = useState(1)
  // passo 1: escolher pelo CRM (filtros) ou colar/enviar uma lista de números de fora
  const [modo, setModo] = useState<'filtros' | 'lista'>('filtros')
  const [listaTexto, setListaTexto] = useState('')
  const [listaRes, setListaRes] = useState<any>(null)
  const [lendoLista, setLendoLista] = useState(false)
  const listaRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState('')
  const [f, setF] = useState<any>({ stage_ids: [], statuses: [], tag_ids: [], sem_tag_ids: [], user_ids: [], cidade: '', aniversario_mes: false, contact_ids: contactIds })
  const [tipo, setTipo] = useState<'texto' | 'robo'>('texto')
  const [texto, setTexto] = useState('{Oi|Olá} {primeiro_nome}, tudo bem? ')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [flowId, setFlowId] = useState('')
  const [inboxId, setInboxId] = useState<number | null>(null)
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [agendarEm, setAgendarEm] = useState('')
  const [ritmo, setRitmo] = useState({ min: 30, max: 90, limite: 200, inicio: 8, fim: 20, cooldown: 0 })
  const [prev, setPrev] = useState<any>(null)
  const [opt, setOpt] = useState<any>({ pipes: [], tags: [], agents: [], flows: [], inboxes: [] })
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([api.get('/pipelines'), api.get('/tags'), api.get('/agents'), api.get('/flows_options'), api.get('/inboxes')]).then(([p, t, a, fl, i]) => {
      const caixas = i.data.filter((x: any) => ['waha', 'baileys'].includes(x.provider))
      setOpt({ pipes: p.data, tags: t.data, agents: a.data, flows: fl.data, inboxes: caixas })
      if (caixas.length === 1) setInboxId(caixas[0].id)
    }).catch(() => {})
  }, [])
  // quantas pessoas recebem (atualiza ao mexer nos filtros)
  useEffect(() => {
    const t = setTimeout(() => api.post('/broadcasts/preview', { filters: f, text: tipo === 'texto' ? texto : '', cooldown_days: ritmo.cooldown }).then(r => setPrev(r.data)).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [f, texto, tipo, ritmo.cooldown])

  const etapas: [number, string][] = useMemo(() => opt.pipes.filter((p: any) => !p.system).flatMap((p: any) => p.pipeline_stages.filter((s: any) => s.kind === 'normal').map((s: any) => [s.id, `${p.name} › ${s.name}`])), [opt.pipes])
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  const nomeAgente = (a: any) => a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()
  const inbox = opt.inboxes.find((i: any) => i.id === inboxId)

  const disparar = async () => {
    if (!nome.trim()) return toast('warning', 'Dê um nome pro disparo.')
    if (!inboxId) return toast('warning', 'Escolha o número.')
    if (quando === 'agendar' && !agendarEm) return toast('warning', 'Escolha a data e a hora.')
    if (!(await confirmBox(`Disparar para ${prev?.total ?? 0} pessoas?`, `Pelo número ${inbox?.badge_short || ''}, uma mensagem a cada ${ritmo.min} a ${ritmo.max} segundos, até ${ritmo.limite} por dia, das ${ritmo.inicio}h às ${ritmo.fim}h.`, 'Sim, disparar', false))) return
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('data', JSON.stringify({
        name: nome.trim(), inbox_id: inboxId, filters: f, text: tipo === 'texto' ? texto : null, flow_id: tipo === 'robo' ? Number(flowId) || null : null,
        scheduled_at: quando === 'agendar' ? new Date(agendarEm).toISOString() : null,
        min_interval_seconds: ritmo.min, max_interval_seconds: ritmo.max, daily_limit: ritmo.limite, start_hour: ritmo.inicio, end_hour: ritmo.fim, cooldown_days: ritmo.cooldown,
      }))
      if (arquivo && tipo === 'texto') fd.append('attachment', arquivo)
      const { data } = await api.post('/broadcasts', fd, { headers: { 'Content-Type': undefined } })
      navigate(`/disparos/${data.id}`, { replace: true })
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível criar o disparo.') } finally { setEnviando(false) }
  }

  const passos = ['Para quem', 'Mensagem', 'Número', 'Quando']
  const podeSeguir = passo === 1 ? (prev?.total ?? 0) > 0 : passo === 2 ? (tipo === 'texto' ? !!(texto.trim() || arquivo) : !!flowId) : passo === 3 ? !!inboxId : true

  return (
    <div style={{ fontFamily: K.font, color: K.text, maxWidth: 900 }}>
      <button onClick={() => navigate('/disparos')} style={{ ...kBtn('flat'), padding: 0, marginBottom: 10, textTransform: 'none', fontWeight: 400, color: K.muted }}><ChevronLeft size={16} /> Disparos</button>
      <h1 style={{ margin: '0 0 12px', fontSize: 22 }}>Novo disparo</h1>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {passos.map((p, i) => <span key={p} style={{ padding: '5px 12px', borderRadius: 14, fontSize: 13, background: passo === i + 1 ? '#8e2a46' : passo > i + 1 ? '#f0d0d7' : '#fff', color: passo === i + 1 ? '#fff' : K.text, border: `1px solid ${passo === i + 1 ? '#8e2a46' : K.line}` }}>{i + 1}. {p}</span>)}
      </div>

      <div style={card}>
        {passo === 1 && <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={() => { setModo('filtros'); setListaRes(null); set('contact_ids', contactIds) }} style={kBtn(modo === 'filtros' ? 'blue' : 'ghost')}>Filtrar contatos do CRM</button>
            <button onClick={() => { setModo('lista'); setF((x: any) => ({ ...x, stage_ids: [], statuses: [], tag_ids: [], sem_tag_ids: [], user_ids: [], cidade: '', aniversario_mes: false, contact_ids: listaRes?.contact_ids || [-1] })) }} style={kBtn(modo === 'lista' ? 'blue' : 'ghost')}>Lista de números</button>
          </div>
          {modo === 'lista' && <>
            <label style={{ ...lbl, marginTop: 0 }}>Cole os números, um por linha (pode ter o nome antes: "Maria; 14 99999-0000")</label>
            <textarea value={listaTexto} onChange={e => setListaTexto(e.target.value)} rows={8} placeholder={'Maria; 14 99999-0000\n14 98888-1111\nAna Paula, 11 97777-2222'} style={{ ...kInput, height: 'auto', padding: 10, lineHeight: 1.45 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input ref={listaRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async e => { const arq = e.target.files?.[0]; if (arq) setListaTexto(await arq.text()); e.target.value = '' }} />
              <button onClick={() => listaRef.current?.click()} style={kBtn('ghost')}><Paperclip size={14} /> Enviar arquivo .csv ou .txt</button>
              <button disabled={lendoLista || !listaTexto.trim()} onClick={async () => {
                setLendoLista(true)
                try {
                  const { data } = await api.post('/broadcasts/numeros', { texto: listaTexto })
                  setListaRes(data)
                  set('contact_ids', data.contact_ids.length ? data.contact_ids : [-1])
                } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível ler a lista.') } finally { setLendoLista(false) }
              }} style={{ ...kBtn('blue'), opacity: listaTexto.trim() ? 1 : 0.5 }}>{lendoLista ? 'Lendo…' : 'Usar esta lista'}</button>
            </div>
            {listaRes && <div style={{ marginTop: 10, padding: '8px 12px', background: '#fcf0f3', borderRadius: 3, fontSize: 13.5 }}>
              <b>{listaRes.total}</b> número(s) prontos: {listaRes.existentes} já estavam no CRM, {listaRes.criados} novo(s) (com a etiqueta LISTA UPLOAD).
              {listaRes.n_invalidos > 0 && <div style={{ color: '#c62828', marginTop: 4 }}>{listaRes.n_invalidos} linha(s) sem número válido: {listaRes.invalidos.join(' | ')}</div>}
            </div>}
            <p style={{ fontSize: 12.5, color: K.muted, marginBottom: 0 }}>Antes de cada envio o sistema confere se o número tem WhatsApp — quem não tem é pulado sozinho. Quem pediu pra não receber disparos também fica de fora.</p>
          </>}
          {modo === 'filtros' && <>
          {contactIds.length > 0 && <div style={{ padding: '8px 12px', background: '#fcf0f3', borderRadius: 3, fontSize: 13.5, marginBottom: 6 }}>{contactIds.length} pessoa(s) selecionada(s) na lista. <button onClick={() => set('contact_ids', [])} style={{ border: 'none', background: 'none', color: K.link, cursor: 'pointer', fontFamily: K.font }}>Usar filtros em vez disso</button></div>}
          <label style={{ ...lbl, marginTop: 0 }}>Status do Consignado</label>
          <Multi valor={f.statuses} onChange={v => set('statuses', v)} vazio="" opcoes={Object.entries({ ...ACTIVE_STATUS_LABELS, ...INACTIVE_STATUS_LABELS }) as [string, string][]} />
          <label style={lbl}>Etapa de funil</label>
          <Multi valor={f.stage_ids} onChange={v => set('stage_ids', v)} vazio="Nenhum funil" opcoes={etapas} />
          <label style={lbl}>Tem a etiqueta</label>
          <Multi valor={f.tag_ids} onChange={v => set('tag_ids', v)} vazio="Nenhuma etiqueta" opcoes={opt.tags.map((t: any) => [t.id, t.name])} />
          <label style={lbl}>Não tem a etiqueta</label>
          <Multi valor={f.sem_tag_ids} onChange={v => set('sem_tag_ids', v)} vazio="Nenhuma etiqueta" opcoes={opt.tags.map((t: any) => [t.id, t.name])} />
          <label style={lbl}>Carteira de</label>
          <Multi valor={f.user_ids} onChange={v => set('user_ids', v)} vazio="" opcoes={opt.agents.map((a: any) => [a.id, nomeAgente(a)])} />
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}><label style={lbl}>Cidade</label><input value={f.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Qualquer cidade" style={kInput} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, height: 36 }}><input type="checkbox" checked={f.aniversario_mes} onChange={e => set('aniversario_mes', e.target.checked)} /> Só aniversariantes do mês</label>
          </div>
          <p style={{ fontSize: 12.5, color: K.muted, marginBottom: 0 }}>Filtros juntos valem todos ao mesmo tempo. Grupos, contatos bloqueados e quem pediu pra não receber ficam de fora sozinhos.</p>
          </>}
        </>}

        {passo === 2 && <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTipo('texto')} style={kBtn(tipo === 'texto' ? 'blue' : 'ghost')}>Mensagem</button>
            <button onClick={() => setTipo('robo')} style={kBtn(tipo === 'robo' ? 'blue' : 'ghost')}>Robô</button>
          </div>
          {tipo === 'texto' ? <>
            <label style={lbl}>Texto</label>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6} style={{ ...kInput, height: 'auto', padding: 10, lineHeight: 1.45 }} />
            <p style={{ fontSize: 12.5, color: K.muted, margin: '6px 0 0' }}>
              Campos: <code>{'{primeiro_nome}'}</code> <code>{'{nome}'}</code> <code>{'{consultora}'}</code> <code>{'{data_agendamento}'}</code>. Variações: <code>{'{Oi|Olá|Bom dia}'}</code> (cada pessoa recebe uma).
            </p>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" hidden onChange={e => setArquivo(e.target.files?.[0] || null)} />
              <button onClick={() => fileRef.current?.click()} style={kBtn('ghost')}><Paperclip size={14} /> {arquivo ? 'Trocar arquivo' : 'Anexar foto, vídeo ou PDF'}</button>
              {arquivo && <span style={{ fontSize: 13 }}>{arquivo.name} <button onClick={() => setArquivo(null)} title="Tirar arquivo" style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted }}><X size={13} /></button></span>}
            </div>
            {prev?.exemplo && <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 13, color: K.muted }}>Como chega para {prev.exemplo.para}:</span>
              <div style={{ marginTop: 6, padding: 12, background: '#f0d0d7', borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 14, maxWidth: 420 }}>{prev.exemplo.texto}</div>
            </div>}
          </> : <>
            <label style={lbl}>Robô</label>
            <select value={flowId} onChange={e => setFlowId(e.target.value)} style={kInput}>
              <option value="">Escolha o robô…</option>
              {opt.flows.map((fl: any) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
            </select>
            <p style={{ fontSize: 12.5, color: K.muted }}>O robô roda para cada pessoa, no mesmo ritmo do disparo, mesmo que esteja desligado nas automações.</p>
          </>}
        </>}

        {passo === 3 && <>
          <label style={{ ...lbl, marginTop: 0 }}>Por qual número sai</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opt.inboxes.map((i: any) => (
              <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${inboxId === i.id ? i.badge_color : K.line}`, borderRadius: 6, padding: '10px 12px', cursor: 'pointer' }}>
                <input type="radio" checked={inboxId === i.id} onChange={() => setInboxId(i.id)} style={{ accentColor: i.badge_color }} />
                <Chip cor={i.badge_color}>{i.badge_short}</Chip><span>{i.phone_number}</span>
                {i.connected === false && <span style={{ color: '#c62828', fontSize: 12.5 }}>desconectado</span>}
              </label>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: K.muted }}>Dica: se possível use um número separado do atendimento. Se o WhatsApp bloquear, o atendimento continua.</p>
        </>}

        {passo === 4 && <>
          <label style={{ ...lbl, marginTop: 0 }}>Nome do disparo</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Convite coleção nova — sem maleta" style={kInput} />
          <label style={lbl}>Quando</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={quando === 'agora'} onChange={() => setQuando('agora')} /> Agora</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={quando === 'agendar'} onChange={() => setQuando('agendar')} /> Agendar para</label>
            {quando === 'agendar' && <input type="datetime-local" value={agendarEm} onChange={e => setAgendarEm(e.target.value)} style={{ ...kInput, width: 220 }} />}
          </div>
          <label style={lbl}>Ritmo (protege o número)</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
            De <input type="number" min={20} value={ritmo.min} onChange={e => setRitmo({ ...ritmo, min: Number(e.target.value) })} style={{ ...kInput, width: 70 }} />
            a <input type="number" min={20} value={ritmo.max} onChange={e => setRitmo({ ...ritmo, max: Number(e.target.value) })} style={{ ...kInput, width: 70 }} /> segundos entre envios ·
            até <input type="number" min={1} max={1000} value={ritmo.limite} onChange={e => setRitmo({ ...ritmo, limite: Number(e.target.value) })} style={{ ...kInput, width: 80 }} /> por dia ·
            das <input type="number" min={0} max={23} value={ritmo.inicio} onChange={e => setRitmo({ ...ritmo, inicio: Number(e.target.value) })} style={{ ...kInput, width: 60 }} />h
            às <input type="number" min={1} max={24} value={ritmo.fim} onChange={e => setRitmo({ ...ritmo, fim: Number(e.target.value) })} style={{ ...kInput, width: 60 }} />h
          </div>
          <label style={lbl}>Não mandar pra quem recebeu outro disparo nos últimos</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="number" min={0} max={365} value={ritmo.cooldown} onChange={e => setRitmo({ ...ritmo, cooldown: Number(e.target.value) })} style={{ ...kInput, width: 70 }} /> dias (0 = não verificar)</div>
          <div style={{ marginTop: 16, padding: 12, background: '#fcf0f3', borderRadius: 4, fontSize: 14 }}>
            <b>{prev?.total ?? 0}</b> pessoas · número {inbox ? <Chip cor={inbox.badge_color}>{inbox.badge_short}</Chip> : '—'} · com {ritmo.limite} por dia, termina em uns <b>{Math.max(1, Math.ceil((prev?.total ?? 0) / Math.max(1, ritmo.limite)))}</b> dia(s)
          </div>
        </>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>{prev ? <><b>{prev.total}</b> pessoas vão receber{prev.amostra?.length ? `: ${prev.amostra.slice(0, 5).map((a: any) => a.name || a.phone).join(', ')}${prev.total > 5 ? '…' : ''}` : ''}</> : 'Calculando…'}</span>
        <span style={{ flex: 1 }} />
        {passo > 1 && <button onClick={() => setPasso(passo - 1)} style={kBtn('ghost')}>Voltar</button>}
        {passo < 4
          ? <button disabled={!podeSeguir} onClick={() => setPasso(passo + 1)} style={{ ...kBtn('blue'), opacity: podeSeguir ? 1 : 0.5 }}>Continuar</button>
          : <button disabled={enviando} onClick={disparar} style={kBtn('blue')}><Send size={14} /> {quando === 'agendar' ? 'Agendar disparo' : 'Disparar'}</button>}
      </div>
    </div>
  )
}

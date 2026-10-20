import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Pencil, Plus, RefreshCw, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react'
import api from '../api'
import { Switch, toast, confirmBox } from '../components/ui2'
import { K, kBtn, kInput } from '../lib/kommo'

// Construtor do Agente de IA no layout do Kommo: topo "NOME ✎ · Ligado · Cancelar · Salvar", abas
// FONTES · AÇÕES · PERSONA · CONFIGURAÇÕES · PAINEL e, à direita, o "Modo de teste" (conversa de
// prévia com custo em tokens e detalhes: intenção, ações, fontes usadas, lacunas de conhecimento).
/* eslint-disable @typescript-eslint/no-explicit-any */

const ABAS: [string, string][] = [['fontes', 'Fontes'], ['acoes', 'Ações'], ['persona', 'Persona'], ['configuracoes', 'Configurações'], ['painel', 'Painel']]
const WHEN_PRESETS: Record<string, string[]> = {
  wants: ['comprar', 'revender', 'obter suporte', 'pedir reembolso', 'falar com um atendente humano'],
  asks_about: ['disponibilidade', 'prazo de entrega', 'preço', 'política de troca', 'status do pedido', 'acerto da maleta'],
  sentiment: ['frustrado', 'confuso', 'feliz', 'neutro', 'triste'],
  provides: ['e-mail', 'telefone', 'nome', 'endereço', 'CPF'],
  contains: ['saudação', 'palavrão', 'link'],
}
const TEXT_DOS = ['exact_message', 'reply_info', 'bring_up', 'dont_mention', 'try_bring_up']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SOURCE_KINDS: Record<string, string> = { text: 'Texto', faq: 'Perguntas e respostas', url: 'Site', file: 'Arquivo' }
const box: CSSProperties = { background: '#fff', border: `1px solid ${K.line}`, borderRadius: 4, padding: '16px 18px', marginBottom: 14 }
const lbl: CSSProperties = { display: 'grid', gap: 6, fontSize: 14, color: K.muted, marginBottom: 14 }
const chip = (on: boolean): CSSProperties => ({ fontFamily: K.font, fontSize: 13, padding: '4px 10px', borderRadius: 14, cursor: 'pointer', border: `1px solid ${on ? K.blueDark : K.lineDark}`, background: on ? '#fbe9ee' : '#fff', color: on ? K.blueDark : K.text })
const newId = (list: any[]) => { let n = list.length + 1; while (list.some(a => a.id === `a${n}`)) n++; return `a${n}` }

function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 4, padding: '22px 24px', position: 'relative', fontFamily: K.font, color: K.text }}>
        <button title="Fechar" onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={18} /></button>
        <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 400 }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

// --- Fontes ----------------------------------------------------------------------------------------
function NovaFonte({ agentId, onClose, onSaved }: { agentId: number; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [pairs, setPairs] = useState([{ q: '', a: '' }])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const salvar = async () => {
    setBusy(true)
    try {
      if (kind === 'file') {
        const fd = new FormData(); fd.append('kind', 'file'); fd.append('title', title); if (file) fd.append('file', file)
        await api.post(`/ai_agents/${agentId}/sources`, fd)
      } else await api.post(`/ai_agents/${agentId}/sources`, { kind, title, content, url, pairs })
      toast('success', 'Fonte adicionada.'); onSaved()
    } catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível adicionar.') } finally { setBusy(false) }
  }
  return (
    <Modal title="Adicionar nova fonte de conhecimento" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{Object.entries(SOURCE_KINDS).map(([id, l]) => <button key={id} aria-pressed={kind === id} onClick={() => setKind(id)} style={chip(kind === id)}>{l}</button>)}</div>
      {kind !== 'url' && <label style={lbl}>Título<input aria-label="Título da fonte" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Como funciona a maleta" style={kInput} /></label>}
      {kind === 'text' && <label style={lbl}>Conteúdo<textarea aria-label="Conteúdo da fonte" value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="Escreva aqui as informações que o agente pode usar para responder." style={{ ...kInput, height: 'auto', padding: 10 }} /></label>}
      {kind === 'url' && <label style={lbl}>Endereço do site<input aria-label="Endereço do site" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={kInput} /><span style={{ fontSize: 12.5 }}>O texto da página é copiado agora; use "Sincronizar" depois de mudar o site.</span></label>}
      {kind === 'file' && <label style={lbl}>Arquivo de texto (.txt, .md, .csv, .json)<input aria-label="Arquivo" type="file" accept=".txt,.md,.csv,.json,text/*" onChange={e => setFile(e.target.files?.[0] || null)} /></label>}
      {kind === 'faq' && (<>
        {pairs.map((p, i) => (
          <div key={i} style={{ border: `1px solid ${K.line}`, borderRadius: 3, padding: 10, marginBottom: 8, display: 'grid', gap: 6 }}>
            <input aria-label={`Pergunta ${i + 1}`} value={p.q} onChange={e => setPairs(pairs.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} placeholder="Pergunta" style={kInput} />
            <textarea aria-label={`Resposta ${i + 1}`} value={p.a} onChange={e => setPairs(pairs.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} rows={2} placeholder="Resposta" style={{ ...kInput, height: 'auto', padding: 8 }} />
          </div>
        ))}
        <button onClick={() => setPairs([...pairs, { q: '', a: '' }])} style={kBtn('flat', { textTransform: 'none', color: K.link, padding: 0 })}><Plus size={14} /> Adicionar pergunta</button>
      </>)}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}><button onClick={onClose} style={kBtn('flat')}>Cancelar</button><button onClick={salvar} disabled={busy} style={kBtn('blue')}>{busy ? 'Salvando…' : 'Adicionar'}</button></div>
    </Modal>
  )
}

function Fontes({ agent, reload }: { agent: any; reload: () => void }) {
  const [nova, setNova] = useState(false)
  const [edit, setEdit] = useState<any>(null)
  const salvarEdit = async () => { try { await api.put(`/ai_agent_sources/${edit.id}`, { title: edit.title, content: edit.content }); setEdit(null); reload() } catch (e: any) { toast('error', e.response?.data?.error || 'Erro ao salvar.') } }
  const excluir = async (s: any) => { if (await confirmBox('Excluir a fonte?', s.title)) { await api.delete(`/ai_agent_sources/${s.id}`); reload() } }
  const sync = async (s: any) => { try { await api.post(`/ai_agent_sources/${s.id}/sync`); toast('success', 'Site sincronizado.'); reload() } catch (e: any) { toast('error', e.response?.data?.error || 'Falhou.') } }
  return (
    <div>
      <p style={{ margin: '0 0 14px', color: K.muted }}>Treine o agente com as informações da empresa. Ele só responde com o que estiver aqui — o que faltar aparece como <b>lacuna de conhecimento</b> no Modo de teste e no Painel.</p>
      {agent.sources.map((s: any) => (
        <div key={s.id} data-testid="fonte" style={{ ...box, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 15.5 }}>{s.title}</b><span style={{ fontSize: 12, color: K.muted, border: `1px solid ${K.line}`, borderRadius: 3, padding: '1px 6px' }}>{SOURCE_KINDS[s.kind] || s.kind}</span><span style={{ fontSize: 12.5, color: K.muted }}>{s.chars.toLocaleString('pt-BR')} caracteres</span></div>
            <div style={{ color: K.muted, fontSize: 14, marginTop: 6, whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 60 }}>{s.content.slice(0, 260)}</div>
          </div>
          {s.kind === 'url' && <button title="Sincronizar" onClick={() => sync(s)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><RefreshCw size={16} /></button>}
          <button title="Editar fonte" onClick={() => setEdit({ ...s })} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Pencil size={16} /></button>
          <button title="Excluir fonte" onClick={() => excluir(s)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={16} /></button>
        </div>
      ))}
      <button onClick={() => setNova(true)} style={{ ...box, width: '100%', borderStyle: 'dashed', color: K.link, cursor: 'pointer', fontFamily: K.font, fontSize: 15, textAlign: 'center' }}>+ Adicionar nova fonte de conhecimento</button>
      {nova && <NovaFonte agentId={agent.id} onClose={() => setNova(false)} onSaved={() => { setNova(false); reload() }} />}
      {edit && (
        <Modal title="Editar fonte" onClose={() => setEdit(null)} width={680}>
          <label style={lbl}>Título<input aria-label="Título da fonte" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} style={kInput} /></label>
          <label style={lbl}>Conteúdo<textarea aria-label="Conteúdo da fonte" value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} rows={14} style={{ ...kInput, height: 'auto', padding: 10 }} /></label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button onClick={() => setEdit(null)} style={kBtn('flat')}>Cancelar</button><button onClick={salvarEdit} style={kBtn('blue')}>Salvar</button></div>
        </Modal>
      )}
    </div>
  )
}

// --- Ações (QUANDO → FAÇA → Mais) ------------------------------------------------------------------
function WhenRow({ w, i, opts, onChange, onRemove }: any) {
  const set = (p: any) => onChange({ ...w, ...p })
  return (
    <div data-testid="quando" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
      <select aria-label={`Condição ${i + 1}`} value={w.type} onChange={e => set({ type: e.target.value, value: e.target.value === 'hours' ? { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } : e.target.value === 'no_reply' ? 60 : '' })} style={{ ...kInput, width: 260 }}>
        {Object.entries(opts.when_types).map(([id, l]: any) => <option key={id} value={id}>{l}</option>)}
      </select>
      {WHEN_PRESETS[w.type] && (<>
        <input aria-label={`Valor da condição ${i + 1}`} list={`wl-${w.type}`} value={w.value || ''} onChange={e => set({ value: e.target.value })} placeholder="escolha ou digite" style={{ ...kInput, flex: 1, minWidth: 160 }} />
        <datalist id={`wl-${w.type}`}>{WHEN_PRESETS[w.type].map(p => <option key={p} value={p} />)}</datalist>
      </>)}
      {w.type === 'no_reply' && <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input aria-label="Minutos sem resposta" type="number" min={1} max={1439} value={w.value} onChange={e => set({ value: Number(e.target.value) })} style={{ ...kInput, width: 90 }} /> minutos</span>}
      {w.type === 'hours' && (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {DIAS.map((d, n) => { const on = (w.value?.days || []).includes(n); return <button key={d} aria-pressed={on} onClick={() => set({ value: { ...w.value, days: on ? w.value.days.filter((x: number) => x !== n) : [...(w.value.days || []), n] } })} style={chip(on)}>{d}</button> })}
          <input aria-label="Das" type="time" value={w.value?.from || ''} onChange={e => set({ value: { ...w.value, from: e.target.value } })} style={{ ...kInput, width: 110 }} /> às
          <input aria-label="Até as" type="time" value={w.value?.to || ''} onChange={e => set({ value: { ...w.value, to: e.target.value } })} style={{ ...kInput, width: 110 }} />
        </span>
      )}
      <button title="Remover condição" onClick={onRemove} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={15} /></button>
    </div>
  )
}

function DoRow({ d, i, opts, sources, onChange, onRemove }: any) {
  const set = (value: any) => onChange({ ...d, value })
  const v = d.value || {}
  const stages = opts.pipelines.flatMap((p: any) => p.stages.map((s: any) => ({ id: s.id, label: `${p.name} › ${s.name}` })))
  return (
    <div data-testid="faca" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 8 }}>
      <select aria-label={`Passo ${i + 1}`} value={d.type} onChange={e => onChange({ type: e.target.value, value: TEXT_DOS.includes(e.target.value) ? '' : {} })} style={{ ...kInput, width: 260 }}>
        {Object.entries(opts.do_types).map(([id, l]: any) => <option key={id} value={id}>{l}</option>)}
      </select>
      <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TEXT_DOS.includes(d.type) && <textarea aria-label={`Texto do passo ${i + 1}`} value={typeof d.value === 'string' ? d.value : ''} onChange={e => set(e.target.value)} rows={2} placeholder={d.type === 'exact_message' ? 'Mensagem enviada exatamente assim' : 'Descreva'} style={{ ...kInput, height: 'auto', padding: 8, flex: 1 }} />}
        {(d.type === 'transfer' || d.type === 'change_owner') && <select aria-label="Usuário" value={v.user_id || ''} onChange={e => set({ user_id: e.target.value ? Number(e.target.value) : null })} style={kInput}><option value="">{d.type === 'transfer' ? 'Responsável do lead' : 'Escolha o usuário…'}</option>{opts.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        {d.type === 'use_source' && <select aria-label="Fonte" value={v.source_id || ''} onChange={e => set({ source_id: Number(e.target.value) })} style={kInput}><option value="">Escolha a fonte…</option>{sources.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
        {(d.type === 'ask_for' || d.type === 'set_field') && <select aria-label="Campo" value={v.field_key || ''} onChange={e => { const f = opts.fields.find((x: any) => x.key === e.target.value); set({ ...v, field_key: e.target.value, label: f?.label }) }} style={{ ...kInput, flex: 1 }}><option value="">Escolha o campo…</option>{opts.fields.map((f: any) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>}
        {d.type === 'set_field' && <input aria-label="Valor fixo" value={v.value || ''} onChange={e => set({ ...v, value: e.target.value })} placeholder="valor fixo (vazio = o que o cliente informar)" style={{ ...kInput, flex: 1 }} />}
        {d.type === 'add_task' && (<>
          <input aria-label="Título da tarefa" value={v.titulo || ''} onChange={e => set({ ...v, titulo: e.target.value })} placeholder="Ex.: Ligar para a revendedora" style={{ ...kInput, flex: 1 }} />
          <select aria-label="Prazo" value={v.deadline || 'now'} onChange={e => set({ ...v, deadline: e.target.value })} style={{ ...kInput, width: 170 }}><option value="now">Agora</option><option value="end_of_day">Fim do dia</option><option value="1d">Amanhã</option><option value="3d">Em 3 dias</option></select>
        </>)}
        {d.type === 'manage_tags' && (<>
          <select aria-label="Adicionar ou remover" value={v.mode || 'add'} onChange={e => set({ ...v, mode: e.target.value })} style={{ ...kInput, width: 130 }}><option value="add">Adicionar</option><option value="remove">Remover</option></select>
          {opts.tags.map((t: any) => { const on = (v.tag_ids || []).includes(t.id); return <button key={t.id} aria-pressed={on} onClick={() => set({ ...v, tag_ids: on ? v.tag_ids.filter((x: number) => x !== t.id) : [...(v.tag_ids || []), t.id] })} style={chip(on)}>{t.name}</button> })}
        </>)}
        {d.type === 'change_stage' && <select aria-label="Etapa" value={v.target || ''} onChange={e => set({ target: e.target.value, label: stages.find((s: any) => String(s.id) === e.target.value)?.label })} style={{ ...kInput, flex: 1 }}><option value="">Escolha a etapa…</option>{stages.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
        {d.type === 'start_bot' && <select aria-label="Robô" value={v.flow_id || ''} onChange={e => set({ flow_id: Number(e.target.value), label: opts.bots.find((b: any) => String(b.id) === e.target.value)?.name })} style={{ ...kInput, flex: 1 }}><option value="">Escolha o robô…</option>{opts.bots.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        {d.type === 'send_file' && <input aria-label="Link do arquivo" value={v.url || ''} onChange={e => set({ url: e.target.value })} placeholder="https://… (catálogo em PDF, foto…)" style={{ ...kInput, flex: 1 }} />}
      </div>
      <button title="Remover passo" onClick={onRemove} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', marginTop: 8 }}><Trash2 size={15} /></button>
    </div>
  )
}

function Acoes({ actions, setActions, opts, sources }: any) {
  const upd = (i: number, p: any) => setActions(actions.map((a: any, j: number) => j === i ? { ...a, ...p } : a))
  return (
    <div>
      <p style={{ margin: '0 0 14px', color: K.muted }}>Cada ação tem QUANDO (até 5 condições), FAÇA (até 5 passos) e Mais (instruções extras). O agente sempre responde com texto e executa os passos quando a situação acontece. Até 20 ações.</p>
      {actions.map((a: any, i: number) => (
        <div key={a.id} data-testid="acao" style={box}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input aria-label={`Nome da ação ${i + 1}`} value={a.name || ''} onChange={e => upd(i, { name: e.target.value })} placeholder={`Ação ${i + 1}`} style={{ ...kInput, flex: 1, fontWeight: 700 }} />
            <button title="Excluir ação" onClick={() => setActions(actions.filter((_: any, j: number) => j !== i))} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <b style={{ color: '#c8506a', fontSize: 13, letterSpacing: '.05em' }}>QUANDO</b>
            <select aria-label="Lógica" value={a.logic || 'all'} onChange={e => upd(i, { logic: e.target.value })} style={{ ...kInput, width: 220, height: 30 }}><option value="all">todas as condições</option><option value="any">qualquer condição</option></select>
          </div>
          {a.when.map((w: any, j: number) => <WhenRow key={j} w={w} i={j} opts={opts} onChange={(nw: any) => upd(i, { when: a.when.map((x: any, k: number) => k === j ? nw : x) })} onRemove={() => upd(i, { when: a.when.filter((_: any, k: number) => k !== j) })} />)}
          {a.when.length < 5 && <button onClick={() => upd(i, { when: [...a.when, { type: 'wants', value: '' }] })} style={kBtn('flat', { textTransform: 'none', color: K.link, padding: 0, height: 28 })}><Plus size={14} /> Condição</button>}
          <div style={{ marginTop: 12, marginBottom: 8 }}><b style={{ color: '#0d8a5f', fontSize: 13, letterSpacing: '.05em' }}>FAÇA</b></div>
          {a.do.map((d: any, j: number) => <DoRow key={j} d={d} i={j} opts={opts} sources={sources} onChange={(nd: any) => upd(i, { do: a.do.map((x: any, k: number) => k === j ? nd : x) })} onRemove={() => upd(i, { do: a.do.filter((_: any, k: number) => k !== j) })} />)}
          {a.do.length < 5 && <button onClick={() => upd(i, { do: [...a.do, { type: 'reply_info', value: '' }] })} style={kBtn('flat', { textTransform: 'none', color: K.link, padding: 0, height: 28 })}><Plus size={14} /> Passo</button>}
          <label style={{ ...lbl, marginTop: 12, marginBottom: 0 }}>Mais (instruções extras)<textarea aria-label={`Mais da ação ${i + 1}`} value={a.more || ''} onChange={e => upd(i, { more: e.target.value })} rows={2} placeholder="Ex.: só continue quando a cliente tiver passado o e-mail" style={{ ...kInput, height: 'auto', padding: 8 }} /></label>
        </div>
      ))}
      {actions.length < 20 && <button onClick={() => setActions([...actions, { id: newId(actions), name: '', logic: 'all', when: [{ type: 'wants', value: '' }], do: [{ type: 'reply_info', value: '' }], more: '' }])} style={{ ...box, width: '100%', borderStyle: 'dashed', color: K.link, cursor: 'pointer', fontFamily: K.font, fontSize: 15 }}>+ Adicionar ação</button>}
    </div>
  )
}

// --- Persona -----------------------------------------------------------------------------------------
function Persona({ p, setP }: any) {
  const set = (k: string, v: any) => setP({ ...p, [k]: v })
  const radio = (k: string, opts: [string, string, string][]) => (
    <div style={{ display: 'grid', gap: 6 }}>{opts.map(([id, l, d]) => <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', color: K.text, cursor: 'pointer' }}><input type="radio" name={k} checked={p[k] === id} onChange={() => set(k, id)} /> <b style={{ fontWeight: 400 }}>{l}</b> <span style={{ color: K.muted, fontSize: 13 }}>{d}</span></label>)}</div>
  )
  const g: string[] = p.guidelines || []
  return (
    <div>
      <div style={box}>
        <label style={lbl}>Papel e personalidade <span style={{ fontSize: 12.5 }}>{(p.role || '').length}/1500</span>
          <textarea aria-label="Papel e personalidade" maxLength={1500} value={p.role || ''} onChange={e => set('role', e.target.value)} rows={5} placeholder="Ex.: Você é a Clara IA, consultora simpática da Clara Ferreira Semijoias. Ajuda revendedoras a entender a maleta consignada e o acerto." style={{ ...kInput, height: 'auto', padding: 10 }} />
        </label>
        <div className="k-persona-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          <div><div style={{ ...lbl, marginBottom: 6 }}>Tom de voz</div>{radio('tone', [['casual', 'Casual', 'descontraído e informal'], ['friendly', 'Amigável', 'alegre e bem informal'], ['professional', 'Profissional', 'educado e formal']])}</div>
          <div><div style={{ ...lbl, marginBottom: 6 }}>Tamanho das respostas</div>{radio('length', [['short', 'Curta', '100–200 caracteres'], ['medium', 'Média', '150–250 caracteres'], ['long', 'Longa', '200–300 caracteres']])}</div>
          <div>
            <label style={lbl}>Idioma das respostas<select aria-label="Idioma das respostas" value={p.language || 'auto'} onChange={e => set('language', e.target.value)} style={kInput}><option value="auto">Detectar automaticamente</option><option value="português do Brasil">Português</option><option value="espanhol">Espanhol</option><option value="inglês">Inglês</option></select></label>
            <label style={lbl}>Atraso antes de responder (segundos)<input aria-label="Atraso antes de responder" type="number" min={1} max={86400} value={p.delay_seconds ?? 10} onChange={e => set('delay_seconds', Number(e.target.value))} style={kInput} /><span style={{ fontSize: 12.5 }}>Espera a cliente terminar de mandar várias mensagens seguidas.</span></label>
          </div>
        </div>
      </div>
      <div style={box}>
        <div style={{ ...lbl, marginBottom: 8 }}>Diretrizes (até 50, 300 caracteres cada)</div>
        {g.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input aria-label={`Diretriz ${i + 1}`} maxLength={300} value={t} onChange={e => set('guidelines', g.map((x, j) => j === i ? e.target.value : x))} style={kInput} />
            <button title="Remover diretriz" onClick={() => set('guidelines', g.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={15} /></button>
          </div>
        ))}
        {g.length < 50 && <button onClick={() => set('guidelines', [...g, ''])} style={kBtn('flat', { textTransform: 'none', color: K.link, padding: 0 })}><Plus size={14} /> Adicionar diretriz</button>}
      </div>
    </div>
  )
}

// --- Configurações -------------------------------------------------------------------------------------
function Config({ channels, setChannels, s, setS, opts }: any) {
  const setC = (i: number, p: any) => setChannels(channels.map((c: any, j: number) => j === i ? { ...c, ...p } : c))
  return (
    <div>
      <div style={box}>
        <b style={{ fontSize: 15.5 }}>Canais e etapas</b>
        <p style={{ margin: '4px 0 12px', color: K.muted, fontSize: 14 }}>O agente responde mensagens que chegam nestes canais, para leads nestas etapas (sem etapa marcada = todas). Ele continua na conversa mesmo se o lead mudar de etapa. Cada etapa lança só um agente.</p>
        {channels.map((c: any, i: number) => (
          <div key={i} data-testid="canal" style={{ border: `1px solid ${K.line}`, borderRadius: 3, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select aria-label={`Canal ${i + 1}`} value={c.inbox_id || ''} onChange={e => setC(i, { inbox_id: Number(e.target.value) })} style={{ ...kInput, flex: 1 }}><option value="">Escolha o canal (WhatsApp)…</option>{opts.inboxes.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <button title="Remover canal" onClick={() => setChannels(channels.filter((_: any, j: number) => j !== i))} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={15} /></button>
            </div>
            {opts.pipelines.map((p: any) => (
              <div key={p.id} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: K.muted, marginBottom: 4 }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{p.stages.map((st: any) => { const on = (c.stage_ids || []).includes(st.id); return <button key={st.id} aria-pressed={on} onClick={() => setC(i, { stage_ids: on ? c.stage_ids.filter((x: number) => x !== st.id) : [...(c.stage_ids || []), st.id] })} style={chip(on)}>{st.name}</button> })}</div>
              </div>
            ))}
          </div>
        ))}
        <button onClick={() => setChannels([...channels, { inbox_id: opts.inboxes[0]?.id || null, stage_ids: [] }])} style={kBtn('ghost', { textTransform: 'none', fontSize: 14 })}><Plus size={14} /> Adicionar canal</button>
      </div>
      <div style={box}>
        <b style={{ fontSize: 15.5 }}>Mensagens de voz e imagens</b>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}><Switch on={s.voice !== false} onChange={() => setS({ ...s, voice: s.voice === false })} /> Responder a mensagens de voz (o áudio é transcrito pela OpenAI)</label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}><Switch on={s.images !== false} onChange={() => setS({ ...s, images: s.images === false })} /> Entender imagens (a foto é descrita pela OpenAI)</label>
      </div>
      <div style={box}>
        <b style={{ fontSize: 15.5 }}>Transferência para a equipe</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 10 }}>
          <label style={lbl}>Transferir para<select aria-label="Transferir para" value={s.transfer_user_id || ''} onChange={e => setS({ ...s, transfer_user_id: e.target.value ? Number(e.target.value) : null })} style={kInput}><option value="">Responsável do lead</option>{opts.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label style={lbl}>Limite de respostas por conversa<input aria-label="Limite de respostas" type="number" min={0} value={s.max_replies || 0} onChange={e => setS({ ...s, max_replies: Number(e.target.value) })} style={kInput} /><span style={{ fontSize: 12.5 }}>0 = sem limite. Ao chegar no limite, transfere.</span></label>
        </div>
        <label style={lbl}>Mensagem ao transferir<input aria-label="Mensagem ao transferir" value={s.transfer_message || ''} onChange={e => setS({ ...s, transfer_message: e.target.value })} placeholder="Vou te passar para uma pessoa da nossa equipe, só um instante! 😊" style={kInput} /></label>
      </div>
    </div>
  )
}

// --- Painel ----------------------------------------------------------------------------------------------
function Painel({ id }: { id: number }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get(`/ai_agents/${id}/dashboard`).then(r => setD(r.data)).catch(() => {}) }, [id])
  if (!d) return null
  const stat = (l: string, v: any) => <div style={{ ...box, marginBottom: 0 }}><div style={{ fontSize: 12.5, color: K.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>{l}</div><div style={{ fontSize: 28, marginTop: 4 }}>{v}</div></div>
  return (
    <div>
      <p style={{ margin: '0 0 12px', color: K.muted }}>Últimos 7 dias.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        {stat('Leads únicos', d.unique_leads)}{stat('Conversas respondidas', d.answered)}{stat('Perguntas sem resposta', d.gaps)}
        {stat('Taxa de transferência', `${d.handover_rate}%`)}{stat('Tempo médio de resposta', d.avg_ms ? `${(d.avg_ms / 1000).toFixed(1).replace('.', ',')} s` : '—')}
        {stat('Leads no fim de semana', d.weekend_leads)}{stat('Conversas no fim de semana', d.weekend_conversations)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={box}><b>Conversas por canal</b>{d.por_canal.length ? d.por_canal.map((c: any) => <div key={c.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${K.line}` }}><span>{c.nome}</span><b>{c.n}</b></div>) : <p style={{ color: K.muted }}>Nenhuma conversa ainda.</p>}</div>
        <div style={box}><b>Uso de tokens por tipo de mensagem</b>
          {[['Texto', d.tokens_text], ['Voz', d.tokens_voice], ['Modo de teste', d.tokens_test]].map(([l, n]) => <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${K.line}` }}><span>{l}</span><b>{Number(n).toLocaleString('pt-BR')}</b></div>)}
        </div>
        <div style={box}><b>Últimas lacunas de conhecimento</b>{d.lacunas.length ? d.lacunas.map((g: any, i: number) => <div key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${K.line}`, fontSize: 14 }}>{g.pergunta}</div>) : <p style={{ color: K.muted }}>Nenhuma. 🎉</p>}</div>
      </div>
    </div>
  )
}

// --- Modo de teste --------------------------------------------------------------------------------------
function Teste({ id, dirty }: { id: number; dirty: boolean }) {
  const [msgs, setMsgs] = useState<any[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [ice, setIce] = useState<string[]>([])
  const [detalhes, setDetalhes] = useState(true)
  const [fim, setFim] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { api.post(`/ai_agents/${id}/icebreakers`).then(r => setIce(r.data.icebreakers)).catch(() => {}) }, [id])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])
  const enviar = async (t: string) => {
    if (!t.trim() || busy || dirty || fim) return
    const hist = [...msgs, { role: 'user', content: t.trim() }]
    setMsgs(hist); setText(''); setBusy(true)
    try {
      const { data } = await api.post(`/ai_agents/${id}/test`, { messages: hist.map(m => ({ role: m.role, content: m.content })) })
      setMsgs([...hist, { role: 'assistant', content: data.reply || '(o agente não responde nesse caso)', tokens: data.tokens, details: data.details, transferred: data.transferred }])
      if (data.transferred) setFim(true)
    } catch (e: any) { setMsgs([...hist, { role: 'assistant', content: e.response?.data?.error || 'Erro no teste.', error: true }]) } finally { setBusy(false) }
  }
  const det = (l: string, items: string[] | undefined, ok = true) => items?.length ? <div style={{ fontSize: 12.5, marginTop: 3 }}><span style={{ color: ok ? '#0d8a5f' : '#e5534b' }}>{ok ? '✓' : 'ⓘ'}</span> <b>{l}:</b> {items.join(' · ')}</div> : null
  return (
    <aside className="k-ai-test" aria-label="Modo de teste" style={{ width: 380, flex: 'none', borderLeft: `1px solid ${K.line}`, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${K.line}` }}>
        <Sparkles size={16} color="#c8506a" /><b style={{ flex: 1 }}>Modo de teste</b>
        <button title="Mostrar ou esconder detalhes" onClick={() => setDetalhes(v => !v)} style={kBtn('flat', { textTransform: 'none', fontSize: 12.5, height: 28, padding: '0 6px', color: K.muted })}>{detalhes ? 'Esconder detalhes' : 'Mostrar detalhes'}</button>
        <button title="Reiniciar" onClick={() => { setMsgs([]); setFim(false) }} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><RotateCcw size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, background: '#f7f8fa', minHeight: 260 }}>
        {dirty && <div style={{ background: '#fff7e6', border: '1px solid #f0c36d', borderRadius: 4, padding: 10, fontSize: 13.5, marginBottom: 10 }}>Salve as alterações para testar a versão nova do agente.</div>}
        {!msgs.length && <div style={{ textAlign: 'center', color: K.muted, fontSize: 14, marginTop: 30 }}>Mande uma mensagem como se fosse uma cliente.<div style={{ display: 'grid', gap: 6, marginTop: 14 }}>{ice.map(q => <button key={q} onClick={() => enviar(q)} disabled={dirty} style={{ ...chip(false), borderRadius: 16, padding: '6px 12px' }}>{q}</button>)}</div></div>}
        {msgs.map((m, i) => (
          <div key={i} data-testid={m.role === 'assistant' ? 'teste-resposta' : 'teste-pergunta'} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '86%', background: m.role === 'user' ? '#fbe3e9' : m.error ? '#fdecea' : '#fff', border: `1px solid ${K.line}`, borderRadius: 10, padding: '8px 11px', fontSize: 14.5, whiteSpace: 'pre-wrap' }}>
              {m.content}
              {m.role === 'assistant' && m.tokens != null && <div style={{ fontSize: 12, color: K.muted, marginTop: 4 }}>{m.tokens} tokens</div>}
              {m.role === 'assistant' && detalhes && m.details && (<div style={{ borderTop: `1px solid ${K.line}`, marginTop: 6, paddingTop: 4 }}>
                {det('Intenção identificada', m.details.intent ? [m.details.intent] : [])}
                {det('Ações concluídas', m.details.actions_completed)}
                {det('Fontes usadas', m.details.sources_used)}
                {det('Lacunas de conhecimento', m.details.knowledge_gaps, false)}
                {m.transferred && <div style={{ fontSize: 12.5, marginTop: 3, color: '#b26a00' }}>↪ Transferido para a equipe — reinicie para testar de novo.</div>}
              </div>)}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: K.muted, fontSize: 13 }}>digitando…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={e => { e.preventDefault(); enviar(text) }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${K.line}` }}>
        <input aria-label="Mensagem de teste" value={text} onChange={e => setText(e.target.value)} disabled={dirty || fim} placeholder={fim ? 'Conversa transferida' : 'Escreva uma mensagem…'} style={{ ...kInput, flex: 1 }} />
        <button title="Enviar" type="submit" disabled={busy || dirty || fim || !text.trim()} style={kBtn('blue', { padding: '0 12px' })}><Send size={15} /></button>
      </form>
    </aside>
  )
}

// --- página ---------------------------------------------------------------------------------------------
export default function AgenteIAEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const aba = ABAS.some(([a]) => a === sp.get('aba')) ? sp.get('aba')! : 'fontes'
  const [agent, setAgent] = useState<any>(null)
  const [opts, setOpts] = useState<any>(null)
  const [name, setName] = useState('')
  const [editName, setEditName] = useState(false)
  const [persona, setPersona] = useState<any>({})
  const [actions, setActions] = useState<any[]>([])
  const [settings, setSettings] = useState<any>({})
  const [channels, setChannels] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const snap = useRef('')
  const load = async () => {
    const { data } = await api.get(`/ai_agents/${id}`)
    setAgent(data); setName(data.name); setPersona(data.persona); setActions(data.actions); setSettings(data.settings); setChannels(data.channels)
    snap.current = JSON.stringify([data.name, data.persona, data.actions, data.settings, data.channels])
  }
  const reloadSources = async () => { const { data } = await api.get(`/ai_agents/${id}`); setAgent((a: any) => ({ ...a, sources: data.sources })) }
  useEffect(() => { load().catch(() => navigate('/agente-ia')); api.get('/ai_agents/options').then(r => setOpts(r.data)).catch(() => {}) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => !!agent && JSON.stringify([name, persona, actions, settings, channels]) !== snap.current, [agent, name, persona, actions, settings, channels])

  const salvar = async (extra: any = {}) => {
    setSaving(true)
    try {
      const { data } = await api.put(`/ai_agents/${id}`, { name, persona, actions, settings, channels, ...extra })
      setAgent((a: any) => ({ ...a, ...data })); setActions(data.actions); setPersona(data.persona); setSettings(data.settings); setChannels(data.channels)
      snap.current = JSON.stringify([data.name, data.persona, data.actions, data.settings, data.channels])
      toast('success', extra.active === true ? 'Agente ligado.' : extra.active === false ? 'Agente desligado.' : 'Agente salvo.')
      return true
    } catch (e: any) {
      const d = e.response?.data
      toast('error', d?.message || d?.error || 'Não foi possível salvar.')
      if (d?.error === 'sem_canal') setSp({ aba: 'configuracoes' })
      return false
    } finally { setSaving(false) }
  }
  const cancelar = async () => { if (!dirty || await confirmBox('Descartar as alterações?', 'O que não foi salvo será perdido.')) navigate('/agente-ia') }
  if (!agent || !opts) return null
  const tabSt = (on: boolean): CSSProperties => ({ border: 'none', background: 'none', padding: '0 2px', height: 48, borderBottom: on ? `3px solid ${K.blue}` : '3px solid transparent', color: on ? K.text : K.muted, fontFamily: K.font, fontSize: 14, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' })

  return (
    <div className="k-fullbleed k-ai-editor" style={{ margin: -24, height: 'calc(100vh - var(--top-h, 0px))', minHeight: 600, background: K.bg, fontFamily: K.font, color: K.text, display: 'flex', flexDirection: 'column' }}>
      <div className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', flexWrap: 'wrap' }}>
        {editName
          ? <input aria-label="Nome do agente" autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={() => setEditName(false)} onKeyDown={e => e.key === 'Enter' && setEditName(false)} style={{ ...kInput, width: 260, fontWeight: 700 }} />
          : <button onClick={() => setEditName(true)} style={{ border: 'none', background: 'none', fontFamily: K.font, fontSize: 16, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: K.text, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>{name} <Pencil size={14} /></button>}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: K.muted, fontSize: 14 }}>{agent.active ? 'Ligado' : 'Desligado'}<Switch on={agent.active} onChange={() => salvar({ active: !agent.active })} /></label>
        <button onClick={cancelar} style={kBtn('flat', { color: K.muted })}>Cancelar</button>
        <button onClick={() => salvar()} disabled={saving} style={kBtn('blue')}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
      <div className="k-ai-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div role="tablist" style={{ display: 'flex', gap: 22, padding: '0 24px', background: '#fff', borderBottom: `1px solid ${K.line}`, overflowX: 'auto' }}>
            {ABAS.map(([a, l]) => <button key={a} role="tab" aria-selected={aba === a} onClick={() => setSp({ aba: a })} style={tabSt(aba === a)}>{l}</button>)}
          </div>
          <div style={{ padding: 24, maxWidth: 980 }}>
            {aba === 'fontes' && <Fontes agent={agent} reload={reloadSources} />}
            {aba === 'acoes' && <Acoes actions={actions} setActions={setActions} opts={opts} sources={agent.sources} />}
            {aba === 'persona' && <Persona p={persona} setP={setPersona} />}
            {aba === 'configuracoes' && <Config channels={channels} setChannels={setChannels} s={settings} setS={setSettings} opts={opts} />}
            {aba === 'painel' && <Painel id={agent.id} />}
          </div>
        </div>
        <Teste id={agent.id} dirty={dirty} />
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import api from '../api'
import { Modal } from '../components/ui'
import { Switch, confirmBox, toast } from '../components/ui2'
import { useContactFields } from '../composables/useContactFields'
import { K, STAGE_COLORS, ACTIONS, TIPOS_TAREFA, WEEKDAYS, kBtn, kInput, whenText, whatText, condText, type Ctx } from '../lib/kommo'

// "Automatize" no visual do Funil Digital do Kommo: uma coluna por etapa, com os gatilhos em
// cartões ("Quando movido para esta etapa depois 72 horas / Alterar etapa lead: …") e o
// "+ Adicionar gatilho" embaixo. Também é aqui que se cria/renomeia/colore etapa e escreve o
// check-list ("dicas") que aparece no topo da coluna do funil. Tudo salva na hora.
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function FunilAutomatize() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { allFields, labelOf } = useContactFields()
  const [pipes, setPipes] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [flows, setFlows] = useState<any[]>([])
  const [edit, setEdit] = useState<{ stage: any; trigger?: any } | null>(null)
  const [stageEdit, setStageEdit] = useState<any>(null)

  const load = async () => setPipes((await api.get('/pipelines')).data)
  useEffect(() => {
    load()
    api.get('/tags').then(r => setTags(r.data)).catch(() => {})
    api.get('/agents').then(r => setAgents(r.data)).catch(() => {})
    api.get('/flows_options').then(r => setFlows(r.data)).catch(() => {})
  }, [])

  const pipe = pipes.find(p => p.slug === slug)
  const fields = useMemo(() => [{ key: 'status', label: 'Etapa do Consignado (régua)' }, { key: 'name', label: 'Nome' }, ...allFields], [allFields])
  const ctx: Ctx = {
    stageName: id => { for (const p of pipes) { const s = p.pipeline_stages.find((x: any) => x.id === id); if (s) return p.id === pipe?.id ? s.name : `${p.name} › ${s.name}` } return '—' },
    tagName: id => tags.find(t => t.id === id)?.name || `#${id}`,
    userName: id => { const a = agents.find(x => x.id === id); return a ? a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim() : '—' },
    fieldLabel: k => (k === 'status' ? 'Etapa do Consignado' : labelOf(k)),
    flowName: id => flows.find(f => f.id === id)?.name || `Robô #${id}`,
  }

  if (!pipe) return <p style={{ fontFamily: K.font, padding: 20, color: K.muted }}>Carregando…</p>
  // Consignado: etapas fixas (status da régua) e a tela do funil é a régua
  const voltar = pipe.system ? '/funil' : `/pipelines/${pipe.slug}`

  const addStage = async () => {
    const name = window.prompt('Nome da nova etapa:')
    if (!name?.trim()) return
    await api.post(`/pipelines/${pipe.id}/pipeline_stages`, { name, color: STAGE_COLORS[pipe.pipeline_stages.length % STAGE_COLORS.length] })
    load()
  }
  const toggle = async (t: any) => { await api.put(`/pipeline_triggers/${t.id}`, { active: !t.active }); load() }
  const remove = async (t: any) => { if (await confirmBox('Excluir gatilho?', 'Ele para de rodar na hora.')) { await api.delete(`/pipeline_triggers/${t.id}`); load() } }
  const renamePipe = async () => {
    const name = window.prompt('Nome do funil:', pipe.name)
    if (name?.trim() && name !== pipe.name) { await api.put(`/pipelines/${pipe.id}`, { name }); load() }
  }
  const deletePipe = async () => {
    if (!(await confirmBox(`Excluir o funil ${pipe.name}?`, 'As etapas, os gatilhos e os leads deste funil serão removidos. Os contatos continuam salvos.'))) return
    await api.delete(`/pipelines/${pipe.id}`); navigate('/pipelines')
  }

  return (
    <div className="k-fullbleed" style={{ fontFamily: K.font, color: K.text, margin: -24, minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div className="k-topbar" style={{ minHeight: 64, borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', flex: 'none', flexWrap: 'wrap' }}>
        <button onClick={() => navigate(voltar)} title="Voltar ao funil" style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={22} color={K.muted} /></button>
        <button onClick={renamePipe} title="Renomear funil" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: K.font, fontSize: 16, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: K.text }}>{pipe.name}</button>
        <span style={{ flex: 1 }} />
        {pipe.system ? <span style={{ fontSize: 13, color: K.muted }}>As etapas são os status da revendedora — a régua move o card sozinha.</span> : <>
          <button onClick={deletePipe} style={kBtn('flat', { color: K.muted, textTransform: 'none', fontWeight: 400 })}><Trash2 size={15} /> Excluir funil</button>
          <button onClick={addStage} style={kBtn('ghost')}><Plus size={15} /> Etapa</button>
        </>}
        <button onClick={() => navigate(voltar)} style={kBtn('blue')}>Sair</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 40px' }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {pipe.pipeline_stages.map((s: any) => (
            <div key={s.id} style={{ width: 236, flex: 'none', borderRight: `1px solid ${K.line}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2, padding: '16px 12px 0', textAlign: 'center' }}>
                <button onClick={() => setStageEdit(s)} title="Editar etapa" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: K.font, fontSize: 13, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.text, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>{s.kind === 'normal' && <Pencil size={11} color={K.muted} />}
                </button>
                <div style={{ fontSize: 12, color: K.muted, margin: '3px 0 8px' }}>
                  {s.kind === 'normal' ? <button onClick={() => setStageEdit(s)} style={{ border: 'none', background: 'none', color: s.description ? K.muted : K.link, cursor: 'pointer', fontFamily: K.font, fontSize: 12 }}>{s.description ? `${s.description.split('\n').length} dicas` : 'Adicionar dicas'}</button> : s.kind === 'won' ? 'venda ganha' : 'venda perdida'}
                </div>
                <div style={{ height: 3, background: s.color || '#99ccff' }} />
              </div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.pipeline_triggers.map((t: any) => (
                  <div key={t.id} className="k-trigger" style={{ border: `1px solid ${K.line}`, borderRadius: 3, padding: '9px 10px', background: t.active ? '#fafbfc' : '#fff', opacity: t.active ? 1 : 0.5, fontSize: 13, lineHeight: 1.4, position: 'relative' }}>
                    {(t.conditions || []).length > 0 && <div style={{ color: '#7c5cc4', fontSize: 12, marginBottom: 3 }}>{t.conditions.map((k: any) => condText(k, ctx)).join(' e ')}</div>}
                    <div style={{ color: K.muted }}>{whenText(t, ctx)}</div>
                    <div style={{ marginTop: 3, color: K.text }}>{whatText(t, ctx)}</div>
                    {!t.active && t.action_type === 'start_flow' && <div style={{ fontSize: 11.5, color: K.orange, marginTop: 4 }}>{t.config?.flow_id ? 'Desligado — ligue quando quiser que o robô mande a mensagem' : 'Desligado — o robô ainda não foi recriado'}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                      <Switch on={t.active} onChange={() => toggle(t)} />
                      <span style={{ flex: 1 }} />
                      <button onClick={() => setEdit({ stage: s, trigger: t })} title="Editar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted, display: 'flex' }}><Pencil size={14} /></button>
                      <button onClick={() => remove(t)} title="Excluir" style={{ border: 'none', background: 'none', cursor: 'pointer', color: K.muted, display: 'flex' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setEdit({ stage: s })} style={{ border: `1px dashed ${K.lineDark}`, background: 'none', borderRadius: 3, padding: '12px 8px', color: K.muted, fontFamily: K.font, fontSize: 13, cursor: 'pointer' }}>+ Adicionar gatilho</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {edit && <TriggerForm pipes={pipes} pipe={pipe} stage={edit.stage} trigger={edit.trigger} tags={tags} agents={agents} flows={flows} fields={fields} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      {stageEdit && <StageForm stage={stageEdit} onClose={() => setStageEdit(null)} onSaved={() => { setStageEdit(null); load() }} />}
    </div>
  )
}

const lbl = { display: 'block', fontFamily: K.font, fontSize: 13, color: K.muted, margin: '14px 0 5px' } as const

function StageForm({ stage, onClose, onSaved }: { stage: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color || '#99ccff')
  const [desc, setDesc] = useState(stage.description || '')
  const fixed = stage.kind !== 'normal'
  const save = async () => {
    try { await api.put(`/pipeline_stages/${stage.id}`, { name, color, description: desc }); onSaved() } catch (e: any) { toast('error', e.response?.data?.message || 'Erro ao salvar etapa.') }
  }
  const del = async () => {
    if (!(await confirmBox('Excluir etapa?', 'Os leads dela vão para a primeira etapa do funil.'))) return
    try { await api.delete(`/pipeline_stages/${stage.id}`); onSaved() } catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível excluir.') }
  }
  return (
    <Modal title="Etapa" onClose={onClose}
      footer={<>{!fixed && <button onClick={del} style={kBtn('flat', { color: '#e53935', marginRight: 'auto' })}>Excluir</button>}<button onClick={onClose} style={kBtn('ghost')}>Cancelar</button><button onClick={save} style={kBtn('blue')}>Salvar</button></>}>
      <label style={lbl}>Nome</label>
      <input value={name} onChange={e => setName(e.target.value)} style={kInput} />
      <label style={lbl}>Cor</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STAGE_COLORS.map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 3, background: c, border: color === c ? `2px solid ${K.blueDark}` : `1px solid ${K.line}`, cursor: 'pointer' }} />)}
      </div>
      {!fixed && (<>
        <label style={lbl}>Dicas (check-list que aparece no topo da coluna — uma por linha)</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={5} style={{ ...kInput, height: 'auto', padding: 10, resize: 'vertical' }} placeholder={'Mensagem de incentivo\nPerguntar se conseguiu ver o catálogo'} />
      </>)}
    </Modal>
  )
}

const UNITS = [{ id: 1, label: 'minutos' }, { id: 60, label: 'horas' }, { id: 1440, label: 'dias' }]
const splitMin = (m: number) => { const u = m && m % 1440 === 0 ? 1440 : m && m % 60 === 0 ? 60 : 1; return { n: m ? m / u : 0, u } }

function TriggerForm({ pipes, pipe, stage, trigger, tags, agents, flows, fields, onClose, onSaved }: any) {
  const t = trigger || {}
  const [event, setEvent] = useState<string>(t.event || 'enter')
  const d0 = splitMin(t.delay_minutes || 0)
  const [delayN, setDelayN] = useState(d0.n)
  const [delayU, setDelayU] = useState(d0.u)
  const [sched, setSched] = useState<any>({ kind: 'daily', time: '08:00', weekday: 2, ...(t.schedule || {}) })
  const off0 = splitMin(Math.abs(t.config?.offset_minutes || 0))
  const [offN, setOffN] = useState(off0.n || 24)
  const [offU, setOffU] = useState(off0.n ? off0.u : 60)
  const [offDir, setOffDir] = useState((t.config?.offset_minutes || -1) < 0 ? -1 : 1)
  const [action, setAction] = useState<string>(t.action_type || 'move_stage')
  const [cfg, setCfg] = useState<any>({ ...(t.config || {}) })
  const [conds, setConds] = useState<any[]>(t.conditions || [])
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }))

  const save = async () => {
    const config = { ...cfg }
    if (event === 'date_field') config.offset_minutes = offDir * offN * offU
    else { delete config.date_field; delete config.offset_minutes }
    const body = { event, action_type: action, config, conditions: conds, delay_minutes: event === 'enter' ? delayN * delayU : 0, schedule: event === 'schedule' ? sched : {} }
    setSaving(true)
    try {
      if (trigger) await api.put(`/pipeline_triggers/${trigger.id}`, body)
      else await api.post(`/pipeline_stages/${stage.id}/pipeline_triggers`, body)
      onSaved()
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar o gatilho.') } finally { setSaving(false) }
  }

  const sel = (value: any, onChange: (v: string) => void, opts: [any, string][], style = {}) => (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...kInput, ...style }}>{opts.map(([v, l]) => <option key={String(v)} value={v}>{l}</option>)}</select>
  )
  const allStages: [number, string][] = pipes.flatMap((p: any) => p.pipeline_stages.map((s: any) => [s.id, p.id === pipe.id ? s.name : `${p.name} › ${s.name}`]))

  return (
    <Modal width={560} title={trigger ? 'Editar gatilho' : 'Adicionar gatilho'} subtitle={`Etapa: ${stage.name}`} onClose={onClose}
      footer={<><button onClick={onClose} style={kBtn('ghost')}>Cancelar</button><button disabled={saving} onClick={save} style={kBtn('blue')}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
      <label style={{ ...lbl, marginTop: 0 }}>Executar</label>
      {sel(event, setEvent, [['enter', 'Quando movido para ou criado nesta etapa'], ['client_reply', 'Quando o cliente responder'], ['schedule', 'Em um horário agendado'], ['date_field', 'Antes/depois de uma data do lead']])}

      {event === 'enter' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: K.muted }}>Depois de</span>
          <input type="number" min={0} value={delayN} onChange={e => setDelayN(Math.max(0, Number(e.target.value)))} style={{ ...kInput, width: 90 }} />
          {sel(delayU, v => setDelayU(Number(v)), UNITS.map(u => [u.id, u.label]), { width: 120 })}
          <span style={{ fontSize: 12.5, color: K.muted }}>{delayN ? '' : '(imediatamente)'}</span>
        </div>
      )}
      {event === 'schedule' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {sel(sched.kind, v => setSched({ ...sched, kind: v }), [['daily', 'Diariamente'], ['weekly', 'Uma vez por semana'], ['once', 'Uma vez (data fixa)']], { width: 190 })}
          {sched.kind === 'weekly' && sel(sched.weekday, v => setSched({ ...sched, weekday: Number(v) }), WEEKDAYS.map((w, i) => [i, w]), { width: 130 })}
          {sched.kind === 'once'
            ? <input type="datetime-local" value={sched.at ? new Date(new Date(sched.at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => setSched({ ...sched, at: new Date(e.target.value).toISOString() })} style={{ ...kInput, width: 220 }} />
            : <input type="time" value={sched.time || '08:00'} onChange={e => setSched({ ...sched, time: e.target.value })} style={{ ...kInput, width: 120 }} />}
        </div>
      )}
      {event === 'date_field' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="number" min={0} value={offN} onChange={e => setOffN(Math.max(0, Number(e.target.value)))} style={{ ...kInput, width: 80 }} />
          {sel(offU, v => setOffU(Number(v)), UNITS.map(u => [u.id, u.label]), { width: 110 })}
          {sel(offDir, v => setOffDir(Number(v)), [[-1, 'antes'], [1, 'depois']], { width: 100 })}
          <span style={{ fontSize: 14, color: K.muted }}>de</span>
          {sel(cfg.date_field || '', v => set('date_field', v), [['', 'Escolha o campo…'], ...fields.map((f: any) => [f.key, f.label])], { flex: 1, minWidth: 160 })}
        </div>
      )}

      <label style={lbl}>Ação</label>
      {sel(action, v => { setAction(v); setCfg((c: any) => ({ date_field: c.date_field, offset_minutes: c.offset_minutes })) }, ACTIONS.map(a => [a.id, a.label]))}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {action === 'move_stage' && sel(cfg.target_stage_id || '', v => set('target_stage_id', Number(v)), [['', 'Escolha a etapa…'], ...allStages.filter(([id]) => id !== stage.id)])}
        {action === 'create_task' && (<>
          {sel(cfg.tipo || 'manual_acompanhamento', v => set('tipo', v), Object.entries(TIPOS_TAREFA))}
          <input value={cfg.titulo || ''} onChange={e => set('titulo', e.target.value)} placeholder="Título da tarefa" style={kInput} />
          <textarea value={cfg.descricao || ''} onChange={e => set('descricao', e.target.value)} placeholder="Descrição (opcional) — uma orientação por linha" rows={3} style={{ ...kInput, height: 'auto', padding: 10 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 14, color: K.muted }}>Prazo:</span><input type="number" min={0} value={cfg.prazo_horas || 0} onChange={e => set('prazo_horas', Number(e.target.value))} style={{ ...kInput, width: 90 }} /><span style={{ fontSize: 14, color: K.muted }}>horas</span></div>
        </>)}
        {action === 'advance_field' && (<>
          {sel(cfg.field_key || '', v => set('field_key', v), [['', 'Escolha o campo…'], ...fields.map((f: any) => [f.key, f.label])])}
          <textarea value={(cfg.steps || []).join('\n')} onChange={e => set('steps', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} rows={4} placeholder={'Sequência, um valor por linha (ex.: 1º mês, 2º mês, 3º mês, Veterano)'} style={{ ...kInput, height: 'auto', padding: 10 }} />
        </>)}
        {action === 'set_field' && (<>
          {sel(cfg.field_key || '', v => set('field_key', v), [['', 'Escolha o campo…'], ...fields.map((f: any) => [f.key, f.label])])}
          <input value={cfg.value ?? ''} onChange={e => set('value', e.target.value)} placeholder="Novo valor (vazio = limpar o campo)" style={kInput} />
        </>)}
        {(action === 'add_tags' || action === 'remove_tags') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tg: any) => {
              const on = (cfg.tag_ids || []).includes(tg.id)
              return <button key={tg.id} onClick={() => set('tag_ids', on ? cfg.tag_ids.filter((x: number) => x !== tg.id) : [...(cfg.tag_ids || []), tg.id])} style={{ fontFamily: K.font, fontSize: 12, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', border: `1px solid ${on ? K.blueDark : K.lineDark}`, background: on ? '#fbe9ee' : '#fff', color: on ? K.blueDark : K.muted }}>{tg.name}</button>
            })}
          </div>
        )}
        {action === 'change_owner' && sel(cfg.user_id || '', v => set('user_id', Number(v)), [['', 'Escolha o usuário…'], ...agents.map((a: any) => [a.id, a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()])])}
        {action === 'create_note' && <textarea value={cfg.content || ''} onChange={e => set('content', e.target.value)} rows={3} placeholder="Texto da nota" style={{ ...kInput, height: 'auto', padding: 10 }} />}
        {action === 'start_flow' && (flows.length
          ? sel(cfg.flow_id || '', v => set('flow_id', Number(v)), [['', 'Escolha o robô…'], ...flows.map((f: any) => [f.id, f.name])])
          : <p style={{ fontSize: 13, color: K.orange, margin: 0 }}>Nenhum robô criado ainda (Automações › Robôs).</p>)}
        {(action === 'ai_start' || action === 'ai_stop') && <AiAgentPick action={action} cfg={cfg} set={set} sel={sel} />}
        {action === 'send_webhook' && <input value={cfg.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://…" style={kInput} />}
      </div>

      <label style={lbl}>Condições (opcional — só executa se todas baterem)</label>
      {conds.map((k, i) => {
        const upd = (p: any) => setConds(cs => cs.map((x, j) => (j === i ? { ...x, ...p } : x)))
        const isTag = k.op === 'has_tag' || k.op === 'no_tag'
        return (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {sel(isTag ? '__tag' : k.field, v => upd(v === '__tag' ? { field: '', op: 'has_tag', value: '' } : { field: v, op: isTag ? 'eq' : k.op }), [['__tag', 'Etiqueta'], ...fields.map((f: any) => [f.key, f.label])], { flex: 1.3 })}
            {isTag
              ? sel(k.op, v => upd({ op: v }), [['has_tag', 'tem'], ['no_tag', 'não tem']], { flex: 0.8 })
              : sel(k.op, v => upd({ op: v }), [['eq', 'é igual a'], ['neq', 'diferente de'], ['contains', 'contém'], ['empty', 'está vazio'], ['not_empty', 'está preenchido']], { flex: 1 })}
            {isTag
              ? sel(k.value, v => upd({ value: Number(v) }), [['', '…'], ...tags.map((tg: any) => [tg.id, tg.name])], { flex: 1.2 })
              : !['empty', 'not_empty'].includes(k.op) && <input value={k.value || ''} onChange={e => upd({ value: e.target.value })} style={{ ...kInput, flex: 1.2 }} />}
            <button onClick={() => setConds(cs => cs.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={15} /></button>
          </div>
        )
      })}
      <button onClick={() => setConds(cs => [...cs, { field: fields[0]?.key || 'name', op: 'eq', value: '' }])} style={{ border: 'none', background: 'none', color: K.link, cursor: 'pointer', fontFamily: K.font, fontSize: 13, padding: 0 }}>+ Adicionar condição</button>
    </Modal>
  )
}

/** "Iniciar / Parar agente de IA" do Kommo: escolhe qual agente (parar sem escolher = todos). */
function AiAgentPick({ action, cfg, set, sel }: any) {
  const [list, setList] = useState<any[]>([])
  useEffect(() => { api.get('/ai_agents').then(r => setList(r.data)).catch(() => {}) }, [])
  if (!list.length) return <p style={{ fontSize: 13, color: K.orange, margin: 0 }}>Nenhum agente de IA criado ainda (menu Agente de IA).</p>
  return sel(cfg.agent_id || '', (v: string) => { const a = list.find(x => String(x.id) === String(v)); set('agent_id', v ? Number(v) : null); set('agent_name', a?.name || null) },
    [['', action === 'ai_stop' ? 'Todos os agentes' : 'Escolha o agente…'], ...list.map((a: any) => [a.id, `${a.name}${a.active ? '' : ' (desligado)'}`])])
}

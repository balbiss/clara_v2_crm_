import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, applyNodeChanges, type Edge, type Node, type NodeChange, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MoreHorizontal, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import api from '../api'
import { Modal } from '../components/ui'
import { Switch, toast, confirmBox } from '../components/ui2'
import { useContactFields } from '../composables/useContactFields'
import { useClickOutside } from '../lib/hooks'
import { K, kBtn, kInput, TIPOS_TAREFA } from '../lib/kommo'
import { ACTION_LABELS, COND_FIELDS, COND_OPS, STEP_LABELS, STEP_ORDER, TRIGGER_LABELS, VALIDATIONS, blankStep } from '../lib/salesbotUi'
import { ACTIVE_STATUS_LABELS, INACTIVE_STATUS_LABELS } from '../constants/regua'

// Editor do Salesbot no layout do Kommo: topo "NOME ✎ · Cancelar · Salvar e Continuar", canvas com
// zoom e minimapa, cartão "Gatilhos", bloco verde "Iniciar robô" e um bloco numerado por passo,
// editado no próprio bloco. Cada caminho (botão, outra resposta, sem resposta, condição, opção do
// Round Robin…) tem a sua saída; saída livre mostra "+" que abre "Adicionar próximo passo".
/* eslint-disable @typescript-eslint/no-explicit-any */

type Def = { start?: string | null; steps: Record<string, any> }
type Ctx = {
  def: Def; update: (id: string, fn: (s: any) => any) => void; remove: (id: string) => void; addAfter: (from: string, handle: string, type: string) => void
  numbers: Record<string, number>; opts: { tags: any[]; agents: any[]; stages: [string, string][]; bots: any[]; fields: any[] }
}
const EditorCtx = createContext<Ctx>(null as any)

// --- ponteiros de cada saída ---------------------------------------------------------------------
function getPtr(s: any, h: string): string | null {
  if (h === 'next') return s.next ?? null
  if (h === 'other') return s.on_other ?? null
  if (h === 'noanswer') return s.no_answer?.next ?? null
  if (h === 'fail') return s.on_fail ?? null
  if (h === 'else') return s.else_next ?? null
  if (h === 'timeout') return s.timeout_next ?? null
  if (h === 'vfail') return s.fail_next ?? null
  const [k, i] = h.split(':')
  if (k === 'btn') return s.buttons?.[+i]?.next ?? null
  if (k === 'branch') return s.branches?.[+i]?.next ?? null
  if (k === 'opt') return s.options?.[+i]?.next ?? null
  return null
}
function setPtr(s: any, h: string, v: string | null): any {
  const n = structuredClone(s)
  if (h === 'next') n.next = v
  else if (h === 'other') n.on_other = v
  else if (h === 'noanswer') n.no_answer = { ...(n.no_answer || { minutes: 10 }), next: v }
  else if (h === 'fail') n.on_fail = v
  else if (h === 'else') n.else_next = v
  else if (h === 'timeout') n.timeout_next = v
  else if (h === 'vfail') n.fail_next = v
  else { const [k, i] = h.split(':'); const arr = k === 'btn' ? n.buttons : k === 'branch' ? n.branches : n.options; if (arr?.[+i]) arr[+i].next = v }
  return n
}
/** Saídas que o passo mostra, na ordem do bloco. */
function handlesOf(s: any): [string, string][] {
  switch (s.type) {
    case 'message': {
      const out: [string, string][] = (s.buttons || []).map((b: any, i: number) => [`btn:${i}`, b.label || `Botão ${i + 1}`])
      if (out.length || s.on_other !== undefined) out.push(['other', 'Outra resposta'])
      if (!out.length) out.push(['next', 'Próximo'])
      if (s.no_answer) out.push(['noanswer', `Sem resposta em ${s.no_answer.minutes || 0} min`])
      if (s.on_fail !== undefined) out.push(['fail', 'Falha ao enviar'])
      return out
    }
    case 'condition': return [...(s.branches || []).map((_: any, i: number) => [`branch:${i}`, `Condição ${i + 1}`] as [string, string]), ['else', 'Nenhuma das condições']]
    case 'pause': return s.mode === 'timer' ? [['next', 'Depois do tempo']] : [['next', 'Cliente respondeu'], ...((s.minutes || s.seconds) ? [['timeout', 'Sem resposta no tempo'] as [string, string]] : [])]
    case 'validation': return [['next', 'Válido'], ['vfail', 'Inválido']]
    case 'round_robin': return (s.options || []).map((_: any, i: number) => [`opt:${i}`, `Opção ${i + 1}`] as [string, string])
    case 'goto': case 'start_bot': case 'stop': return []
    default: return [['next', 'Próximo']]
  }
}

// --- menu "Adicionar próximo passo" --------------------------------------------------------------
function AddMenu({ onPick, onClose }: { onPick: (t: string) => void; onClose: () => void }) {
  const ref = useClickOutside<HTMLDivElement>(onClose, true)
  return (
    <div ref={ref} className="nodrag nowheel" style={{ position: 'absolute', left: 'calc(100% + 18px)', top: -8, zIndex: 20, width: 240, background: '#fff', border: `1px solid ${K.lineDark}`, borderRadius: 3, padding: 10, boxShadow: '0 6px 20px rgba(0,0,0,.15)' }}>
      <div style={{ fontSize: 14, color: K.text, marginBottom: 8 }}>Adicionar próximo passo</div>
      {STEP_ORDER.map(t => <button key={t} onClick={() => onPick(t)} style={{ display: 'block', width: '100%', textAlign: 'left', border: `1px solid ${K.line}`, borderRadius: 3, background: '#fff', padding: '8px 10px', marginBottom: 6, fontFamily: K.font, fontSize: 14, color: t === 'stop' ? '#e53935' : K.text, cursor: 'pointer' }}>{STEP_LABELS[t]}</button>)}
    </div>
  )
}

/** Uma saída do bloco: rótulo + ponto de ligação + "+" quando está livre. */
function Out({ step, h, label }: { step: any; h: string; label: string }) {
  const { addAfter } = useContext(EditorCtx)
  const [menu, setMenu] = useState(false)
  const free = !getPtr(step, h)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minHeight: 26, fontSize: 12.5, color: K.muted, paddingRight: 4 }}>
      <span>{label}</span>
      {free && <button title="Adicionar próximo passo" className="nodrag" onClick={() => setMenu(m => !m)} style={{ width: 18, height: 18, borderRadius: '50%', border: `1px solid ${K.lineDark}`, background: '#fff', color: K.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><Plus size={12} /></button>}
      <Handle type="source" position={Position.Right} id={h} style={{ right: -21, width: 10, height: 10, background: free ? '#fff' : K.blue, border: `2px solid ${K.blue}` }} />
      {menu && <AddMenu onClose={() => setMenu(false)} onPick={t => { setMenu(false); addAfter(step.id, h, t) }} />}
    </div>
  )
}

const inp: React.CSSProperties = { ...kInput, height: 32, fontSize: 13.5 }
const sel = (value: any, onChange: (v: string) => void, opts: [any, string][], style: React.CSSProperties = {}) => (
  <select className="nodrag" value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...inp, ...style }}>{opts.map(([v, l]) => <option key={String(v)} value={v}>{l}</option>)}</select>
)

/** Corpo de cada tipo de passo (formulários dentro do bloco). */
function StepBody({ s }: { s: any }) {
  const { update, def, opts, numbers } = useContext(EditorCtx)
  const set = (patch: any) => update(s.id, x => ({ ...x, ...patch }))
  switch (s.type) {
    case 'message':
      return (
        <div style={{ background: '#c8506a', borderRadius: 12, padding: 10 }}>
          <textarea className="nodrag nowheel" value={s.text || ''} onChange={e => set({ text: e.target.value })} placeholder="Inserir mensagem do robô…" rows={3}
            style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent', color: '#fff', fontFamily: K.font, fontSize: 14, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 11.5, color: '#dbe7ff', margin: '2px 0 6px' }}>Variáveis: {'{{contact.first_name}}'} · {'{{contact.name}}'} · {'{{lead.campo}}'} · {'{{user.name}}'}</div>
          {(s.buttons || []).map((b: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input className="nodrag" value={b.label} onChange={e => set({ buttons: s.buttons.map((x: any, j: number) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Texto do botão" style={{ ...inp, background: '#fff', borderRadius: 14, textAlign: 'center' }} />
              <button title="Remover botão" className="nodrag" onClick={() => set({ buttons: s.buttons.filter((_: any, j: number) => j !== i) })} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(s.buttons || []).length < 13 && <button className="nodrag" onClick={() => set({ buttons: [...(s.buttons || []), { label: '', next: null }] })} style={pillBtn}>+ Botão de ação</button>}
            {!s.no_answer && <button className="nodrag" onClick={() => set({ no_answer: { minutes: 10, next: null } })} style={pillBtn}>+ Sem resposta</button>}
            {s.on_fail === undefined && <button className="nodrag" onClick={() => set({ on_fail: null })} style={pillBtn}>+ Falha ao enviar</button>}
          </div>
          {s.no_answer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: '#fff', fontSize: 12.5 }}>
              Sem resposta em <input className="nodrag" type="number" min={1} value={s.no_answer.minutes} onChange={e => set({ no_answer: { ...s.no_answer, minutes: Math.max(1, Number(e.target.value)) } })} style={{ ...inp, width: 64 }} /> min
              <button title="Tirar" className="nodrag" onClick={() => { const n = { ...s }; delete n.no_answer; update(s.id, () => n) }} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}><X size={13} /></button>
            </div>
          )}
        </div>
      )
    case 'internal_message':
      return <textarea className="nodrag nowheel" value={s.text || ''} onChange={e => set({ text: e.target.value })} placeholder="Mensagem para a equipe (vira nota na conversa + aviso no Centro de Notificação)" rows={3} style={{ ...inp, height: 'auto', padding: 8 }} />
    case 'condition':
      return (
        <div>
          {(s.branches || []).map((b: any, i: number) => (
            <div key={i} style={{ border: `1px dashed ${K.lineDark}`, borderRadius: 3, padding: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: K.muted, marginBottom: 4 }}>
                Condição {i + 1}{b.rules.length > 1 && sel(b.logic, v => set({ branches: s.branches.map((x: any, j: number) => (j === i ? { ...x, logic: v } : x)) }), [['and', 'todas (e)'], ['or', 'qualquer (ou)']], { width: 110 })}
                <span style={{ flex: 1 }} />
                {s.branches.length > 1 && <button title="Remover condição" className="nodrag" onClick={() => set({ branches: s.branches.filter((_: any, j: number) => j !== i) })} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={13} /></button>}
              </div>
              {b.rules.map((r: any, k: number) => {
                const upd = (p: any) => set({ branches: s.branches.map((x: any, j: number) => (j === i ? { ...x, rules: x.rules.map((y: any, m: number) => (m === k ? { ...y, ...p } : y)) } : x)) })
                const fieldOpts: [string, string][] = [...COND_FIELDS, ...opts.fields.map((f: any) => [f.key, f.label] as [string, string])]
                return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                    {sel(r.field, v => upd({ field: v, value: '' }), fieldOpts)}
                    {sel(r.op, v => upd({ op: v }), r.field === 'tag' ? [['eq', 'tem'], ['neq', 'não tem']] : r.field === 'stage' ? [['eq', 'está em'], ['neq', 'não está em']] : COND_OPS)}
                    <div style={{ gridColumn: '1 / -1' }}>
                      {r.field === 'tag' ? sel(r.value, v => upd({ value: v }), [['', 'Escolha a tag…'], ...opts.tags.map((t: any) => [t.id, t.name] as [any, string])])
                        : r.field === 'stage' ? sel(r.value, v => upd({ value: v }), [['', 'Escolha a etapa…'], ...opts.stages])
                        : r.field === 'conversation_status' ? sel(r.value, v => upd({ value: v }), [['', 'Escolha…'], ['open', 'Aberta'], ['resolved', 'Fechada'], ['snoozed', 'Em espera']])
                        : r.field === 'responsible' ? sel(r.value, v => upd({ value: v }), [['', 'Escolha…'], ...opts.agents.map((a: any) => [a.id, a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()] as [any, string])])
                        : !['empty', 'not_empty'].includes(r.op) && <input className="nodrag" value={r.value || ''} onChange={e => upd({ value: e.target.value })} placeholder="Valor" style={inp} />}
                    </div>
                  </div>
                )
              })}
              <button className="nodrag" onClick={() => set({ branches: s.branches.map((x: any, j: number) => (j === i ? { ...x, rules: [...x.rules, { field: 'message', op: 'contains', value: '' }] } : x)) })} style={linkBtn}>+ Adicionar condição (e/ou)</button>
            </div>
          ))}
          <button className="nodrag" onClick={() => set({ branches: [...(s.branches || []), { logic: 'and', rules: [{ field: 'message', op: 'contains', value: '' }], next: null }] })} style={linkBtn}>+ Adicionar próxima condição</button>
        </div>
      )
    case 'pause':
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          {sel(s.mode, v => set({ mode: v }), [['reply', 'Aguardar resposta do cliente'], ['timer', 'Aguardar um tempo']])}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: K.muted }}>
            {s.mode === 'timer' ? 'Por' : 'No máximo'}
            <input className="nodrag" type="number" min={0} value={s.minutes || 0} onChange={e => set({ minutes: Math.max(0, Number(e.target.value)) })} style={{ ...inp, width: 64 }} /> min
            <input className="nodrag" type="number" min={0} value={s.seconds || 0} onChange={e => set({ seconds: Math.max(0, Number(e.target.value)) })} style={{ ...inp, width: 64 }} /> s
          </div>
        </div>
      )
    case 'validation':
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: K.muted }}>Confere a última resposta do cliente</span>
          {sel(s.check, v => set({ check: v }), VALIDATIONS)}
          {s.check === 'range' ? <div style={{ display: 'flex', gap: 6 }}><input className="nodrag" type="number" value={s.min ?? ''} onChange={e => set({ min: e.target.value })} placeholder="de" style={inp} /><input className="nodrag" type="number" value={s.max ?? ''} onChange={e => set({ max: e.target.value })} placeholder="até" style={inp} /></div>
            : !['email', 'phone', 'number'].includes(s.check) && <input className="nodrag" value={s.value || ''} onChange={e => set({ value: e.target.value })} placeholder="Valor" style={inp} />}
          {sel(s.save_field || '', v => set({ save_field: v || undefined }), [['', 'Não salvar em campo'], ...opts.fields.map((f: any) => [f.key, `Salvar em: ${f.label}`] as [string, string])])}
        </div>
      )
    case 'action': return <ActionBody s={s} set={set} />
    case 'goto':
      return sel(s.target, v => set({ target: v || null }), [['', 'Escolha o passo…'], ...Object.values(def.steps).filter((x: any) => x.id !== s.id).map((x: any) => [x.id, `${numbers[x.id]}. ${STEP_LABELS[x.type]}`] as [string, string])])
    case 'start_bot':
      return sel(s.flow_id, v => set({ flow_id: v ? Number(v) : null }), [['', 'Escolha o robô…'], ...opts.bots.map((b: any) => [b.id, b.name] as [any, string])])
    case 'round_robin':
      return (
        <div style={{ fontSize: 12.5, color: K.muted }}>
          Cada lead novo segue a próxima opção, em ordem (1, 2, 3… e volta pra 1).
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {(s.options || []).length < 100 && <button className="nodrag" onClick={() => set({ options: [...s.options, { next: null }] })} style={linkBtn}>+ Opção</button>}
            {(s.options || []).length > 2 && <button className="nodrag" onClick={() => set({ options: s.options.slice(0, -1) })} style={linkBtn}>− Opção</button>}
          </div>
        </div>
      )
    default: return null
  }
}

function ActionBody({ s, set }: { s: any; set: (p: any) => void }) {
  const { opts } = useContext(EditorCtx)
  const c = s.config || {}
  const cfg = (p: any) => set({ config: { ...c, ...p } })
  const users: [any, string][] = opts.agents.map((a: any) => [a.id, a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()])
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {sel(s.action, v => set({ action: v, config: {} }), Object.entries(ACTION_LABELS))}
      {s.action === 'add_note' && <textarea className="nodrag nowheel" value={c.text || ''} onChange={e => cfg({ text: e.target.value })} placeholder="Texto da nota" rows={2} style={{ ...inp, height: 'auto', padding: 8 }} />}
      {s.action === 'add_task' && (<>
        {sel(c.tipo || 'manual_acompanhamento', v => cfg({ tipo: v }), Object.entries(TIPOS_TAREFA))}
        <input className="nodrag" value={c.titulo || ''} onChange={e => cfg({ titulo: e.target.value })} placeholder="Texto da tarefa" style={inp} />
        {sel(c.deadline || 'now', v => cfg({ deadline: v }), [['now', 'Imediatamente'], ['end_of_day', 'Fim do dia'], ['1d', 'Em 1 dia'], ['3d', 'Em 3 dias'], ['end_of_week', 'Fim da semana']])}
        {sel(c.user_id || '', v => cfg({ user_id: v ? Number(v) : undefined }), [['', 'Para: responsável do lead'], ...users])}
      </>)}
      {s.action === 'conversation_status' && sel(c.status || 'closed', v => cfg({ status: v }), [['closed', 'Fechar conversa'], ['open', 'Reabrir conversa']])}
      {(s.action === 'move_stage' || s.action === 'create_lead') && sel(s.action === 'move_stage' ? c.target : c.target, v => cfg({ target: v }), [['', 'Escolha a etapa…'], ...opts.stages.filter(([v]) => s.action === 'move_stage' || !String(v).startsWith('status:'))])}
      {s.action === 'change_owner' && (<>
        {sel(c.mode || 'user', v => cfg({ mode: v }), [['user', 'Para um usuário'], ['round_robin', 'Round Robin (distribuir em fila)']])}
        {c.mode === 'round_robin'
          ? <div style={{ maxHeight: 130, overflowY: 'auto', border: `1px solid ${K.line}`, borderRadius: 3, padding: 6 }} className="nowheel">
              {users.map(([id, n]) => <label key={id} className="nodrag" style={{ display: 'flex', gap: 6, fontSize: 13, padding: '2px 0', cursor: 'pointer' }}><input type="checkbox" checked={(c.user_ids || []).includes(id)} onChange={e => cfg({ user_ids: e.target.checked ? [...(c.user_ids || []), id] : (c.user_ids || []).filter((x: any) => x !== id) })} />{n}</label>)}
            </div>
          : sel(c.user_id || '', v => cfg({ user_id: v ? Number(v) : undefined }), [['', 'Escolha o usuário…'], ...users])}
      </>)}
      {s.action === 'complete_tasks' && (<>
        {sel(c.tipo || 'all', v => cfg({ tipo: v }), [['all', 'Todas as tarefas'], ...Object.entries(TIPOS_TAREFA)])}
        <input className="nodrag" value={c.comment || ''} onChange={e => cfg({ comment: e.target.value })} placeholder="Comentário ao concluir" style={inp} />
      </>)}
      {s.action === 'manage_tags' && (<>
        {sel(c.mode || 'add', v => cfg({ mode: v }), [['add', 'Adicionar tags'], ['remove', 'Excluir tags']])}
        <div className="nowheel" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
          {opts.tags.map((t: any) => { const on = (c.tag_ids || []).includes(t.id); return <button key={t.id} className="nodrag" onClick={() => cfg({ tag_ids: on ? c.tag_ids.filter((x: any) => x !== t.id) : [...(c.tag_ids || []), t.id] })} style={{ fontSize: 11.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 2, border: `1px solid ${on ? K.blue : K.lineDark}`, background: on ? '#fbe9ee' : '#fff', color: on ? K.blue : K.muted, cursor: 'pointer' }}>{t.name}</button> })}
        </div>
      </>)}
      {s.action === 'set_field' && (<>
        {sel(c.field_key || '', v => cfg({ field_key: v }), [['', 'Escolha o campo…'], ['name', 'Nome do contato'], ['email', 'E-mail do contato'], ...opts.fields.map((f: any) => [f.key, f.label] as [string, string])])}
        {sel(c.source || 'manual', v => cfg({ source: v }), [['manual', 'Valor fixo'], ['message', 'Mensagem do cliente']])}
        {c.source !== 'message' && <input className="nodrag" value={c.value || ''} onChange={e => cfg({ value: e.target.value })} placeholder="Valor (aceita {{variáveis}})" style={inp} />}
      </>)}
      {s.action === 'webhook' && <input className="nodrag" value={c.url || ''} onChange={e => cfg({ url: e.target.value })} placeholder="https://…" style={inp} />}
    </div>
  )
}
const pillBtn: React.CSSProperties = { border: '1px dashed #c9d9fb', borderRadius: 14, background: 'transparent', color: '#fff', fontFamily: K.font, fontSize: 12.5, padding: '3px 10px', cursor: 'pointer' }
const linkBtn: React.CSSProperties = { border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 12.5, cursor: 'pointer' }

const StepNode = memo(({ data }: { data: { step: any } }) => {
  const { remove, numbers, update } = useContext(EditorCtx)
  const s = data.step
  const [menu, setMenu] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setMenu(false), menu)
  const stop = s.type === 'stop'
  return (
    <div style={{ width: stop ? 170 : 330, background: stop ? '#fdecea' : '#fff', border: `1px solid ${stop ? '#f3a5a5' : K.lineDark}`, borderRadius: 3, fontFamily: K.font, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <Handle type="target" position={Position.Left} style={{ top: 20, width: 10, height: 10, background: '#fff', border: `2px solid ${K.lineDark}` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        {!stop && <span style={{ minWidth: 24, height: 22, border: `1px solid ${K.lineDark}`, borderRadius: 2, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{numbers[s.id]}</span>}
        <span style={{ flex: 1, fontSize: 13.5, color: stop ? '#c62828' : K.muted }}>{STEP_LABELS[s.type]}</span>
        <div ref={ref} style={{ position: 'relative' }}>
          <button title="Mais" className="nodrag" onClick={() => setMenu(m => !m)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', display: 'flex' }}><MoreHorizontal size={16} /></button>
          {menu && (
            <div className="nodrag" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 30, background: '#fff', border: `1px solid ${K.line}`, boxShadow: '0 4px 14px rgba(0,0,0,.15)', minWidth: 160, padding: '4px 0' }}>
              {s.type === 'message' && <button onClick={() => { setMenu(false); update(s.id, x => (x.on_other === undefined ? { ...x, on_other: null } : (() => { const n = { ...x }; delete n.on_other; return n })())) }} style={menuItem}>{s.on_other === undefined ? '+ Outra resposta' : '− Outra resposta'}</button>}
              <button onClick={() => { setMenu(false); remove(s.id) }} style={{ ...menuItem, color: '#e53935' }}>Excluir passo</button>
            </div>
          )}
        </div>
      </div>
      {!stop && <div style={{ padding: '0 10px 8px' }}><StepBody s={s} /></div>}
      {handlesOf(s).length > 0 && <div style={{ borderTop: `1px solid ${K.line}`, padding: '4px 10px' }}>{handlesOf(s).map(([h, l]) => <Out key={h} step={s} h={h} label={l} />)}</div>}
    </div>
  )
})
const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 12px', fontFamily: K.font, fontSize: 13.5, cursor: 'pointer' }

const StartNode = memo(() => {
  const { def, addAfter } = useContext(EditorCtx)
  const [menu, setMenu] = useState(false)
  return (
    <div style={{ position: 'relative', width: 170, height: 38, border: '1px solid #43c08a', background: '#e9f8f1', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontFamily: K.font, fontSize: 14, color: '#2b9a6a' }}>
      <Play size={16} fill="#2b9a6a" /> Iniciar robô
      {!def.start && <button title="Adicionar próximo passo" className="nodrag" onClick={() => setMenu(m => !m)} style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', border: '1px solid #2b9a6a', background: '#fff', color: '#2b9a6a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><Plus size={12} /></button>}
      <Handle type="source" position={Position.Right} id="start" style={{ width: 10, height: 10, background: def.start ? '#43c08a' : '#fff', border: '2px solid #43c08a' }} />
      {menu && <AddMenu onClose={() => setMenu(false)} onPick={t => { setMenu(false); addAfter('__start', 'start', t) }} />}
    </div>
  )
})

const TriggerNode = memo(({ data }: { data: { summary: string; onEdit: () => void } }) => (
  <div style={{ width: 260, background: '#fff', border: `1px solid ${K.lineDark}`, borderRadius: 3, padding: 16, fontFamily: K.font, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
    <b style={{ fontSize: 15 }}>Gatilhos</b>
    <p style={{ margin: '6px 0 12px', fontSize: 14, color: K.text, lineHeight: 1.4 }}>Inicie bots com base nas regras que você definir ou manualmente a partir do cartão de lead</p>
    {data.summary && <p style={{ margin: '0 0 10px', fontSize: 13.5, color: K.link }}>{data.summary}</p>}
    <button className="nodrag" onClick={data.onEdit} style={{ border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', padding: '7px 10px', fontFamily: K.font, fontSize: 14, color: K.muted, cursor: 'pointer' }}>{data.summary ? '✎ Editar gatilho' : '+ Gatilho'}</button>
  </div>
))
const nodeTypes = { step: StepNode, start: StartNode, trigger: TriggerNode }

/** Posição automática pra robô sem posições salvas (ex.: robôs recriados do Kommo). */
function autoLayout(def: Def): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {}
  const depth: Record<string, number> = {}
  const q: [string, number][] = def.start ? [[def.start, 0]] : []
  while (q.length) {
    const [id, d] = q.shift()!
    if (depth[id] !== undefined || !def.steps[id]) continue
    depth[id] = d
    const s = def.steps[id]
    for (const [h] of handlesOf(s)) { const t = getPtr(s, h); if (t) q.push([t, d + 1]) }
    if (s.type === 'goto' && s.target) q.push([s.target, d + 1])
  }
  const perCol: Record<number, number> = {}
  for (const id of Object.keys(def.steps)) {
    const d = depth[id] ?? (Math.max(0, ...Object.values(depth)) + 1)
    const row = perCol[d] = (perCol[d] ?? -1) + 1
    pos[id] = { x: 360 + d * 400, y: 40 + row * 300 }
  }
  return pos
}

function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { allFields } = useContactFields()
  const [bot, setBot] = useState<any>(null)
  const [def, setDef] = useState<Def>({ start: null, steps: {} })
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<any>({ event: 'manual' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [trgOpen, setTrgOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [opts, setOpts] = useState<Ctx['opts']>({ tags: [], agents: [], stages: [], bots: [], fields: [] })
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  useEffect(() => {
    api.get(`/salesbots/${id}`).then(({ data }) => {
      const d: Def = { start: data.definition?.start ?? null, steps: data.definition?.steps || {} }
      setBot(data); setDef(d); setName(data.name); setTrigger(data.trigger_config || { event: 'manual' })
      const auto = autoLayout(d)
      setPositions(Object.fromEntries(Object.keys(d.steps).map(k => [k, d.steps[k].pos || auto[k]])))
    }).catch(() => toast('error', 'Robô não encontrado.'))
    Promise.all([api.get('/tags'), api.get('/agents'), api.get('/pipelines'), api.get('/salesbots/options')]).then(([t, a, p, b]) => {
      const regua = Object.entries({ ...ACTIVE_STATUS_LABELS, ...INACTIVE_STATUS_LABELS }).map(([k, n]) => [`status:${k}`, `Consignado › ${n}`] as [string, string])
      const stages = p.data.flatMap((pp: any) => pp.pipeline_stages.map((s: any) => [String(s.id), `${pp.name} › ${s.name}`] as [string, string]))
      setOpts(o => ({ ...o, tags: t.data, agents: a.data, stages: [...regua, ...stages], bots: b.data.filter((x: any) => String(x.id) !== String(id)) }))
    }).catch(() => {})
  }, [id])
  useEffect(() => { setOpts(o => ({ ...o, fields: allFields.filter((f: any) => !f.api_only) })) }, [allFields])

  const mark = () => setDirty(true)
  const update = useCallback((sid: string, fn: (s: any) => any) => { setDef(d => ({ ...d, steps: { ...d.steps, [sid]: fn(d.steps[sid]) } })); mark() }, [])
  const remove = useCallback((sid: string) => {
    setDef(d => {
      const steps = { ...d.steps }; delete steps[sid]
      for (const [k, s] of Object.entries(steps)) { let n = s; for (const [h] of handlesOf(s)) if (getPtr(n, h) === sid) n = setPtr(n, h, null); if (n.target === sid) n = { ...n, target: null }; steps[k] = n }
      return { start: d.start === sid ? null : d.start, steps }
    }); mark()
  }, [])
  const addAfter = useCallback((from: string, handle: string, type: string) => {
    const step = blankStep(type)
    setDef(d => {
      const steps = { ...d.steps, [step.id]: step }
      if (from === '__start') return { start: step.id, steps }
      steps[from] = setPtr(steps[from], handle, step.id)
      return { ...d, steps }
    })
    setPositions(p => {
      const base = from === '__start' ? { x: 320, y: 40 } : p[from] || { x: 360, y: 40 }
      const used = Object.values(p).filter(q => Math.abs(q.x - (base.x + 400)) < 50).length
      return { ...p, [step.id]: { x: base.x + 400, y: base.y + used * 40 } }
    })
    mark()
  }, [])

  // numeração dos blocos na ordem em que aparecem (como o Kommo)
  const numbers = useMemo(() => Object.fromEntries(Object.keys(def.steps).map((k, i) => [k, i + 1])), [def.steps])
  const nodes: Node[] = useMemo(() => [
    { id: '__trg', type: 'trigger', position: { x: 20, y: 40 }, data: { summary: trigger?.event && trigger.event !== 'manual' ? TRIGGER_LABELS[trigger.event] : '', onEdit: () => setTrgOpen(true) }, draggable: false },
    { id: '__start', type: 'start', position: { x: 320, y: 40 }, data: {}, draggable: false },
    ...Object.values(def.steps).map((s: any) => ({ id: s.id, type: 'step', position: positions[s.id] || { x: 360, y: 40 }, data: { step: s } })),
  ], [def.steps, positions, trigger])
  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = []
    if (def.start) out.push({ id: `__start-${def.start}`, source: '__start', sourceHandle: 'start', target: def.start, style: { stroke: '#43c08a' } })
    for (const s of Object.values(def.steps) as any[]) {
      for (const [h] of handlesOf(s)) { const t = getPtr(s, h); if (t && def.steps[t]) out.push({ id: `${s.id}-${h}-${t}`, source: s.id, sourceHandle: h, target: t, style: { stroke: '#9aa4ad' } }) }
      if (s.type === 'goto' && s.target && def.steps[s.target]) out.push({ id: `${s.id}-goto-${s.target}`, source: s.id, target: s.target, style: { stroke: '#c3a6f5', strokeDasharray: '5 4' }, animated: true })
    }
    return out
  }, [def])

  const onNodesChange = (changes: NodeChange[]) => {
    const moved = changes.filter(c => c.type === 'position' && (c as any).position && !(c.id as string).startsWith('__'))
    if (!moved.length) return
    const next = applyNodeChanges(moved, nodes)
    setPositions(p => ({ ...p, ...Object.fromEntries(next.filter(n => !n.id.startsWith('__')).map(n => [n.id, n.position])) }))
    if (changes.some(c => c.type === 'position' && !(c as any).dragging)) mark()
  }
  const onConnect = (c: Connection) => {
    if (!c.target || c.target.startsWith('__') || c.target === c.source) return
    if (c.source === '__start') { setDef(d => ({ ...d, start: c.target })); mark(); return }
    update(c.source!, s => setPtr(s, c.sourceHandle || 'next', c.target))
  }
  const onEdgesDelete = (eds: Edge[]) => {
    for (const e of eds) {
      if (e.source === '__start') setDef(d => ({ ...d, start: null }))
      else if (e.id.includes('-goto-')) update(e.source, s => ({ ...s, target: null }))
      else update(e.source, s => setPtr(s, e.sourceHandle || 'next', null))
    }
    mark()
  }

  const save = async () => {
    setSaving(true)
    const steps = Object.fromEntries(Object.entries(def.steps).map(([k, s]) => [k, { ...s, pos: positions[k] }]))
    try {
      const { data } = await api.put(`/salesbots/${id}`, { name, definition: { start: def.start, steps }, trigger_config: trigger })
      setBot(data); setDirty(false); toast('success', 'Robô salvo.')
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar.') } finally { setSaving(false) }
  }
  const sair = async () => { if (!dirty || (await confirmBox('Sair sem salvar?', 'As alterações feitas no robô serão perdidas.', 'Sair'))) navigate('/fluxos') }
  const toggleActive = async (v: boolean) => { const { data } = await api.put(`/salesbots/${id}`, { active: v }); setBot(data) }

  if (!bot) return <p style={{ fontFamily: K.font, color: K.muted, padding: 20 }}>Carregando…</p>
  const ctx: Ctx = { def, update, remove, addAfter, numbers, opts }

  return (
    <div className="k-fullbleed" style={{ margin: -24, height: 'calc(100vh - var(--top-h, 0px))', display: 'flex', flexDirection: 'column', background: '#f5f5f5', fontFamily: K.font, color: K.text }}>
      <div className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', flexWrap: 'wrap' }}>
        {editingName
          ? <input autoFocus value={name} onChange={e => { setName(e.target.value); mark() }} onBlur={() => setEditingName(false)} onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }} style={{ ...kInput, width: 280, fontWeight: 700 }} />
          : <button onClick={() => setEditingName(true)} title="Renomear" style={{ border: 'none', background: 'none', fontFamily: K.font, fontSize: 16, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>{name}<Pencil size={14} /></button>}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: K.muted }}>Ativo <Switch on={!!bot.active} onChange={toggleActive} /></label>
        <button onClick={() => setTestOpen(true)} style={kBtn('ghost', { textTransform: 'none' })}><Play size={14} /> Testar em um lead</button>
        <button onClick={sair} style={kBtn('flat', { textTransform: 'none', color: K.muted })}>Cancelar</button>
        <button onClick={save} disabled={!dirty || saving} style={{ ...kBtn(dirty ? 'blue' : 'ghost'), textTransform: 'none', opacity: dirty ? 1 : 0.7 }}>{saving ? 'Salvando…' : 'Salvar e Continuar'}</button>
        <button title="Fechar" onClick={sair} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorCtx.Provider value={ctx}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes as any} onNodesChange={onNodesChange} onConnect={onConnect} onEdgesDelete={onEdgesDelete}
            fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.2} maxZoom={1.5} deleteKeyCode={['Delete', 'Backspace']} proOptions={{ hideAttribution: true }}>
            <Background color="#e3e5e8" gap={24} />
            <Controls position="top-right" showInteractive={false} />
            <MiniMap position="bottom-right" pannable zoomable nodeColor={n => (n.type === 'start' ? '#a7e3c8' : n.type === 'trigger' ? '#ddd' : '#c9d9fb')} />
          </ReactFlow>
        </EditorCtx.Provider>
      </div>
      {trgOpen && <TriggerModal value={trigger} tags={opts.tags} onClose={() => setTrgOpen(false)} onSave={t => { setTrigger(t); setTrgOpen(false); mark() }} />}
      {testOpen && <TestModal botId={Number(id)} dirty={dirty} onClose={() => setTestOpen(false)} />}
    </div>
  )
}

/** "Condição de execução" (o gatilho do robô), no formato do Kommo. */
function TriggerModal({ value, tags, onClose, onSave }: { value: any; tags: any[]; onClose: () => void; onSave: (t: any) => void }) {
  const [t, setT] = useState<any>({ event: 'manual', ...value })
  const [inboxes, setInboxes] = useState<any[]>([])
  useEffect(() => { api.get('/inboxes').then(r => setInboxes(r.data)).catch(() => {}) }, [])
  const set = (p: any) => setT((x: any) => ({ ...x, ...p }))
  const lbl: React.CSSProperties = { display: 'block', fontSize: 14.5, margin: '16px 0 6px' }
  const toggleArr = (k: string, id: number) => set({ [k]: (t[k] || []).includes(id) ? t[k].filter((x: number) => x !== id) : [...(t[k] || []), id] })
  return (
    <Modal width={520} title="Condição de execução" subtitle="Lançar bots automaticamente com base nas regras definidas abaixo" onClose={onClose}
      footer={<><button onClick={onClose} style={kBtn('flat', { textTransform: 'none', color: K.muted })}>Cancelar</button><button onClick={() => onSave(t)} style={kBtn('ghost', { textTransform: 'none' })}>Pronto</button></>}>
      <label style={{ ...lbl, marginTop: 0 }}>Quando isso acontece:</label>
      <select value={t.event} onChange={e => set({ event: e.target.value })} style={kInput}>{Object.entries(TRIGGER_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {t.event === 'incoming_message' && (<>
        <label style={lbl}>Só se a mensagem tiver uma destas palavras (opcional, separe por vírgula):</label>
        <input value={(t.keywords || []).join(', ')} onChange={e => set({ keywords: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="catálogo, preço, maleta" style={kInput} />
        <label style={lbl}>Intervalo mínimo entre disparos para o mesmo lead (minutos):</label>
        <input type="number" min={0} value={t.cooldown_minutes || 0} onChange={e => set({ cooldown_minutes: Math.max(0, Number(e.target.value)) })} style={{ ...kInput, width: 140 }} />
      </>)}
      {t.event === 'no_reply' && (<>
        <label style={lbl}>Horas depois da última mensagem do cliente:</label>
        <input type="number" min={1} value={t.hours || 1} onChange={e => set({ hours: Math.max(1, Number(e.target.value)) })} style={{ ...kInput, width: 140 }} />
      </>)}
      {t.event !== 'manual' && (<>
        {inboxes.length > 0 && (<>
          <label style={lbl}>Canais (vazio = todos):</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{inboxes.map(i => <label key={i.id} style={{ display: 'flex', gap: 6, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={(t.inbox_ids || []).includes(i.id)} onChange={() => toggleArr('inbox_ids', i.id)} />{i.name}</label>)}</div>
        </>)}
        <label style={lbl}>Para todos os leads com:</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value="" onChange={e => e.target.value && toggleArr('tag_ids', Number(e.target.value))} style={kInput}><option value="">+ Com a tag…</option>{tags.filter(x => !(t.tag_ids || []).includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value="" onChange={e => e.target.value && toggleArr('no_tag_ids', Number(e.target.value))} style={kInput}><option value="">+ Sem a tag…</option>{tags.filter(x => !(t.no_tag_ids || []).includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {(t.tag_ids || []).map((id: number) => <span key={'c' + id} style={chip}>com {tags.find(x => x.id === id)?.name}<button onClick={() => toggleArr('tag_ids', id)} style={chipX}>×</button></span>)}
          {(t.no_tag_ids || []).map((id: number) => <span key={'s' + id} style={chip}>sem {tags.find(x => x.id === id)?.name}<button onClick={() => toggleArr('no_tag_ids', id)} style={chipX}>×</button></span>)}
        </div>
        <label style={lbl}>Horário ativo:</label>
        <select value={t.active_hours ? 'custom' : 'always'} onChange={e => set({ active_hours: e.target.value === 'custom' ? { from: '08:00', to: '18:00' } : null })} style={kInput}><option value="always">sempre</option><option value="custom">só em um horário</option></select>
        {t.active_hours && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>das <input type="time" value={t.active_hours.from} onChange={e => set({ active_hours: { ...t.active_hours, from: e.target.value } })} style={{ ...kInput, width: 130 }} /> às <input type="time" value={t.active_hours.to} onChange={e => set({ active_hours: { ...t.active_hours, to: e.target.value } })} style={{ ...kInput, width: 130 }} /></div>}
      </>)}
      {t.event === 'manual' && <p style={{ fontSize: 13.5, color: K.muted, marginTop: 12 }}>O robô roda quando um gatilho "Executar Robô" do Automatize chamar, ou pelo cartão do lead (⋯ › Executar robô).</p>}
    </Modal>
  )
}
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '2px 8px', border: `1px solid ${K.lineDark}`, borderRadius: 3 }
const chipX: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: K.muted, padding: 0 }

/** Testar o robô num lead de verdade (roda o robô salvo nesse lead). */
function TestModal({ botId, dirty, onClose }: { botId: number; dirty: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<any[]>([])
  const timer = useRef(0)
  useEffect(() => { window.clearTimeout(timer.current); if (q.trim().length < 2) return setList([]); timer.current = window.setTimeout(() => api.get('/contacts', { params: { q, per_page: 8 } }).then(r => setList(r.data)), 300) }, [q])
  const run = async (c: any) => {
    try { await api.post(`/salesbots/${botId}/run`, { contact_id: c.id }); toast('success', `Robô iniciado para ${c.name || c.phone}.`); onClose() }
    catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível iniciar.') }
  }
  return (
    <Modal title="Testar em um lead" subtitle={dirty ? 'Atenção: o teste usa a versão SALVA do robô. Salve antes pra testar as mudanças.' : 'O robô roda de verdade nesse lead (manda as mensagens pelo WhatsApp da conversa dele).'} onClose={onClose}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar lead por nome ou telefone" style={kInput} />
      <div style={{ marginTop: 8 }}>{list.map(c => <button key={c.id} onClick={() => run(c)} style={{ ...menuItem, borderBottom: `1px solid ${K.line}` }}>{c.name || '—'} <span style={{ color: K.muted }}>{c.phone}</span></button>)}</div>
    </Modal>
  )
}

export default function SalesbotEditor() {
  return <ReactFlowProvider><Editor /></ReactFlowProvider>
}

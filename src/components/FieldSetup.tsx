import { useEffect, useState } from 'react'
import { Copy, Plus, Trash2, Users, X } from 'lucide-react'
import api from '../api'
import { toast, confirmBox } from './ui2'
import { useContactFields, reloadContactFields } from '../composables/useContactFields'
import { useClickOutside } from '../lib/hooks'
import { K } from '../lib/kommo'
import { ACTIVE_STATUS_LABELS, INACTIVE_STATUS_LABELS } from '../constants/regua'
import { display } from './KField'

// Painel "Campos e grupos" do Kommo (aba Configurações do card do lead), copiado da conta de teste:
// cabeçalho escuro com os grupos em pílulas (arrastar, + novo grupo), campos em caixas com alça,
// edição DENTRO da lista (nome, opções da lista, "Apenas API", "Obrigatório para etapas
// selecionadas" com as etapas coloridas, "Visível", Salvar / Cancelar / Excluir campo),
// "+ Adicionar campo" com os 16 tipos do Kommo, e a seção "Campo do contato".
/* eslint-disable @typescript-eslint/no-explicit-any */

// nomes exatamente como no menu do Kommo, na mesma ordem
export const TYPE_LABELS: Record<string, string> = {
  text: 'Texto curto', numeric: 'Numérico', checkbox: 'Interruptor', select: 'Selecionar', multiselect: 'Seleção múltipla',
  date: 'Data', url: 'Url', textarea: 'Texto longo', radiobutton: 'Botão de opção', short_address: 'Endereço curto', address: 'Endereço',
  birthday: 'Data de nascimento', cpf: 'CPF', date_time: 'Data e hora', price: 'Moeda', file: 'Arquivo',
}
const WITH_OPTIONS = ['select', 'multiselect', 'radiobutton']
const CONTACT_FIXED = ['Nome de contato', 'Telefone', 'E-mail', 'Cargo']

const boxStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', minHeight: 33, border: '1px solid #d5d8db', borderRadius: 3, background: '#fff', fontFamily: K.font, fontSize: 14, color: K.text }
const grip = (title = 'Arraste para mover') => (
  <span title={title} style={{ width: 14, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'grab' }}>
    {[0, 1, 2].map(i => <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#a7adb2' }} />)}
  </span>
)

export default function FieldSetup({ onClose, onChanged, inline }: { onClose: () => void; onChanged?: () => void; inline?: boolean }) {
  const { allFields } = useContactFields()
  const [groups, setGroups] = useState<any[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [editing, setEditing] = useState<string | null>(null) // key do campo aberto ('__new' = campo novo)
  const [drag, setDrag] = useState<string | null>(null)
  const [dragGroup, setDragGroup] = useState<number | null>(null)
  const [newGroup, setNewGroup] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const loadGroups = async () => { const { data } = await api.get('/contact_field_groups'); setGroups(data); setActive(a => (a && data.some((g: any) => g.id === a) ? a : data[0]?.id ?? null)) }
  useEffect(() => { loadGroups() }, [])
  const done = async () => { await Promise.all([loadGroups(), reloadContactFields()]); onChanged?.() }
  const group = groups.find(g => g.id === active)
  const fieldOf = (k: string) => allFields.find((f: any) => f.key === k)

  const saveKeys = (id: number, keys: string[]) => api.put(`/contact_field_groups/${id}`, { contact_field_group: { field_keys: keys } })
  const dropField = async (beforeKey: string | null, toGroupId = active) => {
    if (!drag || !toGroupId) return
    const key = drag; setDrag(null)
    const next = groups.map(g => ({ ...g, field_keys: (g.field_keys || []).filter((k: string) => k !== key) }))
    const from = groups.find(g => (g.field_keys || []).includes(key))
    const tgt = next.find(g => g.id === toGroupId)
    const i = beforeKey ? tgt.field_keys.indexOf(beforeKey) : -1
    if (i >= 0) tgt.field_keys.splice(i, 0, key); else tgt.field_keys.push(key)
    setGroups(next)
    try { await saveKeys(toGroupId, tgt.field_keys); if (from && from.id !== toGroupId) await saveKeys(from.id, next.find(g => g.id === from.id).field_keys); onChanged?.() }
    catch { toast('error', 'Não foi possível salvar a ordem.'); loadGroups() }
  }
  const dropGroup = async (beforeId: number) => {
    if (dragGroup == null || dragGroup === beforeId) return setDragGroup(null)
    const order = groups.map(g => g.id).filter(id => id !== dragGroup)
    order.splice(order.indexOf(beforeId), 0, dragGroup)
    setDragGroup(null)
    setGroups(order.map(id => groups.find(g => g.id === id)))
    for (const [i, id] of order.entries()) await api.put(`/contact_field_groups/${id}`, { contact_field_group: { position: i } })
    onChanged?.()
  }
  const createGroup = async () => {
    const name = (newGroup || '').trim(); setNewGroup(null)
    if (!name) return
    const { data } = await api.post('/contact_field_groups', { contact_field_group: { name, field_keys: [] } })
    await done(); setActive(data.id)
  }
  const renameGroup = async () => {
    if (!renaming) return
    const { id, name } = renaming; setRenaming(null)
    if (name.trim()) { await api.put(`/contact_field_groups/${id}`, { contact_field_group: { name: name.trim() } }); done() }
  }
  const deleteGroup = async (g: any) => {
    if (!(await confirmBox(`Excluir o grupo ${g.name}?`, 'Os campos dele não são apagados.'))) return
    await api.delete(`/contact_field_groups/${g.id}`); done()
  }

  return (
    <>
      {!inline && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 85 }} />}
      <aside className="k-fields-panel" style={{ ...(inline ? { position: 'relative', width: '100%', maxWidth: 560, borderRadius: 3, overflow: 'hidden' } : { position: 'fixed', top: 0, bottom: 0, left: 'var(--k-panel-left, 240px)', width: 'min(495px, 100vw)' }), background: '#f5f5f5', zIndex: 86, display: 'flex', flexDirection: 'column', fontFamily: K.font, color: K.text, boxShadow: '4px 0 20px rgba(0,0,0,.2)' }}>
        <div style={{ background: '#1f3949', color: '#fff', padding: '22px 32px 12px', flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 400 }}>Campos e grupos</h2>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#aab4be', lineHeight: 1.4 }}>Você pode adicionar seus próprios campos personalizados. Eles são ótimos para filtrar dados e compilar relatórios.</p>
            </div>
            {!inline && <button title="Fechar" onClick={onClose} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}><X size={30} strokeWidth={1.5} /></button>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 20 }}>
            {groups.map((g, i) => (
              <div key={g.id} draggable={!renaming} onDragStart={() => setDragGroup(g.id)} onDragOver={e => e.preventDefault()} onDrop={() => (drag ? dropField(null, g.id) : dropGroup(g.id))}
                onClick={() => { setActive(g.id); setEditing(null) }} onDoubleClick={() => setRenaming({ id: g.id, name: g.name })}
                title="Clique para abrir · dois cliques para renomear · arraste para reordenar"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px 0 4px', borderRadius: 3, cursor: 'pointer', background: g.id === active ? '#2e4a5c' : 'transparent', fontSize: 14.5, fontWeight: 700, color: g.id === active ? '#fff' : '#aab4be' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{[0, 1, 2].map(k => <span key={k} style={{ width: 3, height: 3, borderRadius: '50%', background: '#fff' }} />)}</span>
                {renaming?.id === g.id
                  ? <input autoFocus value={renaming?.name ?? ''} onChange={e => setRenaming({ id: g.id, name: e.target.value })} onBlur={renameGroup} onKeyDown={e => { if (e.key === 'Enter') renameGroup(); if (e.key === 'Escape') setRenaming(null) }} style={{ width: 110, border: 'none', background: '#fff', color: K.text, fontFamily: K.font, fontSize: 14, padding: '2px 4px' }} />
                  : g.name}
                {i > 0 && g.id === active && <button title="Excluir grupo" onClick={e => { e.stopPropagation(); deleteGroup(g) }} style={{ border: 'none', background: 'none', color: '#aab4be', cursor: 'pointer', display: 'flex', padding: 0 }}><X size={13} /></button>}
              </div>
            ))}
            {newGroup !== null
              ? <input autoFocus value={newGroup} placeholder="Nome do grupo" onChange={e => setNewGroup(e.target.value)} onBlur={createGroup} onKeyDown={e => { if (e.key === 'Enter') createGroup(); if (e.key === 'Escape') setNewGroup(null) }} style={{ width: 130, height: 28, border: 'none', borderRadius: 3, padding: '0 8px', fontFamily: K.font, fontSize: 14 }} />
              : <button title="Adicionar grupo" onClick={() => setNewGroup('')} style={{ width: 30, height: 30, border: '1px dashed #6b7e8c', borderRadius: 3, background: 'none', color: '#aab4be', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px 40px' }}>
          {group && (
            <div onDragOver={e => e.preventDefault()} onDrop={() => dropField(null)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(group.field_keys || []).map((k: string) => {
                const f = fieldOf(k)
                if (!f) return null
                if (editing === k) return <FieldEditor key={k} field={f} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done() }} />
                const prev = WITH_OPTIONS.includes(f.type) ? `${(f.options || []).length} variantes` : f.type === 'price' ? 'R$0' : display(f, '') || '...'
                return (
                  <div key={k} draggable onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); dropField(k) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: -14, opacity: drag === k ? 0.4 : 1 }}>
                    {grip()}
                    <button onClick={() => setEditing(k)} style={{ ...boxStyle, flex: 1, padding: '0 8px', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 155, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}{(f.required_stages || []).length > 0 && <span style={{ color: '#e53935' }}> *</span>}</span>
                      <span style={{ flex: 1, color: K.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.hidden ? 'oculto' : f.api_only ? 'apenas API' : prev}</span>
                    </button>
                  </div>
                )
              })}
              {editing === '__new'
                ? <FieldEditor groupId={group.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); done() }} />
                : <button onClick={() => setEditing('__new')} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, height: 33, padding: '0 10px', border: '1px dashed #c3c7cc', borderRadius: 3, background: 'none', color: K.muted, fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}><Plus size={15} /> Adicionar campo</button>}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '32px 0 12px' }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#e3e5e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a7adb2', fontSize: 18 }}><Users size={18} /></span>
            <b style={{ fontSize: 18, fontWeight: 700, color: '#8a9196' }}>Campo do contato</b>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CONTACT_FIXED.map(n => <div key={n} title="Campo padrão do contato" style={{ ...boxStyle, padding: '0 8px' }}><span style={{ width: 155 }}>{n}</span><span style={{ color: K.muted }}>...</span></div>)}
          </div>
        </div>
      </aside>
    </>
  )
}

/** Editor que abre dentro da lista (igual ao Kommo). Sem `field` = campo novo. */
function FieldEditor({ field, groupId, onClose, onSaved }: { field?: any; groupId?: number; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState(field?.type || 'text')
  const [label, setLabel] = useState(field?.label || '')
  const [options, setOptions] = useState<string[]>(field?.options || [])
  const [apiOnly, setApiOnly] = useState(!!field?.api_only)
  const [visible, setVisible] = useState(!field?.hidden)
  const [required, setRequired] = useState<string[]>(field?.required_stages || [])
  const [reqOn, setReqOn] = useState((field?.required_stages || []).length > 0)
  const [reqOpen, setReqOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [pipes, setPipes] = useState<any[]>([])
  const [dragOpt, setDragOpt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const reqRef = useClickOutside<HTMLDivElement>(() => setReqOpen(false), reqOpen)
  useEffect(() => { if (!reqOpen) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setReqOpen(false) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [reqOpen])
  const typeRef = useClickOutside<HTMLDivElement>(() => setTypeOpen(false), typeOpen)
  useEffect(() => { api.get('/pipelines').then(r => setPipes(r.data)).catch(() => {}) }, [])
  const builtin = !!field?.builtin
  const stages: { ref: string; name: string; color: string }[] = [
    ...Object.entries({ ...ACTIVE_STATUS_LABELS, ...INACTIVE_STATUS_LABELS }).map(([k, n]) => ({ ref: 'status:' + k, name: `Consignado › ${n}`, color: '#d6eaff' })),
    ...pipes.flatMap(p => p.pipeline_stages.map((s: any) => ({ ref: 'stage:' + s.id, name: `${p.name} › ${s.name}`, color: s.color || '#99ccff' }))),
  ]
  const allOn = stages.length > 0 && stages.every(s => required.includes(s.ref))

  const save = async () => {
    const opts = options.map(o => o.trim()).filter(Boolean)
    const body: any = { options: opts, required_stages: reqOn ? required : [], api_only: apiOnly, hidden: !visible }
    if (!builtin) { body.label = label; body.type = type }
    setSaving(true)
    try {
      if (field) await api.put(`/contact_custom_fields/${field.key}`, body)
      else await api.post('/contact_custom_fields', { ...body, group_id: groupId })
      toast('success', field ? 'Campo salvo.' : 'Campo criado.'); onSaved()
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível salvar o campo.') } finally { setSaving(false) }
  }
  const del = async () => {
    if (!(await confirmBox(`Excluir o campo ${field.label}?`, 'Os dados guardados nesse campo em todos os leads serão perdidos.'))) return
    try { await api.delete(`/contact_custom_fields/${field.key}`); onSaved() } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível excluir.') }
  }
  const moveOpt = (to: number) => {
    if (dragOpt == null || dragOpt === to) return
    const next = [...options]; const [o] = next.splice(dragOpt, 1); next.splice(to, 0, o); setOptions(next); setDragOpt(null)
  }
  const inp: React.CSSProperties = { height: 33, border: '1px solid #d5d8db', borderRadius: 3, padding: '0 8px', fontFamily: K.font, fontSize: 14, color: K.text, background: '#fff', boxSizing: 'border-box' }
  const chk = (on: boolean, set: (v: boolean) => void, label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, cursor: 'pointer', padding: '4px 0' }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 17, height: 17, accentColor: '#313942' }} />{label}
    </label>
  )

  return (
    <div style={{ background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.18)', margin: '0 -10px', fontFamily: K.font }}>
      <div style={{ padding: '10px 14px 12px' }}>
        {field ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: K.muted, marginBottom: 8 }}>
            {TYPE_LABELS[field.type] || 'Texto curto'}, ID: {field.key}
            <button title="Copiar ID" onClick={() => { navigator.clipboard?.writeText(field.key); toast('success', 'ID copiado.') }} style={{ border: 'none', background: 'none', padding: 0, color: K.muted, cursor: 'pointer', display: 'flex' }}><Copy size={12} /></button>
          </div>
        ) : (
          <div ref={typeRef} style={{ position: 'relative', width: 142, marginBottom: 8 }}>
            <button onClick={() => setTypeOpen(o => !o)} style={{ ...inp, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>{TYPE_LABELS[type]}<span style={{ color: K.muted }}>⌄</span></button>
            {typeOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, width: 200, maxHeight: 300, overflowY: 'auto', background: '#fff', border: '1px solid #d5d8db', boxShadow: '0 4px 14px rgba(0,0,0,.15)' }}>
                {Object.entries(TYPE_LABELS).map(([k, l]) => <button key={k} onClick={() => { setType(k); setTypeOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: k === type ? '#fcf0f3' : '#fff', padding: '7px 12px', fontFamily: K.font, fontSize: 14, cursor: 'pointer' }}>{l}</button>)}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input autoFocus={!field} disabled={builtin} value={label} onChange={e => setLabel(e.target.value)} placeholder={field ? '' : 'Nome do campo'} style={{ ...inp, width: 142, flex: 'none', background: builtin ? '#f5f5f5' : '#fff' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {WITH_OPTIONS.includes(type) ? (
              <>
                {options.map((o, i) => (
                  <div key={i} draggable onDragStart={() => setDragOpt(i)} onDragOver={e => e.preventDefault()} onDrop={() => moveOpt(i)} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    {grip('Arraste para reordenar')}
                    <div style={{ ...inp, flex: 1, display: 'flex', alignItems: 'center', padding: 0 }}>
                      <input value={o} placeholder="Opção" autoFocus={!o} onChange={e => setOptions(os => os.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '0 8px', fontFamily: K.font, fontSize: 14, background: 'none' }} />
                      <button title="Excluir opção" onClick={() => setOptions(os => os.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#f37575', cursor: 'pointer', padding: '0 8px', display: 'flex' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setOptions(os => [...os, ''])} style={{ border: 'none', background: 'none', color: K.muted, textDecoration: 'underline', fontFamily: K.font, fontSize: 14, cursor: 'pointer', padding: '0 0 0 18px' }}>Adicionar opção</button>
              </>
            ) : <span style={{ display: 'block', paddingTop: 7, color: K.muted }}>...</span>}
          </div>
        </div>
      </div>
      <div style={{ background: '#f5f5f5', borderTop: '1px solid #e3e5e8', padding: '12px 14px' }}>
        {chk(apiOnly, setApiOnly, 'Apenas API')}
        <div ref={reqRef} style={{ position: 'relative' }}>
          {chk(reqOn, v => { setReqOn(v); setReqOpen(v) }, 'Obrigatório para etapas selecionadas')}
          {reqOn && <button onClick={() => setReqOpen(o => !o)} style={{ border: 'none', background: 'none', color: K.link, fontFamily: K.font, fontSize: 13, cursor: 'pointer', padding: '0 0 4px 25px' }}>{required.length ? `${required.length} etapa(s) selecionada(s)` : 'Escolher etapas'}</button>}
          {reqOpen && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 28, zIndex: 10, background: '#fff', border: '1px solid #d5d8db', boxShadow: '0 4px 14px rgba(0,0,0,.15)', maxHeight: 260, overflowY: 'auto' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 13.5, color: K.muted, cursor: 'pointer', borderBottom: '1px solid #e3e5e8' }}>
                <input type="checkbox" checked={allOn} onChange={e => setRequired(e.target.checked ? stages.map(s => s.ref) : [])} />Etapas
              </label>
              {stages.map(s => (
                <label key={s.ref} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 14, background: s.color, cursor: 'pointer' }}>
                  <input type="checkbox" checked={required.includes(s.ref)} onChange={() => setRequired(r => (r.includes(s.ref) ? r.filter(x => x !== s.ref) : [...r, s.ref]))} />{s.name}
                </label>
              ))}
              <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e3e5e8', padding: '6px 10px', textAlign: 'right' }}>
                <button onClick={() => setReqOpen(false)} style={{ height: 28, padding: '0 14px', border: 'none', borderRadius: 3, background: K.blue, color: '#fff', fontFamily: K.font, fontWeight: 700, cursor: 'pointer' }}>OK</button>
              </div>
            </div>
          )}
        </div>
        {chk(visible, setVisible, 'Visível')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button disabled={saving || (!builtin && !label.trim())} onClick={save} style={{ height: 36, padding: '0 18px', border: '1px solid #c3c7cc', borderRadius: 3, background: '#fff', fontFamily: K.font, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontFamily: K.font, fontSize: 14, fontWeight: 700, color: K.muted, cursor: 'pointer' }}>Cancelar</button>
          <span style={{ flex: 1 }} />
          {field && !builtin && <button onClick={del} style={{ border: 'none', background: 'none', fontFamily: K.font, fontSize: 13.5, color: K.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>Excluir campo <Trash2 size={14} color="#f37575" /></button>}
        </div>
      </div>
    </div>
  )
}

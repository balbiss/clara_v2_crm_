import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import api from '../../api'
import { btn, inputStyle, labelStyle } from '../../components/ui'
import { PageHead, Section, IconBtn, toast, confirmBox } from '../../components/ui2'
import { useContactFields } from '../../composables/useContactFields'

// Campos do Contato: grupos configuráveis do painel de conversa + campos criados pela dona.
// "Dados do Jueri" nunca entra aqui (sincronizado do ERP, fica sempre separado).
/* eslint-disable @typescript-eslint/no-explicit-any */
const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 11px', borderRadius: 20, background: 'var(--terraSoft)', color: 'var(--terra)', fontSize: 12.5, fontWeight: 600 } as const
const chipX = { border: 'none', background: 'none', color: 'inherit', display: 'flex', padding: 2 } as const

export default function ContactFieldGroups() {
  const { customFields, allFields, labelOf, reloadCustomFields } = useContactFields()
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try { setGroups((await api.get('/contact_field_groups')).data) } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const patchGroup = (id: number, patch: any) => setGroups(gs => gs.map(g => (g.id === id ? { ...g, ...patch } : g)))
  const ownerOf = (key: string) => groups.find(g => (g.field_keys || []).includes(key))
  const unassigned = (() => {
    const assigned = new Set(groups.flatMap(g => g.field_keys || []))
    return allFields.map((f: any) => f.key).filter((k: string) => !assigned.has(k))
  })()

  const addGroup = async () => {
    try { const { data } = await api.post('/contact_field_groups', { contact_field_group: { name: 'Novo grupo', field_keys: [] } }); setGroups(gs => [...gs, data]) }
    catch { toast('error', 'Erro ao criar grupo.') }
  }
  const rename = async (g: any, value: string) => {
    const name = value.trim()
    if (!name || name === g.name) return
    try { await api.put(`/contact_field_groups/${g.id}`, { contact_field_group: { name } }); patchGroup(g.id, { name }) }
    catch { toast('error', 'Erro ao renomear grupo.') }
  }
  const removeGroup = async (g: any) => {
    if (!(await confirmBox(`Apagar o grupo "${g.name}"?`, 'Os campos dele voltam pra "Outros" na tela de conversa, sem perder nenhum dado.', 'Sim, apagar'))) return
    try { await api.delete(`/contact_field_groups/${g.id}`); setGroups(gs => gs.filter(x => x.id !== g.id)) }
    catch { toast('error', 'Erro ao apagar grupo.') }
  }
  const removeField = async (g: any, key: string) => {
    const keys = (g.field_keys || []).filter((k: string) => k !== key)
    try { await api.put(`/contact_field_groups/${g.id}`, { contact_field_group: { field_keys: keys } }); patchGroup(g.id, { field_keys: keys }) }
    catch { toast('error', 'Erro ao remover campo.') }
  }
  // mover pra este grupo — se estava em outro, tira de lá antes (senão aparece duplicado na conversa)
  const addField = async (g: any, key: string) => {
    if (!key || (g.field_keys || []).includes(key)) return
    const source = ownerOf(key)
    try {
      if (source && source.id !== g.id) {
        const sk = source.field_keys.filter((k: string) => k !== key)
        await api.put(`/contact_field_groups/${source.id}`, { contact_field_group: { field_keys: sk } })
        patchGroup(source.id, { field_keys: sk })
      }
      const keys = [...(g.field_keys || []), key]
      await api.put(`/contact_field_groups/${g.id}`, { contact_field_group: { field_keys: keys } })
      patchGroup(g.id, { field_keys: keys })
    } catch { toast('error', 'Erro ao mover campo.') }
  }
  const createField = async () => {
    const label = newLabel.trim()
    if (!label || creating) return
    setCreating(true)
    try {
      await api.post('/contact_custom_fields', { label })
      setNewLabel('')
      await reloadCustomFields()
      toast('success', `Campo "${label}" criado. Agora coloque ele num grupo.`)
    } catch (e: any) { toast('error', e.response?.data?.message || 'Erro ao criar campo.') }
    finally { setCreating(false) }
  }
  const deleteField = async (f: any) => {
    if (!(await confirmBox(`Apagar o campo "${f.label}"?`, 'Ele some da tela, mas o que já foi preenchido nas revendedoras não é apagado.', 'Sim, apagar'))) return
    try {
      await api.delete(`/contact_custom_fields/${f.key}`)
      await reloadCustomFields()
      setGroups(gs => gs.map(g => ({ ...g, field_keys: (g.field_keys || []).filter((k: string) => k !== f.key) })))
    } catch { toast('error', 'Erro ao apagar campo.') }
  }

  return (
    <div>
      <PageHead title="Campos do contato" subtitle={'Organize os campos comerciais do painel de conversa em grupos. "Dados do Jueri (sincronizado)" não entra aqui — vem do ERP e fica sempre separado.'}>
        <button onClick={addGroup} style={btn('primary')}><Plus size={15} /> Novo grupo</button>
      </PageHead>

      <Section title="Campos criados por você" description={'Precisa de uma informação que não está na lista (ex.: "Mais vende", "Precisa ter na maleta")? Crie aqui e depois coloque no grupo que quiser.'}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {customFields.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum campo criado ainda.</span>}
          {customFields.map((f: any) => <span key={f.key} style={chip}>{f.label}<button title="Apagar campo" onClick={() => deleteField(f)} style={chipX}><X size={13} /></button></span>)}
        </div>
        <form onSubmit={e => { e.preventDefault(); createField() }} style={{ display: 'flex', gap: 8 }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} maxLength={60} placeholder="Nome do novo campo" style={inputStyle} />
          <button type="submit" disabled={!newLabel.trim() || creating} style={btn('primary', { opacity: newLabel.trim() ? 1 : 0.5 })}><Plus size={14} /> Criar campo</button>
        </form>
      </Section>

      {loading ? <p style={{ color: 'var(--muted)' }}>Carregando…</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {groups.map(g => (
              <div key={g.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input defaultValue={g.name} key={g.name} onBlur={e => rename(g, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} style={{ ...inputStyle, fontWeight: 700 }} />
                  <IconBtn title="Apagar grupo" danger onClick={() => removeGroup(g)}><Trash2 size={14} /></IconBtn>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, minHeight: 28 }}>
                  {(g.field_keys || []).length === 0 && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum campo neste grupo ainda.</span>}
                  {(g.field_keys || []).map((key: string) => <span key={key} style={chip}>{labelOf(key)}<button onClick={() => removeField(g, key)} style={chipX}><X size={13} /></button></span>)}
                </div>
                <span style={labelStyle}>Adicionar campo</span>
                <select value="" onChange={e => addField(g, e.target.value)} style={inputStyle}>
                  <option value="" disabled>+ Escolher campo…</option>
                  {allFields.map((f: any) => { const o = ownerOf(f.key); return <option key={f.key} value={f.key}>{o ? `${labelOf(f.key)} (em: ${o.name})` : labelOf(f.key)}</option> })}
                </select>
              </div>
            ))}
          </div>
          {groups.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhum grupo criado ainda.</p>}
          {unassigned.length > 0 && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)', background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 10, padding: '10px 14px' }}>Campos sem grupo (aparecem em "Outros" na conversa): {unassigned.map(labelOf).join(', ')}</p>}
        </>
      )}
    </div>
  )
}

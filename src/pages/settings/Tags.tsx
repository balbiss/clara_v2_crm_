import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Tag as TagIcon } from 'lucide-react'
import api from '../../api'
import { Modal, btn, inputStyle, labelStyle, Tag } from '../../components/ui'
import { PageHead, IconBtn, toast, confirmBox } from '../../components/ui2'

// Etiquetas da conta (só diretoria cria/edita/apaga; todos usam)
/* eslint-disable @typescript-eslint/no-explicit-any */
const COLORS = ['#123C87', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#475569', '#db2777', '#0d9488']

export default function Tags() {
  const [tags, setTags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>(null)

  const load = async () => {
    try { setTags((await api.get('/tags')).data) } catch (e) { console.error('Erro ao buscar etiquetas:', e) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name.trim()) return
    try {
      if (form.id) await api.put(`/tags/${form.id}`, { tag: form })
      else await api.post('/tags', { tag: form })
      setForm(null)
      load()
      window.dispatchEvent(new Event('tags-updated'))
    } catch (e: any) {
      toast('error', e.response?.data?.name ? 'Já existe uma etiqueta com esse nome.' : 'Erro ao salvar a etiqueta.')
    }
  }
  const remove = async (t: any) => {
    if (!(await confirmBox('Apagar etiqueta?', 'Ela será removida de todos os contatos e conversas que a possuem.', 'Sim, apagar'))) return
    try { await api.delete(`/tags/${t.id}`); load(); window.dispatchEvent(new Event('tags-updated')) } catch { toast('error', 'Erro ao excluir.') }
  }

  return (
    <div>
      <PageHead title="Etiquetas" subtitle={`${tags.length} etiqueta${tags.length === 1 ? "" : "s"} · organize contatos e conversas. Todos podem usar; só a diretoria cria, edita e apaga.`}>
        <button onClick={() => setForm({ id: null, name: '', color: COLORS[0] })} style={btn('primary')}><Plus size={15} /> Nova etiqueta</button>
      </PageHead>
      {loading ? <p style={{ color: 'var(--muted)' }}>Carregando…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
          {tags.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 12px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: t.color + '1f', color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><TagIcon size={14} /></span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}><Tag name={t.name} color={t.color} /></span>
              <IconBtn title="Editar" onClick={() => setForm({ ...t })}><Pencil size={13} /></IconBtn>
              <IconBtn title="Excluir" danger onClick={() => remove(t)}><Trash2 size={13} /></IconBtn>
            </div>
          ))}
          <button onClick={() => setForm({ id: null, name: '', color: COLORS[0] })}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, minHeight: 52, border: '1.5px dashed var(--line)', borderRadius: 10, background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Nova etiqueta
          </button>
        </div>
      )}
      {form && (
        <Modal title={form.id ? 'Editar etiqueta' : 'Nova etiqueta'} width={420} onClose={() => setForm(null)}
          footer={<><button onClick={() => setForm(null)} style={btn('ghost')}>Cancelar</button><button onClick={save} style={btn('primary')}>Salvar</button></>}>
          <span style={labelStyle}>Nome</span>
          <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="Ex: VIP, Importante, Fechamento…" style={{ ...inputStyle, marginBottom: 16 }} />
          <span style={labelStyle}>Cor</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {COLORS.map(c => <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--ink)' : '3px solid transparent' }} />)}
            <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} title="Cor personalizada" style={{ width: 34, height: 28, border: '1px solid var(--line)', borderRadius: 6, padding: 0, background: 'none' }} />
          </div>
          <div style={{ marginTop: 16 }}><Tag name={form.name || 'Pré-visualização'} color={form.color} /></div>
        </Modal>
      )}
    </div>
  )
}

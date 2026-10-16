import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import api from '../../api'
import { Modal, btn, inputStyle, labelStyle, Tag } from '../../components/ui'
import { PageHead, DataTable, IconBtn, toast, confirmBox } from '../../components/ui2'

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
      <PageHead title="Etiquetas" subtitle="Organize contatos e conversas. Todos podem usar; só a diretoria cria, edita e apaga.">
        <button onClick={() => setForm({ id: null, name: '', color: COLORS[0] })} style={btn('primary')}><Plus size={15} /> Nova etiqueta</button>
      </PageHead>
      <DataTable loading={loading} empty="Nenhuma etiqueta criada ainda."
        columns={[{ label: 'Etiqueta' }, { label: 'Ações', width: 110, align: 'right' }]}
        rows={tags.map(t => [
          <Tag key="t" name={t.name} color={t.color} />,
          <span key="a" style={{ display: 'inline-flex', gap: 6 }}>
            <IconBtn title="Editar" onClick={() => setForm({ ...t })}><Pencil size={14} /></IconBtn>
            <IconBtn title="Excluir" danger onClick={() => remove(t)}><Trash2 size={14} /></IconBtn>
          </span>,
        ])} />
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

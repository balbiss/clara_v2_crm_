import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Paperclip, FileText, X, MessageSquareText } from 'lucide-react'
import api from '../../api'
import { Modal, btn, inputStyle, labelStyle } from '../../components/ui'
import { PageHead, IconBtn, Badge, toast, confirmBox } from '../../components/ui2'

// Modelos de mensagem ("/" na conversa). Pode ser só anexo, sem texto.
/* eslint-disable @typescript-eslint/no-explicit-any */
const kindOf = (file?: File | null, type?: string | null) => {
  const t = file?.type || type || ''
  return t.startsWith('image/') ? 'image' : t.startsWith('audio/') ? 'audio' : t.startsWith('video/') ? 'video' : 'file'
}
const EMPTY = { id: null, nome: '', categoria: '', mensagem: '', attachment_url: null, attachment_type: null }

export default function MessageTemplates() {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [removeAtt, setRemoveAtt] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(() => (newFile ? URL.createObjectURL(newFile) : null), [newFile])

  const load = async () => {
    try { setList((await api.get('/message_templates')).data) } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const open = (t?: any) => { setNewFile(null); setRemoveAtt(false); setForm(t ? { ...t } : { ...EMPTY }) }
  const hasAtt = !!newFile || (form?.attachment_url && !removeAtt)
  const save = async () => {
    if (!form.nome.trim() || (!form.mensagem.trim() && !hasAtt)) return
    try {
      const fd = new FormData()
      fd.append('message_template[nome]', form.nome)
      fd.append('message_template[categoria]', form.categoria || '')
      fd.append('message_template[mensagem]', form.mensagem || '')
      if (newFile) fd.append('message_template[attachment]', newFile)
      if (removeAtt) fd.append('message_template[remove_attachment]', 'true')
      const cfg = { headers: { 'Content-Type': undefined } }
      if (form.id) await api.put(`/message_templates/${form.id}`, fd, cfg)
      else await api.post('/message_templates', fd, cfg)
      setForm(null)
      load()
    } catch { toast('error', 'Erro ao salvar o modelo.') }
  }
  const remove = async (t: any) => {
    if (!(await confirmBox('Apagar modelo?', `"${t.nome}" deixa de aparecer no "/" das conversas.`, 'Sim, apagar'))) return
    try { await api.delete(`/message_templates/${t.id}`); load() } catch { toast('error', 'Erro ao excluir.') }
  }

  const media = (kind: string, src: string) => kind === 'image' ? <img src={src} style={{ height: 56, borderRadius: 6 }} />
    : kind === 'audio' ? <audio src={src} controls style={{ height: 32, maxWidth: 230 }} />
    : kind === 'video' ? <video src={src} controls style={{ height: 70, maxWidth: 230 }} /> : null

  return (
    <div>
      <PageHead title="Modelos de mensagem" subtitle={'Digite "/" no campo de mensagem da conversa para usar um modelo salvo aqui.'}>
        <button onClick={() => open()} style={btn('primary')}><Plus size={15} /> Novo modelo</button>
      </PageHead>
      {loading ? <p style={{ color: 'var(--muted)' }}>Carregando…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
          {list.map(t => (
            <div key={t.id} onClick={() => open(t)} className="hoverable" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 12px 14px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, cursor: 'pointer', minHeight: 112 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--terraSoft)', color: 'var(--terra)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><MessageSquareText size={14} /></span>
                <b style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{t.nome}</b>
                <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 4 }}>
                  <IconBtn title="Editar" onClick={() => open(t)}><Pencil size={13} /></IconBtn>
                  <IconBtn title="Excluir" danger onClick={() => remove(t)}><Trash2 size={13} /></IconBtn>
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>{t.mensagem || <i>Só anexo, sem texto</i>}</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t.categoria && <Badge tone="blue">{t.categoria}</Badge>}
                {t.attachment_url && <Badge><Paperclip size={10} style={{ verticalAlign: -1 }} /> Anexo</Badge>}
              </div>
            </div>
          ))}
          <button onClick={() => open()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 112, border: '1.5px dashed var(--line)', borderRadius: 12, background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Novo modelo
          </button>
        </div>
      )}
      {form && (
        <Modal title={form.id ? 'Editar modelo' : 'Novo modelo'} width={520} onClose={() => setForm(null)}
          footer={<><button onClick={() => setForm(null)} style={btn('ghost')}>Cancelar</button><button onClick={save} style={btn('primary')}>Salvar</button></>}>
          <span style={labelStyle}>Nome (usado na busca pelo "/")</span>
          <input autoFocus value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Boas-vindas, Cobrança…" style={{ ...inputStyle, marginBottom: 14 }} />
          <span style={labelStyle}>Categoria (opcional)</span>
          <input value={form.categoria || ''} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex: Comercial, Financeiro…" style={{ ...inputStyle, marginBottom: 14 }} />
          <span style={labelStyle}>Mensagem (opcional se tiver anexo)</span>
          <textarea value={form.mensagem || ''} onChange={e => setForm({ ...form, mensagem: e.target.value })} rows={5} placeholder="Texto enviado quando escolher esse modelo…" style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }} />
          <span style={labelStyle}>Anexo (opcional — imagem, PDF, áudio ou vídeo)</span>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,audio/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setNewFile(f); setRemoveAtt(false) } }} />
          {newFile || (form.attachment_url && !removeAtt) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)' }}>
              {newFile ? (media(kindOf(newFile), previewUrl!) || <FileText size={18} />) : (media(kindOf(null, form.attachment_type), form.attachment_url) || <a href={form.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><FileText size={16} /> Ver anexo</a>)}
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{newFile?.name}</span>
              <button onClick={() => { setNewFile(null); setRemoveAtt(true); if (fileRef.current) fileRef.current.value = '' }} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><X size={15} /></button>
            </div>
          ) : <button type="button" onClick={() => fileRef.current?.click()} style={btn('ghost', { fontSize: 12.5 })}><Paperclip size={14} /> Escolher anexo</button>}
        </Modal>
      )}
    </div>
  )
}

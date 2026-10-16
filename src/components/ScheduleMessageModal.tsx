import { useEffect, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { Paperclip, X } from 'lucide-react'
import api from '../api'
import { Modal, btn, inputStyle, labelStyle } from './ui'

// Agendar mensagem (o envio sai pela varredura de agendadas no servidor)
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ScheduleMessageModal({ isOpen, conversationId, onClose, onScheduled }: { isOpen: boolean; conversationId?: number; onClose: () => void; onScheduled: (m: any) => void }) {
  const [sendAt, setSendAt] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setText(''); setFile(null); setPreview(null)
    const now = new Date() // padrão: daqui a 5 minutos, no fuso local
    now.setMinutes(now.getMinutes() + 5 - now.getTimezoneOffset())
    setSendAt(now.toISOString().slice(0, 16))
  }, [isOpen])

  if (!isOpen) return null
  const pick = (f?: File) => {
    if (!f) return
    setFile(f)
    if (f.type.startsWith('image/')) { const r = new FileReader(); r.onload = ev => setPreview(ev.target?.result as string); r.readAsDataURL(f) }
    else setPreview(null)
  }
  const submit = async () => {
    if (!conversationId || !sendAt || (!text.trim() && !file)) return
    setBusy(true)
    try {
      const fd = new FormData()
      if (text) fd.append('text', text)
      fd.append('send_at', new Date(sendAt).toISOString())
      if (file) fd.append('attachment', file)
      onScheduled((await api.post(`/conversations/${conversationId}/scheduled_messages`, fd, { headers: { 'Content-Type': undefined } })).data)
      onClose()
    } catch {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao agendar a mensagem. Tente novamente.', showConfirmButton: false, timer: 3500 })
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Agendar mensagem" onClose={onClose}
      footer={<>
        <button onClick={onClose} style={btn('ghost')}>Cancelar</button>
        <button onClick={submit} disabled={busy || (!text.trim() && !file)} style={btn('primary', { opacity: text.trim() || file ? 1 : 0.5 })}>{busy ? 'Agendando…' : 'Agendar'}</button>
      </>}>
      <span style={labelStyle}>Data e hora do envio</span>
      <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
      <span style={labelStyle}>Mensagem</span>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Digite a mensagem…" style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }} />
      <span style={labelStyle}>Anexo (opcional)</span>
      <input type="file" ref={fileInput} hidden onChange={e => pick(e.target.files?.[0])} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => fileInput.current?.click()} style={btn('ghost', { fontSize: 12.5 })}><Paperclip size={14} /> Escolher arquivo</button>
        {file && <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>}
        {file && <button onClick={() => { setFile(null); setPreview(null) }} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><X size={14} /></button>}
      </div>
      {preview && <img src={preview} style={{ marginTop: 10, maxWidth: 160, borderRadius: 8 }} />}
    </Modal>
  )
}

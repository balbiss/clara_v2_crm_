import { useEffect, useRef, useState, type FormEvent } from 'react'
import Swal from 'sweetalert2'
import { X, Paperclip } from 'lucide-react'
import api from '../api'
import '../styles/vue/ScheduleMessageModal.scss'

// Porte de components/ScheduleMessageModal.vue
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ScheduleMessageModal({ isOpen, conversationId, onClose, onScheduled }: {
  isOpen: boolean; conversationId?: number; onClose: () => void; onScheduled: (m: any) => void
}) {
  const [sendAt, setSendAt] = useState('')
  const [text, setText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setText('')
    setSelectedFile(null)
    setSelectedFilePreview(null)
    // padrão: daqui a 5 minutos (no fuso local)
    const now = new Date()
    now.setMinutes(now.getMinutes() + 5)
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    setSendAt(now.toISOString().slice(0, 16))
  }, [isOpen])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setSelectedFilePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setSelectedFilePreview(null)
    }
  }

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    if (!conversationId) return
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      if (text) formData.append('text', text)
      formData.append('send_at', new Date(sendAt).toISOString())
      if (selectedFile) formData.append('attachment', selectedFile)
      const response = await api.post(`/conversations/${conversationId}/scheduled_messages`, formData, { headers: { 'Content-Type': undefined } })
      onScheduled(response.data)
      onClose()
    } catch (error) {
      console.error('Error scheduling message:', error)
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao agendar a mensagem. Tente novamente.', showConfirmButton: false, timer: 3500 })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null
  return (
    <div className="vs-ScheduleMessageModal" style={{ display: 'contents' }}>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Agendar Mensagem</h2>
            <button className="icon-btn" onClick={onClose}><X className="icon-sm" /></button>
          </div>
          <div className="modal-body">
            <form onSubmit={submitForm}>
              <div className="form-group">
                <label>Data e Hora do Envio</label>
                <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Mensagem</label>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Digite a mensagem..." required={!selectedFile}></textarea>
              </div>
              <div className="form-group attachment-section">
                <label>Anexo (Opcional)</label>
                <div className="file-input-wrapper">
                  <input type="file" ref={fileInput} onChange={handleFileChange} className="hidden-file-input" />
                  <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}><Paperclip className="icon-sm" /> Escolher Arquivo</button>
                  {selectedFile && <span className="file-name">{selectedFile.name}</span>}
                  {selectedFile && <button type="button" className="icon-btn clear-file" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}><X className="icon-xs" /></button>}
                </div>
                {selectedFilePreview && <img src={selectedFilePreview} className="preview-img-small" />}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Agendando...' : 'Agendar'}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

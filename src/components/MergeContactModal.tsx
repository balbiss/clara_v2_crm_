import { useState } from 'react'
import { useSnapshot } from 'valtio'
import Swal from 'sweetalert2'
import { conversationsStore } from '../store/conversations'
import { Modal, btn, inputStyle, labelStyle } from './ui'

// Mesclar contato: conversas vão pro contato de destino e este é apagado (lógica da v1)
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MergeContactModal({ isOpen, contact, onClose }: { isOpen: boolean; contact?: any; onClose: () => void }) {
  const store = useSnapshot(conversationsStore)
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(false)
  if (!isOpen) return null
  const seen = new Set<number>()
  const others: any[] = []
  if (contact) store.conversations.forEach((c: any) => { if (c.contact && c.contact.id !== contact.id && !seen.has(c.contact.id)) { seen.add(c.contact.id); others.push(c.contact) } })
  const close = () => { setTarget(''); onClose() }
  const merge = async () => {
    if (!contact || !target) return
    setLoading(true)
    try { await conversationsStore.mergeContact(contact.id, Number(target)); close() }
    catch { Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Erro ao mesclar contato.', showConfirmButton: false, timer: 3500 }) }
    finally { setLoading(false) }
  }
  return (
    <Modal title="Mesclar contato" onClose={close}
      subtitle={<>As conversas de <b>{contact?.name}</b> vão para o contato escolhido. <span style={{ color: '#B42318' }}>Este contato é apagado depois.</span></>}
      footer={<>
        <button onClick={close} style={btn('ghost')}>Cancelar</button>
        <button onClick={merge} disabled={!target || loading} style={btn('primary', { opacity: target ? 1 : 0.5 })}>{loading ? 'Mesclando…' : 'Confirmar mesclagem'}</button>
      </>}>
      <span style={labelStyle}>Contato de destino</span>
      <select value={target} onChange={e => setTarget(e.target.value)} style={inputStyle}>
        <option value="" disabled>Selecione um contato</option>
        {others.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email || 'sem dados'})</option>)}
      </select>
    </Modal>
  )
}

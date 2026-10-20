import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import api from '../../api'
import { toast, confirmBox } from '../../components/ui2'
import { K } from '../../lib/kommo'
import { SettingsBlock, SettingsHead, settingsInput } from '../../components/SettingsLayout'

// Motivos de venda perdida (Kommo: Funil › Venda perdida › Motivo). Usados ao soltar o lead em
// "Venda perdida" no funil.
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MotivosPerda() {
  const [list, setList] = useState<any[]>([])
  const [nome, setNome] = useState('')
  const load = async () => setList((await api.get('/loss_reasons')).data)
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!nome.trim()) return
    try { await api.post('/loss_reasons', { name: nome.trim() }); setNome(''); load() } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível adicionar.') }
  }
  const del = async (r: any) => { if (await confirmBox(`Excluir "${r.name}"?`, 'Leads já perdidos com esse motivo continuam com ele.')) { await api.delete(`/loss_reasons/${r.id}`); load() } }
  return (
    <>
      <SettingsHead title="Motivos de perda" />
      <div style={{ padding: 16 }}>
        <SettingsBlock title="Motivos dos leads de venda perdida" description="Registre os motivos pela venda perdida dos leads para identificar pontos fracos e aumentar a eficácia do seu processo de vendas.">
          {list.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${K.line}`, fontSize: 14.5 }}>
              <span style={{ flex: 1 }}>{r.name}</span>
              <button title="Excluir" onClick={() => del(r)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', display: 'flex' }}><Trash2 size={15} /></button>
            </div>
          ))}
          {!list.length && <p style={{ color: K.muted, fontSize: 14 }}>Nenhum motivo cadastrado.</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <input value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Novo motivo" style={{ ...settingsInput, flex: '1 1 220px', maxWidth: 360 }} />
            <button onClick={add} disabled={!nome.trim()} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 3, background: nome.trim() ? K.blue : '#c5cbd1', color: '#fff', fontFamily: K.font, fontWeight: 700, cursor: 'pointer' }}>Adicionar</button>
          </div>
        </SettingsBlock>
      </div>
    </>
  )
}

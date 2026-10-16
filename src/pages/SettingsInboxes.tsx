import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { RefreshCw, LogOut, Settings2, Trash2, Plus } from 'lucide-react'
import api from '../api'
import { inboxesStore } from '../store/inboxes'
import { btn, inputStyle } from '../components/ui'
import { PageHead, IconBtn, Badge, toast, confirmBox } from '../components/ui2'
import QrConnectModal from '../components/QrConnectModal'

// Lista de caixas de entrada: status ao vivo, reconectar (QR), desconectar, configurar, apagar
/* eslint-disable @typescript-eslint/no-explicit-any */
function WhatsappGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

export default function SettingsInboxes() {
  const navigate = useNavigate()
  const store = useSnapshot(inboxesStore) as any
  const [reconnect, setReconnect] = useState<any>(null)
  const [q, setQ] = useState('')
  useEffect(() => { inboxesStore.fetchInboxes() }, [])

  const remove = async (i: any) => {
    if (!(await confirmBox('Apagar a caixa?', 'A caixa é removida e a sessão do WhatsApp encerrada. As conversas e o histórico continuam guardados (só deixam de pertencer a esta caixa).', 'Sim, apagar'))) return
    try { await api.delete(`/inboxes/${i.id}`); inboxesStore.removeInbox(i.id) } catch { toast('error', 'Não foi possível apagar a caixa de entrada.') }
  }
  const disconnect = async (i: any) => {
    if (!(await confirmBox('Desconectar?', `O WhatsApp "${i.name}" vai sair, como se você deslogasse pelo celular. A caixa e o histórico continuam intactos — dá pra reconectar depois.`, 'Sim, desconectar'))) return
    try { await api.post(`/inboxes/${i.id}/disconnect`); inboxesStore.checkStatus(i.id) } catch { toast('error', 'Não foi possível desconectar. Tente novamente.') }
  }

  const list = store.inboxes.filter((i: any) => !q.trim() || `${i.name} ${i.phone_number}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div>
      <PageHead title="Caixas de entrada" subtitle="Cada caixa é um número de WhatsApp (via WAHA) por onde a equipe atende. Aqui você conecta, reconecta, configura quem tem acesso e apaga.">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar caixas…" style={{ ...inputStyle, width: 220 }} />
        <button onClick={() => navigate('/settings/inboxes/new')} style={btn('primary')}><Plus size={15} /> Adicionar caixa</button>
      </PageHead>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {store.isLoading && !store.inboxes.length && <p style={{ color: 'var(--muted)' }}>Carregando…</p>}
        {list.map((i: any) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px' }}>
            <span style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><WhatsappGlyph /></span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h3 style={{ margin: 0, fontSize: 15.5 }}>{i.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
                <span>WhatsApp · WAHA{i.phone_number ? ` · ${i.phone_number}` : ''}</span>
                <Badge tone={i.connected === true ? 'green' : i.connected === false ? 'red' : 'muted'}>{i.connected === true ? 'Conectado' : i.connected === false ? 'Desconectado' : 'Verificando…'}</Badge>
                {i.restrict_by_portfolio && <Badge tone="blue">Por carteira</Badge>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {i.connected === false && <button onClick={() => setReconnect(i)} style={btn('primary', { padding: '7px 12px', fontSize: 12.5 })}><RefreshCw size={13} /> Reconectar</button>}
              {i.connected === true && <button onClick={() => disconnect(i)} style={btn('ghost', { padding: '7px 12px', fontSize: 12.5 })}><LogOut size={13} /> Desconectar</button>}
              <IconBtn title="Configurações" onClick={() => navigate(`/settings/inboxes/${i.id}`)}><Settings2 size={15} /></IconBtn>
              <IconBtn title="Apagar" danger onClick={() => remove(i)}><Trash2 size={15} /></IconBtn>
            </div>
          </div>
        ))}
        {!store.isLoading && list.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>Nenhuma caixa de entrada configurada.</p>}
      </div>

      {reconnect && <QrConnectModal reconnect inbox={reconnect} onClose={() => { setReconnect(null); inboxesStore.fetchInboxes() }} onConnected={() => inboxesStore.checkStatus(reconnect.id)} />}
    </div>
  )
}

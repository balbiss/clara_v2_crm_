import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { RefreshCw, LogOut, Settings2, Trash2, Plus } from 'lucide-react'
import Swal from 'sweetalert2'
import api from '../api'
import { inboxesStore } from '../store/inboxes'
import { btn, inputStyle } from '../components/ui'
import { PageHead, IconBtn, Badge, toast, confirmBox } from '../components/ui2'
import QrConnectModal from '../components/QrConnectModal'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { fmtPhone } from './SettingsInboxDetail'

// Lista de caixas de entrada: status ao vivo, reconectar (QR), desconectar, configurar, apagar
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function SettingsInboxes() {
  const navigate = useNavigate()
  const store = useSnapshot(inboxesStore) as any
  const [reconnect, setReconnect] = useState<any>(null)
  const [q, setQ] = useState('')
  useEffect(() => { inboxesStore.fetchInboxes() }, [])

  const remove = async (i: any) => {
    // o dono escolhe: guardar as conversas (padrão) ou apagar tudo junto com a caixa
    const r = await Swal.fire({
      title: 'Apagar a caixa?', icon: 'warning',
      text: 'A caixa é removida e a sessão do WhatsApp encerrada. Sem marcar a opção abaixo, as conversas e o histórico continuam guardados (só deixam de pertencer a esta caixa).',
      input: 'checkbox', inputValue: 0, inputPlaceholder: 'Apagar também todas as conversas e mensagens desta caixa (não dá pra desfazer)',
      showCancelButton: true, confirmButtonText: 'Sim, apagar', cancelButtonText: 'Cancelar', confirmButtonColor: '#F86161',
    })
    if (!r.isConfirmed) return
    const apagarConversas = r.value === 1
    try {
      const res = await api.delete(`/inboxes/${i.id}`, { params: apagarConversas ? { apagar_conversas: 1 } : {} })
      inboxesStore.removeInbox(i.id)
      if (apagarConversas) toast('success', `Caixa apagada com ${res.headers['x-deleted-conversations'] || 0} conversas.`)
    } catch { toast('error', 'Não foi possível apagar a caixa de entrada.') }
  }
  const disconnect = async (i: any) => {
    if (!(await confirmBox('Desconectar?', `O WhatsApp "${i.name}" vai sair, como se você deslogasse pelo celular. A caixa e o histórico continuam intactos — dá pra reconectar depois.`, 'Sim, desconectar'))) return
    try { await api.post(`/inboxes/${i.id}/disconnect`); inboxesStore.checkStatus(i.id) } catch { toast('error', 'Não foi possível desconectar. Tente novamente.') }
  }

  const list = store.inboxes.filter((i: any) => !q.trim() || `${i.name} ${i.phone_number}`.toLowerCase().includes(q.trim().toLowerCase()))
  const on = store.inboxes.filter((i: any) => i.connected === true).length
  const off = store.inboxes.filter((i: any) => i.connected === false).length
  const stat = (n: number, label: string, color: string) => (
    <div style={{ flex: 1, minWidth: 150, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px' }}>
      <b style={{ display: 'block', fontSize: 24, color }}>{n}</b><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
    </div>
  )

  return (
    <div>
      <PageHead title="Caixas de entrada" subtitle="Cada caixa é um número de WhatsApp por onde a equipe atende. Aqui você conecta, reconecta, configura quem tem acesso e apaga.">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar caixas…" style={{ ...inputStyle, width: 220 }} />
        <button onClick={() => navigate('/settings/inboxes/new')} style={btn('primary')}><Plus size={15} /> Adicionar caixa</button>
      </PageHead>

      {store.inboxes.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {stat(store.inboxes.length, 'caixas cadastradas', 'var(--ink)')}
          {stat(on, 'conectadas', 'var(--plantao)')}
          {stat(off, 'desconectadas', off ? '#B42318' : 'var(--ink)')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {store.isLoading && !store.inboxes.length && <p style={{ color: 'var(--muted)' }}>Carregando…</p>}
        {list.map((i: any) => {
          const tone = i.connected === true ? 'green' : i.connected === false ? 'red' : 'muted'
          return (
            <div key={i.id} onClick={() => navigate(`/settings/inboxes/${i.id}`)} className="hoverable"
              style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--line)', borderLeft: '4px solid ' + (tone === 'green' ? 'var(--plantao)' : tone === 'red' ? '#E5484D' : 'var(--line)'), borderRadius: 12, padding: '16px 18px', cursor: 'pointer' }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, background: '#E8F8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><WhatsAppIcon size={28} /></span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h3 style={{ margin: 0, fontSize: 15.5 }}>{i.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
                  <span>{fmtPhone(i.phone_number) || 'Sem número'}</span>
                  <Badge tone={tone}>{i.connected === true ? 'Conectado' : i.connected === false ? 'Desconectado' : 'Verificando…'}</Badge>
                  {i.restrict_by_portfolio && <Badge tone="blue">Por carteira</Badge>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                {i.connected === false && <button onClick={() => setReconnect(i)} style={btn('primary', { padding: '7px 12px', fontSize: 12.5 })}><RefreshCw size={13} /> Reconectar</button>}
                {i.connected === true && <button onClick={() => disconnect(i)} style={btn('ghost', { padding: '7px 12px', fontSize: 12.5 })}><LogOut size={13} /> Desconectar</button>}
                <IconBtn title="Configurações" onClick={() => navigate(`/settings/inboxes/${i.id}`)}><Settings2 size={15} /></IconBtn>
                <IconBtn title="Apagar" danger onClick={() => remove(i)}><Trash2 size={15} /></IconBtn>
              </div>
            </div>
          )
        })}
        {!store.isLoading && list.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>Nenhuma caixa de entrada configurada.</p>}
      </div>

      {reconnect && <QrConnectModal reconnect inbox={reconnect} onClose={() => { setReconnect(null); inboxesStore.fetchInboxes() }} onConnected={() => inboxesStore.checkStatus(reconnect.id)} />}
    </div>
  )
}

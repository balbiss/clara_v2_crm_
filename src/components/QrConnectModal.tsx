import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import api from '../api'
import { Modal, btn } from './ui'
import { useWindowEvent } from '../lib/hooks'

// Conectar / reconectar a caixa: QR code ao vivo da WAHA, checando o status a cada 4s
// (mesmo fluxo da v1; o webhook session.status também avisa em tempo real).
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function QrConnectModal({ inbox, reconnect, onClose, onConnected }: { inbox: { id: number; name: string; phone_number?: string | null }; reconnect?: boolean; onClose: () => void; onConnected?: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const done = useRef(false)

  const markConnected = () => { if (done.current) return; done.current = true; setConnected(true); setQr(null); onConnected?.() }

  useEffect(() => {
    let alive = true
    const fetchQr = async () => {
      try {
        const { data } = await api.get(`/inboxes/${inbox.id}/qr_code`)
        if (alive && data.qr_code) { setQr(data.qr_code); setLoading(false) }
      } catch (e: any) { console.warn('Erro ao buscar QR Code:', e.message) }
    }
    fetchQr()
    const timer = setInterval(async () => {
      if (done.current) return
      try {
        const { data } = await api.get(`/inboxes/${inbox.id}/status`)
        if (!alive) return
        if (data.connected) markConnected(); else await fetchQr()
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 4000)
    // sem QR depois de um tempo: mostra o aviso em vez de ficar carregando pra sempre
    const giveUp = setTimeout(() => { if (alive) setLoading(false) }, 12000)
    return () => { alive = false; clearInterval(timer); clearTimeout(giveUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.id])

  useWindowEvent('inbox-updated', e => {
    if (e.detail?.inbox_id !== inbox.id) return
    if (e.detail.connection_status === 'open') markConnected()
  })

  return (
    <Modal title={reconnect ? 'Reconectar dispositivo' : 'Conecte o seu dispositivo'} width={420} onClose={onClose}
      subtitle={`No WhatsApp do celular: Aparelhos conectados → Conectar um aparelho → escaneie o QR code${reconnect ? ` para reconectar "${inbox.name}"` : ''}.`}
      footer={<button onClick={onClose} style={btn(connected ? 'primary' : 'ghost')}>{connected ? 'Concluir' : 'Fechar'}</button>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
        <b>{inbox.name}</b><span style={{ color: 'var(--muted)', flex: 1 }}>{inbox.phone_number}</span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: connected ? 'var(--plantao)' : '#D92D20' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 250, textAlign: 'center' }}>
        {connected ? (
          <div>
            <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--plantaoSoft)', color: 'var(--plantao)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Check size={30} /></span>
            <p style={{ fontWeight: 600, margin: '12px 0 0' }}>WhatsApp {reconnect ? 'reconectado' : 'conectado'} com sucesso!</p>
          </div>
        ) : qr ? (
          <img src={qr} alt="QR Code do WhatsApp" style={{ width: 250, height: 250, borderRadius: 8, border: '1px solid var(--line)' }} />
        ) : loading ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aguardando o QR code da API…</p>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>O QR code não está disponível agora.</p>
            Confira se a WAHA está no ar e configurada (WAHA_URL e WAHA_API_KEY). Vamos tentar de novo sozinhos a cada poucos segundos.
          </div>
        )}
      </div>
    </Modal>
  )
}

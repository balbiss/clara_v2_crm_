import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import QRCode from 'qrcode'
import api from '../api'
import { Panel, toast, confirmBox } from './ui2'

/* Configurações › Canais › caixa: liga a ligação pelo WhatsApp neste número (server/src/routes/ligacao.ts).
   O número entra como mais um aparelho conectado (lendo o QR) — não desconecta o que já está no CRM. */
export function PainelLigacao({ inboxId }: { inboxId: number }) {
  const [st, setSt] = useState<any>(null)
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = () => api.get(`/inboxes/${inboxId}/ligacao`).then(({ data }) => setSt(data)).catch(() => setSt({ erro: true }))
  useEffect(() => { void carregar() }, [inboxId])
  // esperando ler o QR: atualiza a cada 3 s (o código do WhatsApp muda sozinho)
  useEffect(() => {
    if (!st?.ligada || st.conectado) return
    const t = setInterval(carregar, 3000)
    return () => clearInterval(t)
  }, [st?.ligada, st?.conectado])
  useEffect(() => {
    if (st?.qr) QRCode.toDataURL(st.qr, { width: 260, margin: 1 }).then(setQrImg).catch(() => setQrImg(null))
    else setQrImg(null)
  }, [st?.qr])

  const ativar = async () => {
    setOcupado(true)
    try { await api.post(`/inboxes/${inboxId}/ligacao/conectar`); await carregar() }
    catch (e: any) { toast('error', 'Não foi possível.', e.response?.data?.message) }
    finally { setOcupado(false) }
  }
  const desativar = async () => {
    if (!(await confirmBox('Desligar a ligação neste número?', 'O aparelho de ligação sai do WhatsApp deste número. As mensagens continuam funcionando normal.', 'Sim, desligar'))) return
    setOcupado(true)
    try { await api.delete(`/inboxes/${inboxId}/ligacao`); await carregar() } finally { setOcupado(false) }
  }

  const btn = (cor: string): React.CSSProperties => ({ padding: '8px 14px', border: 'none', borderRadius: 3, background: cor, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' })
  return (
    <Panel icon={<Phone size={16} />} title="Ligação pelo WhatsApp" description="A equipe liga e atende ligações deste número direto no CRM, falando pelo microfone do computador.">
      {!st ? <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Carregando…</p>
        : st.erro ? <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Não foi possível ver o estado agora.</p>
        : !st.configurada ? <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>A ligação ainda não está instalada no servidor.</p>
        : !st.ligada ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <div style={{ padding: '10px 12px', background: '#fcf0f3', borderRadius: 4, marginBottom: 12 }}>
              <b>Importante: são duas conexões separadas do mesmo número.</b>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li><b>Mensagens</b>: o QR que você já leu ao criar esta caixa. Continua igual.</li>
                <li><b>Ligação</b>: um <b>segundo QR</b>, aqui embaixo. Sem ele, o botão Ligar não aparece e as ligações não tocam no CRM.</li>
              </ol>
              <span style={{ display: 'block', marginTop: 6 }}>As duas ficam no mesmo celular, como dois aparelhos conectados. Ler o QR da ligação <b>não desconecta</b> as mensagens.</span>
            </div>
            <p style={{ marginTop: 0 }}>A ligação está <b>desligada</b> neste número.</p>
            <button disabled={ocupado} onClick={ativar} style={btn('#8e2a46')}>{ocupado ? 'Preparando…' : 'Ativar ligação neste número'}</button>
          </div>
        ) : st.conectado ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <p style={{ marginTop: 0 }}><b style={{ color: '#2e7d32' }}>Ligação conectada</b>{st.numero ? ` (${st.numero})` : ''}. As duas conexões deste número estão ativas: mensagens e ligação. Nas conversas deste número aparece o botão <b>Ligar</b>, e quem ligar pra ele toca no CRM pra quem atende esta caixa.</p>
            <button disabled={ocupado} onClick={desativar} style={btn('#9aa4ad')}>Desligar a ligação</button>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <p style={{ marginTop: 0 }}>Este é o <b>QR da ligação</b> (diferente do QR das mensagens). No celular deste número: WhatsApp › <b>Aparelhos conectados</b> › <b>Conectar aparelho</b> e aponte pro código. Ele muda sozinho a cada poucos segundos.</p>
            {qrImg ? <img src={qrImg} alt="QR para conectar" style={{ width: 260, height: 260, display: 'block', border: '1px solid var(--line)' }} />
              : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ color: 'var(--muted)' }}>Gerando o código…</span><button disabled={ocupado} onClick={ativar} style={btn('#8e2a46')}>Gerar de novo</button></div>}
            <button disabled={ocupado} onClick={desativar} style={{ ...btn('#9aa4ad'), marginTop: 10 }}>Cancelar</button>
          </div>
        )}
    </Panel>
  )
}

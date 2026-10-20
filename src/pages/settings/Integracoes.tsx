import { useEffect, useState } from 'react'
import { Copy, Link2, Webhook } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import { toast } from '../../components/ui2'
import { K } from '../../lib/kommo'
import { SettingsBlock, SettingsHead, settingsInput } from '../../components/SettingsLayout'

// "Central de integrações" do Kommo, com as integrações que este CRM tem de verdade:
// Jueri (webhook de pedidos/vendas/financeiro) e o webhook genérico do Automatize.
export default function Integracoes() {
  const navigate = useNavigate()
  const [webhook, setWebhook] = useState('')
  useEffect(() => { api.get('/account').then(({ data }) => setWebhook(data.jueri_webhook_url || '')).catch(() => {}) }, [])
  const card = (icon: React.ReactNode, title: string, desc: string, body: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 14, padding: '16px 0', borderTop: `1px solid ${K.line}` }}>
      <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 6, background: '#fbe9ee', color: K.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 15.5 }}>{title}</b><p style={{ margin: '3px 0 10px', fontSize: 14, color: K.muted }}>{desc}</p>{body}</div>
    </div>
  )
  return (
    <>
      <SettingsHead title="Central de integrações" />
      <div style={{ padding: 16 }}>
        <SettingsBlock title="Integrações instaladas">
          {card(<Link2 size={20} />, 'Jueri (ERP)', 'Pedidos, vendas e financeiro chegam em tempo real e o CRM atualiza a carteira sozinho. Cadastre esta URL no Jueri em Configurações › Webhooks.', (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input readOnly value={webhook} style={{ ...settingsInput, flex: '1 1 260px', fontFamily: 'monospace', fontSize: 13 }} />
              <button onClick={() => { navigator.clipboard?.writeText(webhook); toast('success', 'URL copiada.') }} style={{ height: 36, padding: '0 14px', border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', fontFamily: K.font, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Copy size={14} /> Copiar</button>
            </div>
          ))}
          {card(<Webhook size={20} />, 'Webhooks do Automatize', 'Envie os dados do lead para qualquer sistema quando ele entrar numa etapa (ação "Enviar webhook" do Automatize).', (
            <button onClick={() => navigate('/pipelines')} style={{ border: 'none', background: 'none', padding: 0, color: K.link, textDecoration: 'underline', fontFamily: K.font, fontSize: 14.5, cursor: 'pointer' }}>Abrir os funis</button>
          ))}
        </SettingsBlock>
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft } from 'lucide-react'
import api from '../api'
import { inboxesStore } from '../store/inboxes'
import { btn, inputStyle, labelStyle, serif } from '../components/ui'
import { PageHead, toast } from '../components/ui2'
import QrConnectModal from '../components/QrConnectModal'
import { ChatAvatar } from '../components/ChatAvatar'
import { brand } from '../config/brand'

// Assistente de nova caixa: 1 canal → 2 criar → 3 quem tem acesso → 4 conectar (QR).
// Só WhatsApp via WAHA nesta versão.
/* eslint-disable @typescript-eslint/no-explicit-any */
const STEPS = [
  { id: 1, title: 'Escolha o canal', desc: `O canal que você vai integrar com o ${brand.name}.` },
  { id: 2, title: 'Criar a caixa', desc: 'Dê um nome e informe o número de WhatsApp.' },
  { id: 3, title: 'Quem tem acesso', desc: 'Escolha quem pode ver e responder por esta caixa.' },
  { id: 4, title: 'Pronto!', desc: 'Falta só conectar o aparelho.' },
]

export default function NewInbox() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', phone_number: '' })
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [showQr, setShowQr] = useState(false)

  useEffect(() => { api.get('/agents').then(({ data }) => setAgents(data.filter((a: any) => a.status === 'active'))).catch(() => {}) }, [])

  const create = async () => {
    if (creating) return // evita duas caixas com duplo clique
    if (!form.name.trim() || form.phone_number.replace(/\D/g, '').length < 10) return toast('warning', 'Informe o nome e o número com DDD.')
    setCreating(true)
    try {
      const { data } = await api.post('/inboxes', { inbox: { name: form.name.trim(), phone_number: form.phone_number, provider: 'waha' } })
      setCreated(data)
      inboxesStore.fetchInboxes()
      setStep(3)
    } catch (e: any) { toast('error', e.response?.data?.phone_number ? 'Já existe uma caixa com esse número.' : 'Não foi possível salvar a caixa de entrada.') }
    finally { setCreating(false) }
  }
  const saveAccess = async () => {
    try {
      // quem não escolher ninguém continua vendo tudo (regra da v1: sem acesso configurado = vê todas)
      await Promise.all(picked.map(id => api.post(`/inboxes/${created.id}/members`, { user_id: id })))
      setStep(4)
    } catch { toast('error', 'Erro ao salvar o acesso dos agentes.') }
  }
  const back = () => { if (step > 1 && step < 4) setStep(step - 1); else navigate('/settings/inboxes') }

  return (
    <div>
      <button onClick={back} style={{ ...btn('ghost'), marginBottom: 14, padding: '6px 12px' }}><ChevronLeft size={14} /> Anterior</button>
      <PageHead title="Nova caixa de entrada" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 28, alignItems: 'start' }} className="split-pane">
        <div className="split-aside" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
          {STEPS.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 12, padding: '10px 0', opacity: s.id > step ? 0.5 : 1 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: s.id < step ? 'var(--terra)' : s.id === step ? 'var(--terraSoft)' : 'var(--bg)', color: s.id < step ? '#fff' : 'var(--terra)', border: '1px solid ' + (s.id <= step ? 'var(--terra)' : 'var(--line)') }}>{s.id < step ? <Check size={14} /> : s.id}</span>
              <span><b style={{ display: 'block', fontSize: 13.5 }}>{s.title}</b>{s.id === step && <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{s.desc}</span>}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 28, minHeight: 280 }}>
          {step === 1 && (
            <>
              <h2 style={{ ...serif, fontSize: 24, margin: '0 0 6px' }}>Selecione o canal</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 18px' }}>Conecte um WhatsApp para receber e enviar mensagens pelo CRM.</p>
              <button onClick={() => setStep(2)} className="hoverable" style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', maxWidth: 420, padding: 16, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', textAlign: 'left' }}>
                <span style={{ width: 46, height: 46, borderRadius: 12, background: '#E7F9EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                </span>
                <span><b style={{ display: 'block', fontSize: 15 }}>WhatsApp <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20, background: 'var(--plantaoSoft)', color: 'var(--plantao)' }}>WAHA</span></b><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Atenda suas revendedoras no WhatsApp</span></span>
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <h2 style={{ ...serif, fontSize: 24, margin: '0 0 18px' }}>Criar caixa do WhatsApp</h2>
              <span style={labelStyle}>Nome da caixa de entrada</span>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Comercial Consultoras" style={{ ...inputStyle, marginBottom: 14 }} />
              <span style={labelStyle}>Número de telefone</span>
              <input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="Com DDD, ex.: 5516999999999" style={inputStyle} />
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 18px' }}>É o número do WhatsApp que será conectado. Duas caixas não podem usar o mesmo número.</p>
              <button onClick={create} disabled={creating} style={btn('primary')}>{creating ? 'Criando…' : 'Criar caixa do WhatsApp'}</button>
            </>
          )}
          {step === 3 && (
            <>
              <h2 style={{ ...serif, fontSize: 24, margin: '0 0 6px' }}>Quem tem acesso a esta caixa</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>Só quem estiver marcado vê e responde as conversas desta caixa. Gerência, diretoria e financeiro sempre enxergam tudo. Se ninguém for marcado, a caixa continua na lista de todos, mas cada consultora só vê as conversas das próprias revendedoras (dá pra ajustar depois na aba Agentes da caixa).</p>
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto', marginBottom: 18 }}>
                {agents.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--line)', background: picked.includes(a.id) ? 'var(--terraSoft)' : 'var(--card)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={picked.includes(a.id)} onChange={() => setPicked(p => p.includes(a.id) ? p.filter(x => x !== a.id) : [...p, a.id])} />
                    <ChatAvatar nome={`${a.first_name} ${a.last_name}`} foto={a.avatar_url} size={28} />
                    <span style={{ fontSize: 13.5 }}>{a.first_name} {a.last_name}</span>
                  </label>
                ))}
              </div>
              <button onClick={saveAccess} style={btn('primary')}>{picked.length ? 'Salvar acesso' : 'Continuar'}</button>
            </>
          )}
          {step === 4 && (
            <>
              <h2 style={{ ...serif, fontSize: 24, margin: '0 0 8px' }}>Sua caixa está pronta!</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 20px' }}>Agora conecte o aparelho: abra o WhatsApp do celular e escaneie o QR code. Dá pra fazer depois também, em Caixas de entrada → Reconectar.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => setShowQr(true)} style={btn('primary')}>Conectar dispositivo</button>
                <button onClick={() => navigate(`/settings/inboxes/${created.id}`)} style={btn('ghost')}>Mais configurações</button>
                <button onClick={() => navigate('/settings/inboxes')} style={btn('ghost')}>Ir para a lista</button>
              </div>
            </>
          )}
        </div>
      </div>
      {showQr && created && <QrConnectModal inbox={created} onClose={() => { setShowQr(false); inboxesStore.fetchInboxes() }} />}
    </div>
  )
}

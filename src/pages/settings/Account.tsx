import { useEffect, useState } from 'react'
import api from '../../api'
import { btn, inputStyle, labelStyle } from '../../components/ui'
import { PageHead, Section, toast } from '../../components/ui2'

// Configurações da conta (só diretoria): nome, troca de senha e URL do webhook do Jueri.
// (Meta Ads / Facebook Lead Ads ficou de fora da v2, por decisão do dono.)
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Account() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [webhook, setWebhook] = useState('')
  const [copied, setCopied] = useState(false)
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [pwBusy, setPwBusy] = useState(false)

  useEffect(() => {
    api.get('/account').then(({ data }) => { setName(data.account_name || ''); setEmail(data.email || ''); setWebhook(data.jueri_webhook_url || '') })
      .catch(e => console.error('Erro ao buscar dados da conta:', e))
  }, [])

  const saveName = async () => {
    try {
      await api.put('/account', { account: { name } })
      toast('success', 'Configurações salvas!')
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      u.account_name = name
      localStorage.setItem('user', JSON.stringify(u))
    } catch { toast('error', 'Não foi possível salvar as configurações.') }
  }
  const savePassword = async () => {
    if (!pw.current_password || !pw.password) return toast('warning', 'Preencha a senha atual e a nova senha.')
    if (pw.password !== pw.password_confirmation) return toast('warning', 'A nova senha e a confirmação não batem.')
    setPwBusy(true)
    try {
      const { data } = await api.put('/account/update_password', { user: pw })
      toast('success', data.message || 'Senha alterada com sucesso!')
      setPw({ current_password: '', password: '', password_confirmation: '' })
    } catch (e: any) { toast('error', e.response?.data?.error || 'Erro ao alterar senha. Tente novamente.') }
    finally { setPwBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(webhook); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* sem permissão */ }
  }
  const field = (label: string, input: React.ReactNode) => <div style={{ marginBottom: 14 }}><span style={labelStyle}>{label}</span>{input}</div>

  return (
    <div>
      <PageHead title="Conta" subtitle="Preferências gerais do workspace e da sua senha de acesso." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div>
          <Section title="Configurações gerais" description="Informações básicas da conta e do administrador.">
            {field('Nome da conta', <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Clara Ferreira Acessórios" style={inputStyle} />)}
            {field('E-mail do proprietário', <input value={email} readOnly style={{ ...inputStyle, color: 'var(--muted)' }} />)}
            <button onClick={saveName} style={btn('primary')}>Atualizar configurações</button>
          </Section>
          <Section title="Segurança" description="Altere sua senha de acesso ao CRM.">
            {field('Senha atual', <input type="password" value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} style={inputStyle} />)}
            {field('Nova senha', <input type="password" value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} style={inputStyle} />)}
            {field('Confirmar nova senha', <input type="password" value={pw.password_confirmation} onChange={e => setPw({ ...pw, password_confirmation: e.target.value })} style={inputStyle} />)}
            <button onClick={savePassword} disabled={pwBusy} style={btn('primary')}>{pwBusy ? 'Alterando…' : 'Alterar senha'}</button>
          </Section>
        </div>
        <Section title="Integração com o Jueri" description="Cole esta URL no Jueri → Configurações → API → Webhooks. Assim os eventos de pedido, venda e financeiro chegam em tempo real e o CRM atualiza a carteira sozinho.">
          {field('URL do webhook', (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={webhook} readOnly style={{ ...inputStyle, fontSize: 12.5 }} />
              <button onClick={copy} style={btn('ghost')}>{copied ? 'Copiado!' : 'Copiar'}</button>
            </div>
          ))}
        </Section>
      </div>
    </div>
  )
}

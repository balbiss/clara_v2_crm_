import { useEffect, useState, type ReactNode } from 'react'
import { Building2, Check, Copy, Eye, EyeOff, Link2, ShieldCheck } from 'lucide-react'
import api from '../../api'
import { btn, inputStyle, labelStyle } from '../../components/ui'
import { PageHead, Panel, toast } from '../../components/ui2'

// Configurações da conta (só diretoria): nome, troca de senha e URL do webhook do Jueri.
// (Meta Ads / Facebook Lead Ads ficou de fora da v2, por decisão do dono.)
/* eslint-disable @typescript-eslint/no-explicit-any */

const grid = (cols: string): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: cols, gap: 14 })
const field = (label: string, input: ReactNode, hint?: string) => (
  <label style={{ display: 'block', minWidth: 0 }}>
    <span style={labelStyle}>{label}</span>{input}
    {hint && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>{hint}</span>}
  </label>
)

function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} style={{ ...inputStyle, paddingRight: 38 }} />
      <button type="button" onClick={() => setShow(s => !s)} title={show ? 'Ocultar' : 'Mostrar'}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, border: 'none', background: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export default function Account() {
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [email, setEmail] = useState('')
  const [webhook, setWebhook] = useState('')
  const [copied, setCopied] = useState(false)
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [pwBusy, setPwBusy] = useState(false)

  useEffect(() => {
    api.get('/account').then(({ data }) => { setName(data.account_name || ''); setSavedName(data.account_name || ''); setEmail(data.email || ''); setWebhook(data.jueri_webhook_url || '') })
      .catch(e => console.error('Erro ao buscar dados da conta:', e))
  }, [])

  const saveName = async () => {
    try {
      await api.put('/account', { account: { name } })
      setSavedName(name)
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
  const mismatch = !!pw.password_confirmation && pw.password !== pw.password_confirmation

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHead title="Conta" subtitle="Preferências gerais do workspace e da sua senha de acesso." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Panel icon={<Building2 size={19} />} title="Configurações gerais" description="Informações básicas da conta e do administrador."
          footer={<button onClick={saveName} disabled={!name.trim() || name === savedName} style={{ ...btn('primary'), opacity: !name.trim() || name === savedName ? 0.5 : 1 }}>Salvar alterações</button>}>
          <div style={grid('repeat(auto-fit, minmax(240px, 1fr))')}>
            {field('Nome da conta', <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Clara Ferreira Acessórios" style={inputStyle} />, 'Aparece no topo do sistema e nas mensagens.')}
            {field('E-mail do proprietário', <input value={email} readOnly style={{ ...inputStyle, color: 'var(--muted)', cursor: 'not-allowed' }} />, 'Usado para entrar no CRM. Não pode ser alterado aqui.')}
          </div>
        </Panel>

        <Panel icon={<ShieldCheck size={19} />} title="Segurança" description="Altere sua senha de acesso ao CRM. Use pelo menos 6 caracteres."
          footer={<button onClick={savePassword} disabled={pwBusy || mismatch} style={{ ...btn('primary'), opacity: pwBusy || mismatch ? 0.5 : 1 }}>{pwBusy ? 'Alterando…' : 'Alterar senha'}</button>}>
          <div style={{ ...grid('repeat(auto-fit, minmax(200px, 1fr))') }}>
            {field('Senha atual', <PasswordInput value={pw.current_password} onChange={v => setPw({ ...pw, current_password: v })} autoComplete="current-password" />)}
            {field('Nova senha', <PasswordInput value={pw.password} onChange={v => setPw({ ...pw, password: v })} autoComplete="new-password" />)}
            {field('Confirmar nova senha', <PasswordInput value={pw.password_confirmation} onChange={v => setPw({ ...pw, password_confirmation: v })} autoComplete="new-password" />)}
          </div>
          {mismatch && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#B42318', fontWeight: 600 }}>A confirmação não bate com a nova senha.</p>}
        </Panel>

        <Panel icon={<Link2 size={19} />} title="Integração com o Jueri" description="Os eventos de pedido, venda e financeiro chegam em tempo real e o CRM atualiza a carteira sozinho.">
          <span style={labelStyle}>URL do webhook</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={webhook} readOnly onFocus={e => e.target.select()} style={{ ...inputStyle, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }} />
            <button onClick={copy} style={{ ...btn(copied ? 'soft' : 'ghost'), flex: 'none' }}>{copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}</button>
          </div>
          <ol style={{ margin: '16px 0 0', padding: '12px 14px 12px 32px', background: 'var(--bg)', borderRadius: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
            <li>Copie a URL acima.</li>
            <li>No Jueri, abra <b style={{ color: 'var(--ink)' }}>Configurações → API → Webhooks</b>.</li>
            <li>Cole a URL e salve. Pronto, a carteira passa a se atualizar sozinha.</li>
          </ol>
        </Panel>
      </div>
    </div>
  )
}

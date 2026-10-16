import { useEffect, useState, type FormEvent, type CSSProperties } from 'react'
import axios from 'axios'
import { Eye, EyeOff } from 'lucide-react'
import { brand } from '../config/brand'
import Logo from '../components/Logo'

// Visual do Visita IA v2; lógica do login da Clara v1 (Devise: token no header Authorization).
const fadeUp = (delayMs: number): CSSProperties => ({ opacity: 0, animation: 'fadeUp .5s ease forwards', animationDelay: delayMs + 'ms' })
const label: CSSProperties = { display: 'block', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('remembered_email')
    if (saved) { setEmail(saved); setLembrar(true) }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErro('')
    if (lembrar) localStorage.setItem('remembered_email', email)
    else localStorage.removeItem('remembered_email')
    try {
      const response = await axios.post(`${brand.apiUrl}/users/sign_in`, { user: { email, password: senha } })
      const token = response.headers.authorization
      if (token) localStorage.setItem('auth_token', token)
      if (response.data?.user) localStorage.setItem('user', JSON.stringify(response.data.user))
      window.location.href = '/dashboard'
    } catch {
      setErro('E-mail ou senha incorretos. Verifique e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-grid" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr 1fr' }}>
      <div className="login-hero" style={{ background: 'var(--side)', color: 'var(--sideInk)', padding: '56px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100vh', overflow: 'hidden' }}>
        <div style={fadeUp(0)}><Logo markSize={58} wordSize={22} /></div>
        <div style={{ maxWidth: 460 }}>
          <p style={{ fontFamily: 'Newsreader,serif', fontSize: 46, lineHeight: 1.12, margin: '0 0 18px', fontWeight: 400, ...fadeUp(120) }}>Sua carteira de revendedoras, do primeiro contato ao acerto.</p>
          <p style={{ color: 'var(--sideInk)', fontSize: 16, lineHeight: 1.6, margin: '0 0 16px', ...fadeUp(220) }}>Conversas, régua consignada e tarefas do dia em uma única plataforma.</p>
          <p style={{ color: 'var(--sideMuted)', fontSize: 15, lineHeight: 1.7, margin: 0, ...fadeUp(300) }}>WhatsApp de cada caixa, sincronização com o Jueri e o painel gerencial no mesmo fluxo.</p>
        </div>
        <div style={{ opacity: 0.55, ...fadeUp(380) }}><Logo markSize={18} wordSize={10} showCrm={false} gap={8} /></div>
      </div>
      <div className="login-form-col" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', minHeight: '100vh' }}>
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 352, ...fadeUp(180) }}>
          <div className="login-mobile-logo" style={{ display: 'none', marginBottom: 30 }}><Logo markSize={40} wordSize={18} /></div>
          <h1 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 34, margin: '0 0 6px' }}>Acessar a plataforma</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 32px' }}>Bem-vindo de volta.</p>
          <label style={label}>E-mail</label>
          <input id="email" value={email} onChange={e => setEmail(e.target.value)} type="email" required
            style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 14, marginBottom: 18 }} />
          <label style={label}>Senha</label>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input id="password" value={senha} onChange={e => setSenha(e.target.value)} type={showSenha ? 'text' : 'password'} required
              style={{ width: '100%', padding: '12px 40px 12px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 14 }} />
            <button type="button" onClick={() => setShowSenha(v => !v)} tabIndex={-1} title={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: 'var(--muted)', padding: 4, display: 'flex' }}>
              {showSenha ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', marginBottom: erro ? 10 : 22, cursor: 'pointer' }}>
            <input type="checkbox" checked={lembrar} onChange={e => setLembrar(e.target.checked)} /> Lembrar meu e-mail
          </label>
          {erro && <p style={{ color: 'var(--terra)', fontSize: 12.5, margin: '0 0 16px' }}>{erro}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: 14, background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, letterSpacing: '.04em', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

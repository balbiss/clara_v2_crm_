import { useEffect, useState, type FormEvent, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { brand } from '../config/brand'

// Login no layout da tela de entrada da conta do Kommo (painel azul-escuro, aqui à DIREITA a pedido do dono, com a marca,
// campos com ícone, "Esqueceu?" dentro da senha, botão Login, "Não lembrar de mim"). Onde o Kommo
// deixa branco, entra a logo da Clara pintada no azul-escuro do painel (azul e branco, como o Kommo).
// Sem "Registrar" e sem "chave de acesso": o CRM não tem cadastro aberto nem passkey.
// Lógica do login da Clara v1 (Devise: token no header Authorization) igual à de antes.
const PANEL = '#172a39'
const field: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', background: '#fff', borderRadius: 3, marginBottom: 16 }
const inputCss: CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontSize: 15, color: '#2c3e50', fontFamily: "'PT Sans', Arial, sans-serif" }

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7884" strokeWidth="1.7"><circle cx="12" cy="9" r="4" /><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" /><circle cx="12" cy="12" r="10.5" /></svg>
)
const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7884" strokeWidth="1.7"><rect x="5" y="10.5" width="14" height="10.5" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" /></svg>
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [naoLembrar, setNaoLembrar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('remembered_email')
    if (saved) setEmail(saved)
    else if (localStorage.getItem('remember_off') === 'true') setNaoLembrar(true)
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErro('')
    if (naoLembrar) { localStorage.removeItem('remembered_email'); localStorage.setItem('remember_off', 'true') }
    else { localStorage.setItem('remembered_email', email); localStorage.removeItem('remember_off') }
    try {
      const response = await axios.post(`${brand.apiUrl}/users/sign_in`, { user: { email, password: senha } })
      const token = response.headers.authorization
      if (token) localStorage.setItem('auth_token', token)
      if (response.data?.user) localStorage.setItem('user', JSON.stringify(response.data.user))
      window.location.href = '/dashboard'
    } catch {
      setErro('E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="k-login" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row-reverse', fontFamily: "'PT Sans', Arial, sans-serif" }}>
      <aside className="k-login-panel" style={{ width: 374, flex: 'none', background: PANEL, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 39px', position: 'relative' }}>
        <img src="/logos/clara-ferreira-logo-white.png" alt={brand.name} style={{ width: 190, marginBottom: 40 }} />
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <label style={field}>
            <UserIcon />
            <input id="email" value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="E-mail" autoComplete="username" style={inputCss} />
          </label>
          <label style={field}>
            <LockIcon />
            <input id="password" value={senha} onChange={e => setSenha(e.target.value)} type="password" required placeholder="Senha" autoComplete="current-password" style={inputCss} />
            <Link to="/forgot-password" tabIndex={-1} style={{ color: '#2c3e50', fontSize: 14.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>Esqueceu?</Link>
          </label>
          {erro && <p role="alert" style={{ color: '#ff8fa3', fontSize: 14, margin: '-4px 0 12px' }}>{erro}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', height: 36, background: '#1d8fdc', color: '#fff', border: 'none', borderRadius: 3, fontSize: 15.5, fontFamily: 'inherit', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Entrando…' : 'Login'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, fontSize: 15, color: '#8fa9c2', cursor: 'pointer' }}>
            <input type="checkbox" checked={naoLembrar} onChange={e => setNaoLembrar(e.target.checked)} style={{ width: 20, height: 20, margin: 0, accentColor: '#1d8fdc' }} /> Não lembrar de mim
          </label>
        </form>
        <span style={{ position: 'absolute', bottom: 28, fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', color: '#8fa9c2' }}>Clara Ferreira CRM</span>
      </aside>

      {/* área da marca (onde o Kommo deixa branco): logo da Clara no azul-escuro do painel, pra
          combinar com o azul e branco do Kommo — a logo branca vira máscara pintada nessa cor */}
      <main className="k-login-brand" style={{ flex: 1, minWidth: 0, background: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
        <div role="img" aria-label={brand.name} style={{ width: 'min(520px, 80%)', aspectRatio: '1212 / 444', background: PANEL, WebkitMaskImage: 'url(/logos/clara-ferreira-logo-white.png)', maskImage: 'url(/logos/clara-ferreira-logo-white.png)', WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' }} />
        <p style={{ margin: '28px 0 0', fontSize: 18, letterSpacing: '.04em', color: '#5d7387' }}>Sua carteira de revendedoras, do primeiro contato ao acerto.</p>
      </main>
    </div>
  )
}

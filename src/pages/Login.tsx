import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import Swal from 'sweetalert2'
import { Eye, EyeOff, Download, Share } from 'lucide-react'
import { brand } from '../config/brand'
import { useInstallPrompt } from '../composables/useInstallPrompt'
import '../styles/vue/Login.scss'

// Porte de views/Login.vue
export default function Login() {
  const { canInstall, isInstalled, isIOS, isStandalone, promptInstall } = useInstallPrompt()
  const words = brand.name.split(' ')
  const brandMain = words.slice(0, -1).join(' ')
  const brandAccent = words[words.length - 1]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('remembered_email')
    if (saved) { setEmail(saved); setRememberMe(true) }
  }, [])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    if (rememberMe) localStorage.setItem('remembered_email', email)
    else localStorage.removeItem('remembered_email')
    try {
      const response = await axios.post(`${brand.apiUrl}/users/sign_in`, { user: { email, password } })
      const token = response.headers.authorization
      if (token) localStorage.setItem('auth_token', token)
      if (response.data?.user) localStorage.setItem('user', JSON.stringify(response.data.user))
      await Swal.fire({ icon: 'success', title: 'Login realizado!', text: `Bem-vindo de volta ao ${brand.name}.`, confirmButtonColor: '#cc0066', timer: 1500, showConfirmButton: false })
      window.location.href = '/dashboard'
    } catch (error) {
      console.error('Login error', error)
      Swal.fire({ icon: 'error', title: 'Acesso Negado', text: 'E-mail ou senha incorretos. Verifique e tente novamente.', confirmButtonColor: '#cc0066', customClass: { icon: 'swal-icon-pulse-slow' } })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="vs-Login" style={{ display: 'contents' }}>
      <div className="login-layout">
        {/* Lado esquerdo: imagem + branding */}
        <div className="login-hero">
          <div className="hero-overlay"></div>
          <div className="hero-top fade-in-up" style={{ animationDelay: '0.05s' }}>
            <div className="hero-logo-card">
              <img src="/logos/clara-ferreira-logo-white.png" alt="Clara Ferreira Acessórios" className="hero-logo" />
            </div>
          </div>
          <div className="hero-content hero-content--bottom fade-in-up" style={{ animationDelay: '0.2s' }}>
            <h1 className="hero-brand">{brandMain}<span>{brandAccent}</span></h1>
            <p className="hero-tagline">Gerencie sua carteira de revendedoras e a régua de relacionamento em um só lugar — com IA trabalhando 24h para você.</p>
            <div className="hero-badges">
              <span className="hero-badge">IA no WhatsApp</span>
              <span className="hero-badge">Rodízio automático</span>
              <span className="hero-badge">Sincronização Jueri</span>
            </div>
          </div>
        </div>

        {/* Lado direito: formulário */}
        <div className="login-panel">
          <div className="auth-card fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="auth-header">
              <h2>Bem-vindo de volta</h2>
              <p>Acesse sua conta para gerenciar suas revendedoras e leads.</p>
            </div>

            <form onSubmit={handleLogin} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">E-mail</label>
                <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
              </div>

              <div className="form-group">
                <label htmlFor="password">Senha</label>
                <div className="input-eye">
                  <input type={showPassword ? 'text' : 'password'} id="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-actions">
                <label className="remember-me">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  Lembrar de mim
                </label>
                <Link to="/forgot-password" className="forgot-password">Esqueceu a senha?</Link>
              </div>

              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Entrando...' : 'Entrar'}</button>
            </form>

            {!isInstalled && !isStandalone && canInstall ? (
              <div className="install-banner">
                <button className="install-btn" onClick={promptInstall}><Download size={16} /> Instalar aplicativo</button>
              </div>
            ) : !isInstalled && !isStandalone && isIOS ? (
              <div className="install-banner ios-hint">
                <Share size={14} />
                <span>Toque em <strong>Compartilhar</strong> e depois em <strong>"Adicionar à Tela de Início"</strong> pra instalar o app.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

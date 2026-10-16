import axios from 'axios'
import { brand } from '../config/brand'

// Mesmo cliente da v1 (src/api/index.js): token salvo como veio do login ("Bearer ...").
const api = axios.create({
  baseURL: (window as unknown as { __APP_CONFIG__?: { apiUrl?: string } }).__APP_CONFIG__?.apiUrl || brand.apiUrl,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = token
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      // sessão expirada/inválida: limpa e recarrega do zero (nenhum estado de outro login fica preso)
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api

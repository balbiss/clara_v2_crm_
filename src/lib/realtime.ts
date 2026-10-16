import { io, type Socket } from 'socket.io-client'
import api from '../api'

// Substitui o WebSocket cru do ActionCable da v1. Um socket só pra app inteira; o servidor põe
// cada usuário nas salas da conta e emite 'conversations' e 'internal_chat' com o MESMO payload
// que a v1 mandava em data.message.
let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket) return socket
  socket = io(api.defaults.baseURL as string, {
    auth: cb => cb({ token: (localStorage.getItem('auth_token') || '').replace(/^Bearer\s+/i, '') }),
    transports: ['websocket'],
    reconnectionDelay: 1500,
    reconnectionDelayMax: 8000,
  })
  return socket
}

export function isSocketConnected() {
  return !!socket?.connected
}

/** Força reconectar (PC que dormiu: socket "zumbi"). */
export function resetSocket() {
  if (!socket) return
  socket.disconnect()
  socket.connect()
}

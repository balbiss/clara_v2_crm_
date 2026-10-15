import type { Server } from 'socket.io';

// Substitui os dois canais do ActionCable da v1 (ConversationsChannel / InternalChatChannel).
// Cada socket entra nas salas da própria conta; o payload é o mesmo objeto que a v1 mandava.
let io: Server | null = null;

export function setIo(server: Server) { io = server; }

export function broadcastConversations(accountId: number, payload: unknown) {
  io?.to(`conversations:${accountId}`).emit('conversations', payload);
}

export function broadcastInternalChat(accountId: number, payload: unknown) {
  io?.to(`internal_chat:${accountId}`).emit('internal_chat', payload);
}

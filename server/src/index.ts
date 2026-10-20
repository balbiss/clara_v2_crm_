import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server } from 'socket.io';
import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { users } from './db/schema.js';
import { verifyToken } from './lib/jwt.js';
import { ensureBucket } from './lib/storage.js';
import { setIo } from './lib/realtime.js';
import { sessionsRouter } from './routes/sessions.js';
import { filesRouter } from './routes/files.js';
import { conversationsRouter } from './routes/conversations.js';
import { inboxesRouter } from './routes/inboxes.js';
import { webhooksRouter } from './routes/webhooks.js';
import { basicsRouter } from './routes/basics.js';
import { contactsRouter } from './routes/contacts.js';
import { salesTeamsRouter } from './routes/salesTeams.js';
import { internalMessagesRouter } from './routes/internalMessages.js';
import { accountRouter } from './routes/account.js';
import { pedidosRouter } from './routes/pedidos.js';
import { tarefasRouter } from './routes/tarefas.js';
import { pipelinesRouter } from './routes/pipelines.js';
import { settingsRouter } from './routes/settings.js';
import { startJobs } from './jobs/index.js';

// Express 4 não captura erro de rota async: sem isto uma query com problema derruba o servidor inteiro.
process.on('unhandledRejection', err => console.error('Erro não tratado (servidor segue no ar):', err));

const app = express();
// exposedHeaders: o front lê o token do header Authorization da resposta do login (igual à v1).
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5183', exposedHeaders: ['Authorization'] }));
app.use(express.json({ limit: '25mb' }));

app.get('/up', (_req, res) => res.json({ ok: true }));
app.use(sessionsRouter);
app.use(filesRouter);
app.use(webhooksRouter);
app.use(conversationsRouter);
app.use(inboxesRouter);
app.use(pedidosRouter);
app.use(tarefasRouter);
app.use(pipelinesRouter);
app.use(settingsRouter);
app.use(contactsRouter);
app.use(salesTeamsRouter);
app.use(internalMessagesRouter);
app.use(accountRouter);
app.use(basicsRouter);

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5183' } });
setIo(io);

// Mesma autenticação do ApplicationCable::Connection da v1: token JWT + usuário ativo.
io.use(async (socket, next) => {
  try {
    const claims = verifyToken(String(socket.handshake.auth?.token || ''));
    const [user] = await db.select().from(users).where(eq(users.id, Number(claims.sub))).limit(1);
    if (!user || user.jti !== claims.jti || user.status !== 'active') return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
io.on('connection', socket => {
  const accountId = socket.data.user.accountId;
  socket.join(`conversations:${accountId}`);
  socket.join(`internal_chat:${accountId}`);
});

const port = Number(process.env.PORT) || 3011;
ensureBucket()
  .catch(err => console.error('MinIO: não foi possível preparar o bucket —', err.message))
  .finally(() => httpServer.listen(port, () => {
    console.log('Clara v2 backend rodando em http://localhost:' + port);
    startJobs();
  }));

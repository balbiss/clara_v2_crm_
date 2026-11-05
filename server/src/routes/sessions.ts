import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, accounts } from '../db/schema.js';
import { signToken } from '../lib/jwt.js';
import { avatarUrl } from '../lib/users.js';
import { requireAuth, roleName, type User } from '../middleware/auth.js';
import { carregarAcesso, perfisDaConta, perfilDe } from '../lib/acesso.js';

// Users::SessionsController da v1 (Devise + devise-jwt): POST /users/sign_in devolve o token
// no header Authorization e o usuário no corpo; DELETE /users/sign_out revoga trocando o jti.
export const sessionsRouter = Router();

/** O que a tela usa pra montar menu e botões: permissões já resolvidas + nome do perfil. */
export async function acessoJson(u: User) {
  const access = await carregarAcesso(u);
  const perfis = u.accountId ? await perfisDaConta(u.accountId) : [];
  return { access, access_profile_id: u.accessProfileId ?? null, access_profile_name: perfilDe(u, perfis)?.name ?? null };
}

export async function serializeSessionUser(u: User) {
  const [acc] = u.accountId ? await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, u.accountId)) : [];
  return {
    id: u.id, email: u.email, first_name: u.firstName, last_name: u.lastName,
    role: roleName(u.role), account_id: u.accountId, account_name: acc?.name ?? null,
    permissions: u.permissions, avatar_url: await avatarUrl(u.id),
    ...(await acessoJson(u)),
  };
}

sessionsRouter.post('/users/sign_in', async (req, res) => {
  const email = String(req.body?.user?.email || '').trim().toLowerCase();
  const password = String(req.body?.user?.password || '');
  const fail = () => res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  if (!email || !password) return fail();

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  // Devise grava bcrypt ($2a$) — o bcryptjs valida o mesmo hash, ninguém precisa trocar senha.
  if (!user || !user.encryptedPassword || !(await bcrypt.compare(password, user.encryptedPassword))) return fail();
  if (user.status !== 'active') return res.status(401).json({ error: 'Sua conta está inativa.' });

  let jti = user.jti;
  if (!jti) {
    jti = crypto.randomUUID();
    await db.update(users).set({ jti }).where(eq(users.id, user.id));
  }
  res.setHeader('Authorization', 'Bearer ' + signToken(user.id, jti));
  res.json({ message: 'Login bem-sucedido.', user: await serializeSessionUser(user) });
});

sessionsRouter.delete('/users/sign_out', requireAuth, async (req, res) => {
  await db.update(users).set({ jti: crypto.randomUUID() }).where(eq(users.id, req.user!.id));
  res.json({ message: 'Logout realizado com sucesso.' });
});

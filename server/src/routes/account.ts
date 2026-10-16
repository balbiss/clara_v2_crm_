import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, users } from '../db/schema.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

// AccountsController da v1: configuração da conta (só diretoria) + troca da própria senha.
export const accountRouter = Router();

accountRouter.get('/account', requireAuth, requireOwner, async (req, res) => {
  const u = req.user!;
  const [a] = await db.select().from(accounts).where(eq(accounts.id, u.accountId!));
  const base = (process.env.BACKEND_URL || process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.json({
    account_name: a.name, email: u.email, subscription_status: a.subscriptionStatus || 'pending', trial_ends_at: a.trialEndsAt,
    plan_name: 'Plano Premium', facebook_page_name: a.facebookPageName,
    // URL a cadastrar no painel do Jueri (Configurações > Webhooks) — token único por conta
    jueri_webhook_url: `${base}/webhooks/jueri/${a.jueriWebhookToken}`,
  });
});

async function updateAccount(req: Request, res: Response) {
  const name = req.body?.account?.name;
  await db.update(accounts).set({ ...(name !== undefined ? { name } : {}), updatedAt: new Date() }).where(eq(accounts.id, req.user!.accountId!));
  res.json({ message: 'Configurações atualizadas com sucesso!' });
}
accountRouter.put('/account', requireAuth, requireOwner, updateAccount);
accountRouter.patch('/account', requireAuth, requireOwner, updateAccount);

// update_with_password do Devise: confere a atual, exige confirmação e mínimo de 6 caracteres
accountRouter.put('/account/update_password', requireAuth, async (req, res) => {
  const { current_password, password, password_confirmation } = req.body?.user ?? {};
  const fail = (m: string) => res.status(422).json({ error: m });
  if (!current_password || !(await bcrypt.compare(String(current_password), req.user!.encryptedPassword))) return fail('Senha atual não é válida');
  if (!password || String(password).length < 6) return fail('Senha é muito curta (mínimo: 6 caracteres)');
  if (password !== password_confirmation) return fail('Confirme sua senha não é igual a Senha');
  await db.update(users).set({ encryptedPassword: await bcrypt.hash(String(password), 12), updatedAt: new Date() }).where(eq(users.id, req.user!.id));
  res.json({ message: 'Senha alterada com sucesso!' });
});

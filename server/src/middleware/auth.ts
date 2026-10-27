import type { Request, Response, NextFunction } from 'express';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { verifyToken } from '../lib/jwt.js';
import { db } from '../db/client.js';
import { users, contacts, salesTeams, salesTeamMemberships } from '../db/schema.js';

export type User = typeof users.$inferSelect;

// users.role é integer na v1 (enum do Rails): consultor 0, gerente 1, diretoria 2, financeiro 3.
export const ROLES = ['consultor', 'gerente', 'diretoria', 'financeiro'] as const;
export type Role = typeof ROLES[number];
export const roleName = (n: number | null): Role => ROLES[n ?? 0] ?? 'consultor';
export const roleValue = (r: string): number => Math.max(0, ROLES.indexOf(r as Role));

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Valida o JWT (header Authorization), confere o jti e se o usuário está ativo — igual ao
 *  Devise-JWT + active_for_authentication? da v1. Popula req.user. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'You need to sign in or sign up before continuing.' });
  let claims;
  try {
    claims = verifyToken(header);
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
  const [user] = await db.select().from(users).where(eq(users.id, Number(claims.sub))).limit(1);
  if (!user || user.jti !== claims.jti) return res.status(401).json({ error: 'Token revogado' });
  if (user.status !== 'active') return res.status(401).json({ error: 'Conta inativa' });
  req.user = user;
  next();
}

// Três níveis de autorização da v1 (ApplicationController, briefing seção 30):
// owner = só diretoria (config crítica); fullPortfolio = gerente/diretoria (carteira inteira);
// finance = financeiro/diretoria.
export const isOwner = (u: User) => roleName(u.role) === 'diretoria';
export const isFullPortfolio = (u: User) => ['gerente', 'diretoria'].includes(roleName(u.role));
export const isFinance = (u: User) => ['financeiro', 'diretoria'].includes(roleName(u.role));
export const hasPermission = (u: User, key: string) => (u.permissions as Record<string, unknown> | null)?.[key] === true;

const forbidden = (res: Response, message: string) => res.status(403).json({ error: 'forbidden', message });

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isOwner(req.user)) return forbidden(res, 'Acesso restrito à diretoria/administração.');
  next();
}
export function requireFullPortfolio(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isFullPortfolio(req.user)) return forbidden(res, 'Acesso restrito a gerência/diretoria.');
  next();
}
// Disparos: gerência/diretoria sempre; consultora só se a diretoria ligou "Fazer disparos" no usuário
// (aí ela dispara só pra própria carteira e pelos números que atende — routes/disparos.ts)
export const canBroadcast = (u: User) => isFullPortfolio(u) || hasPermission(u, 'broadcast');
export function requireBroadcast(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !canBroadcast(req.user)) return forbidden(res, 'Disparos não liberados para este usuário.');
  next();
}
export function requireFinance(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isFinance(req.user)) return forbidden(res, 'Acesso restrito ao financeiro/diretoria.');
  next();
}

/** User#accessible_jueri_lider_ids — times de vendas (líderes do Jueri) cuja carteira o usuário vê. */
export async function accessibleJueriLiderIds(userId: number): Promise<string[]> {
  const rows = await db.select({ id: salesTeams.jueriLiderId }).from(salesTeamMemberships)
    .innerJoin(salesTeams, eq(salesTeams.id, salesTeamMemberships.salesTeamId))
    .where(eq(salesTeamMemberships.userId, userId));
  return rows.map(r => r.id);
}

/** ApplicationController#visible_contacts_scope, como condição SQL sobre `contacts`.
 *  Gerente/diretoria/financeiro (ou permissão view_all_contacts) veem tudo; consultor vê a
 *  própria carteira + a dos times de vendas a que tem acesso. */
export async function visibleContactsWhere(u: User): Promise<SQL> {
  const base = eq(contacts.accountId, u.accountId!);
  if (isFullPortfolio(u) || isFinance(u) || hasPermission(u, 'view_all_contacts')) return base;
  const liderIds = await accessibleJueriLiderIds(u.id);
  const own = eq(contacts.userId, u.id);
  if (!liderIds.length) return and(base, own)!;
  return and(base, or(own, inArray(sql`${contacts.customAttributes} ->> 'gerente_jueri_id'`, liderIds)))!;
}

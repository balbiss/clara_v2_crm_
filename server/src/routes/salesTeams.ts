import { Router, type Request, type Response } from 'express';
import { and, asc, eq, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { salesTeams, salesTeamMemberships, users, contacts } from '../db/schema.js';
import { requireAuth, requireFullPortfolio, roleName } from '../middleware/auth.js';
import { updateContact } from '../lib/contacts.js';
import { blobsFor, blobUrl } from '../lib/storage.js';

// SalesTeamsController da v1: quem (além do responsável) vê a carteira inteira de um time do Jueri.
export const salesTeamsRouter = Router();
salesTeamsRouter.use('/sales_teams', requireAuth, requireFullPortfolio);
type Team = typeof salesTeams.$inferSelect;

const teamContacts = (t: Team) => and(eq(contacts.accountId, t.accountId), sql`${contacts.customAttributes} ->> 'gerente_jueri_id' = ${t.jueriLiderId}`)!;

async function serialize(t: Team) {
  const members = await db.select({ u: users }).from(salesTeamMemberships).innerJoin(users, eq(users.id, salesTeamMemberships.userId)).where(eq(salesTeamMemberships.salesTeamId, t.id));
  const avatars = await blobsFor('User', members.map(m => m.u.id), 'avatar');
  const [{ n: unassigned }] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(teamContacts(t), isNull(contacts.userId)));
  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(teamContacts(t));
  const resp = await db.select({ id: users.id, first: users.firstName, last: users.lastName, count: sql<number>`count(${contacts.id})::int` })
    .from(contacts).innerJoin(users, eq(users.id, contacts.userId)).where(and(teamContacts(t), isNotNull(contacts.userId)))
    .groupBy(users.id, users.firstName, users.lastName).orderBy(sql`count(${contacts.id}) DESC`);
  return {
    id: t.id, jueri_lider_id: t.jueriLiderId, nome: t.nome,
    users: members.map(({ u }) => { const b = avatars.get(u.id)?.[0]; return { id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(), role: roleName(u.role), avatar_url: b ? blobUrl(b) : null }; }),
    unassigned_contacts_count: unassigned, contacts_count: total,
    responsaveis_individuais: resp.map(r => ({ id: r.id, name: `${r.first ?? ''} ${r.last ?? ''}`.trim(), count: r.count })),
  };
}

async function loadTeam(req: Request, res: Response): Promise<Team | null> {
  const [t] = await db.select().from(salesTeams).where(and(eq(salesTeams.accountId, req.user!.accountId!), eq(salesTeams.id, Number(req.params.id))));
  if (!t) { res.status(404).json({ error: 'not_found', message: 'Time de vendas não encontrado.' }); return null; }
  return t;
}

salesTeamsRouter.get('/sales_teams', async (req, res) => {
  const teams = await db.select().from(salesTeams).where(eq(salesTeams.accountId, req.user!.accountId!)).orderBy(asc(salesTeams.nome));
  res.json(await Promise.all(teams.map(serialize)));
});

salesTeamsRouter.patch('/sales_teams/:id/members', async (req, res) => {
  const t = await loadTeam(req, res);
  if (!t) return;
  const ids = (Array.isArray(req.body.user_ids) ? req.body.user_ids : []).map(Number);
  const valid = ids.length ? await db.select({ id: users.id }).from(users).where(and(eq(users.accountId, req.user!.accountId!), inArray(users.id, ids))) : [];
  await db.transaction(async tx => {
    await tx.delete(salesTeamMemberships).where(eq(salesTeamMemberships.salesTeamId, t.id));
    if (valid.length) await tx.insert(salesTeamMemberships).values(valid.map(u => ({ salesTeamId: t.id, userId: u.id })));
  });
  res.json(await serialize(t));
});

salesTeamsRouter.post('/sales_teams/:id/assign_unassigned', async (req, res) => {
  const t = await loadTeam(req, res);
  if (!t) return;
  const [u] = await db.select().from(users).where(and(eq(users.accountId, req.user!.accountId!), eq(users.id, Number(req.body.user_id))));
  if (!u) return res.status(422).json({ error: 'user_not_found', message: 'Usuário não encontrado.' });
  let count = 0;
  for (const c of await db.select().from(contacts).where(and(teamContacts(t), isNull(contacts.userId)))) {
    await updateContact(c, { userId: u.id }, req.user!.id);
    count++;
  }
  res.json({ assigned_count: count, team: await serialize(t) });
});

// Configurações › Perfis de acesso (Bel, 2026-11-04): a diretoria escolhe o que cada perfil vê e faz.
// Leitura: quem gerencia usuários (pra escolher o perfil no cadastro). Alteração: só diretoria.
import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accessProfiles, users } from '../db/schema.js';
import { requireAuth, requireOwner, requirePerm, roleName, roleValue, type Role } from '../middleware/auth.js';
import { CATALOGO, padraoDoPerfil, normalizar, perfisDaConta, contagemPorPerfil, limparCachePerfis } from '../lib/acesso.js';

export const perfisAcessoRouter = Router();
perfisAcessoRouter.use('/access_profiles', requireAuth);

const BASES: Role[] = ['consultor', 'gerente', 'financeiro'];
const json = (p: typeof accessProfiles.$inferSelect, n: number) => {
  const role = roleName(p.baseRole);
  return { id: p.id, name: p.name, base_role: role, sistema: p.sistema, editavel: role !== 'diretoria', usuarios: n, permissions: normalizar(role, p.permissions) };
};

perfisAcessoRouter.get('/access_profiles', requirePerm('config.usuarios'), async (req, res) => {
  const a = req.user!.accountId!;
  const perfis = await perfisDaConta(a);
  const n = await contagemPorPerfil(a, perfis);
  const ordem = (p: typeof perfis[number]) => (p.sistema ? ['consultor', 'gerente', 'financeiro', 'diretoria'].indexOf(roleName(p.baseRole)) : 10);
  res.json({
    catalogo: CATALOGO,
    padroes: Object.fromEntries(BASES.map(r => [r, padraoDoPerfil(r)])),
    perfis: [...perfis].sort((x, y) => ordem(x) - ordem(y) || x.id - y.id).map(p => json(p, n.get(p.id) ?? 0)),
  });
});

perfisAcessoRouter.post('/access_profiles', requireOwner, async (req, res) => {
  const a = req.user!.accountId!;
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(422).json({ message: 'Dê um nome ao perfil.' });
  const perfis = await perfisDaConta(a);
  if (perfis.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) return res.status(422).json({ message: 'Já existe um perfil com esse nome.' });
  // copia de um perfil existente (ou começa do padrão do tipo escolhido)
  const origem = req.body?.copiar_de ? perfis.find(p => p.id === Number(req.body.copiar_de)) : undefined;
  const base = origem ? roleName(origem.baseRole) : (String(req.body?.base_role ?? 'consultor') as Role);
  if (!BASES.includes(base)) return res.status(422).json({ message: `Tipo inválido. Use: ${BASES.join(', ')}.` });
  const [p] = await db.insert(accessProfiles).values({ accountId: a, name, baseRole: roleValue(base), permissions: normalizar(base, origem?.permissions), sistema: false }).returning();
  limparCachePerfis(a);
  res.status(201).json(json(p, 0));
});

perfisAcessoRouter.put('/access_profiles/:id', requireOwner, async (req, res) => {
  const a = req.user!.accountId!;
  const [p] = await db.select().from(accessProfiles).where(and(eq(accessProfiles.id, Number(req.params.id)), eq(accessProfiles.accountId, a))).limit(1);
  if (!p) return res.status(404).json({ message: 'Perfil não encontrado.' });
  const role = roleName(p.baseRole);
  if (role === 'diretoria') return res.status(422).json({ message: 'A Diretoria tem acesso total e não pode ser alterada.' });
  const set: Partial<typeof accessProfiles.$inferInsert> = { updatedAt: new Date() };
  if (req.body?.name !== undefined && !p.sistema) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(422).json({ message: 'Dê um nome ao perfil.' });
    set.name = name;
  }
  if (req.body?.permissions !== undefined) set.permissions = normalizar(role, { ...(p.permissions as object), ...req.body.permissions });
  const [up] = await db.update(accessProfiles).set(set).where(eq(accessProfiles.id, p.id)).returning();
  limparCachePerfis(a);
  const n = await contagemPorPerfil(a, await perfisDaConta(a));
  res.json(json(up, n.get(up.id) ?? 0));
});

perfisAcessoRouter.delete('/access_profiles/:id', requireOwner, async (req, res) => {
  const a = req.user!.accountId!;
  const [p] = await db.select().from(accessProfiles).where(and(eq(accessProfiles.id, Number(req.params.id)), eq(accessProfiles.accountId, a))).limit(1);
  if (!p) return res.status(404).json({ message: 'Perfil não encontrado.' });
  if (p.sistema) return res.status(422).json({ message: 'Os perfis Consultor, Gerente, Financeiro e Diretoria não podem ser excluídos.' });
  // quem estava nele volta pro perfil-base do mesmo tipo
  await db.update(users).set({ accessProfileId: null }).where(and(eq(users.accountId, a), eq(users.accessProfileId, p.id)));
  await db.delete(accessProfiles).where(eq(accessProfiles.id, p.id));
  limparCachePerfis(a);
  res.status(204).end();
});


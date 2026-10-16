import { Router } from 'express';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pedidos, contacts } from '../db/schema.js';
import { requireAuth, visibleContactsWhere } from '../middleware/auth.js';
import { ativasSnapshot, STATUS_ABERTO } from '../lib/pedidos.js';

export const pedidosRouter = Router();

// "Pedidos Pendentes": mesma lista do widget do Jueri (status Aberto). Não chama a API do
// Jueri — lê o que o sync já guardou em `pedidos`.
pedidosRouter.get('/pedidos/pendentes', requireAuth, async (req, res) => {
  const u = req.user!;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
  const visible = db.select({ id: contacts.id }).from(contacts).where(await visibleContactsWhere(u));
  const conds = [eq(pedidos.accountId, u.accountId!), eq(pedidos.statusId, STATUS_ABERTO), inArray(pedidos.contactId, visible)];
  if (req.query.contact_id) conds.push(eq(pedidos.contactId, Number(req.query.contact_id)));
  const where = and(...conds);
  const [{ n: total }] = await db.select({ n: count() }).from(pedidos).where(where);
  const rows = await db.select({ p: pedidos, name: contacts.name, phone: contacts.phone }).from(pedidos)
    .leftJoin(contacts, eq(contacts.id, pedidos.contactId)).where(where)
    .orderBy(desc(pedidos.dataCriacao), desc(pedidos.id)).offset((page - 1) * perPage).limit(perPage);
  res.json({
    total, page, per_page: perPage, total_pages: total === 0 ? 1 : Math.ceil(total / perPage),
    pedidos: rows.map(({ p, name, phone }) => ({
      id: p.id, jueri_pedido_id: p.jueriPedidoId, contact_id: p.contactId, contact_name: name || phone,
      quantidade: p.quantidade, quantidade_antes_baixa: p.quantidadeAntesBaixa, valor_total: p.valorTotal, status_id: p.statusId,
      data_criacao: p.dataCriacao, data_baixa: p.dataBaixa, data_cancelamento: p.dataCancelamento, updated_at: p.updatedAt,
    })),
  });
});

// GET /contacts/ativas?data=YYYY-MM-DD — Time Travel (sem `data` = hoje, via colunas pré-calculadas)
pedidosRouter.get('/contacts/ativas', requireAuth, async (req, res) => {
  const data = req.query.data ? String(req.query.data) : undefined;
  if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data)))) return res.status(422).json({ error: 'Data inválida. Use o formato YYYY-MM-DD.' });
  res.json(await ativasSnapshot(req.user!, data));
});

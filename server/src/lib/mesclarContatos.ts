import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts } from '../db/schema.js';
import { deleteContactCascade } from './wahaIngestion.js';

// Revendedora em dobro (Bel, 28/10: "tem dois cards com o nome dela"): o contato que veio do WhatsApp
// e o que o JueriSync criou depois, com o mesmo telefone. Aqui tudo do contato do WhatsApp (conversas,
// etiquetas, cards, tarefas, notas…) passa pro contato do Jueri, que fica com o jid, e o outro é apagado.

/** Mesmo telefone = mesmo DDD + mesmos 8 últimos dígitos (o 9 extra do celular varia entre cadastros). */
export const mesmoTelefoneSql = (a: unknown, b: unknown) => sql`(
  length(regexp_replace(coalesce(${a}, ''), '\\D', '', 'g')) >= 12
  AND right(regexp_replace(coalesce(${a}, ''), '\\D', '', 'g'), 8) = right(regexp_replace(coalesce(${b}, ''), '\\D', '', 'g'), 8)
  AND substr(regexp_replace(coalesce(${a}, ''), '\\D', '', 'g'), 3, 2) = substr(regexp_replace(coalesce(${b}, ''), '\\D', '', 'g'), 3, 2))`;

const SEM_GRUPO = (alias: string) => sql.raw(`coalesce(${alias}.status, '') <> 'grupo' AND coalesce(${alias}.jid, '') NOT LIKE '%@g.us'`);

/** Contato sem vínculo com o Jueri e com o mesmo telefone (pro JueriSync adotar em vez de criar outro). */
export async function contatoSoltoComTelefone(accountId: number, phone: string | null | undefined) {
  if (!phone || phone.replace(/\D/g, '').length < 12) return null;
  const [c] = await db.select().from(contacts).where(and(eq(contacts.accountId, accountId), sql`${contacts.idJueri} IS NULL`,
    sql`coalesce(${contacts.status}, '') <> 'grupo' AND coalesce(${contacts.jid}, '') NOT LIKE '%@g.us'`,
    mesmoTelefoneSql(contacts.phone, phone))).orderBy(sql`${contacts.jid} IS NULL`, contacts.id).limit(1);
  return c ?? null;
}

/** Passa tudo de `origem` pra `destino` e apaga `origem`. */
export async function mesclarContato(origemId: number, destinoId: number) {
  if (origemId === destinoId) return;
  const [o] = await db.select().from(contacts).where(eq(contacts.id, origemId));
  const [d] = await db.select().from(contacts).where(eq(contacts.id, destinoId));
  if (!o || !d) return;
  const mover = async (tabela: string, condicaoExtra = sql``) =>
    db.execute(sql`UPDATE ${sql.identifier(tabela)} SET contact_id = ${destinoId} WHERE contact_id = ${origemId} ${condicaoExtra}`);

  await mover('conversations');
  await db.execute(sql`UPDATE messages SET sender_id = ${destinoId} WHERE sender_type = 'Contact' AND sender_id = ${origemId}`);
  await db.execute(sql`INSERT INTO contact_tags (contact_id, tag_id) SELECT ${destinoId}, tag_id FROM contact_tags WHERE contact_id = ${origemId} ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO reseller_phones (contact_id, phone, label) SELECT ${destinoId}, phone, label FROM reseller_phones WHERE contact_id = ${origemId} ON CONFLICT DO NOTHING`);
  // card: só o funil em que o destino ainda não está (o do Jueri manda); tarefa pendente: uma por tipo
  await mover('pipeline_cards', sql`AND pipeline_id NOT IN (SELECT pipeline_id FROM pipeline_cards WHERE contact_id = ${destinoId})`);
  await mover('tarefas', sql`AND NOT (status = 'pendente' AND tipo IN (SELECT tipo FROM tarefas WHERE contact_id = ${destinoId} AND status = 'pendente'))`);
  await mover('lifecycle_events', sql`AND event_type <> 'iniciada'`);
  await mover('broadcast_recipients', sql`AND broadcast_id NOT IN (SELECT broadcast_id FROM broadcast_recipients WHERE contact_id = ${destinoId})`);
  for (const t of ['notes', 'agendamentos', 'contact_audit_events', 'flow_runs', 'jueri_activities', 'activity_events', 'ai_agent_logs', 'team_chats', 'pedidos']) await mover(t);
  await db.execute(sql`DELETE FROM ai_agent_sessions WHERE contact_id = ${origemId}`);
  await db.execute(sql`DELETE FROM broadcast_recipients WHERE contact_id = ${origemId}`);

  // o destino herda o que não tem: jid (WhatsApp), responsável, e-mail, campos personalizados
  const jid = d.jid || o.jid;
  if (!d.jid && o.jid) await db.update(contacts).set({ jid: null }).where(eq(contacts.id, origemId));
  await db.update(contacts).set({
    jid, userId: d.userId ?? o.userId, email: d.email || o.email,
    customAttributes: { ...((o.customAttributes as object) || {}), ...((d.customAttributes as object) || {}) },
    updatedAt: new Date(),
  }).where(eq(contacts.id, destinoId));
  await deleteContactCascade(origemId);
}

/** Pares "contato do WhatsApp (origem) + contato do Jueri (destino)" com o mesmo telefone. */
export async function paresDuplicados() {
  return await db.execute(sql`
    SELECT DISTINCT ON (w.id) w.id AS origem, j.id AS destino FROM contacts w
    JOIN contacts j ON j.account_id = w.account_id AND j.id <> w.id AND j.id_jueri IS NOT NULL AND ${SEM_GRUPO('j')}
    WHERE w.id_jueri IS NULL AND ${SEM_GRUPO('w')} AND ${mesmoTelefoneSql(sql.raw('w.phone'), sql.raw('j.phone'))}
    ORDER BY w.id, j.id`) as unknown as { origem: number; destino: number }[];
}

/** Junta os pares. Trava: muitos de uma vez = algo estranho (ex.: telefone genérico) — não mexe e avisa. */
export async function unirDuplicadosDoJueri(limite = 80) {
  const pares = await paresDuplicados();
  if (pares.length > limite) { console.warn(`[Duplicados] ${pares.length} pares encontrados (acima de ${limite}) — nada foi juntado, conferir`); return 0 }
  let n = 0;
  for (const p of pares) {
    try { await mesclarContato(Number(p.origem), Number(p.destino)); n++ } catch (e) { console.error('[Duplicados]', p.origem, '->', p.destino, (e as Error).message) }
  }
  if (n) console.log(`[Duplicados] ${n} contato(s) do WhatsApp juntados com a revendedora do Jueri`);
  return n;
}

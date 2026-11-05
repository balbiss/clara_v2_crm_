// Tarefa pendente sem responsável vai pra dona (carteira) da revendedora (Bel/dono, 2026-11-04: 1.200 tarefas
// sem ninguém, que nenhuma consultora enxergava). Lead sem dona (ex.: Prospecção, número sem carteira) → quem
// está atendendo a conversa mais recente dele (Bel, 05/11: "as pessoas que são atribuídas a ela").
// Roda quando a carteira muda (updateContact) e a cada 5 min pelo job — a carteira também muda por rodízio,
// disparo, Jueri e troca em massa, e a conversa é atribuída sem passar por updateContact.
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export async function entregarTarefasSemDono(contactId?: number): Promise<number> {
  const so = contactId ? sql` AND c.id = ${contactId}` : sql``;
  const r = await db.execute(sql`UPDATE tarefas t SET user_id = d.dono, updated_at = now()
    FROM (
      SELECT c.id, COALESCE(c.user_id, (SELECT cv.user_id FROM conversations cv
        WHERE cv.contact_id = c.id AND cv.user_id IS NOT NULL
        ORDER BY cv.last_activity_at DESC NULLS LAST, cv.id DESC LIMIT 1)) AS dono
      FROM contacts c
      WHERE EXISTS (SELECT 1 FROM tarefas p WHERE p.contact_id = c.id AND p.status = 'pendente' AND p.user_id IS NULL)${so}
    ) d
    WHERE t.contact_id = d.id AND t.status = 'pendente' AND t.user_id IS NULL AND d.dono IS NOT NULL
    RETURNING t.id`);
  const n = (r as unknown as { length?: number }).length ?? 0;
  if (n && !contactId) console.log(`Tarefas sem responsável entregues à dona/atendente: ${n}`);
  return n;
}

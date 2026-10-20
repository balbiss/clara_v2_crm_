import { db } from '../db/client.js';
import { activityEvents } from '../db/schema.js';

// "Lista de eventos" do Kommo (Insights › Atividades): cada mudança no lead vira uma linha, com quem
// fez (userId) ou nulo quando foi a automação ("Robô"). Gravar evento nunca pode quebrar a ação
// principal, então qualquer erro aqui só vai pro log.

export const EVENT_LABELS: Record<string, string> = {
  lead_created: 'Lead criado',
  stage_changed: 'Etapa alterada',
  lead_won: 'Venda ganha',
  lead_lost: 'Venda perdida',
  lead_deleted: 'Lead excluído',
  value_changed: 'Venda alterada',
  responsible_changed: 'Responsável alterado',
  tags_added: 'Tags adicionadas',
  tags_removed: 'Tags excluídas',
  field_changed: 'Campo alterado',
  task_created: 'Tarefa criada',
  task_completed: 'Conclusão da tarefa',
  task_changed: 'Texto da tarefa alterado',
  note_added: 'Nota adicionada',
  status_changed: 'Etapa do Consignado alterada',
};

export type EventInput = {
  accountId: number; userId?: number | null; contactId?: number | null;
  objectType: 'lead' | 'contato' | 'tarefa' | 'nota'; objectId?: number | null; objectName?: string | null;
  eventType: keyof typeof EVENT_LABELS | string; before?: unknown; after?: unknown; meta?: Record<string, unknown>;
};

const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : Array.isArray(v) ? v.join(', ') : String(v));

export async function logEvent(e: EventInput) {
  try {
    await db.insert(activityEvents).values({
      accountId: e.accountId, userId: e.userId ?? null, contactId: e.contactId ?? null,
      objectType: e.objectType, objectId: e.objectId ?? null, objectName: e.objectName?.slice(0, 250) ?? null,
      eventType: e.eventType, valueBefore: str(e.before), valueAfter: str(e.after), meta: e.meta ?? {},
    });
  } catch (err) {
    console.error('Evento não registrado (segue a ação):', (err as Error).message);
  }
}

import { sendDueScheduledMessages } from './scheduledMessages.js';
import { reopenExpiredSnoozes } from './snoozed.js';
import { importPendingHistories, syncInboxHistory } from './wahaHistorySync.js';
import { tickPipelineTriggers } from '../lib/pipelines.js';
import { autoCloseConversations } from '../routes/settings.js';
import { tickSalesbot } from '../lib/salesbot.js';
import { tickAiAgents } from '../lib/aiAgent.js';
import { rodarSyncJueri } from '../lib/jueriSync.js';
import { avancarRegua } from './regua.js';
import { renovarFotosPerfil } from '../lib/avatars.js';
import { tickDisparos } from '../lib/disparos.js';

// Substitui o config/recurring.yml do Solid Queue da v1. Cada tarefa roda num intervalo fixo,
// sem sobrepor execuções. JOBS_DISABLED=true desliga tudo (útil em teste).
type Task = { name: string; everyMs: number; run: () => Promise<unknown>; busy?: boolean };

const tasks: Task[] = [
  { name: 'scheduled_messages', everyMs: 30 * 1000, run: sendDueScheduledMessages },
  { name: 'check_snoozed_conversations', everyMs: 60 * 1000, run: reopenExpiredSnoozes },
  { name: 'pipeline_triggers', everyMs: 60 * 1000, run: () => tickPipelineTriggers() },
  { name: 'salesbot', everyMs: 30 * 1000, run: tickSalesbot },
  { name: 'ai_agents_no_reply', everyMs: 60 * 1000, run: () => tickAiAgents() },
  // régua da maleta (3º/10º/20º dia, atrasada, suspensa) — ReguaAutoAdvanceJob da v1
  { name: 'regua_auto_advance', everyMs: 60 * 60 * 1000, run: () => avancarRegua() },
  // Jueri: completo de hora em hora (a v1 também sincroniza — não dobrar a carga no limite da API) e cadastro a cada 15 min
  { name: 'jueri_sync', everyMs: 60 * 60 * 1000, run: () => rodarSyncJueri('completo') },
  { name: 'jueri_cadastro', everyMs: 15 * 60 * 1000, run: () => rodarSyncJueri('cadastro') },
  { name: 'fotos_perfil', everyMs: 10 * 60 * 1000, run: () => renovarFotosPerfil() },
  { name: 'auto_close_conversations', everyMs: 5 * 60 * 1000, run: autoCloseConversations },
  // disparo em massa: 1 envio por número por rodada (intervalo/limite/horário em lib/disparos)
  { name: 'disparos', everyMs: 15 * 1000, run: tickDisparos },
  { name: 'waha_history_sync', everyMs: 30 * 60 * 1000, run: () => syncInboxHistory() },
];

export function registerTask(t: Task) { tasks.push(t); }

export function startJobs() {
  if (process.env.JOBS_DISABLED === 'true') return console.log('Jobs: desligados (JOBS_DISABLED=true)');
  for (const t of tasks) {
    const tick = async () => {
      if (t.busy) return;
      t.busy = true;
      try { await t.run(); } catch (e) { console.error(`Job ${t.name} falhou —`, (e as Error).message); } finally { t.busy = false; }
    };
    setInterval(tick, t.everyMs);
  }
  // primeira carga do Jueri logo depois de subir (o intervalo normal é de 1 h)
  setTimeout(() => { void rodarSyncJueri('completo') }, 3 * 60 * 1000);
  setTimeout(() => { void renovarFotosPerfil().catch(e => console.error('[Fotos]', e.message)) }, 90 * 1000);
  setTimeout(() => { void importPendingHistories().catch(e => console.error('[WahaHistorico]', e.message)) }, 2 * 60 * 1000);
  setTimeout(() => { void avancarRegua().catch(e => console.error('[Régua]', e.message)) }, 60 * 1000);
  console.log('Jobs: ' + tasks.map(t => t.name).join(', '));
}

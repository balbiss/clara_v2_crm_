import { sendDueScheduledMessages } from './scheduledMessages.js';
import { reopenExpiredSnoozes } from './snoozed.js';
import { syncInboxHistory } from './wahaHistorySync.js';
import { tickPipelineTriggers } from '../lib/pipelines.js';
import { autoCloseConversations } from '../routes/settings.js';

// Substitui o config/recurring.yml do Solid Queue da v1. Cada tarefa roda num intervalo fixo,
// sem sobrepor execuções. JOBS_DISABLED=true desliga tudo (útil em teste).
type Task = { name: string; everyMs: number; run: () => Promise<unknown>; busy?: boolean };

const tasks: Task[] = [
  { name: 'scheduled_messages', everyMs: 30 * 1000, run: sendDueScheduledMessages },
  { name: 'check_snoozed_conversations', everyMs: 60 * 1000, run: reopenExpiredSnoozes },
  { name: 'pipeline_triggers', everyMs: 60 * 1000, run: () => tickPipelineTriggers() },
  { name: 'auto_close_conversations', everyMs: 5 * 60 * 1000, run: autoCloseConversations },
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
  console.log('Jobs: ' + tasks.map(t => t.name).join(', '));
}

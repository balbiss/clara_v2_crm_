import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts } from '../db/schema.js';
import { updateContact } from '../lib/contacts.js';
import { criarTarefaParaTransicao } from '../lib/tarefas.js';

// ReguaAutoAdvanceJob da v1: avança a revendedora pelos dias do ciclo da maleta
// (3 dias → 3º dia, 10 → 10º dia, 20 → 20º dia, 35 → Atrasada) e cria a tarefa da etapa;
// quem está Atrasada e virou o mês sem acerto vira Suspensa por atraso. Roda de hora em hora.
const AVANCAVEIS = ['revendedor_ativo', 'terceiro_dia', 'decimo_dia', 'vigesimo_dia'];

export function proximoStatus(status: string, dias: number): string | null {
  if (dias >= 35) return 'atrasada';
  if (dias >= 20 && status !== 'vigesimo_dia') return 'vigesimo_dia';
  if (dias >= 10 && status === 'terceiro_dia') return 'decimo_dia';
  if (dias >= 3 && status === 'revendedor_ativo') return 'terceiro_dia';
  return null;
}

const mesSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d);

export async function avancarRegua(agora = new Date()) {
  let avancou = 0, suspensas = 0;
  for (const c of await db.select().from(contacts).where(inArray(contacts.status, AVANCAVEIS))) {
    const inicio = c.cycleStartedAt || c.createdAt;
    const dias = Math.floor((+agora - +inicio) / 86400e3);
    const novo = proximoStatus(c.status || '', dias);
    if (!novo || novo === c.status) continue;
    await updateContact(c, { status: novo });
    await criarTarefaParaTransicao(c.id, novo).catch(e => console.error('[Régua] tarefa', c.id, (e as Error).message));
    avancou++;
  }
  for (const c of await db.select().from(contacts).where(eq(contacts.status, 'atrasada'))) {
    if (mesSP(agora) > mesSP(c.cycleStartedAt || c.createdAt)) { await updateContact(c, { status: 'suspensa_atraso' }); suspensas++ }
  }
  if (avancou || suspensas) console.log(`[Régua] ${avancou} avançaram, ${suspensas} suspensas por atraso`);
}

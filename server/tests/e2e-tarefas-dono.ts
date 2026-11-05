// Tarefas: prazo 0 = fim do dia; tarefa pendente sem responsável vai pra dona da revendedora (2026-11-04).
// Rodar: DATABASE_URL=... DB_POOL_MAX=1 JOBS_DISABLED=true npx tsx tests/e2e-tarefas-dono.ts  (banco local com seed)
import { eq, inArray } from 'drizzle-orm';
import { db, sql as pg } from '../src/db/client.js';
import { accounts, contacts, contactAuditEvents, tarefas, users } from '../src/db/schema.js';
import { taskDeadline } from '../src/lib/pipelines.js';
import { updateContact } from '../src/lib/contacts.js';
import { entregarTarefasSemDono } from '../src/lib/tarefasDono.js';

let ok = 0, fail = 0;
const check = (n: string, c: boolean, x = '') => { if (c) { ok++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, x) } };
const sp = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().replace('T', ' ').slice(0, 16);

console.log('Prazo');
const hojeSP = sp(new Date()).slice(0, 10);
const fim = taskDeadline({ prazo_horas: 0 });
check('prazo 0 vence no fim do dia (23:59 de Brasília)', sp(fim) === `${hojeSP} 23:59`, sp(fim));
check('prazo vazio também', sp(taskDeadline({})) === `${hojeSP} 23:59`);
const em2h = taskDeadline({ prazo_horas: 2 });
check('prazo 2 horas continua 2 horas', Math.abs(em2h.getTime() - Date.now() - 2 * 3600_000) < 5000);
check('"Imediatamente" continua na hora', Math.abs(taskDeadline({ deadline: 'now' }).getTime() - Date.now()) < 5000);

console.log('Responsável');
const [acc] = await db.select().from(accounts).limit(1);
const [cons] = await db.select().from(users).where(eq(users.email, 'consultor@teste.local'));
const [ger] = await db.select().from(users).where(eq(users.email, 'gerente@teste.local'));
const suf = String(Date.now()).slice(-6);
const [semDona] = await db.insert(contacts).values({ accountId: acc.id, name: 'Sem dona ' + suf, phone: '+551690' + suf } as any).returning();
const [comDona] = await db.insert(contacts).values({ accountId: acc.id, name: 'Com dona ' + suf, phone: '+551691' + suf, userId: cons.id } as any).returning();
const nova = (contactId: number, extra: Record<string, unknown> = {}) => db.insert(tarefas).values({ accountId: acc.id, contactId, tipo: 'teste_' + Math.random().toString(36).slice(2, 7), titulo: 'Teste', status: 'pendente', vencimentoEm: new Date(), ...extra } as any).returning().then(r => r[0]);
const t1 = await nova(semDona.id);
const t2 = await nova(comDona.id);
const t3 = await nova(comDona.id, { status: 'concluida' });
const t4 = await nova(comDona.id, { userId: ger.id });

await updateContact(semDona, { userId: ger.id });
const get = async (id: number) => (await db.select().from(tarefas).where(eq(tarefas.id, id)))[0];
check('revendedora entra na carteira: a tarefa dela vai pra dona', (await get(t1.id)).userId === ger.id, String((await get(t1.id)).userId));
const n = await entregarTarefasSemDono();
check('rotina entrega tarefa sem responsável de revendedora que já tem dona', (await get(t2.id)).userId === cons.id && n >= 1, `${(await get(t2.id)).userId} n=${n}`);
check('tarefa concluída não é mexida', (await get(t3.id)).userId === null);
check('tarefa que já tem responsável continua com ela', (await get(t4.id)).userId === ger.id);
check('rodar de novo não muda nada', (await entregarTarefasSemDono()) === 0 || (await get(t2.id)).userId === cons.id);

await db.delete(tarefas).where(inArray(tarefas.id, [t1.id, t2.id, t3.id, t4.id]));
await db.delete(contactAuditEvents).where(inArray(contactAuditEvents.contactId, [semDona.id, comDona.id]));
await db.delete(contacts).where(inArray(contacts.id, [semDona.id, comDona.id]));
console.log(`\n${ok} ok, ${fail} falha(s)`);
await pg.end();
process.exit(fail ? 1 : 0);

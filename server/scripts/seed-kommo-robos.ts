// Recria no v2 os robôs (Salesbot) que a Clara usava no Kommo, traduzidos do JSON do Kommo
// (mapeamento de 20/10/2026), e religa os gatilhos "Executar Robô" do Automatize que estavam
// desligados. Os robôs entram DESLIGADOS: só mandam mensagem quando o dono ligar.
// Idempotente: robô com o mesmo nome é atualizado, não duplicado.
//   npx tsx scripts/seed-kommo-robos.ts
import 'dotenv/config';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { accounts, flows, pipelineTriggers, pipelineStages, pipelines } from '../src/db/schema.js';
import { validateDefinition } from '../src/routes/salesbot.js';
/* eslint-disable @typescript-eslint/no-explicit-any */

const AG = '{{lead.data_agendamento}}';
const ROBOS: { name: string; trigger: any; definition: any }[] = [
  {
    name: 'Confirma Agend. Dia Seguinte',
    trigger: { event: 'manual' }, // roda pelo Automatize: 24h antes da Data de Agendamento
    definition: { start: 's0', steps: {
      s0: { id: 's0', type: 'condition', branches: [{ logic: 'and', rules: [{ field: 'data_agendamento', op: 'empty' }], next: 'fim' }], else_next: 's4' },
      s4: { id: 's4', type: 'condition', branches: [{ logic: 'and', rules: [{ field: 'conversation_status', op: 'eq', value: 'resolved' }], next: 's5' }], else_next: 's8' },
      s5: { id: 's5', type: 'message', text: `*Mensagem automática* 💬\nOi! Aqui é a Jóia, assistente virtual da Clara! 💫\n\nPassando para lembrar do nosso horário agendado para amanhã:\n${AG}\n\nSe precisar de qualquer coisa, é só me chamar. Tô por aqui pra te ajudar sempre! 💎`, next: 's6' },
      s6: { id: 's6', type: 'action', action: 'conversation_status', config: { status: 'closed' }, next: 'fim' },
      s8: { id: 's8', type: 'message', text: `*Mensagem automática* 💬\nOii! Passando para lembrar do nosso horário agendado para amanhã:\n${AG}\n\nSe precisar de qualquer coisa, é só me chamar. Tô por aqui pra te ajudar sempre! 💎`,
        buttons: [{ label: 'Confirmado', next: 'fim' }, { label: 'Reagendar', next: 'fim' }], on_other: 'fim', no_answer: { minutes: 5, next: 'fim' } },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
  {
    name: 'Encerra Chat por falta de interação',
    trigger: { event: 'manual' },
    definition: { start: 's0', steps: {
      s0: { id: 's0', type: 'condition', branches: [{ logic: 'and', rules: [{ field: 'conversation_status', op: 'eq', value: 'resolved' }], next: 'fim' }], else_next: 's2' },
      s2: { id: 's2', type: 'message', text: 'Esse atendimento foi encerrado automaticamente por falta de interação. Se quiser retomar o atendimento, por favor, clique no botão abaixo.\n\nEstamos sempre à disposição 💫',
        buttons: [{ label: 'Retomar Atendimento', next: 'fim' }], on_other: 'fim', no_answer: { minutes: 30, next: 's4' } },
      s4: { id: 's4', type: 'action', action: 'conversation_status', config: { status: 'closed' }, next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
  {
    name: 'Pesquisa de satisfação',
    trigger: { event: 'manual' }, // Automatize: 30 min depois de entrar em "Revendedor Ativo"
    definition: { start: 's0', steps: {
      s0: { id: 's0', type: 'condition', branches: [{ logic: 'and', rules: [{ field: 'conversation_status', op: 'eq', value: 'resolved' }], next: 'f1' }], else_next: 'a1' },
      // conversa estava fechada: manda e fecha de novo (pra não abrir atendimento na fila)
      f1: { id: 'f1', type: 'message', text: 'A sua *experiência* na Clara Ferreira é muito importante para nós', next: 'f2' },
      f2: { id: 'f2', type: 'message', text: 'Preparamos uma *pesquisa de satisfação* *rápida e totalmente sigilosa* para entender melhor a sua experiência como revendedora Clara Ferreira.', next: 'f3' },
      f3: { id: 'f3', type: 'pause', mode: 'timer', seconds: 5, next: 'f4' },
      f4: { id: 'f4', type: 'message', text: 'Leva apenas alguns minutinhos e faz toda a diferença no nosso crescimento.', next: 'f5' },
      f5: { id: 'f5', type: 'message', text: 'Basta clicar no link abaixo e responder à pesquisa:\n\n🔗 https://forms.gle/dJSrNADwbtiscpvU7', next: 'f6' },
      f6: { id: 'f6', type: 'pause', mode: 'timer', seconds: 3, next: 'f7' },
      f7: { id: 'f7', type: 'message', text: 'Obrigada por confiar no nosso trabalho, crescer junto com a Clara Ferreira e fazer parte dessa história tão especial. ✨💖', next: 'f8' },
      f8: { id: 'f8', type: 'action', action: 'conversation_status', config: { status: 'closed' }, next: 'fim' },
      a1: { id: 'a1', type: 'message', text: 'A sua *experiência* na Clara Ferreira é muito importante para nós', next: 'a2' },
      a2: { id: 'a2', type: 'message', text: 'Preparamos uma *pesquisa de satisfação* *rápida e totalmente sigilosa* para entender melhor a sua experiência como revendedora Clara Ferreira.', next: 'a3' },
      a3: { id: 'a3', type: 'pause', mode: 'timer', seconds: 3, next: 'a4' },
      a4: { id: 'a4', type: 'message', text: 'Leva apenas alguns minutinhos e faz toda a diferença no nosso crescimento.', next: 'a5' },
      a5: { id: 'a5', type: 'message', text: 'Basta clicar no link abaixo e responder à pesquisa:\n\n🔗 https://forms.gle/dJSrNADwbtiscpvU7', next: 'a6' },
      a6: { id: 'a6', type: 'pause', mode: 'timer', seconds: 3, next: 'a7' },
      a7: { id: 'a7', type: 'message', text: 'Obrigada por confiar no nosso trabalho, crescer junto com a Clara Ferreira e fazer parte dessa história tão especial. ✨💖', next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
  {
    name: 'Pós - pesquisa de satisfação',
    trigger: { event: 'manual' }, // Automatize: 2h depois de entrar em "Revendedor Ativo"
    definition: { start: 's0', steps: {
      s0: { id: 's0', type: 'condition', branches: [{ logic: 'and', rules: [{ field: 'conversation_status', op: 'eq', value: 'resolved' }], next: 'f1' }], else_next: 'a1' },
      f1: { id: 'f1', type: 'message', text: 'Oiii, sou eu de novo! 🤭', next: 'f2' },
      f2: { id: 'f2', type: 'message', text: 'Deu certo responder a pesquisa?', next: 'f3' },
      f3: { id: 'f3', type: 'pause', mode: 'timer', seconds: 3, next: 'f4' },
      f4: { id: 'f4', type: 'message', text: 'Se ficar com alguma dúvida é só me chamar!', next: 'f5' },
      f5: { id: 'f5', type: 'action', action: 'conversation_status', config: { status: 'closed' }, next: 'fim' },
      a1: { id: 'a1', type: 'message', text: 'Oiii, sou eu de novo! 🤭', next: 'a2' },
      a2: { id: 'a2', type: 'message', text: 'Deu certo responder a pesquisa?', next: 'a3' },
      a3: { id: 'a3', type: 'pause', mode: 'timer', seconds: 3, next: 'a4' },
      a4: { id: 'a4', type: 'message', text: 'Se ficar com alguma dúvida é só me chamar!', next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
];

const [account] = await db.select().from(accounts).orderBy(asc(accounts.id)).limit(1);
const idByName = new Map<string, number>();
for (const r of ROBOS) {
  const err = validateDefinition(r.definition);
  if (err) throw new Error(`${r.name}: ${err}`);
  const [existe] = await db.select().from(flows).where(and(eq(flows.accountId, account.id), eq(flows.name, r.name), eq(flows.kind, 'salesbot')));
  if (existe) { await db.update(flows).set({ definition: r.definition, triggerConfig: r.trigger, updatedAt: new Date() }).where(eq(flows.id, existe.id)); idByName.set(r.name, existe.id); console.log(`Robô "${r.name}" atualizado.`) }
  else { const [f] = await db.insert(flows).values({ accountId: account.id, kind: 'salesbot', active: false, name: r.name, definition: r.definition, triggerConfig: r.trigger }).returning(); idByName.set(r.name, f.id); console.log(`Robô "${r.name}" criado (desligado).`) }
}

// religa os "Executar Robô" do Automatize que apontavam pelo nome
const gatilhos = await db.select({ t: pipelineTriggers }).from(pipelineTriggers)
  .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineTriggers.pipelineStageId)).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
  .where(and(eq(pipelines.accountId, account.id), eq(pipelineTriggers.actionType, 'start_flow')));
let religados = 0;
for (const { t } of gatilhos) {
  const cfg = (t.config || {}) as any;
  const id = cfg.flow_id || idByName.get(cfg.flow_name);
  if (!id) continue;
  await db.update(pipelineTriggers).set({ config: { ...cfg, flow_id: id }, active: true, updatedAt: new Date() }).where(eq(pipelineTriggers.id, t.id));
  religados++;
}
console.log(`${religados} gatilho(s) "Executar Robô" religado(s) no Automatize.`);
process.exit(0);

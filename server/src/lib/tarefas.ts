import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tarefas, contacts } from '../db/schema.js';
import { hojeSP } from './pedidos.js';

// Model Tarefa da v1 (régua operacional, briefing seção 23).
export const MANUAL_TIPOS = ['manual_ligar', 'manual_mensagem', 'manual_agendamento', 'manual_cobranca', 'manual_acompanhamento', 'manual_outro'];
export const MANUAL_TIPO_LABELS: Record<string, string> = {
  manual_ligar: 'Ligar', manual_mensagem: 'Enviar mensagem', manual_agendamento: 'Agendar acerto',
  manual_cobranca: 'Cobrança', manual_acompanhamento: 'Acompanhamento', manual_outro: 'Outro',
};
export const TIPOS = ['terceiro_dia', 'decimo_dia', 'vigesimo_dia', 'atrasada', ...MANUAL_TIPOS];
export const PRIORIDADES = ['normal', 'alta', 'urgente'];
export const STATUSES = ['pendente', 'concluida', 'ignorada'];

export const DEFINICOES: Record<string, { titulo: string; descricao: string; prioridade: string }> = {
  terceiro_dia: { titulo: '3° Dia — mensagem de incentivo', descricao: 'Mandar mensagem de incentivo\nPerguntar se conseguiu ver o catálogo\nOrientar a compartilhar fotos', prioridade: 'normal' },
  decimo_dia: { titulo: '10° Dia — acompanhar vendas', descricao: 'Mandar mensagem de incentivo\nPerguntar como estão as vendas\nLembrar do prazo\nIdentificar possíveis dificuldades', prioridade: 'normal' },
  vigesimo_dia: { titulo: '20° Dia — agendar acerto', descricao: 'Agendar acerto\nIncentivar a vender até o último dia\nPegar encomendas para o próximo mês\nVerificar se o mês está fraco', prioridade: 'alta' },
  atrasada: { titulo: 'Revendedora atrasada', descricao: 'Gerar alerta de prioridade\nAcionar consultor\nRegistrar tentativa de contato\nEncaminhar para resgate/suspensão se necessário', prioridade: 'urgente' },
};

export const isUniqueViolation = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505';

/** Limites do dia (fuso de Brasília, sem horário de verão): [início, fim]. */
export function diaSP(date = hojeSP()): [Date, Date] {
  return [new Date(`${date}T00:00:00-03:00`), new Date(`${date}T23:59:59.999-03:00`)];
}

/**
 * Tarefa.criar_para_transicao!: cria a tarefa da transição de status (3º/10º/20º dia, atrasada).
 * O índice único parcial garante 1 pendente por tipo por revendedora — duplicata é ignorada.
 */
export async function criarTarefaParaTransicao(contactId: number, tipo: string) {
  const def = DEFINICOES[tipo];
  if (!def) return null;
  const [c] = await db.select({ accountId: contacts.accountId, userId: contacts.userId }).from(contacts).where(eq(contacts.id, contactId));
  if (!c) return null;
  try {
    const [t] = await db.insert(tarefas).values({ accountId: c.accountId, contactId, userId: c.userId, tipo, titulo: def.titulo, descricao: def.descricao, prioridade: def.prioridade, vencimentoEm: new Date() }).returning();
    return t;
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

export async function pendenteDoTipo(contactId: number, tipo: string) {
  const [t] = await db.select().from(tarefas).where(and(eq(tarefas.contactId, contactId), eq(tarefas.tipo, tipo), eq(tarefas.status, 'pendente')));
  return t ?? null;
}

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema.js';

// Campos do lead no padrão do Kommo (aba "Configurar" do card): cada campo tem tipo, opções (listas),
// etapas em que é obrigatório, "só API" e "oculto". Tudo fica em accounts.contact_custom_fields —
// os campos fixos da v1 (venda, data_agendamento…) entram lá só com builtin: true pra guardar essas
// configurações, sem poder ser renomeados nem apagados (igual aos campos padrão do Kommo).

// mesmos tipos do Kommo (menu do campo novo): Texto curto, Numérico, Interruptor, Selecionar, Seleção múltipla,
// Data, Url, Texto longo, Botão de opção, Endereço curto, Endereço, Data de nascimento, CPF, Data e hora, Moeda, Arquivo
export const FIELD_TYPES = ['text', 'numeric', 'checkbox', 'select', 'multiselect', 'date', 'url', 'textarea', 'radiobutton', 'short_address', 'address', 'birthday', 'cpf', 'date_time', 'price', 'file'] as const;
export type FieldType = typeof FIELD_TYPES[number];
export type CustomField = {
  key: string; label: string; type?: FieldType; options?: string[]; required_stages?: string[];
  api_only?: boolean; hidden?: boolean; builtin?: boolean;
};

export const ASSIGNABLE_FIELD_KEYS = ['venda', 'proximo_agendamento', 'limite_inicial', 'dia_fechamento', 'data_agendamento', 'obs_fechamento',
  'dia_pf_fechamento', 'horario_fechamento', 'atraso', 'observacao_mes', 'meta', 'desafio_combinado', 'como_chegar_meta'];
export const BUILTIN_LABELS: Record<string, string> = {
  venda: 'Venda', proximo_agendamento: 'Próximo agendamento', limite_inicial: 'Limite Inicial', dia_fechamento: 'Dia Fechamento',
  data_agendamento: 'Data de Agendamento', obs_fechamento: 'Obs Fechamento', dia_pf_fechamento: 'Dia p/ Fechamento',
  horario_fechamento: 'Horário de Fechamento', atraso: 'Atraso', observacao_mes: 'Observação do mês', meta: 'Meta',
  desafio_combinado: 'Desafio combinado para o mês', como_chegar_meta: 'Como chegar na Meta',
};
// tipo padrão dos campos fixos (a v1 guardava tudo como texto)
export const BUILTIN_TYPES: Record<string, FieldType> = { venda: 'price', proximo_agendamento: 'date_time', data_agendamento: 'date_time', observacao_mes: 'textarea', como_chegar_meta: 'textarea' };

export async function customFieldsOf(accountId: number): Promise<CustomField[]> {
  const [a] = await db.select({ f: accounts.contactCustomFields }).from(accounts).where(eq(accounts.id, accountId));
  return Array.isArray(a?.f) ? a.f as CustomField[] : [];
}

/** Todos os campos (fixos + criados) já com a configuração aplicada. */
export async function allFieldsOf(accountId: number): Promise<CustomField[]> {
  const list = await customFieldsOf(accountId);
  const meta = new Map(list.filter(f => f.builtin).map(f => [f.key, f]));
  const fixed = ASSIGNABLE_FIELD_KEYS.map(key => ({ type: BUILTIN_TYPES[key] || 'text', ...meta.get(key), key, label: BUILTIN_LABELS[key], builtin: true } as CustomField));
  return [...fixed, ...list.filter(f => !f.builtin).map(f => ({ type: 'text' as FieldType, ...f }))];
}

/** Normaliza o que vem do formulário "Adicionar campo". */
export function cleanFieldInput(p: Record<string, unknown>) {
  const out: Partial<CustomField> = {};
  if ('label' in p) out.label = String(p.label ?? '').trim();
  if ('type' in p) out.type = (FIELD_TYPES as readonly string[]).includes(String(p.type)) ? p.type as FieldType : 'text';
  if ('options' in p) out.options = Array.isArray(p.options) ? [...new Set((p.options as unknown[]).map(o => String(o).trim()).filter(Boolean))] : [];
  if ('required_stages' in p) out.required_stages = Array.isArray(p.required_stages) ? (p.required_stages as unknown[]).map(String) : [];
  if ('api_only' in p) out.api_only = !!p.api_only;
  if ('hidden' in p) out.hidden = !!p.hidden;
  return out;
}

const emptyValue = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

/**
 * Campos obrigatórios que faltam pra entrar numa etapa. `stageRef` é `status:<chave da régua>`
 * (Consignado) ou `stage:<id da etapa do funil>`. Devolve os nomes dos campos vazios.
 */
export async function missingRequired(accountId: number, customAttributes: Record<string, unknown> | null, stageRef: string): Promise<string[]> {
  const attrs = customAttributes || {};
  return (await allFieldsOf(accountId))
    .filter(f => (f.required_stages || []).includes(stageRef) && emptyValue(attrs[f.key]))
    .map(f => f.label);
}

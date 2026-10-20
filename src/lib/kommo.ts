import type { CSSProperties } from 'react'

// Visual do Kommo pras telas que substituem o Kommo da Clara (funis, Automatize, lead) —
// a equipe já conhece o Kommo, então essas telas copiam o layout dele (prints em
// kommo-clara-mapeamento/prints). O resto do app continua no visual do v2.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const K = {
  font: "'PT Sans', 'Segoe UI', Arial, sans-serif",
  bg: '#f5f5f5',
  boardBg: '#ffffff',
  card: '#ffffff',
  line: '#e3e5e8',
  lineDark: '#c3c7cc',
  text: '#313942',
  muted: '#92989b',
  link: '#1375ab',
  blue: '#4c8bf7',
  blueDark: '#2d74f0',
  orange: '#f0a33a',
  red: '#f37575',
  green: '#7dbb2d',
}

/** Cores de etapa do Kommo (mesma paleta pastel que a Clara usava). */
export const STAGE_COLORS = ['#99ccff', '#ffff99', '#fffeb2', '#ffcc66', '#ffc8c8', '#ccff66', '#87f2c0', '#e6e8ff', '#ff8f92', '#ebffb1', '#d6eaff', '#c1e0ff', '#d5d8db']

export const kBtn = (variant: 'blue' | 'ghost' | 'flat' = 'ghost', extra: CSSProperties = {}): CSSProperties => ({
  height: 36, padding: '0 16px', borderRadius: 3, fontFamily: K.font, fontSize: 13, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer',
  ...(variant === 'blue' ? { background: K.blue, color: '#fff', border: 'none' }
    : variant === 'flat' ? { background: 'none', color: K.text, border: 'none' }
      : { background: '#fff', color: K.text, border: `1px solid ${K.lineDark}` }),
  ...extra,
})

export const kInput: CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: `1px solid ${K.lineDark}`, borderRadius: 3, fontFamily: K.font, fontSize: 14, color: K.text, background: '#fff', boxSizing: 'border-box' }

export const brlK = (n: number) => 'R$' + Math.round(n || 0).toLocaleString('pt-BR')

export const dataHoraBR = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// --- texto dos gatilhos, no jeito que o Kommo escreve --------------------------------------------

export const ACTIONS: { id: string; label: string }[] = [
  { id: 'move_stage', label: 'Alterar etapa do lead' },
  { id: 'create_task', label: 'Adicionar uma tarefa' },
  { id: 'complete_tasks', label: 'Concluir tarefas' },
  { id: 'set_field', label: 'Alterar campo' },
  { id: 'add_tags', label: 'Adicionar tags' },
  { id: 'remove_tags', label: 'Excluir tags' },
  { id: 'change_owner', label: 'Alterar usuário responsável' },
  { id: 'create_note', label: 'Adicionar nota' },
  { id: 'start_flow', label: 'Executar Robô (Salesbot)' },
  { id: 'ai_start', label: 'Iniciar agente de IA' },
  { id: 'ai_stop', label: 'Parar agente de IA' },
  { id: 'send_webhook', label: 'Enviar webhook' },
]
export const actionLabel = (id: string) => ACTIONS.find(a => a.id === id)?.label || id

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export const TIPOS_TAREFA: Record<string, string> = {
  manual_mensagem: 'Relacionamento (mensagem)', manual_ligar: 'Ligar', manual_agendamento: 'Agendamento',
  manual_cobranca: 'Cobrança', manual_acompanhamento: 'Acompanhamento', manual_outro: 'Outro',
}

export const fmtDelay = (min: number) => {
  if (!min) return ''
  if (min % (24 * 60) === 0) { const d = min / (24 * 60); return `${d} dia${d > 1 ? 's' : ''}` }
  if (min % 60 === 0) { const h = min / 60; return `${h} hora${h > 1 ? 's' : ''}` }
  return `${min} minutos`
}

export type Ctx = { stageName: (id: number) => string; tagName: (id: number) => string; userName: (id: number) => string; fieldLabel: (k: string) => string; flowName: (id: number) => string }

/** 1ª linha do cartão do gatilho: QUANDO. */
export function whenText(t: any, ctx: Ctx): string {
  if (t.event === 'schedule') {
    const s = t.schedule || {}
    if (s.kind === 'once') return `Executar: ${dataHoraBR(s.at)}`
    if (s.kind === 'weekly') return `Uma vez por semana, ${WEEKDAYS[Number(s.weekday)] || ''} às ${s.time}`
    return `Diariamente às ${s.time}`
  }
  if (t.event === 'date_field') {
    const off = Number(t.config?.offset_minutes) || 0
    const campo = ctx.fieldLabel(t.config?.date_field)
    if (!off) return `Na data de ${campo}`
    return `${fmtDelay(Math.abs(off))} ${off < 0 ? 'antes' : 'depois'} — Lead: ${campo}`
  }
  if (t.event === 'client_reply') return 'Quando o cliente responder nesta etapa'
  return t.delay_minutes ? `Quando movido para esta etapa, depois ${fmtDelay(t.delay_minutes)}` : 'Quando movido para ou criado nesta etapa'
}

/** 2ª linha: O QUE faz. */
export function whatText(t: any, ctx: Ctx): string {
  const c = t.config || {}
  switch (t.action_type) {
    case 'move_stage': return `Alterar etapa lead: ${ctx.stageName(Number(c.target_stage_id))}`
    case 'create_task': return `Adicionar uma tarefa: ${TIPOS_TAREFA[c.tipo] || 'Acompanhamento'} — ${c.titulo}`
    case 'complete_tasks': return 'Tarefas concluídas: Todos'
    case 'set_field': return `Alterar campo: ${ctx.fieldLabel(c.field_key)}: ${c.value || '(limpar)'}`
    case 'add_tags': return `Adicionar tags: ${(c.tag_ids || []).map((id: number) => ctx.tagName(id)).join(', ')}`
    case 'remove_tags': return `Excluir tags: ${(c.tag_ids || []).map((id: number) => ctx.tagName(id)).join(', ')}`
    case 'change_owner': return `Alterar responsável: ${ctx.userName(Number(c.user_id))}`
    case 'create_note': return `Adicionar nota: ${c.content}`
    case 'start_flow': return `Executar Robô: ${c.flow_id ? ctx.flowName(Number(c.flow_id)) : c.flow_name || '—'}`
    case 'ai_start': return `Iniciar agente de IA${c.agent_name ? `: ${c.agent_name}` : ''}`
    case 'ai_stop': return `Parar agente de IA${c.agent_name ? `: ${c.agent_name}` : ' (todos)'}`
    case 'send_webhook': return `Enviar webhook: ${c.url}`
    default: return t.action_type
  }
}

export const condText = (k: any, ctx: Ctx) => {
  if (k.op === 'has_tag') return `tem a tag ${ctx.tagName(Number(k.value))}`
  if (k.op === 'no_tag') return `não tem a tag ${ctx.tagName(Number(k.value))}`
  const f = ctx.fieldLabel(k.field)
  return k.op === 'empty' ? `${f} vazio` : k.op === 'not_empty' ? `${f} preenchido` : k.op === 'neq' ? `${f} ≠ ${k.value}` : k.op === 'contains' ? `${f} contém ${k.value}` : `${f}: ${k.value}`
}

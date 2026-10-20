// Textos e modelos do Salesbot (mesmos nomes do Kommo). O motor fica em server/src/lib/salesbot.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const STEP_LABELS: Record<string, string> = {
  message: 'Enviar mensagem', condition: 'Condição', pause: 'Pausa', validation: 'Validação', internal_message: 'Enviar mensagem interna',
  action: 'Ação', goto: 'Ir para outro passo', start_bot: 'Iniciar bot', round_robin: 'Round Robin', stop: 'Parar robô',
}
export const STEP_ORDER = ['message', 'internal_message', 'condition', 'validation', 'pause', 'action', 'round_robin', 'goto', 'start_bot', 'stop']

export const ACTION_LABELS: Record<string, string> = {
  add_note: 'Adicionar nota', add_task: 'Adicionar tarefa', conversation_status: 'Mudar status da conversa', move_stage: 'Mudar etapa do lead',
  change_owner: 'Mudar usuário responsável', complete_tasks: 'Concluir tarefas', manage_tags: 'Gerenciar tags', set_field: 'Preencher campo',
  webhook: 'Enviar webhook', create_lead: 'Criar lead',
}

export const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual (Automatize ou cartão do lead)',
  conversation_started: 'Quando o chat é iniciado por mensagem de entrada',
  incoming_message: 'Mensagem de entrada recebida',
  conversation_closed: 'Conversa fechada',
  no_reply: 'X horas depois da última mensagem do cliente',
}

export function triggerSummary(t: any): string {
  const ev = t?.event || 'manual'
  if (ev === 'manual') return 'Manual'
  let s = TRIGGER_LABELS[ev] || ev
  if (ev === 'no_reply') s = `${t.hours || '?'} h sem resposta do cliente`
  if (t?.keywords?.length) s += ` · palavras: ${t.keywords.join(', ')}`
  return s
}

export const COND_FIELDS: [string, string][] = [
  ['message', 'Mensagem do cliente'], ['conversation_status', 'Status da conversa'], ['tag', 'Tag'], ['stage', 'Etapa do lead'], ['responsible', 'Usuário responsável'],
]
export const COND_OPS: [string, string][] = [['eq', 'é igual a'], ['neq', 'diferente de'], ['contains', 'contém'], ['not_contains', 'não contém'], ['empty', 'está vazio'], ['not_empty', 'está preenchido']]
export const VALIDATIONS: [string, string][] = [['email', 'É um e-mail'], ['phone', 'É um telefone'], ['number', 'É um número'], ['range', 'Número entre'], ['contains', 'Contém'], ['not_contains', 'Não contém'], ['equals', 'É igual a'], ['not_equals', 'Diferente de'], ['length', 'Tem o tamanho'], ['regex', 'Expressão regular']]

let seq = 0
export const newStepId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

/** Passo novo de cada tipo, já com os campos do formulário. */
export function blankStep(type: string): any {
  const id = newStepId()
  switch (type) {
    case 'message': return { id, type, text: '', buttons: [], next: null }
    case 'condition': return { id, type, branches: [{ logic: 'and', rules: [{ field: 'message', op: 'contains', value: '' }], next: null }], else_next: null }
    case 'pause': return { id, type, mode: 'reply', minutes: 0, seconds: 0, next: null, timeout_next: null }
    case 'validation': return { id, type, check: 'email', value: '', next: null, fail_next: null }
    case 'internal_message': return { id, type, text: '', next: null }
    case 'action': return { id, type, action: 'add_note', config: {}, next: null }
    case 'goto': return { id, type, target: null }
    case 'start_bot': return { id, type, flow_id: null }
    case 'round_robin': return { id, type, options: [{ next: null }, { next: null }] }
    default: return { id, type: 'stop' }
  }
}

// --- modelos ("Criar um bot") -------------------------------------------------------------------
export const TEMPLATES: { name: string; description: string; preview: string; color: string; trigger: any; definition: any }[] = [
  {
    name: 'Bot de boas-vindas', description: 'Cumprimenta quem chama no WhatsApp e direciona pelo menu.', preview: 'No que posso te ajudar? 👋', color: '#dcfce7',
    trigger: { event: 'conversation_started' },
    definition: { start: 'm1', steps: {
      m1: { id: 'm1', type: 'message', text: 'Oi, {{contact.first_name}}! 👋 Bem-vinda à Clara Ferreira. No que posso te ajudar?', buttons: [{ label: 'Quero revender', next: 'r' }, { label: 'Já sou revendedora', next: 'j' }, { label: 'Outro assunto', next: 'o' }], on_other: 'o', no_answer: { minutes: 30, next: 'fim' } },
      r: { id: 'r', type: 'message', text: 'Que legal! Já vou te passar para uma consultora. 💎', next: 'rr' },
      rr: { id: 'rr', type: 'action', action: 'change_owner', config: { mode: 'round_robin', user_ids: [] }, next: 'fim' },
      j: { id: 'j', type: 'message', text: 'Oba! Já aviso a sua consultora. 😉', next: 'fim' },
      o: { id: 'o', type: 'message', text: 'Certo! Uma pessoa da equipe já vai te responder. 🙂', next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
  {
    name: 'Confirme agendamentos', description: 'Lembra o acerto do dia seguinte com os botões Confirmado / Reagendar.', preview: 'Você ainda vem amanhã? ✅ ❌', color: '#fce7f3',
    trigger: { event: 'manual' },
    definition: { start: 'c', steps: {
      c: { id: 'c', type: 'condition', branches: [{ logic: 'and', rules: [{ field: 'data_agendamento', op: 'empty' }], next: 'fim' }], else_next: 'm' },
      m: { id: 'm', type: 'message', text: 'Oii! Passando para lembrar do nosso horário agendado para amanhã: {{lead.data_agendamento}} 💎', buttons: [{ label: 'Confirmado', next: 'ok' }, { label: 'Reagendar', next: 'rg' }], on_other: 'fim', no_answer: { minutes: 60, next: 'fim' } },
      ok: { id: 'ok', type: 'message', text: 'Perfeito, te esperamos! 💖', next: 'fim' },
      rg: { id: 'rg', type: 'action', action: 'add_task', config: { titulo: 'Reagendar o acerto', tipo: 'manual_agendamento', deadline: 'now' }, next: 'rg2' },
      rg2: { id: 'rg2', type: 'message', text: 'Tudo bem! A sua consultora vai combinar um novo horário com você.', next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
  {
    name: 'Distribuir leads (Round Robin)', description: 'Cada lead novo vai para a próxima atendente da fila.', preview: 'Atendente 1 → 2 → 3 → 1…', color: '#e0f2fe',
    trigger: { event: 'conversation_started' },
    definition: { start: 'rr', steps: {
      rr: { id: 'rr', type: 'action', action: 'change_owner', config: { mode: 'round_robin', user_ids: [] }, next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
  {
    name: 'Encerrar por falta de interação', description: 'Avisa e fecha a conversa se o cliente não responder em 30 min.', preview: 'Atendimento encerrado por falta de interação', color: '#fef3c7',
    trigger: { event: 'manual' },
    definition: { start: 'm', steps: {
      m: { id: 'm', type: 'message', text: 'Esse atendimento foi encerrado automaticamente por falta de interação. Se quiser retomar, clique no botão abaixo. 💫', buttons: [{ label: 'Retomar Atendimento', next: 'fim' }], on_other: 'fim', no_answer: { minutes: 30, next: 'close' } },
      close: { id: 'close', type: 'action', action: 'conversation_status', config: { status: 'closed' }, next: 'fim' },
      fim: { id: 'fim', type: 'stop' },
    } },
  },
]

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import api from '../api'
import { Modal, btn, inputStyle, labelStyle } from './ui'
import { toast } from './ui2'

// Gerador de prompt do Agente de IA (a geração em si usa a OpenAI no servidor)
const EMPTY = { identity: '', institutional: '', faq: '', greeting_message: '', ai_role: 'sdr_and_sales', allow_scheduling: true, use_whatsapp_name: true, emoji_usage: 'moderate', sdr_rules: '', routing_rules: '', prohibited_actions: '' }

export default function PromptGeneratorModal({ inboxId, isOpen, onClose, onGenerated }: { inboxId: number; isOpen: boolean; onClose: () => void; onGenerated: (prompt: string) => void }) {
  const [form, setForm] = useState({ ...EMPTY })
  const [busy, setBusy] = useState(false)
  if (!isOpen) return null
  const set = (p: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...p }))
  const generate = async () => {
    if (!form.identity || !form.institutional) return toast('warning', 'Preencha pelo menos a Identidade e o Institucional.')
    setBusy(true)
    try { onGenerated((await api.post(`/inboxes/${inboxId}/generate_prompt`, { prompt_data: form })).data.prompt); onClose() }
    catch { toast('error', 'Erro ao gerar o prompt. Confira a chave da OpenAI e tente de novo.') }
    finally { setBusy(false) }
  }
  const ta = (label: string, key: keyof typeof EMPTY, placeholder: string, hint?: string) => (
    <div style={{ marginBottom: 14 }}>
      <span style={labelStyle}>{label}</span>
      <textarea value={form[key] as string} onChange={e => set({ [key]: e.target.value })} placeholder={placeholder} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      {hint && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{hint}</span>}
    </div>
  )
  const check = (label: string, key: 'allow_scheduling' | 'use_whatsapp_name') => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={form[key]} onChange={e => set({ [key]: e.target.checked })} /> {label}</label>
  )
  return (
    <Modal title="Gerador de prompt com IA" width={680} onClose={onClose}
      subtitle="Preencha os detalhes da sua empresa. A IA escreve o prompt de comportamento da secretária virtual."
      footer={<><button onClick={onClose} disabled={busy} style={btn('ghost')}>Cancelar</button>
        <button onClick={generate} disabled={busy} style={btn('primary')}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />} {busy ? 'Processando (até 10s)…' : 'Gerar prompt'}</button></>}>
      {ta('1. Identidade e tom de voz', 'identity', 'Ex.: Somos a Clara Ferreira Acessórios, revenda consignada de joias. A IA se chama Ana, com tom amigável e acolhedor.')}
      {ta('2. Institucional (regras e diferenciais)', 'institutional', 'Ex.: Atendemos seg a sex das 9h às 18h. A régua de acompanhamento é no 3º, 10º e 20º dia.')}
      {ta('3. Perguntas frequentes', 'faq', 'Ex.: Posso trocar peças da maleta? Sim, em até 30 dias.')}
      {ta('4. Mensagem de saudação (primeiro contato)', 'greeting_message', 'Ex.: Olá! Sou a Ana, assistente da Clara Ferreira Acessórios. Como posso ajudar?', 'Enviada exatamente assim no primeiro contato. Em branco: a IA cria uma saudação natural.')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }} data-modal-grid>
        <div>
          <span style={labelStyle}>5. Modo de atuação</span>
          <select value={form.ai_role} onChange={e => set({ ai_role: e.target.value })} style={inputStyle}>
            <option value="sdr_and_sales">Completo (qualifica, acompanha a régua e agenda)</option>
            <option value="sdr_only">Só pré-venda (coleta dados e transfere)</option>
          </select>
        </div>
        <div>
          <span style={labelStyle}>Uso de emojis</span>
          <select value={form.emoji_usage} onChange={e => set({ emoji_usage: e.target.value })} style={inputStyle}>
            <option value="none">Nenhum (formal)</option><option value="moderate">Moderado</option><option value="lots">Bastante (descontraído)</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{check('A IA pode agendar sozinha', 'allow_scheduling')}{check('Chamar pelo nome sem perguntar', 'use_whatsapp_name')}</div>
      </div>
      {ta('6. Regras de pré-venda', 'sdr_rules', 'Ex.: Coletar nome e confirmar o ID da revendedora no Jueri antes de falar de pedidos.')}
      {ta('7. Quando chamar um humano', 'routing_rules', 'Ex.: Transferir se pedir para falar com humano ou fizer perguntas de cobrança.')}
      {ta('8. O que a IA nunca deve fazer', 'prohibited_actions', 'Ex.: Nunca prometer desconto. Nunca passar endereço sem agendar.')}
    </Modal>
  )
}

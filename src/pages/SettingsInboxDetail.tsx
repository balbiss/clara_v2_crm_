import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Sparkles, Upload } from 'lucide-react'
import api from '../api'
import { inboxesStore } from '../store/inboxes'
import { btn, inputStyle, labelStyle } from '../components/ui'
import { PageHead, Section, Switch, toast } from '../components/ui2'
import PromptGeneratorModal from '../components/PromptGeneratorModal'
import { ChatAvatar } from '../components/ChatAvatar'

// Configurações de uma caixa: geral, acesso por agente, secretária virtual (IA), base de
// conhecimento e resgate (follow-up). Os campos de IA/follow-up já são salvos; o motor que
// os executa entra na fase do Agente de IA.
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABS = [
  { id: 'settings', name: 'Configurações' }, { id: 'agents', name: 'Agentes' }, { id: 'bot', name: 'Secretária virtual' },
  { id: 'knowledge_base', name: 'Base de conhecimento' }, { id: 'followup', name: 'Resgate (follow-up)' },
]
const hint: React.CSSProperties = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, margin: '4px 0 0' }

function Toggle({ on, onChange, title, children }: { on: boolean; onChange: (v: boolean) => void; title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <Switch on={on} onChange={onChange} />
      <div><b style={{ display: 'block', fontSize: 14 }}>{title}</b><p style={hint}>{children}</p></div>
    </div>
  )
}

export default function SettingsInboxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inbox, setInbox] = useState<any>(null)
  const [tab, setTab] = useState('settings')
  const [members, setMembers] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const pdfRef = useRef<HTMLInputElement>(null)
  const set = (p: any) => setInbox((i: any) => ({ ...i, ...p }))

  useEffect(() => {
    api.get(`/inboxes/${id}`).then(({ data }) => setInbox(data)).catch(() => navigate('/settings/inboxes'))
    api.get(`/inboxes/${id}/members`).then(({ data }) => setMembers(data)).catch(e => console.error(e))
    api.get('/round_robin_groups').then(({ data }) => setGroups(data)).catch(e => console.error(e))
  }, [id, navigate])

  const save = async () => {
    if (inbox.followup_enabled && Number(inbox.followup_wait_time_minutes) < 10) return toast('warning', 'O tempo mínimo do follow-up é 10 minutos.')
    try {
      await api.put(`/inboxes/${inbox.id}`, { inbox: {
        name: inbox.name, bot_prompt: inbox.bot_prompt, ai_enabled: inbox.ai_enabled, ai_name: inbox.ai_name, ai_prompt: inbox.ai_prompt,
        knowledge_base: inbox.knowledge_base, followup_enabled: inbox.followup_enabled, followup_max_attempts: inbox.followup_max_attempts,
        followup_wait_time_minutes: inbox.followup_wait_time_minutes, followup_send_closing_message: inbox.followup_send_closing_message,
        followup_closing_message: inbox.followup_closing_message, round_robin_group_id: inbox.round_robin_group_id,
        restrict_by_portfolio: inbox.restrict_by_portfolio, sign_messages: inbox.sign_messages,
      } })
      toast('success', 'Configurações salvas!')
      inboxesStore.fetchInboxes()
    } catch { toast('error', 'Não foi possível salvar.') }
  }
  const toggleMember = async (m: any) => {
    try {
      if (m.is_member) await api.delete(`/inboxes/${id}/members/${m.id}`)
      else await api.post(`/inboxes/${id}/members`, { user_id: m.id })
      setMembers(ms => ms.map(x => (x.id === m.id ? { ...x, is_member: !m.is_member } : x)))
    } catch { toast('error', 'Erro ao atualizar permissão do agente.') }
  }
  // PDF só extrai o texto; a equipe revisa e salva de propósito (PDF às vezes vem com sujeira de OCR)
  const uploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post(`/inboxes/${inbox.id}/extract_knowledge_base_pdf`, fd, { headers: { 'Content-Type': undefined } })
      set({ knowledge_base: (inbox.knowledge_base || '') + (inbox.knowledge_base?.trim() ? '\n\n---\n\n' : '') + data.text })
      toast('success', 'Texto extraído do PDF! Revise e clique em Salvar.')
    } catch (err: any) { toast('error', err.response?.data?.error || 'Erro ao processar o PDF.') }
    finally { setUploading(false) }
  }

  if (!inbox) return <p style={{ color: 'var(--muted)' }}>Carregando…</p>
  const field = (label: React.ReactNode, node: React.ReactNode, h?: React.ReactNode) => <div style={{ marginBottom: 16 }}><span style={labelStyle}>{label}</span>{node}{h && <p style={hint}>{h}</p>}</div>
  const aiNote = <p style={{ fontSize: 12.5, color: '#9A5B00', background: '#FFF1D6', borderRadius: 8, padding: '8px 12px', margin: '0 0 16px' }}>Estas configurações já ficam salvas, mas o motor da IA ainda não está ligado nesta versão — ele entra na fase do Agente de IA.</p>

  return (
    <div>
      <button onClick={() => navigate('/settings/inboxes')} style={{ ...btn('ghost'), marginBottom: 14, padding: '6px 12px' }}><ChevronLeft size={14} /> Caixas de entrada</button>
      <PageHead title={`${inbox.name}${inbox.phone_number ? ` (${inbox.phone_number})` : ''}`} />
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 16px', border: 'none', background: 'none', fontSize: 13.5, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--terra)' : 'var(--muted)', boxShadow: tab === t.id ? 'inset 0 -2px 0 var(--terra)' : 'none', whiteSpace: 'nowrap' }}>{t.name}</button>
        ))}
      </div>

      <div style={{ maxWidth: 760 }}>
        {tab === 'settings' && (
          <Section title="Configurações da caixa">
            {field('Nome da caixa de entrada', <input value={inbox.name || ''} onChange={e => set({ name: e.target.value })} style={inputStyle} />)}
            {field('Provedor de API', <input value="WAHA (WhatsApp)" disabled style={{ ...inputStyle, color: 'var(--muted)' }} />)}
            {groups.length > 0 && field('Grupo de rodízio', (
              <select value={inbox.round_robin_group_id ?? ''} onChange={e => set({ round_robin_group_id: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
                <option value="">Sem grupo (rodízio com todas as consultoras da conta)</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            ), 'Leads que chegarem por este número vão só para as consultoras deste grupo.')}
            <Toggle on={!!inbox.restrict_by_portfolio} onChange={v => set({ restrict_by_portfolio: v })} title="Restringir por carteira">
              Ligado: quem tem acesso a esta caixa só vê as conversas das revendedoras que já são da carteira da pessoa, ou que ainda não têm responsável. Desligado: quem tem acesso vê todas as conversas da caixa (use assim em caixas como Marketing ou Gerência).
            </Toggle>
            <Toggle on={!!inbox.sign_messages} onChange={v => set({ sign_messages: v })} title="Assinar mensagens com o nome de quem respondeu">
              Ligado: a revendedora recebe o primeiro nome de quem respondeu em negrito, em cima da mensagem (ex.: <b>*Bel:*</b>). Vale só para mensagens digitadas no CRM — respostas da IA, follow-up e mensagens agendadas não são assinadas.
            </Toggle>
            <button onClick={save} style={btn('primary', { marginTop: 12 })}>Atualizar</button>
          </Section>
        )}

        {tab === 'agents' && (
          <Section title="Gerenciar acesso" description="Quais pessoas podem ver e responder mensagens por esta caixa de entrada.">
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
                  <ChatAvatar nome={m.name || m.email || '?'} size={32} />
                  <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13.5 }}>{m.name || 'Sem nome'}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.email}</span></span>
                  <button onClick={() => toggleMember(m)} style={btn(m.is_member ? 'ghost' : 'soft', { padding: '6px 12px', fontSize: 12.5, color: m.is_member ? '#B42318' : undefined })}>{m.is_member ? 'Remover' : 'Adicionar'}</button>
                </div>
              ))}
              {members.length === 0 && <p style={{ padding: 20, color: 'var(--muted)', margin: 0 }}>Nenhum agente encontrado nesta conta.</p>}
            </div>
          </Section>
        )}

        {tab === 'bot' && (
          <Section title="Secretária virtual">
            {aiNote}
            <Toggle on={!!inbox.ai_enabled} onChange={v => set({ ai_enabled: v })} title="Ativar secretária virtual autônoma">Se ativado, a inteligência artificial assume as conversas desta caixa.</Toggle>
            {inbox.ai_enabled && (
              <div style={{ marginTop: 8 }}>
                {field('Nome da secretária', <input value={inbox.ai_name || ''} onChange={e => set({ ai_name: e.target.value })} placeholder="Ex.: Ana, Júlia, Assistente Virtual" style={inputStyle} />)}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Prompt de comportamento</span>
                  <button onClick={() => setPromptOpen(true)} style={btn('soft', { padding: '5px 10px', fontSize: 12 })}><Sparkles size={13} /> Criar prompt com IA</button>
                </div>
                <textarea value={inbox.ai_prompt || ''} onChange={e => set({ ai_prompt: e.target.value })} rows={12} placeholder="Instrua a IA: como agir, tom de voz, regras de negócio e limites de atendimento…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            )}
            <button onClick={save} style={btn('primary', { marginTop: 18 })}>Salvar configurações da IA</button>
          </Section>
        )}

        {tab === 'knowledge_base' && (
          <Section title="Base de conhecimento" description="Informações da empresa (políticas, catálogo, perguntas frequentes) que a secretária consulta para responder. Cole o texto ou envie um PDF — o texto extraído entra abaixo para você revisar antes de salvar.">
            {aiNote}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Conteúdo</span>
              <button disabled={uploading} onClick={() => pdfRef.current?.click()} style={btn('soft', { padding: '5px 10px', fontSize: 12 })}><Upload size={13} /> {uploading ? 'Extraindo…' : 'Enviar PDF'}</button>
              <input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={uploadPdf} />
            </div>
            <textarea value={inbox.knowledge_base || ''} onChange={e => set({ knowledge_base: e.target.value })} rows={16} placeholder="Ex.: horário de atendimento, política de trocas, formas de pagamento, catálogo, perguntas frequentes…" style={{ ...inputStyle, resize: 'vertical' }} />
            <button onClick={save} style={btn('primary', { marginTop: 14 })}>Salvar base de conhecimento</button>
          </Section>
        )}

        {tab === 'followup' && (
          <Section title="Resgate automático (follow-up)">
            {aiNote}
            <Toggle on={!!inbox.followup_enabled} onChange={v => set({ followup_enabled: v })} title="Ativar agente de resgate">A IA chama quem abandonou a conversa, depois do tempo definido.</Toggle>
            {inbox.followup_enabled && (
              <div style={{ marginTop: 8 }}>
                {field('Tempo de espera sem resposta (minutos)', <input type="number" min={10} value={inbox.followup_wait_time_minutes ?? ''} onChange={e => set({ followup_wait_time_minutes: e.target.value })} placeholder="120" style={inputStyle} />, 'Ex.: 120 para esperar 2 horas antes de agir. Mínimo 10.')}
                {field('Máximo de tentativas', <input type="number" min={1} max={10} value={inbox.followup_max_attempts ?? ''} onChange={e => set({ followup_max_attempts: e.target.value })} placeholder="3" style={inputStyle} />, 'Passado esse limite o contato é marcado como frio e o fluxo encerra.')}
                <Toggle on={!!inbox.followup_send_closing_message} onChange={v => set({ followup_send_closing_message: v })} title="Mensagem de encerramento">Enviar uma última mensagem avisando que o atendimento será encerrado por falta de resposta.</Toggle>
                {inbox.followup_send_closing_message && <textarea value={inbox.followup_closing_message || ''} onChange={e => set({ followup_closing_message: e.target.value })} rows={4} placeholder="Ex.: Como não tivemos retorno, estou encerrando seu atendimento por aqui. Se precisar, é só chamar! 😊" style={{ ...inputStyle, resize: 'vertical' }} />}
              </div>
            )}
            <button onClick={save} style={btn('primary', { marginTop: 18 })}>Salvar configurações de resgate</button>
          </Section>
        )}
      </div>

      <PromptGeneratorModal inboxId={inbox.id} isOpen={promptOpen} onClose={() => setPromptOpen(false)} onGenerated={p => set({ ai_prompt: p })} />
    </div>
  )
}

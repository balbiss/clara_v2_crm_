import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSnapshot } from 'valtio'
import { BookOpen, Bot, ChevronLeft, RotateCcw, Settings2, ShieldCheck, Sparkles, Upload, Users } from 'lucide-react'
import api from '../api'
import { inboxesStore } from '../store/inboxes'
import { btn, inputStyle, labelStyle, serif } from '../components/ui'
import { Badge, Panel, Switch, toast } from '../components/ui2'
import { PainelLigacao } from '../components/PainelLigacao'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import PromptGeneratorModal from '../components/PromptGeneratorModal'
import { ChatAvatar } from '../components/ChatAvatar'

// Configurações de uma caixa: geral, acesso por agente, secretária virtual (IA), base de
// conhecimento e resgate (follow-up). Os campos de IA/follow-up já são salvos; o motor que
// os executa entra na fase do Agente de IA.
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABS = [
  { id: 'settings', name: 'Configurações', icon: Settings2 }, { id: 'agents', name: 'Agentes', icon: Users }, { id: 'bot', name: 'Secretária virtual', icon: Bot },
  { id: 'knowledge_base', name: 'Base de conhecimento', icon: BookOpen }, { id: 'followup', name: 'Resgate (follow-up)', icon: RotateCcw },
]
const hint: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, margin: '4px 0 0' }

/** +55 (11) 90962-4290 */
// mesma paleta do servidor (lib/conversations INBOX_COLORS)
const CORES_CAIXA = ['#8e2a46', '#b5546d', '#6d3b5e', '#a07f45', '#5f7d6a', '#4f6d8a', '#9a6a8f', '#7a5548']

export const fmtPhone = (p?: string | null) => {
  const d = (p || '').replace(/\D/g, '')
  const m = d.match(/^(55)(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : p || ''
}

function Toggle({ on, onChange, title, children }: { on: boolean; onChange: (v: boolean) => void; title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13.5 }}>{title}</b>{children && <p style={hint}>{children}</p>}</div>
      <Switch on={on} onChange={onChange} />
    </div>
  )
}
const toggleList = (children: React.ReactNode) => <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: -1 }}>{children}</div>
const aiNote = <p style={{ fontSize: 12.5, color: '#9A5B00', background: '#FFF1D6', borderRadius: 8, padding: '9px 12px', margin: '0 0 16px', lineHeight: 1.5 }}>Estas configurações já ficam salvas, mas o motor da IA ainda não está ligado nesta versão — ele entra na fase do Agente de IA.</p>

export default function SettingsInboxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const inboxes = useSnapshot(inboxesStore) as any
  const [inbox, setInbox] = useState<any>(null)
  const [tab, setTab] = useState('settings')
  const [members, setMembers] = useState<any[]>([])
  const [funis, setFunis] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const pdfRef = useRef<HTMLInputElement>(null)
  const set = (p: any) => setInbox((i: any) => ({ ...i, ...p }))

  useEffect(() => {
    api.get(`/inboxes/${id}`).then(({ data }) => setInbox(data)).catch(() => navigate('/settings/inboxes'))
    api.get(`/inboxes/${id}/members`).then(({ data }) => setMembers(data)).catch(e => console.error(e))
    api.get('/pipelines').then(({ data }) => setFunis(data.filter((p: any) => !p.system))).catch(() => {})
    api.get('/round_robin_groups').then(({ data }) => setGroups(data)).catch(e => console.error(e))
    if (!inboxesStore.isLoadedOnce) inboxesStore.fetchInboxes()
  }, [id, navigate])
  // acompanha a conexão e a importação das conversas enquanto a tela está aberta
  useEffect(() => {
    const n = Number(id)
    inboxesStore.checkStatus(n)
    const t = setInterval(() => inboxesStore.checkStatus(n), 10000)
    return () => clearInterval(t)
  }, [id])

  const save = async () => {
    if (inbox.followup_enabled && Number(inbox.followup_wait_time_minutes) < 10) return toast('warning', 'O tempo mínimo do follow-up é 10 minutos.')
    setSaving(true)
    try {
      await api.put(`/inboxes/${inbox.id}`, { inbox: {
        name: inbox.name, short_name: inbox.short_name || null, color: inbox.color || null, entry_stage_id: inbox.entry_stage_id || null, bot_prompt: inbox.bot_prompt, ai_enabled: inbox.ai_enabled, ai_name: inbox.ai_name, ai_prompt: inbox.ai_prompt,
        knowledge_base: inbox.knowledge_base, followup_enabled: inbox.followup_enabled, followup_max_attempts: inbox.followup_max_attempts,
        followup_wait_time_minutes: inbox.followup_wait_time_minutes, followup_send_closing_message: inbox.followup_send_closing_message,
        followup_closing_message: inbox.followup_closing_message, round_robin_group_id: inbox.round_robin_group_id,
        restrict_by_portfolio: inbox.restrict_by_portfolio, sign_messages: inbox.sign_messages,
      } })
      toast('success', 'Configurações salvas!')
      inboxesStore.fetchInboxes()
    } catch { toast('error', 'Não foi possível salvar.') } finally { setSaving(false) }
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
  const field = (label: React.ReactNode, node: React.ReactNode, h?: React.ReactNode) => <label style={{ display: 'block', minWidth: 0 }}><span style={labelStyle}>{label}</span>{node}{h && <p style={hint}>{h}</p>}</label>
  const saveBtn = (label: string) => <button onClick={save} disabled={saving} style={btn('primary')}>{saving ? 'Salvando…' : label}</button>
  const connected = inboxes.inboxes.find((i: any) => i.id === inbox.id)?.connected
  // importação das conversas antigas do WhatsApp (automática ao conectar a 1ª vez)
  const hist = inboxes.inboxes.find((i: any) => i.id === inbox.id)?.history
  const memberCount = members.filter(m => m.is_member).length

  return (
    <div>
      <button onClick={() => navigate('/settings/inboxes')} style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, marginBottom: 14 }}><ChevronLeft size={15} /> Caixas de entrada</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
        <span style={{ width: 42, height: 42, borderRadius: 10, background: '#E8F8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><WhatsAppIcon size={24} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ ...serif, fontSize: 21, margin: 0, lineHeight: 1.2 }}>{inbox.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3, fontSize: 12.5, color: 'var(--muted)' }}>
            <span>{fmtPhone(inbox.phone_number) || 'Sem número'}</span>
            <Badge tone={connected === true ? 'green' : connected === false ? 'red' : 'muted'}>{connected === true ? 'Conectado' : connected === false ? 'Desconectado' : 'Verificando…'}</Badge>
            {inbox.restrict_by_portfolio && <Badge tone="blue">Por carteira</Badge>}
            {hist?.status === 'importando' && <Badge tone="muted">Puxando conversas do WhatsApp: {hist.chats} de {hist.total}</Badge>}
            {hist?.status === 'concluido' && <Badge tone="green">{hist.total} conversas do WhatsApp importadas</Badge>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 11.5, color: 'var(--muted)' }}>
          <span><b style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{memberCount}</b>com acesso</span>
          <span><b style={{ display: 'block', fontSize: 15, color: inbox.ai_enabled ? 'var(--plantao)' : 'var(--ink)' }}>{inbox.ai_enabled ? 'Ligada' : 'Desligada'}</b>secretária IA</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map(t => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: '1px solid ' + (on ? 'var(--terra)' : 'var(--line)'), background: on ? 'var(--terra)' : 'var(--card)', color: on ? '#fff' : 'var(--ink)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <t.icon size={13} /> {t.name}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'settings' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14, alignItems: 'start' }}>
            <Panel icon={<Settings2 size={16} />} title="Identificação" description="Nome que a equipe vê na lista de conversas e o número conectado." footer={saveBtn('Salvar alterações')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                {field('Nome da caixa de entrada', <input value={inbox.name || ''} onChange={e => set({ name: e.target.value })} style={inputStyle} />)}
                {field('Provedor', <input value="WhatsApp (não oficial)" disabled style={{ ...inputStyle, color: 'var(--muted)', cursor: 'not-allowed' }} />)}
                {field('Apelido curto', <input value={inbox.short_name || ''} maxLength={18} onChange={e => set({ short_name: e.target.value })} placeholder={inbox.badge_short || 'Ex.: EXPANSÃO'} style={inputStyle} />, 'Aparece em cada conversa e acima do campo de digitar, pra equipe saber por qual número está falando.')}
                {field('Cor do número', (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 38 }}>
                    {CORES_CAIXA.map(c => {
                      const atual = (inbox.color || inbox.badge_color) === c
                      return <button key={c} type="button" title={c} aria-label={`Cor ${c}`} aria-pressed={atual} onClick={() => set({ color: c })} style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: atual ? '3px solid var(--ink)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--line)', cursor: 'pointer' }} />
                    })}
                  </div>
                ), 'Use cores bem diferentes pra cada número.')}
              </div>
              <div style={{ marginTop: 14 }}>
                {field('Funil de entrada', (
                  <select value={inbox.entry_stage_id || ''} onChange={e => set({ entry_stage_id: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
                    <option value="">Nenhum (contato novo fica sem funil)</option>
                    {funis.map(p => <optgroup key={p.id} label={p.name}>{p.pipeline_stages.filter((s: any) => s.kind === 'normal').map((s: any) => <option key={s.id} value={s.id}>{p.name} › {s.name}</option>)}</optgroup>)}
                  </select>
                ), 'Contato novo que chama por este número, e quem recebe disparo por ele, cai nesta etapa. As automações da etapa rodam normalmente.')}
              </div>
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                Como a equipe vai ver:
                <span style={{ padding: '2px 8px', borderRadius: 10, background: inbox.color || inbox.badge_color, color: '#fff', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase' }}>{(inbox.short_name || inbox.badge_short || inbox.name || '').trim()}</span>
              </div>
              {groups.length > 0 && <div style={{ marginTop: 14 }}>{field('Grupo de rodízio', (
                <select value={inbox.round_robin_group_id ?? ''} onChange={e => set({ round_robin_group_id: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
                  <option value="">Sem grupo (rodízio com todas as consultoras da conta)</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              ), 'Leads que chegarem por este número vão só para as consultoras deste grupo.')}</div>}
            </Panel>
            <Panel icon={<ShieldCheck size={16} />} title="Regras de atendimento" description="Quem enxerga o quê e como as mensagens saem para a revendedora." footer={saveBtn('Salvar alterações')}>
              {toggleList(<>
                <Toggle on={!!inbox.restrict_by_portfolio} onChange={v => set({ restrict_by_portfolio: v })} title="Restringir por carteira">
                  Ligado: quem tem acesso a esta caixa só vê as conversas das revendedoras da própria carteira, ou que ainda não têm responsável. Desligado: vê todas as conversas da caixa (use assim em caixas como Marketing ou Gerência).
                </Toggle>
                <Toggle on={!!inbox.sign_messages} onChange={v => set({ sign_messages: v })} title="Assinar mensagens com o nome de quem respondeu">
                  A revendedora recebe o primeiro nome de quem respondeu em negrito, em cima da mensagem (ex.: <b>*Bel:*</b>). Só vale para mensagens digitadas no CRM — IA, follow-up e mensagens agendadas não são assinadas.
                </Toggle>
              </>)}
            </Panel>
            {['waha', 'baileys'].includes(inbox.provider) && <PainelLigacao inboxId={inbox.id} />}
          </div>
        )}

        {tab === 'agents' && (
          <Panel icon={<Users size={16} />} title="Gerenciar acesso" description={`Quais pessoas podem ver e responder mensagens por esta caixa — ${memberCount} de ${members.length} com acesso.`}>
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--card)' }}>
                  <ChatAvatar nome={m.name || m.email || '?'} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13.5 }}>{m.name || 'Sem nome'}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.email}</span></span>
                  {m.is_member && <Badge tone="green">Com acesso</Badge>}
                  <Switch on={!!m.is_member} onChange={() => toggleMember(m)} />
                </div>
              ))}
              {members.length === 0 && <p style={{ padding: 20, color: 'var(--muted)', margin: 0 }}>Nenhum agente encontrado nesta conta.</p>}
            </div>
          </Panel>
        )}

        {tab === 'bot' && (
          <Panel icon={<Bot size={16} />} title="Secretária virtual" description="A inteligência artificial que atende as revendedoras por esta caixa." footer={saveBtn('Salvar configurações da IA')}>
            {aiNote}
            {toggleList(<Toggle on={!!inbox.ai_enabled} onChange={v => set({ ai_enabled: v })} title="Ativar secretária virtual autônoma">Se ativado, a inteligência artificial assume as conversas desta caixa.</Toggle>)}
            {inbox.ai_enabled && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {field('Nome da secretária', <input value={inbox.ai_name || ''} onChange={e => set({ ai_name: e.target.value })} placeholder="Ex.: Ana, Júlia, Assistente Virtual" style={inputStyle} />)}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ ...labelStyle, marginBottom: 0 }}>Prompt de comportamento</span>
                    <button onClick={() => setPromptOpen(true)} style={btn('soft', { padding: '5px 10px', fontSize: 12 })}><Sparkles size={13} /> Criar prompt com IA</button>
                  </div>
                  <textarea value={inbox.ai_prompt || ''} onChange={e => set({ ai_prompt: e.target.value })} rows={12} placeholder="Instrua a IA: como agir, tom de voz, regras de negócio e limites de atendimento…" style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
            )}
          </Panel>
        )}

        {tab === 'knowledge_base' && (
          <Panel icon={<BookOpen size={16} />} title="Base de conhecimento" description="Políticas, catálogo e perguntas frequentes que a secretária consulta. Cole o texto ou envie um PDF — o texto extraído entra abaixo para você revisar antes de salvar."
            right={<><button disabled={uploading} onClick={() => pdfRef.current?.click()} style={btn('soft', { padding: '7px 12px', fontSize: 12.5 })}><Upload size={13} /> {uploading ? 'Extraindo…' : 'Enviar PDF'}</button><input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={uploadPdf} /></>}
            footer={saveBtn('Salvar base de conhecimento')}>
            {aiNote}
            <textarea value={inbox.knowledge_base || ''} onChange={e => set({ knowledge_base: e.target.value })} rows={16} placeholder="Ex.: horário de atendimento, política de trocas, formas de pagamento, catálogo, perguntas frequentes…" style={{ ...inputStyle, resize: 'vertical' }} />
          </Panel>
        )}

        {tab === 'followup' && (
          <Panel icon={<RotateCcw size={16} />} title="Resgate automático (follow-up)" description="A IA chama quem parou de responder, depois do tempo definido." footer={saveBtn('Salvar configurações de resgate')}>
            {aiNote}
            {toggleList(<Toggle on={!!inbox.followup_enabled} onChange={v => set({ followup_enabled: v })} title="Ativar agente de resgate">A IA chama quem abandonou a conversa, depois do tempo definido.</Toggle>)}
            {inbox.followup_enabled && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
                  {field('Tempo sem resposta (minutos)', <input type="number" min={10} value={inbox.followup_wait_time_minutes ?? ''} onChange={e => set({ followup_wait_time_minutes: e.target.value })} placeholder="120" style={inputStyle} />, 'Ex.: 120 para esperar 2 horas. Mínimo 10.')}
                  {field('Máximo de tentativas', <input type="number" min={1} max={10} value={inbox.followup_max_attempts ?? ''} onChange={e => set({ followup_max_attempts: e.target.value })} placeholder="3" style={inputStyle} />, 'Depois disso o contato é marcado como frio.')}
                </div>
                {toggleList(<Toggle on={!!inbox.followup_send_closing_message} onChange={v => set({ followup_send_closing_message: v })} title="Mensagem de encerramento">Enviar uma última mensagem avisando que o atendimento será encerrado por falta de resposta.</Toggle>)}
                {inbox.followup_send_closing_message && <textarea value={inbox.followup_closing_message || ''} onChange={e => set({ followup_closing_message: e.target.value })} rows={4} placeholder="Ex.: Como não tivemos retorno, estou encerrando seu atendimento por aqui. Se precisar, é só chamar!" style={{ ...inputStyle, resize: 'vertical', marginTop: 12 }} />}
              </div>
            )}
          </Panel>
        )}
      </div>

      <PromptGeneratorModal inboxId={inbox.id} isOpen={promptOpen} onClose={() => setPromptOpen(false)} onGenerated={p => set({ ai_prompt: p })} />
    </div>
  )
}

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import api from '../api'
import { conversationsStore } from '../store/conversations'
import { pickWhatsappInbox } from '../composables/useInboxPicker'
import { inputStyle } from './ui'
import { toast } from './ui2'
import { ChatAvatar } from './ChatAvatar'

// Peças das telas de lista de revendedoras (Ativas, Inativas, Atacado, Contatos, Pedidos).
/* eslint-disable @typescript-eslint/no-explicit-any */

export const brl = (v: any) => {
  const n = parseFloat(v)
  return n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null
}
export const fmtDate = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(String(iso).includes('T') ? iso : `${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}
export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
export const contactName = (c: any) => c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sem nome'

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
      <Search size={15} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, paddingLeft: 36 }} />
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (on ? 'var(--terra)' : 'var(--line)'), background: on ? 'var(--terra)' : 'var(--card)', color: on ? '#fff' : 'var(--muted)', whiteSpace: 'nowrap' }}>{o.label}</button>
        )
      })}
    </div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>{children}</div>
}

export const selectStyle: CSSProperties = { ...inputStyle, width: 'auto', minWidth: 170 }

export function NameCell({ c, icon }: { c: any; icon?: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {icon ? <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--terraSoft)', color: 'var(--terra)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon}</span> : <ChatAvatar nome={contactName(c)} foto={c.avatar_url} size={30} />}
      <span style={{ fontWeight: 600 }}>{contactName(c)}</span>
    </span>
  )
}

export function EmptyBlock({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--muted)' }}>
      <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 16, background: 'var(--terraSoft)', color: 'var(--terra)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{icon}</div>
      <h3 style={{ margin: '0 0 4px', color: 'var(--ink)', fontSize: 16 }}>{title}</h3>
      {text && <p style={{ margin: 0, fontSize: 13.5 }}>{text}</p>}
    </div>
  )
}

/** "Iniciar conversa" no WhatsApp (pergunta a caixa quando há mais de uma) e abre a tela de Conversas. */
export function useStartConversation() {
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<number | null>(null)
  const start = async (contact: any) => {
    const { inboxId, cancelled } = await pickWhatsappInbox()
    if (cancelled) return
    setBusyId(contact.id)
    try {
      const conv = await conversationsStore.startConversation(contact.id, inboxId)
      navigate(`/conversas?abrir=${conv.id}`)
    } catch (e: any) {
      toast('error', e.response?.data?.message || 'Erro ao iniciar conversa.')
    } finally { setBusyId(null) }
  }
  return { start, busyId }
}

/** Mapa id → nome da pessoa da equipe (responsável). */
export function agentNames(agents: readonly any[]): Record<number, string> {
  const m: Record<number, string> = {}
  agents.forEach(a => { m[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() })
  return m
}

export { api }

/** Cor do selo por status da régua. */
export const statusTone = (s?: string | null): 'muted' | 'blue' | 'green' | 'amber' | 'red' => ({
  revendedor_ativo: 'green', terceiro_dia: 'blue', decimo_dia: 'blue', vigesimo_dia: 'amber', agendado: 'blue', reagendar: 'amber', atrasada: 'red',
  sem_maleta: 'muted', inativa_pendencia: 'amber', suspensa_atraso: 'red', negativado_juridico: 'red', resgate: 'amber', reativacao: 'blue', descadastrada: 'muted',
} as Record<string, 'muted' | 'blue' | 'green' | 'amber' | 'red'>)[s || 'revendedor_ativo'] || 'muted';

import { useEffect, useState } from 'react'
import { Pause, Play, Sparkles, Square } from 'lucide-react'
import api from '../api'
import { K } from '../lib/kommo'

// "Agentes de IA ativos" (Kommo): aparece em cima da caixa de mensagem quando algum agente está
// atendendo o lead. Pausar/retomar/parar vale só para as conversas existentes — conversas novas
// ainda podem acionar o agente pelas regras dele.
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function AiSessionsBar({ contactId, refreshKey }: { contactId: number; refreshKey?: unknown }) {
  const [list, setList] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const load = () => api.get(`/ai_sessions?contact_id=${contactId}`).then(r => setList(r.data)).catch(() => setList([]))
  useEffect(() => { load(); setOpen(false) }, [contactId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null
  const set = async (id: number, status: string) => { await api.put(`/ai_sessions/${id}`, { status }); load() }
  const stopAll = async () => { await api.post('/ai_sessions/stop_all', { contact_id: contactId }); load() }
  const btn = { border: 'none', background: 'none', cursor: 'pointer', color: K.muted, padding: 4, display: 'inline-flex' }
  return (
    <div style={{ margin: '0 clamp(8px, 2vw, 22px) 6px', position: 'relative', flex: 'none' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #c9bdfc', background: '#f4f1ff', color: '#4b3bb5', borderRadius: 14, padding: '4px 12px', fontFamily: K.font, fontSize: 13.5, cursor: 'pointer' }}>
        <Sparkles size={14} /> Agentes de IA ativos ({list.length})
      </button>
      {open && (
        <div role="dialog" aria-label="Agentes de IA ativos" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 30, width: 'min(360px, 92vw)', background: '#fff', border: `1px solid ${K.lineDark}`, borderRadius: 4, boxShadow: '0 8px 22px rgba(0,0,0,.15)', padding: 10, fontFamily: K.font }}>
          {list.map(s => (
            <div key={s.id} data-testid="ia-sessao" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 4px', borderBottom: `1px solid ${K.line}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, color: K.text }}>{s.agent_name}</div>
                <div style={{ fontSize: 12.5, color: K.muted }}>{s.inbox_name || 'Conversa'} · {s.status === 'paused' ? 'pausado' : 'ativo'} · {s.replies} respostas</div>
              </div>
              {s.status === 'paused'
                ? <button title="Retomar" onClick={() => set(s.id, 'active')} style={btn}><Play size={16} /></button>
                : <button title="Pausar" onClick={() => set(s.id, 'paused')} style={btn}><Pause size={16} /></button>}
              <button title="Parar" onClick={() => set(s.id, 'stopped')} style={btn}><Square size={15} /></button>
            </div>
          ))}
          {list.length > 1 && <button onClick={stopAll} style={{ marginTop: 8, border: 'none', background: 'none', color: '#e53935', fontFamily: K.font, fontSize: 13.5, cursor: 'pointer' }}>Parar todos os agentes</button>}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, type CSSProperties } from 'react'
import api from '../api'
import { K } from './kommo'

// Peças comuns das telas de Insights (no padrão do Kommo): a barra "Hoje · Ontem · Semana · Mês ·
// Período" e o "Todos · Selecionar usuário", e formatadores de duração e dinheiro.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Period = { period: string; from?: string; to?: string; user_id?: string }
export const PERIODS: [string, string][] = [['today', 'Hoje'], ['yesterday', 'Ontem'], ['week', 'Semana'], ['month', 'Mês'], ['custom', 'Período']]

export const qs = (p: Record<string, any>) => new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()

export function useAgents() {
  const [agents, setAgents] = useState<any[]>([])
  useEffect(() => { api.get('/agents').then(r => setAgents(r.data.filter((a: any) => (a.status || 'active') === 'active'))).catch(() => {}) }, [])
  return agents
}
export const agentName = (a: any) => a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim()

/** Duração em texto curto: "2 min", "3 h 10 min", "4 dias". */
export function dur(seg: number) {
  const s = Math.max(0, Math.round(seg || 0))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60); if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`
  const d = Math.floor(h / 24); return `${d} ${d === 1 ? 'dia' : 'dias'}${h % 24 ? ` ${h % 24} h` : ''}`
}
export const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Barra de período + usuário. `dark` = versão do Painel (pílulas brancas sobre o fundo azul);
 * senão, versão clara das telas de relatório.
 */
export function PeriodBar({ value, onChange, agents, dark, allowRobot }: { value: Period; onChange: (p: Period) => void; agents: any[]; dark?: boolean; allowRobot?: boolean }) {
  const pill: CSSProperties = dark
    ? { display: 'flex', border: '1px solid rgba(255,255,255,.7)', borderRadius: 20, overflow: 'hidden', flexWrap: 'wrap' }
    : { display: 'flex', border: `1px solid ${K.lineDark}`, borderRadius: 3, overflow: 'hidden', flexWrap: 'wrap', background: '#fff' }
  const item = (on: boolean): CSSProperties => ({
    border: 'none', padding: '0 18px', height: 34, fontFamily: K.font, fontSize: 15, cursor: 'pointer',
    background: on ? (dark ? 'rgba(255,255,255,.22)' : '#fcf0f3') : 'transparent',
    color: dark ? '#fff' : on ? K.blueDark : K.text, fontWeight: on ? 700 : 400,
  })
  const dateInp: CSSProperties = { height: 30, border: dark ? '1px solid rgba(255,255,255,.6)' : `1px solid ${K.lineDark}`, borderRadius: 3, background: dark ? 'rgba(255,255,255,.12)' : '#fff', color: dark ? '#fff' : K.text, fontFamily: K.font, padding: '0 6px', colorScheme: dark ? 'dark' : 'light' }
  return (
    <div className="k-period-bar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: dark ? 'center' : 'flex-start' }}>
      <div style={pill} role="group" aria-label="Período">
        {PERIODS.map(([id, label]) => <button key={id} aria-pressed={value.period === id} onClick={() => onChange({ ...value, period: id })} style={item(value.period === id)}>{id === 'custom' ? '📅 ' : ''}{label}</button>)}
      </div>
      {value.period === 'custom' && (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: dark ? '#fff' : K.text }}>
          <input type="date" aria-label="De" value={value.from || ''} onChange={e => onChange({ ...value, from: e.target.value })} style={dateInp} /> até
          <input type="date" aria-label="Até" value={value.to || ''} onChange={e => onChange({ ...value, to: e.target.value })} style={dateInp} />
        </span>
      )}
      <div style={pill} role="group" aria-label="Usuário">
        <button onClick={() => onChange({ ...value, user_id: '' })} aria-pressed={!value.user_id} style={item(!value.user_id)}>Todos</button>
        <select aria-label="Selecionar usuário" value={value.user_id || ''} onChange={e => onChange({ ...value, user_id: e.target.value })}
          style={{ ...item(!!value.user_id), appearance: 'auto', maxWidth: 210, outline: 'none' }}>
          <option value="" style={{ color: K.text }}>Selecionar usuário</option>
          {allowRobot && <option value="robo" style={{ color: K.text }}>Robô (automações)</option>}
          {agents.map(a => <option key={a.id} value={a.id} style={{ color: K.text }}>{agentName(a)}</option>)}
        </select>
      </div>
    </div>
  )
}

/** Lembra o filtro da tela entre visitas (só conveniência do navegador). */
export function useSavedPeriod(key: string, initial: Period): [Period, (p: Period) => void] {
  const [p, setP] = useState<Period>(() => { try { return { ...initial, ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return initial } })
  return [p, (n: Period) => { setP(n); try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* modo privado */ } }]
}

import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { readUser } from '../lib/hooks'
import { allowed, type NavRule } from '../lib/nav'
import { K } from '../lib/kommo'

// Área "Configurações" no layout do Kommo: menu próprio à esquerda (Perfil · Área de trabalho ·
// Integrações e canais) e a página à direita com o título e o botão Salvar no topo.
type Item = { to: string; label: string; rule: NavRule }
export const SETTINGS_MENU: { title: string; items: Item[] }[] = [
  { title: 'Perfil', items: [{ to: '/settings/perfil', label: 'Configurações de perfil', rule: 'all' }] },
  { title: 'Área de trabalho', items: [
    { to: '/settings/trabalho', label: 'Configurações de trabalho', rule: 'critical' },
    { to: '/settings/chat', label: 'Configurações de chat', rule: 'critical' },
    { to: '/agentes', label: 'Gestão de usuários', rule: 'critical' },
    { to: '/settings/times-de-vendas', label: 'Grupos de usuários', rule: 'fullPortfolio' },
    { to: '/settings/campos-contato', label: 'Campos e grupos', rule: 'critical' },
    { to: '/settings/tags', label: 'Tags', rule: 'critical' },
    { to: '/settings/motivos-perda', label: 'Motivos de perda', rule: 'critical' },
    { to: '/settings/modelos-mensagem', label: 'Modelos de mensagem', rule: 'critical' },
  ] },
  { title: 'Integrações e canais', items: [
    { to: '/settings/inboxes', label: 'Canais (WhatsApp)', rule: 'critical' },
    { to: '/settings/integracoes', label: 'Central de integrações', rule: 'critical' },
  ] },
]

/** Primeira página de configurações que o perfil do usuário pode abrir. */
export const firstSettingsPath = (role: string) => SETTINGS_MENU.flatMap(s => s.items).find(i => allowed(i.rule, role))?.to || '/settings/perfil'

export default function SettingsLayout() {
  const role = readUser()?.role || 'consultor'
  return (
    <div className="k-fullbleed k-settings" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', display: 'flex', background: K.bg, fontFamily: K.font, color: K.text }}>
      <nav className="k-settings-menu" style={{ width: 200, flex: 'none', background: '#fff', borderRight: `1px solid ${K.line}`, padding: '20px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', padding: '0 20px 16px', borderBottom: `1px solid ${K.line}`, margin: '0 0 8px' }}>Configurações</div>
        {SETTINGS_MENU.map(sec => {
          const items = sec.items.filter(i => allowed(i.rule, role))
          if (!items.length) return null
          return (
            <div key={sec.title} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: K.muted, padding: '10px 20px 6px' }}>{sec.title}</div>
              {items.map(i => (
                <NavLink key={i.to} to={i.to} style={({ isActive }) => ({ display: 'block', margin: '0 6px', padding: '7px 14px', borderRadius: 4, fontSize: 14.5, textDecoration: 'none', color: isActive ? '#2d74f0' : K.text, background: isActive ? '#e8f0fe' : 'transparent', fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>{i.label}</NavLink>
              ))}
            </div>
          )
        })}
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}><Outlet /></div>
    </div>
  )
}

/** Topo da página de configuração: título + Salvar (cinza até ter alteração), igual ao Kommo. */
export function SettingsHead({ title, dirty, saving, onSave, children }: { title: string; dirty?: boolean; saving?: boolean; onSave?: () => void; children?: ReactNode }) {
  return (
    <div style={{ minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: `1px solid ${K.line}`, background: '#f5f5f5', flexWrap: 'wrap' }}>
      <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 400 }}>{title}</h1>
      {children}
      {onSave && <button onClick={onSave} disabled={!dirty || saving} style={{ height: 36, padding: '0 14px', border: `1px solid ${dirty ? K.blue : '#d5d8db'}`, borderRadius: 3, background: dirty ? K.blue : '#fff', color: dirty ? '#fff' : K.muted, fontFamily: K.font, fontSize: 14, fontWeight: 700, cursor: dirty ? 'pointer' : 'default' }}>{saving ? 'Salvando…' : 'Salvar'}</button>}
    </div>
  )
}

/** Bloco branco de configuração com título e descrição (padrão Kommo). */
export function SettingsBlock({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <section style={{ background: '#fff', borderRadius: 3, padding: '20px 18px', margin: '0 0 16px' }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 400 }}>{title}</h2>
      {description && <p style={{ margin: '4px 0 0', fontSize: 14, color: K.muted, lineHeight: 1.45 }}>{description}</p>}
      {children && <div style={{ marginTop: 18 }}>{children}</div>}
    </section>
  )
}

/** Linha "rótulo | campo" das configurações do Kommo. */
export function SettingsRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="k-settings-row" style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 51, flexWrap: 'wrap' }}>
      <span style={{ width: 168, flex: 'none', fontSize: 14.5 }}>{label}</span>
      <div style={{ flex: '1 1 260px', maxWidth: 440, minWidth: 0 }}>{children}</div>
    </div>
  )
}

export const settingsInput: React.CSSProperties = { width: '100%', height: 36, border: '1px solid #d5d8db', borderRadius: 3, padding: '0 10px', background: '#fff', fontFamily: K.font, fontSize: 14.5, color: K.text, boxSizing: 'border-box' }

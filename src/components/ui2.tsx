import type { CSSProperties, ReactNode } from 'react'
import Swal from 'sweetalert2'
import { PILL, serif } from './ui'

// Peças de página no padrão do Visita IA v2: cabeçalho, tabela, aviso rápido, confirmação, switch.

export function PageHead({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ ...serif, fontSize: 27, margin: 0, lineHeight: 1.15 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0', maxWidth: '70ch', lineHeight: 1.55 }}>{subtitle}</p>}
      </div>
      {children && <div className="page-toolbar" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

export const th: CSSProperties = { textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--line)', background: 'var(--bg)', whiteSpace: 'nowrap' }
export const td: CSSProperties = { padding: '9px 14px', fontSize: 13, borderBottom: '1px solid var(--line)', verticalAlign: 'middle' }

type Col = { label: ReactNode; width?: number | string; align?: 'left' | 'right' | 'center' }

/** Tabela no padrão do v2: cartão branco, cabeçalho em caixa-alta. */
/** compact: tabela larga (muitas colunas) cabe na largura da página, sem rolagem lateral. */
export function DataTable({ columns, rows, empty = 'Nada por aqui ainda.', loading, onRowClick, compact }: { columns: Col[]; rows: ReactNode[][]; empty?: ReactNode; loading?: boolean; onRowClick?: (i: number) => void; compact?: boolean }) {
  const thS: CSSProperties = compact ? { ...th, padding: '10px 6px', fontSize: 9.5, letterSpacing: '.05em', whiteSpace: 'normal', lineHeight: 1.3 } : th
  const tdS: CSSProperties = compact ? { ...td, padding: '9px 6px', fontSize: 12.5 } : td
  const msg = (m: ReactNode) => <tr><td colSpan={columns.length} style={{ ...tdS, textAlign: 'center', color: 'var(--muted)', padding: 28 }}>{m}</td></tr>
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: compact ? 'hidden' : 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{columns.map((c, i) => <th key={i} style={{ ...thS, width: c.width, textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
          <tbody>
            {loading ? msg('Carregando…') : rows.length === 0 ? msg(empty) : rows.map((r, ri) => (
              <tr key={ri} onClick={onRowClick ? () => onRowClick(ri) : undefined} style={{ cursor: onRowClick ? 'pointer' : undefined }}>
                {r.map((cell, ci) => <td key={ci} style={{ ...tdS, textAlign: columns[ci].align || 'left' }}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button title={title} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ width: 30, height: 30, border: '1px solid var(--line)', borderRadius: 7, background: 'none', color: danger ? '#B42318' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{children}</button>
  )
}

export const toast = (icon: 'success' | 'error' | 'info' | 'warning', title: string, text?: string) =>
  Swal.fire({ toast: true, position: 'top-end', icon, title, text, showConfirmButton: false, timer: icon === 'error' ? 4500 : 3000, timerProgressBar: true })

export async function confirmBox(title: string, text: string, confirmText = 'Confirmar', danger = true): Promise<boolean> {
  const r = await Swal.fire({ title, text, icon: 'warning', showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Cancelar', confirmButtonColor: danger ? '#B42318' : '#123C87' })
  return r.isConfirmed
}

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ position: 'relative', width: 38, height: 22, borderRadius: 11, border: 'none', background: on ? 'var(--terra)' : 'var(--line)', flex: 'none', opacity: disabled ? 0.5 : 1, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'blue' | 'green' | 'amber' | 'red' }) {
  const t = {
    muted: { background: 'var(--card-2)', color: 'var(--muted)' }, blue: { background: 'var(--terraSoft)', color: 'var(--terra)' },
    green: { background: 'var(--plantaoSoft)', color: 'var(--plantao)' }, amber: { background: '#FFF1D6', color: '#9A5B00' }, red: { background: '#FDE8E8', color: '#B42318' },
  }[tone]
  return <span style={{ ...PILL, ...t }}>{children}</span>
}

/** Cartão de seção para telas de configuração (título serifado + descrição). */
export function Section({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, marginBottom: 16 }}>
      <h2 style={{ ...serif, fontSize: 21, margin: 0 }}>{title}</h2>
      {description && <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '6px 0 16px' }}>{description}</p>}
      {!description && <div style={{ height: 14 }} />}
      {children}
    </div>
  )
}

/** Bloco de configurações: ícone + título + descrição, conteúdo e rodapé com as ações (padrão de Conta/Caixas). */
export function Panel({ icon, title, description, children, footer, right }: { icon: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px 2px' }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--terraSoft)', color: 'var(--terra)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 17, margin: 0, lineHeight: 1.25 }}>{title}</h3>
          {description && <p style={{ margin: '1px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{description}</p>}
        </div>
        {right}
      </div>
      {children !== undefined && children !== null && children !== false && <div style={{ padding: '12px 16px 16px' }}>{children}</div>}
      {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>{footer}</div>}
    </section>
  )
}

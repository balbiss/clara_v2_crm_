import { useEffect, useRef, useState } from 'react'
import { K } from '../lib/kommo'
import { useClickOutside } from '../lib/hooks'

// Linha de campo do card do lead no jeito do Kommo: rótulo cinza à esquerda e o valor à direita
// ("..." quando vazio). Clicou, edita no próprio lugar com o controle do tipo do campo.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type KFieldDef = { key: string; label: string; type?: string; options?: string[]; api_only?: boolean; hidden?: boolean; required_stages?: string[] }

const asList = (v: any): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\s*,\s*/) : [])
const fmtDate = (v: string, withTime: boolean) => {
  if (!v) return ''
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v)
  if (Number.isNaN(d.getTime())) return v
  return withTime ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR')
}
const brl = (v: any) => (v === '' || v == null || Number.isNaN(Number(String(v).replace(',', '.'))) ? String(v ?? '') : 'R$' + Number(String(v).replace(',', '.')).toLocaleString('pt-BR'))

const maskCpf = (v: string) => { const d = v.replace(/D/g, '').slice(0, 11); return d.replace(/(d{3})(d)/, '$1.$2').replace(/(d{3})(d)/, '$1.$2').replace(/(d{3})(d{1,2})$/, '$1-$2') }

export function display(f: KFieldDef, v: any): string {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return ''
  switch (f.type) {
    case 'date': case 'birthday': return fmtDate(String(v), false)
    case 'date_time': return fmtDate(String(v), true)
    case 'checkbox': return v === true || v === 'true' || v === '1' ? 'Sim' : ''
    case 'multiselect': return asList(v).join(', ')
    case 'price': return brl(v)
    case 'file': return typeof v === 'object' ? v.name || 'arquivo' : String(v)
    case 'cpf': return maskCpf(String(v))
    default: return String(v)
  }
}

export default function KField({ field, value, onSave, onUpload, labelWidth = '42%' }: { field: KFieldDef; value: any; onSave: (v: any) => void; onUpload?: (f: File) => Promise<void> | void; labelWidth?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<any>(value ?? '')
  const ref = useClickOutside<HTMLDivElement>(() => { if (editing && field.type === 'multiselect') commit() }, editing)
  const inputRef = useRef<any>(null)
  useEffect(() => { if (!editing) setDraft(value ?? '') }, [value, editing])
  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus()) }, [editing])
  const ro = !!field.api_only
  const commit = (v = draft) => {
    setEditing(false)
    const norm = Array.isArray(v) ? v : String(v ?? '').trim()
    if (JSON.stringify(norm) !== JSON.stringify(Array.isArray(value) ? value : String(value ?? '').trim())) onSave(norm)
  }
  const base: React.CSSProperties = { flex: 1, minWidth: 0, border: 'none', borderBottom: `1px solid ${K.blue}`, outline: 'none', fontFamily: K.font, fontSize: 14, padding: '3px 0', background: 'none', color: K.text }
  const key = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && field.type !== 'textarea') { e.preventDefault(); commit() } else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) } }

  let editor: React.ReactNode = null
  if (editing) {
    switch (field.type) {
      case 'select': case 'radiobutton':
        editor = <select ref={inputRef} value={draft} onChange={e => commit(e.target.value)} onBlur={() => setEditing(false)} style={base}><option value="">Selecione</option>{(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
        break
      case 'multiselect': {
        const sel = asList(draft)
        editor = (
          <div style={{ position: 'relative', flex: 1 }}>
            <div style={{ ...base, color: K.muted }}>{sel.join(', ') || 'Selecione'}</div>
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', border: `1px solid ${K.line}`, boxShadow: '0 4px 16px rgba(0,0,0,.14)', maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
              {(field.options || []).map(o => (
                <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel.includes(o)} onChange={e => setDraft(e.target.checked ? [...sel, o] : sel.filter(x => x !== o))} />{o}
                </label>
              ))}
              <div style={{ padding: '6px 10px', borderTop: `1px solid ${K.line}`, textAlign: 'right' }}><button onClick={() => commit()} style={{ border: 'none', background: K.blue, color: '#fff', borderRadius: 3, padding: '4px 12px', fontFamily: K.font, fontWeight: 700, cursor: 'pointer' }}>OK</button></div>
            </div>
          </div>
        )
        break
      }
      case 'date': case 'birthday':
        editor = <input ref={inputRef} type="date" value={String(draft).slice(0, 10)} onChange={e => setDraft(e.target.value)} onBlur={() => commit()} onKeyDown={key} style={base} />
        break
      case 'date_time':
        editor = <input ref={inputRef} type="datetime-local" value={String(draft).slice(0, 16)} onChange={e => setDraft(e.target.value)} onBlur={() => commit()} onKeyDown={key} style={base} />
        break
      case 'numeric': case 'price':
        editor = <input ref={inputRef} inputMode="decimal" value={draft} onChange={e => setDraft(e.target.value.replace(/[^\d.,-]/g, ''))} onBlur={() => commit()} onKeyDown={key} style={base} />
        break
      case 'cpf':
        editor = <input ref={inputRef} inputMode="numeric" value={maskCpf(String(draft))} onChange={e => setDraft(maskCpf(e.target.value))} onBlur={() => commit()} onKeyDown={key} placeholder="000.000.000-00" style={base} />
        break
      case 'textarea': case 'address':
        editor = <textarea ref={inputRef} rows={3} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commit()} onKeyDown={key} style={{ ...base, resize: 'vertical' }} />
        break
      default:
        editor = <input ref={inputRef} type={field.type === 'url' ? 'url' : 'text'} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commit()} onKeyDown={key} style={base} />
    }
  }

  const shown = display(field, value)
  return (
    <div ref={ref} style={{ display: 'flex', alignItems: field.type === 'textarea' || field.type === 'address' ? 'flex-start' : 'center', minHeight: 32, gap: 10 }}>
      <span title={field.label} style={{ width: labelWidth, flex: 'none', color: K.muted, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: field.type === 'textarea' ? 4 : 0 }}>{field.label}</span>
      {field.type === 'file' ? (
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          {value && typeof value === 'object' && value.url ? <a href={value.url} target="_blank" rel="noreferrer" style={{ color: K.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</a> : null}
          {!ro && <label style={{ color: K.link, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}>{value ? 'Trocar' : 'Fazer upload'}<input type="file" hidden onChange={e => { const fl = e.target.files?.[0]; e.target.value = ''; if (fl && onUpload) onUpload(fl) }} /></label>}
        </span>
      ) : field.type === 'checkbox' ? (
        <input type="checkbox" disabled={ro} checked={value === true || value === 'true' || value === '1'} onChange={e => onSave(e.target.checked ? 'true' : '')} />
      ) : editing ? editor : (
        <span onClick={() => !ro && setEditing(true)} title={ro ? 'Preenchido automaticamente (só API)' : undefined}
          style={{ flex: 1, minWidth: 0, fontSize: 14, color: shown ? K.text : K.muted, cursor: ro ? 'default' : 'text', overflowWrap: 'anywhere', whiteSpace: field.type === 'textarea' ? 'pre-wrap' : undefined }}>
          {field.type === 'url' && shown ? <a href={shown} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: K.link }}>{shown}</a> : shown || (field.type === 'select' || field.type === 'multiselect' ? 'Selecione' : '...')}
        </span>
      )}
    </div>
  )
}

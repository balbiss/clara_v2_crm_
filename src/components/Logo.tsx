/**
 * Logomarca no padrão visual do Visita IA v2 (chip escuro + wordmark espaçado), com a marca da
 * Clara Ferreira: o símbolo é o ícone oficial dela (public/logos/clara-ferreira-icon.jpg).
 */
const BLUE = '#2160C9'

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.24, background: '#0A0F1A', border: '1px solid rgba(255,255,255,.07)', overflow: 'hidden', flex: 'none', display: 'inline-flex' }}>
      <img src="/logos/clara-ferreira-icon.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </span>
  )
}

export default function Logo({ markSize = 34, wordSize = 17, showCrm = true, gap = 13 }: { markSize?: number; wordSize?: number; showCrm?: boolean; gap?: number }) {
  const sans = 'Manrope, system-ui, sans-serif'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, whiteSpace: 'nowrap' }}>
      <LogoMark size={markSize} />
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontFamily: sans, fontWeight: 800, fontSize: wordSize, letterSpacing: '.15em', textTransform: 'uppercase' }}>
          Clara<span style={{ color: BLUE }}>&nbsp;Ferreira</span>
        </span>
        {showCrm && (
          <span style={{ display: 'flex', alignItems: 'center', gap: wordSize * 0.4, marginTop: wordSize * 0.34 }}>
            <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.35 }} />
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: wordSize * 0.44, letterSpacing: '.4em', textTransform: 'uppercase', color: BLUE, marginRight: '-.4em' }}>CRM</span>
            <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.35 }} />
          </span>
        )}
      </span>
    </span>
  )
}

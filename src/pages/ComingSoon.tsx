import { serif } from '../components/ui'

// Tela "em construção" no visual do v2 — usada enquanto a tela da Clara ainda não foi portada.
export default function ComingSoon({ title = 'Em construção', description = 'Essa área ainda está sendo construída.' }: { title?: string; description?: string }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
      <span style={{ width: 64, height: 64, border: '1.5px solid var(--line)', borderRadius: '16px 16px 4px 16px', marginBottom: 24, display: 'block' }} />
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 8px' }}>Em migração</p>
      <h1 style={{ ...serif, fontSize: 30, margin: '0 0 10px' }}>{title}</h1>
      <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--muted)', margin: 0, maxWidth: '42ch' }}>{description}</p>
    </div>
  )
}

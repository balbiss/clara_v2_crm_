import { Construction } from 'lucide-react'
import '../styles/vue/ComingSoon.scss'

// views/ComingSoon.vue — também usada, durante a migração, nas telas que ainda não foram portadas.
export default function ComingSoon({ title = 'Em construção', description = 'Essa área ainda está sendo construída.' }: { title?: string; description?: string }) {
  return (
    <div className="vs-ComingSoon" style={{ display: 'contents' }}>
      <div className="coming-soon">
        <div className="cs-icon"><Construction size={28} /></div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

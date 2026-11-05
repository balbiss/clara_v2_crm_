import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { marked } from 'marked'
import { Download, Search } from 'lucide-react'
import { K, kBtn } from '../lib/kommo'

// Manual do sistema (menu Ajuda): artigos em docs/ajuda/*.md com cabeçalho ---/--- (titulo, grupo, perfis,
// resumo). Os prints ficam em public/ajuda e o PDF (mesmo texto) é gerado por docs/ajuda/_tools/pdf.cjs.
const arquivos = import.meta.glob('../../docs/ajuda/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

type Artigo = { slug: string; titulo: string; grupo: string; perfis: string; resumo: string; corpo: string; ordem: string }

function ler(caminho: string, bruto: string): Artigo {
  const slug = caminho.split('/').pop()!.replace(/\.md$/, '')
  const m = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  const meta: Record<string, string> = {}
  if (m) m[1].split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim() })
  return { slug: slug.replace(/^\d+-/, ''), ordem: slug, titulo: meta.titulo || slug, grupo: meta.grupo || 'Geral', perfis: meta.perfis || 'Todos', resumo: meta.resumo || '', corpo: m ? m[2] : bruto }
}

const ARTIGOS = Object.entries(arquivos).map(([c, b]) => ler(c, b)).sort((a, b) => a.ordem.localeCompare(b.ordem))
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Manual() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const atual = ARTIGOS.find(a => a.slug === slug) || ARTIGOS[0]
  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    return q ? ARTIGOS.filter(a => semAcento(a.titulo + ' ' + a.resumo + ' ' + a.corpo).includes(q)) : ARTIGOS
  }, [busca])
  const grupos = useMemo(() => {
    const g: Record<string, Artigo[]> = {}
    lista.forEach(a => { (g[a.grupo] ||= []).push(a) })
    return Object.entries(g)
  }, [lista])
  const html = useMemo(() => (atual ? marked.parse(atual.corpo, { async: false }) as string : ''), [atual])

  if (!atual) return <div style={{ padding: 24, fontFamily: K.font }}>Manual ainda vazio.</div>

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', fontFamily: K.font, color: K.text, flexWrap: 'wrap' }}>
      <style>{`
        .manual-doc { line-height: 1.6; font-size: 15.5px }
        .manual-doc h1 { font-size: 26px; color: #5a2433; margin: 0 0 6px }
        .manual-doc h2 { font-size: 19px; color: #5a2433; margin: 30px 0 8px; padding-top: 14px; border-top: 1px solid ${K.line} }
        .manual-doc h3 { font-size: 16px; margin: 20px 0 6px }
        .manual-doc img { max-width: 100%; border: 1px solid ${K.line}; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.08); margin: 8px 0 4px }
        .manual-doc img + em { display: block; font-size: 13px; color: ${K.muted}; margin-bottom: 12px }
        .manual-doc blockquote { margin: 14px 0; padding: 10px 14px; background: #fcf0f3; border-left: 4px solid #c8506a; border-radius: 4px }
        .manual-doc blockquote p { margin: 4px 0 }
        .manual-doc table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 10px 0 }
        .manual-doc th, .manual-doc td { border: 1px solid ${K.line}; padding: 7px 10px; text-align: left; vertical-align: top }
        .manual-doc th { background: #faf3f5 }
        .manual-doc code { background: #f3f3f3; padding: 1px 5px; border-radius: 3px; font-size: 14px }
        .manual-doc li { margin: 4px 0 }
      `}</style>
      <aside style={{ flex: '0 0 270px', maxWidth: '100%', background: '#fff', border: `1px solid ${K.line}`, borderRadius: 4, padding: 14, position: 'sticky', top: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#5a2433', marginBottom: 10 }}>Manual do CRM</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${K.line}`, borderRadius: 3, padding: '6px 8px', marginBottom: 12 }}>
          <Search size={15} color={K.muted} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar no manual" style={{ border: 'none', outline: 'none', flex: 1, fontFamily: K.font, fontSize: 14 }} />
        </label>
        {grupos.map(([g, arts]) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: K.muted, letterSpacing: '.04em', margin: '6px 0 4px' }}>{g}</div>
            {arts.map(a => (
              <button key={a.slug} onClick={() => { navigate('/manual/' + a.slug); window.scrollTo(0, 0) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 3, padding: '6px 8px', cursor: 'pointer', fontFamily: K.font, fontSize: 14,
                  background: a.slug === atual.slug ? '#fcf0f3' : 'none', color: a.slug === atual.slug ? '#8e2a46' : K.text, fontWeight: a.slug === atual.slug ? 700 : 400 }}>{a.titulo}</button>
            ))}
          </div>
        ))}
        {!lista.length && <div style={{ fontSize: 13, color: K.muted }}>Nada encontrado.</div>}
        <a href="/ajuda/Manual-CRM-Clara-Ferreira.pdf" download style={{ ...kBtn('blue'), width: '100%', justifyContent: 'center', marginTop: 8, textDecoration: 'none', color: '#fff', background: '#8e2a46', border: 'none' }}><Download size={14} /> Baixar PDF</a>
      </aside>
      <article style={{ flex: '1 1 520px', minWidth: 0, maxWidth: 980, background: '#fff', border: `1px solid ${K.line}`, borderRadius: 4, padding: 'clamp(16px, 3vw, 36px)' }}>
        <div style={{ fontSize: 12.5, color: K.muted, marginBottom: 4 }}>{atual.grupo} · Para: {atual.perfis}</div>
        <div className="manual-doc" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  )
}

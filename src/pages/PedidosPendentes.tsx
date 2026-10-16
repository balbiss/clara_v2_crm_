import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api'
import { PageHead, Badge } from '../components/ui2'
import { brl, fmtDate } from '../components/lists'

// Pedidos Pendentes: mesma lista do widget do Jueri (status Aberto). Lê o que o sync já guardou.
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function PedidosPendentes() {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    api.get('/pedidos/pendentes', { params: { page, per_page: 20 } })
      .then(({ data }) => { setPedidos(data.pedidos); setTotalPages(data.total_pages); setTotal(data.total) })
      .catch(e => console.error('Erro ao buscar pedidos pendentes:', e)).finally(() => setLoading(false))
  }, [page])

  // janela de páginas (1 2 3 … 14)
  const pages = [...new Set([1, totalPages, page, page - 1, page + 1])].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const pgBtn = (on: boolean, disabled = false): React.CSSProperties => ({ minWidth: 34, height: 34, padding: '0 8px', border: '1px solid ' + (on ? 'var(--terra)' : 'var(--line)'), borderRadius: 8, background: on ? 'var(--terra)' : 'var(--card)', color: on ? '#fff' : 'var(--ink)', fontWeight: 600, fontSize: 13, opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' })

  return (
    <div>
      <PageHead title="Pedidos pendentes" subtitle="Pedidos com maleta ainda em aberto no Jueri (não baixados nem cancelados) — a mesma lista do painel do Jueri.">
        <Badge tone="blue">Total: {total}</Badge>
      </PageHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && Array.from({ length: 5 }, (_, i) => <div key={i} style={{ height: 66, borderRadius: 12, background: 'var(--skel)', animation: 'pulse 1.2s infinite' }} />)}
        {!loading && pedidos.length === 0 && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Nenhum pedido pendente encontrado{total === 0 ? '' : ' nesta página'}.</p>}
        {!loading && pedidos.map(p => (
          <button key={p.id} onClick={() => p.contact_id && navigate(`/contatos/${p.contact_id}`)} className="hoverable"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', textAlign: 'left' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge tone="green">Criação</Badge>
                <b style={{ fontSize: 14.5 }}>{p.contact_name}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>(Revendedora)</span>
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 5 }}>Quantidade: {p.quantidade} | Valor: {brl(p.valor_total) || 'R$ 0,00'} · {fmtDate(p.data_criacao)}</span>
            </span>
            <ArrowRight size={17} color="var(--muted)" />
          </button>
        ))}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 22 }}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={pgBtn(false, page <= 1)}><ChevronLeft size={15} /></button>
          {pages.map((p, i) => (
            <span key={p} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {i > 0 && p - pages[i - 1] > 1 && <span style={{ color: 'var(--muted)' }}>…</span>}
              <button onClick={() => setPage(p)} style={pgBtn(p === page)}>{p}</button>
            </span>
          ))}
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={pgBtn(false, page >= totalPages)}><ChevronRight size={15} /></button>
        </div>
      )}
    </div>
  )
}

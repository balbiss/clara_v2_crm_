import { useEffect, useState } from 'react'
import { Copy, Link2, RefreshCw, Trash2, Webhook } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import { toast, confirmBox } from '../../components/ui2'
import { K } from '../../lib/kommo'
import { SettingsBlock, SettingsHead, settingsInput } from '../../components/SettingsLayout'

// "Central de integrações" do Kommo, com as integrações que este CRM tem de verdade:
// Jueri (webhook de pedidos/vendas/financeiro) e o webhook genérico do Automatize.
// No Jueri: URL + Chave pra colar no painel deles e a lista dos eventos que chegaram, campo por
// campo — serve pra validar o formato antes de ligar a sincronização.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Achata o JSON em linhas "caminho = valor" (pedido.itens[0].quantidade = 3). */
function campos(obj: any, prefix = ''): [string, string][] {
  if (obj === null || obj === undefined) return [[prefix || '(vazio)', String(obj)]]
  if (typeof obj !== 'object') return [[prefix || '(valor)', String(obj)]]
  const entries: [string, any][] = Array.isArray(obj) ? obj.map((v, i) => [`${prefix}[${i}]`, v]) : Object.entries(obj).map(([k, v]) => [prefix ? `${prefix}.${k}` : k, v])
  if (!entries.length) return [[prefix || '(vazio)', Array.isArray(obj) ? '[]' : '{}']]
  return entries.flatMap(([k, v]): [string, string][] => (v !== null && typeof v === 'object' ? campos(v, k) : [[k, v === null ? 'null' : String(v)]]))
}
const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, color: K.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label={label} readOnly value={value} style={{ ...settingsInput, flex: '1 1 260px', fontFamily: 'monospace', fontSize: 13 }} />
        <button onClick={() => { navigator.clipboard?.writeText(value); toast('success', `${label} copiada.`) }} style={{ height: 36, padding: '0 14px', border: `1px solid ${K.lineDark}`, borderRadius: 3, background: '#fff', fontFamily: K.font, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Copy size={14} /> Copiar</button>
      </div>
    </div>
  )
}

function Jueri() {
  const [d, setD] = useState<any>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const load = () => api.get('/jueri/webhook').then(r => setD(r.data)).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [])
  if (!d) return null
  const limpar = async () => { if (await confirmBox('Apagar os eventos recebidos?', 'Só limpa esta lista de teste.')) { await api.delete('/jueri/webhook/eventos'); load() } }
  return (
    <div>
      <CopyField label="URL do webhook" value={d.url} />
      <CopyField label="Chave" value={d.chave} />
      <p style={{ fontSize: 13.5, color: K.muted, margin: '0 0 14px' }}>No Jueri: Configurações › Webhooks › Configurar novo webhook. Cole a URL e a Chave, deixe o Status "Ativo", ligue os eventos e salve. Cada evento que o Jueri mandar aparece abaixo (a lista atualiza sozinha).</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 8px' }}>
        <b style={{ flex: 1, fontSize: 14.5 }}>Eventos recebidos ({d.eventos.length})</b>
        <button title="Atualizar" onClick={load} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><RefreshCw size={16} /></button>
        {d.eventos.length > 0 && <button title="Limpar lista" onClick={limpar} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><Trash2 size={16} /></button>}
      </div>
      {!d.eventos.length && <div style={{ border: `1px dashed ${K.lineDark}`, borderRadius: 4, padding: 18, textAlign: 'center', color: K.muted, fontSize: 14 }}>Nenhum evento ainda. Depois de salvar no Jueri, crie ou altere um pedido de teste por lá.</div>}
      {d.eventos.map((e: any) => (
        <div key={e.id} data-testid="jueri-evento" style={{ border: `1px solid ${K.line}`, borderRadius: 4, marginBottom: 8 }}>
          <button onClick={() => setAberto(aberto === e.id ? null : e.id)} style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: K.font, fontSize: 14.5, textAlign: 'left', flexWrap: 'wrap' }}>
            <b style={{ color: K.text }}>{e.event || '(evento sem nome)'}</b>
            <span style={{ color: K.muted, fontSize: 13 }}>{dataBR(e.created_at)}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, padding: '2px 8px', borderRadius: 10, background: e.signature_ok === true ? '#e6f4ea' : e.signature_ok === false ? '#fdecea' : '#f1f2f4', color: e.signature_ok === true ? '#1e7b34' : e.signature_ok === false ? '#b3261e' : K.muted }}>
              {e.signature_ok === true ? 'assinatura ok' : e.signature_ok === false ? 'assinatura não confere' : 'sem assinatura'}
            </span>
          </button>
          {aberto === e.id && (
            <div style={{ borderTop: `1px solid ${K.line}`, padding: '8px 12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <tbody>{campos(e.payload).map(([k, v]) => <tr key={k}><td style={{ padding: '4px 10px 4px 0', color: K.muted, fontFamily: 'monospace', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td><td style={{ padding: '4px 0', wordBreak: 'break-word' }}>{v}</td></tr>)}</tbody>
              </table>
              <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', color: K.muted, fontSize: 13 }}>Cabeçalhos e JSON completo</summary>
                <pre style={{ fontSize: 12, background: '#f7f8fa', padding: 10, borderRadius: 3, overflowX: 'auto' }}>{JSON.stringify({ headers: e.headers, payload: e.payload }, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Integracoes() {
  const navigate = useNavigate()
  const card = (icon: React.ReactNode, title: string, desc: string, body: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 14, padding: '16px 0', borderTop: `1px solid ${K.line}` }}>
      <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 6, background: '#fbe9ee', color: K.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 15.5 }}>{title}</b><p style={{ margin: '3px 0 10px', fontSize: 14, color: K.muted }}>{desc}</p>{body}</div>
    </div>
  )
  return (
    <>
      <SettingsHead title="Central de integrações" />
      <div style={{ padding: 16 }}>
        <SettingsBlock title="Integrações instaladas">
          {card(<Link2 size={20} />, 'Jueri (ERP)', 'Pedidos, vendas, financeiro e cadastros chegam pelo webhook do Jueri. Por enquanto a v2 só recebe e mostra os eventos, pra validar os campos.', <Jueri />)}
          {card(<Webhook size={20} />, 'Webhooks do Automatize', 'Envie os dados do lead para qualquer sistema quando ele entrar numa etapa (ação "Enviar webhook" do Automatize).', (
            <button onClick={() => navigate('/pipelines')} style={{ border: 'none', background: 'none', padding: 0, color: K.link, textDecoration: 'underline', fontFamily: K.font, fontSize: 14.5, cursor: 'pointer' }}>Abrir os funis</button>
          ))}
        </SettingsBlock>
      </div>
    </>
  )
}

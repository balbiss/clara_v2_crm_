import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Trash2, X } from 'lucide-react'
import api from '../api'
import { Switch, toast, confirmBox } from '../components/ui2'
import { K, kBtn } from '../lib/kommo'
import { triggerSummary, TEMPLATES } from '../lib/salesbotUi'

// Automações › Robôs (Salesbot), igual à lista do Kommo: NOME · GATILHOS · TAXA DE CONVERSÃO ·
// TOTAL LANÇADO · SESSÕES ATIVAS, e "CRIAR BOT" abrindo "Criar um bot" (Começar do zero / modelos).
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function SalesbotList() {
  const navigate = useNavigate()
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [criar, setCriar] = useState(false)
  const [sel, setSel] = useState<number[]>([])
  const load = async () => { try { setBots((await api.get('/salesbots')).data) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])

  const create = async (tpl?: (typeof TEMPLATES)[number]) => {
    try {
      const { data } = await api.post('/salesbots', tpl ? { name: tpl.name, definition: tpl.definition, trigger_config: tpl.trigger } : { name: `Salesbot #${bots.length + 1}`, definition: {}, trigger_config: { event: 'manual' } })
      navigate(`/fluxos/${data.id}`)
    } catch (e: any) { toast('error', e.response?.data?.message || 'Não foi possível criar o robô.') }
  }
  const toggle = async (b: any) => { await api.put(`/salesbots/${b.id}`, { active: !b.active }); load() }
  const dup = async (b: any) => { await api.post(`/salesbots/${b.id}/duplicate`); load(); toast('success', 'Robô duplicado.') }
  const del = async (ids: number[]) => {
    if (!(await confirmBox(ids.length > 1 ? `Excluir ${ids.length} robôs?` : 'Excluir o robô?', 'As sessões em andamento param.'))) return
    for (const id of ids) await api.delete(`/salesbots/${id}`)
    setSel([]); load()
  }
  const th: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.muted, borderBottom: `1px solid ${K.line}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 15, borderBottom: `1px solid ${K.line}` }

  return (
    <div className="k-fullbleed" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', background: K.bg, fontFamily: K.font, color: K.text }}>
      <div className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', flexWrap: 'wrap' }}>
        <b style={{ flex: 1, fontSize: 16, letterSpacing: '.03em', textTransform: 'uppercase' }}>Bots</b>
        {sel.length > 0 && <button onClick={() => del(sel)} style={kBtn('ghost', { color: '#e53935' })}><Trash2 size={14} /> Excluir ({sel.length})</button>}
        <button onClick={() => setCriar(true)} style={kBtn('ghost')}>+ Criar bot</button>
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3 }}>
          <div style={{ padding: '20px 18px 16px' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 400 }}>Salesbots</h2>
            <p style={{ margin: '6px 0 0', color: K.muted, fontSize: 14.5 }}>Crie bots sem código para automatizar chats e tarefas rotineiras. Comece do zero ou use um modelo — depois personalize-o e adicione seus gatilhos.</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>
                <th style={{ ...th, width: 36 }}><input type="checkbox" aria-label="Selecionar todos" checked={bots.length > 0 && sel.length === bots.length} onChange={e => setSel(e.target.checked ? bots.map(b => b.id) : [])} /></th>
                <th style={th}>Nome</th><th style={th}>Gatilhos</th><th style={th}>Taxa de conversão</th><th style={th}>Total lançado</th><th style={th}>Sessões ativas</th><th style={th}>Ativo</th><th style={th} />
              </tr></thead>
              <tbody>
                {bots.map(b => (
                  <tr key={b.id} style={{ opacity: b.active ? 1 : 0.6 }}>
                    <td style={td}><input type="checkbox" aria-label={`Selecionar ${b.name}`} checked={sel.includes(b.id)} onChange={e => setSel(s => (e.target.checked ? [...s, b.id] : s.filter(x => x !== b.id)))} /></td>
                    <td style={td}><button onClick={() => navigate(`/fluxos/${b.id}`)} style={{ border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 15, cursor: 'pointer', textAlign: 'left' }}>{b.name}</button></td>
                    <td style={{ ...td, color: K.muted, fontSize: 14 }}>{triggerSummary(b.trigger_config)}</td>
                    <td style={td}>{b.conversion == null ? '—' : `${b.conversion}%`}</td>
                    <td style={td}>{b.total_launched}</td>
                    <td style={td}>{b.active_sessions}</td>
                    <td style={td}><Switch on={!!b.active} onChange={() => toggle(b)} /></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button title="Duplicar" onClick={() => dup(b)} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', padding: 4 }}><Copy size={15} /></button>
                      <button title="Excluir" onClick={() => del([b.id])} style={{ border: 'none', background: 'none', color: K.muted, cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {!loading && !bots.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: K.muted, padding: 40 }}>Nenhum robô ainda. Clique em "+ Criar bot".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {criar && (
        <div onClick={() => setCriar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="k-criar-bot" style={{ width: 'min(1100px, 100%)', maxHeight: '90vh', background: '#fff', borderRadius: 4, display: 'flex', overflow: 'hidden' }}>
            <aside style={{ width: 280, flex: 'none', padding: '28px 32px', borderRight: `1px solid ${K.line}` }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 400 }}>Criar um bot</h2>
              <button onClick={() => create()} style={{ ...kBtn('blue'), width: '100%', justifyContent: 'center', textTransform: 'none', fontSize: 14.5 }}>Começar do zero</button>
              <p style={{ fontSize: 13.5, color: K.muted, marginTop: 20, lineHeight: 1.5 }}>Os modelos ao lado já vêm prontos — depois é só ajustar as mensagens e escolher o gatilho.</p>
            </aside>
            <div style={{ flex: 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto', position: 'relative' }}>
              <button title="Fechar" onClick={() => setCriar(false)} style={{ position: 'absolute', top: 18, right: 18, border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={20} /></button>
              <b style={{ fontSize: 15 }}>Modelos</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
                {TEMPLATES.map(t => (
                  <button key={t.name} onClick={() => create(t)} style={{ textAlign: 'left', border: `1px solid ${K.line}`, borderRadius: 6, background: '#fff', padding: 0, overflow: 'hidden', cursor: 'pointer', fontFamily: K.font }}>
                    <div style={{ height: 96, background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                      <span style={{ background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, color: K.text, boxShadow: '0 2px 6px rgba(0,0,0,.1)', maxWidth: '90%' }}>{t.preview}</span>
                    </div>
                    <div style={{ padding: '12px 14px', fontSize: 15, color: K.text }}>{t.name}<div style={{ fontSize: 13, color: K.muted, marginTop: 4 }}>{t.description}</div></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

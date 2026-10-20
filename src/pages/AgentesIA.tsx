import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, KeyRound, Sparkles, Trash2, X } from 'lucide-react'
import api from '../api'
import { Switch, toast, confirmBox } from '../components/ui2'
import { K, kBtn, kInput } from '../lib/kommo'
import { readUser } from '../lib/hooks'

// Agente de IA (menu próprio, como no Kommo): sem agentes mostra a vitrine "Conheça a IA que te
// entende" com "Construir meu Agente de IA"; com agentes mostra a lista NOME · CANAIS · TOKENS
// USADOS · USO ESTIMADO · ÚLTIMA ALTERAÇÃO · STATUS, com copiar/excluir. Tudo roda na OpenAI.
/* eslint-disable @typescript-eslint/no-explicit-any */

const isOwner = () => readUser()?.role === 'diretoria'
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function Construir({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [tab, setTab] = useState<'site' | 'info'>('info')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const gerar = async () => {
    setBusy(true)
    try { const { data } = await api.post('/ai_agents/generate', tab === 'site' ? { mode: 'site', url } : { mode: 'info', description, details }); onCreated(data.id) }
    catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível gerar o agente.') }
    finally { setBusy(false) }
  }
  const pular = async () => { const { data } = await api.post('/ai_agents', { name: 'Agente de IA' }); onCreated(data.id) }
  const tabSt = (on: boolean): CSSProperties => ({ border: 'none', background: 'none', padding: '6px 4px', borderBottom: on ? `2px solid ${K.blue}` : `1px solid ${K.line}`, color: K.text, fontFamily: K.font, fontSize: 15, cursor: 'pointer', flex: 1 })
  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Configure seu agente de IA" onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 4, padding: '28px 30px', position: 'relative', fontFamily: K.font, color: K.text }}>
        <button title="Fechar" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: 'none', color: K.muted, cursor: 'pointer' }}><X size={20} /></button>
        {busy ? (
          <div style={{ textAlign: 'center', padding: '40px 10px' }}>
            <div className="k-spin" style={{ width: 28, height: 28, border: `3px solid ${K.line}`, borderTopColor: K.blue, borderRadius: '50%', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 18 }}>Preparando seu agente de IA</div>
            <div style={{ color: K.muted, marginTop: 6 }}>Só mais um instante — estamos finalizando a configuração</div>
          </div>
        ) : (<>
          <h2 style={{ textAlign: 'center', margin: '0 0 10px', fontSize: 24 }}>Configure seu agente de IA <Sparkles size={18} color="#c8506a" /></h2>
          <p style={{ textAlign: 'center', color: K.muted, margin: '0 auto 18px', maxWidth: 480, lineHeight: 1.45 }}>Forneça informações sobre sua empresa para ajudar o agente de IA a responder perguntas e manter as conversas fluindo. Você pode vincular seu site ou adicionar manualmente os detalhes da empresa.</p>
          <div role="tablist" style={{ display: 'flex', maxWidth: 340, margin: '0 auto 18px' }}>
            <button role="tab" aria-selected={tab === 'site'} onClick={() => setTab('site')} style={tabSt(tab === 'site')}>Usar site</button>
            <button role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')} style={tabSt(tab === 'info')}>Adicionar informações comerciais</button>
          </div>
          {tab === 'site' ? (
            <label style={{ display: 'grid', gap: 6 }}>URL do site<span style={{ fontSize: 13, color: K.muted }}>Insira abaixo o URL do site da sua empresa (links de redes sociais não são suportados).</span>
              <input aria-label="URL do site" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://exemplocomercio.com.br" style={kInput} /></label>
          ) : (<>
            <label style={{ display: 'grid', gap: 6 }}>Descreva o que sua empresa faz
              <textarea aria-label="Descreva o que sua empresa faz" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Semijoias vendidas por revendedoras com maleta consignada. Atendemos revendedoras e clientes de varejo e atacado." style={{ ...kInput, height: 'auto', padding: 10 }} /></label>
            <label style={{ display: 'grid', gap: 6, marginTop: 14 }}>Adicione a localização da sua empresa, o horário de funcionamento e outros detalhes (Opcional)
              <textarea aria-label="Detalhes da empresa" value={details} onChange={e => setDetails(e.target.value)} rows={4} placeholder="Loja em São Paulo, de segunda a sexta das 9h às 18h. Acerto da maleta a cada 30 dias…" style={{ ...kInput, height: 'auto', padding: 10 }} /></label>
          </>)}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button onClick={pular} style={kBtn('flat', { textTransform: 'none', fontSize: 14, color: K.muted })}>Pular por enquanto</button>
            <button onClick={gerar} disabled={tab === 'site' ? !url.trim() : !description.trim()} style={{ ...kBtn('ghost', { textTransform: 'none', fontSize: 14 }), border: '1px solid #c8506a', color: '#8e2a46' }}><Sparkles size={15} /> Criar agente de IA</button>
          </div>
        </>)}
      </div>
    </div>
  )
}

function ChaveOpenAI({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<any>(null)
  const [key, setKey] = useState('')
  useEffect(() => { api.get('/ai_settings').then(r => setInfo(r.data)).catch(() => {}) }, [])
  const salvar = async () => {
    try { const { data } = await api.put('/ai_settings', { openai_api_key: key }); setInfo({ ...info, ...data }); setKey(''); toast('success', 'Chave salva.') }
    catch (e: any) { toast('error', e.response?.data?.error || 'Não foi possível salvar.') }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Chave da OpenAI" onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', background: '#fff', borderRadius: 4, padding: '24px 26px', fontFamily: K.font, color: K.text }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 400 }}>Chave da OpenAI</h2>
        <p style={{ margin: '0 0 14px', color: K.muted, fontSize: 14, lineHeight: 1.45 }}>Toda a IA do CRM usa a OpenAI: responder clientes, transcrever áudios, descrever imagens e resumir conversas. O consumo é cobrado na sua conta da OpenAI.</p>
        <div style={{ marginBottom: 12, fontSize: 14 }}>{info?.has_key ? <>Chave atual: <b>{info.key_hint}</b> · modelo {info.model}</> : <span style={{ color: K.orange }}>Nenhuma chave configurada — os agentes não respondem sem ela.</span>}</div>
        <input aria-label="Nova chave" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-…" style={kInput} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={kBtn('flat')}>Fechar</button>
          <button onClick={salvar} disabled={!key.trim()} style={kBtn('blue')}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

export default function AgentesIA() {
  const navigate = useNavigate()
  const [list, setList] = useState<any[] | null>(null)
  const [sel, setSel] = useState<number[]>([])
  const [construir, setConstruir] = useState(false)
  const [chave, setChave] = useState(false)
  const load = () => api.get('/ai_agents').then(r => setList(r.data)).catch(() => setList([]))
  useEffect(() => { load() }, [])
  const owner = isOwner()

  const toggle = async (a: any) => {
    if (a.active && !(await confirmBox('Desligar o agente de IA?', 'Ele para de responder novas mensagens até ser ligado de novo.'))) return
    try { await api.put(`/ai_agents/${a.id}`, { active: !a.active }); load() }
    catch (e: any) {
      const d = e.response?.data
      if (d?.error === 'sem_canal') { toast('error', d.message); navigate(`/agente-ia/${a.id}?aba=configuracoes`) }
      else toast('error', d?.message || d?.error || 'Não foi possível alterar.')
    }
  }
  const copiar = async () => { for (const id of sel) await api.post(`/ai_agents/${id}/duplicate`); setSel([]); load(); toast('success', 'Agente copiado.') }
  const excluir = async () => {
    if (!(await confirmBox(sel.length > 1 ? `Excluir ${sel.length} agentes?` : 'Excluir o agente?', 'As conversas em andamento com ele param.'))) return
    for (const id of sel) await api.delete(`/ai_agents/${id}`)
    setSel([]); load()
  }
  const th: CSSProperties = { textAlign: 'left', padding: '12px 14px', fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: K.muted, borderBottom: `1px solid ${K.line}`, whiteSpace: 'nowrap' }
  const td: CSSProperties = { padding: '12px 14px', fontSize: 15, borderBottom: `1px solid ${K.line}` }

  if (list === null) return null
  return (
    <div className="k-fullbleed" style={{ margin: -24, minHeight: 'calc(100vh - var(--top-h, 0px))', background: list.length ? K.bg : '#fff', fontFamily: K.font, color: K.text }}>
      {list.length === 0 ? (
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '70px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#5a2433', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}><Sparkles size={20} color="#e2559c" /> Agente de IA Clara</div>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 46px)', lineHeight: 1.1, margin: '18px 0', color: '#5a2433' }}>Conheça a IA que<br />te entende</h1>
          <p style={{ fontSize: 17, color: '#33334d', margin: '0 auto 30px', maxWidth: 460 }}>Você cria uma vez. Ele atende, qualifica e continua a gerar engajamento com as revendedoras para sempre.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            {owner ? <button onClick={() => setConstruir(true)} style={{ height: 50, padding: '0 40px', borderRadius: 25, border: 'none', background: '#5a2433', color: '#fff', fontFamily: K.font, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Construir meu Agente de IA</button>
              : <p style={{ color: K.muted }}>Peça à diretoria para criar o agente de IA.</p>}
            {owner && <button onClick={() => setChave(true)} style={{ height: 50, padding: '0 30px', borderRadius: 25, border: '2px solid #5a2433', background: '#fff', color: '#5a2433', fontFamily: K.font, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Chave da OpenAI</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 60, textAlign: 'left' }}>
            {[['Responde na hora', 'Atende no WhatsApp a qualquer hora, com as informações que você cadastrar.'], ['Entende áudio e foto', 'Transcreve os áudios e descreve as imagens que a cliente manda.'], ['Passa pra equipe', 'Quando a cliente pede uma pessoa, transfere com o resumo e avisa a consultora.']].map(([t, d]) => (
              <div key={t} style={{ border: `1px solid ${K.line}`, borderRadius: 8, padding: 18 }}><b style={{ fontSize: 16 }}>{t}</b><p style={{ margin: '6px 0 0', color: K.muted, fontSize: 14.5 }}>{d}</p></div>
            ))}
          </div>
        </div>
      ) : (<>
        <div className="k-topbar" style={{ minHeight: 64, background: '#fff', borderBottom: `1px solid ${K.line}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', flexWrap: 'wrap' }}>
          <b style={{ flex: 1, fontSize: 16, letterSpacing: '.03em', textTransform: 'uppercase' }}>Agentes de IA</b>
          {sel.length > 0 && owner && <><button title="Copiar" onClick={copiar} style={kBtn('ghost')}><Copy size={14} /> Copiar</button><button title="Excluir" onClick={excluir} style={kBtn('ghost', { color: '#e53935' })}><Trash2 size={14} /> Excluir ({sel.length})</button></>}
          {owner && <button onClick={() => setChave(true)} style={kBtn('ghost')}><KeyRound size={14} /> Chave da OpenAI</button>}
          {owner && <button onClick={() => setConstruir(true)} style={kBtn('blue')}>+ Adicionar novo agente</button>}
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ background: '#fff', border: `1px solid ${K.line}`, borderRadius: 3, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead><tr>
                <th style={{ ...th, width: 36 }}><input type="checkbox" aria-label="Selecionar todos" checked={sel.length === list.length} onChange={e => setSel(e.target.checked ? list.map(a => a.id) : [])} /></th>
                <th style={th}>Nome</th><th style={th}>Canais</th><th style={th}>Tokens usados</th><th style={th}>Uso estimado</th><th style={th}>Última alteração</th><th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {list.map(a => (
                  <tr key={a.id} data-testid="agente-linha">
                    <td style={td}><input type="checkbox" aria-label={`Selecionar ${a.name}`} checked={sel.includes(a.id)} onChange={e => setSel(s => e.target.checked ? [...s, a.id] : s.filter(x => x !== a.id))} /></td>
                    <td style={td}><button onClick={() => navigate(`/agente-ia/${a.id}`)} style={{ border: 'none', background: 'none', padding: 0, color: K.link, fontFamily: K.font, fontSize: 15, cursor: 'pointer', textAlign: 'left' }}>{a.name}</button></td>
                    <td style={{ ...td, color: a.channel_names.length ? K.text : K.muted }}>{a.channel_names.join(', ') || 'Nenhum canal'}</td>
                    <td style={td}>{a.tokens_used.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, color: K.muted }}>{a.tokens_per_reply ? `~${a.tokens_per_reply.toLocaleString('pt-BR')} tokens/resposta` : '—'}</td>
                    <td style={{ ...td, color: K.muted }}>{dataBR(a.updated_at)}</td>
                    <td style={td}>{owner ? <Switch on={a.active} onChange={() => toggle(a)} /> : (a.active ? 'Ligado' : 'Desligado')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
      {construir && <Construir onClose={() => setConstruir(false)} onCreated={id => navigate(`/agente-ia/${id}`)} />}
      {chave && <ChaveOpenAI onClose={() => setChave(false)} />}
    </div>
  )
}

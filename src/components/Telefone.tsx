import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useNavigate } from 'react-router-dom'
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Minimize2, Maximize2 } from 'lucide-react'
import api from '../api'
import { toast } from './ui2'
import { getSocket } from '../lib/realtime'
import { inboxesStore } from '../store/inboxes'
import { abrirAudio, type ConexaoAudio } from '../lib/ligacaoAudio'

/* Telefone do CRM (ligação pelo WhatsApp, server/src/lib/ligacao.ts): liga pro contato pelo número
   da conversa e recebe ligação de quem chama os números. Montado no AppShell, então a ligação
   continua ao trocar de tela. Mesmo esquema do telefone do InoovaCall. */

export interface ChamadaPub {
  callId: string; direcao: 'saida' | 'entrada'; telefone: string; nome: string; contactId: number | null; conversationId: number | null
  inboxId: number; status: 'chamando' | 'tocando' | 'em_andamento' | 'encerrada'; userNome: string; inicio: number; atendidaEm: number | null
}

interface LigacaoState {
  caixas: number[]
  ativa: ChamadaPub | null
  chegando: ChamadaPub | null
  mudo: boolean; espera: boolean; transporte: string | null; conectandoAudio: boolean
  ligar: (conversationId: number) => Promise<void>
}

let conexao: ConexaoAudio | null = null
let saidaAudio: HTMLAudioElement | null = null
const fecharAudio = () => { try { conexao?.fechar() } catch { /* */ } conexao = null }
const msgErro = (e: any) => e?.response?.data?.message || e?.message || 'Tente de novo.'

export const useLigacao = create<LigacaoState>((set, get) => ({
  caixas: [], ativa: null, chegando: null, mudo: false, espera: false, transporte: null, conectandoAudio: false,
  ligar: async conversationId => {
    if (get().ativa) { toast('warning', 'Você já está numa ligação.'); return }
    try {
      const { data } = await api.post('/ligacao/ligar', { conversation_id: conversationId })
      set({ ativa: data.chamada, mudo: false, espera: false, transporte: null, conectandoAudio: true })
      conexao = await abrirAudio(data.chamada.callId, saidaAudio!)
      conexao.aoTrocar = t => useLigacao.setState({ transporte: t })
      set({ transporte: conexao.transporte, conectandoAudio: false })
      if (get().ativa?.status === 'em_andamento') conexao.atendida()
    } catch (e) {
      toast('error', 'Não foi possível ligar.', msgErro(e))
      const a = get().ativa
      if (a) await api.post(`/ligacao/${a.callId}/desligar`).catch(() => {})
      fecharAudio()
      set({ ativa: null, conectandoAudio: false })
    }
  },
}))

async function atender() {
  const ch = useLigacao.getState().chegando
  if (!ch) return
  pararToque()
  try {
    const { data } = await api.post(`/ligacao/${ch.callId}/atender`)
    useLigacao.setState({ ativa: data.chamada, chegando: null, mudo: false, espera: false, conectandoAudio: true })
    conexao = await abrirAudio(data.chamada.callId, saidaAudio!)
    conexao.aoTrocar = t => useLigacao.setState({ transporte: t })
    useLigacao.setState({ transporte: conexao.transporte, conectandoAudio: false })
    conexao.atendida()
  } catch (e) {
    toast('error', 'Não foi possível atender.', msgErro(e))
    useLigacao.setState({ chegando: null, conectandoAudio: false })
  }
}
async function recusar() {
  const ch = useLigacao.getState().chegando
  if (!ch) return
  pararToque()
  useLigacao.setState({ chegando: null })
  await api.post(`/ligacao/${ch.callId}/recusar`).catch(() => {})
}
async function desligar() {
  const a = useLigacao.getState().ativa
  if (!a) return
  fecharAudio()
  useLigacao.setState({ ativa: null })
  await api.post(`/ligacao/${a.callId}/desligar`).catch(() => {})
}

// toque (WebAudio, sem arquivo)
let toque: { ctx: AudioContext; timer: number } | null = null
function tocarToque() {
  if (toque) return
  try {
    const ctx = new AudioContext()
    const bip = () => {
      for (const [ini, freq] of [[0, 440], [0.45, 480]] as const) {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.frequency.value = freq; o.connect(g); g.connect(ctx.destination)
        g.gain.setValueAtTime(0.0001, ctx.currentTime + ini)
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + ini + 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ini + 0.4)
        o.start(ctx.currentTime + ini); o.stop(ctx.currentTime + ini + 0.42)
      }
    }
    bip()
    toque = { ctx, timer: window.setInterval(bip, 2600) }
  } catch { /* sem áudio */ }
}
function pararToque() { if (toque) { clearInterval(toque.timer); void toque.ctx.close().catch(() => {}); toque = null } }

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const fmtTel = (t: string) => { const d = (t || '').replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t }
const podeVer = (inboxId: number) => (inboxesStore.inboxes as any[]).some(i => i.id === inboxId)

export function Telefone() {
  const { ativa, chegando, mudo, espera, transporte, conectandoAudio } = useLigacao()
  const [, tick] = useState(0)
  const [mini, setMini] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const nav = useNavigate()

  useEffect(() => { saidaAudio = audioRef.current }, [])
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t) }, [])
  // quais números têm ligação + ligação chegando que começou antes de abrir a tela
  useEffect(() => {
    api.get('/ligacao/estado').then(({ data }) => {
      useLigacao.setState({ caixas: data.caixas || [] })
      const tocando = (data.ativas || []).find((c: ChamadaPub) => c.direcao === 'entrada' && c.status === 'tocando' && podeVer(c.inboxId))
      if (tocando && !useLigacao.getState().chegando) { useLigacao.setState({ chegando: tocando }); tocarToque() }
    }).catch(() => {})
  }, [])

  // eventos em tempo real (mesmo socket das conversas)
  useEffect(() => {
    const socket = getSocket()
    const ouvir = (ev: any) => {
      const st = useLigacao.getState()
      if (ev.tipo === 'chegando') {
        if (st.ativa || !podeVer(ev.chamada.inboxId)) return // já em ligação, ou número que a pessoa não atende
        useLigacao.setState({ chegando: ev.chamada })
        tocarToque()
        if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          try { new Notification('Ligação chegando', { body: ev.chamada.nome || fmtTel(ev.chamada.telefone) }) } catch { /* */ }
        }
      } else if (ev.tipo === 'status' && st.ativa?.callId === ev.chamada?.callId) {
        const atendeuAgora = ev.chamada.status === 'em_andamento' && st.ativa!.status !== 'em_andamento'
        useLigacao.setState({ ativa: { ...st.ativa!, ...ev.chamada } })
        if (atendeuAgora) conexao?.atendida()
      } else if (ev.tipo === 'status' && st.chegando?.callId === ev.chamada?.callId && ev.chamada.status === 'em_andamento') {
        pararToque(); useLigacao.setState({ chegando: null }) // outra pessoa atendeu
      } else if (ev.tipo === 'atendida_por_outro' && st.chegando?.callId === ev.callId) {
        pararToque(); useLigacao.setState({ chegando: null })
      } else if (ev.tipo === 'encerrada') {
        if (st.chegando?.callId === ev.callId) { pararToque(); useLigacao.setState({ chegando: null }) }
        if (st.ativa?.callId === ev.callId) {
          fecharAudio()
          useLigacao.setState({ ativa: null })
          toast('info', st.ativa?.atendidaEm ? 'Ligação encerrada.' : 'Ligação não atendida.')
        }
      }
    }
    socket.on('ligacao', ouvir)
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {})
    return () => { socket.off('ligacao', ouvir) }
  }, [])
  useEffect(() => () => { pararToque() }, [])

  const botao = (cor: string, tamanho = 44): React.CSSProperties => ({ width: tamanho, height: tamanho, borderRadius: '50%', border: 'none', background: cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' })
  const abrirConversa = (c: ChamadaPub) => c.conversationId && nav(`/conversas?abrir=${c.conversationId}`)

  return (
    <>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {chegando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,10,18,.5)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 360, padding: 28, textAlign: 'center', background: '#fff', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <p style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a7a80', margin: '0 0 14px' }}>Ligação chegando no WhatsApp</p>
            <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px', background: '#fcf0f3', color: '#8e2a46', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={30} /></div>
            <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{chegando.nome || fmtTel(chegando.telefone)}</p>
            <p style={{ fontSize: 13, color: '#8a7a80', margin: '0 0 6px' }}>{fmtTel(chegando.telefone)}</p>
            {!chegando.contactId && <p style={{ fontSize: 12.5, color: '#8a7a80', margin: 0 }}>Número que não está no CRM</p>}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 34, marginTop: 22 }}>
              <div><button onClick={recusar} style={botao('#E53935', 58)} title="Recusar"><PhoneOff size={24} /></button><p style={{ fontSize: 12, color: '#8a7a80', margin: '6px 0 0' }}>Recusar</p></div>
              <div><button onClick={atender} style={botao('#1DAA61', 58)} title="Atender"><Phone size={24} /></button><p style={{ fontSize: 12, color: '#8a7a80', margin: '6px 0 0' }}>Atender</p></div>
            </div>
          </div>
        </div>
      )}

      {ativa && (
        <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 94, width: mini ? 'auto' : 300, background: '#5a2433', color: '#fff', borderRadius: 14, boxShadow: '0 18px 44px rgba(0,0,0,.3)', padding: mini ? '10px 12px' : 18 }}>
          {mini ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: ativa.status === 'em_andamento' ? '#25D366' : '#F5A623' }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{ativa.atendidaEm ? mmss(Date.now() - ativa.atendidaEm) : 'Chamando…'}</span>
              <button onClick={() => setMini(false)} title="Expandir" style={{ ...botao('transparent', 30), color: '#f0d0d7' }}><Maximize2 size={15} /></button>
              <button onClick={desligar} title="Desligar" style={botao('#E53935', 34)}><PhoneOff size={16} /></button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#f0d0d7' }}>{ativa.direcao === 'saida' ? 'Ligação para' : 'Ligação de'}</p>
                  <p style={{ margin: '4px 0 2px', fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ativa.nome || fmtTel(ativa.telefone)}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#f0d0d7' }}>
                    {ativa.status === 'em_andamento' && ativa.atendidaEm ? mmss(Date.now() - ativa.atendidaEm) : ativa.direcao === 'saida' ? 'Chamando…' : 'Conectando…'}
                    {espera ? ' · em espera' : ''}{conectandoAudio ? ' · conectando áudio' : transporte === 'websocket' ? ' · áudio via servidor' : ''}
                  </p>
                </div>
                <button onClick={() => setMini(true)} title="Minimizar" style={{ ...botao('transparent', 30), color: '#f0d0d7' }}><Minimize2 size={15} /></button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
                <button onClick={() => { const v = !mudo; conexao?.mudo(v); useLigacao.setState({ mudo: v }) }} title={mudo ? 'Ativar microfone' : 'Mudo'}
                  style={botao(mudo ? '#F5A623' : 'rgba(255,255,255,.12)')}>{mudo ? <MicOff size={19} /> : <Mic size={19} />}</button>
                <button disabled={!ativa.atendidaEm} onClick={async () => { const v = !espera; try { await api.post(`/ligacao/${ativa.callId}/espera`, { ativa: v }); conexao?.mudo(v || mudo); useLigacao.setState({ espera: v }) } catch (e) { toast('error', 'Não foi possível.', msgErro(e)) } }}
                  title={espera ? 'Retomar' : 'Colocar em espera'} style={{ ...botao(espera ? '#F5A623' : 'rgba(255,255,255,.12)'), opacity: ativa.atendidaEm ? 1 : 0.4 }}>{espera ? <Play size={19} /> : <Pause size={19} />}</button>
                {ativa.conversationId && <button onClick={() => abrirConversa(ativa)} title="Abrir conversa"
                  style={{ padding: '0 12px', height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Conversa</button>}
                <button onClick={desligar} title="Desligar" style={botao('#E53935', 50)}><PhoneOff size={21} /></button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

/** Botão "Ligar" da conversa: só aparece se o número da conversa tem ligação ligada. */
export function BotaoLigar({ conversationId, inboxId }: { conversationId: number; inboxId: number | null }) {
  const caixas = useLigacao(s => s.caixas)
  const ativa = useLigacao(s => s.ativa)
  const ligar = useLigacao(s => s.ligar)
  const [ocupado, setOcupado] = useState(false)
  if (!inboxId || !caixas.includes(inboxId)) return null
  return (
    <button disabled={!!ativa || ocupado} title="Ligar pelo WhatsApp (sai pelo número desta conversa; fala pelo microfone do computador)"
      onClick={async e => { e.stopPropagation(); setOcupado(true); await ligar(conversationId); setOcupado(false) }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', border: '1px solid #8e2a46', borderRadius: 3, background: '#fcf0f3', color: '#8e2a46', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', opacity: ativa || ocupado ? 0.5 : 1 }}>
      <Phone size={14} /> Ligar
    </button>
  )
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LiveServerMessage, Session } from '@google/genai';
import { useAppStore } from '../../store/appStore';
import { apiFetch } from '../../lib/api';
import { useAssistente } from '../../lib/assistente/estado';
import { criarAltoFalante, ligarMicrofone } from '../../lib/assistente/audio';
import { executarFerramenta, executarPendente } from '../../lib/assistente/ferramentas';
import type { Gesto } from '../../lib/assistente/gestos';

/** Assistente de voz do CRM (Gemini Live). Carregado sob demanda (só quando alguém abre). */

type RespSessao = { sessaoId: string; token: string; modelo: string; versaoApi: string; config: Record<string, unknown>; segundosRestantes: number; nome: string };

const AZUL = '#38bdf8';
const FUNDO = '#0b1220';
const LINHA = 'rgba(148,197,255,.18)';

export default function Assistente() {
  const aberto = useAssistente(s => s.aberto);
  return (
    <>
      {aberto && <PainelAssistente />}
      <PaineisFlutuantes />
    </>
  );
}

function PainelAssistente() {
  const navegar = useNavigate();
  const token = useAppStore(s => s.token);
  const role = useAppStore(s => s.me?.role);
  const config = useAssistente(s => s.config);
  const status = useAssistente(s => s.status);
  const erro = useAssistente(s => s.erro);
  const falas = useAssistente(s => s.falas);
  const pendente = useAssistente(s => s.pendente);
  const [mudo, setMudo] = useState(false);
  const [camera, setCamera] = useState(false);
  const [texto, setTexto] = useState('');
  const [restante, setRestante] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState(false);

  const sessao = useRef<Session | null>(null);
  const sessaoId = useRef<string | null>(null);
  const mic = useRef<Awaited<ReturnType<typeof ligarMicrofone>> | null>(null);
  const falante = useRef<ReturnType<typeof criarAltoFalante> | null>(null);
  const gestos = useRef<{ parar: () => void } | null>(null);
  const encerrando = useRef(false);
  const quebra = useRef(true);
  const nivelMic = useRef(0), nivelVoz = useRef(0);
  const orbe = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mudoRef = useRef(false);

  const ui = useAssistente.getState;
  const falar = (quem: 'voce' | 'assistente' | 'sistema', t: string) => {
    ui().falar(quem, t, !quebra.current);
    quebra.current = quem === 'sistema';
  };
  const falasDaConversa = () => ui().falas.filter(f => !f.antiga && f.texto.trim()).map(f => ({ quem: f.quem, texto: f.texto }));
  const avisarIa = (t: string) => {
    try { sessao.current?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true }); } catch { /* sessão caiu */ }
  };

  // orbe respira com o volume (sem re-render: mexe direto no estilo)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const n = Math.max(nivelMic.current * 0.7, nivelVoz.current);
      if (orbe.current) {
        orbe.current.style.transform = `scale(${1 + n * 0.35})`;
        orbe.current.style.boxShadow = `0 0 ${20 + n * 60}px ${nivelVoz.current > 0.05 ? AZUL : 'rgba(56,189,248,.45)'}`;
      }
      nivelMic.current *= 0.85;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => { lista.current?.scrollTo({ top: lista.current.scrollHeight }); }, [falas]);

  const encerrar = async (motivo?: string) => {
    if (encerrando.current) return;
    encerrando.current = true;
    try { sessao.current?.close(); } catch { /* já fechada */ }
    sessao.current = null;
    await mic.current?.parar(); mic.current = null;
    await falante.current?.fechar(); falante.current = null;
    gestos.current?.parar(); gestos.current = null;
    pararQuadros();
    if (sessaoId.current && token) {
      await apiFetch('/api/assistente/sessao/' + sessaoId.current + '/sinal', token, { method: 'POST', body: JSON.stringify({ fim: true, falas: falasDaConversa() }) }).catch(() => {});
    }
    sessaoId.current = null;
    ui().set(motivo ? { status: 'erro', erro: motivo, pendente: null } : { status: 'desligado', pendente: null });
  };

  const iniciar = async () => {
    if (!token) return;
    encerrando.current = false;
    const anteriores = await apiFetch<{ quem: 'voce' | 'assistente' | 'sistema'; texto: string }[]>('/api/assistente/historico', token).catch(() => []);
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    ui().set({
      status: 'conectando', erro: null,
      falas: [
        ...anteriores.map((f, i) => ({ id: -1000 + i, quem: f.quem, texto: f.texto, antiga: true })),
        ...(anteriores.length ? [{ id: -1, quem: 'sistema' as const, texto: 'Nova conversa · ' + hora, antiga: true }] : []),
      ],
    });
    quebra.current = true;
    try {
      const r = await apiFetch<RespSessao>('/api/assistente/sessao', token, { method: 'POST' });
      sessaoId.current = r.sessaoId;
      setRestante(r.segundosRestantes);
      falante.current = criarAltoFalante(n => { nivelVoz.current = n; });
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: r.token, httpOptions: { apiVersion: r.versaoApi } });
      sessao.current = await ai.live.connect({
        model: r.modelo,
        config: r.config,
        callbacks: {
          onopen: () => {},
          onmessage: (m: LiveServerMessage) => { void aoReceber(m); },
          onerror: (e: ErrorEvent) => { void encerrar('A conexão com o assistente falhou: ' + (e.message || 'erro desconhecido')); },
          onclose: (e: CloseEvent) => { if (!encerrando.current) void encerrar(e.reason ? 'O assistente desconectou: ' + e.reason : 'O assistente desconectou.'); },
        },
      });
      mic.current = await ligarMicrofone((b64, nivel) => {
        nivelMic.current = Math.max(nivelMic.current, nivel);
        try { sessao.current?.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } }); } catch { /* fechou */ }
      });
      mic.current.setMudo(mudoRef.current);
      ui().set({ status: 'online' });
      avisarIa('(O usuário acabou de abrir o assistente. Cumprimente numa frase curta e pergunte como pode ajudar.)');
    } catch (e) {
      const msg = (e as Error).message || '';
      await encerrar(/Permission|NotAllowed/i.test(msg) ? 'O navegador bloqueou o microfone. Libere o microfone pra este site e tente de novo.' : msg || 'Não deu pra iniciar o assistente.');
    }
  };

  const aoReceber = async (m: LiveServerMessage) => {
    const sc = m.serverContent;
    if (sc?.interrupted) falante.current?.interromper();
    for (const p of sc?.modelTurn?.parts || []) if (p.inlineData?.data) falante.current?.tocar(p.inlineData.data);
    if (sc?.inputTranscription?.text) falar('voce', sc.inputTranscription.text);
    // o Google às vezes solta marcações técnicas na transcrição ({sound_effects:...}) — não é fala
    if (sc?.outputTranscription?.text) { const t = sc.outputTranscription.text.replace(/\{[a-z_]+:[a-z_]*\}?/g, ''); if (t) falar('assistente', t); }
    if (sc?.turnComplete) quebra.current = true;
    if (m.goAway) falar('sistema', 'A conversa vai encerrar em instantes (limite de tempo da sessão). É só abrir de novo.');
    const chamadas = m.toolCall?.functionCalls || [];
    if (!chamadas.length) return;
    setOcupado('consultando o CRM…');
    const respostas = [];
    for (const c of chamadas) {
      let resposta: Record<string, unknown>;
      try { resposta = await executarFerramenta(c.name || '', (c.args || {}) as Record<string, unknown>, { navegar }); } catch (e) { resposta = { erro: (e as Error).message || 'falhou' }; }
      respostas.push({ id: c.id, name: c.name, response: resposta });
    }
    setOcupado(null);
    try { sessao.current?.sendToolResponse({ functionResponses: respostas }); } catch { /* fechou */ }
  };

  // conversa começa ao abrir e termina ao fechar
  useEffect(() => {
    void iniciar();
    return () => { void encerrar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sinal de uso a cada 15 s (cota de minutos da imobiliária)
  useEffect(() => {
    if (status !== 'online') return;
    const t = setInterval(async () => {
      if (!sessaoId.current || !token) return;
      const r = await apiFetch<{ segundosRestantes: number; encerrar: boolean }>('/api/assistente/sessao/' + sessaoId.current + '/sinal', token, { method: 'POST', body: JSON.stringify({ falas: falasDaConversa() }) }).catch(() => null);
      if (!r) return;
      setRestante(r.segundosRestantes);
      if (r.encerrar) void encerrar('Acabaram os minutos do assistente deste mês.');
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token]);

  const trocarMudo = () => {
    const v = !mudoRef.current;
    mudoRef.current = v; setMudo(v);
    mic.current?.setMudo(v);
  };

  const confirmarPelaTela = async () => {
    const r = await executarPendente();
    falar('sistema', r.feito ? '✓ ' + String(r.resumo || 'Feito') : '⚠ ' + String(r.erro || 'Não deu certo'));
    avisarIa('(Confirmei pela tela. Resultado: ' + JSON.stringify(r) + '. Avise em uma frase.)');
  };
  const cancelarPelaTela = () => {
    ui().set({ pendente: null });
    falar('sistema', 'Ação cancelada.');
    avisarIa('(Cancelei a ação pela tela.)');
  };

  const enviarTexto = () => {
    const t = texto.trim();
    if (!t || !sessao.current) return;
    quebra.current = true;
    falar('voce', t);
    quebra.current = true;
    avisarIa(t);
    setTexto('');
  };

  // --- gestos pela webcam ---
  const cursor = useRef<HTMLDivElement>(null);
  const segurando = useRef<{ alvo: HTMLElement | null; painelId: string | null; dx: number; dy: number; x0: number; y0: number; t0: number } | null>(null);
  const aoGesto = (g: Gesto) => {
    const c = cursor.current?.getBoundingClientRect();
    const debaixo = c ? document.elementsFromPoint(c.left + 9, c.top + 9).find(el => !(el as HTMLElement).dataset?.cursorAssistente) as HTMLElement | undefined : undefined;
    if (g === 'Victory') trocarMudo();
    if (g === 'Thumb_Up' && useAssistente.getState().pendente) void confirmarPelaTela();
    if (g === 'Closed_Fist') {
      const p = debaixo?.closest('[data-painel-id]') as HTMLElement | null;
      if (p?.dataset.painelId) ui().fecharPainel(p.dataset.painelId);
    }
  };
  const aoCursor = (x: number, y: number, pinca: boolean, visivel: boolean) => {
    const el = cursor.current;
    if (!el) return;
    el.style.display = visivel ? 'block' : 'none';
    el.style.transform = `translate(${x - 9}px, ${y - 9}px) scale(${pinca ? 0.7 : 1})`;
    el.style.background = pinca ? 'rgba(249,115,22,.9)' : 'rgba(56,189,248,.55)';
    const s = segurando.current;
    if (pinca && !s) {
      const alvo = document.elementsFromPoint(x, y).find(e => !(e as HTMLElement).dataset?.cursorAssistente) as HTMLElement | undefined;
      const painel = alvo?.closest('[data-painel-id]') as HTMLElement | null;
      const p = painel?.dataset.painelId ? ui().paineis.find(q => q.id === painel.dataset.painelId) : null;
      segurando.current = { alvo: alvo || null, painelId: p?.id || null, dx: p ? x - p.x : 0, dy: p ? y - p.y : 0, x0: x, y0: y, t0: performance.now() };
    } else if (pinca && s?.painelId) {
      ui().moverPainel(s.painelId, x - s.dx, y - s.dy);
    } else if (!pinca && s) {
      // pinça rápida sem arrastar = clique
      if (performance.now() - s.t0 < 350 && Math.hypot(x - s.x0, y - s.y0) < 25) (s.alvo?.closest('button,a,[role=tab]') as HTMLElement | null)?.click();
      segurando.current = null;
    }
  };
  const quadros = useRef<number | null>(null);
  const pararQuadros = () => { if (quadros.current) clearInterval(quadros.current); quadros.current = null; };
  const enviarQuadros = () => {
    pararQuadros();
    const tela = document.createElement('canvas');
    quadros.current = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || !sessao.current) return;
      tela.width = 480; tela.height = Math.round(480 * (v.videoHeight / v.videoWidth || 0.75));
      tela.getContext('2d')!.drawImage(v, 0, 0, tela.width, tela.height);
      const data = tela.toDataURL('image/jpeg', 0.6).split(',')[1];
      try { sessao.current.sendRealtimeInput({ video: { data, mimeType: 'image/jpeg' } }); } catch { /* fechou */ }
    }, 1000);
  };
  useEffect(() => pararQuadros, []);
  const trocarCamera = async () => {
    if (camera) { pararQuadros(); gestos.current?.parar(); gestos.current = null; setCamera(false); if (cursor.current) cursor.current.style.display = 'none'; return; }
    setCamera(true);
    try {
      const { ligarGestos } = await import('../../lib/assistente/gestos');
      await new Promise(r => setTimeout(r, 50));
      gestos.current = await ligarGestos(video.current!, canvas.current!, { cursor: aoCursor, gesto: aoGesto });
      enviarQuadros();
    } catch (e) {
      setCamera(false);
      falar('sistema', /Permission|NotAllowed/i.test((e as Error).message) ? 'O navegador bloqueou a câmera.' : 'Não deu pra ligar os gestos: ' + (e as Error).message);
    }
  };

  const nome = config?.nome || 'Assistente';
  const min = restante != null ? Math.floor(restante / 60) : null;
  const rotuloStatus = status === 'online' ? (ocupado || (mudo ? 'microfone mudo' : 'ouvindo')) : status === 'conectando' ? 'conectando…' : status === 'erro' ? 'desconectado' : 'desligado';

  return (
    <>
      <div className="painel-assistente" style={{
        position: 'fixed', right: 16, top: 70, width: 'min(390px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 90px)', zIndex: 80,
        background: `linear-gradient(180deg, ${FUNDO}, #0f1b33)`, color: '#e2ecff', border: `1px solid ${LINHA}`, borderRadius: 16,
        boxShadow: '0 24px 60px rgba(2,6,23,.55)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeUp .15s ease',
      }}>
        {/* topo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${LINHA}` }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: status === 'online' ? '#22c55e' : status === 'erro' ? '#f97316' : '#64748b', boxShadow: status === 'online' ? '0 0 8px #22c55e' : 'none' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14, letterSpacing: '.04em' }}>{nome}</b>
            <span style={{ display: 'block', fontSize: 11, color: '#93a7c7', letterSpacing: '.08em', textTransform: 'uppercase' }}>{rotuloStatus}{min != null && status === 'online' ? ` · ${min} min restantes no mês` : ''}</span>
          </span>
          {(role === 'dono' || role === 'gerente') && <button onClick={() => setAjustes(v => !v)} title="Ajustes do assistente" style={botaoIcone}>⚙</button>}
          <button onClick={() => useAssistente.getState().fechar()} title="Fechar" style={botaoIcone}>✕</button>
        </div>

        {ajustes ? <AjustesAssistente onFim={() => setAjustes(false)} /> : (
          <>
            {/* orbe */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '22px 0 14px' }}>
              <div style={{ position: 'relative', width: 96, height: 96 }}>
                <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: `1px solid ${LINHA}`, animation: status === 'online' ? 'orbeGiro 8s linear infinite' : 'none', borderTopColor: AZUL }} />
                <div ref={orbe} style={{
                  width: 96, height: 96, borderRadius: '50%', transition: 'transform .08s linear',
                  background: 'radial-gradient(circle at 35% 30%, #e0f2fe 0%, #38bdf8 30%, #1d4ed8 70%, #0b1220 100%)',
                  opacity: status === 'online' ? 1 : 0.45,
                }} />
              </div>
            </div>

            {erro && (
              <div style={{ margin: '0 14px 10px', padding: '10px 12px', borderRadius: 10, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.45)', fontSize: 12.5, lineHeight: 1.5 }}>
                {erro}
                <button onClick={() => void iniciar()} style={{ ...botaoTexto, marginLeft: 8 }}>Tentar de novo</button>
              </div>
            )}
            {status === 'desligado' && !erro && (
              <div style={{ textAlign: 'center', marginBottom: 10 }}><button onClick={() => void iniciar()} style={botaoTexto}>Começar a conversar</button></div>
            )}

            {/* conversa */}
            <div ref={lista} style={{ flex: 1, minHeight: 120, maxHeight: 300, overflowY: 'auto', padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!falas.length && status === 'online' && <p style={{ fontSize: 12.5, color: '#93a7c7', textAlign: 'center', margin: '6px 0' }}>Pode falar. Ex.: "quantos leads entraram hoje?", "abre a conversa da Maria", "cria uma tarefa de ligar pro João amanhã às 10h".</p>}
              {falas.map(f => (
                <div key={f.id} style={{
                  opacity: f.antiga ? 0.55 : 1,
                  alignSelf: f.quem === 'voce' ? 'flex-end' : f.quem === 'sistema' ? 'center' : 'flex-start',
                  maxWidth: f.quem === 'sistema' ? '100%' : '85%', fontSize: f.quem === 'sistema' ? 11.5 : 13, lineHeight: 1.45,
                  color: f.quem === 'sistema' ? '#93a7c7' : '#e2ecff',
                  background: f.quem === 'voce' ? 'rgba(56,189,248,.16)' : f.quem === 'assistente' ? 'rgba(255,255,255,.06)' : 'transparent',
                  border: f.quem === 'sistema' ? 'none' : `1px solid ${LINHA}`, borderRadius: 11, padding: f.quem === 'sistema' ? 0 : '7px 10px',
                }}>{f.texto}</div>
              ))}
            </div>

            {/* ação esperando confirmação */}
            {pendente && (
              <div style={{ margin: '0 14px 10px', padding: 12, borderRadius: 12, border: `1px solid ${AZUL}`, background: 'rgba(56,189,248,.08)' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: AZUL, marginBottom: 5 }}>Confirma?</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{pendente.resumo}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => void confirmarPelaTela()} style={{ ...botaoTexto, background: AZUL, color: FUNDO, border: 'none' }}>Confirmar</button>
                  <button onClick={cancelarPelaTela} style={botaoTexto}>Cancelar</button>
                  <span style={{ fontSize: 11, color: '#93a7c7', alignSelf: 'center' }}>ou diga "sim" · 👍</span>
                </div>
              </div>
            )}

            {/* câmera dos gestos */}
            {camera && (
              <div style={{ position: 'relative', margin: '0 14px 10px', borderRadius: 10, overflow: 'hidden', border: `1px solid ${LINHA}`, height: 120 }}>
                <video ref={video} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', opacity: 0.55 }} />
                <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }} />
                <span style={{ position: 'absolute', left: 8, top: 6, fontSize: 10.5, color: '#fda4af', fontWeight: 700 }}>● {nome} está vendo a câmera</span>
                <span style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 10.5, color: '#cbd5e1' }}>pinça arrasta/clica · punho fecha painel · ✌ microfone · 👍 confirma</span>
              </div>
            )}

            {/* controles */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px 14px', borderTop: `1px solid ${LINHA}` }}>
              <button onClick={trocarMudo} disabled={status !== 'online'} title={mudo ? 'Ligar microfone' : 'Silenciar microfone'} style={{ ...botaoIcone, width: 38, height: 38, background: mudo ? 'rgba(249,115,22,.2)' : 'rgba(255,255,255,.06)' }}>{mudo ? '🔇' : '🎙'}</button>
              <button onClick={() => void trocarCamera()} title={camera ? 'Desligar gestos' : 'Controlar com gestos (webcam)'} style={{ ...botaoIcone, width: 38, height: 38, background: camera ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.06)' }}>✋</button>
              <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviarTexto()} disabled={status !== 'online'}
                placeholder="ou digite aqui…" style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 9, border: `1px solid ${LINHA}`, background: 'rgba(255,255,255,.05)', color: '#e2ecff', fontSize: 13 }} />
            </div>
          </>
        )}
      </div>
      <div ref={cursor} data-cursor-assistente="1" style={{ position: 'fixed', left: 0, top: 0, width: 18, height: 18, borderRadius: '50%', border: '2px solid #e0f2fe', pointerEvents: 'none', zIndex: 200, display: 'none', transition: 'background .1s' }} />
    </>
  );
}

/** Nome e voz do assistente (dono/gerente). Vale a partir da próxima conversa. */
function AjustesAssistente({ onFim }: { onFim: () => void }) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const config = useAssistente(s => s.config);
  const [nome, setNome] = useState(config?.nome || 'Assistente');
  const [voz, setVoz] = useState(config?.voz || 'Charon');
  const salvar = async () => {
    try {
      const r = await apiFetch<{ nome: string; voz: string }>('/api/assistente/config', token, { method: 'PATCH', body: JSON.stringify({ nome: nome.trim(), voz }) });
      useAssistente.getState().set({ config: config ? { ...config, ...r } : config });
      toast('Assistente atualizado — vale a partir da próxima conversa');
      onFim();
    } catch (e) { toast((e as Error).message); }
  };
  const campo: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: `1px solid ${LINHA}`, background: 'rgba(255,255,255,.05)', color: '#e2ecff', fontSize: 13, boxSizing: 'border-box' };
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#93a7c7' }}>Nome do assistente</label>
      <input value={nome} onChange={e => setNome(e.target.value)} maxLength={30} style={campo} />
      <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#93a7c7' }}>Voz</label>
      <select value={voz} onChange={e => setVoz(e.target.value)} style={campo}>
        {(config?.vozes || ['Charon']).map(v => <option key={v} value={v} style={{ color: '#000' }}>{v}</option>)}
      </select>
      {config && <p style={{ fontSize: 12, color: '#93a7c7', margin: 0 }}>Uso deste mês: {config.minutosUsados} de {config.minutosMes} minutos.</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => void salvar()} style={{ ...botaoTexto, background: AZUL, color: FUNDO, border: 'none' }}>Salvar</button>
        <button onClick={onFim} style={botaoTexto}>Voltar</button>
      </div>
    </div>
  );
}

/** Painéis que o assistente abre (listas, resumos). Arrastáveis com o mouse ou com a pinça. */
function PaineisFlutuantes() {
  const paineis = useAssistente(s => s.paineis);
  const arrastando = useRef<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => {
    const mover = (e: PointerEvent) => { const a = arrastando.current; if (a) useAssistente.getState().moverPainel(a.id, e.clientX - a.dx, e.clientY - a.dy); };
    const soltar = () => { arrastando.current = null; };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
  }, []);
  return (
    <>
      {paineis.map(p => (
        <div key={p.id} data-painel-id={p.id} style={{
          position: 'fixed', left: p.x, top: p.y, width: 'min(340px, calc(100vw - 24px))', maxHeight: '60vh', zIndex: 79,
          background: `linear-gradient(180deg, ${FUNDO}, #0f1b33)`, color: '#e2ecff', border: `1px solid ${LINHA}`, borderRadius: 14,
          boxShadow: '0 18px 44px rgba(2,6,23,.5)', display: 'flex', flexDirection: 'column', animation: 'fadeUp .15s ease',
        }}>
          <div onPointerDown={e => { arrastando.current = { id: p.id, dx: e.clientX - p.x, dy: e.clientY - p.y }; }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${LINHA}`, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}>
            <span style={{ width: 6, height: 6, background: AZUL, transform: 'rotate(45deg)' }} />
            <b style={{ flex: 1, fontSize: 13 }}>{p.titulo}</b>
            <button onClick={() => useAssistente.getState().fecharPainel(p.id)} style={botaoIcone} title="Fechar">✕</button>
          </div>
          <div style={{ padding: '10px 12px', overflowY: 'auto', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.conteudo}</div>
        </div>
      ))}
    </>
  );
}

const botaoIcone: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${LINHA}`, background: 'rgba(255,255,255,.06)', color: '#e2ecff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, cursor: 'pointer', flex: 'none' };
const botaoTexto: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: `1px solid ${LINHA}`, background: 'rgba(255,255,255,.06)', color: '#e2ecff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

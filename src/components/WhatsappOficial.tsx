import { useEffect, useState } from 'react';
import { useAppStore, type SessaoWhatsapp } from '../store/appStore';
import { apiFetch } from '../lib/api';
import { getSocket } from '../lib/socket';

/** Pergunta de confirmação do app como promessa. */
const confirmar = (titulo: string, texto: string, ok: string) =>
  new Promise<boolean>(res => { useAppStore.getState().ask(titulo, texto, ok, () => res(true)); });

/** WhatsApp API oficial (app Conecta Zap, Coexistência) no número central: conectar pelo Cadastro
 *  Incorporado da Meta, criar/escolher modelos e mandar modelo pelo chat quando a janela de 24h fechou. */

const btn: React.CSSProperties = { padding: '7px 12px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--card)', fontSize: 12.5, fontWeight: 600 };
const btnPrim: React.CSSProperties = { ...btn, background: 'var(--terra)', color: '#fff', border: 'none' };
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 13 };
const rotulo: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', margin: '12px 0 5px' };

type ConfigOficial = { configurado: boolean; appId: string | null; configId: string | null };
export type Modelo = {
  id: string; nome: string; idioma: string; categoria: string; status: string; motivo: string | null;
  cabecalho: string | null; texto: string; rodape: string | null; botoes: string[]; variaveis: number;
};

let configCache: Promise<ConfigOficial> | null = null;
export function useConfigOficial() {
  const token = useAppStore(s => s.token);
  const [cfg, setCfg] = useState<ConfigOficial | null>(null);
  useEffect(() => {
    if (!token) return;
    configCache ??= apiFetch<ConfigOficial>('/api/whatsapp-oficial/config', token).catch(() => ({ configurado: false, appId: null, configId: null }));
    configCache.then(setCfg);
  }, [token]);
  return cfg;
}

// --- SDK do Facebook (Cadastro Incorporado) ---------------------------------------------------
declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }
let sdk: Promise<void> | null = null;
function carregarSdk(appId: string) {
  sdk ??= new Promise<void>((ok, erro) => {
    window.fbAsyncInit = () => { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' }); ok(); };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    s.onerror = () => { sdk = null; erro(new Error('Não deu pra carregar o login da Meta (bloqueador de anúncios?)')); };
    document.body.appendChild(s);
  });
  return sdk;
}

/** Abre o Cadastro Incorporado com Coexistência e devolve o que a Meta mandou de volta. */
async function cadastroIncorporado(cfg: ConfigOficial): Promise<{ code: string; wabaId: string; phoneNumberId?: string }> {
  await carregarSdk(cfg.appId!);
  return new Promise((ok, erro) => {
    let sessao: { wabaId?: string; phoneNumberId?: string } | null = null;
    let code: string | null = null;
    const fim = () => { if (code && sessao?.wabaId) { window.removeEventListener('message', ouvir); ok({ code, wabaId: sessao.wabaId, phoneNumberId: sessao.phoneNumberId }); } };
    const ouvir = (ev: MessageEvent) => {
      if (!String(ev.origin).endsWith('facebook.com')) return;
      try {
        const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (/^FINISH/.test(d.event)) { sessao = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id }; fim(); }
        else if (d.event === 'CANCEL') { window.removeEventListener('message', ouvir); erro(new Error(d.data?.current_step ? 'Cadastro cancelado na etapa "' + d.data.current_step + '"' : 'Cadastro cancelado')); }
        else if (d.event === 'ERROR') { window.removeEventListener('message', ouvir); erro(new Error(d.data?.error_message || 'A Meta deu erro no cadastro')); }
      } catch { /* mensagem que não é do cadastro */ }
    };
    window.addEventListener('message', ouvir);
    window.FB.login((r: any) => {
      if (r?.authResponse?.code) { code = r.authResponse.code; fim(); setTimeout(() => { if (!sessao) { window.removeEventListener('message', ouvir); erro(new Error('A Meta não informou qual número foi conectado. Tente de novo.')); } }, 8000); }
      else { window.removeEventListener('message', ouvir); erro(new Error('Login com a Meta não concluído')); }
    }, {
      config_id: cfg.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3', version: 'v4' },
    });
  });
}

/** Botão que conecta a oficial — num número existente (sessaoId) ou num novo. */
export function BotaoConectarOficial({ sessaoId, rotuloBotao, estilo }: { sessaoId?: string; rotuloBotao: string; estilo?: React.CSSProperties }) {
  const cfg = useConfigOficial();
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const fetchSessoes = useAppStore(s => s.fetchSessoesWhatsapp);
  const [ocupado, setOcupado] = useState(false);
  if (!cfg?.configurado) return null;
  const conectar = async () => {
    setOcupado(true);
    try {
      const r = await cadastroIncorporado(cfg);
      const s = await apiFetch<{ avisoSync?: string | null }>('/api/whatsapp-oficial/conectar', token, { method: 'POST', body: JSON.stringify({ ...r, sessaoId }) });
      toast(s.avisoSync ? 'API oficial conectada, mas: ' + s.avisoSync : 'API oficial conectada! Deixe o WhatsApp Business aberto no celular por alguns minutos pra sincronizar.');
      fetchSessoes();
    } catch (e) {
      toast((e as Error).message || 'Não deu pra conectar a API oficial');
    } finally { setOcupado(false); }
  };
  return <button onClick={conectar} disabled={ocupado} style={{ ...(estilo || btn), opacity: ocupado ? 0.6 : 1 }}>{ocupado ? 'Conectando…' : rotuloBotao}</button>;
}

/** Linha "API oficial" embaixo de cada número central. */
export function OficialDoNumero({ s }: { s: SessaoWhatsapp }) {
  const cfg = useConfigOficial();
  const token = useAppStore(s => s.token);
  const fetchSessoes = useAppStore(s => s.fetchSessoesWhatsapp);
  const toast = useAppStore(s => s.toast);
  const [modelos, setModelos] = useState(false);
  if (!cfg?.configurado && !s.oficialAtiva) return null;

  if (!s.oficialAtiva) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          {s.oficialErro ? <span style={{ color: 'var(--terra)' }}>{s.oficialErro}. </span> : null}
          API oficial do WhatsApp: mais estável e sem risco de bloqueio nas respostas. O número continua no celular.
        </span>
        <BotaoConectarOficial sessaoId={s.id} rotuloBotao="Ligar API oficial" />
      </div>
    );
  }
  const desligar = async () => {
    const ok = await confirmar('Desligar a API oficial deste número?', 'As respostas voltam a sair só pelo WhatsApp não oficial. O número continua no celular.', 'Desligar');
    if (!ok) return;
    try { await apiFetch('/api/whatsapp-oficial/' + s.id, token, { method: 'DELETE' }); fetchSessoes(); }
    catch (e) { toast((e as Error).message); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 200, fontSize: 12, lineHeight: 1.5 }}>
        <b>API oficial</b>{s.oficialNumero ? <span style={{ color: 'var(--muted)' }}> · +{s.oficialNumero}</span> : null}
        <span style={{ display: 'block', color: 'var(--muted)' }}>
          {s.status === 'conectada' ? 'Oficial + não oficial juntos: se o cliente escreveu nas últimas 24h, responde pela oficial; senão, pela não oficial.' : 'Não oficial desconectada: depois de 24h sem o cliente escrever, só sai modelo aprovado.'}
          {' '}1ª mensagem por modelo: <b>{s.oficialTemplate || 'nenhum escolhido'}</b>
        </span>
        {s.oficialErro && <span style={{ display: 'block', color: 'var(--terra)' }}>Último erro: {s.oficialErro}</span>}
      </span>
      <div style={{ display: 'flex', gap: 7 }}>
        <button onClick={() => setModelos(true)} style={btn}>Modelos</button>
        <button onClick={desligar} style={btn}>Desligar</button>
      </div>
      {modelos && <ModelosModal sessao={s} onClose={() => { setModelos(false); fetchSessoes(); }} />}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  APPROVED: ['Aprovado', 'var(--olive)'], PENDING: ['Em análise', '#b7791f'], REJECTED: ['Rejeitado', 'var(--terra)'],
  PAUSED: ['Pausado', '#b7791f'], DISABLED: ['Desativado', 'var(--muted)'], IN_APPEAL: ['Em recurso', '#b7791f'],
};

/** Lista, cria e apaga modelos da conta; escolhe o da 1ª mensagem. */
function ModelosModal({ sessao, onClose }: { sessao: SessaoWhatsapp; onClose: () => void }) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const [lista, setLista] = useState<Modelo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [escolhido, setEscolhido] = useState(sessao.oficialTemplate ? sessao.oficialTemplate + '|' + (sessao.oficialTemplateIdioma || '') : '');

  const carregar = () => apiFetch<Modelo[]>('/api/whatsapp-oficial/' + sessao.id + '/modelos', token)
    .then(l => { setLista(l); setErro(null); }).catch(e => setErro((e as Error).message));
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessao.id]);
  // aprovação/rejeição chega pelo webhook da Meta
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const f = () => carregar();
    socket.on('oficial:modelos', f);
    return () => { socket.off('oficial:modelos', f); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvarPrimeira = async (v: string) => {
    setEscolhido(v);
    const [template, idioma] = v ? v.split('|') : [null, null];
    try { await apiFetch('/api/whatsapp-oficial/' + sessao.id, token, { method: 'PATCH', body: JSON.stringify({ template, idioma }) }); toast(template ? 'Modelo da 1ª mensagem salvo' : 'Sem modelo de 1ª mensagem'); }
    catch (e) { toast((e as Error).message); setEscolhido(sessao.oficialTemplate ? sessao.oficialTemplate + '|' + (sessao.oficialTemplateIdioma || '') : ''); }
  };
  const apagar = async (m: Modelo) => {
    if (!(await confirmar('Apagar o modelo "' + m.nome + '"?', 'Ele some da sua conta do WhatsApp (em todos os idiomas). Não dá pra criar outro com o mesmo nome por 30 dias.', 'Apagar'))) return;
    try { await apiFetch('/api/whatsapp-oficial/' + sessao.id + '/modelos/' + encodeURIComponent(m.nome), token, { method: 'DELETE' }); carregar(); }
    catch (e) { toast((e as Error).message); }
  };
  const aprovadosPrimeira = (lista || []).filter(m => m.status === 'APPROVED' && m.variaveis <= 1);

  return (
    <div onClick={onClose} className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(8,17,31,.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="modal-card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 22, margin: '0 0 4px' }}>Modelos de mensagem</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Pela API oficial, depois de 24h sem o cliente escrever, só dá pra puxar conversa com um <b>modelo aprovado pela Meta</b>.
          A análise costuma levar de minutos a 24h. Modelo é cobrado pela Meta por conversa iniciada.
        </p>

        {criando ? <NovoModelo sessaoId={sessao.id} onFim={ok => { setCriando(false); if (ok) carregar(); }} /> : (
          <>
            <label style={rotulo}>1ª mensagem automática (quando a não oficial estiver desconectada)</label>
            <select value={escolhido} onChange={e => salvarPrimeira(e.target.value)} style={input}>
              <option value="">Nenhum — lead de formulário vai direto pra roleta</option>
              {aprovadosPrimeira.map(m => <option key={m.id} value={m.nome + '|' + m.idioma}>{m.nome} ({m.idioma})</option>)}
            </select>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '5px 0 0' }}>Só aparecem modelos aprovados com no máximo uma variável — o {'{{1}}'} vira o primeiro nome do cliente.</p>

            <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 8px' }}>
              <b style={{ flex: 1, fontSize: 13 }}>Modelos da conta</b>
              <button onClick={() => setCriando(true)} style={btnPrim}>+ Criar modelo</button>
            </div>
            {erro && <p style={{ fontSize: 12.5, color: 'var(--terra)' }}>{erro}</p>}
            {!lista && !erro && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Carregando…</p>}
            {lista && !lista.length && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum modelo ainda. Crie o primeiro — ex.: "Oi {'{{1}}'}, recebemos seu cadastro sobre o imóvel. Posso te ajudar?"</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(lista || []).map(m => {
                const [txt, cor] = STATUS[m.status] || [m.status, 'var(--muted)'];
                return (
                  <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</b>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{m.idioma} · {m.categoria === 'MARKETING' ? 'Marketing' : m.categoria === 'UTILITY' ? 'Utilidade' : m.categoria}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>{txt}</span>
                      <button onClick={() => apagar(m)} style={{ ...btn, padding: '4px 8px', fontSize: 11.5 }}>Apagar</button>
                    </div>
                    {m.cabecalho && <p style={{ fontSize: 12.5, fontWeight: 700, margin: '8px 0 0' }}>{m.cabecalho}</p>}
                    <p style={{ fontSize: 12.5, margin: '6px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.texto}</p>
                    {m.rodape && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' }}>{m.rodape}</p>}
                    {m.botoes.length > 0 && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' }}>Botões: {m.botoes.join(' · ')}</p>}
                    {m.motivo && <p style={{ fontSize: 11.5, color: 'var(--terra)', margin: '6px 0 0' }}>Motivo da Meta: {m.motivo}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div style={{ textAlign: 'right', marginTop: 16 }}><button onClick={onClose} style={btn}>Fechar</button></div>
      </div>
    </div>
  );
}

/** Formulário de modelo novo (texto com {{1}}, {{2}}... + um exemplo pra cada, como a Meta exige). */
function NovoModelo({ sessaoId, onFim }: { sessaoId: string; onFim: (ok: boolean) => void }) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
  const [cabecalho, setCabecalho] = useState('');
  const [texto, setTexto] = useState('Olá {{1}}! Aqui é da imobiliária. Recebemos seu interesse no imóvel e queremos te ajudar. Podemos conversar por aqui?');
  const [rodape, setRodape] = useState('');
  const [botoes, setBotoes] = useState('');
  const [exemplos, setExemplos] = useState<string[]>(['Maria']);
  const [enviando, setEnviando] = useState(false);
  const vars = [...new Set([...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
  useEffect(() => { setExemplos(ex => vars.map((_, i) => ex[i] ?? '')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vars.join(',')]);
  const nomeLimpo = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const enviar = async () => {
    setEnviando(true);
    try {
      await apiFetch('/api/whatsapp-oficial/' + sessaoId + '/modelos', token, {
        method: 'POST',
        body: JSON.stringify({
          nome: nomeLimpo, categoria, idioma: 'pt_BR', texto, exemplos,
          cabecalho: cabecalho.trim() || null, rodape: rodape.trim() || null,
          botoes: botoes.split('\n').map(b => b.trim()).filter(Boolean),
        }),
      });
      toast('Modelo enviado pra análise da Meta');
      onFim(true);
    } catch (e) { toast((e as Error).message); } finally { setEnviando(false); }
  };

  return (
    <div>
      <label style={rotulo}>Nome (só pra você achar depois)</label>
      <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: primeiro contato formulario" style={input} />
      {nomeLimpo && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 0' }}>Vai ficar: <code>{nomeLimpo}</code></p>}
      <label style={rotulo}>Tipo</label>
      <select value={categoria} onChange={e => setCategoria(e.target.value as 'UTILITY' | 'MARKETING')} style={input}>
        <option value="UTILITY">Utilidade — resposta a um cadastro/pedido do cliente (mais barato)</option>
        <option value="MARKETING">Marketing — oferta, novidade, convite</option>
      </select>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 0' }}>Se a Meta achar que é propaganda, ela mesma muda pra Marketing.</p>
      <label style={rotulo}>Título (opcional, até 60 letras)</label>
      <input value={cabecalho} onChange={e => setCabecalho(e.target.value)} maxLength={60} style={input} />
      <label style={rotulo}>Mensagem — use {'{{1}}'}, {'{{2}}'}… pra partes que mudam (ex: nome)</label>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} maxLength={1024} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
      {vars.map((n, i) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 12, width: 110, color: 'var(--muted)' }}>Exemplo de {'{{' + n + '}}'}</span>
          <input value={exemplos[i] || ''} onChange={e => setExemplos(ex => ex.map((x, j) => (j === i ? e.target.value : x)))} placeholder={n === 1 ? 'Maria' : 'exemplo'} style={input} />
        </div>
      ))}
      <label style={rotulo}>Rodapé (opcional)</label>
      <input value={rodape} onChange={e => setRodape(e.target.value)} maxLength={60} placeholder="ex: Responda SAIR pra não receber mais" style={input} />
      <label style={rotulo}>Botões de resposta rápida (opcional, até 3, um por linha)</label>
      <textarea value={botoes} onChange={e => setBotoes(e.target.value)} rows={2} placeholder={'Quero saber mais\nAgora não'} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={() => onFim(false)} style={btn}>Voltar</button>
        <button onClick={enviar} disabled={enviando || !nomeLimpo || !texto.trim()} style={{ ...btnPrim, opacity: enviando || !nomeLimpo ? 0.6 : 1 }}>{enviando ? 'Enviando…' : 'Enviar pra análise'}</button>
      </div>
    </div>
  );
}

// --- Chat --------------------------------------------------------------------------------------

type SituacaoConversa = { oficial: boolean; sessaoId?: string; janelaAberta?: boolean; naoOficialNoAr?: boolean; nomeSugerido?: string };

/** Faixa no chat: janela de 24h fechada num número só-oficial → só dá pra mandar modelo. */
export function AvisoJanelaOficial({ leadId, qtdMensagens }: { leadId: string; qtdMensagens: number }) {
  const token = useAppStore(s => s.token);
  const [sit, setSit] = useState<SituacaoConversa | null>(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    apiFetch<SituacaoConversa>('/api/whatsapp-oficial/conversa/' + leadId, token).then(r => { if (vivo) setSit(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [leadId, qtdMensagens, token]);
  if (!sit?.oficial) return null;
  const bloqueado = !sit.janelaAberta && !sit.naoOficialNoAr;
  return (
    <>
      {bloqueado ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 10, borderRadius: 8, background: 'rgba(183,121,31,.1)', border: '1px solid rgba(183,121,31,.35)', fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ flex: 1 }}>Faz mais de 24h que o cliente não escreve. Pela API oficial, agora só dá pra mandar um <b>modelo aprovado</b> — texto solto não chega.</span>
          <button onClick={() => setAberto(true)} style={btnPrim}>Enviar modelo</button>
        </div>
      ) : (
        <div style={{ textAlign: 'right', marginBottom: 6 }}>
          <button onClick={() => setAberto(true)} style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer' }}>Enviar modelo da API oficial</button>
        </div>
      )}
      {aberto && <EnviarModeloModal leadId={leadId} nomeSugerido={sit.nomeSugerido || ''} onClose={() => setAberto(false)} />}
    </>
  );
}

function EnviarModeloModal({ leadId, nomeSugerido, onClose }: { leadId: string; nomeSugerido: string; onClose: () => void }) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const [lista, setLista] = useState<Modelo[] | null>(null);
  const [sel, setSel] = useState<Modelo | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    apiFetch<Modelo[]>('/api/whatsapp-oficial/conversa/' + leadId + '/modelos', token).then(setLista).catch(e => { toast((e as Error).message); setLista([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);
  const escolher = (m: Modelo) => { setSel(m); setValores(Array.from({ length: m.variaveis }, (_, i) => (i === 0 ? nomeSugerido : ''))); };
  const previa = sel ? sel.texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => valores[Number(n) - 1] || '{{' + n + '}}') : '';
  const enviar = async () => {
    if (!sel) return;
    setEnviando(true);
    try {
      await apiFetch('/api/whatsapp-oficial/conversa/' + leadId + '/modelo', token, { method: 'POST', body: JSON.stringify({ nome: sel.nome, idioma: sel.idioma, valores }) });
      onClose();
    } catch (e) { toast((e as Error).message); } finally { setEnviando(false); }
  };
  return (
    <div onClick={onClose} className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(8,17,31,.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="modal-card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
        <h3 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 21, margin: '0 0 12px' }}>Enviar modelo</h3>
        {!lista && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Carregando…</p>}
        {lista && !lista.length && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum modelo aprovado ainda. O gestor cria em Integrações › WhatsApp › Modelos.</p>}
        {!sel ? (lista || []).map(m => (
          <button key={m.id} onClick={() => escolher(m)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid var(--line)', borderRadius: 9, background: 'none', padding: 10, marginBottom: 7, cursor: 'pointer' }}>
            <b style={{ fontSize: 12.5 }}>{m.nome}</b>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.texto}</span>
          </button>
        )) : (
          <>
            {valores.map((v, i) => (
              <div key={i}>
                <label style={rotulo}>{'{{' + (i + 1) + '}}'}{i === 0 ? ' (normalmente o nome)' : ''}</label>
                <input value={v} onChange={e => setValores(vs => vs.map((x, j) => (j === i ? e.target.value : x)))} style={input} />
              </div>
            ))}
            <p style={{ ...rotulo, marginTop: 14 }}>Como o cliente vai ver</p>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 9, padding: 12, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {sel.cabecalho && <b style={{ display: 'block', marginBottom: 6 }}>{sel.cabecalho}</b>}
              {previa}
              {sel.rodape && <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: 'var(--muted)' }}>{sel.rodape}</span>}
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={sel ? () => setSel(null) : onClose} style={btn}>{sel ? 'Voltar' : 'Fechar'}</button>
          {sel && <button onClick={enviar} disabled={enviando || valores.some(v => !v.trim())} style={{ ...btnPrim, opacity: enviando || valores.some(v => !v.trim()) ? 0.6 : 1 }}>{enviando ? 'Enviando…' : 'Enviar'}</button>}
        </div>
      </div>
    </div>
  );
}

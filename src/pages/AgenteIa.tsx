import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { apiFetch } from '../lib/api';

type Pergunta = { chave?: string; rotulo: string; pergunta: string; obrigatoria: boolean; opcoes?: string[] };
type EtiquetaIa = { tagId: string; quando: string };
type CriterioIa = { chave?: string; descricao: string; acao: 'descartar' | 'seguir'; tagId?: string | null; tentativa?: string | null };
type Config = {
  ativo: boolean; nomeAgente: string; tom: 'cordial' | 'formal' | 'descontraido'; apresentacao: string; instrucoesExtras: string;
  perguntas: Pergunta[]; etiquetas: EtiquetaIa[]; criterios: CriterioIa[]; mensagemPassagem: string; maxMensagens: number; atenderWhatsapp: boolean;
  primeiroContatoCanais: string[]; minutosSemResposta: number; minutosAbandono: number;
  esperaSegundos: number; simularDigitacao: boolean; mensagemDesqualificado: string; despedidaModo: 'ia' | 'fixa';
  consultarImoveis: boolean; informarPreco: boolean; fotosPorImovel: number;
  modelo: 'gpt-4.1-mini' | 'gpt-4.1' | 'gpt-4o-mini';
};
type Resposta = { liberada: boolean; usaChaveSaas: boolean; chaveFinal: string | null; config: Config | null; perguntasPadrao: Pergunta[] };
type Turno = { id: string; leadId: string | null; leadNome: string; entrada: string | null; resposta: string | null; campos: Record<string, string>; decisao: string; erro: string | null; criadoEm: string };

const PADRAO = (perguntas: Pergunta[]): Config => ({
  ativo: false, nomeAgente: 'Ana', tom: 'cordial', apresentacao: '', instrucoesExtras: '', perguntas, etiquetas: [], criterios: [],
  mensagemPassagem: 'Perfeito! Vou passar suas informações para um dos nossos corretores.',
  maxMensagens: 12, atenderWhatsapp: true, primeiroContatoCanais: [], minutosSemResposta: 20, minutosAbandono: 120,
  esperaSegundos: 8, simularDigitacao: true, modelo: 'gpt-4.1-mini', despedidaModo: 'ia',
  consultarImoveis: true, informarPreco: true, fotosPorImovel: 3,
  mensagemDesqualificado: 'Obrigada pelas informações! Registrei tudo aqui e, se surgir uma opção que combine com o que você procura, nossa equipe entra em contato. 😊',
});

const DECISOES: Record<string, string> = {
  continuar: 'Continuou a conversa',
  refeito: 'Refez a resposta (o cliente mandou mais mensagem enquanto ela digitava)',
  'passar:completo': 'Passou pra roleta — qualificação completa',
  'passar:pediu_humano': 'Passou pra roleta — cliente pediu uma pessoa',
  'passar:sem_interesse': 'Passou pra roleta — cliente sem interesse',
  'passar:limite': 'Passou pra roleta — limite de mensagens',
  'passar:numero_invalido': 'Passou pra roleta — número sem WhatsApp',
  'passar:erro': 'Passou pra roleta — erro na IA',
};
const legendaDecisao = (d: string) => DECISOES[d] || (d.startsWith('descartar:') ? 'Desqualificado — foi pro bolsão (Rebatidas)' : d);

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px', fontWeight: 700 };
// breakInside: o quadro não se parte entre as duas colunas da configuração.
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', padding: 18, marginBottom: 16, breakInside: 'avoid' };
const dataBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const corDecisao = (d: string) => (d.startsWith('passar') ? 'var(--olive)' : d.startsWith('descartar') ? 'var(--terra)' : 'var(--muted)');

/** Atendimentos da IA: leads à esquerda; a conversa do lead escolhido à direita, em balões. */
function Atendimentos({ turnos }: { turnos: Turno[] | null }) {
  const [sel, setSel] = useState<string | null>(null);
  if (turnos === null) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Carregando…</p>;
  if (!turnos.length) return <div style={card}><p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Nenhum atendimento da IA ainda.</p></div>;

  // turnos vêm do mais novo pro mais antigo
  const porLead = new Map<string, Turno[]>();
  for (const t of turnos) {
    const k = t.leadId || t.leadNome;
    porLead.set(k, [...(porLead.get(k) || []), t]);
  }
  const grupos = [...porLead.entries()].map(([k, lista]) => ({ k, lista, ultimo: lista[0] }));
  const atual = grupos.find(g => g.k === sel) ?? grupos[0];

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ ...card, flex: '0 1 320px', minWidth: 260, padding: 0, overflow: 'hidden', maxHeight: '72vh', overflowY: 'auto' }}>
        {grupos.map(g => {
          const on = g.k === atual.k;
          return (
            <button key={g.k} onClick={() => setSel(g.k)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--line)',
              background: on ? 'var(--bg)' : 'transparent', boxShadow: 'inset 3px 0 0 ' + (on ? 'var(--terra)' : 'transparent'),
            }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{g.ultimo.leadNome}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{dataBr(g.ultimo.criadoEm)}</span>
              </span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: corDecisao(g.ultimo.decisao), marginTop: 3 }}>{legendaDecisao(g.ultimo.decisao)}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{g.lista.length} {g.lista.length === 1 ? 'resposta da IA' : 'respostas da IA'}</span>
            </button>
          );
        })}
      </div>

      <div style={{ ...card, flex: '1 1 480px', minWidth: 0, maxHeight: '72vh', overflowY: 'auto' }}>
        <p style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>{atual.ultimo.leadNome}</p>
        {[...atual.lista].reverse().map(t => (
          <div key={t.id} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px dashed var(--line)' }}>
            {t.entrada && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
                <span style={{ maxWidth: '78%', padding: '9px 12px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.entrada}</span>
              </div>
            )}
            {t.resposta && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <span style={{ maxWidth: '78%', padding: '9px 12px', borderRadius: 12, background: '#0F5E57', color: '#fff', fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.resposta}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 11.5 }}>
              <span style={{ color: 'var(--muted)' }}>{dataBr(t.criadoEm)}</span>
              <span style={{ fontWeight: 700, color: corDecisao(t.decisao) }}>{legendaDecisao(t.decisao)}</span>
            </div>
            {Object.keys(t.campos || {}).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {Object.entries(t.campos).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 20, background: 'var(--oliveSoft)', color: '#0F5E57' }}>
                    <b>{k.replace(/_/g, ' ')}:</b> {v}
                  </span>
                ))}
              </div>
            )}
            {t.erro && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--terra)' }}><b>Erro:</b> {t.erro}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgenteIa() {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const tagsImob = useAppStore(s => s.tags);
  const centrais = useAppStore(s => s.sessoesWhatsapp).filter(x => x.escopo === 'central');
  const setIaAtendeSessao = useAppStore(s => s.setIaAtendeSessao);
  const fetchSessoesWhatsapp = useAppStore(s => s.fetchSessoesWhatsapp);
  useEffect(() => { fetchSessoesWhatsapp(); }, [fetchSessoesWhatsapp]);
  const [aba, setAba] = useState<'config' | 'atendimentos'>('config');
  const [dados, setDados] = useState<Resposta | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [chave, setChave] = useState<string | undefined>(undefined);
  const [salvando, setSalvando] = useState(false);
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [testandoChave, setTestandoChave] = useState(false);
  const [resultadoChave, setResultadoChave] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const carregar = () => apiFetch<Resposta>('/api/agente-ia', token).then(r => {
    setDados(r);
    setCfg(r.config ? {
      ...r.config, etiquetas: r.config.etiquetas ?? [], criterios: r.config.criterios ?? [],
      esperaSegundos: r.config.esperaSegundos ?? 8, simularDigitacao: r.config.simularDigitacao ?? true,
      mensagemDesqualificado: r.config.mensagemDesqualificado ?? PADRAO([]).mensagemDesqualificado,
      despedidaModo: r.config.despedidaModo ?? 'ia',
      consultarImoveis: r.config.consultarImoveis ?? true, informarPreco: r.config.informarPreco ?? true,
      fotosPorImovel: r.config.fotosPorImovel ?? 3,
    } : PADRAO(r.perguntasPadrao));
    setChave(undefined);
  }).catch(e => toast((e as Error).message));

  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (aba !== 'atendimentos') return;
    const buscar = () => apiFetch<Turno[]>('/api/agente-ia/turnos', token).then(setTurnos).catch(() => setTurnos([]));
    void buscar();
    const t = setInterval(buscar, 15000);
    return () => clearInterval(t);
  }, [aba, token]);

  if (!dados || !cfg) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</p>;

  const cabecalho = (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>Ferramentas</p>
      <h1 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 24, margin: 0, lineHeight: 1.2 }}>Agente de IA</h1>
    </div>
  );

  if (!dados.liberada) {
    return (
      <div style={{ maxWidth: 680 }}>
        {cabecalho}
        <div style={card}>
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Função não liberada no seu plano</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            O Agente de IA atende quem chama no WhatsApp da imobiliária (e, se você quiser, faz o primeiro contato com leads de
            formulário), faz as perguntas de qualificação e só então manda o lead pra roleta. Fale com o suporte pra liberar.
          </p>
        </div>
      </div>
    );
  }

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v });
  const setPergunta = (i: number, p: Partial<Pergunta>) => set('perguntas', cfg.perguntas.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const moverPergunta = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= cfg.perguntas.length) return;
    const arr = [...cfg.perguntas];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set('perguntas', arr);
  };
  const toggleCanal = (c: string) => set('primeiroContatoCanais', cfg.primeiroContatoCanais.includes(c) ? cfg.primeiroContatoCanais.filter(x => x !== c) : [...cfg.primeiroContatoCanais, c]);

  const testarChave = async () => {
    setTestandoChave(true);
    setResultadoChave(null);
    try {
      const r = await apiFetch<{ ok: boolean; mensagem: string }>('/api/agente-ia/testar-chave', token, {
        method: 'POST', body: JSON.stringify(chave ? { chave } : {}),
      });
      setResultadoChave(r);
    } catch (e) {
      setResultadoChave({ ok: false, mensagem: (e as Error).message });
    } finally {
      setTestandoChave(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await apiFetch('/api/agente-ia', token, { method: 'PUT', body: JSON.stringify({ ...cfg, ...(chave !== undefined ? { chaveOpenai: chave } : {}) }) });
      toast('Agente de IA salvo');
      await carregar();
    } catch (e) {
      toast((e as Error).message || 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ maxWidth: 1320 }}>
      {cabecalho}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['config', 'Configuração'], ['atendimentos', 'Atendimentos da IA']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setAba(v)} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            border: '1px solid ' + (aba === v ? 'var(--terra)' : 'var(--line)'),
            background: aba === v ? 'var(--terraSoft)' : 'var(--card)', color: aba === v ? 'var(--terra)' : 'var(--ink)',
          }}>{t}</button>
        ))}
      </div>

      {aba === 'atendimentos' ? (
        <Atendimentos turnos={turnos} />
      ) : (
        <>
        <div style={{ columnWidth: 440, columnGap: 16 }}>
          <div style={card}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>
              <input type="checkbox" checked={cfg.ativo} onChange={e => set('ativo', e.target.checked)} />
              Agente de IA ligado
            </label>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              Desligado, tudo funciona como antes: o lead vai direto pra roleta. Ligado, a IA conversa primeiro e passa pra roleta
              quando terminar. Os leads que a IA já está atendendo são entregues à roleta assim que você desligar.
            </p>
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Onde a IA atua</p>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={cfg.atenderWhatsapp} onChange={e => set('atenderWhatsapp', e.target.checked)} />
              Atender quem manda mensagem pela primeira vez no WhatsApp da imobiliária
            </label>
            {centrais.length > 1 && (
              <div style={{ margin: '0 0 12px 24px', display: 'grid', gap: 5, opacity: cfg.atenderWhatsapp ? 1 : 0.5 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Em quais números a IA atende:</p>
                {centrais.map(n => (
                  <label key={n.id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" disabled={!cfg.atenderWhatsapp} checked={n.iaAtende !== false} onChange={e => setIaAtendeSessao(n.id, e.target.checked)} />
                    {n.rotulo || 'Número'}{n.numero ? ' · +' + n.numero : ''}{n.status !== 'conectada' ? ' (desconectado)' : ''}
                  </label>
                ))}
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>Desmarcado = quem chama nesse número vai direto pra roleta, sem IA. Essa escolha salva na hora.</p>
              </div>
            )}
            <p style={{ fontSize: 13, margin: '0 0 6px' }}>Fazer o primeiro contato com leads de formulário:</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
              {['Facebook', 'Instagram', 'Site'].map(c => (
                <label key={c} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={cfg.primeiroContatoCanais.includes(c)} onChange={() => toggleCanal(c)} /> {c}
                </label>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Canal desmarcado = o lead vai direto pra roleta, como hoje. A IA só atua no número central (nunca no WhatsApp pessoal
              de corretor) e só em lead sem corretor.
            </p>
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Catálogo de imóveis</p>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 8 }}>
              <input type="checkbox" checked={cfg.consultarImoveis} onChange={e => set('consultarImoveis', e.target.checked)} />
              Sugerir imóveis do cadastro que combinam com o que o cliente procura, e mandar as fotos quando ele quiser ver
            </label>
            <div style={{ opacity: cfg.consultarImoveis ? 1 : 0.5 }}>
              <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" disabled={!cfg.consultarImoveis} checked={cfg.informarPreco} onChange={e => set('informarPreco', e.target.checked)} />
                A IA pode informar o preço (desmarcado: "os valores o corretor te passa")
              </label>
              <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
                Fotos por imóvel:
                <input type="number" min={1} max={8} disabled={!cfg.consultarImoveis} style={{ ...inp, width: 70 }} value={cfg.fotosPorImovel}
                  onChange={e => set('fotosPorImovel', Number(e.target.value))} />
              </label>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              A IA só fala de imóvel que está no cadastro (menu Imóveis), nunca inventa. O imóvel que o cliente gostar fica anotado no lead pro corretor.
            </p>
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Jeito humano</p>
            <label style={lbl}>Esperar quantos segundos de silêncio antes de responder</label>
            <input type="number" style={{ ...inp, width: 120 }} min={3} max={120} value={cfg.esperaSegundos} onChange={e => set('esperaSegundos', Number(e.target.value))} />
            <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Pra quem manda a mensagem em pedaços ("oi" · "tudo bem?" · "vi o anúncio"): cada mensagem nova reinicia a contagem,
              e a IA responde tudo de uma vez só quando o cliente para de digitar.
            </p>
            <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={cfg.simularDigitacao} onChange={e => set('simularDigitacao', e.target.checked)} />
              Marcar como lida e mostrar "digitando…" antes de responder (tempo proporcional ao tamanho da resposta)
            </label>
          </div>

          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Nome da atendente</label>
                <input style={inp} value={cfg.nomeAgente} onChange={e => set('nomeAgente', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Tom de voz</label>
                <select style={inp} value={cfg.tom} onChange={e => set('tom', e.target.value as Config['tom'])}>
                  <option value="cordial">Cordial</option>
                  <option value="formal">Formal</option>
                  <option value="descontraido">Descontraído</option>
                </select>
              </div>
            </div>
            <label style={lbl}>Sobre a imobiliária (o que a IA pode contar)</label>
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={cfg.apresentacao} onChange={e => set('apresentacao', e.target.value)}
              placeholder="Ex.: Somos a Imobiliária X, há 15 anos em Belém, trabalhamos com venda e aluguel de casas e apartamentos na região metropolitana." />
            <label style={{ ...lbl, marginTop: 14 }}>Instruções extras (opcional)</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={cfg.instrucoesExtras} onChange={e => set('instrucoesExtras', e.target.value)}
              placeholder="Ex.: Não trabalhamos com imóveis rurais. Se perguntarem de financiamento, diga que o corretor explica as opções." />
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Perguntas de qualificação</p>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              A IA descobre essas informações conversando, uma ou duas por vez. Quando todas as <b>obrigatórias</b> estiverem
              respondidas, o lead vai pra roleta. A pergunta de <b>finalidade</b> (comprar/alugar) é o que escolhe a roleta certa.
            </p>
            {cfg.perguntas.map((p, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input style={{ ...inp, flex: 1, fontWeight: 600 }} value={p.rotulo} onChange={e => setPergunta(i, { rotulo: e.target.value })} placeholder="Nome curto (ex.: Bairro)" />
                  <label style={{ display: 'flex', gap: 5, fontSize: 12, whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={p.obrigatoria} onChange={e => setPergunta(i, { obrigatoria: e.target.checked })} /> Obrigatória
                  </label>
                  <button title="Subir" onClick={() => moverPergunta(i, -1)} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><ArrowUp size={14} /></button>
                  <button title="Descer" onClick={() => moverPergunta(i, 1)} style={{ border: 'none', background: 'none', color: 'var(--muted)' }}><ArrowDown size={14} /></button>
                  <button title="Remover" onClick={() => set('perguntas', cfg.perguntas.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--terra)' }}><Trash2 size={14} /></button>
                </div>
                <input style={{ ...inp, marginBottom: 8 }} value={p.pergunta} onChange={e => setPergunta(i, { pergunta: e.target.value })} placeholder="O que a IA precisa descobrir" />
                <input style={inp} value={(p.opcoes || []).join(', ')}
                  onChange={e => setPergunta(i, { opcoes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="Opções, separadas por vírgula (opcional). Ex.: Comprar, Alugar" />
              </div>
            ))}
            <button onClick={() => set('perguntas', [...cfg.perguntas, { rotulo: '', pergunta: '', obrigatoria: false }])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={14} /> Adicionar pergunta
            </button>
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Etiquetas que a IA pode colocar</p>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              A IA só usa as etiquetas desta lista, e só quando a situação descrita acontecer.
              {tagsImob.length === 0 && ' Crie etiquetas primeiro (no card de um lead, botão de bandeira).'}
            </p>
            {cfg.etiquetas.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <select style={{ ...inp, width: 180, flex: 'none' }} value={e.tagId} onChange={ev => set('etiquetas', cfg.etiquetas.map((x, j) => (j === i ? { ...x, tagId: ev.target.value } : x)))}>
                  {tagsImob.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                <input style={{ ...inp, flex: 1, minWidth: 200 }} value={e.quando} placeholder="Quando usar (ex.: quando disser que é pra investir)"
                  onChange={ev => set('etiquetas', cfg.etiquetas.map((x, j) => (j === i ? { ...x, quando: ev.target.value } : x)))} />
                <button title="Remover" onClick={() => set('etiquetas', cfg.etiquetas.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--terra)' }}><Trash2 size={14} /></button>
              </div>
            ))}
            {tagsImob.length > 0 && (
              <button onClick={() => set('etiquetas', [...cfg.etiquetas, { tagId: tagsImob[0].id, quando: '' }])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 12.5, fontWeight: 600 }}>
                <Plus size={14} /> Adicionar etiqueta
              </button>
            )}
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Quando o lead não tem perfil (desqualificação)</p>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              Se a conversa mostrar um desses casos, a IA avisa o CRM. <b>Descartar</b>: o lead não vai pra roleta — vai pro bolsão
              (Rebatidas) com o motivo, e um corretor ainda pode puxar se a IA errou. <b>Só etiquetar</b>: aplica a etiqueta e segue normal.
              Pra IA julgar renda, por exemplo, inclua uma pergunta de renda na lista acima.
            </p>
            {cfg.criterios.map((c, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <input style={{ ...inp, marginBottom: 8 }} value={c.descricao} placeholder="Ex.: Renda familiar abaixo de R$ 2.500"
                  onChange={ev => set('criterios', cfg.criterios.map((x, j) => (j === i ? { ...x, descricao: ev.target.value } : x)))} />
                <input style={{ ...inp, marginBottom: 8 }} value={c.tentativa ?? ''}
                  placeholder="Antes de descartar, tentar (opcional). Ex.: perguntar se consegue compor renda com outra pessoa ou usar FGTS"
                  onChange={ev => set('criterios', cfg.criterios.map((x, j) => (j === i ? { ...x, tentativa: ev.target.value } : x)))} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select style={{ ...inp, width: 190, flex: 'none' }} value={c.acao} onChange={ev => set('criterios', cfg.criterios.map((x, j) => (j === i ? { ...x, acao: ev.target.value as CriterioIa['acao'] } : x)))}>
                    <option value="descartar">Descartar (vai pro bolsão)</option>
                    <option value="seguir">Só etiquetar e seguir</option>
                  </select>
                  <select style={{ ...inp, width: 190, flex: 'none' }} value={c.tagId ?? ''} onChange={ev => set('criterios', cfg.criterios.map((x, j) => (j === i ? { ...x, tagId: ev.target.value || null } : x)))}>
                    <option value="">Sem etiqueta</option>
                    {tagsImob.map(t => <option key={t.id} value={t.id}>Etiqueta: {t.nome}</option>)}
                  </select>
                  <button title="Remover" onClick={() => set('criterios', cfg.criterios.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: 'var(--terra)' }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            <button onClick={() => set('criterios', [...cfg.criterios, { descricao: '', acao: 'descartar', tagId: null }])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={14} /> Adicionar critério
            </button>
            <p style={{ ...lbl, marginTop: 16 }}>O que responder pra quem for descartado</p>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 6 }}>
              <input type="radio" checked={cfg.despedidaModo === 'ia'} onChange={() => set('despedidaModo', 'ia')} />
              A IA explica com educação que, no momento, não temos uma opção que se encaixe
            </label>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 8 }}>
              <input type="radio" checked={cfg.despedidaModo === 'fixa'} onChange={() => set('despedidaModo', 'fixa')} />
              Mandar sempre este texto (sem citar motivo):
            </label>
            {cfg.despedidaModo === 'fixa' && (
              <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={cfg.mensagemDesqualificado} onChange={e => set('mensagemDesqualificado', e.target.value)} />
            )}
          </div>

          <div style={card}>
            <label style={lbl}>Mensagem ao passar pro corretor</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={cfg.mensagemPassagem} onChange={e => set('mensagemPassagem', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 14 }}>
              <div>
                <label style={lbl}>Máx. de respostas da IA</label>
                <input type="number" style={inp} value={cfg.maxMensagens} min={3} max={40} onChange={e => set('maxMensagens', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Sem resposta ao 1º contato (min)</label>
                <input type="number" style={inp} value={cfg.minutosSemResposta} min={5} onChange={e => set('minutosSemResposta', Number(e.target.value))} />
              </div>
              <div>
                <label style={lbl}>Cliente sumiu no meio (min)</label>
                <input type="number" style={inp} value={cfg.minutosAbandono} min={15} onChange={e => set('minutosAbandono', Number(e.target.value))} />
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Em qualquer desses casos o lead vai pra roleta com o que a IA já coletou — nenhum lead fica preso na IA.
            </p>
          </div>

          <div style={card}>
            <p style={{ ...lbl, fontSize: 12 }}>Chave da OpenAI</p>
            {dados.usaChaveSaas ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Incluída no seu plano — não precisa configurar nada.</p>
            ) : (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                  O seu plano usa a sua própria chave da OpenAI (o custo das conversas fica na sua conta OpenAI).
                  {dados.chaveFinal ? ' Chave atual: ' + dados.chaveFinal : ' Nenhuma chave cadastrada.'}
                </p>
                {/* type="text" mascarado (e não "password"): o gerenciador de senhas do navegador preenchia esse
                    campo com a senha de login do CRM, e salvar de novo gravava a senha no lugar da chave. */}
                <input style={{ ...inp, WebkitTextSecurity: 'disc' } as React.CSSProperties} type="text" name="chave-openai-agente"
                  placeholder={dados.chaveFinal ? 'Cole uma nova chave só se quiser trocar' : 'sk-...'}
                  value={chave ?? ''} onChange={e => setChave(e.target.value)}
                  autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={testarChave} disabled={testandoChave}
                    style={{ padding: '7px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 12.5, fontWeight: 600 }}>
                    {testandoChave ? 'Testando…' : chave ? 'Testar a chave colada' : 'Testar a chave salva'}
                  </button>
                  {resultadoChave && (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: resultadoChave.ok ? 'var(--olive)' : 'var(--terra)' }}>
                      {resultadoChave.ok ? '✓ ' : '✗ '}{resultadoChave.mensagem}
                    </span>
                  )}
                </div>
              </>
            )}
            <label style={{ ...lbl, marginTop: 14 }}>Modelo</label>
            <select style={inp} value={cfg.modelo} onChange={e => set('modelo', e.target.value as Config['modelo'])}>
              <option value="gpt-4.1-mini">GPT-4.1 mini (recomendado)</option>
              <option value="gpt-4.1">GPT-4.1 (mais caro)</option>
              <option value="gpt-4o-mini">GPT-4o mini (mais barato)</option>
            </select>
          </div>

        </div>
          <div style={{
            position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center',
            padding: '12px 0', background: 'var(--bg)', borderTop: '1px solid var(--line)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>As mudanças só valem depois de salvar.</span>
            <button onClick={salvar} disabled={salvando} style={{ padding: '11px 26px', border: 'none', borderRadius: 8, background: 'var(--terra)', color: '#fff', fontSize: 13.5, fontWeight: 600, opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAppStore, type IntegracaoFacebook, type ModoWhatsapp } from '../store/appStore';
import { useRoleInfo } from '../lib/selectors';
import { BotaoConectarOficial, OficialDoNumero } from '../components/WhatsappOficial';
import { IconeFacebook, IconeSite, IconeWhatsapp } from '../components/IconesMarca';

const secTitle: React.CSSProperties = { fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' };
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', padding: 20 };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 13.5, marginBottom: 14, boxSizing: 'border-box' };

const MODOS: { id: ModoWhatsapp; nome: string; desc: string }[] = [
  { id: 'central', nome: 'Número central da imobiliária', desc: 'Um número só. Todo corretor atende os leads dele por dentro do CRM e as mensagens saem por esse número. O histórico fica todo na imobiliária.' },
  { id: 'corretor', nome: 'WhatsApp de cada corretor', desc: 'Cada corretor usa o próprio número (o que o cliente já conhece). Menos fricção pro corretor; o CRM espelha as conversas de cada número.' },
];

export default function Integracoes() {
  const { isManager } = useRoleInfo();
  const modo = useAppStore(s => s.modoWhatsapp);
  const setModo = useAppStore(s => s.setModoWhatsapp);
  const notificarCorretor = useAppStore(s => s.notificarCorretorWhatsapp);
  const setNotificarCorretor = useAppStore(s => s.setNotificarCorretorWhatsapp);
  const conexoes = useAppStore(s => s.integracoesFacebook);
  const fetchIntegracoes = useAppStore(s => s.fetchIntegracoes);
  const excluir = useAppStore(s => s.excluirIntegracaoFb);
  const atualizar = useAppStore(s => s.atualizarIntegracaoFb);
  const testar = useAppStore(s => s.testarIntegracaoFb);
  const ask = useAppStore(s => s.ask);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<IntegracaoFacebook | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const conectarFacebook = useAppStore(s => s.conectarFacebook);
  const toast = useAppStore(s => s.toast);
  const [conectando, setConectando] = useState(false);
  const [retornoFb, setRetornoFb] = useState<{ ok: boolean; msg: string } | null>(null);
  // Login autorizou mais de uma página: o dono escolhe quais são desta imobiliária.
  const [selFb, setSelFb] = useState<string | null>(null);

  useEffect(() => { fetchIntegracoes(); }, [fetchIntegracoes]);
  const sessoes = useAppStore(s => s.sessoesWhatsapp);
  const fetchSessoes = useAppStore(s => s.fetchSessoesWhatsapp);
  const siteUrl = useAppStore(s => s.siteWebhook.url);
  useEffect(() => { if (isManager) fetchSessoes(); }, [isManager, fetchSessoes]);
  // Aba aberta: a volta do login do Facebook abre direto a aba dele; senão, a última usada.
  const [aba, setAba] = useState<Aba>(() => {
    if (new URLSearchParams(window.location.search).get('facebook')) return 'facebook';
    try { const a = localStorage.getItem('integracoes_aba'); if (a === 'whatsapp' || a === 'facebook' || a === 'site') return a; } catch { /* sem storage */ }
    return 'whatsapp';
  });
  const trocarAba = (a: Aba) => { setAba(a); try { localStorage.setItem('integracoes_aba', a); } catch { /* sem storage */ } };

  const mostrarResultadoFb = (r: Record<string, string>) => {
    const fb = r.facebook;
    const lista = (k: string) => (r[k] || '').split('|').filter(Boolean);
    const conectadas = lista('conectadas'), emOutra = lista('emOutra'), falharam = lista('falharam');
    const partes: string[] = [];
    if (conectadas.length) partes.push('Recebendo leads de: ' + conectadas.join(', ') + '.');
    if (emOutra.length) partes.push('Já conectada em outra imobiliária (não entrou aqui): ' + emOutra.join(', ') + '.');
    if (falharam.length) partes.push('Não deu pra ativar: ' + falharam.join(', ') + '.');
    if (!conectadas.length && r.msg) partes.unshift(r.msg);
    setRetornoFb({ ok: fb === 'ok', msg: partes.join(' ') || 'Conexão concluída.' });
    toast(fb === 'ok' ? 'Facebook conectado' : 'Facebook não conectado');
  };

  // Volta do login do Facebook: o servidor manda o resultado na URL (?facebook=ok|erro|escolher&...).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fb = q.get('facebook');
    if (!fb) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (fb === 'escolher' && q.get('sel')) { setSelFb(q.get('sel')); return; }
    mostrarResultadoFb(Object.fromEntries(q.entries()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!isManager) return <MeuWhatsapp modo={modo} />;

  const rodarTeste = async (id: string) => {
    setTestando(id);
    const r = await testar(id);
    setResultado(x => ({ ...x, [id]: r }));
    setTestando(null);
  };

  const centrais = sessoes.filter(s => s.escopo === 'central');
  const noAr = sessoes.filter(s => s.status === 'conectada' || s.oficialAtiva).length;
  const comOficial = sessoes.filter(s => s.oficialAtiva).length;
  const fbAtivas = conexoes.filter(c => c.ativo).length;
  const fbComErro = conexoes.some(c => c.ativo && c.ultimoErro);
  const resumoWa = modo === 'central'
    ? (centrais.length ? `${noAr} de ${centrais.length} número${centrais.length > 1 ? 's' : ''} no ar${comOficial ? ` · ${comOficial} oficial` : ''}` : 'Nenhum número conectado')
    : `${sessoes.filter(s => s.escopo === 'corretor' && s.status === 'conectada').length} corretor(es) conectado(s)`;
  const ABAS: { id: Aba; nome: string; icone: React.ReactNode; resumo: string; ok: boolean | null }[] = [
    { id: 'whatsapp', nome: 'WhatsApp', icone: <IconeWhatsapp size={22} />, resumo: resumoWa, ok: noAr > 0 ? true : sessoes.length ? false : null },
    { id: 'facebook', nome: 'Facebook Lead Ads', icone: <IconeFacebook size={22} />, resumo: conexoes.length ? `${fbAtivas} página${fbAtivas === 1 ? '' : 's'} recebendo leads` : 'Nenhuma página conectada', ok: conexoes.length ? !fbComErro && fbAtivas > 0 : null },
    { id: 'site', nome: 'Formulário do site', icone: <IconeSite size={21} />, resumo: siteUrl ? 'Link pronto pra usar' : 'Gerando link…', ok: siteUrl ? true : null },
  ];

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <p style={secTitle}>Integrações</p>
        <h1 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 24, margin: 0, lineHeight: 1.2 }}>Canais da imobiliária</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.6 }}>Por onde os leads chegam e por onde a sua equipe conversa com eles.</p>
      </div>

      {/* ---- Resumo dos canais (também são as abas) ---- */}
      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 22 }}>
        {ABAS.map(a => {
          const ativa = aba === a.id;
          return (
            <button key={a.id} role="tab" aria-selected={ativa} onClick={() => trocarAba(a.id)}
              style={{
                ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
                borderColor: ativa ? 'var(--terra)' : 'var(--line)', boxShadow: ativa ? '0 0 0 3px var(--terraSoft)' : 'none',
              }}>
              <span style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--bg)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{a.icone}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{a.nome}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: a.ok === null ? 'var(--line)' : a.ok ? 'var(--olive)' : 'var(--terra)' }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.resumo}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- WhatsApp ---- */}
      {aba === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Bloco titulo="Como sua equipe atende" desc="Escolha por onde as conversas com os clientes acontecem. Dono e Gerente veem todas as conversas em Conversas nos dois modos — muda só por onde a mensagem sai.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
              {MODOS.map(m => {
                const ativo = modo === m.id;
                return (
                  <button key={m.id} type="button" onClick={() => setModo(m.id)}
                    style={{ border: '1px solid ' + (ativo ? 'var(--terra)' : 'var(--line)'), borderRadius: 10, background: ativo ? 'var(--terraSoft)' : 'var(--card)', padding: 14, textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                      <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid ' + (ativo ? 'var(--terra)' : 'var(--line)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        {ativo && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--terra)' }} />}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{m.nome}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </Bloco>

          <Bloco titulo={modo === 'central' ? 'Números da imobiliária' : 'Números dos corretores'}
            desc={modo === 'central' ? 'Conecte pelo WhatsApp não oficial (QR code), pela API oficial ou pelos dois no mesmo número — o CRM escolhe sozinho por onde cada mensagem sai.' : 'Cada corretor conecta o próprio WhatsApp lendo o QR code.'}>
            <ConexaoWhatsapp modo={modo} />
          </Bloco>

          {modo === 'central' && (
            <Bloco titulo="Aviso ao corretor">
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={notificarCorretor} onChange={e => setNotificarCorretor(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>Avisar o corretor no WhatsApp pessoal, sem passar pelo CRM</span>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, display: 'block' }}>
                    Quando a roleta entrega um lead, o número central manda os dados dele (nome, WhatsApp, e-mail, campanha) pro celular
                    do corretor, que atende pelo próprio número. Com isso a roleta distribui a qualquer horário (ignora o "em plantão")
                    e o Aceitar/Recusar do CRM fica desligado.
                  </span>
                </span>
              </label>
            </Bloco>
          )}
        </div>
      )}

      {/* ---- Facebook Lead Ads ---- */}
      {aba === 'facebook' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Bloco titulo="Leads dos anúncios do Facebook e Instagram"
            desc='Entre com a conta que administra a página da imobiliária e marque a página. Todo lead de qualquer formulário dela cai na hora em "Lead Novo", só aqui na sua imobiliária.'
            acao={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={async () => { setConectando(true); await conectarFacebook(); setConectando(false); }} disabled={conectando}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', border: 'none', borderRadius: 8, background: '#1877F2', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  <IconeFacebook size={16} color="#fff" />{conectando ? 'Abrindo o Facebook…' : 'Conectar com Facebook'}
                </button>
                <button onClick={() => { setEditando(null); setModalAberto(true); }} style={{ ...btn, padding: '9px 14px', fontSize: 13 }}>+ Conexão manual</button>
              </div>
            }>
            {retornoFb && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 12px', padding: '11px 13px', borderRadius: 9, border: '1px solid ' + (retornoFb.ok ? 'var(--olive)' : 'var(--terra)'), background: retornoFb.ok ? 'var(--oliveSoft)' : 'var(--bg)' }}>
                <span style={{ fontWeight: 700, flex: 'none', color: retornoFb.ok ? 'var(--olive)' : 'var(--terra)' }}>{retornoFb.ok ? '✓' : '⚠'}</span>
                <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6, flex: 1 }}>{retornoFb.msg}</p>
                <button onClick={() => setRetornoFb(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 15, flex: 'none' }} aria-label="Fechar">×</button>
              </div>
            )}
            {conexoes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 16px', border: '1px dashed var(--line)', borderRadius: 10 }}>
                <IconeFacebook size={30} style={{ opacity: 0.5 }} />
                <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '10px 0 0', lineHeight: 1.6 }}>
                  Nenhuma página conectada ainda.<br />Clique em "Conectar com Facebook" pra começar a receber os leads.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conexoes.map(c => {
                  const r = resultado[c.id];
                  // status: resultado do teste manual tem prioridade sobre o último erro salvo
                  const statusOk = r ? r.ok : !c.ultimoErro;
                  const statusMsg = r ? r.msg : (c.ultimoErro ? c.ultimoErro : (c.ultimaSyncEm ? 'Última captação OK' : 'Ainda não testada'));
                  return (
                    <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                        <IconeFacebook size={18} />
                        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{c.nomeConta}</span>
                        <Selo cor={c.ativo ? 'ok' : 'neutro'}>{c.ativo ? 'Ativa' : 'Pausada'}</Selo>
                        <Selo cor="neutro">{c.origem === 'oauth' ? 'Tempo real' : 'Manual'}</Selo>
                      </div>
                      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 18, rowGap: 9, fontSize: 12.5 }}>
                        <Campo rotulo="ID da página" valor={c.pageId} mono />
                        <Campo rotulo="Formulários" valor={c.formId || 'Todos os formulários da página'} mono={!!c.formId} />
                        {c.origem !== 'oauth' && <Campo rotulo="Token" valor={c.tokenFinal} mono />}
                        <Campo rotulo="Última captação" valor={fmtData(c.ultimaSyncEm)} />
                        <dt style={dtStyle}>Situação</dt>
                        <dd style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6, color: statusOk ? 'var(--olive)' : 'var(--terra)', fontWeight: 600 }}>
                          <span style={{ flex: 'none', marginTop: 1 }}>{statusOk ? '✓' : '⚠'}</span>
                          <span style={{ minWidth: 0, wordBreak: 'break-word', fontWeight: 500 }}>{statusMsg}</span>
                        </dd>
                      </dl>
                      <div className="row-actions" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                        <button onClick={() => rodarTeste(c.id)} disabled={testando === c.id} style={btn}>{testando === c.id ? 'Testando…' : 'Testar conexão'}</button>
                        <button onClick={() => atualizar(c.id, { ativo: !c.ativo })} style={btn}>{c.ativo ? 'Pausar' : 'Ativar'}</button>
                        {c.origem !== 'oauth' && <button onClick={() => { setEditando(c); setModalAberto(true); }} style={btn}>Editar</button>}
                        <button
                          onClick={() => ask('Remover conexão "' + c.nomeConta + '"?', c.origem === 'oauth' ? 'Os leads dessa página param de chegar no CRM.' : 'A captação de leads desse formulário para de funcionar.', 'Remover', () => excluir(c.id))}
                          style={{ ...btn, color: 'var(--terra)' }}
                        >Excluir</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Bloco>
          <GuiaFacebook />
        </div>
      )}

      {/* ---- Formulário do site ---- */}
      {aba === 'site' && <FormularioDoSite />}

      {modalAberto && <ConexaoModal conexao={editando} onClose={() => setModalAberto(false)} />}
      {selFb && <EscolherPaginas sel={selFb} onFim={r => { setSelFb(null); if (r) mostrarResultadoFb(r); }} />}
    </div>
  );
}

type Aba = 'whatsapp' | 'facebook' | 'site';

/** Bloco com título, explicação curta e (opcional) botões à direita. */
function Bloco({ titulo, desc, acao, children }: { titulo: string; desc?: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{titulo}</h2>
          {desc && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.6, maxWidth: 680 }}>{desc}</p>}
        </div>
        {acao && <div style={{ flex: 'none' }}>{acao}</div>}
      </div>
      {children}
    </section>
  );
}

export function Selo({ cor, children }: { cor: 'ok' | 'alerta' | 'neutro'; children: React.ReactNode }) {
  const st = cor === 'ok' ? { background: 'var(--oliveSoft)', color: 'var(--olive)' }
    : cor === 'alerta' ? { background: 'var(--terraSoft)', color: 'var(--terra)' }
    : { background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--line)' };
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', ...st }}>{children}</span>;
}

function FormularioDoSite() {
  const site = useAppStore(s => s.siteWebhook);
  const regenerar = useAppStore(s => s.regenerarSiteWebhook);
  const ask = useAppStore(s => s.ask);
  const toast = useAppStore(s => s.toast);
  const [copiado, setCopiado] = useState('');

  const copiar = (texto: string, tag: string) => {
    navigator.clipboard?.writeText(texto).then(() => { setCopiado(tag); setTimeout(() => setCopiado(''), 1800); }).catch(() => toast('Copie manualmente'));
  };

  const url = site.url || '(gerando…)';
  const exemploJson = `{
  "nome": "Maria Silva",
  "telefone": "11999998888",
  "email": "maria@email.com",
  "mensagem": "Tenho interesse no apartamento de 2 quartos",
  "imovel": "Edifício Aurora - Apto 802",
  "campanha": "Landing Instagram Setembro"
}`;
  const promptLovable = `Crie uma landing page de captação de leads para imobiliária.
A página tem um formulário com os campos: Nome (obrigatório), Telefone/WhatsApp (obrigatório), E-mail (opcional) e Mensagem (opcional, textarea).
Ao enviar, faça um fetch POST para: ${url}
Com header "Content-Type: application/json" e o body em JSON assim:
{ "nome": "<valor do campo Nome>", "telefone": "<valor do campo Telefone>", "email": "<valor do campo E-mail>", "mensagem": "<valor do campo Mensagem>" }
Se a resposta for 201, mostre uma tela de sucesso ("Recebemos seu contato, em breve retornamos"). Se der erro, mostre uma mensagem pedindo pra tentar de novo.
Não use nenhuma biblioteca de backend — é só o fetch direto no submit.`;

  return (
    <Bloco titulo="Formulário do seu site / landing page"
      desc='Um link exclusivo da sua imobiliária. Cole no botão "Enviar" de um formulário (Lovable, Elementor, Typeform via webhook…) e todo lead cai direto em "Lead Novo" e entra na roleta.'>
      <div>
        <label style={label}>Link do webhook (POST)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ ...input, marginBottom: 0, flex: '1 1 320px', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
          <button onClick={() => site.url && copiar(site.url, 'url')} style={{ ...botao, background: 'var(--terra)', color: '#fff', border: 'none' }}>{copiado === 'url' ? 'Copiado!' : 'Copiar link'}</button>
          <button onClick={() => ask('Gerar um link novo?', 'O link atual para de funcionar na hora. Só faça isso se o link antigo vazou.', 'Gerar novo', regenerar)} style={botao}>Gerar novo link</button>
        </div>

        <label style={label}>O que o formulário deve enviar (JSON)</label>
        <pre style={pre}>{exemploJson}</pre>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 16px' }}>
          Obrigatórios: <b>nome</b> e <b>telefone</b>. Os outros são opcionais. Campos extras são ignorados.
        </p>

        <label style={label}>Prompt pronto pro Lovable</label>
        <pre style={pre}>{promptLovable}</pre>
        <button onClick={() => copiar(promptLovable, 'prompt')} style={botao}>{copiado === 'prompt' ? 'Copiado!' : 'Copiar prompt do Lovable'}</button>
      </div>
    </Bloco>
  );
}

const botao: React.CSSProperties = { padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' };
const pre: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.55, overflowX: 'auto', margin: '0 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

const linhaNumero: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, background: 'var(--card)', padding: 14 };
const botaoNovoNumero: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 14px', borderRadius: 10, background: 'none', textAlign: 'left', border: '1px dashed var(--line)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btn: React.CSSProperties = { padding: '7px 12px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--card)', fontSize: 12.5, fontWeight: 600 };
const dtStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', alignSelf: 'start', paddingTop: 1 };

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <>
      <dt style={dtStyle}>{rotulo}</dt>
      <dd style={{ margin: 0, wordBreak: 'break-all', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}>{valor}</dd>
    </>
  );
}

function fmtData(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return 'há ' + min + ' min';
  if (min < 60 * 24) return 'há ' + Math.round(min / 60) + ' h';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const LINKS_META: { rotulo: string; url: string; nota: string }[] = [
  { rotulo: 'Configurações do negócio', url: 'https://business.facebook.com/settings', nota: 'criar o usuário do sistema, atribuir a página e gerar o token' },
  { rotulo: 'Apps de desenvolvedor', url: 'https://developers.facebook.com/apps', nota: 'criar o app (uma vez só)' },
  { rotulo: 'Explorador da API', url: 'https://developers.facebook.com/tools/explorer', nota: 'descobrir o ID do formulário' },
  { rotulo: 'Teste de Lead Ads', url: 'https://developers.facebook.com/tools/lead-ads-testing', nota: 'mandar um lead de teste' },
];

const PASSOS_FB: { t: string; d: React.ReactNode }[] = [
  { t: '1. Criar um App no Meta (uma vez)', d: <>Em <b>developers.facebook.com/apps</b> → <b>Criar app</b> → caso de uso <b>Outro</b> → tipo <b>Empresa</b>. Dê um nome (ex: "Integração CRM") e vincule ao seu Gerenciador de Negócios. Não precisa enviar pra Análise (App Review).</> },
  { t: '2. Gerar o Token de acesso', d: <>Em <b>business.facebook.com/settings</b> → <b>Usuários → Usuários do sistema</b> → <b>Adicionar</b> (função Administrador). Clique em <b>Atribuir ativos</b> → Páginas → sua página → <b>Controle total</b>. Depois <b>Gerar novo token</b>: escolha o app do passo 1, validade <b>Nunca</b>, e marque as permissões <code>leads_retrieval</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code>, <code>business_management</code>, <code>ads_management</code>. Copie o token (começa com <code>EAA…</code>) — ele só aparece uma vez.</> },
  { t: '3. Pegar o ID da Página', d: <>Em <b>business.facebook.com/settings</b> → <b>Contas → Páginas</b> → clique na página. O ID aparece abaixo do nome.</> },
  { t: '4. Pegar o ID do Formulário', d: <>Em <b>developers.facebook.com/tools/explorer</b>, selecione o app, clique em <b>Gerar token de acesso</b>, e na URL digite <code>&lt;ID_DA_PÁGINA&gt;/leadgen_forms</code> → <b>Enviar</b>. A resposta lista seus formulários com <code>id</code> e <code>name</code>. Copie o <code>id</code> do formulário que quer conectar.</> },
  { t: '5. Cadastrar aqui e testar', d: <>Clique em <b>"+ Nova conexão"</b>, cole o ID da página, o ID do formulário e o token. Depois clique em <b>"Testar conexão"</b> — se aparecer o nome do formulário, está funcionando e os leads começam a cair em até 5 minutos.</> },
];

function GuiaFacebook() {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      <button
        onClick={() => setAberto(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
      >
        <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', flex: 'none', background: aberto ? 'var(--terra)' : 'var(--line)' }} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Conexão manual (sem login) — como conseguir o token e os IDs</span>
        <span style={{ color: 'var(--muted)', fontSize: 15 }}>{aberto ? '–' : '+'}</span>
      </button>
      {aberto && (
        <div style={{ padding: '4px 16px 18px', borderTop: '1px solid var(--line)' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 10px', lineHeight: 1.6 }}>
            Você precisa de 3 coisas: <b>ID da página</b>, <b>ID do formulário</b> e <b>token de acesso</b>.
            Faça tudo logado na mesma conta do Facebook que administra a página. Tem uma agência de tráfego? Peça pra ela.
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PASSOS_FB.map(p => (
              <li key={p.t} style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                <b>{p.t}</b>
                <div style={{ color: 'var(--muted)', marginTop: 3 }}>{p.d}</div>
              </li>
            ))}
          </ol>
          <p style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', margin: '18px 0 8px' }}>Sites que você vai usar</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LINKS_META.map(l => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--terra)', textDecoration: 'none' }}>
                {l.url} <span style={{ color: 'var(--muted)' }}>— {l.nota}</span>
              </a>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '14px 0 0', lineHeight: 1.6 }}>
            Deu erro no teste? "Malformed access token" = token colado errado. "requires leads_retrieval permission" = faltou marcar as permissões no passo 2. "nonexisting field (leads)" = ID do formulário errado ou de outra página.
          </p>
        </div>
      )}
    </div>
  );
}

/** Login do Facebook voltou com mais de uma página (ex.: agência que administra páginas de vários
 *  clientes): o dono marca quais são DESTA imobiliária. Páginas de outra imobiliária ficam bloqueadas. */
function EscolherPaginas({ sel, onFim }: { sel: string; onFim: (r: Record<string, string> | null) => void }) {
  const listar = useAppStore(s => s.listarPaginasFb);
  const confirmar = useAppStore(s => s.confirmarPaginasFb);
  const [paginas, setPaginas] = useState<{ id: string; nome: string; bm: string | null; situacao: 'livre' | 'nesta' | 'outra' }[] | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    listar(sel)
      .then(l => { setPaginas(l); setMarcadas(l.filter(p => p.situacao === 'nesta').map(p => p.id)); })
      .catch(e => setErro((e as { message?: string }).message || 'Não foi possível carregar as páginas'));
  }, [sel, listar]);

  const alternar = (id: string) => setMarcadas(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]));
  const salvar = async () => {
    setSalvando(true);
    try { onFim(await confirmar(sel, marcadas)); } catch (e) { setErro((e as { message?: string }).message || 'Não foi possível conectar'); setSalvando(false); }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(8,17,31,.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div className="modal-card" style={{ width: '100%', maxWidth: 500, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 26, animation: 'fadeUp .14s ease' }}>
        <h3 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 22, margin: '0 0 6px' }}>Quais páginas são desta imobiliária?</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
          A conta do Facebook tem acesso a mais de uma página. Marque só as desta imobiliária: os leads delas vão cair
          aqui. As outras continuam livres pra conectar no CRM do cliente certo.
        </p>
        {erro && <p style={{ fontSize: 13, color: 'var(--terra)', margin: '0 0 12px' }}>{erro}</p>}
        {!paginas && !erro && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Carregando páginas…</p>}
        {paginas && paginas.length > 6 && (
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome da página ou da BM…"
            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
        )}
        {paginas && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto', marginBottom: 18 }}>
            {[...paginas]
              .filter(p => !busca.trim() || (p.nome + ' ' + (p.bm || '')).toLowerCase().includes(busca.trim().toLowerCase()))
              .sort((a, b) => (a.bm || '~').localeCompare(b.bm || '~') || a.nome.localeCompare(b.nome))
              .map(p => {
              const bloqueada = p.situacao === 'outra';
              return (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: '1px solid ' + (marcadas.includes(p.id) ? 'var(--terra)' : 'var(--line)'), borderRadius: 9, cursor: bloqueada ? 'not-allowed' : 'pointer', opacity: bloqueada ? 0.55 : 1, background: 'var(--bg)' }}>
                  <input type="checkbox" disabled={bloqueada} checked={marcadas.includes(p.id)} onChange={() => alternar(p.id)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{p.nome}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>
                      {p.bm ? 'BM ' + p.bm + ' · ' : ''}
                      {bloqueada ? 'Já conectada em outra imobiliária' : p.situacao === 'nesta' ? 'Já conectada aqui' : 'ID ' + p.id}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => onFim(null)} disabled={salvando} style={{ padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !marcadas.length} style={{ padding: '9px 16px', border: 'none', borderRadius: 8, background: '#1877F2', color: '#fff', fontSize: 13, fontWeight: 600, opacity: !marcadas.length ? 0.5 : 1 }}>
            {salvando ? 'Conectando…' : 'Conectar ' + (marcadas.length === 1 ? '1 página' : marcadas.length + ' páginas')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConexaoModal({ conexao, onClose }: { conexao: IntegracaoFacebook | null; onClose: () => void }) {
  const criar = useAppStore(s => s.criarIntegracaoFb);
  const atualizar = useAppStore(s => s.atualizarIntegracaoFb);
  const [nomeConta, setNomeConta] = useState(conexao?.nomeConta ?? '');
  const [pageId, setPageId] = useState(conexao?.pageId ?? '');
  const [formId, setFormId] = useState(conexao?.formId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const editando = !!conexao;

  const submit = async () => {
    if (!nomeConta.trim() || !pageId.trim() || !formId.trim()) return;
    if (!editando && accessToken.trim().length < 20) return;
    setSaving(true);
    if (editando) {
      await atualizar(conexao!.id, {
        nomeConta: nomeConta.trim(), pageId: pageId.trim(), formId: formId.trim(),
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      });
      onClose();
    } else {
      const ok = await criar({ nomeConta: nomeConta.trim(), pageId: pageId.trim(), formId: formId.trim(), accessToken: accessToken.trim() });
      if (ok) onClose();
    }
    setSaving(false);
  };

  return (
    <div onClick={onClose} className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(8,17,31,.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div onClick={e => e.stopPropagation()} className="modal-card" style={{ width: '100%', maxWidth: 460, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 26, animation: 'fadeUp .14s ease' }}>
        <h3 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 22, margin: '0 0 4px' }}>{editando ? 'Editar conexão' : 'Nova conexão do Facebook'}</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
          O ID da página e o ID do formulário ficam na Central de Leads do Meta Business Suite. O token é um
          System User token do Business Manager, com permissão de leads.
        </p>

        <label style={label}>Nome da conexão</label>
        <input value={nomeConta} onChange={e => setNomeConta(e.target.value)} style={input} placeholder="Ex: Página principal — campanha lançamento" autoFocus />

        <label style={label}>ID da página</label>
        <input value={pageId} onChange={e => setPageId(e.target.value)} style={input} placeholder="Ex: 1029384756" inputMode="numeric" />

        <label style={label}>ID do formulário (Lead Ads)</label>
        <input value={formId} onChange={e => setFormId(e.target.value)} style={input} placeholder="Ex: 5647382910" inputMode="numeric" />

        <label style={label}>{editando ? 'Novo token (deixe em branco pra manter)' : 'Token de acesso'}</label>
        <textarea
          value={accessToken}
          onChange={e => setAccessToken(e.target.value)}
          rows={3}
          style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
          placeholder={editando ? '••••••••••' : 'Cole aqui o System User token'}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '11px 16px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ padding: '11px 18px', border: 'none', borderRadius: 8, background: 'var(--terra)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando…' : editando ? 'Salvar' : 'Adicionar conexão'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Página enxuta do corretor: conectar só o próprio número ----
function MeuWhatsapp({ modo }: { modo: ModoWhatsapp }) {
  const naoOficialOk = useAppStore(s => s.naoOficialDisponivel);
  const sessoes = useAppStore(s => s.sessoesWhatsapp);
  const me = useAppStore(s => s.me);
  const conectar = useAppStore(s => s.conectarWhatsapp);
  const desconectar = useAppStore(s => s.desconectarWhatsapp);
  const fetchSessoes = useAppStore(s => s.fetchSessoesWhatsapp);
  const [qrPara, setQrPara] = useState<string | null>(null);

  const minha = sessoes.find(s => s.escopo === 'corretor' && s.corretorId === me?.id);

  const conectarMeu = async () => {
    const id = minha ? await conectar('corretor', undefined, { id: minha.id }) : await conectar('corretor');
    if (id) setQrPara(id);
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={secTitle}>Integrações</p>
        <h1 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 24, margin: 0, lineHeight: 1.2 }}>Meu WhatsApp</h1>
      </div>

      {modo !== 'corretor' ? (
        <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          Sua imobiliária atende por um número central. Não há nada pra conectar aqui — as mensagens saem pelo número da imobiliária.
        </p></div>
      ) : !naoOficialOk ? (
        <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          A conexão por QR code fica disponível assim que o motor de WhatsApp for configurado no servidor. Fale com o seu gerente.
        </p></div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', maxWidth: 560, lineHeight: 1.6 }}>
            Conecte o seu número de WhatsApp pra atender os seus leads por aqui. O cliente continua vendo o número que ele já conhece — o CRM só espelha as conversas.
          </p>
          <div className="data-row" style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: minha?.status === 'conectada' ? 'var(--olive)' : 'var(--muted)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{me?.nome || 'Meu número'}</span>
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                {minha?.status === 'conectada' ? '+' + minha.numero : minha?.status === 'conectando' ? 'aguardando leitura do QR…' : 'não conectado'}
              </span>
            </span>
            <div className="row-actions" style={{ display: 'flex', gap: 7, flex: 'none' }}>
              {minha?.status === 'conectada'
                ? <button onClick={() => desconectar(minha.id)} style={btn}>Desconectar</button>
                : <button onClick={() => minha ? setQrPara(minha.id) : conectarMeu()} style={{ ...btn, background: 'var(--terra)', color: '#fff', border: 'none' }}>Conectar</button>}
            </div>
          </div>
        </>
      )}

      {qrPara && <QrWhatsappModal sessaoId={qrPara} onClose={() => { setQrPara(null); fetchSessoes(); }} />}
    </div>
  );
}

// ---- Conexão de número WhatsApp (não oficial, por QR code) ----
function ConexaoWhatsapp({ modo }: { modo: ModoWhatsapp }) {
  const naoOficialOk = useAppStore(s => s.naoOficialDisponivel);
  const sessoes = useAppStore(s => s.sessoesWhatsapp);
  const perfis = useAppStore(s => s.perfisRemotos);
  const conectar = useAppStore(s => s.conectarWhatsapp);
  const desconectar = useAppStore(s => s.desconectarWhatsapp);
  const fetchSessoes = useAppStore(s => s.fetchSessoesWhatsapp);
  const [qrPara, setQrPara] = useState<string | null>(null);

  const renomear = useAppStore(s => s.renomearSessaoWhatsapp);
  const corretores = perfis.filter(p => p.role === 'corretor');
  const centrais = sessoes.filter(s => s.escopo === 'central');
  const sessaoDoCorretor = (id: string) => sessoes.find(s => s.escopo === 'corretor' && s.corretorId === id);

  // número que só tinha a oficial: liga a não oficial nele também (vira híbrido)
  const abrirConexaoExistente = async (id: string) => {
    const ok = await conectar('central', undefined, { id });
    if (ok) setQrPara(id);
  };
  const abrirConexao = async (escopo: 'central' | 'corretor', corretorId?: string, rotulo?: string) => {
    const id = await conectar(escopo, corretorId, rotulo ? { rotulo } : undefined);
    if (id) setQrPara(id);
  };

  if (!naoOficialOk) {
    return (
      <div style={{ ...card, marginTop: 14, background: 'var(--bg)' }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          A conexão dos números fica disponível quando o WhatsApp não oficial for
          configurado no servidor.
        </p>
      </div>
    );
  }

  const linha = (nome: string, s: { id: string; status: string; numero: string | null } | undefined, onConnect: () => void) => (
    <div className="data-row" style={{ ...linhaNumero, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconeWhatsapp size={18} color={s?.status === 'conectada' ? '#25D366' : 'var(--muted)'} />
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{nome}</span>
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
          {s?.status === 'conectada' ? '+' + s.numero : s?.status === 'conectando' ? 'aguardando leitura do QR…' : 'não conectado'}
        </span>
      </span>
      <div className="row-actions" style={{ display: 'flex', gap: 7, flex: 'none' }}>
        {s?.status === 'conectada'
          ? <button onClick={() => desconectar(s.id)} style={btn}>Desconectar</button>
          : <>
              <button onClick={onConnect} style={{ ...btn, background: 'var(--terra)', color: '#fff', border: 'none' }}>Conectar</button>
              {s && <button onClick={() => desconectar(s.id)} style={btn}>Excluir</button>}
            </>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modo === 'central'
          ? <>
              {centrais.map(s => (
                <div key={s.id} style={linhaNumero}>
                <div className="data-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IconeWhatsapp size={18} />
                      <input
                        defaultValue={s.rotulo || ''} placeholder="Rótulo (ex: Vendas, Locação)"
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (s.rotulo || '')) renomear(s.id, v); }}
                        size={Math.max(10, (s.rotulo || '').length + 2)}
                        style={{ fontSize: 13.5, fontWeight: 700, border: '1px solid transparent', background: 'none', padding: '2px 4px', borderRadius: 5, minWidth: 0 }}
                        onFocus={e => e.currentTarget.style.borderColor = 'var(--line)'}
                      />
                      <Selo cor={s.status === 'conectada' ? 'ok' : 'neutro'}>Não oficial {s.status === 'conectada' ? 'ligado' : 'desligado'}</Selo>
                      {s.oficialAtiva && <Selo cor="ok">Oficial ligado</Selo>}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {s.status === 'conectada' ? 'Não oficial: +' + s.numero : s.status === 'conectando' ? 'aguardando leitura do QR…' : s.oficialAtiva ? 'Não oficial desligada (opcional — ligue pra mandar a 1ª mensagem e o follow-up sem modelo pago)' : 'não conectado'}
                    </span>
                  </span>
                  <div className="row-actions" style={{ display: 'flex', gap: 7, flex: 'none' }}>
                    {s.status === 'conectada'
                      ? <button onClick={() => desconectar(s.id)} style={btn}>Desconectar</button>
                      : <>
                          <button onClick={() => (s.oficialAtiva ? abrirConexaoExistente(s.id) : setQrPara(s.id))} style={{ ...btn, background: 'var(--terra)', color: '#fff', border: 'none' }}>Ler QR</button>
                          <button onClick={() => desconectar(s.id)} style={btn}>Excluir</button>
                        </>}
                  </div>
                </div>
                <OficialDoNumero s={s} />
                </div>
              ))}
              <button onClick={() => abrirConexao('central', undefined, 'Novo número')} style={botaoNovoNumero}>
                + Conectar {centrais.length ? 'outro número' : 'um número'} pelo WhatsApp não oficial
              </button>
              <BotaoConectarOficial rotuloBotao={'+ Conectar ' + (centrais.length ? 'outro número' : 'um número') + ' pela API oficial do WhatsApp'}
                estilo={botaoNovoNumero} />
            </>
          : (corretores.length === 0
              ? <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>Nenhum corretor cadastrado ainda.</p>
              : corretores.map(c => {
                  const s = sessaoDoCorretor(c.id);
                  return <div key={c.id}>{linha(c.nome, s, () => s ? setQrPara(s.id) : abrirConexao('corretor', c.id))}</div>;
                }))}
      </div>
      {modo === 'central' && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
          Vários números? Dá pra ter um pra Vendas e outro pra Locação, por exemplo. Depois, em <b>Roletas</b>, você liga cada número a uma equipe.
        </p>
      )}
      {qrPara && <QrWhatsappModal sessaoId={qrPara} onClose={() => { setQrPara(null); fetchSessoes(); }} />}
    </div>
  );
}

function QrWhatsappModal({ sessaoId, onClose }: { sessaoId: string; onClose: () => void }) {
  const qrWhatsapp = useAppStore(s => s.qrWhatsapp);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState('conectando');

  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      const r = await qrWhatsapp(sessaoId);
      if (!vivo) return;
      setQr(r.qr);
      setStatus(r.status);
      if (r.status === 'conectada') setTimeout(onClose, 1200);
    };
    tick();
    const t = setInterval(tick, 3500);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId]);

  return (
    <div onClick={onClose} className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(8,17,31,.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div onClick={e => e.stopPropagation()} className="modal-card" style={{ width: '100%', maxWidth: 380, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 26, textAlign: 'center', animation: 'fadeUp .14s ease' }}>
        <h3 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 22, margin: '0 0 6px' }}>Conectar WhatsApp</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
          No celular: WhatsApp › Aparelhos conectados › Conectar um aparelho, e aponte pra este código.
        </p>
        {status === 'conectada' ? (
          <p style={{ fontSize: 14, color: 'var(--olive)', fontWeight: 700, margin: '30px 0' }}>✓ Conectado!</p>
        ) : qr ? (
          <img src={qr} alt="QR code" style={{ width: 240, height: 240, margin: '0 auto', display: 'block', borderRadius: 8, border: '1px solid var(--line)' }} />
        ) : (
          <div style={{ width: 240, height: 240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--line)', borderRadius: 8 }}>
            <span style={{ width: 26, height: 26, border: '2px solid var(--line)', borderTopColor: 'var(--terra)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          </div>
        )}
        <button onClick={onClose} style={{ marginTop: 20, padding: '10px 18px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', fontSize: 13, fontWeight: 600 }}>Fechar</button>
      </div>
    </div>
  );
}

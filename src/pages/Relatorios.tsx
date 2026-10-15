import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useRoleInfo } from '../lib/selectors';
import { BRL } from '../lib/format';
import { apiFetch } from '../lib/api';

/** Relatórios: tudo vem calculado do servidor (GET /api/relatorios) para o período escolhido.
 *  Dono/gerente veem a imobiliária; corretor vê só os próprios números. */

interface Rel {
  periodo: { de: string; ate: string };
  kpis: {
    leads: number; leadsAnterior: number; vendas: number; vendasAnterior: number; vgv: number;
    descartes: number; distribuidos: number; recusou: number; semResposta: number;
    respostaMedianaMin: number | null; respondidos: number; respondidosEm5min: number; semMensagemNoCrm: number;
  };
  porDia: { dia: string; leads: number }[];
  porHora: { hora: number; leads: number }[];
  canais: { nome: string; leads: number; vendas: number }[];
  campanhas: { nome: string; leads: number; vendas: number }[];
  funil: { titulo: string; slug: string; leads: number }[];
  motivosDescarte: { motivo: string; qtd: number }[];
  corretores: { id: string; nome: string; bloqueado: boolean; recebidos: number; recusou: number; semResposta: number; respostaMin: number | null; carteira: number; vendas: number; vgv: number }[];
  recusas: { criadoEm: string; motivo: string; lead: string; corretor: string; para: string | null }[];
  ia: { atendidos: number; transferidos: number; desqualificados: number; atendendoAgora: number } | null;
}

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'mesPassado' | 'custom';
const iso = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function intervalo(p: Periodo, de: string, ate: string): [string, string] {
  const hoje = new Date();
  const dias = (n: number) => iso(new Date(hoje.getTime() - n * 864e5));
  if (p === 'hoje') return [iso(hoje), iso(hoje)];
  if (p === '7d') return [dias(6), iso(hoje)];
  if (p === '30d') return [dias(29), iso(hoje)];
  const [a, m] = iso(hoje).split('-').map(Number);
  if (p === 'mes') return [`${a}-${String(m).padStart(2, '0')}-01`, iso(hoje)];
  if (p === 'mesPassado') {
    const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1;
    const ultimo = new Date(Date.UTC(pa, pm, 0)).getUTCDate();
    return [`${pa}-${String(pm).padStart(2, '0')}-01`, `${pa}-${String(pm).padStart(2, '0')}-${ultimo}`];
  }
  return [de, ate];
}

const CANAL: Record<string, string> = { Indicacao: 'Indicação' };
const dataBR = (s: string) => { const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; };
const diaCurto = (s: string) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const tempo = (min: number | null) => min == null ? '—' : min < 1 ? 'menos de 1 min' : min < 60 ? Math.round(min) + ' min' : (min / 60).toFixed(1).replace('.', ',') + ' h';
function variacao(atual: number, anterior: number) {
  if (!anterior) return atual ? 'sem dados no período anterior' : '';
  const v = Math.round(((atual - anterior) / anterior) * 100);
  return (v > 0 ? '↑ ' : v < 0 ? '↓ ' : '') + Math.abs(v) + '% vs. período anterior';
}

// minWidth 0: dentro de grid, tabela larga não pode empurrar o cartão pra fora da tela (no celular)
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', padding: 20, minWidth: 0 };
const h2: React.CSSProperties = { fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 19, margin: '0 0 4px' };
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, padding: '0 10px 8px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px', fontSize: 13, borderTop: '1px solid var(--line)', whiteSpace: 'nowrap' };

export default function Relatorios() {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const { isManager } = useRoleInfo();
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [deC, setDeC] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [ateC, setAteC] = useState(iso(new Date()));
  const [rel, setRel] = useState<Rel | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [de, ate] = intervalo(periodo, deC, ateC);

  useEffect(() => {
    if (!de || !ate || ate < de) return;
    setCarregando(true);
    apiFetch<Rel>(`/api/relatorios?de=${de}&ate=${ate}`, token)
      .then(setRel)
      .catch(e => toast((e as Error).message || 'Não foi possível carregar o relatório'))
      .finally(() => setCarregando(false));
  }, [de, ate, token, toast]);

  const exportar = () => {
    if (!rel) return;
    const k = rel.kpis;
    const linhas: (string | number)[][] = [
      ['Relatório', `${dataBR(rel.periodo.de)} a ${dataBR(rel.periodo.ate)}`],
      [],
      ['Leads recebidos', k.leads], ['Vendas', k.vendas], ['Conversão (%)', pct(k.vendas, k.leads)], ['VGV (R$)', k.vgv],
      ['Descartados', k.descartes], ['Recusas (clicou)', k.recusou], ['Não responderam a tempo', k.semResposta],
      ['1ª resposta (mediana, min)', k.respostaMedianaMin == null ? '' : Math.round(k.respostaMedianaMin)],
      [],
      ['Corretor', 'Recebidos', 'Recusou', 'Não respondeu a tempo', 'Aceite (%)', '1ª resposta (min)', 'Na carteira', 'Vendas', 'VGV (R$)'],
      ...rel.corretores.map(c => [c.nome, c.recebidos, c.recusou, c.semResposta, c.recebidos ? pct(c.recebidos - c.recusou - c.semResposta, c.recebidos) : '', c.respostaMin == null ? '' : Math.round(c.respostaMin), c.carteira, c.vendas, c.vgv]),
      [],
      ['Campanha', 'Leads', 'Vendas'], ...rel.campanhas.map(c => [c.nome, c.leads, c.vendas]),
      [],
      ['Origem', 'Leads', 'Vendas'], ...rel.canais.map(c => [CANAL[c.nome] ?? c.nome, c.leads, c.vendas]),
      [],
      ['Dia', 'Leads'], ...rel.porDia.map(d => [dataBR(d.dia), d.leads]),
    ];
    const csv = '﻿' + linhas.map(l => l.map(c => { const s = String(c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio-${rel.periodo.de}-a-${rel.periodo.ate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const k = rel?.kpis;
  const aceite = k ? pct(k.distribuidos - k.recusou - k.semResposta, k.distribuidos) : 0;

  return (
    <div style={{ maxWidth: 1320 }}>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>Performance</p>
          <h1 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 24, margin: 0, lineHeight: 1.2 }}>Relatórios</h1>
          {rel && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>{dataBR(rel.periodo.de)} a {dataBR(rel.periodo.ate)}{isManager ? '' : ' · seus números'}{carregando ? ' · atualizando…' : ''}</p>}
        </div>
        <button onClick={exportar} disabled={!rel} style={{ padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 13, fontWeight: 600 }}>Exportar CSV</button>
      </div>

      {/* filtros: uma linha só, acima de tudo */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {([['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['mesPassado', 'Mês passado'], ['custom', 'Escolher datas']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setPeriodo(v)} style={{ padding: '7px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (periodo === v ? 'var(--terra)' : 'var(--line)'), background: periodo === v ? 'var(--terraSoft)' : 'var(--card)', color: periodo === v ? 'var(--terra)' : 'var(--ink)' }}>{t}</button>
        ))}
        {periodo === 'custom' && (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
            <input type="date" value={deC} max={ateC} onChange={e => setDeC(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--bg)' }} />
            até
            <input type="date" value={ateC} min={deC} onChange={e => setAteC(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--bg)' }} />
          </span>
        )}
      </div>

      {!rel ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Carregando…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          {/* números principais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
            <Tile titulo="Leads recebidos" valor={String(k!.leads)} nota={variacao(k!.leads, k!.leadsAnterior)} />
            <Tile titulo="Vendas" valor={String(k!.vendas)} nota={variacao(k!.vendas, k!.vendasAnterior)} />
            <Tile titulo="Conversão" valor={pct(k!.vendas, k!.leads) + '%'} nota="vendas ÷ leads do período" />
            <Tile titulo="VGV vendido" valor={BRL(k!.vgv)} nota={k!.vendas ? 'ticket médio ' + BRL(k!.vgv / k!.vendas) : 'sem vendas no período'} />
            <Tile titulo="1ª resposta do corretor" valor={tempo(k!.respostaMedianaMin)}
              nota={k!.respondidos ? `${pct(k!.respondidosEm5min, k!.respondidos)}% respondidos em até 5 min` : k!.distribuidos ? 'respondem fora do CRM (sem medir)' : 'sem leads distribuídos'} />
            <Tile titulo="Aceite da roleta" valor={k!.distribuidos ? aceite + '%' : '—'}
              nota={`${k!.recusou} recusa${k!.recusou === 1 ? '' : 's'} · ${k!.semResposta} sem resposta`} alerta={k!.recusou + k!.semResposta > 0} />
            <Tile titulo="Descartados" valor={String(k!.descartes)} nota={k!.leads ? pct(k!.descartes, k!.leads) + '% dos leads do período' : ''} />
          </div>

          <div style={card}>
            <h2 style={h2}>Leads por dia</h2>
            <p style={sub}>Quantos leads novos entraram em cada dia. Passe o mouse na barra para ver o número.</p>
            <Barras dados={rel.porDia.map(d => ({ rotulo: diaCurto(d.dia), dica: `${dataBR(d.dia)}: ${d.leads} lead${d.leads === 1 ? '' : 's'}`, valor: d.leads }))} altura={150} />
          </div>

          <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={card}>
              <h2 style={h2}>De onde vêm os leads</h2>
              <p style={sub}>Leads do período por origem, e quantos já viraram venda.</p>
              <BarrasH dados={rel.canais.map(c => ({ nome: CANAL[c.nome] ?? c.nome, valor: c.leads, extra: c.vendas ? `${c.vendas} venda${c.vendas > 1 ? 's' : ''} · ${pct(c.vendas, c.leads)}%` : '' }))} vazio="Nenhum lead no período." />
            </div>
            <div style={card}>
              <h2 style={h2}>Horário de chegada</h2>
              <p style={sub}>Em que hora do dia os leads mais chegam — bom para escalar o plantão.</p>
              <Barras dados={rel.porHora.map(h => ({ rotulo: h.hora % 3 === 0 ? h.hora + 'h' : '', dica: `${h.hora}h–${h.hora + 1}h: ${h.leads} lead${h.leads === 1 ? '' : 's'}`, valor: h.leads }))} altura={120} />
            </div>
          </div>

          <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
            <div style={card}>
              <h2 style={h2}>Campanhas</h2>
              <p style={sub}>As 10 campanhas que mais trouxeram leads no período.</p>
              {rel.campanhas.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nenhum lead no período.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Campanha</th><th style={{ ...th, textAlign: 'right' }}>Leads</th><th style={{ ...th, textAlign: 'right' }}>Vendas</th><th style={{ ...th, textAlign: 'right' }}>Conversão</th></tr></thead>
                    <tbody>
                      {rel.campanhas.map(c => (
                        <tr key={c.nome}>
                          <td style={{ ...td, whiteSpace: 'normal', maxWidth: 320 }}>{c.nome}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{c.leads}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{c.vendas}</td>
                          <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>{pct(c.vendas, c.leads)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={card}>
              <h2 style={h2}>Funil agora</h2>
              <p style={sub}>Onde estão os leads hoje, em cada etapa.</p>
              <BarrasH dados={rel.funil.map(f => ({ nome: f.titulo, valor: f.leads, extra: '' }))} vazio="" />
            </div>
          </div>

          {isManager && (
            <div style={card}>
              <h2 style={h2}>Corretores</h2>
              <p style={sub}>Desempenho de cada um no período. "Aceite" = leads que ficaram com ele ÷ leads que a roleta mandou.</p>
              {rel.corretores.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Sem movimento no período.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={th}>Corretor</th>
                      {['Recebidos', 'Recusou', 'Não respondeu', 'Aceite', '1ª resposta', 'Na carteira', 'Vendas', 'VGV'].map(t => <th key={t} style={{ ...th, textAlign: 'right' }}>{t}</th>)}
                    </tr></thead>
                    <tbody>
                      {rel.corretores.map(c => {
                        const ac = pct(c.recebidos - c.recusou - c.semResposta, c.recebidos);
                        return (
                          <tr key={c.id} style={{ opacity: c.bloqueado ? 0.55 : 1 }}>
                            <td style={{ ...td, fontWeight: 600 }}>{c.nome}{c.bloqueado ? ' (bloqueado)' : ''}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{c.recebidos}</td>
                            <td style={{ ...td, textAlign: 'right', color: c.recusou ? 'var(--terra)' : undefined }}>{c.recusou}</td>
                            <td style={{ ...td, textAlign: 'right', color: c.semResposta ? 'var(--terra)' : undefined }}>{c.semResposta}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{c.recebidos ? ac + '%' : '—'}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{tempo(c.respostaMin)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{c.carteira}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{c.vendas}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{BRL(c.vgv)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
            <div style={card}>
              <h2 style={h2}>Recusas da roleta</h2>
              <p style={sub}>Quem recusou o lead no aviso do CRM ou deixou o tempo acabar, e para quem ele foi depois.</p>
              {rel.recusas.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nenhuma recusa no período.</p> : (
                <div style={{ display: 'grid', gap: 0, maxHeight: 340, overflowY: 'auto' }}>
                  {rel.recusas.map((r, i) => {
                    const d = new Date(r.criadoEm);
                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0', borderTop: i ? '1px solid var(--line)' : 'none', fontSize: 13 }}>
                        <span style={{ width: 92, flex: 'none', fontSize: 12, color: 'var(--muted)' }}>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{r.corretor}</b> {r.motivo === 'sem_resposta' ? 'não respondeu a tempo' : 'recusou'} <b>{r.lead}</b>
                          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{r.para ? '→ foi para ' + r.para : '→ ficou sem corretor'}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={card}>
              <h2 style={h2}>Motivos de descarte</h2>
              <p style={sub}>Por que os leads foram descartados no período.</p>
              <BarrasH dados={rel.motivosDescarte.map(m => ({ nome: m.motivo, valor: m.qtd, extra: '' }))} vazio="Nenhum descarte no período." />
            </div>
          </div>

          {rel.ia && (
            <div style={card}>
              <h2 style={h2}>Agente de IA</h2>
              <p style={sub}>Atendimento automático no período.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                <Tile titulo="Conversas atendidas" valor={String(rel.ia.atendidos)} nota="" />
                <Tile titulo="Passados à roleta" valor={String(rel.ia.transferidos)} nota="qualificados pela IA" />
                <Tile titulo="Desqualificados" valor={String(rel.ia.desqualificados)} nota="pelas regras da imobiliária" />
                <Tile titulo="Em atendimento agora" valor={String(rel.ia.atendendoAgora)} nota="" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ titulo, valor, nota, alerta }: { titulo: string; valor: string; nota: string; alerta?: boolean }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <p style={{ margin: 0, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>{titulo}</p>
      <p style={{ margin: '6px 0 2px', fontFamily: 'Newsreader,serif', fontSize: 28, lineHeight: 1.1, color: 'var(--ink)' }}>{valor}</p>
      {nota && <p style={{ margin: 0, fontSize: 11.5, color: alerta ? 'var(--terra)' : 'var(--muted)' }}>{nota}</p>}
    </div>
  );
}

/** Colunas verticais de uma série só (uma cor). Valor no hover; só o maior ganha rótulo fixo. */
function Barras({ dados, altura }: { dados: { rotulo: string; dica: string; valor: number }[]; altura: number }) {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...dados.map(d => d.valor));
  const iMax = dados.findIndex(d => d.valor === max && max > 0);
  const poucosRotulos = dados.length > 16;
  return (
    <div>
      <div style={{ position: 'relative', height: altura, display: 'flex', alignItems: 'flex-end', gap: 2, borderBottom: '1px solid var(--line)' }}>
        {dados.map((d, i) => (
          <div key={i} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} title={d.dica}
            style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default', position: 'relative' }}>
            <div style={{ width: '100%', height: d.valor ? Math.max(3, (d.valor / max) * (altura - 18)) : 0, background: 'var(--terra)', opacity: foco == null || foco === i ? 1 : 0.45, borderRadius: '4px 4px 0 0' }} />
            {(i === iMax || foco === i) && d.valor > 0 && (
              <span style={{ position: 'absolute', bottom: (d.valor / max) * (altura - 18) + 2, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{d.valor}</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {dados.map((d, i) => (
          <span key={i} style={{ flex: 1, fontSize: 10, color: 'var(--muted)', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {!poucosRotulos || i % Math.ceil(dados.length / 10) === 0 ? d.rotulo : ''}
          </span>
        ))}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--muted)', minHeight: 16 }}>{foco != null ? dados[foco].dica : ' '}</p>
    </div>
  );
}

/** Barras horizontais com nome e valor em texto (uma cor só). */
function BarrasH({ dados, vazio }: { dados: { nome: string; valor: number; extra: string }[]; vazio: string }) {
  const max = useMemo(() => Math.max(1, ...dados.map(d => d.valor)), [dados]);
  if (!dados.length || dados.every(d => !d.valor) && vazio) return <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{vazio || 'Sem dados.'}</p>;
  return (
    <div style={{ display: 'grid', gap: 11 }}>
      {dados.map(d => (
        <div key={d.nome} title={`${d.nome}: ${d.valor}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, marginBottom: 5 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome}</span>
            <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}><b style={{ color: 'var(--ink)' }}>{d.valor}</b>{d.extra ? ' · ' + d.extra : ''}</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (d.valor / max) * 100 + '%', background: 'var(--terra)', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

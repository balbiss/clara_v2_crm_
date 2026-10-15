import { useCallback, useEffect, useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { useAppStore } from '../store/appStore';
import { apiFetch } from '../lib/api';

/** Importar leads de planilha (Excel/CSV). Os leads ficam GUARDADOS no lote até o dono/gerente
 *  distribuir — nada vai pra roleta, IA ou follow-up sozinho (ver server/src/routes/importacoes.ts). */

type Campo = 'nome' | 'telefone' | 'email' | 'observacao';
const CAMPOS: [Campo, string][] = [['nome', 'Nome'], ['telefone', 'Telefone / WhatsApp'], ['email', 'E-mail'], ['observacao', 'Observação']];
// Cabeçalhos que o CRM reconhece sozinho (comparados sem acento/maiúscula).
const PISTAS: Record<Campo, string[]> = {
  nome: ['nome', 'cliente', 'name', 'lead', 'contato', 'nome completo'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'tel', 'whats', 'numero', 'contato telefonico'],
  email: ['email', 'e-mail', 'mail'],
  observacao: ['observacao', 'obs', 'observacoes', 'anotacao', 'interesse', 'comentario', 'mensagem', 'origem'],
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

interface Lote { id: string; nome: string; criadoEm: string; criadoPorNome: string | null; novos: number; duplicados: number; invalidos: number; pendentes: number; distribuidos: number }
interface Previa { novos: number; duplicados: number; invalidos: number; exemplos: { nome: string; telefone: string; email: string | null }[]; erros: { linha: number; motivo: string }[] }

const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', padding: 20 };
const btn = (primario = false): React.CSSProperties => ({ padding: '9px 15px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: primario ? 'none' : '1px solid var(--line)', background: primario ? 'var(--terra)' : 'var(--card)', color: primario ? '#fff' : 'var(--ink)' });
const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--bg)', fontSize: 13, width: '100%' };
const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** CSV simples: separador ; ou , (o que aparecer mais na 1ª linha) e aspas. */
function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let atual: string[] = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { atual.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      atual.push(campo); linhas.push(atual); atual = []; campo = '';
    } else campo += ch;
  }
  if (campo || atual.length) { atual.push(campo); linhas.push(atual); }
  return linhas.filter(l => l.some(c => c.trim()));
}

/** Planilha modelo: CSV com ; e BOM (o Excel em português abre certinho, com acento e colunas separadas). */
function baixarModelo() {
  const linhas = [
    ['Nome', 'Telefone', 'E-mail', 'Observação'],
    ['Maria da Silva', '(62) 99999-1234', 'maria@email.com', 'Procura apartamento 2 quartos no Setor Bueno'],
    ['João Souza', '62 98888-5678', '', 'Veio do feirão de setembro'],
  ];
  const csv = '﻿' + linhas.map(l => l.map(c => (/[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'modelo-importacao-leads.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Importacoes() {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [novo, setNovo] = useState(false);
  const [distribuindo, setDistribuindo] = useState<Lote | null>(null);

  const carregar = useCallback(() => {
    apiFetch<Lote[]>('/api/importacoes', token).then(setLotes).catch(() => toast('Não foi possível carregar as importações'));
  }, [token, toast]);
  useEffect(carregar, [carregar]);

  const desfazer = (l: Lote) => useAppStore.getState().ask(
    'Desfazer a importação "' + l.nome + '"?',
    l.distribuidos
      ? `Os ${l.pendentes} leads ainda guardados serão apagados. Os ${l.distribuidos} já distribuídos continuam com os corretores.`
      : `Os ${l.pendentes} leads deste lote serão apagados do CRM.`,
    'Desfazer',
    async () => {
      try {
        const r = await apiFetch<{ apagados: number }>('/api/importacoes/' + l.id, token, { method: 'DELETE' });
        toast(r.apagados + ' leads removidos');
        carregar();
        useAppStore.getState().fetchTags();
      } catch (e) { toast((e as Error).message || 'Não foi possível desfazer'); }
    },
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>Leads</p>
          <h1 style={{ fontFamily: 'Newsreader,serif', fontWeight: 400, fontSize: 24, margin: 0, lineHeight: 1.2 }}>Importar planilha</h1>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '5px 0 0', maxWidth: 640, lineHeight: 1.55 }}>
            Os leads importados ficam <b>guardados no lote</b>: não aparecem no funil, não entram na roleta e ninguém recebe
            mensagem automática. Você decide quando e para quem distribuir.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={baixarModelo} style={btn()}>Baixar planilha modelo</button>
          {!novo && <button onClick={() => setNovo(true)} style={btn(true)}>+ Importar planilha</button>}
        </div>
      </div>

      {novo && <NovaImportacao onFechar={() => setNovo(false)} onImportou={() => { setNovo(false); carregar(); useAppStore.getState().fetchTags(); }} />}

      <div style={{ display: 'grid', gap: 10 }}>
        {lotes.map(l => {
          const total = l.pendentes + l.distribuidos;
          return (
            <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{l.nome}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  {dataBR(l.criadoEm)}{l.criadoPorNome ? ' · por ' + l.criadoPorNome : ''}
                  {l.duplicados ? ` · ${l.duplicados} já estavam no CRM` : ''}{l.invalidos ? ` · ${l.invalidos} com erro` : ''}
                </p>
                <div style={{ marginTop: 8, height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden', maxWidth: 360 }}>
                  <div style={{ width: (total ? (l.distribuidos / total) * 100 : 0) + '%', height: '100%', background: 'var(--olive)' }} />
                </div>
                <p style={{ margin: '5px 0 0', fontSize: 12 }}>
                  <b>{l.pendentes}</b> guardados · <b>{l.distribuidos}</b> distribuídos
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {l.pendentes > 0 && <button onClick={() => setDistribuindo(l)} style={btn(true)}>Distribuir</button>}
                {l.pendentes > 0 && <button onClick={() => desfazer(l)} style={{ ...btn(), color: 'var(--terra)' }}>Desfazer</button>}
              </div>
            </div>
          );
        })}
        {!lotes.length && !novo && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhuma planilha importada ainda.</p>}
      </div>

      {distribuindo && <Distribuir lote={distribuindo} onFechar={() => setDistribuindo(null)} onFeito={() => { setDistribuindo(null); carregar(); useAppStore.getState().fetchKanbanData(); }} />}
    </div>
  );
}

function NovaImportacao({ onFechar, onImportou }: { onFechar: () => void; onImportou: () => void }) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<Campo, number>>({ nome: -1, telefone: -1, email: -1, observacao: -1 });
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const [nomeLote, setNomeLote] = useState('Planilha ' + hoje);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const abrirArquivo = async (f: File) => {
    try {
      let tabela: string[][];
      if (/\.csv$/i.test(f.name) || f.type === 'text/csv') {
        let texto = await f.text();
        if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(await f.arrayBuffer()); // CSV salvo pelo Excel
        tabela = lerCsv(texto);
      } else {
        const rows = await readXlsxFile(f);
        tabela = rows.map(r => r.map(c => (c == null ? '' : c instanceof Date ? c.toLocaleDateString('pt-BR') : String(c))));
      }
      if (tabela.length < 2) { toast('A planilha precisa ter o cabeçalho e pelo menos uma linha'); return; }
      const cab = tabela[0].map(c => c.trim());
      const m: Record<Campo, number> = { nome: -1, telefone: -1, email: -1, observacao: -1 };
      for (const [campo] of CAMPOS) m[campo] = cab.findIndex(c => PISTAS[campo].includes(norm(c)));
      if (m.telefone < 0) m.telefone = cab.findIndex(c => /tel|cel|whats|fone/.test(norm(c)));
      if (m.nome < 0) m.nome = cab.findIndex(c => /nome/.test(norm(c)));
      setCabecalho(cab); setLinhas(tabela.slice(1)); setMapa(m); setPrevia(null);
      setNomeLote(f.name.replace(/\.(xlsx|xls|csv)$/i, '').slice(0, 60) || nomeLote);
    } catch {
      toast('Não consegui ler esse arquivo. Use Excel (.xlsx) ou CSV.');
    }
  };

  const montar = () => linhas.map(l => ({
    nome: mapa.nome >= 0 ? l[mapa.nome] ?? '' : '',
    telefone: mapa.telefone >= 0 ? l[mapa.telefone] ?? '' : '',
    email: mapa.email >= 0 ? l[mapa.email] ?? '' : '',
    observacao: mapa.observacao >= 0 ? l[mapa.observacao] ?? '' : '',
  }));

  const verPrevia = async () => {
    if (mapa.telefone < 0) { toast('Escolha qual coluna é o telefone'); return; }
    setOcupado(true);
    try { setPrevia(await apiFetch<Previa>('/api/importacoes/previa', token, { method: 'POST', body: JSON.stringify({ linhas: montar() }) })); }
    catch (e) { toast((e as Error).message || 'Não foi possível conferir a planilha'); }
    finally { setOcupado(false); }
  };

  const importar = async () => {
    setOcupado(true);
    try {
      const r = await apiFetch<{ novos: number }>('/api/importacoes', token, { method: 'POST', body: JSON.stringify({ nome: nomeLote, linhas: montar() }) });
      toast(r.novos + ' leads importados e guardados no lote');
      onImportou();
    } catch (e) { toast((e as Error).message || 'Não foi possível importar'); }
    finally { setOcupado(false); }
  };

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>1. Escolha a planilha</p>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--muted)' }}>
        Excel (.xlsx) ou CSV. A primeira linha deve ter os nomes das colunas (Nome, Telefone…). Não tem uma pronta?{' '}
        <button onClick={baixarModelo} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--terra)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Baixe a planilha modelo</button>.
      </p>
      <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => e.target.files?.[0] && abrirArquivo(e.target.files[0])} />

      {cabecalho.length > 0 && (
        <>
          <p style={{ margin: '18px 0 4px', fontSize: 14, fontWeight: 700 }}>2. Confira as colunas</p>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--muted)' }}>{linhas.length} linhas encontradas. Ajuste se alguma coluna estiver errada.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {CAMPOS.map(([campo, rotulo]) => (
              <label key={campo} style={{ fontSize: 12 }}>
                <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{rotulo}{campo === 'telefone' ? ' *' : ''}</span>
                <select value={mapa[campo]} onChange={e => { setMapa({ ...mapa, [campo]: Number(e.target.value) }); setPrevia(null); }} style={sel}>
                  <option value={-1}>— não tem —</option>
                  {cabecalho.map((c, i) => <option key={i} value={i}>{c || 'Coluna ' + (i + 1)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: 12, marginTop: 12, maxWidth: 360 }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nome do lote (vira etiqueta nos leads)</span>
            <input value={nomeLote} onChange={e => setNomeLote(e.target.value)} maxLength={80} style={sel} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={verPrevia} disabled={ocupado} style={btn(!previa)}>{ocupado && !previa ? 'Conferindo…' : 'Conferir antes de importar'}</button>
            <button onClick={onFechar} style={btn()}>Cancelar</button>
          </div>
        </>
      )}

      {previa && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>3. Resultado da conferência</p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
            <span><b style={{ color: 'var(--olive)' }}>{previa.novos}</b> leads novos</span>
            <span><b>{previa.duplicados}</b> já estão no CRM (não duplica)</span>
            <span><b style={{ color: previa.invalidos ? 'var(--terra)' : undefined }}>{previa.invalidos}</b> com erro (ficam de fora)</span>
          </div>
          {previa.exemplos.length > 0 && (
            <div style={{ fontSize: 12.5, background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              {previa.exemplos.map((x, i) => <div key={i}>{x.nome} · {x.telefone}{x.email ? ' · ' + x.email : ''}</div>)}
              {previa.novos > previa.exemplos.length && <div style={{ color: 'var(--muted)' }}>… e mais {previa.novos - previa.exemplos.length}</div>}
            </div>
          )}
          {previa.erros.length > 0 && (
            <details style={{ fontSize: 12, marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--terra)' }}>Ver linhas com erro</summary>
              {previa.erros.map(e => <div key={e.linha}>Linha {e.linha}: {e.motivo}</div>)}
            </details>
          )}
          <button onClick={importar} disabled={ocupado || !previa.novos} style={btn(true)}>
            {ocupado ? 'Importando…' : `Importar ${previa.novos} leads e guardar no lote`}
          </button>
        </div>
      )}
    </div>
  );
}

function Distribuir({ lote, onFechar, onFeito }: { lote: Lote; onFechar: () => void; onFeito: () => void }) {
  const token = useAppStore(s => s.token);
  const toast = useAppStore(s => s.toast);
  const perfis = useAppStore(s => s.perfisRemotos);
  const corretores = useMemo(() => perfis.filter(p => (p.role === 'corretor' || p.role === 'gerente') && !p.bloqueado), [perfis]);
  const [modo, setModo] = useState<'dividir' | 'um' | 'mao'>('dividir');
  const [marcados, setMarcados] = useState<string[]>([]);
  const [um, setUm] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [pendentes, setPendentes] = useState<{ id: string; nome: string; telefone: string }[]>([]);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (modo === 'mao' && !pendentes.length) apiFetch<typeof pendentes>('/api/importacoes/' + lote.id + '/pendentes', token).then(setPendentes).catch(() => {});
  }, [modo, lote.id, token, pendentes.length]);

  const qtd = modo === 'mao' ? escolhidos.length : Math.min(Number(quantidade) || lote.pendentes, lote.pendentes);
  const ids = modo === 'dividir' ? marcados : um ? [um] : [];
  const porPessoa = ids.length ? Math.ceil(qtd / ids.length) : 0;

  const enviar = async () => {
    if (!ids.length) { toast(modo === 'dividir' ? 'Marque os corretores' : 'Escolha o corretor'); return; }
    if (modo === 'mao' && !escolhidos.length) { toast('Marque os leads'); return; }
    setOcupado(true);
    try {
      const body = { corretorIds: ids, ...(modo === 'mao' ? { leadIds: escolhidos } : Number(quantidade) ? { quantidade: Number(quantidade) } : {}) };
      const r = await apiFetch<{ distribuidos: number; resumo: { corretor: string; quantidade: number }[] }>('/api/importacoes/' + lote.id + '/distribuir', token, { method: 'POST', body: JSON.stringify(body) });
      toast(r.distribuidos + ' leads distribuídos: ' + r.resumo.map(x => x.corretor.split(' ')[0] + ' ' + x.quantidade).join(', '));
      onFeito();
    } catch (e) { toast((e as Error).message || 'Não foi possível distribuir'); }
    finally { setOcupado(false); }
  };

  const marcar = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  return (
    <div onClick={onFechar} className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(8,17,31,.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Distribuir "{lote.nome}"</p>
        <p style={{ margin: '4px 0 14px', fontSize: 12.5, color: 'var(--muted)' }}>{lote.pendentes} leads guardados. Cada corretor recebe um aviso só, com o total.</p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {([['dividir', 'Dividir entre corretores'], ['um', 'Tudo para um corretor'], ['mao', 'Escolher na mão']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setModo(v)} style={{ ...btn(), borderColor: modo === v ? 'var(--terra)' : 'var(--line)', color: modo === v ? 'var(--terra)' : 'var(--ink)', background: modo === v ? 'var(--terraSoft)' : 'var(--card)' }}>{t}</button>
          ))}
        </div>

        {modo === 'dividir' ? (
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {corretores.map(c => (
              <label key={c.id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={marcados.includes(c.id)} onChange={() => marcar(marcados, setMarcados, c.id)} /> {c.nome}
              </label>
            ))}
          </div>
        ) : (
          <select value={um} onChange={e => setUm(e.target.value)} style={{ ...sel, marginBottom: 12 }}>
            <option value="">Escolha o corretor…</option>
            {corretores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}

        {modo === 'mao' ? (
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', padding: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', gap: 8, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              <input type="checkbox" checked={!!pendentes.length && escolhidos.length === pendentes.length} onChange={e => setEscolhidos(e.target.checked ? pendentes.map(p => p.id) : [])} /> Marcar todos
            </label>
            {pendentes.map(p => (
              <label key={p.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
                <input type="checkbox" checked={escolhidos.includes(p.id)} onChange={() => marcar(escolhidos, setEscolhidos, p.id)} /> {p.nome} · {p.telefone}
              </label>
            ))}
          </div>
        ) : (
          <label style={{ display: 'block', fontSize: 12, marginBottom: 12 }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Quantos distribuir agora? (vazio = todos os {lote.pendentes})</span>
            <input type="number" min={1} max={lote.pendentes} value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder={String(lote.pendentes)} style={{ ...sel, maxWidth: 160 }} />
          </label>
        )}

        {ids.length > 0 && qtd > 0 && (
          <p style={{ fontSize: 12.5, background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', margin: '0 0 12px' }}>
            {qtd} leads → {ids.length === 1 ? 'todos para 1 corretor' : `cerca de ${porPessoa} para cada um dos ${ids.length} corretores, em sequência`}.
            Nenhuma mensagem vai para os clientes.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onFechar} style={btn()}>Cancelar</button>
          <button onClick={enviar} disabled={ocupado} style={btn(true)}>{ocupado ? 'Distribuindo…' : 'Distribuir'}</button>
        </div>
      </div>
    </div>
  );
}

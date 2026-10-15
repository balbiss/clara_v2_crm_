import { useAppStore, type RemoteImovel, type RemoteTemplate } from '../../store/appStore';
import { apiFetch } from '../api';
import { useAssistente } from './estado';

/** Configurar o CRM por voz (só dono/gerente): ver a configuração atual de uma área e preparar uma
 *  alteração. Nada é gravado sem confirmação — o cartão mostra o que muda (antes → depois) e a gravação
 *  usa as mesmas rotas/ações da tela, com as mesmas validações. */

type R = Record<string, unknown>;
const st = () => useAppStore.getState();
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function texto(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    if (!v.length) return 'nenhum';
    const nomes = v.map(x => (typeof x === 'object' && x ? String((x as R).rotulo ?? (x as R).descricao ?? (x as R).conteudo ?? (x as R).nome ?? JSON.stringify(x)) : String(x)));
    const j = nomes.join(' · ');
    return j.length > 160 ? v.length + ' itens: ' + j.slice(0, 150) + '…' : j;
  }
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 160);
  const s = String(v);
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}

/** "campo: antes → depois" só do que muda. */
function diferencas(antes: R, mudancas: R, rotulos: Record<string, string> = {}) {
  return Object.entries(mudancas)
    .filter(([k, v]) => JSON.stringify(antes[k]) !== JSON.stringify(v))
    .map(([k, v]) => `• ${rotulos[k] || k}: ${texto(antes[k])} → ${texto(v)}`);
}

function lerJson(s: unknown): R | null {
  if (s && typeof s === 'object') return s as R;
  try { const v = JSON.parse(String(s || '')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

function preparar(resumo: string, executar: () => Promise<R>) {
  useAssistente.getState().set({ pendente: { tipo: 'config', resumo, executar } });
  return { status: 'aguardando_confirmacao', resumo, instrucao: 'Leia o resumo das mudanças e pergunte se confirma.' };
}

const ROT_IA: Record<string, string> = {
  ativo: 'Agente ligado', nomeAgente: 'Nome do agente', tom: 'Tom', apresentacao: 'Apresentação', instrucoesExtras: 'Instruções extras',
  perguntas: 'Perguntas', criterios: 'Critérios de desqualificação', mensagemPassagem: 'Mensagem ao passar pro corretor',
  maxMensagens: 'Máx. de mensagens', atenderWhatsapp: 'Atende no WhatsApp', primeiroContatoCanais: '1º contato nos canais',
  minutosSemResposta: 'Minutos sem resposta', minutosAbandono: 'Minutos pra abandono', esperaSegundos: 'Espera (s)',
  mensagemDesqualificado: 'Mensagem pro desqualificado', despedidaModo: 'Despedida', consultarImoveis: 'Sugere imóveis',
  informarPreco: 'Informa preço', fotosPorImovel: 'Fotos por imóvel', simularDigitacao: 'Simula digitação', modelo: 'Modelo',
};

async function agenteIaAtual() {
  const r = await apiFetch<{ config: R | null; liberada: boolean }>('/api/agente-ia', st().token);
  if (!r.liberada) throw new Error('O Agente de IA não está liberado no plano desta imobiliária.');
  if (!r.config) throw new Error('O Agente de IA ainda não foi configurado. A primeira configuração precisa ser feita na tela Agente de IA.');
  return r.config;
}

export async function verConfiguracao(area: string): Promise<R> {
  const s = st();
  switch (area) {
    case 'agente_ia': {
      const c = await agenteIaAtual();
      const { chaveCifrada: _a, chaveIv: _b, chaveTag: _c, imobiliariaId: _d, ...resto } = c as R;
      return { area, config: resto, dica: 'Pra mudar, use alterar_configuracao com area agente_ia e mudancas_json só com os campos que mudam (perguntas e criterios vão inteiros, já com a alteração).' };
    }
    case 'site': {
      const r = await apiFetch<R>('/api/sites', s.token);
      return { area, ...r };
    }
    case 'imoveis': {
      const l = await apiFetch<RemoteImovel[]>('/api/imoveis', s.token);
      return { area, total: l.length, imoveis: l.slice(0, 40).map(i => ({ id: i.id, titulo: i.titulo, tipo: i.tipo, finalidade: i.finalidade, preco: i.preco, cidade: i.cidade, endereco: i.endereco, quartos: i.quartos, noSite: !!i.publicarNoSite })) };
    }
    case 'roletas': {
      await s.fetchRoletas();
      return { area, roletas: st().roletas.map(r => ({ id: r.id, nome: r.nome, ativa: r.ativa, padrao: r.padrao, canais: r.canais, finalidade: r.finalidade, corretores: r.membros.map(m => m.nome) })), corretoresDaEquipe: st().perfisRemotos.filter(p => p.role === 'corretor' && !p.bloqueado).map(p => p.nome) };
    }
    case 'followups': {
      await s.fetchFollowup();
      return { area, fluxos: st().fluxos.map(f => ({ id: f.id, nome: f.nome, ativo: f.ativo, disparaEmLeadNovo: f.disparaEmLeadNovo, aoEsgotar: f.aoEsgotar, passos: f.passos.map(p => ({ tipo: p.tipo, conteudo: p.conteudo, atrasoMinutos: p.atrasoMinutos })) })) };
    }
    case 'templates': {
      const l = await apiFetch<RemoteTemplate[]>('/api/templates', s.token);
      return { area, templates: l.map(t => ({ id: t.id, titulo: t.titulo, texto: t.texto })) };
    }
    default:
      return { erro: 'Área desconhecida. Use: agente_ia, site, imoveis, roletas, followups, templates.' };
  }
}

export async function alterarConfiguracao(area: string, alvoId: string | undefined, mudancasJson: unknown): Promise<R> {
  const m = lerJson(mudancasJson);
  if (!m || !Object.keys(m).length) return { erro: 'mudancas_json precisa ser um objeto JSON com os campos que mudam.' };
  const s = st();
  switch (area) {
    case 'agente_ia': {
      const atual = await agenteIaAtual();
      const linhas = diferencas(atual, m, ROT_IA);
      if (!linhas.length) return { erro: 'Nada muda em relação ao que já está configurado.' };
      const novo = { ...atual, ...m };
      return preparar('Agente de IA\n' + linhas.join('\n'), async () => {
        await apiFetch('/api/agente-ia', st().token, { method: 'PUT', body: JSON.stringify(novo) });
        return { feito: true, resumo: 'Agente de IA atualizado.' };
      });
    }
    case 'site': {
      const r = await apiFetch<{ publicado: boolean; config: R }>('/api/sites', s.token);
      const { publicado, ...cfg } = m;
      const linhas = diferencas(r.config, cfg).concat(publicado !== undefined && publicado !== r.publicado ? [`• Site publicado: ${texto(r.publicado)} → ${texto(publicado)}`] : []);
      if (!linhas.length) return { erro: 'Nada muda no site.' };
      return preparar('Site de imóveis\n' + linhas.join('\n'), async () => {
        await apiFetch('/api/sites', st().token, { method: 'PUT', body: JSON.stringify({ config: { ...r.config, ...cfg }, ...(publicado !== undefined ? { publicado: !!publicado } : {}) }) });
        await st().fetchSite();
        return { feito: true, resumo: 'Site atualizado.' };
      });
    }
    case 'imovel': {
      const l = await apiFetch<RemoteImovel[]>('/api/imoveis', s.token);
      const im = l.find(i => i.id === alvoId);
      if (!im) return { erro: 'Imóvel não encontrado (use ver_configuracao imoveis pra pegar o id).' };
      const antes: R = { ...im, preco: Number(im.preco), area: im.area != null ? Number(im.area) : null, valorCondominio: im.valorCondominio != null ? Number(im.valorCondominio) : null, valorIptu: im.valorIptu != null ? Number(im.valorIptu) : null };
      const linhas = diferencas(antes, m);
      if (!linhas.length) return { erro: 'Nada muda nesse imóvel.' };
      return preparar(`Imóvel "${im.titulo}"\n` + linhas.join('\n'), async () => {
        await apiFetch('/api/imoveis/' + im.id, st().token, { method: 'PATCH', body: JSON.stringify(m) });
        st().fetchImoveis();
        return { feito: true, resumo: 'Imóvel atualizado.' };
      });
    }
    case 'roleta': {
      await s.fetchRoletas();
      const r = st().roletas.find(x => x.id === alvoId);
      if (!r) return { erro: 'Roleta não encontrada (use ver_configuracao roletas).' };
      const { corretores, ...patch } = m as R & { corretores?: string[] };
      let ids: string[] | null = null;
      if (Array.isArray(corretores)) {
        const equipe = st().perfisRemotos.filter(p => p.role === 'corretor');
        ids = [];
        for (const n of corretores) {
          const p = equipe.find(e => sem(e.nome) === sem(String(n))) || equipe.find(e => sem(e.nome).includes(sem(String(n))));
          if (!p) return { erro: `Corretor "${n}" não encontrado. Corretores: ${equipe.map(e => e.nome).join(', ')}` };
          ids.push(p.id);
        }
      }
      const linhas = diferencas(r as unknown as R, patch).concat(ids ? [`• Corretores: ${r.membros.map(x => x.nome).join(', ') || 'nenhum'} → ${(corretores as string[]).join(', ')}`] : []);
      if (!linhas.length) return { erro: 'Nada muda nessa roleta.' };
      return preparar(`Roleta "${r.nome}"\n` + linhas.join('\n'), async () => {
        if (Object.keys(patch).length) await st().atualizarRoleta(r.id, patch);
        if (ids) await st().setMembrosRoleta(r.id, ids);
        return { feito: true, resumo: 'Roleta atualizada.' };
      });
    }
    case 'followup': {
      await s.fetchFollowup();
      const f = st().fluxos.find(x => x.id === alvoId);
      if (!f) return { erro: 'Follow-up não encontrado (use ver_configuracao followups).' };
      const { passos, ...patch } = m as R & { passos?: { tipo?: string; conteudo: string; atrasoMinutos: number }[] };
      const linhas = diferencas(f as unknown as R, patch).concat(Array.isArray(passos) ? [`• Passos: ${f.passos.length} → ${passos.length} (${passos.map(p => p.conteudo).join(' · ').slice(0, 140)})`] : []);
      if (!linhas.length) return { erro: 'Nada muda nesse follow-up.' };
      return preparar(`Follow-up "${f.nome}"\n` + linhas.join('\n'), async () => {
        if (Object.keys(patch).length) await st().atualizarFluxo(f.id, patch);
        if (Array.isArray(passos)) {
          await st().salvarPassos(f.id, passos.map(p => ({
            tipo: (p.tipo as 'texto') || 'texto', conteudo: String(p.conteudo || ''), atrasoMinutos: Math.max(0, Number(p.atrasoMinutos) || 0),
            atrasoTexto: '', cadenciaLabel: null, anexoUrl: null, anexoNome: null,
          })));
        }
        return { feito: true, resumo: 'Follow-up atualizado.' };
      });
    }
    case 'template': {
      const l = await apiFetch<RemoteTemplate[]>('/api/templates', s.token);
      const t = l.find(x => x.id === alvoId);
      if (!t) return { erro: 'Template não encontrado (use ver_configuracao templates).' };
      const linhas = diferencas(t as unknown as R, m);
      if (!linhas.length) return { erro: 'Nada muda nesse template.' };
      return preparar(`Template "${t.titulo}"\n` + linhas.join('\n'), async () => {
        await apiFetch('/api/templates/' + t.id, st().token, { method: 'PATCH', body: JSON.stringify(m) });
        st().fetchTemplates();
        return { feito: true, resumo: 'Template atualizado.' };
      });
    }
    default:
      return { erro: 'Área desconhecida. Use: agente_ia, site, imovel, roleta, followup, template.' };
  }
}

export async function criarItem(area: string, dadosJson: unknown): Promise<R> {
  const d = lerJson(dadosJson);
  if (!d) return { erro: 'dados_json precisa ser um objeto JSON.' };
  switch (area) {
    case 'imovel': {
      const falta = ['tipo', 'finalidade', 'titulo', 'preco'].filter(k => d[k] == null || d[k] === '');
      if (falta.length) return { erro: 'Faltam: ' + falta.join(', ') + '. Pergunte ao usuário.' };
      const linhas = Object.entries(d).map(([k, v]) => `• ${k}: ${texto(v)}`);
      return preparar('Cadastrar imóvel\n' + linhas.join('\n'), async () => {
        await apiFetch('/api/imoveis', st().token, { method: 'POST', body: JSON.stringify(d) });
        st().fetchImoveis();
        return { feito: true, resumo: 'Imóvel cadastrado (sem fotos — dá pra adicionar na tela Imóveis).' };
      });
    }
    case 'template': {
      if (!d.titulo || !d.texto) return { erro: 'Template precisa de titulo e texto.' };
      return preparar(`Criar template "${d.titulo}"\n• Texto: ${texto(d.texto)}`, async () => {
        await apiFetch('/api/templates', st().token, { method: 'POST', body: JSON.stringify({ titulo: d.titulo, texto: d.texto }) });
        st().fetchTemplates();
        return { feito: true, resumo: 'Template criado.' };
      });
    }
    case 'roleta': {
      if (!d.nome) return { erro: 'A roleta precisa de um nome.' };
      return preparar(`Criar roleta "${d.nome}"`, async () => {
        await st().criarRoleta(String(d.nome));
        return { feito: true, resumo: 'Roleta criada. Pra pôr corretores e canais, peça pra alterar a roleta.' };
      });
    }
    case 'followup': {
      if (!d.nome) return { erro: 'O follow-up precisa de um nome.' };
      return preparar(`Criar follow-up "${d.nome}"`, async () => {
        const f = await st().criarFluxo(String(d.nome));
        return f ? { feito: true, resumo: 'Follow-up criado. Pra pôr os passos, peça pra alterar o follow-up.', id: f.id } : { erro: 'O CRM não criou o follow-up.' };
      });
    }
    default:
      return { erro: 'Dá pra criar: imovel, template, roleta, followup.' };
  }
}

export async function publicarImovelNoSite(imovelId: string, publicar: boolean): Promise<R> {
  const l = await apiFetch<RemoteImovel[]>('/api/imoveis', st().token);
  const im = l.find(i => i.id === imovelId);
  if (!im) return { erro: 'Imóvel não encontrado.' };
  if (!!im.publicarNoSite === publicar) return { erro: `"${im.titulo}" já ${publicar ? 'está' : 'não está'} no site.` };
  return preparar(`${publicar ? 'Publicar no site' : 'Tirar do site'}: "${im.titulo}"`, async () => {
    await st().toggleImovelNoSite(im.id, publicar);
    return { feito: true, resumo: publicar ? 'Imóvel publicado no site.' : 'Imóvel tirado do site.' };
  });
}

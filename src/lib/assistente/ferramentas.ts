import { useAppStore, type RemoteMensagem, type RemoteTarefa } from '../../store/appStore';
import { apiFetch } from '../api';
import type { Lead } from '../data';
import { useAssistente, type AcaoPendente } from './estado';
import { alterarConfiguracao, criarItem, publicarImovelNoSite, verConfiguracao } from './configuracao';

/** Ferramentas do assistente de voz, executadas no navegador com os dados e as ações que o usuário
 *  já tem no CRM (corretor só tem os próprios leads carregados — as mesmas regras da tela).
 *  O que muda alguma coisa só PREPARA um cartão; executa no confirmar_acao (ou clique / joinha). */

type Args = Record<string, unknown>;
type Ctx = { navegar: (rota: string) => void };

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const tem = (campo: string | undefined | null, busca: string) => !!campo && sem(campo).includes(sem(busca));
const dataBr = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null);
const st = () => useAppStore.getState();
/** Meia-noite de hoje no horário de Brasília. */
const inicioDeHoje = () => new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00-03:00').getTime();

async function garantirDados() {
  const s = st();
  if (!s.leads.length) await s.fetchKanbanData();
}

function etapaDe(l: Lead) {
  return st().colunasRemotas.find(c => c.id === l.colunaId)?.titulo || l.col;
}
function etiquetasDe(l: Lead) {
  const tags = st().tags;
  return l.tags.map(id => tags.find(t => t.id === id)?.nome).filter(Boolean) as string[];
}
function resumoLead(l: Lead) {
  return {
    id: l.id, nome: l.nome, etapa: etapaDe(l), corretor: l.corretor || 'sem corretor', canal: l.canal, campanha: l.campanha || null,
    imovel: l.imovel || null, entrouEm: dataBr(l.criadoEm), diasNaEtapa: l.dias, etiquetas: etiquetasDe(l),
    agenteIa: l.iaStatus || null,
  };
}
function acharLead(id: unknown) {
  return st().leads.find(l => l.id === String(id || ''));
}
function acharEtapa(nome: string) {
  const cols = st().colunasRemotas;
  return cols.find(c => sem(c.titulo) === sem(nome)) || cols.find(c => tem(c.titulo, nome));
}

function preparar(acao: AcaoPendente) {
  useAssistente.getState().set({ pendente: acao });
  return { status: 'aguardando_confirmacao', resumo: acao.resumo, instrucao: 'Leia o resumo pro usuário e pergunte se confirma.' };
}

/** Executa a ação pendente (voz, clique ou joinha). */
export async function executarPendente(): Promise<Record<string, unknown>> {
  const a = useAssistente.getState().pendente;
  if (!a) return { erro: 'Não há nenhuma ação esperando confirmação.' };
  useAssistente.getState().set({ pendente: null });
  const s = st();
  try {
    if (a.tipo === 'tarefa') {
      const ok = await s.criarTarefa({ titulo: a.titulo, venceEm: a.quando, leadId: a.leadId, descricao: a.descricao });
      return ok ? { feito: true, resumo: 'Tarefa criada: ' + a.resumo } : { erro: 'O CRM não aceitou a tarefa.' };
    }
    if (a.tipo === 'config') return await a.executar();
    if (a.tipo === 'mover') {
      s.move(a.leadId, a.colunaId);
      return { feito: true, resumo: a.resumo };
    }
    await s.enviarMensagem(a.leadId, { texto: a.texto });
    return { feito: true, resumo: 'Mensagem enviada.' };
  } catch (e) {
    return { erro: (e as Error).message || 'Falhou' };
  }
}

const NOME_TELA: Record<string, string> = {
  '/dash': 'Painel (dashboard)', '/kanban': 'Leads — funil (Kanban)', '/conversas': 'Conversas', '/clientes': 'Clientes',
  '/imoveis': 'Imóveis', '/agenda': 'Tarefas', '/roleta': 'Roleta', '/rebatidas': 'Rebatidas', '/followup': 'Follow-ups',
  '/templates': 'Templates', '/integracoes': 'Integrações', '/agente-ia': 'Agente de IA', '/relatorios': 'Relatórios',
  '/manual': 'Manual do CRM', '/configuracoes': 'Ajustes', '/equipe': 'Equipe', '/importacoes': 'Importar planilha',
  '/credito': 'Análise de crédito', '/avisos-corretor': 'Avisos por WhatsApp', '/site': 'Site de imóveis',
  '/links-uteis': 'Links úteis', '/treinamentos': 'Treinamentos',
};

/** Texto visível de um elemento, sem espaços repetidos e com limite de tamanho. */
function textoVisivel(el: Element | null, limite: number) {
  if (!el) return null;
  const t = ((el as HTMLElement).innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return t.length > limite ? t.slice(0, limite) + '…' : t;
}

const TELAS: Record<string, string> = {
  dash: '/dash', kanban: '/kanban', conversas: '/conversas', clientes: '/clientes', imoveis: '/imoveis', agenda: '/agenda',
  roleta: '/roleta', rebatidas: '/rebatidas', followup: '/followup', templates: '/templates', integracoes: '/integracoes',
  'agente-ia': '/agente-ia', relatorios: '/relatorios', manual: '/manual', configuracoes: '/configuracoes',
};

export async function executarFerramenta(nome: string, a: Args, ctx: Ctx): Promise<Record<string, unknown>> {
  const s = st();
  const ui = useAssistente.getState();
  switch (nome) {
    case 'ver_configuracao':
    case 'alterar_configuracao':
    case 'criar_item':
    case 'publicar_imovel_no_site': {
      if (s.me?.role !== 'dono' && s.me?.role !== 'gerente') return { erro: 'Só o dono ou o gerente podem ver e mudar as configurações do CRM.' };
      try {
        if (nome === 'ver_configuracao') return await verConfiguracao(String(a.area || ''));
        if (nome === 'alterar_configuracao') return await alterarConfiguracao(String(a.area || ''), a.alvoId ? String(a.alvoId) : undefined, a.mudancas_json);
        if (nome === 'criar_item') return await criarItem(String(a.area || ''), a.dados_json);
        return await publicarImovelNoSite(String(a.imovelId || ''), a.publicar !== false);
      } catch (e) {
        return { erro: (e as Error).message || 'Falhou' };
      }
    }
    case 'o_que_esta_na_tela': {
      const rota = window.location.pathname;
      const tela = NOME_TELA[rota] || rota;
      const out: Record<string, unknown> = { tela, endereco: rota + window.location.search };
      const aberto = s.leadId ? acharLead(s.leadId) : undefined;
      if (aberto) {
        out.leadAberto = { ...resumoLead(aberto), telefone: aberto.tel, aba: s.leadTab === 'chat' ? 'Chat WhatsApp' : s.leadTab };
        if (s.leadTab === 'chat') {
          const msgs = await apiFetch<RemoteMensagem[]>('/api/mensagens/' + aberto.id + '?consulta=1', s.token).catch(() => [] as RemoteMensagem[]);
          out.conversaNaTela = msgs.slice(-10).map(m => ({ quem: m.direcao === 'in' ? 'cliente' : m.canal === 'ia' ? 'agente de IA' : 'equipe', quando: dataBr(m.enviadoEm), texto: m.texto || (m.anexoTipo ? '[' + m.anexoTipo + ']' : '') }));
        }
      }
      // Conversas: a conversa selecionada na lista
      if (rota === '/conversas' && s.convId && !aberto) {
        const l = acharLead(s.convId);
        if (l) out.conversaSelecionada = resumoLead(l);
      }
      // o que está escrito na página (números, títulos, listas) — por trás da ficha, se ela estiver aberta
      out.textoDaTela = textoVisivel(document.querySelector('main.app-main'), aberto ? 1500 : 3500);
      return out;
    }
    case 'buscar_leads': {
      await garantirDados();
      const agora = Date.now();
      let lista = st().leads.slice();
      if (a.texto) lista = lista.filter(l => [l.nome, l.tel, l.email, l.imovel, l.campanha].some(c => tem(c, String(a.texto))));
      if (a.etapa) lista = lista.filter(l => tem(etapaDe(l), String(a.etapa)));
      if (a.etiqueta) lista = lista.filter(l => etiquetasDe(l).some(t => tem(t, String(a.etiqueta))));
      if (a.corretor) lista = lista.filter(l => tem(l.corretor, String(a.corretor)));
      if (a.canal) lista = lista.filter(l => tem(l.canal, String(a.canal)));
      if (a.criadosNosUltimosDias) {
        const d = Number(a.criadosNosUltimosDias);
        const desde = d <= 1 ? inicioDeHoje() : agora - d * 86400000;
        lista = lista.filter(l => l.criadoEm && new Date(l.criadoEm).getTime() >= desde);
      }
      if (a.paradosHaDias) lista = lista.filter(l => l.dias >= Number(a.paradosHaDias));
      lista.sort((x, y) => (y.criadoEm || '').localeCompare(x.criadoEm || ''));
      const limite = Math.min(Number(a.limite) || 10, 30);
      return { total: lista.length, leads: lista.slice(0, limite).map(resumoLead), observacao: lista.length > limite ? `Mostrando ${limite} de ${lista.length}.` : undefined };
    }
    case 'detalhes_lead': {
      await garantirDados();
      const l = acharLead(a.leadId);
      if (!l) return { erro: 'Lead não encontrado (ou o usuário não tem acesso a ele).' };
      const msgs = await apiFetch<RemoteMensagem[]>('/api/mensagens/' + l.id + '?consulta=1', s.token).catch(() => [] as RemoteMensagem[]);
      if (!s.tarefas.length) await s.fetchTarefas();
      const tarefas = st().tarefas.filter(t => t.leadId === l.id && !t.concluida);
      return {
        ...resumoLead(l), telefone: l.tel, email: l.email || null, valor: l.valor || null, motivoDescarte: l.motivo || null,
        resumoAgenteIa: l.iaResumo || null,
        ultimasMensagens: msgs.slice(-12).map(m => ({ quem: m.direcao === 'in' ? 'cliente' : m.canal === 'ia' ? 'agente de IA' : 'equipe', quando: dataBr(m.enviadoEm), texto: m.texto || (m.anexoTipo ? '[' + m.anexoTipo + ']' : '') })),
        tarefasAbertas: tarefas.map(t => ({ titulo: t.titulo, vence: dataBr(t.venceEm) })),
      };
    }
    case 'resumo_painel': {
      await garantirDados();
      const p = String(a.periodo || '7dias');
      const dias = p === 'hoje' ? 1 : p === '30dias' ? 30 : p === 'tudo' ? 100000 : 7;
      const desde = p === 'hoje' ? inicioDeHoje() : Date.now() - dias * 86400000;
      const todos = st().leads;
      const novos = todos.filter(l => l.criadoEm && new Date(l.criadoEm).getTime() >= desde);
      const contar = (arr: Lead[], f: (l: Lead) => string) => Object.entries(arr.reduce<Record<string, number>>((acc, l) => { const k = f(l) || '—'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 10);
      return {
        periodo: p, leadsNovos: novos.length, totalNoFunil: todos.length,
        novosPorCanal: contar(novos, l => l.canal), novosPorCampanha: contar(novos, l => l.campanha), novosPorCorretor: contar(novos, l => l.corretor),
        funilAgoraPorEtapa: contar(todos, etapaDe),
      };
    }
    case 'listar_tarefas': {
      await s.fetchTarefas();
      const q = String(a.quais || 'abertas');
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const ini = new Date(hoje + 'T00:00:00-03:00').getTime();
      const fim = q === 'semana' ? ini + 7 * 86400000 : ini + 86400000;
      let lista: RemoteTarefa[] = st().tarefas.filter(t => !t.concluida);
      if (q === 'atrasadas') lista = lista.filter(t => new Date(t.venceEm).getTime() < Date.now());
      if (q === 'hoje' || q === 'semana') lista = lista.filter(t => { const v = new Date(t.venceEm).getTime(); return v >= ini && v < fim; });
      lista.sort((x, y) => x.venceEm.localeCompare(y.venceEm));
      return { total: lista.length, tarefas: lista.slice(0, 20).map(t => ({ titulo: t.titulo, vence: dataBr(t.venceEm), lead: t.leadNome, corretor: t.corretorNome })) };
    }
    case 'abrir_tela': {
      const rota = TELAS[String(a.tela)];
      if (!rota) return { erro: 'Tela desconhecida' };
      ctx.navegar(rota);
      return { feito: true };
    }
    case 'abrir_lead': {
      await garantirDados();
      const l = acharLead(a.leadId);
      if (!l) return { erro: 'Lead não encontrado.' };
      const aba = a.aba === 'chat' || a.aba === 'historico' ? a.aba : 'detalhes';
      s.openLead(l.id, aba);
      return { feito: true, lead: l.nome };
    }
    case 'criar_tarefa': {
      const quando = new Date(String(a.quando || ''));
      if (isNaN(quando.getTime())) return { erro: 'Data/hora inválida. Pergunte ao usuário quando.' };
      const l = a.leadId ? acharLead(a.leadId) : undefined;
      if (a.leadId && !l) return { erro: 'Lead não encontrado.' };
      const titulo = String(a.titulo || '').trim();
      if (!titulo) return { erro: 'Falta o título da tarefa.' };
      return preparar({ tipo: 'tarefa', titulo, quando: quando.toISOString(), leadId: l?.id, descricao: a.descricao ? String(a.descricao) : undefined, resumo: `Tarefa "${titulo}" para ${dataBr(quando.toISOString())}${l ? ' — lead ' + l.nome : ''}` });
    }
    case 'mover_lead': {
      await garantirDados();
      const l = acharLead(a.leadId);
      if (!l) return { erro: 'Lead não encontrado.' };
      const col = acharEtapa(String(a.etapa || ''));
      if (!col) return { erro: 'Etapa não encontrada. As etapas são: ' + st().colunasRemotas.map(c => c.titulo).join(', ') };
      if (col.id === l.colunaId) return { erro: `${l.nome} já está em ${col.titulo}.` };
      return preparar({ tipo: 'mover', leadId: l.id, colunaId: col.id, resumo: `Mover ${l.nome} de "${etapaDe(l)}" para "${col.titulo}"` });
    }
    case 'enviar_mensagem': {
      await garantirDados();
      const l = acharLead(a.leadId);
      if (!l) return { erro: 'Lead não encontrado.' };
      const texto = String(a.texto || '').trim();
      if (!texto) return { erro: 'Mensagem vazia.' };
      return preparar({ tipo: 'mensagem', leadId: l.id, texto, resumo: `WhatsApp para ${l.nome}: "${texto}"` });
    }
    case 'confirmar_acao': return executarPendente();
    case 'cancelar_acao': {
      const tinha = !!ui.pendente;
      ui.set({ pendente: null });
      return { feito: tinha, resumo: tinha ? 'Ação cancelada.' : 'Não havia nada pendente.' };
    }
    case 'lembrar': {
      const texto = String(a.texto || '').trim();
      if (!texto) return { erro: 'Nada pra lembrar.' };
      const r = await apiFetch<{ id: string }>('/api/assistente/memorias', s.token, { method: 'POST', body: JSON.stringify({ texto }) });
      return { feito: true, id: r.id };
    }
    case 'recordar': {
      const q = String(a.consulta || '').trim();
      const r = await apiFetch<{ id: string; texto: string; criadoEm: string }[]>('/api/assistente/memorias' + (q ? '?q=' + encodeURIComponent(q) : ''), s.token);
      return { anotacoes: r.map(m => ({ id: m.id, texto: m.texto, quando: dataBr(m.criadoEm) })) };
    }
    case 'esquecer': {
      await apiFetch('/api/assistente/memorias/' + encodeURIComponent(String(a.id || '')), s.token, { method: 'DELETE' });
      return { feito: true };
    }
    case 'mostrar_painel': {
      ui.abrirPainel(String(a.titulo || 'Informação'), String(a.conteudo || ''));
      return { feito: true };
    }
    case 'fechar_janela': {
      const fechadas: string[] = [];
      if (s.leadId) { const l = acharLead(s.leadId); s.closeLead(); fechadas.push('ficha do lead' + (l ? ' ' + l.nome : '')); }
      if (s.importOpen) { s.setImportOpen(false); fechadas.push('importar'); }
      if (s.newLeadOpen) { useAppStore.setState({ newLeadOpen: false }); fechadas.push('novo lead'); }
      if (s.confirm) { s.closeConfirm(); fechadas.push('confirmação'); }
      return fechadas.length ? { feito: true, fechou: fechadas } : { feito: false, resumo: 'Não havia nenhuma janela aberta.' };
    }
    case 'fechar_paineis': {
      ui.set({ paineis: [] });
      return { feito: true };
    }
    default:
      return { erro: 'Ferramenta desconhecida: ' + nome };
  }
}

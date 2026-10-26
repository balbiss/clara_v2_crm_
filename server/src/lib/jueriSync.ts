import { and, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, contacts, lifecycleEvents, notifications, pedidos, pipelineCards, pipelineStages, pipelines, resellerPhones, salesTeamMemberships, salesTeams, users } from '../db/schema.js';
import { ACTIVE_STATUSES, INACTIVE_STATUSES, STATUS_OVERRIDE_PERMANENTE, createContact, updateContact, type Contact } from './contacts.js';
import { CUTOFF_LEGADO, QUANTIDADE_EFETIVA_SQL, QUANTIDADE_SENTINELA_LEGADO, STATUS_ABERTO, STATUS_BAIXADO, STATUS_CANCELADO, STATUS_PERDIDO, pedidoOpenNow, hojeSP } from './pedidos.js';

// JueriSyncService + JueriApiService da v1, portados 1:1 (mesma regra de carteira):
//  • revendedora com > min_pecas_ativa (25) peças abertas vira Ativa; inativa reativa; Resgate/
//    Negativado/Descadastrada/desconsiderada nunca mudam sozinhas
//  • quem estava ativa e não tem mais maleta acima do limiar → Sem Maleta (o marco "churn" é do fim do mês)
//  • pedido novo de quem já está ativa reinicia o ciclo (1º dia)
//  • Caução/Colaborador nunca entram; Atacado entra com status 'atacado' (funil Atacado)
//  • líderes (fk_tipo_revendedor_id = 1) viram Times de vendas; responsável pelo "ID do gerente
//    no Jueri" de cada usuário (só quando a revendedora ainda não tem responsável)
// Credenciais: JUERI_API_TOKEN e JUERI_CLIENTE_SISTEMA (env); JUERI_API_URL opcional.
/* eslint-disable @typescript-eslint/no-explicit-any */

const NIVEIS_EXCLUIR = ['Caução', 'Colaborador'];
const NIVEL_ATACADO = 'Atacado';
const STATUS_LABEL: Record<string, number> = { Aberto: STATUS_ABERTO, Baixado: STATUS_BAIXADO, Cancelado: STATUS_CANCELADO, Perdido: STATUS_PERDIDO };
const PAUSA_MS = 300;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const jueriConfigurado = () => !!(process.env.JUERI_API_TOKEN && process.env.JUERI_CLIENTE_SISTEMA);

// --- cliente da API -------------------------------------------------------------------------
async function jueri(path: string, params: Record<string, any> = {}): Promise<any> {
  const base = (process.env.JUERI_API_URL || 'https://jueri.com.br/sis').replace(/\/$/, '');
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)])).toString();
  const url = `${base}/api/v1/${process.env.JUERI_CLIENTE_SISTEMA}${path}${qs ? `?${qs}` : ''}`;
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.JUERI_API_TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429 && tentativa < 3) { await sleep(5000 * (tentativa + 1)); continue } // limite do Jueri: espera e tenta de novo
    const txt = await r.text();
    const body = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw new Error(`Jueri API ${r.status}: ${body?.message || body?.error || r.statusText}`);
    return body;
  }
}
async function paginado(path: string) {
  const out: any[] = [];
  for (let page = 1; ; page++) {
    const res = await jueri(path, { page, per_page: 500 });
    const items = res?.data || [];
    if (!items.length) break;
    out.push(...items);
    if (!res.next_page_url) break;
  }
  return out;
}

// --- utilidades ------------------------------------------------------------------------------
const parseDate = (s: any): string | null => { if (!s) return null; const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s)); return m ? m[1] : null };
const formatarTelefone = (raw: any): string | null => { const d = String(raw ?? '').replace(/\D/g, ''); if (!d) return null; return `+${d.startsWith('55') ? d : `55${d}`}` };
function statusId(p: any): number {
  if ('status' in p) return STATUS_LABEL[p.status] ?? STATUS_ABERTO;
  return [1, 2, 3, 4].includes(Number(p.fk_status_pedido_id)) ? Number(p.fk_status_pedido_id) : STATUS_ABERTO;
}
const aberto = (p: any) => statusId(p) === STATUS_ABERTO;
/** Pedido.quantidade_efetiva_para (mesma regra do SQL em lib/pedidos). */
function qtdEfetiva(p: any) {
  const antes = Number(p.quantidade_antes_baixa) || 0;
  if (antes > 0) return antes;
  const criacao = parseDate(p.data_criacao), baixa = parseDate(p.data_baixa);
  if (baixa && criacao && criacao < CUTOFF_LEGADO) return QUANTIDADE_SENTINELA_LEGADO;
  return Number(p.quantidade) || 0;
}
const somaAbertas = (lista: any[]) => lista.filter(aberto).reduce((s, p) => s + qtdEfetiva(p), 0);
// início do ciclo = pedido aberto mais antigo com mais de min peças (critérios da Bel: "maleta com 1 peça
// esquecida" não conta); sem nenhum acima do limiar, o mais antigo aberto
const inicioCiclo = (lista: any[], min = 25) => { const abertos = lista.filter(aberto); const maletas = abertos.filter(p => qtdEfetiva(p) > min); const ds = (maletas.length ? maletas : abertos).map(p => p.data_criacao).filter(Boolean).map((d: string) => new Date(String(d).replace(' ', 'T'))).filter(d => !isNaN(+d)); return ds.length ? new Date(Math.min(...ds.map(Number))) : new Date() };

type Resultado = { criados: number; reativados: number; atualizados: number; sem_maleta: number; pedidos_sincronizados: number; erros: number };
const novoResultado = (): Resultado => ({ criados: 0, reativados: 0, atualizados: 0, sem_maleta: 0, pedidos_sincronizados: 0, erros: 0 });

export class JueriSync {
  private gerenteNome = new Map<string, string | null>();
  private gerenteUser = new Map<string, number>();
  constructor(private accountId: number, private minPecas: number) {}

  static async paraConta(accountId: number) {
    const [a] = await db.select({ min: accounts.minPecasAtiva }).from(accounts).where(eq(accounts.id, accountId));
    const s = new JueriSync(accountId, a?.min ?? 25);
    for (const u of await db.select({ id: users.id, g: users.jueriGerenteId }).from(users).where(and(eq(users.accountId, accountId), isNotNull(users.jueriGerenteId)))) if (u.g) s.gerenteUser.set(String(u.g), u.id);
    return s;
  }

  /** Sync completo: cadastro + histórico de pedidos (igual ao JueriSyncJob da v1). */
  async call(): Promise<Resultado> {
    const res = novoResultado();
    const cadastro = new Map((await paginado('/revendedor')).map(r => [String(r.id), r]));
    const operadores = [...cadastro].filter(([, r]) => Number(r.fk_tipo_revendedor_id) === 1).map(([id]) => id);
    const excluir = [...cadastro].filter(([, r]) => NIVEIS_EXCLUIR.includes(r.level_revendedor)).map(([id]) => id);
    const atacado = [...cadastro].filter(([, r]) => r.level_revendedor === NIVEL_ATACADO).map(([id]) => id);

    await this.timesDeVendas(cadastro, operadores);
    for (const id of atacado) await this.atacadoUm(id, cadastro.get(id), res);

    const fora = new Set([...operadores, ...excluir, ...atacado]);
    const porRevendedor = new Map<string, any[]>();
    for (const p of await paginado('/pedido')) {
      const rid = p.fk_revendedor_id == null ? '' : String(p.fk_revendedor_id);
      if (!rid || fora.has(rid)) continue;
      if (!porRevendedor.has(rid)) porRevendedor.set(rid, []);
      porRevendedor.get(rid)!.push(p);
    }
    const existentes = await this.existentes();
    const ativosAgora = [...porRevendedor].filter(([, l]) => somaAbertas(l) > this.minPecas).map(([id]) => id);

    // 1) pedidos + snapshot de quem já é revendedora (sem custo de API)
    for (const [id, lista] of porRevendedor) {
      const c = existentes.get(id); if (!c) continue;
      try { await this.persistirPedidos(c, lista, res); await this.snapshot(c.id) } catch (e) { console.error('[JueriSync] pedidos', c.id, (e as Error).message); res.erros++ }
    }
    // 2) transição de status de quem está acima do limiar agora (única etapa que chama find_revendedor)
    for (const [i, id] of ativosAgora.entries()) {
      if (i) await sleep(PAUSA_MS);
      try { await this.transicionar(id, porRevendedor.get(id)!, existentes.get(id) ?? null, res) } catch (e) { console.error('[JueriSync] revendedor', id, (e as Error).message); res.erros++ }
    }
    // 3) fez o acerto e não levou maleta nova → Sem Maleta
    await this.marcarSemMaleta(ativosAgora, res);
    // 4) cadastro de todas as existentes
    await this.atualizarCadastro(cadastro, existentes, res);
    return res;
  }

  /** Só cadastro (nome/telefone/endereço/nível) — rápido, roda mais vezes. */
  async syncCadastro() {
    const res = novoResultado();
    const cadastro = new Map((await paginado('/revendedor')).map(r => [String(r.id), r]));
    await this.atualizarCadastro(cadastro, await this.existentes(), res);
    return res;
  }

  /** Webhook pedido.created/updated/canceled: aplica só esse pedido, na hora. */
  async pedidoEvento(p: any) {
    const res = novoResultado();
    const id = p?.fk_revendedor_id == null ? '' : String(p.fk_revendedor_id);
    if (!id) return res;
    const [c] = await db.select().from(contacts).where(and(eq(contacts.accountId, this.accountId), eq(contacts.idJueri, id)));
    if (c) {
      const antes = c.pecasAbertasAtual;
      await this.persistirPedidos(c, [p], res);
      const atual = await this.snapshot(c.id);
      const acima = atual.pecas > this.minPecas;
      if (c.desconsiderado || STATUS_OVERRIDE_PERMANENTE.includes(c.status || '')) return res;
      if (acima && INACTIVE_STATUSES.includes(c.status || '')) await this.reativar(c, null, res);
      else if (!acima && ACTIVE_STATUSES.includes(c.status || '')) await this.semMaleta(c, antes, atual.pecas, res);
      else if (acima && ACTIVE_STATUSES.includes(c.status || '')) await this.reiniciarSeNovo(c, null);
      res.atualizados++;
      return res;
    }
    const r = await jueri(`/revendedor/${id}`);
    if (!r || Number(r.fk_tipo_revendedor_id) === 1 || NIVEIS_EXCLUIR.includes(r.level_revendedor)) return res;
    if (r.level_revendedor === NIVEL_ATACADO) { await this.atacadoUm(id, r, res); return res }
    if (!aberto(p) || qtdEfetiva(p) <= this.minPecas) return res;
    await this.criarRevendedora(id, r, [p], res);
    return res;
  }

  /** Webhook pedido.deleted (Unificar Pedidos): o pedido vira Cancelado e recalcula. */
  async pedidoExcluido(p: any) {
    const res = novoResultado();
    const [ped] = await db.select().from(pedidos).where(eq(pedidos.jueriPedidoId, String(p?.id ?? '')));
    if (!ped) return res;
    const [c] = await db.select().from(contacts).where(eq(contacts.id, ped.contactId));
    await db.update(pedidos).set({ statusId: STATUS_CANCELADO, dataCancelamento: hojeSP(), updatedAt: new Date() }).where(eq(pedidos.id, ped.id));
    const atual = await this.snapshot(c.id);
    if (!c.desconsiderado && !STATUS_OVERRIDE_PERMANENTE.includes(c.status || '') && atual.pecas <= this.minPecas && ACTIVE_STATUSES.includes(c.status || '')) await this.semMaleta(c, c.pecasAbertasAtual, atual.pecas, res);
    return res;
  }

  // --- etapas internas ------------------------------------------------------------------------
  private async existentes() {
    const rows = await db.select().from(contacts).where(and(eq(contacts.accountId, this.accountId), isNotNull(contacts.idJueri)));
    return new Map(rows.map(c => [String(c.idJueri), c]));
  }

  private async transicionar(id: string, lista: any[], c: Contact | null, res: Resultado) {
    if (!c) { const r = await jueri(`/revendedor/${id}`); await this.criarRevendedora(id, r, lista, res); return }
    if (c.desconsiderado || STATUS_OVERRIDE_PERMANENTE.includes(c.status || '')) { res.atualizados++; return }
    if (INACTIVE_STATUSES.includes(c.status || '')) {
      await this.reativar(c, inicioCiclo(lista, this.minPecas), res); return
    }
    await this.reiniciarSeNovo(c, inicioCiclo(lista, this.minPecas));
    res.atualizados++;
  }

  private async criarRevendedora(id: string, r: any, lista: any[], res: Resultado) {
    const attrs = await this.attrsDoCadastro(null, r);
    const c = await createContact({ accountId: this.accountId, idJueri: id, source: 'Jueri', ...attrs, status: 'revendedor_ativo', cycleStartedAt: inicioCiclo(lista, this.minPecas) } as any);
    await this.persistirPedidos(c, lista, res);
    for (const raw of [r.telefone_2, r.telefone_3]) {
      const n = formatarTelefone(raw); if (!n || n === c.phone) continue;
      await db.insert(resellerPhones).values({ contactId: c.id, phone: n }).onConflictDoNothing();
    }
    await this.snapshot(c.id);
    await this.marco(c.id, 'iniciada');
    await this.cardFunil(c.id, 'onboarding', 'Primeira Maleta');
    res.criados++;
  }

  private async reativar(c: Contact, inicio: Date | null, res: Resultado) {
    // critérios da Bel: Reativação = voltou a passar de min peças depois de um Churn (sem prazo mínimo)
    const [ultimo] = await db.select({ t: lifecycleEvents.eventType }).from(lifecycleEvents)
      .where(and(eq(lifecycleEvents.contactId, c.id), inArray(lifecycleEvents.eventType, ['iniciada', 'churn', 'reativacao'])))
      .orderBy(desc(lifecycleEvents.occurredAt)).limit(1);
    const marco = ultimo?.t === 'churn';
    await updateContact(c, { status: 'revendedor_ativo', ...(inicio ? { cycleStartedAt: inicio } : {}) });
    if (marco) await this.marco(c.id, 'reativacao');
    res.reativados++;
  }

  private async reiniciarSeNovo(c: Contact, inicio: Date | null) {
    // sem a lista do Jueri: maleta aberta mais antiga (> min peças), senão qualquer pedido aberto
    const novo = inicio ?? (await db.execute(sql`SELECT COALESCE(MIN(${pedidos.dataCriacao}) FILTER (WHERE ${QUANTIDADE_EFETIVA_SQL} > ${this.minPecas}), MIN(${pedidos.dataCriacao})) AS d FROM pedidos WHERE ${pedidos.contactId} = ${c.id} AND ${pedidos.statusId} = ${STATUS_ABERTO}`) as any)[0]?.d;
    if (!novo || !c.cycleStartedAt) return;
    const d = new Date(novo);
    // compara pelo DIA (o banco guarda só a data do pedido; a lista do Jueri vem com hora) — maleta nova é de outro dia
    if (d.toISOString().slice(0, 10) <= c.cycleStartedAt.toISOString().slice(0, 10)) return;
    await updateContact(c, { status: 'revendedor_ativo', cycleStartedAt: d });
    await this.marco(c.id, 'ciclo_reiniciado');
  }

  private async semMaleta(c: Contact, antes: number, depois: number, res: Resultado) {
    await updateContact(c, { status: 'sem_maleta' });
    // o marco Churn não é gravado aqui: só no fim do mês em que teve baixa (jobs/regua registrarChurns)
    void antes; void depois;
    res.sem_maleta++;
  }

  private async marcarSemMaleta(ativosAgora: string[], res: Resultado) {
    const conds = [eq(contacts.accountId, this.accountId), inArray(contacts.status, ACTIVE_STATUSES), isNotNull(contacts.idJueri)];
    if (ativosAgora.length) conds.push(notInArray(contacts.idJueri, ativosAgora));
    for (const c of await db.select().from(contacts).where(and(...conds))) {
      const antes = c.pecasAbertasAtual;
      const atual = await this.snapshot(c.id);
      await this.semMaleta(c, antes, atual.pecas, res);
    }
  }

  private async persistirPedidos(c: Contact, lista: any[], res: Resultado) {
    const rows = lista.filter(p => p?.id != null).map(p => ({
      jueriPedidoId: String(p.id), accountId: this.accountId, contactId: c.id,
      dataCriacao: parseDate(p.data_criacao), dataBaixa: parseDate(p.data_baixa), dataCancelamento: parseDate(p.data_cancelamento), dataAcerto: parseDate(p.data_acerto),
      statusId: statusId(p), quantidade: Number(p.quantidade) || 0, quantidadeAntesBaixa: p.quantidade_antes_baixa ? Number(p.quantidade_antes_baixa) : null,
      valorTotal: p.valor_total != null && p.valor_total !== '' ? String(p.valor_total) : null,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(pedidos).values(rows.slice(i, i + 500) as any).onConflictDoUpdate({
        target: pedidos.jueriPedidoId,
        set: { contactId: sql`excluded.contact_id`, dataCriacao: sql`excluded.data_criacao`, dataBaixa: sql`excluded.data_baixa`, dataCancelamento: sql`excluded.data_cancelamento`, dataAcerto: sql`excluded.data_acerto`, statusId: sql`excluded.status_id`, quantidade: sql`excluded.quantidade`, quantidadeAntesBaixa: sql`excluded.quantidade_antes_baixa`, valorTotal: sql`excluded.valor_total`, updatedAt: new Date() },
      });
    }
    res.pedidos_sincronizados += rows.length;
  }

  /** Snapshot pré-calculado: peças e pedidos abertos hoje. */
  private async snapshot(contactId: number) {
    const [r] = await db.select({ pecas: sql<number>`COALESCE(SUM(${QUANTIDADE_EFETIVA_SQL}), 0)::int`, n: sql<number>`COUNT(*)::int` }).from(pedidos).where(and(eq(pedidos.contactId, contactId), pedidoOpenNow()));
    await db.update(contacts).set({ pecasAbertasAtual: r.pecas, pedidosAbertosCount: r.n, snapshotCalculadoEm: new Date() }).where(eq(contacts.id, contactId));
    return { pecas: r.pecas, n: r.n };
  }

  private async marco(contactId: number, tipo: string) {
    if (tipo === 'iniciada') { const [ja] = await db.select({ id: lifecycleEvents.id }).from(lifecycleEvents).where(and(eq(lifecycleEvents.contactId, contactId), eq(lifecycleEvents.eventType, 'iniciada'))); if (ja) return }
    const [c] = await db.select({ p: contacts.pecasAbertasAtual }).from(contacts).where(eq(contacts.id, contactId));
    await db.insert(lifecycleEvents).values({ accountId: this.accountId, contactId, eventType: tipo, occurredAt: new Date(), metadata: { pecas_abertas: c?.p ?? 0 } });
  }

  private async cardFunil(contactId: number, slug: string, etapa?: string) {
    const [p] = await db.select().from(pipelines).where(and(eq(pipelines.accountId, this.accountId), eq(pipelines.slug, slug)));
    if (!p) return;
    const etapas = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id)).orderBy(pipelineStages.position);
    const st = etapa ? etapas.find(s => s.name === etapa) : etapas.find(s => s.kind === 'normal');
    if (!st) return; // funil da v2 sem a etapa da v1: não cria card (a equipe move pelo funil)
    await db.insert(pipelineCards).values({ pipelineId: p.id, pipelineStageId: st.id, contactId }).onConflictDoNothing();
  }

  private async atacadoUm(id: string, r: any, res: Resultado) {
    try {
      const [c] = await db.select().from(contacts).where(and(eq(contacts.accountId, this.accountId), eq(contacts.idJueri, id)));
      const attrs = await this.attrsDoCadastro(c ?? null, r);
      if (c) { await updateContact(c, { ...attrs, status: 'atacado' }); return }
      const novo = await createContact({ accountId: this.accountId, idJueri: id, source: 'Jueri', ...attrs, status: 'atacado' } as any);
      await this.cardFunil(novo.id, 'atacado');
      res.criados++;
    } catch (e) { console.error('[JueriSync] atacado', id, (e as Error).message); res.erros++ }
  }

  private async timesDeVendas(cadastro: Map<string, any>, operadores: string[]) {
    for (const id of operadores) {
      const nome = cadastro.get(id)?.nome || `Time ${id}`;
      const [t] = await db.insert(salesTeams).values({ accountId: this.accountId, jueriLiderId: id, nome }).onConflictDoUpdate({ target: [salesTeams.accountId, salesTeams.jueriLiderId], set: { nome, updatedAt: new Date() } }).returning();
      const user = this.gerenteUser.get(id);
      if (user) await db.insert(salesTeamMemberships).values({ salesTeamId: t.id, userId: user }).onConflictDoNothing();
    }
  }

  private async atualizarCadastro(cadastro: Map<string, any>, existentes: Map<string, Contact>, res: Resultado) {
    for (const [id, c] of existentes) {
      const r = cadastro.get(id); if (!r) continue;
      try { await updateContact(c, await this.attrsDoCadastro(c, r)) } catch (e) { console.error('[JueriSync] cadastro', c.id, (e as Error).message); res.erros++ }
    }
  }

  private async nomeGerente(id: string) {
    if (this.gerenteNome.has(id)) return this.gerenteNome.get(id) ?? null;
    let nome: string | null = null;
    try { nome = (await jueri(`/revendedor/${id}`))?.nome ?? null } catch { /* sem nome */ }
    this.gerenteNome.set(id, nome);
    return nome;
  }

  /** apply_revendedor_attrs da v1. */
  private async attrsDoCadastro(c: Contact | null, r: any) {
    const nome = String(r?.nome || '');
    const [primeiro, ...resto] = nome.split(' ');
    const gerente = r?.gerente ?? r?.fk_revendedor_gerente_id;
    const gid = gerente == null || gerente === '' ? null : String(gerente);
    const ca: Record<string, any> = { ...((c?.customAttributes as object) || {}) };
    const set = (k: string, v: any) => { if (v !== undefined && v !== null && v !== '') ca[k] = v };
    ca.origem = ca.origem || 'Sincronizado do Jueri';
    ca.id_jueri = c?.idJueri ?? (r?.id != null ? String(r.id) : ca.id_jueri);
    ca.gerente_jueri_id = gid;
    if (gid) set('gerente_jueri_nome', await this.nomeGerente(gid));
    if (r?.meta_mensal) ca.meta = `R$ ${Number(r.meta_mensal).toFixed(2).replace('.', ',')}`;
    set('rg', r?.rg); set('profissao', r?.profissao); set('razao_social', r?.razao_social); set('nome_fantasia', r?.nome_fantasia); set('cnpj', r?.cnpj);
    set('observacao_jueri', r?.observacao); set('observacao_interna_jueri', r?.observacao_interna); set('supervisor_nome', r?.supervisor_nome);
    set('data_inativacao_jueri', r?.data_inativacao); set('local_trabalho', r?.local); set('website_jueri', r?.website); set('referencia_nome', r?.referencia_nome);
    set('referencia_telefone', r?.referencia_celular || r?.referencia_telefone); set('status_cadastral_jueri', ({ 1: 'Ativo', 2: 'Inativo' } as any)[r?.fk_status_id]);
    set('data_criacao_jueri', r?.data_criacao); set('data_ultima_alteracao_jueri', r?.data_ultima_alteracao);
    const v: Record<string, any> = {
      firstName: primeiro || c?.firstName || null, lastName: resto.join(' ') || c?.lastName || null, name: nome || c?.name || null,
      email: r?.email || c?.email || null, cpf: r?.cpf || c?.cpf || null, birthDate: parseDate(r?.data_nascimento) || c?.birthDate || null,
      cep: r?.cep || c?.cep || null, street: r?.logradouro || c?.street || null, addressNumber: r?.numero != null && r.numero !== '' ? String(r.numero) : c?.addressNumber || null,
      addressComplement: r?.complemento || c?.addressComplement || null, neighborhood: r?.bairro || c?.neighborhood || null, city: r?.cidade || c?.city || null,
      state: r?.uf || c?.state || null, country: 'Brasil', jueriSyncedAt: new Date(), nivel: r?.level_revendedor || c?.nivel || null, customAttributes: ca,
    };
    // telefone do Jueri só substitui o salvo se esse contato ainda não conversou pelo WhatsApp (sem jid)
    const tel = formatarTelefone(r?.telefone_1);
    if (tel && (!c?.phone || !c?.jid)) v.phone = tel;
    // responsável pelo mapeamento "ID do gerente no Jueri" — nunca sobrescreve quem já tem dono
    const mapped = gid ? this.gerenteUser.get(gid) : undefined;
    if (mapped && !c?.userId) v.userId = mapped;
    return v;
  }
}

// --- execução (job + webhook) ------------------------------------------------------------------
let rodando = false;
export let ultimaSync: any = null;
export async function rodarSyncJueri(tipo: 'completo' | 'cadastro' = 'completo') {
  if (!jueriConfigurado() || rodando) return null;
  rodando = true;
  const inicio = Date.now();
  try {
    const contas = await db.select({ id: accounts.id }).from(accounts);
    const out: any = {};
    for (const a of contas) {
      const s = await JueriSync.paraConta(a.id);
      out[a.id] = tipo === 'cadastro' ? await s.syncCadastro() : await s.call();
    }
    ultimaSync = { tipo, fim: new Date().toISOString(), segundos: Math.round((Date.now() - inicio) / 1000), resultado: out };
    console.log('[JueriSync]', JSON.stringify(ultimaSync));
    return ultimaSync;
  } catch (e) {
    ultimaSync = { tipo, erro: (e as Error).message, fim: new Date().toISOString() };
    console.error('[JueriSync] falhou:', (e as Error).message);
    return ultimaSync;
  } finally { rodando = false }
}

/** Evento do webhook: aplica o pedido na hora; revendedor.created avisa a gerência. */
export async function aplicarEventoJueri(accountId: number, evento: string | null, payload: any) {
  if (!jueriConfigurado() || !evento) return;
  const s = await JueriSync.paraConta(accountId);
  if (evento === 'pedido.deleted') await s.pedidoExcluido(payload);
  else if (['pedido.created', 'pedido.updated', 'pedido.canceled'].includes(evento) && payload?.fk_revendedor_id != null) await s.pedidoEvento(payload);
  else if (evento === 'revendedor.created') {
    const r = payload?.revendedor && typeof payload.revendedor === 'object' ? payload.revendedor : payload;
    await db.insert(notifications).values({ accountId, audience: 'owner_level', title: 'Novo cadastro no Jueri', message: `${r?.nome || 'Revendedora sem nome'} — cadastro novo`, link: '/carteira' });
  }
}

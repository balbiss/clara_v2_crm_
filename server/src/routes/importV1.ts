import { Router } from 'express';
import postgres from 'postgres';
import { sql as v2 } from '../db/client.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

// Traz as revendedoras da v1 (em produção) pra v2, com a mesma carteira: usuários da equipe
// (mesmo e-mail e mesma senha), times de vendas e quem vê cada time, etiquetas, revendedoras com
// responsável, telefones extras, etiquetas e pedidos do Jueri. Campos personalizados e grupos da
// conta também vêm. Conversas/mensagens antigas NÃO vêm.
// A v1 é só LIDA (transação read only) por V1_DATABASE_URL. Pode rodar de novo: o de-para fica em
// v1_import_map, então o que já veio é atualizado em vez de duplicado.
export const importV1Router = Router();
/* eslint-disable @typescript-eslint/no-explicit-any */

let rodando = false;
let ultimo: any = null;

async function colunas(conn: postgres.Sql, tabela: string) {
  const r = await conn`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tabela}`;
  return new Map(r.map((x: any) => [x.column_name as string, x.data_type as string]));
}

async function importar() {
  const url = process.env.V1_DATABASE_URL;
  if (!url) throw new Error('V1_DATABASE_URL não configurada.');
  const v1 = postgres(url, { max: 1, idle_timeout: 20 });
  const rel: Record<string, number> = {};
  const conta = (k: string) => { rel[k] = (rel[k] || 0) + 1 };
  try {
    // tudo da v1 lido numa transação somente-leitura
    const dados = await v1.begin('read only', async (tx: any) => {
      const [acc] = await tx`SELECT * FROM accounts ORDER BY id LIMIT 1`;
      return {
        acc,
        users: await tx`SELECT * FROM users WHERE account_id = ${acc.id} ORDER BY id`,
        tags: await tx`SELECT * FROM tags WHERE account_id = ${acc.id}`,
        teams: await tx`SELECT * FROM sales_teams WHERE account_id = ${acc.id}`,
        members: await tx`SELECT m.* FROM sales_team_memberships m JOIN sales_teams t ON t.id = m.sales_team_id WHERE t.account_id = ${acc.id}`,
        contacts: await tx`SELECT * FROM contacts WHERE account_id = ${acc.id} ORDER BY id`,
        phones: await tx`SELECT p.* FROM reseller_phones p JOIN contacts c ON c.id = p.contact_id WHERE c.account_id = ${acc.id}`,
        ctags: await tx`SELECT ct.* FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id WHERE c.account_id = ${acc.id}`,
        pedidos: await tx`SELECT * FROM pedidos WHERE account_id = ${acc.id}`,
        grupos: await tx`SELECT * FROM contact_field_groups WHERE account_id = ${acc.id}`.catch(() => []),
      };
    });
    const [acc2] = await v2`SELECT * FROM accounts ORDER BY id LIMIT 1`;
    const A = Number(acc2.id);
    const mapa = new Map<string, Map<number, number>>();
    for (const r of await v2`SELECT table_name, old_id, new_id FROM v1_import_map`) {
      if (!mapa.has(r.table_name)) mapa.set(r.table_name, new Map());
      mapa.get(r.table_name)!.set(Number(r.old_id), Number(r.new_id));
    }
    const m = (t: string) => { if (!mapa.has(t)) mapa.set(t, new Map()); return mapa.get(t)! };
    const guardar = async (t: string, oldId: number, newId: number) => { m(t).set(oldId, newId); await v2`INSERT INTO v1_import_map (table_name, old_id, new_id) VALUES (${t}, ${oldId}, ${newId}) ON CONFLICT (table_name, old_id) DO UPDATE SET new_id = EXCLUDED.new_id` };

    /** Copia uma linha da v1 pra v2 usando só as colunas que existem nas duas; atualiza se já veio. */
    // SQL montado coluna a coluna pelo tipo REAL na v2: json/jsonb vai como texto ($n::text::jsonb,
    // o banco converte), data/hora como texto ISO, o resto como veio.
    const cols2 = new Map<string, Map<string, string>>();
    const copiar = async (tabela: string, row: any, troca: Record<string, any>, existenteId?: number | null) => {
      if (!cols2.has(tabela)) cols2.set(tabela, await colunas(v2, tabela));
      const cols = cols2.get(tabela)!;
      const nomes: string[] = [], exprs: string[] = [], params: any[] = [];
      for (const [k, v] of Object.entries({ ...row, ...troca })) {
        if (k === 'id' || !cols.has(k)) continue;
        const tipo = cols.get(k)!;
        const json = tipo === 'json' || tipo === 'jsonb';
        params.push(v === null || v === undefined ? null : json ? JSON.stringify(v) : v instanceof Date ? v.toISOString() : v);
        nomes.push(`"${k}"`);
        exprs.push(json ? `$${params.length}::text::${tipo}` : v instanceof Date ? `$${params.length}::text::${tipo === 'date' ? 'date' : 'timestamp'}` : `$${params.length}`);
      }
      if (existenteId) {
        await v2.unsafe(`UPDATE "${tabela}" SET ${nomes.map((n, i) => `${n} = ${exprs[i]}`).join(', ')} WHERE id = ${Number(existenteId)}`, params);
        return existenteId;
      }
      const [n] = await v2.unsafe(`INSERT INTO "${tabela}" (${nomes.join(', ')}) VALUES (${exprs.join(', ')}) RETURNING id`, params);
      return Number(n.id);
    };

    // 1) usuários (pelo e-mail; mesma senha da v1)
    for (const u of dados.users) {
      const ja = m('users').get(Number(u.id)) ?? Number((await v2`SELECT id FROM users WHERE lower(email) = lower(${u.email}) LIMIT 1`)[0]?.id || 0);
      if (ja && !m('users').has(Number(u.id))) { await guardar('users', Number(u.id), ja); conta('usuarios_ja_existiam'); continue }
      const id = await copiar('users', u, { account_id: A, round_robin_group_id: null, reset_password_token: null }, ja || null);
      await guardar('users', Number(u.id), id); conta(ja ? 'usuarios_atualizados' : 'usuarios_novos');
    }
    const U = (id: any) => (id == null ? null : m('users').get(Number(id)) ?? null);

    // 2) etiquetas (pelo nome)
    for (const t of dados.tags) {
      const ja = m('tags').get(Number(t.id)) ?? Number((await v2`SELECT id FROM tags WHERE account_id = ${A} AND lower(name) = lower(${t.name}) LIMIT 1`)[0]?.id || 0);
      const id = ja || await copiar('tags', t, { account_id: A });
      await guardar('tags', Number(t.id), id); conta(ja ? 'etiquetas_ja_existiam' : 'etiquetas_novas');
    }

    // 3) times de vendas (pelo líder do Jueri) + quem vê cada time
    for (const t of dados.teams) {
      const ja = m('sales_teams').get(Number(t.id)) ?? Number((await v2`SELECT id FROM sales_teams WHERE account_id = ${A} AND jueri_lider_id = ${t.jueri_lider_id} LIMIT 1`)[0]?.id || 0);
      const id = await copiar('sales_teams', t, { account_id: A }, ja || null);
      await guardar('sales_teams', Number(t.id), id); conta('times');
    }
    for (const mb of dados.members) {
      const team = m('sales_teams').get(Number(mb.sales_team_id)), user = U(mb.user_id);
      if (!team || !user) continue;
      await v2`INSERT INTO sales_team_memberships (sales_team_id, user_id, created_at, updated_at) VALUES (${team}, ${user}, now(), now()) ON CONFLICT DO NOTHING`;
      conta('membros_de_time');
    }

    // 4) revendedoras (mesmo responsável = mesma carteira)
    for (const c of dados.contacts) {
      let ja = m('contacts').get(Number(c.id)) ?? 0;
      if (!ja && c.id_jueri) ja = Number((await v2`SELECT id FROM contacts WHERE account_id = ${A} AND id_jueri = ${c.id_jueri} LIMIT 1`)[0]?.id || 0);
      if (!ja && c.jid) ja = Number((await v2`SELECT id FROM contacts WHERE account_id = ${A} AND jid = ${c.jid} LIMIT 1`)[0]?.id || 0);
      if (!ja && c.phone) ja = Number((await v2`SELECT id FROM contacts WHERE account_id = ${A} AND phone = ${c.phone} LIMIT 1`)[0]?.id || 0);
      const id = await copiar('contacts', c, { account_id: A, user_id: U(c.user_id) }, ja || null);
      await guardar('contacts', Number(c.id), id); conta(ja ? 'revendedoras_atualizadas' : 'revendedoras_novas');
    }
    const C = (id: any) => m('contacts').get(Number(id)) ?? null;

    // 5) telefones extras, etiquetas das revendedoras, pedidos do Jueri
    for (const p of dados.phones) {
      const cid = C(p.contact_id); if (!cid) continue;
      await v2`INSERT INTO reseller_phones (contact_id, phone, label, created_at, updated_at) VALUES (${cid}, ${p.phone}, ${p.label}, now(), now()) ON CONFLICT (contact_id, phone) DO UPDATE SET label = EXCLUDED.label`;
      conta('telefones_extras');
    }
    for (const ct of dados.ctags) {
      const cid = C(ct.contact_id), tid = m('tags').get(Number(ct.tag_id)); if (!cid || !tid) continue;
      await v2`INSERT INTO contact_tags (contact_id, tag_id) VALUES (${cid}, ${tid}) ON CONFLICT DO NOTHING`;
      conta('etiquetas_das_revendedoras');
    }
    for (const p of dados.pedidos) {
      const cid = C(p.contact_id); if (!cid) continue;
      const ja = m('pedidos').get(Number(p.id)) ?? 0;
      const id = await copiar('pedidos', p, { account_id: A, contact_id: cid }, ja || null);
      await guardar('pedidos', Number(p.id), id); conta('pedidos');
    }

    // 6) conta: campos personalizados, mínimo de peças e grupos de campos (abas do card)
    const campos2: any[] = Array.isArray(acc2.contact_custom_fields) ? acc2.contact_custom_fields : [];
    const novos = (Array.isArray(dados.acc.contact_custom_fields) ? dados.acc.contact_custom_fields : []).filter((f: any) => !campos2.some(x => x.key === f.key));
    await v2`UPDATE accounts SET contact_custom_fields = ${JSON.stringify([...campos2, ...novos])}::text::jsonb, min_pecas_ativa = ${dados.acc.min_pecas_ativa ?? 25} WHERE id = ${A}`;
    rel.campos_personalizados_novos = novos.length;
    for (const g of dados.grupos) {
      const ja = Number((await v2`SELECT id FROM contact_field_groups WHERE account_id = ${A} AND lower(name) = lower(${g.name}) LIMIT 1`)[0]?.id || 0);
      if (ja) { conta('grupos_ja_existiam'); continue }
      await copiar('contact_field_groups', g, { account_id: A }); conta('grupos_novos');
    }

    // sequências dos ids continuam certas (inserimos sem id), nada a ajustar
    return rel;
  } finally {
    await v1.end({ timeout: 5 });
  }
}

importV1Router.post('/admin/importar_v1', requireAuth, requireOwner, async (_req, res) => {
  if (rodando) return res.status(409).json({ error: 'Importação já está rodando.' });
  rodando = true; ultimo = { status: 'rodando', inicio: new Date().toISOString() };
  res.status(202).json(ultimo);
  try { ultimo = { status: 'ok', fim: new Date().toISOString(), resultado: await importar() } }
  catch (e) { ultimo = { status: 'erro', mensagem: (e as Error).message }; console.error('Importação da v1 falhou:', e) }
  finally { rodando = false }
});
importV1Router.get('/admin/importar_v1', requireAuth, requireOwner, (_req, res) => res.json(ultimo || { status: 'nunca rodou' }));

// Cria no v2 os MESMOS campos do lead que a Clara usava no Kommo (57 campos, com tipo, opções de
// lista e aba — Principal / Dados / Financeiro / Estatísticas), lidos de scripts/kommo-campos.json
// (gerado do mapeamento de 20/10/2026). Os que já existem como campo padrão do v2 (Data de
// Agendamento, Meta, Atrasa…) só recebem o tipo/opções do Kommo. Idempotente: casa pelo nome.
//   npx tsx scripts/seed-kommo-campos.ts
import 'dotenv/config';
import fs from 'node:fs';
import { asc, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { accounts, contactFieldGroups } from '../src/db/schema.js';
import { ASSIGNABLE_FIELD_KEYS, BUILTIN_LABELS, type CustomField } from '../src/lib/customFields.js';

type K = { label: string; type: CustomField['type']; group: string; options?: string[]; api_only?: boolean };
const KOMMO: K[] = JSON.parse(fs.readFileSync(new URL('./kommo-campos.json', import.meta.url), 'utf8'));
// nomes do Kommo que correspondem a campos fixos do v2
const ALIAS: Record<string, string> = { atrasa: 'atraso' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const builtinByLabel = new Map(ASSIGNABLE_FIELD_KEYS.map(k => [norm(BUILTIN_LABELS[k]), k]));

const [account] = await db.select().from(accounts).orderBy(asc(accounts.id)).limit(1);
if (!account) throw new Error('Nenhuma conta no banco.');
let campos = (Array.isArray(account.contactCustomFields) ? account.contactCustomFields : []) as CustomField[];
const groups = await db.select().from(contactFieldGroups).where(eq(contactFieldGroups.accountId, account.id)).orderBy(asc(contactFieldGroups.position));
const groupKeys = new Map<string, string[]>(groups.map(g => [g.name.toLowerCase(), [...(g.fieldKeys as string[] || [])]]));
const ensureGroup = (name: string) => { if (!groupKeys.has(name.toLowerCase())) groupKeys.set(name.toLowerCase(), []); return groupKeys.get(name.toLowerCase())! };

let criados = 0, atualizados = 0;
for (const k of KOMMO) {
  const builtin = ALIAS[norm(k.label)] || builtinByLabel.get(norm(k.label));
  const conf = { type: k.type, options: k.options, api_only: k.api_only || undefined };
  if (builtin) {
    campos = [...campos.filter(f => !(f.builtin && f.key === builtin)), { ...(campos.find(f => f.builtin && f.key === builtin) || {}), ...conf, key: builtin, label: builtin, builtin: true }];
    atualizados++;
    continue;
  }
  const existing = campos.find(f => !f.builtin && norm(f.label) === norm(k.label));
  if (existing) { Object.assign(existing, conf); atualizados++; }
  else {
    const base = ('cf_' + norm(k.label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).slice(0, 40);
    let key = base;
    for (let n = 2; campos.some(f => f.key === key) || ASSIGNABLE_FIELD_KEYS.includes(key); n++) key = `${base}_${n}`;
    campos.push({ key, label: k.label, ...conf });
    criados++;
  }
  const key = (existing || campos[campos.length - 1]).key;
  // garante o campo na aba certa (e só nela)
  for (const [, keys] of groupKeys) { const i = keys.indexOf(key); if (i >= 0) keys.splice(i, 1) }
  ensureGroup(k.group).push(key);
}

await db.update(accounts).set({ contactCustomFields: campos, updatedAt: new Date() }).where(eq(accounts.id, account.id));
let pos = 0;
for (const [name, keys] of groupKeys) {
  const g = groups.find(x => x.name.toLowerCase() === name);
  if (g) await db.update(contactFieldGroups).set({ fieldKeys: keys, updatedAt: new Date() }).where(eq(contactFieldGroups.id, g.id));
  else await db.insert(contactFieldGroups).values({ accountId: account.id, name: name.charAt(0).toUpperCase() + name.slice(1), fieldKeys: keys, position: groups.length + pos++ });
}
console.log(`${criados} campos criados, ${atualizados} atualizados com tipo/opções do Kommo.`);
process.exit(0);

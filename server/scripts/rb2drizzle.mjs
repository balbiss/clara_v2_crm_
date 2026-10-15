// Converte db/schema.rb (Rails) em schema.ts do Drizzle, mantendo tabelas/colunas/índices idênticos.
import fs from 'node:fs';

const [, , input, output] = process.argv;
const src = fs.readFileSync(input, 'utf8');
const SKIP = /^(solid_|support_ticket)/;

const camel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const tables = [];
let cur = null;
for (const raw of src.split('\n')) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^create_table "([^"]+)"/))) { cur = { name: m[1], cols: [], idx: [] }; tables.push(cur); continue; }
  if (line === 'end' && cur) { cur = null; continue; }
  if (cur && (m = line.match(/^t\.index \[([^\]]+)\], name: "([^"]+)"(.*)$/))) {
    const cols = m[1].split(',').map(s => s.trim().replace(/"/g, ''));
    const rest = m[3];
    cur.idx.push({ cols, name: m[2], unique: /unique: true/.test(rest), where: (rest.match(/where: "(.*)"$/) || [])[1] });
    continue;
  }
  if (cur && (m = line.match(/^t\.(\w+) "([^"]+)"(.*)$/))) {
    cur.cols.push({ type: m[1], name: m[2], opts: m[3] });
  }
}
const fks = [];
for (const m of src.matchAll(/add_foreign_key "([^"]+)", "([^"]+)"(?:, column: "([^"]+)")?/g)) {
  const [, from, to, column] = m;
  fks.push({ from, to, column: column || to.replace(/xes$/, 'x').replace(/ies$/, 'y').replace(/s$/, '') + '_id' });
}

const imports = new Set(['pgTable', 'bigserial', 'index', 'uniqueIndex']);
function colDef(t, c) {
  const o = c.opts;
  let d;
  switch (c.type) {
    case 'bigint': imports.add('bigint'); d = `bigint('${c.name}', { mode: 'number' })`; break;
    case 'integer': imports.add('integer'); d = `integer('${c.name}')`; break;
    case 'string': imports.add('varchar'); { const l = o.match(/limit: (\d+)/); d = `varchar('${c.name}'${l ? `, { length: ${l[1]} }` : ''})`; } break;
    case 'text': imports.add('text'); d = `text('${c.name}')`; break;
    case 'boolean': imports.add('boolean'); d = `boolean('${c.name}')`; break;
    case 'datetime': imports.add('timestamp'); d = `timestamp('${c.name}', { precision: 6, mode: 'date' })`; break;
    case 'date': imports.add('date'); d = `date('${c.name}')`; break;
    case 'jsonb': imports.add('jsonb'); d = `jsonb('${c.name}')`; break;
    case 'float': imports.add('doublePrecision'); d = `doublePrecision('${c.name}')`; break;
    case 'decimal': imports.add('numeric'); { const p = o.match(/precision: (\d+), scale: (\d+)/); d = `numeric('${c.name}'${p ? `, { precision: ${p[1]}, scale: ${p[2]} }` : ''})`; } break;
    default: throw new Error(`tipo não mapeado: ${c.type} em ${t.name}.${c.name}`);
  }
  const def = o.match(/default: (\[\]|\{\}|"[^"]*"|-?[\d.]+|true|false)/);
  if (def) {
    const v = def[1];
    if (v === '[]' || v === '{}') d += `.default(${v})`;
    else d += `.default(${v.startsWith('"') ? `'${v.slice(1, -1)}'` : v})`;
  }
  if (/null: false/.test(o)) d += '.notNull()';
  // timestamps do Rails são preenchidos pela aplicação; aqui o banco garante o valor também
  if ((c.name === 'created_at' || c.name === 'updated_at') && c.type === 'datetime') d += '.defaultNow()';
  const fk = fks.find(f => f.from === t.name && f.column === c.name);
  if (fk) d += `.references((): AnyPgColumn => ${camel(fk.to)}.id)`;
  return `  ${camel(c.name)}: ${d},`;
}

let body = '';
const kept = tables.filter(t => !SKIP.test(t.name));
for (const t of kept) {
  body += `export const ${camel(t.name)} = pgTable('${t.name}', {\n  id: bigserial('id', { mode: 'number' }).primaryKey(),\n`;
  body += t.cols.map(c => colDef(t, c)).join('\n') + '\n';
  if (t.idx.length) {
    imports.add('sql');
    body += '}, (t) => [\n';
    for (const i of t.idx) {
      let s = `  ${i.unique ? 'uniqueIndex' : 'index'}('${i.name}').on(${i.cols.map(c => `t.${camel(c)}`).join(', ')})`;
      if (i.where) s += `.where(sql\`${i.where.replace(/\\"/g, '"')}\`)`;
      body += s + ',\n';
    }
    body += ']);\n\n';
  } else body += '});\n\n';
}
const hasSql = imports.delete('sql');
const header = `// GERADO a partir do db/schema.rb da Clara v1 (crm_clara_ferreira_pro) — mesmas tabelas e colunas,
// pra migração de dados ser cópia direta. Não renomear colunas: a v1 e a v2 precisam bater 1:1.
// Ficaram de fora: solid_queue/solid_cache/solid_cable (infra do Rails) e support_tickets (sem uso).
import { ${[...imports].join(', ')}, type AnyPgColumn } from 'drizzle-orm/pg-core';
${hasSql ? "import { sql } from 'drizzle-orm';\n" : ''}
`;
fs.writeFileSync(output, header + body);
console.log(`tabelas: ${kept.length}, fks: ${fks.length}`);

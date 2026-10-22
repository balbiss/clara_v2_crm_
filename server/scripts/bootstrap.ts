// Primeira subida em servidor novo (Coolify): cria a conta da Clara e UM usuário da diretoria
// a partir das variáveis BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD (só existem no Coolify,
// nunca no git) e carrega a estrutura do Kommo (funis, campos, robôs desligados).
// Roda a cada start, mas só faz alguma coisa quando falta: não mexe em conta/usuário que já existe.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { asc, eq } from 'drizzle-orm';
import { db, sql } from '../src/db/client.js';
import { accounts, pipelines, users } from '../src/db/schema.js';

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const senha = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';

let [account] = await db.select().from(accounts).orderBy(asc(accounts.id)).limit(1);
if (!account) {
  [account] = await db.insert(accounts).values({ name: 'Clara Ferreira Acessórios', jueriWebhookToken: crypto.randomBytes(18).toString('base64url') }).returning();
  console.log('Bootstrap: conta criada', account.id);
}

if (email && senha.length >= 10) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    await db.insert(users).values({ accountId: account.id, email, firstName: 'Diretoria', lastName: 'Clara', role: 2, encryptedPassword: await bcrypt.hash(senha, 11), jti: crypto.randomUUID(), status: 'active', department: 'corretor' });
    console.log('Bootstrap: usuário da diretoria criado', email);
  }
} else if (email) console.log('Bootstrap: BOOTSTRAP_ADMIN_PASSWORD precisa de 10+ caracteres — usuário não criado.');

const [algumFunil] = await db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.system, false)).limit(1);
await sql.end();

if (!algumFunil) {
  // os seeds são idempotentes; rodam como processos separados (cada um fecha a própria conexão)
  for (const s of ['seed-kommo-estrutura.ts', 'seed-kommo-campos.ts', 'seed-kommo-robos.ts']) {
    console.log('Bootstrap: rodando', s);
    execFileSync('npx', ['tsx', `scripts/${s}`], { stdio: 'inherit' });
  }
}
process.exit(0);

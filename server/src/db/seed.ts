// Dados de TESTE locais (os dados reais da v1 entram só no final, por cópia do banco).
// Cria 1 conta e 1 usuário de cada perfil, senha 123456.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, sql } from './client.js';
import { accounts, users } from './schema.js';

const [existing] = await db.select().from(accounts).limit(1);
const account = existing ?? (await db.insert(accounts).values({ name: 'Clara Ferreira Acessórios', jueriWebhookToken: crypto.randomBytes(16).toString('hex') }).returning())[0];

const hash = await bcrypt.hash('123456', 11);
const perfis = [
  ['diretoria@teste.local', 'Diana', 'Diretoria', 2],
  ['gerente@teste.local', 'Gabriela', 'Gerente', 1],
  ['consultor@teste.local', 'Carla', 'Consultora', 0],
  ['financeiro@teste.local', 'Fernanda', 'Financeiro', 3],
] as const;
for (const [email, firstName, lastName, role] of perfis) {
  await db.insert(users).values({ accountId: account.id, email, firstName, lastName, role, encryptedPassword: hash, jti: crypto.randomUUID(), status: 'active', department: 'corretor' })
    .onConflictDoNothing();
}
console.log('Seed ok — conta', account.id, '· logins: diretoria/gerente/consultor/financeiro @teste.local, senha 123456');
await sql.end();

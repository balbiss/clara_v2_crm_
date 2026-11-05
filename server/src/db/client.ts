import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL não configurada (veja server/.env)');

// DB_POOL_MAX: só pra teste local (banco embutido aceita 1 conexão por vez); produção usa o padrão (10)
export const sql = postgres(connectionString, process.env.DB_POOL_MAX ? { max: Number(process.env.DB_POOL_MAX) } : {});
export const db = drizzle(sql, { schema });

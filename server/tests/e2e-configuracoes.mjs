// Configurações (padrão Kommo): área de trabalho, chat e perfil — e o job que fecha conversa
// não lida. API no ar (3011) + seed.   npx tsx tests/e2e-configuracoes.mjs
import 'dotenv/config';
import postgres from 'postgres';

const API = process.env.API_URL || 'http://localhost:3011';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let ok = 0, fail = 0;
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`); };
const login = async email => (await fetch(`${API}/users/sign_in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password: '123456' } }) })).headers.get('authorization');
const tk = await login('diretoria@teste.local');
const tkCons = await login('consultor@teste.local');
const api = async (method, path, body, token = tk) => { const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: token }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };

const g = await api('GET', '/workspace_settings');
check('lê as configurações com padrões', g.data?.settings?.auto_close === 'never' || !!g.data?.settings?.auto_close);
const nomeAntes = g.data.name;
const p = await api('PUT', '/workspace_settings', { name: nomeAntes, settings: { date_format: 'aaaa-mm-dd', group_chats: 'admins', slow_reply_minutes: 15 } });
check('salva formato de data / grupos / respostas lentas', p.data?.settings?.date_format === 'aaaa-mm-dd' && p.data.settings.group_chats === 'admins' && p.data.settings.slow_reply_minutes === 15);
const bad = await api('PUT', '/workspace_settings', { settings: { auto_close: 'sempre' } });
check('valor inválido é recusado (422)', bad.status === 422);
const vazio = await api('PUT', '/workspace_settings', { name: '' });
check('nome vazio é recusado (422)', vazio.status === 422);
const cons = await api('PUT', '/workspace_settings', { settings: { group_chats: 'all' } }, tkCons);
check('consultor não altera configurações (403)', cons.status === 403);

const pr = await api('GET', '/profile');
const pr2 = await api('PUT', '/profile', { profile: { first_name: pr.data.first_name, last_name: pr.data.last_name, phone: '14999990000' } });
check('perfil salva telefone', pr2.data?.phone === '14999990000');
check('perfil recusa nome vazio', (await api('PUT', '/profile', { profile: { first_name: ' ' } })).status === 422);
await api('PUT', '/profile', { profile: { phone: pr.data.phone || '' } });

// fechar conversa automaticamente: conversa aberta, não lida, parada há 2h, regra "1h"
await api('PUT', '/workspace_settings', { settings: { auto_close: '1h' } });
const [conv] = await sql`SELECT id, status, unread_count, last_activity_at FROM conversations ORDER BY id LIMIT 1`;
await sql`UPDATE conversations SET status = 0, unread_count = 1, last_activity_at = (now() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = ${conv.id}`;
const { autoCloseConversations } = await import('../src/routes/settings.ts');
await autoCloseConversations();
const [depois] = await sql`SELECT status FROM conversations WHERE id = ${conv.id}`;
check('job fecha conversa não lida há mais de 1h', depois.status === 2);
await api('PUT', '/workspace_settings', { settings: { auto_close: 'never', date_format: 'dd/mm/aaaa', group_chats: 'all', slow_reply_minutes: 0 } });
await sql`UPDATE conversations SET status = ${conv.status}, unread_count = ${conv.unread_count}, last_activity_at = ${conv.last_activity_at} WHERE id = ${conv.id}`;

console.log(`\n${ok} ok, ${fail} falha(s)`);
await sql.end();
process.exit(fail ? 1 : 0);

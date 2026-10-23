// Início ("Meu dia") no navegador, contra a v2 de validação (sistema.clarajoias.com.br).
// Só lê os dados reais; pra testar "Concluir" cria uma tarefa de teste na Clínica Moreira (contato
// de teste da v2) e conclui ela. Login da diretoria via env ADMIN_EMAIL / ADMIN_PASSWORD.
import { chromium } from 'playwright-core'

const FRONT = process.env.FRONT || 'https://sistema.clarajoias.com.br'
const API = process.env.API || 'https://sistema-api.clarajoias.com.br'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
let ok = 0, fail = 0
const check = (n, c, extra = '') => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n, extra) }

const login = await fetch(API + '/users/sign_in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } }) })
const tok = login.headers.get('authorization')
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: tok }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) } }

console.log('API /inicio')
const { status, data: d } = await api('GET', '/inicio')
check('responde 200', status === 200, String(status))
check('carteira com ativas somando os status da régua', d.carteira.ativas === ['revendedor_ativo', 'terceiro_dia', 'decimo_dia', 'vigesimo_dia', 'agendado', 'reagendar', 'atrasada'].reduce((s, k) => s + (d.carteira[k] || 0), 0), `ativas=${d.carteira.ativas}`)
check('diretoria vê a equipe (ranking) e novidades', Array.isArray(d.ranking) && d.ranking.length > 0 && !!d.novidades, `${d.ranking?.length} pessoas`)
check('acertos dentro dos próximos 7 dias', d.acertos.every(a => a.data >= d.hoje), `${d.acertos.length} acertos`)
console.log('   ', JSON.stringify({ ativas: d.carteira.ativas, sem_maleta: d.carteira.sem_maleta, tarefas_hoje: d.tarefas.hoje, atrasadas: d.tarefas.atrasadas, esperando: d.esperando.total, acertos: d.acertos.length, aniversarios: d.aniversarios.length, sem_responsavel: d.sem_responsavel }))

// tarefa de teste pra Clínica Moreira, vencendo hoje
const busca = await api('GET', '/contacts?q=Clinica%20Moreira')
const lista = Array.isArray(busca.data) ? busca.data : busca.data?.contacts || []
const teste = lista.find(c => /Moreira/.test(c.name || ''))
const titulo = 'Teste do Início ' + Date.now().toString().slice(-5)
const venc = new Date(Date.now() + 60 * 60e3).toISOString()
const nova = teste ? await api('POST', '/tarefas', { tarefa: { contact_id: teste.id, titulo, tipo: 'manual_outro', vencimento_em: venc } }) : { status: 0 }
check('cria tarefa de teste pra hoje', nova.status === 201, String(nova.status))

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })
await page.goto(FRONT + '/login'); await page.fill('#email', process.env.ADMIN_EMAIL); await page.fill('#password', process.env.ADMIN_PASSWORD)
await page.getByRole('button', { name: 'Login', exact: true }).click(); await page.waitForURL('**/dashboard', { timeout: 60000 })

console.log('Tela')
await page.getByRole('region', { name: 'Tarefas de hoje' }).waitFor({ timeout: 30000 })
check('saudação com o nome', await page.getByRole('heading', { level: 1 }).innerText().then(t => /(Bom dia|Boa tarde|Boa noite)/.test(t)))
for (const b of ['Carteira', 'Tarefas de hoje', 'Esperando resposta', 'Acertos da semana', 'Aniversariantes da semana', 'Equipe', 'Novidades do Jueri hoje']) check(`bloco "${b}"`, await page.getByRole('region', { name: b }).isVisible())
const ativasTela = await page.getByRole('region', { name: 'Carteira' }).getByRole('button').first().innerText()
check('número de Ativas igual ao da API', ativasTela.replace(/\D/g, '').startsWith(String(d.carteira.ativas)), ativasTela.split('\n')[0])
if (d.tarefas.atrasadas) check('atrasadas separadas, com as 10 mais recentes e Ver todas', (await page.locator('[data-testid="tarefa-atrasada"]').count()) === Math.min(10, d.tarefas.atrasadas) && await page.getByRole('button', { name: 'Ver todas' }).isVisible())
check('ranking da equipe na tela', (await page.locator('[data-testid="ranking"]').count()) === d.ranking.length)
await page.screenshot({ path: OUT + '/inicio-prod.png', fullPage: true })

const tarefaLinha = page.locator('[data-testid="tarefa"]', { hasText: titulo })
check('tarefa de teste aparece em "Tarefas de hoje"', await tarefaLinha.isVisible())
await tarefaLinha.getByRole('button', { name: 'Concluir' }).click()
await tarefaLinha.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
check('"Concluir" tira a tarefa da lista', (await tarefaLinha.count()) === 0)
const depois = nova.data?.id ? await api('GET', `/tarefas?contact_id=${teste.id}`) : null
check('tarefa concluída no banco', !!depois?.data?.find?.(t => t.id === nova.data.id && t.status === 'concluida') || !(depois?.data || []).some(t => t.id === nova.data?.id && t.status === 'pendente'))

console.log('Busca e navegação')
await page.getByLabel('Buscar revendedora').fill('Moreira')
await page.getByRole('option').first().waitFor({ timeout: 10000 }).catch(() => {})
check('busca rápida mostra resultado', (await page.getByRole('option').count()) > 0)
await page.getByRole('option').first().click(); await page.waitForURL(/\/contatos\/\d+/, { timeout: 15000 }).catch(() => {})
check('resultado abre o cadastro', /\/contatos\/\d+/.test(page.url()))
await page.goto(FRONT + '/dashboard'); await page.getByRole('region', { name: 'Tarefas de hoje' }).waitFor()
if (d.esperando.lista.length) {
  await page.locator('[data-testid="esperando"]').first().click(); await page.waitForURL(/\/conversas\?abrir=\d+/, { timeout: 15000 }).catch(() => {})
  check('"Esperando resposta" abre a conversa', /abrir=\d+/.test(page.url()))
  await page.goto(FRONT + '/dashboard'); await page.getByRole('region', { name: 'Tarefas de hoje' }).waitFor()
}
await page.getByRole('region', { name: 'Carteira' }).getByRole('button').first().click(); await page.waitForURL('**/carteira', { timeout: 15000 }).catch(() => {})
check('número da carteira abre Minhas Revendedoras', page.url().endsWith('/carteira'))

console.log('Celular (390 px)')
await page.setViewportSize({ width: 390, height: 800 })
await page.goto(FRONT + '/dashboard'); await page.getByRole('region', { name: 'Tarefas de hoje' }).waitFor()
check('sem rolagem lateral no celular', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1)
await page.screenshot({ path: OUT + '/inicio-prod-cel.png', fullPage: true })

console.log(errors.length ? '\nErros no console:\n' + errors.join('\n') : '\nsem erros no console')
console.log(`${ok} ok, ${fail} falha(s)`)
await browser.close()
process.exit(fail ? 1 : 0)

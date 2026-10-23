// Chat da Equipe no navegador, contra a v2 de validação. Cria um usuário de TESTE temporário, abre
// dois navegadores (diretoria e teste) e conversa entre eles em tempo real: texto, Enter/Shift+Enter,
// foto e documento, não lidas e celular. No fim apaga o usuário de teste (e as mensagens dele).
// Login da diretoria via env ADMIN_EMAIL / ADMIN_PASSWORD.
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const FRONT = process.env.FRONT || 'https://sistema.clarajoias.com.br'
const API = process.env.API || 'https://sistema-api.clarajoias.com.br'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
let ok = 0, fail = 0
const check = (n, c, extra = '') => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n, extra) }

const signIn = async (email, password) => (await fetch(API + '/users/sign_in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password } }) })).headers.get('authorization')
const tokA = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: tokA }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) } }

const tag = Date.now().toString().slice(-6)
const teste = { email: `teste.chat.${tag}@clarajoias.com.br`, password: `Teste-${tag}-chat`, first_name: 'Teste', last_name: `Chat ${tag}`, role: 'consultor' }
const criado = await api('POST', '/agents', { agent: teste })
const testeId = criado.data?.id
check('cria usuário de teste temporário', criado.status === 201 || criado.status === 200, String(criado.status))

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const errors = []
const abrirSessao = async (email, password) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await page.goto(FRONT + '/login'); await page.fill('#email', email); await page.fill('#password', password)
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await page.waitForURL('**/dashboard', { timeout: 60000 })
  await page.goto(FRONT + '/chat-equipe'); await page.getByLabel('Buscar colega').waitFor({ timeout: 30000 })
  return page
}
try {
  const a = await abrirSessao(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
  const b = await abrirSessao(teste.email, teste.password)

  console.log('Lista e busca')
  check('lista de colegas', (await a.locator('[data-testid="colega"]').count()) > 1)
  await a.getByLabel('Buscar colega').fill(`Chat ${tag}`)
  check('busca acha o colega', (await a.locator('[data-testid="colega"]').count()) === 1)
  await a.locator('[data-testid="colega"]').first().click()
  check('abre a conversa vazia', await a.getByText('Nenhuma mensagem ainda').waitFor({ timeout: 10000 }).then(() => true, () => false))

  console.log('Mensagens em tempo real')
  const txt = `Oi teste ${tag}`
  await a.getByLabel('Mensagem para a equipe').fill(txt); await a.keyboard.press('Enter')
  await a.locator('[data-testid="msg-equipe"]', { hasText: txt }).waitFor({ timeout: 10000 })
  check('Enter envia a mensagem', await a.locator('[data-testid="msg-equipe"]', { hasText: txt }).isVisible())
  const linhaB = b.locator('[data-testid="colega"]', { hasText: 'Diretoria Clara' }).first()
  await linhaB.filter({ hasText: txt }).waitFor({ timeout: 20000 }).catch(() => {})
  check('colega recebe sem recarregar (não lida aparece)', (await linhaB.innerText()).includes(txt) && /\n1\s*$|\b1\b/.test(await linhaB.innerText()))
  await linhaB.click()
  await b.locator('[data-testid="msg-equipe"]', { hasText: txt }).waitFor({ timeout: 10000 })
  check('colega abre e lê a mensagem', await b.locator('[data-testid="msg-equipe"]', { hasText: txt }).isVisible())
  await b.getByLabel('Mensagem para a equipe').fill('linha 1'); await b.keyboard.press('Shift+Enter'); await b.keyboard.type('linha 2'); await b.keyboard.press('Enter')
  await a.locator('[data-testid="msg-equipe"]', { hasText: 'linha 2' }).waitFor({ timeout: 20000 }).catch(() => {})
  const bal = await a.locator('[data-testid="msg-equipe"]', { hasText: 'linha 2' }).innerText().catch(() => '(não chegou)')
  check('resposta chega na hora pra diretoria, com Shift+Enter quebrando linha', /linha 1\s*\n\s*linha 2/.test(bal), JSON.stringify(bal))

  console.log('Anexos')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  fs.writeFileSync(OUT + '/foto-teste.png', png); fs.writeFileSync(OUT + '/doc-teste.txt', 'documento de teste do chat')
  await a.locator('input[type="file"]').setInputFiles(OUT + '/foto-teste.png')
  await a.getByTitle('Enviar').click()
  await a.locator('[data-testid="msg-equipe"] img').first().waitFor({ timeout: 15000 }).catch(() => {})
  check('envia foto', (await a.locator('[data-testid="msg-equipe"] img').count()) >= 1)
  await a.getByTitle('Tirar anexo').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  await a.locator('input[type="file"]').setInputFiles(OUT + '/doc-teste.txt')
  await a.getByTitle('Tirar anexo').waitFor({ timeout: 5000 }).catch(() => {})
  await a.getByLabel('Mensagem para a equipe').fill('segue o documento'); await a.getByTitle('Enviar').click()
  await a.locator('[data-testid="msg-equipe"]', { hasText: 'doc-teste.txt' }).waitFor({ timeout: 15000 }).catch(() => {})
  const docOk = await a.locator('[data-testid="msg-equipe"]', { hasText: 'doc-teste.txt' }).isVisible()
  if (!docOk) {
    const srv = await api('GET', `/internal_messages?with=${testeId}`)
    console.log('    servidor:', JSON.stringify((srv.data || []).map(m => [m.text, m.attachment_name])), '| tela:', JSON.stringify(await a.locator('[data-testid="msg-equipe"]').allInnerTexts()), '| campo:', await a.getByLabel('Mensagem para a equipe').inputValue(), '| anexo pendente:', await a.getByTitle('Tirar anexo').count())
  }
  check('envia documento com texto', docOk)
  await b.locator('[data-testid="msg-equipe"] img').first().waitFor({ timeout: 20000 }).catch(() => {})
  check('colega recebe foto e documento', (await b.locator('[data-testid="msg-equipe"] img').count()) >= 1 && await b.locator('[data-testid="msg-equipe"]', { hasText: 'doc-teste.txt' }).isVisible())
  await a.screenshot({ path: OUT + '/chat-equipe.png' })

  console.log('Celular (390 px)')
  await b.setViewportSize({ width: 390, height: 800 }); await b.goto(FRONT + '/chat-equipe'); await b.getByLabel('Buscar colega').waitFor()
  check('celular mostra a lista', await b.getByLabel('Buscar colega').isVisible() && (await b.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1)
  await b.locator('[data-testid="colega"]', { hasText: 'Diretoria Clara' }).first().click()
  check('celular abre a conversa com botão Voltar', await b.getByTitle('Voltar').isVisible() && await b.getByLabel('Mensagem para a equipe').isVisible())
  await b.getByTitle('Voltar').click()
  check('Voltar volta pra lista', await b.getByLabel('Buscar colega').isVisible())
  await b.screenshot({ path: OUT + '/chat-equipe-cel.png' })
} finally {
  if (testeId) { const d = await api('DELETE', `/agents/${testeId}`); check('apaga o usuário de teste (com as mensagens)', d.status === 204 || d.status === 200, String(d.status)) }
  console.log(errors.length ? '\nErros:\n' + errors.join('\n') : '\nsem erros no console')
  console.log(`${ok} ok, ${fail} falha(s)`)
  await browser.close()
}
process.exit(fail ? 1 : 0)

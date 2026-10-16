// Fase A (Configurações) pelo navegador de verdade. Servidor (3011) e front (5183) no ar + seed.
// Rodar de uma pasta que tenha playwright-core instalado. Ajuste CHROME se necessário.
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/404|pipelines|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })
let ok = 0, fail = 0
const check = (n, c) => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n) }
const stamp = Date.now().toString().slice(-5)

await page.goto('http://localhost:5183/login')
await page.fill('#email', 'diretoria@teste.local'); await page.fill('#password', '123456')
await page.click('button[type=submit]'); await page.waitForURL('**/dashboard')

const go = async (path, text) => { await page.goto('http://localhost:5183' + path); await page.waitForSelector(`text=${text}`, { timeout: 10000 }); await page.waitForTimeout(400) }

console.log('Etiquetas')
await go('/settings/tags', 'Etiquetas')
await page.getByRole('button', { name: /Nova etiqueta/ }).click()
await page.fill('input[placeholder^="Ex: VIP"]', 'Teste' + stamp)
await page.getByRole('button', { name: 'Salvar' }).click()
await page.waitForSelector(`text=Teste${stamp}`)
check('cria etiqueta e aparece na lista', true)
await page.screenshot({ path: OUT + '/A-1-tags.png' })

console.log('Modelos de mensagem')
await go('/settings/modelos-mensagem', 'Modelos de mensagem')
await page.getByRole('button', { name: /Novo modelo/ }).click()
await page.fill('input[placeholder^="Ex: Boas-vindas"]', 'Modelo' + stamp)
await page.fill('textarea', 'Olá! Tudo bem com a sua maleta?')
await page.getByRole('button', { name: 'Salvar' }).click()
await page.waitForSelector(`text=Modelo${stamp}`)
check('cria modelo', true)

console.log('Campos do contato')
await go('/settings/campos-contato', 'Campos do contato')
await page.fill('input[placeholder="Nome do novo campo"]', 'Mais vende ' + stamp)
await page.getByRole('button', { name: /Criar campo/ }).click()
await page.waitForSelector(`text=Mais vende ${stamp}`)
check('cria campo personalizado', true)
await page.screenshot({ path: OUT + '/A-2-campos.png' })

console.log('Agentes')
await go('/agentes', 'Agentes')
await page.getByRole('button', { name: /Novo agente/ }).click()
await page.waitForSelector('text=Dados do agente')
await page.fill('input[placeholder="Ex.: João"]', 'Paula'); await page.fill('input[placeholder="Ex.: Silva"]', 'Teste' + stamp)
await page.fill('input[type=email]', `paula${stamp}@teste.local`); await page.fill('input[placeholder^="Mínimo"]', '123456')
await page.getByRole('button', { name: 'Criar agente' }).click()
await page.waitForSelector(`text=Teste${stamp}`)
check('cria agente e volta pra lista', true)
await page.screenshot({ path: OUT + '/A-3-agentes.png' })

console.log('Times de vendas / Conta / Caixas')
await go('/settings/times-de-vendas', 'Times de vendas'); check('times de vendas abre', true)
await go('/settings/account', 'Segurança'); check('conta abre', true)
await page.screenshot({ path: OUT + '/A-4-conta.png' })
await go('/settings/inboxes', 'Caixas de entrada')
await page.getByRole('button', { name: /Adicionar caixa/ }).click()
await page.waitForSelector('text=Selecione o canal')
await page.getByText('Atenda suas revendedoras').click()
await page.fill('input[placeholder^="Ex.: Comercial"]', 'Caixa ' + stamp)
await page.fill('input[placeholder^="Com DDD"]', '55119' + stamp + '123')
await page.getByRole('button', { name: /Criar caixa do WhatsApp/ }).click()
await page.waitForSelector('text=Quem tem acesso a esta caixa')
await page.getByRole('button', { name: 'Continuar' }).click()
await page.waitForSelector('text=Sua caixa está pronta')
await page.screenshot({ path: OUT + '/A-5-nova-caixa.png' })
await page.getByRole('button', { name: /Mais configurações/ }).click()
await page.waitForSelector('text=Configurações da caixa')
check('assistente cria caixa e abre as configurações', true)
await page.getByRole('button', { name: 'Atualizar' }).click()
await page.waitForSelector('text=Configurações salvas')
check('salva configurações da caixa', true)
await page.screenshot({ path: OUT + '/A-6-caixa.png' })

console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum')
console.log(`${ok} ok, ${fail} falha(s)`)
await browser.close()
process.exit(fail || errors.length ? 1 : 0)

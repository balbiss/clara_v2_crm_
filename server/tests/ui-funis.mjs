// Funis no visual do Kommo pelo navegador de verdade (servidor 3011 + front 5183 no ar, seed +
// scripts/seed-kommo-estrutura.ts). Rodar de uma pasta com playwright-core (ex.: NODE_PATH).
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })

await page.goto('http://localhost:5183/login')
await page.fill('#email', 'diretoria@teste.local'); await page.fill('#password', '123456')
await page.click('button[type=submit]'); await page.waitForURL('**/dashboard')

await page.goto('http://localhost:5183/pipelines/varejo'); await page.waitForSelector('text=Identificar lead', { timeout: 15000 }); await page.waitForTimeout(800)
await page.screenshot({ path: OUT + '/funil-varejo.png' })
await page.getByRole('button', { name: 'Novo lead' }).click()
await page.fill('input[placeholder^="Nome"]', 'Maria Teste UI')
await page.fill('input[placeholder^="55"]', '5514988887777')
await page.fill('input[placeholder="0"]', '480')
await page.getByRole('button', { name: 'Salvar' }).click()
await page.waitForSelector('text=Maria Teste UI'); await page.waitForTimeout(500)
await page.screenshot({ path: OUT + '/funil-varejo-lead.png' })

await page.goto('http://localhost:5183/pipelines/onboarding/automatize'); await page.waitForSelector('text=Adicionar gatilho', { timeout: 15000 }); await page.waitForTimeout(800)
await page.screenshot({ path: OUT + '/automatize-onboarding.png' })
await page.getByText('+ Adicionar gatilho').first().click(); await page.waitForTimeout(400)
await page.screenshot({ path: OUT + '/automatize-form.png' })

console.log(errors.length ? errors.join('\n') : 'sem erros no console')
await browser.close()

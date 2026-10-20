// Calendário no visual do Kommo, botão por botão (servidor 3011 + front 5183 + seed).
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })
let ok = 0, fail = 0
const check = (n, c) => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n) }
const shot = n => page.screenshot({ path: `${OUT}/cal-${n}.png` })

await page.goto('http://localhost:5183/login')
await page.fill('#email', 'diretoria@teste.local'); await page.fill('#password', '123456')
await page.click('button[type=submit]'); await page.waitForURL('**/dashboard')
await page.goto('http://localhost:5183/calendario'); await page.waitForSelector('text=GMT-3', { timeout: 15000 }); await page.waitForTimeout(800)

console.log('Semana')
check('cabeçalho GMT-3 + Dia todo', await page.getByText('Dia todo').isVisible())
check('botão Novo evento', await page.getByRole('button', { name: 'Novo evento' }).isVisible())
await shot('1-semana')
const label1 = await page.locator('button[title="Ir para hoje"]').textContent()
await page.locator('button[title="Próximo"]').click(); await page.waitForTimeout(400)
const label2 = await page.locator('button[title="Ir para hoje"]').textContent()
check(`seta › avança a semana (${label1} → ${label2})`, label1 !== label2)
await page.locator('button[title="Anterior"]').click(); await page.waitForTimeout(400)
check('seta ‹ volta', (await page.locator('button[title="Ir para hoje"]').textContent()) === label1)

console.log('Novo evento')
const titulo = 'Acerto teste ' + Date.now().toString().slice(-4)
await page.getByRole('button', { name: 'Novo evento' }).click()
await page.locator('input[placeholder="Ex.: Acerto da maleta"]').fill(titulo)
await page.locator('input[placeholder="Buscar por nome ou telefone"]').fill('Carolina'); await page.waitForTimeout(900)
await page.getByRole('button', { name: /Carolina Mendes/ }).first().click()
await page.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(1200)
check('evento criado aparece na grade', await page.getByText(titulo).first().isVisible())
await shot('2-evento')
await page.getByText(titulo).first().click(); await page.waitForTimeout(300)
check('clicar abre o evento com o lead', await page.getByText('Carolina Mendes').first().isVisible())
await page.locator('input[placeholder="Ex.: Acerto da maleta"]').fill(titulo + ' editado')
await page.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(1000)
check('editar evento salva', await page.getByText(titulo + ' editado').first().isVisible())

console.log('Filtro e visões')
await page.locator('input[placeholder="Filtro"]').fill('zzzz-nada'); await page.waitForTimeout(300)
check('filtro esconde o que não bate', !(await page.getByText(titulo + ' editado').first().isVisible()))
await page.locator('input[placeholder="Filtro"]').fill(''); await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Meus eventos' }).click(); await page.waitForTimeout(800)
check('chip alterna para Todos os eventos', await page.getByRole('button', { name: 'Todos os eventos' }).isVisible())
check('gestor vê seletor de usuário', await page.locator('select', { has: page.locator('option', { hasText: 'Todos os usuários' }) }).isVisible())
await page.getByRole('button', { name: 'Todos os eventos' }).click(); await page.waitForTimeout(500)

await page.getByRole('button', { name: /^Semana/ }).click(); await page.getByRole('button', { name: 'Mês', exact: true }).click(); await page.waitForTimeout(800)
check('visão Mês mostra o evento', await page.getByText(titulo + ' editado').first().isVisible())
await shot('3-mes')
await page.getByRole('button', { name: /^Mês/ }).click(); await page.getByRole('button', { name: 'Dia', exact: true }).click(); await page.waitForTimeout(500)
check('visão Dia', await page.getByText('GMT-3').isVisible())

await page.getByRole('main').locator('button[title="Quadro de tarefas"]').click(); await page.waitForTimeout(500)
check('quadro de tarefas (colunas por prazo)', await page.getByText('Tarefas atrasadas').isVisible())
await shot('4-quadro')
await page.getByRole('main').locator('button[title="Lista de tarefas"]').click(); await page.waitForTimeout(500)
check('lista de tarefas (tabela)', await page.getByText('Responsável', { exact: true }).isVisible())
await page.locator('button[title="Mais"]').click(); await page.waitForTimeout(200)
check('menu ⋯ abre', await page.getByText('Ir para hoje', { exact: true }).isVisible())
await page.getByText('Atualizar', { exact: true }).click(); await page.waitForTimeout(300)
await page.getByRole('button', { name: /Configurações de agendamento/ }).click(); await page.waitForTimeout(300)
check('Configurações de agendamento abre', await page.getByText('Início do expediente').isVisible())
await page.getByRole('button', { name: 'Salvar' }).click()

// limpa o evento de teste
await page.getByRole('main').locator('button[title="Calendário"]').click(); await page.waitForTimeout(600)
await page.getByRole('button', { name: /^Dia/ }).click(); await page.getByRole('button', { name: 'Semana', exact: true }).click(); await page.waitForTimeout(800)
await page.getByText(titulo + ' editado').first().click(); await page.waitForTimeout(300)
page.once('dialog', d => d.accept())
await page.getByRole('button', { name: /Excluir/ }).click(); await page.waitForTimeout(400)
const confirmBtn = page.locator('.swal2-confirm'); if (await confirmBtn.isVisible()) await confirmBtn.click()
await page.waitForTimeout(1000)
check('excluir evento', !(await page.getByText(titulo + ' editado').first().isVisible()))

await page.goto('http://localhost:5183/tarefas'); await page.waitForTimeout(1200)
check('/tarefas abre na lista', await page.getByText('Responsável', { exact: true }).isVisible())

console.log(errors.length ? '\nErros no console:\n' + errors.join('\n') : '\nsem erros no console')
console.log(`${ok} ok, ${fail} falha(s)`)
await browser.close()
process.exit(fail ? 1 : 0)

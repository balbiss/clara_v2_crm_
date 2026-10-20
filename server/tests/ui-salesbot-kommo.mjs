// Salesbot (Automações › Robôs) no navegador, botão por botão. API 3011 + front 5183 + seed + seed-kommo-robos.
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })
let ok = 0, fail = 0
const check = (n, c) => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n) }
const api = (path, opts = {}) => page.evaluate(async ([p, o]) => { const r = await fetch('http://localhost:3011' + p, { ...o, headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('auth_token') } }); return r.status === 204 ? null : r.json() }, [path, opts])

await page.goto('http://localhost:5183/login'); await page.fill('#email', 'diretoria@teste.local'); await page.fill('#password', '123456')
await page.getByRole('button', { name: 'Login', exact: true }).click(); await page.waitForURL('**/dashboard')

console.log('Lista')
await page.locator('.app-sidebar').getByRole('button', { name: 'Automações' }).click()
await page.locator('.app-sidebar').getByRole('button', { name: 'Robôs (Salesbot)' }).click(); await page.waitForSelector('text=Salesbots')
await page.getByRole('button', { name: 'Confirma Agend. Dia Seguinte' }).waitFor({ timeout: 10000 })
check('menu Automações › Robôs abre a lista', page.url().endsWith('/fluxos'))
// o navegador lê o título em maiúsculas (estilo text-transform), então compara sem diferenciar
const titulos = (await page.locator('th').allInnerTexts()).map(t => t.trim().toLowerCase())
for (const col of ['Nome', 'Gatilhos', 'Taxa de conversão', 'Total lançado', 'Sessões ativas']) check('coluna "' + col + '"', titulos.includes(col.toLowerCase()))
check('robôs da Clara na lista', await page.getByRole('button', { name: 'Confirma Agend. Dia Seguinte' }).isVisible())
await page.screenshot({ path: OUT + '/bot-lista.png' })

console.log('Criar do zero')
await page.getByRole('button', { name: '+ Criar bot' }).click()
check('"Criar um bot" mostra Começar do zero e os modelos', await page.getByRole('button', { name: 'Começar do zero' }).isVisible() && await page.getByText('Bot de boas-vindas').isVisible())
await page.screenshot({ path: OUT + '/bot-criar.png' })
await page.getByRole('button', { name: 'Começar do zero' }).click(); await page.waitForURL(/\/fluxos\/\d+/)
await page.getByText('Iniciar robô').waitFor({ timeout: 10000 })
const botId = Number(page.url().split('/').pop())
check('editor abre com "Gatilhos" e "Iniciar robô"', await page.getByText('Iniciar robô').isVisible() && await page.locator('.react-flow__node-trigger').getByText('Gatilhos', { exact: true }).isVisible())
const nome = 'Robô UI ' + Date.now().toString().slice(-4)
await page.getByRole('button', { name: /Salesbot #/ }).click(); await page.keyboard.press('Control+A'); await page.keyboard.type(nome); await page.keyboard.press('Enter')
check('renomear o robô', await page.getByRole('button', { name: new RegExp(nome) }).isVisible())

await page.getByRole('button', { name: '+ Gatilho' }).click()
await page.locator('.modal-card select').first().selectOption('incoming_message')
await page.locator('input[placeholder="catálogo, preço, maleta"]').fill('catálogo, preço')
await page.getByRole('button', { name: 'Pronto' }).click(); await page.waitForTimeout(300)
check('gatilho "Mensagem de entrada recebida" aparece no cartão', await page.getByText('Mensagem de entrada recebida').isVisible())

await page.locator('.react-flow__node-start button[title="Adicionar próximo passo"]').click()
check('"+" abre "Adicionar próximo passo"', await page.getByText('Adicionar próximo passo').isVisible())
await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click(); await page.waitForTimeout(400)
const bloco = page.locator('.react-flow__node-step').first()
await bloco.locator('textarea').fill('Oi {{contact.first_name}}, quer o catálogo?')
await bloco.getByRole('button', { name: '+ Botão de ação' }).click(); await bloco.locator('input[placeholder="Texto do botão"]').last().fill('Sim')
await bloco.getByRole('button', { name: '+ Botão de ação' }).click(); await bloco.locator('input[placeholder="Texto do botão"]').last().fill('Não')
await page.locator('.react-flow__controls-fitview').click(); await page.waitForTimeout(400)
check('mensagem com 2 botões e uma saída por botão', (await bloco.locator('.react-flow__handle-right').count()) >= 3)
await bloco.locator('div', { hasText: /^Sim$/ }).locator('button[title="Adicionar próximo passo"]').click()
await page.getByRole('button', { name: 'Ação', exact: true }).click(); await page.waitForTimeout(300)
await page.locator('.react-flow__controls-fitview').click(); await page.waitForTimeout(400)
await bloco.locator('div', { hasText: /^Não$/ }).locator('button[title="Adicionar próximo passo"]').click()
await page.getByRole('button', { name: 'Parar robô', exact: true }).click(); await page.waitForTimeout(300)
console.log('    passos', await page.locator('.react-flow__node-step').count(), 'setas', await page.locator('.react-flow__edge').count())
await page.locator('.react-flow__controls-fitview').click(); await page.waitForTimeout(400)
check('passos novos ligados por setas', (await page.locator('.react-flow__edge').count()) >= 3)
await page.screenshot({ path: OUT + '/bot-editor.png' })

await page.getByRole('button', { name: 'Salvar e Continuar' }).click(); await page.waitForTimeout(1200)
const salvo = await api(`/salesbots/${botId}`)
const passos = Object.values(salvo.definition.steps || {})
check('salvar grava passos, botões e gatilho', salvo.name === nome && passos.length === 3 && passos.some(p => p.type === 'message' && p.buttons.length === 2) && salvo.trigger_config.event === 'incoming_message')
await page.reload(); await page.getByText('Iniciar robô').waitFor({ timeout: 10000 }); await page.waitForTimeout(600)
check('depois de recarregar o editor mostra o mesmo robô', (await page.locator('.react-flow__node-step textarea').first().inputValue()) === 'Oi {{contact.first_name}}, quer o catálogo?')

await page.getByRole('switch').click(); await page.waitForTimeout(600)
check('chave Ativo liga o robô', (await api(`/salesbots/${botId}`)).active === true)
await page.getByRole('switch').click(); await page.waitForTimeout(600)

await page.getByRole('button', { name: 'Testar em um lead' }).click()
await page.locator('input[placeholder="Buscar lead por nome ou telefone"]').fill('Carolina'); await page.waitForTimeout(900)
await page.getByRole('button', { name: /Carolina Mendes/ }).first().click(); await page.waitForTimeout(1000)
const runs = await api(`/salesbots/${botId}/runs`)
check('"Testar em um lead" executa o robô (sessão criada)', runs.length >= 1 && runs[0].contact_name === 'Carolina Mendes')

console.log('Robô da Clara')
await page.goto('http://localhost:5183/fluxos'); await page.getByRole('button', { name: 'Confirma Agend. Dia Seguinte' }).waitFor({ timeout: 10000 })
await page.getByRole('button', { name: 'Confirma Agend. Dia Seguinte' }).click(); await page.getByText('Iniciar robô').waitFor({ timeout: 10000 }); await page.waitForTimeout(800)
check('robô da Clara abre com os blocos (condições, mensagens, parar)', (await page.locator('.react-flow__node-step').count()) >= 5 && await page.getByText('Confirmado').first().isVisible())
await page.screenshot({ path: OUT + '/bot-clara.png' })
await page.getByRole('button', { name: 'Cancelar' }).click(); await page.waitForTimeout(600)

console.log('Lista: duplicar / excluir')
await page.getByRole('button', { name: nome, exact: true }).waitFor({ timeout: 10000 })
await page.locator('tr', { has: page.getByRole('button', { name: nome, exact: true }) }).locator('button[title="Duplicar"]').click()
await page.getByRole('button', { name: `${nome} (cópia)` }).waitFor({ timeout: 8000 }).catch(() => {})
check('duplicar robô', await page.getByRole('button', { name: `${nome} (cópia)` }).isVisible())
for (const n of [`${nome} (cópia)`, nome]) {
  await page.locator('tr', { has: page.getByRole('button', { name: n, exact: true }) }).locator('button[title="Excluir"]').click()
  await page.locator('.swal2-confirm').click()
  await page.getByRole('button', { name: n, exact: true }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
}
check('excluir robôs', (await page.getByRole('button', { name: nome, exact: true }).count()) === 0)

console.log('Executar robô pelo card do lead')
await page.goto('http://localhost:5183/conversas'); await page.waitForSelector('text=Total:'); await page.getByText('Carolina Mendes').first().click(); await page.waitForTimeout(1200)
await page.locator('button[title="Mais"]').click(); await page.getByRole('button', { name: 'Executar robô' }).click(); await page.waitForTimeout(600)
check('card › Executar robô lista os robôs', await page.getByRole('button', { name: /Pós - pesquisa de satisfação/ }).isVisible())
await page.getByRole('button', { name: /Pós - pesquisa de satisfação/ }).click(); await page.waitForTimeout(1200)
check('executar pelo card inicia o robô', await page.getByText(/Robô "Pós - pesquisa de satisfação" iniciado/).isVisible())

console.log(errors.length ? '\nErros no console:\n' + errors.join('\n') : '\nsem erros no console')
console.log(`${ok} ok, ${fail} falha(s)`)
await browser.close()
process.exit(fail ? 1 : 0)

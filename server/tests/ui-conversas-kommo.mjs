// Conversas no layout do Kommo, testada botão por botão no navegador de verdade.
// Servidor (3011) + front (5183) no ar + seed. Rodar de uma pasta com playwright-core.
import { chromium } from 'playwright-core'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ai_status/.test(m.text())) errors.push('console: ' + m.text()) })
let ok = 0, fail = 0
const check = (n, c) => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n) }
const shot = n => page.screenshot({ path: `${OUT}/conv-${n}.png` })
const api = async (path, opts = {}) => page.evaluate(async ([p, o]) => {
  const r = await fetch('http://localhost:3011' + p, { ...o, headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('auth_token') } })
  return r.status === 204 ? null : r.json()
}, [path, opts])

await page.goto('http://localhost:5183/login')
await page.fill('#email', 'diretoria@teste.local'); await page.fill('#password', '123456')
await page.click('button[type=submit]'); await page.waitForURL('**/dashboard')
await page.goto('http://localhost:5183/conversas'); await page.waitForSelector('text=Total:', { timeout: 15000 }); await page.waitForTimeout(800)

console.log('Lista')
check('chip "Conversas abertas"', await page.getByText('Conversas abertas').first().isVisible())
const total0 = await page.getByText(/^Total: \d+/).textContent()
check('contador Total: aparece (' + total0 + ')', /Total: \d+/.test(total0))
await shot('1-lista')

await page.locator('input[placeholder="Buscar"]').fill('Carolina'); await page.waitForTimeout(1200)
check('busca acha "Carolina"', await page.getByText('Carolina Mendes').first().isVisible())
await page.locator('button[title="Limpar pesquisa"]').click(); await page.waitForTimeout(300)
check('limpar busca volta a lista', await page.getByText(/^Total: \d+/).isVisible())

await page.locator('button[title="Mais opções"]').click(); await page.waitForTimeout(200)
check('menu ⋯ abre com filtros', await page.getByText('Filtro avançado').isVisible())
await page.getByRole('button', { name: /^Sem resposta/ }).click(); await page.waitForTimeout(300)
check('filtro "Sem resposta" aplica', await page.getByText('Sem resposta').first().isVisible())
await page.locator('button[title="Mais opções"]').click(); await page.getByRole('button', { name: /^Conversas abertas/ }).click(); await page.waitForTimeout(300)

console.log('Card do lead')
await page.getByText('Carolina Mendes').first().click(); await page.waitForTimeout(1500)
check('painel escuro com nome em maiúsculas', await page.locator('h2', { hasText: 'Carolina Mendes' }).isVisible())
check('abas Principal/Dados/Financeiro', await page.getByRole('button', { name: 'Financeiro' }).isVisible())
check('linha Usuário responsável', await page.getByText('Usuário responsável').isVisible())
await shot('2-card')

// editar um campo (Limite Inicial) clicando nos "..."
const conv = await api('/conversations?per_page=50')
const carol = (Array.isArray(conv) ? conv : conv.conversations || conv.data || []).find(c => c.contact?.name === 'Carolina Mendes')
const row = page.locator('div', { has: page.locator('span', { hasText: /^Limite Inicial$/ }) }).last()
await row.locator('span').nth(1).click()
const val = 'R$ ' + (1000 + Math.floor(Math.random() * 900))
await page.waitForTimeout(200); await page.keyboard.press('Control+A'); await page.keyboard.type(val); await page.keyboard.press('Enter'); await page.waitForTimeout(1200)
const c1 = carol ? await api(`/contacts/${carol.contact.id}`) : null
check('campo editado salva no banco (' + val + ')', c1?.custom_attributes?.limite_inicial === val)

// campo do tipo lista (Meta, opções vindas do Kommo)
const meta = page.locator('div', { has: page.locator('span', { hasText: /^Meta$/ }) }).last()
await meta.locator('span').nth(1).click(); await page.waitForTimeout(200)
await meta.locator('select').selectOption('R$ 2.000,00'); await page.waitForTimeout(1200)
const c2 = carol ? await api(`/contacts/${carol.contact.id}`) : null
check('campo lista (Meta) salva a opção escolhida', c2?.custom_attributes?.meta === 'R$ 2.000,00')

await page.getByRole('button', { name: 'Dados', exact: true }).click(); await page.waitForTimeout(300)
check('aba Dados mostra os campos do Kommo (Onboarding)', await page.getByText('Onboarding', { exact: true }).isVisible())
check('aba Dados mostra Dados do Jueri', await page.getByText('Dados do Jueri (sincronizado)').isVisible())
await page.getByRole('button', { name: 'Financeiro', exact: true }).click(); await page.waitForTimeout(300)
check('aba Financeiro mostra campos do Kommo (Valor do débito)', await page.getByText('Valor do débito', { exact: true }).isVisible())
check('aba Financeiro mostra Total vendido', await page.getByText('Total vendido').isVisible())
await page.getByRole('button', { name: 'Estatísticas', exact: true }).click(); await page.waitForTimeout(300)
check('aba Estatísticas (utm_source só API)', await page.getByText('utm_source', { exact: true }).isVisible())
await page.locator('button[title="Mais abas"]').click(); await page.getByRole('button', { name: 'Ajustes' }).click(); await page.waitForTimeout(300)
check('aba ⋯ › Ajustes', await page.getByText('Mesclar com outro contato').isVisible())

// "Campos e grupos" (painel do Kommo): cria campo Selecionar com 3 opções, usa no card,
// obrigatório por etapa bloqueia a mudança, Arquivo com upload, novo grupo, exclui tudo
const abrirCampos = async () => { await page.locator('button[title="Mais abas"]').click(); await page.getByRole('main').getByRole('button', { name: 'Configurações', exact: true }).click(); await page.waitForSelector('text=Campos e grupos'); await page.waitForTimeout(400) }
await abrirCampos()
check('painel "Campos e grupos" abre', await page.getByText('Campos e grupos').isVisible())
const panel = page.locator('aside.k-fields-panel')
const novoCampo = 'Tamanho anel ' + Date.now().toString().slice(-4)
await panel.getByRole('button', { name: 'Adicionar campo' }).click()
await panel.getByRole('button', { name: /^Texto curto/ }).click()
const tipos = await panel.locator('button').allTextContents()
check('menu de tipos tem os 16 tipos do Kommo', ['Texto curto', 'Numérico', 'Interruptor', 'Selecionar', 'Seleção múltipla', 'Data', 'Url', 'Texto longo', 'Botão de opção', 'Endereço curto', 'Endereço', 'Data de nascimento', 'CPF', 'Data e hora', 'Moeda', 'Arquivo'].every(t => tipos.includes(t)))
await panel.getByRole('button', { name: 'Selecionar', exact: true }).click()
await panel.locator('input[placeholder="Nome do campo"]').fill(novoCampo)
for (const o of ['14', '16', '18']) { await panel.getByRole('button', { name: 'Adicionar opção' }).click(); await panel.locator('input[placeholder="Opção"]').last().fill(o) }
await panel.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(1200)
check('campo novo aparece na lista com "3 variantes"', await panel.getByText(novoCampo).isVisible() && await panel.getByText('3 variantes').first().isVisible())
await shot('campos-painel')
await page.locator('button[title="Fechar"]').first().click(); await page.waitForTimeout(600)
const linha = page.locator('div', { has: page.locator('span', { hasText: new RegExp('^' + novoCampo + '$') }) }).last()
check('campo novo aparece no card', await linha.isVisible())
await linha.locator('span').nth(1).click(); await linha.locator('select').selectOption('16'); await page.waitForTimeout(1200)
const c3 = await api(`/contacts/${carol.contact.id}`)
const keyNovo = Object.keys(c3.custom_attributes || {}).find(k => c3.custom_attributes[k] === '16')
check('valor da lista salvo no lead (16)', !!keyNovo)

// obrigatório: marca o campo novo como obrigatório na etapa "Consignado › Agendado"
await abrirCampos()
await panel.getByRole('button', { name: new RegExp('^' + novoCampo) }).click()
await panel.getByText('Obrigatório para etapas selecionadas').click(); await page.waitForTimeout(400)
await panel.locator('label', { hasText: 'Consignado › Agendado' }).locator('input').check(); await panel.getByRole('button', { name: 'OK', exact: true }).click()
await panel.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(1000)
await page.locator('button[title="Fechar"]').first().click(); await page.waitForTimeout(400)
// limpa o valor e tenta mudar a etapa pra Agendado
await api(`/contacts/${carol.contact.id}`, { method: 'PUT', body: JSON.stringify({ contact: { custom_attributes: Object.fromEntries(Object.entries(c3.custom_attributes).filter(([k]) => k !== keyNovo)) } }) })
const fdef = (await api('/contact_custom_fields?all=1')).find(f => f.label === novoCampo); console.log('    (obrigatório salvo:', JSON.stringify(fdef?.required_stages), ' chave do valor:', keyNovo, ')')
await api(`/contacts/${carol.contact.id}`, { method: 'PUT', body: JSON.stringify({ contact: { status: 'revendedor_ativo' } }) }) // começa fora da etapa
const blocked = await api(`/contacts/${carol.contact.id}`, { method: 'PUT', body: JSON.stringify({ contact: { status: 'agendado' } }) })
check('campo obrigatório vazio bloqueia mudar pra etapa (' + (blocked?.message || '').slice(0, 50) + ')', blocked?.error === 'required_fields')

// Arquivo: cria campo, faz upload no card, aparece o link
await abrirCampos()
const campoArq = 'Contrato ' + Date.now().toString().slice(-4)
await panel.getByRole('button', { name: 'Adicionar campo' }).click()
await panel.getByRole('button', { name: /^Texto curto/ }).click(); await panel.getByRole('button', { name: 'Arquivo', exact: true }).click()
await panel.locator('input[placeholder="Nome do campo"]').fill(campoArq)
await panel.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(1000)
await page.locator('button[title="Fechar"]').first().click(); await page.waitForTimeout(600)
const arq = page.locator('div', { has: page.locator('span', { hasText: new RegExp('^' + campoArq + '$') }) }).last()
await arq.locator('input[type=file]').setInputFiles({ name: 'contrato-teste.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') }); await page.waitForTimeout(1800)
check('upload do Arquivo mostra o link no card', await arq.getByText('contrato-teste.pdf').isVisible())

// novo grupo (aba do card) e exclusões
await abrirCampos()
const grupo = 'Grupo ' + Date.now().toString().slice(-4)
await panel.locator('button[title="Adicionar grupo"]').click(); await page.keyboard.type(grupo); await page.keyboard.press('Enter'); await page.waitForTimeout(1200)
check('novo grupo aparece no painel', await panel.getByText(grupo).isVisible())
await panel.getByText(grupo).click(); await panel.locator('button[title="Excluir grupo"]').click(); await page.locator('.swal2-confirm').click(); await page.waitForTimeout(1000)
check('excluir grupo', (await panel.getByText(grupo).count()) === 0)
for (const nome of [novoCampo, campoArq]) {
  await panel.getByText('Principal', { exact: true }).click(); await page.waitForTimeout(300)
  await panel.getByRole('button', { name: new RegExp('^' + nome) }).click(); await page.waitForTimeout(300)
  await panel.getByRole('button', { name: /Excluir campo/ }).click(); await page.locator('.swal2-confirm').click(); await page.waitForTimeout(1000)
}
check('excluir campos tira da lista', (await panel.getByText(novoCampo).count()) === 0 && (await panel.getByText(campoArq).count()) === 0)
await page.locator('button[title="Fechar"]').first().click(); await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Principal', exact: true }).click()

const tagName = 'TESTE' + Date.now().toString().slice(-4)
await page.getByRole('button', { name: '#adicionar tags' }).click()
await page.locator('input[placeholder="Buscar ou criar tag"]').fill(tagName)
await page.getByRole('button', { name: `Criar "${tagName}"` }).click(); await page.waitForTimeout(1200)
const tagEl = page.getByText(new RegExp(`^${tagName}$`, 'i')) // o servidor grava em minúsculas; a tela mostra em maiúsculas
check('tag criada aparece no cabeçalho', await tagEl.isVisible())
await tagEl.click(); await page.waitForTimeout(1000)
check('clicar na tag remove', !(await tagEl.isVisible()))

await page.locator('button[title="Mais"]').click(); await page.waitForTimeout(200)
check('menu ⋯ do card abre', await page.getByText('Abrir ficha completa').isVisible())
await page.keyboard.press('Escape'); await page.mouse.click(1000, 300); await page.waitForTimeout(200)

console.log('Histórico e composer')
check('bloco do WhatsApp com Nº', await page.getByText(/^Nº A\d+/).isVisible())
await page.getByRole('button', { name: 'Bate-papo' }).click(); await page.getByRole('button', { name: 'Nota', exact: true }).click()
const nota = 'Nota teste ' + Date.now().toString().slice(-4)
await page.locator('textarea[placeholder^="Escreva uma nota"]').fill(nota)
await page.getByRole('button', { name: 'Salvar nota' }).last().click(); await page.waitForTimeout(1500)
check('nota aparece no histórico', await page.getByText(nota, { exact: true }).isVisible())

await page.getByRole('button', { name: 'Nota', exact: true }).click(); await page.getByRole('button', { name: 'Tarefa', exact: true }).click()
const tarefa = 'Ligar teste ' + Date.now().toString().slice(-4)
await page.locator('input[placeholder="O que precisa ser feito"]').fill(tarefa)
await page.getByRole('button', { name: 'Definir' }).click(); await page.waitForTimeout(1500)
check('tarefa criada aparece no histórico', await page.getByText(tarefa).first().isVisible())
await shot('3-tarefa')
const card = page.locator('div', { has: page.getByText(tarefa) }).filter({ has: page.locator('input[placeholder="Adicionar resultado"]') }).last()
await card.locator('input[placeholder="Adicionar resultado"]').fill('feito no teste')
await card.getByRole('button', { name: 'Tarefa concluída' }).click(); await page.waitForTimeout(1200)
check('concluir tarefa tira do histórico', (await page.getByText(tarefa).count()) === 0)

await page.getByRole('button', { name: 'Fechar conversa' }).click(); await page.waitForTimeout(500)
check('Fechar conversa abre confirmação', await page.locator('.modal-overlay, [role=dialog]').first().isVisible())
await page.keyboard.press('Escape'); await page.mouse.click(10, 10); await page.waitForTimeout(300)
await page.goto('http://localhost:5183/conversas'); await page.waitForSelector('text=Total:'); await page.getByText('Carolina Mendes').first().click(); await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Colocar em espera' }).click(); await page.waitForTimeout(500)
check('Colocar em espera abre opções', await page.locator('.modal-overlay, [role=dialog]').first().isVisible())
await shot('4-espera')

console.log(errors.length ? '\nErros no console:\n' + errors.join('\n') : '\nsem erros no console')
console.log(`${ok} ok, ${fail} falha(s)`)
await browser.close()

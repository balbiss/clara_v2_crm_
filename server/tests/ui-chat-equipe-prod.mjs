// "Chats da equipe" (modelo Kommo) no navegador, contra a v2 de validação. Usuário de TESTE
// temporário + diretoria em dois navegadores: particular em tempo real, grupo (criar, mensagem com
// nome, renomear), destaque, silenciar, filtros, ações múltiplas, menção a partir da conversa com
// cliente (Clínica Moreira, contato de teste) e celular. Limpa tudo no fim.
// Login da diretoria via env ADMIN_EMAIL / ADMIN_PASSWORD.
import { chromium } from 'playwright-core'

const FRONT = process.env.FRONT || 'https://sistema.clarajoias.com.br'
const API = process.env.API || 'https://sistema-api.clarajoias.com.br'
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT || '.'
let ok = 0, fail = 0
const check = (n, c, extra = '') => { c ? ok++ : fail++; console.log(c ? '  ✓' : '  ✗', n, extra) }
const espera = (loc, ms = 20000) => loc.waitFor({ timeout: ms }).then(() => true, () => false)

const signIn = async (email, password) => (await fetch(API + '/users/sign_in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password } }) })).headers.get('authorization')
const tokA = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
const api = async (m, p, b, tok = tokA) => { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: tok }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) } }

const tag = Date.now().toString().slice(-6)
const teste = { email: `teste.chat.${tag}@clarajoias.com.br`, password: `Teste-${tag}-chat`, first_name: 'Testa', last_name: `Chat ${tag}`, role: 'consultor' }
const criado = await api('POST', '/agents', { agent: teste })
const testeId = criado.data?.id
check('cria usuária de teste temporária', !!testeId, String(criado.status))
const nomeT = `Testa Chat ${tag}`, grupo = `Grupo Teste ${tag}`

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const errors = []
const sessao = async (email, password) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await page.goto(FRONT + '/login'); await page.fill('#email', email); await page.fill('#password', password)
  await page.getByRole('button', { name: 'Login', exact: true }).click(); await page.waitForURL('**/dashboard', { timeout: 60000 })
  await page.goto(FRONT + '/chat-equipe'); await page.getByLabel('Buscar', { exact: true }).waitFor({ timeout: 30000 })
  return page
}
const topico = (p, nome) => p.locator('[data-testid="topico"]', { hasText: nome }).first()
try {
  const a = await sessao(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
  const b = await sessao(teste.email, teste.password)

  console.log('Lista')
  check('tela vazia do Kommo', await a.getByText('Selecione um tópico para começar a enviar mensagens').isVisible())
  check('chip de filtro "Todos"', await a.getByRole('button', { name: 'Todos', exact: true }).isVisible())
  await a.getByLabel('Buscar', { exact: true }).fill(nomeT)
  check('busca acha a colega (ainda sem conversa)', await espera(topico(a, nomeT)))

  console.log('Particular')
  await topico(a, nomeT).click()
  check('abre a conversa particular', await espera(a.getByText('Nenhuma mensagem ainda.')))
  const t1 = `Oi Testa ${tag}`
  await a.getByLabel('Mensagem para a equipe').fill(t1); await a.keyboard.press('Enter')
  check('envia', await espera(a.locator('[data-testid="msg-equipe"]', { hasText: t1 })))
  check('colega recebe com não lida', await espera(topico(b, 'Diretoria Clara').filter({ hasText: t1 })) && /\n1\s*$/.test(await topico(b, 'Diretoria Clara').innerText()))
  check('prévia com "Você:" pra quem mandou', (await topico(a, nomeT).innerText()).includes(`Você: ${t1}`))

  console.log('Grupo')
  await a.getByLabel('Buscar', { exact: true }).fill('')
  await a.getByTitle('Mais opções').click(); await a.getByRole('menuitem', { name: 'Criar um grupo' }).click()
  const dg = a.getByRole('dialog', { name: 'Criar um grupo' })
  await dg.getByLabel('Nome do grupo').fill(grupo)
  await dg.getByLabel('Buscar colega no grupo').fill(nomeT); await dg.getByRole('checkbox').first().check()
  await dg.getByRole('button', { name: 'Salvar' }).click()
  check('cria o grupo com mensagem de sistema', await espera(a.locator('[data-testid="msg-sistema"]', { hasText: 'criou o grupo' })))
  check('grupo aparece pra colega', await espera(topico(b, grupo)))
  await topico(b, grupo).click()
  const t2 = `Mensagem no grupo ${tag}`
  await b.getByLabel('Mensagem para a equipe').fill(t2); await b.keyboard.press('Enter')
  const bal = a.locator('[data-testid="msg-equipe"]', { hasText: t2 })
  check('mensagem do grupo chega com o nome de quem mandou', await espera(bal) && (await bal.innerText()).includes('Testa'))
  await a.getByTitle('Configurações do grupo').click()
  const dc = a.getByRole('dialog', { name: 'Configurações do grupo' })
  await dc.getByLabel('Nome do grupo').fill(grupo + ' X'); await dc.getByRole('button', { name: 'Salvar' }).click()
  check('renomear o grupo', await espera(a.locator('[data-testid="msg-sistema"]', { hasText: 'mudou o nome' })))

  console.log('Destaque, silenciar, filtros')
  await a.getByTitle('Destacar').click(); await a.waitForTimeout(800)
  await a.getByRole('button', { name: 'Todos', exact: true }).click(); await a.getByRole('menuitem', { name: 'Destaque' }).click(); await a.waitForTimeout(1200)
  const nDest = await a.locator('[data-testid="topico"]').count()
  check('filtro Destaque mostra só o grupo', nDest === 1 && (await a.locator('[data-testid="topico"]').first().innerText()).includes(grupo + ' X'), `${nDest}`)
  await a.getByRole('button', { name: 'Destaque', exact: true }).click(); await a.getByRole('menuitem', { name: 'Todos' }).click(); await a.waitForTimeout(1000)
  await a.getByTitle('Silenciar conversa').click(); await a.waitForTimeout(800)
  check('silenciar conversa', await a.getByTitle('Reativar notificações').isVisible())
  // Não lidos: diretoria manda no particular enquanto a colega está no grupo
  await topico(a, nomeT).click(); await a.getByLabel('Mensagem para a equipe').fill(`outra ${tag}`); await a.keyboard.press('Enter'); await a.waitForTimeout(2500)
  await b.getByRole('button', { name: 'Todos', exact: true }).click(); await b.getByRole('menuitem', { name: 'Não lidos' }).click(); await b.waitForTimeout(1500)
  check('filtro Não lidos', (await b.locator('[data-testid="topico"]', { hasText: 'Diretoria Clara' }).count()) === 1)
  await b.getByRole('button', { name: 'Não lidos', exact: true }).click(); await b.getByRole('menuitem', { name: 'Todos' }).click(); await b.waitForTimeout(1000)

  console.log('Ações múltiplas')
  await b.getByTitle('Mais opções').click(); await b.getByRole('menuitem', { name: 'Ações múltiplas' }).click()
  await topico(b, 'Diretoria Clara').click(); await b.getByRole('button', { name: 'Marcar como lido' }).click(); await b.waitForTimeout(1500)
  check('marcar como lido em lote', !/\n\d+\s*$/.test(await topico(b, 'Diretoria Clara').innerText()))

  console.log('Menção pela conversa com cliente')
  await a.goto(FRONT + '/conversas'); await a.waitForSelector('text=Total:', { timeout: 60000 }); await a.getByText('Clínica Moreira').first().click(); await a.waitForTimeout(2000)
  await a.getByTitle('Marcar um colega').click()
  await a.getByRole('menuitemcheckbox', { name: new RegExp(nomeT) }).click()
  check('composer mostra o @colega e "só a equipe vê"', await a.getByText('(só a equipe vê)').isVisible())
  const t3 = `pode ver essa cliente? ${tag}`
  await a.locator('textarea').last().fill(t3); await a.getByRole('button', { name: 'Enviar', exact: true }).click()
  check('envia a menção', await espera(a.getByText('Enviado pro Chats da equipe')))
  const men = topico(b, 'Clínica Moreira')
  check('colega recebe o tópico da menção (nome do cliente)', await espera(men) && (await men.innerText()).includes(t3))
  await men.click()
  await b.getByRole('button', { name: 'Abrir conversa com o cliente' }).click(); await b.waitForURL(/\/conversas\?abrir=\d+/, { timeout: 15000 }).catch(() => {})
  check('atalho abre a conversa do cliente', /abrir=\d+/.test(b.url()))
  await a.screenshot({ path: OUT + '/chat-mencao.png' })

  console.log('Celular (390 px)')
  await b.setViewportSize({ width: 390, height: 800 }); await b.goto(FRONT + '/chat-equipe'); await b.getByLabel('Buscar', { exact: true }).waitFor()
  check('celular mostra a lista sem rolagem lateral', (await b.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1)
  await topico(b, 'Diretoria Clara').click()
  check('celular abre a conversa com Voltar', await espera(b.getByTitle('Voltar')))
  await b.getByTitle('Voltar').click()
  check('Voltar volta pra lista', await b.getByLabel('Buscar', { exact: true }).isVisible())
  await a.goto(FRONT + '/chat-equipe'); await a.getByLabel('Buscar', { exact: true }).waitFor(); await a.waitForTimeout(1500)
  await a.screenshot({ path: OUT + '/chat-equipe.png' })
} finally {
  // limpeza: diretoria sai dos tópicos de teste (grupo e menção), usuária de teste é apagada
  const lista = (await api('GET', '/team_chats')).data || []
  for (const c of lista.filter(c => c.id && (c.name?.startsWith(`Grupo Teste ${tag}`) || (c.kind === 'mention' && c.members?.some(m => m.id === testeId))))) await api('POST', `/team_chats/${c.id}/leave`)
  if (testeId) { const d = await api('DELETE', `/agents/${testeId}`); check('apaga a usuária de teste', d.status === 204 || d.status === 200, String(d.status)) }
  console.log(errors.length ? '\nErros:\n' + errors.join('\n') : '\nsem erros no console')
  console.log(`${ok} ok, ${fail} falha(s)`)
  await browser.close()
}
process.exit(fail ? 1 : 0)

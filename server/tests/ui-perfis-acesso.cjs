// Teste de tela: Configurações › Perfis de acesso, menu por perfil, cadastro de usuário, número novo e card do funil.
// Rodar com API local (3011) + front (5183). Usa o Playwright do nova-crm e o Chrome instalado.
//   node server/tests/ui-perfis-acesso.cjs [pasta-dos-prints]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/inoov/nova-crm/node_modules/playwright');
const path = require('path');
const OUT = process.argv[2] || '.';
const WEB = 'http://localhost:5183', API = 'http://localhost:3011';
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, x) } };
const shot = (page, nome) => page.screenshot({ path: path.join(OUT, nome + '.png'), fullPage: false });

async function apiLogin(email) {
  const r = await fetch(API + '/users/sign_in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: { email, password: '123456' } }) });
  return { token: r.headers.get('authorization'), user: (await r.json()).user };
}
async function api(who, method, p, body) {
  const r = await fetch(API + p, { method, headers: { Authorization: who.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); try { return JSON.parse(t) } catch { return t }
}
async function entrar(browser, email, w = 1366, h = 860) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(WEB + '/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 20000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const dir = await apiLogin('diretoria@teste.local');
  const perfis0 = (await api(dir, 'GET', '/access_profiles')).perfis;
  const pCons = perfis0.find(p => p.name === 'Consultor');
  // garante o padrão antes de começar
  await api(dir, 'PUT', `/access_profiles/${pCons.id}`, { permissions: { 'insights.gerencial': false } });
  for (const p of perfis0.filter(p => !p.sistema && p.name.startsWith('Prospecção UI'))) await api(dir, 'DELETE', `/access_profiles/${p.id}`);

  console.log('Diretoria — tela Perfis de acesso');
  const D = await entrar(browser, 'diretoria@teste.local');
  await D.page.goto(WEB + '/settings/perfis-acesso');
  await D.page.waitForSelector('text=Perfis de acesso', { timeout: 15000 });
  await D.page.waitForSelector('text=Painel Gerencial', { timeout: 15000 });
  check('link "Perfis de acesso" no menu de Configurações', await D.page.locator('nav >> text=Perfis de acesso').count() > 0);
  for (const area of ['Menu e telas', 'Conversas (WhatsApp)', 'Revendedoras e contatos', 'Funis e leads', 'Tarefas e agenda', 'Disparos', 'Insights e relatórios', 'Configurações']) {
    check(`área "${area}" na tela`, await D.page.locator('h3', { hasText: area }).count() > 0);
  }
  await shot(D.page, '01-perfis-consultor');

  await D.page.locator('button', { hasText: 'Perfil padrão' }).filter({ hasText: 'Diretoria' }).click();
  await D.page.waitForTimeout(400);
  check('Diretoria aparece travada', await D.page.locator('text=sempre vê e faz tudo').count() > 0);
  await shot(D.page, '02-perfis-diretoria');

  // liga "Painel Gerencial" no Consultor e salva
  await D.page.locator('button', { hasText: 'Perfil padrão' }).filter({ hasText: 'Consultor' }).click();
  await D.page.waitForTimeout(400);
  const linha = D.page.locator('div', { has: D.page.locator('text="Painel Gerencial"') }).filter({ has: D.page.locator('button[role="switch"]') }).last();
  await linha.locator('button[role="switch"]').click();
  await D.page.click('button:has-text("Salvar")');
  await D.page.waitForTimeout(1200);
  const depois = (await api(dir, 'GET', '/access_profiles')).perfis.find(p => p.id === pCons.id);
  check('salvar pela tela grava no servidor', depois.permissions['insights.gerencial'] === true, JSON.stringify(depois.permissions['insights.gerencial']));

  // perfil novo pela tela
  await D.page.click('button:has-text("+ Novo perfil")');
  await D.page.fill('input[placeholder="Nome (ex.: Prospecção)"]', 'Prospecção UI');
  await D.page.click('button:has-text("Criar")');
  await D.page.waitForTimeout(1200);
  check('perfil novo aparece na lista', await D.page.locator('button:has-text("Prospecção UI")').count() > 0);
  check('perfil novo mostra "Baseado em Consultor"', await D.page.locator('text=Baseado em Consultor').count() > 0);
  await shot(D.page, '03-perfil-novo');

  console.log('Cadastro de usuário');
  await D.page.goto(WEB + '/agentes/novo');
  await D.page.waitForSelector('text=Perfil de acesso', { timeout: 15000 });
  await D.page.waitForSelector('label:has-text("Prospecção UI")', { timeout: 10000 }).catch(() => {});
  check('perfil novo pode ser escolhido no cadastro', await D.page.locator('label:has-text("Prospecção UI")').count() > 0);
  await D.page.locator('label:has-text("Prospecção UI")').first().scrollIntoViewIfNeeded();
  await shot(D.page, '04-cadastro-usuario');

  console.log('Número novo');
  await D.page.goto(WEB + '/settings/inboxes/new');
  await D.page.waitForTimeout(1200);
  // passo 1: escolher WhatsApp
  const zap = D.page.locator('button:has-text("WhatsApp"), div[role="button"]:has-text("WhatsApp")').first();
  if (await zap.count()) await zap.click(); else await D.page.locator('text=WhatsApp').first().click();
  await D.page.waitForTimeout(600);
  check('pergunta "Esse número é de quem?"', await D.page.locator('text=Esse número é de quem?').count() > 0);
  check('opção Consultoras (com carteira)', await D.page.locator('text=Consultoras (com carteira)').count() > 0);
  await shot(D.page, '05-numero-novo');

  console.log('Card do funil');
  await D.page.goto(WEB + '/pipelines');
  await D.page.waitForTimeout(2500);
  await shot(D.page, '06-funil-cards');
  await D.ctx.close();

  console.log('Consultora — menu segue o perfil');
  const C = await entrar(browser, 'consultor@teste.local');
  await C.page.goto(WEB + '/gerencial');
  await C.page.waitForTimeout(1500);
  check('com "Painel Gerencial" ligado, a consultora abre o Gerencial', C.page.url().includes('/gerencial'), C.page.url());
  await api(dir, 'PUT', `/access_profiles/${pCons.id}`, { permissions: { 'insights.gerencial': false } });
  await C.page.goto(WEB + '/settings/perfis-acesso');
  await C.page.waitForTimeout(1500);
  check('consultora não abre Perfis de acesso', !C.page.url().includes('/perfis-acesso'), C.page.url());
  await C.page.goto(WEB + '/agentes');
  await C.page.waitForTimeout(1200);
  check('consultora não abre Gestão de usuários', !C.page.url().includes('/agentes'), C.page.url());
  await C.page.reload(); await C.page.waitForTimeout(1500);
  await C.page.goto(WEB + '/gerencial'); await C.page.waitForTimeout(1500);
  check('desligado de novo, o Gerencial some pra ela', !C.page.url().includes('/gerencial'), C.page.url());
  await shot(C.page, '07-consultora-menu');
  await C.ctx.close();

  console.log('Financeiro — menu');
  const F = await entrar(browser, 'financeiro@teste.local');
  await F.page.waitForTimeout(800);
  const textoMenu = await F.page.locator('body').innerText();
  check('financeiro sem "Minhas Revendedoras"', !textoMenu.includes('Minhas Revendedoras'));
  await F.page.goto(WEB + '/carteira'); await F.page.waitForTimeout(1200);
  check('financeiro não abre /carteira pelo endereço', !F.page.url().endsWith('/carteira'), F.page.url());
  await F.ctx.close();

  console.log('Celular (390px)');
  const M = await entrar(browser, 'diretoria@teste.local', 390, 844);
  await M.page.goto(WEB + '/settings/perfis-acesso');
  await M.page.waitForSelector('text=Painel Gerencial', { timeout: 15000 });
  const largura = await M.page.evaluate(() => document.documentElement.scrollWidth);
  check('sem rolagem lateral no celular', largura <= 392, String(largura));
  await shot(M.page, '08-celular');
  await M.ctx.close();

  // limpeza
  for (const p of (await api(dir, 'GET', '/access_profiles')).perfis.filter(p => p.name === 'Prospecção UI')) await api(dir, 'DELETE', `/access_profiles/${p.id}`);
  await browser.close();
  console.log(`\n${ok} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });

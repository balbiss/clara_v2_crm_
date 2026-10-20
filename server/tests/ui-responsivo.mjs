// Procura texto/elemento saindo da tela em várias larguras (Conversas, funil, calendário, Automatize).
import { chromium } from 'playwright-core'
const OUT = process.env.OUT
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
await page.goto('http://localhost:5183/login')
await page.fill('#email', 'diretoria@teste.local'); await page.fill('#password', '123456')
await page.getByRole('button', { name: 'Login', exact: true }).click(); await page.waitForURL('**/dashboard')
const telas = [['conversas', '/conversas', async () => { await page.getByText('Ana Paula Souza').first().click(); await page.waitForTimeout(1200) }], ['funil', '/pipelines/varejo'], ['automatize', '/pipelines/onboarding/automatize'], ['calendario', '/calendario'], ['carteira', '/carteira'], ['contatos', '/contatos'], ['cfg-trabalho', '/settings/trabalho'], ['cfg-perfil', '/settings/perfil'], ['cfg-campos', '/settings/campos-contato'], ['cfg-motivos', '/settings/motivos-perda'], ['robos', '/fluxos'], ['gerencial', '/gerencial'], ['relatorios', '/relatorios'], ['metas', '/relatorios?aba=metas'], ['atividades', '/atividades']]
let problemas = 0
for (const w of [1366, 1280, 1100, 1024, 820, 390]) {
  await page.setViewportSize({ width: w, height: 768 })
  for (const [n, p, acao] of telas) {
    await page.goto('http://localhost:5183' + p); await page.waitForTimeout(1300)
    if (acao) await acao().catch(() => {})
    // elementos com texto que passam da borda do próprio container rolável ou da janela
    const fora = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const out = []
      const pageScroll = document.documentElement.scrollWidth > vw + 1
      if (pageScroll) out.push('PÁGINA com rolagem lateral (' + document.documentElement.scrollWidth + ' > ' + vw + ')')
      for (const el of document.querySelectorAll('.conv-col, .chat-messages')) {
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'hidden') out.push('coluna rola de lado: ' + (el.className || el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth)
      }
      for (const el of document.querySelectorAll('button, span, b, a')) {
        const r = el.getBoundingClientRect()
        if (!r.width || !el.textContent.trim()) continue
        // dentro de algo que rola de lado (quadro Kanban, tabela, abas) dá pra alcançar rolando: não é corte
        let a = el.parentElement, rolavel = false
        while (a && a !== document.body) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll') { rolavel = true; break } a = a.parentElement }
        if (rolavel) continue
        const box = el.closest('.conv-col, .chat-messages, main')
        const lim = box ? box.getBoundingClientRect().right : vw
        if (r.right > lim + 2 && r.left < lim && getComputedStyle(el).position !== 'fixed') out.push('cortado: "' + el.textContent.trim().slice(0, 30) + '" (' + Math.round(r.right) + ' > ' + Math.round(lim) + ')')
      }
      return [...new Set(out)].slice(0, 6)
    })
    if (fora.length) { problemas++; console.log(`✗ ${n} @${w}px:\n   ` + fora.join('\n   ')); await page.screenshot({ path: `${OUT}/resp-${n}-${w}.png` }) }
    else console.log(`✓ ${n} @${w}px`)
  }
}
console.log(problemas ? `${problemas} tela(s) com problema` : 'nenhum texto saindo da tela')
await browser.close()

// Prints do Manual (docs/ajuda) com contorno + seta + número no botão — roda contra o CRM LOCAL com a
// empresa de demonstração (server/scripts/seed-demo-manual.sql). Nada aqui toca a produção.
//   node docs/ajuda/_tools/captura.cjs docs/ajuda/_tools/prints.json [filtro]
// Cada print: { file, user, route, steps: [{click|fill|press|hover|wait|goto}], marks: [{sel, text, pos}], clip }
//   sel = seletor do Playwright (css, text=..., :has-text(...)); pos = right|left|top|bottom (onde fica o balão)
//   clip = seletor da área a recortar (sem clip = tela inteira 1440x900)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.CRM_URL || 'http://localhost:5183';
const OUT = path.resolve(__dirname, '../../../public/ajuda');
const COR = '#e0115f';

async function marcar(page, marks, area) {
  const boxes = [];
  for (const m of marks) {
    if (m.xy) { boxes.push({ x: m.xy[0], y: m.xy[1], width: m.xy[2], height: m.xy[3], text: m.text, pos: m.pos || 'right', dx: m.dx || 0, dy: m.dy || 0, gap: m.gap }); continue; }
    const el = page.locator(m.sel).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox({ timeout: 4000 }).catch(() => null);
    if (!b) { console.warn('  ! não achei', m.sel); continue; }
    boxes.push({ ...b, text: m.text, pos: m.pos || 'right', dx: m.dx || 0, dy: m.dy || 0, gap: m.gap });
  }
  await page.evaluate(({ boxes, COR, area }) => {
    document.querySelectorAll('.__manual').forEach(e => e.remove());
    const W = window.innerWidth, H = window.innerHeight;
    const A = area ? { x: area[0], y: area[1], r: area[0] + area[2], b: area[1] + area[3] } : { x: 0, y: 0, r: W, b: H };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', '__manual');
    Object.assign(svg.style, { position: 'fixed', inset: '0', width: W + 'px', height: H + 'px', zIndex: 2147483646, pointerEvents: 'none' });
    svg.innerHTML = `<defs><marker id="seta" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${COR}"/></marker></defs>`;
    document.body.appendChild(svg);
    const usados = [];
    const bate = (x, y, w, h) => usados.some(u => x < u.x + u.w + 6 && x + w + 6 > u.x && y < u.y + u.h + 6 && y + h + 6 > u.y);
    boxes.forEach((b, i) => {
      const pad = 4;
      const r = { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, rx: 6, fill: 'none', stroke: COR, 'stroke-width': 3 }).forEach(([k, v]) => rect.setAttribute(k, v));
      svg.appendChild(rect);
      // balão com número + texto, a ~70px do contorno, e a seta do balão até o contorno
      const label = document.createElement('div');
      label.className = '__manual';
      label.innerHTML = `<b style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${COR};color:#fff;font-size:13px;margin-right:8px;flex:none">${i + 1}</b><span>${b.text || ''}</span>`;
      Object.assign(label.style, { position: 'fixed', zIndex: 2147483647, display: 'flex', alignItems: 'center', maxWidth: '260px', padding: '8px 12px', background: '#fff', border: `2px solid ${COR}`, borderRadius: '10px', boxShadow: '0 6px 18px rgba(0,0,0,.18)', font: '600 13.5px/1.35 system-ui, sans-serif', color: '#3a1020', pointerEvents: 'none' });
      document.body.appendChild(label);
      const lw = label.offsetWidth, lh = label.offsetHeight, gap = b.gap ?? 70;
      let lx, ly, ax, ay;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (b.pos === 'left') { lx = r.x - gap - lw; ly = cy - lh / 2; ax = r.x - 2; ay = cy; }
      else if (b.pos === 'top') { lx = cx - lw / 2; ly = r.y - gap - lh; ax = cx; ay = r.y - 2; }
      else if (b.pos === 'bottom') { lx = cx - lw / 2; ly = r.y + r.h + gap; ax = cx; ay = r.y + r.h + 2; }
      else { lx = r.x + r.w + gap; ly = cy - lh / 2; ax = r.x + r.w + 2; ay = cy; }
      lx += b.dx; ly += b.dy;
      const prende = () => { lx = Math.max(A.x + 8, Math.min(A.r - lw - 8, lx)); ly = Math.max(A.y + 8, Math.min(A.b - lh - 8, ly)); };
      prende();
      // empurra pra baixo (ou pra cima, se não couber) até não bater em outro balão
      for (let t = 0, dir = 1; t < 30 && bate(lx, ly, lw, lh); t++) { ly += dir * (lh / 2); if (ly + lh > A.b - 8) { dir = -1; } prende(); }
      usados.push({ x: lx, y: ly, w: lw, h: lh });
      Object.assign(label.style, { left: lx + 'px', top: ly + 'px' });
      // ponto de saída da seta: borda do balão mais perto do alvo
      const sx = Math.max(lx, Math.min(lx + lw, ax)), sy = Math.max(ly, Math.min(ly + lh, ay));
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1: sx, y1: sy, x2: ax, y2: ay, stroke: COR, 'stroke-width': 3, 'marker-end': 'url(#seta)' }).forEach(([k, v]) => line.setAttribute(k, v));
      svg.appendChild(line);
    });
  }, { boxes, COR, area });
}

(async () => {
  const [specFile, filtro] = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const sessoes = {};
  const pagina = async (user) => {
    if (sessoes[user]) return sessoes[user];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('  PAGEERROR', e.message));
    await page.goto(BASE + '/login');
    await page.fill('input[type=email]', user);
    await page.fill('input[type=password]', '123456');
    await page.keyboard.press('Enter');
    await page.waitForURL(u => !String(u).includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1200);
    return (sessoes[user] = page);
  };
  for (const s of spec) {
    if (filtro && !s.file.includes(filtro)) continue;
    const page = await pagina(s.user);
    await page.evaluate(() => document.querySelectorAll('.__manual').forEach(e => e.remove())).catch(() => {});
    if (s.route) { await page.goto(BASE + s.route); await page.waitForTimeout(s.waitRoute ?? 2200); }
    for (const st of s.steps || []) {
      if (st.goto) { await page.goto(BASE + st.goto); await page.waitForTimeout(1800); }
      if (st.click) { const l = page.locator(st.click).first(); await l.click({ timeout: 5000 }).catch(() => l.click({ force: true, timeout: 5000 })).catch(e => console.warn('  ! clique falhou', st.click, String(e.message).slice(0, 120))); }
      if (st.fill) await page.locator(st.fill[0]).first().fill(st.fill[1]);
      if (st.type) await page.locator(st.type[0]).first().pressSequentially(st.type[1], { delay: 30 });
      if (st.press) await page.keyboard.press(st.press);
      if (st.hover) await page.locator(st.hover).first().hover();
      if (st.clickxy) await page.mouse.click(st.clickxy[0], st.clickxy[1]);
      await page.waitForTimeout(st.wait ?? 700);
    }
    await page.mouse.move(1430, 890);
    if (s.marks?.length) await marcar(page, s.marks, s.area);
    const opts = { path: path.join(OUT, s.file + '.png') };
    // area: [x, y, largura, altura] — recorta só a parte que interessa (o print fica maior no artigo)
    if (s.area) opts.clip = { x: s.area[0], y: s.area[1], width: s.area[2], height: s.area[3] };
    if (s.clip) { const b = await page.locator(s.clip).first().boundingBox(); if (b) opts.clip = { x: Math.max(0, b.x - 10), y: Math.max(0, b.y - 10), width: Math.min(1440, b.width + 20), height: Math.min(900, b.height + 20) }; }
    await page.screenshot(opts);
    console.log('ok', s.file);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

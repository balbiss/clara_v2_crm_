// Gera o PDF do Manual (public/ajuda/Manual-CRM-Clara-Ferreira.pdf) com os MESMOS artigos de docs/ajuda/*.md
// que aparecem no menu Ajuda do CRM: capa, sumário por grupo e um artigo por página, com os prints.
//   node docs/ajuda/_tools/pdf.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '../../..');
const DOCS = path.join(RAIZ, 'docs/ajuda');
const PUB = path.join(RAIZ, 'public');
const SAIDA = path.join(PUB, 'ajuda/Manual-CRM-Clara-Ferreira.pdf');

const artigos = fs.readdirSync(DOCS).filter(f => /^\d+-.*\.md$/.test(f)).sort().map(f => {
  const bruto = fs.readFileSync(path.join(DOCS, f), 'utf8');
  const m = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const meta = {};
  if (m) m[1].split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return { id: f.replace(/\.md$/, ''), titulo: meta.titulo || f, grupo: meta.grupo || 'Geral', perfis: meta.perfis || 'Todos', resumo: meta.resumo || '', corpo: m ? m[2] : bruto };
});

// imagens /ajuda/x.png -> arquivo local (o Chrome abre a página via file://)
const img = html => html.replace(/src="\/([^"]+)"/g, (_, p) => `src="${'file:///' + path.join(PUB, p).replace(/\\/g, '/')}"`);
const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

const grupos = [];
artigos.forEach(a => { let g = grupos.find(x => x.nome === a.grupo); if (!g) grupos.push(g = { nome: a.grupo, itens: [] }); g.itens.push(a); });

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual do CRM — Clara Ferreira</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #313942; font-size: 11.5pt; line-height: 1.5 }
  .capa { height: 255mm; display: flex; flex-direction: column; justify-content: center; text-align: center; background: linear-gradient(160deg, #f0d0d7, #fff 70%); border-radius: 10px; page-break-after: always }
  .capa h1 { font-size: 34pt; color: #5a2433; margin: 0 0 8px; letter-spacing: .02em }
  .capa .sub { font-size: 14pt; color: #8e2a46 }
  .capa .data { margin-top: 40px; color: #92989b; font-size: 10.5pt }
  .sumario { page-break-after: always }
  .sumario h2 { color: #5a2433; font-size: 20pt; margin: 0 0 14px }
  .sumario .g { font-size: 9.5pt; font-weight: 700; text-transform: uppercase; color: #92989b; margin: 14px 0 4px; letter-spacing: .05em }
  .sumario a { display: block; color: #313942; text-decoration: none; padding: 3px 0; border-bottom: 1px dotted #ddd }
  .sumario a small { color: #92989b }
  .artigo { page-break-before: always }
  .meta { font-size: 9.5pt; color: #92989b; margin-bottom: 2px }
  h1 { font-size: 21pt; color: #5a2433; margin: 0 0 8px }
  h2 { font-size: 14.5pt; color: #5a2433; margin: 20px 0 6px; padding-top: 8px; border-top: 1px solid #e3e5e8; page-break-after: avoid }
  h3 { font-size: 12pt; margin: 14px 0 4px; page-break-after: avoid }
  img { max-width: 100%; max-height: 150mm; display: block; margin: 8px auto 2px; border: 1px solid #e3e5e8; border-radius: 6px; page-break-inside: avoid }
  img + em { display: block; text-align: center; font-size: 9.5pt; color: #92989b; margin-bottom: 10px }
  p:has(img) { page-break-inside: avoid }
  blockquote { margin: 10px 0; padding: 8px 12px; background: #fcf0f3; border-left: 4px solid #c8506a; border-radius: 4px; page-break-inside: avoid }
  blockquote p { margin: 3px 0 }
  table { border-collapse: collapse; width: 100%; font-size: 10.5pt; margin: 8px 0; page-break-inside: avoid }
  th, td { border: 1px solid #e3e5e8; padding: 5px 8px; text-align: left; vertical-align: top }
  th { background: #faf3f5 }
  code { background: #f3f3f3; padding: 0 4px; border-radius: 3px }
</style></head><body>
<div class="capa"><h1>Manual do CRM</h1><div class="sub">Clara Ferreira Semijoias</div><div class="data">Atualizado em ${hoje}<br>Também disponível dentro do CRM, no menu <b>Ajuda</b>.</div></div>
<div class="sumario"><h2>Sumário</h2>${grupos.map(g => `<div class="g">${g.nome}</div>${g.itens.map(a => `<a href="#${a.id}">${a.titulo} <small>— ${a.resumo}</small></a>`).join('')}`).join('')}</div>
${artigos.map(a => `<section class="artigo" id="${a.id}"><div class="meta">${a.grupo} · Para: ${a.perfis}</div>${img(marked.parse(a.corpo))}</section>`).join('\n')}
</body></html>`;

(async () => {
  const tmp = path.join(DOCS, '_tools', '_manual.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 180000 });
  await page.pdf({ path: SAIDA + '.tmp', format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8pt;color:#92989b;width:100%;text-align:center">Manual do CRM — Clara Ferreira · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' } });
  await browser.close();
  fs.renameSync(SAIDA + '.tmp', SAIDA);
  fs.unlinkSync(tmp);
  console.log('PDF:', SAIDA, `(${artigos.length} artigos)`);
})().catch(e => { console.error(e); process.exit(1); });

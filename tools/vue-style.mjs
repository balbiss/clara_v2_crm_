// Extrai o <style scoped> de um .vue da Clara v1 e gera um .scss "escopado" pra versão React:
// tudo fica dentro de `.vs-<Nome>` (o componente React envolve a tela num <div className="vs-Nome"
// style={{display:'contents'}}>), imitando o scoped do Vue sem mudar uma linha do CSS original.
//   node tools/vue-style.mjs <arquivo.vue> <saida.scss> <Nome>
import fs from 'node:fs';

const [, , input, output, name] = process.argv;
const src = fs.readFileSync(input, 'utf8');
const blocks = [...src.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
let scoped = '', global = '';
for (const [, attrs, css] of blocks) {
  if (/scoped/.test(attrs)) scoped += css + '\n';
  else global += css + '\n';
}
// :deep(x) / ::v-deep x → x (no wrapper tudo é descendente mesmo)
const undeep = s => s.replace(/:deep\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1').replace(/::v-deep\s*/g, '');
// @use/@import precisam ficar no topo
const hoisted = [];
scoped = scoped.replace(/^\s*@(use|import)[^;]+;\s*$/gm, m => { hoisted.push(m.trim()); return ''; });
let out = `// GERADO de ${input.split(/[\/]/).slice(-2).join('/')} (Clara v1) — não editar à mão; rode tools/vue-style.mjs\n`;
out += hoisted.join('\n') + (hoisted.length ? '\n' : '');
if (global.trim()) out += `\n// <style> global do componente\n${undeep(global)}\n`;
if (scoped.trim()) out += `\n.vs-${name} {\n${undeep(scoped)}\n}\n`;
fs.writeFileSync(output, out);
console.log(`${output}: ${scoped.split('\n').length} linhas escopadas, ${global.split('\n').length} globais`);

#!/usr/bin/env node
// Aperçu visuel : rend chaque schéma déclaratif et chaque carte mentale en SVG (+ PNG si possible),
// et chaque leçon en HTML simple, pour que l'IA CONTRÔLE VISUELLEMENT son travail avant livraison.
// Usage : node skill/tools/preview.mjs pack.json [dossier_sortie]   (défaut : ./preview-out)
// PNG : utilise Playwright (npx playwright install chromium) ou @resvg/resvg-js s'ils sont installés.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const eng = (f) => import(path.join(here, '../../src/engine/', f));
const { renderDiagram } = await eng('diagram.js');
const { layoutMindmap, renderMindmap } = await eng('mindmap.js');
const { renderMarkdown } = await eng('markdown.js');
const { validatePack } = await eng('validate.js');
const { LIGHT } = await eng('palette.js');

const file = process.argv[2];
const outDir = path.resolve(process.argv[3] || 'preview-out');
if (!file) { console.error('Usage : node skill/tools/preview.mjs <pack.json> [sortie]'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const r = validatePack(raw);
if (!r.pack) { console.error('Fichier inutilisable :', r.errors.join(' | ')); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const assets = Object.fromEntries((r.pack.assets || []).filter((a) => a.data).map((a) => [a.id, `data:${a.mime || 'image/png'};base64,${a.data}`]));
const svgs = [];
for (const s of r.pack.subjects) for (const c of s.courses) {
  for (const d of c.diagrams) {
    if (d.type === 'script') { fs.writeFileSync(path.join(outDir, `${c.id}__${d.id}.script.html`), scriptPage(d)); console.log(`• ${c.id}/${d.id} : visuel JS → ouvre le .script.html (ou capture via Playwright)`); svgs.push({ name: `${c.id}__${d.id}`, html: path.join(outDir, `${c.id}__${d.id}.script.html`), w: d.width, h: d.height }); continue; }
    const res = renderDiagram(d, { colors: 'light', assetUrl: (id) => assets[id] || null, idPrefix: 'p' });
    res.errors.forEach((e) => console.log(`⚠ ${c.id}/${d.id} : ${e}`));
    const label = c.items.filter((it) => it.type === 'label' && it.diagram === d.id);
    let svg = res.svg;
    // superpose les zones des exercices « label » pour vérifier leur position
    for (const it of label) svg = svg.replace('</svg>', it.zones.map((z, k) => `<g><rect x="${z.x / 100 * d.width - 40}" y="${z.y / 100 * d.height - 16}" width="80" height="32" rx="10" fill="none" stroke="${LIGHT.error}" stroke-dasharray="4 3"/><text x="${z.x / 100 * d.width}" y="${z.y / 100 * d.height}" font-size="11" text-anchor="middle" dominant-baseline="central" fill="${LIGHT.error}">${k + 1}. ${z.answer}</text></g>`).join('') + '</svg>');
    const f = path.join(outDir, `${c.id}__${d.id}.svg`); fs.writeFileSync(f, svg); svgs.push({ name: `${c.id}__${d.id}`, svg: f, w: d.width, h: d.height });
  }
  for (const m of c.mindmaps) {
    const L = layoutMindmap(m);
    const f = path.join(outDir, `${c.id}__${m.id}.svg`); fs.writeFileSync(f, renderMindmap(L, { colors: 'light', background: 'bg' }));
    svgs.push({ name: `${c.id}__${m.id}`, svg: f, w: L.bounds.w, h: L.bounds.h });
    console.log(`• carte ${c.id}/${m.id} : ${L.nodes.length} nœuds, ${Math.round(L.bounds.w)}×${Math.round(L.bounds.h)} px`);
  }
  for (const l of c.lessons) {
    const html = renderMarkdown(l.body, { math: (t, dsp) => `<code>${dsp ? '$$' : '$'}${t.replace(/</g, '&lt;')}${dsp ? '$$' : '$'}</code>`, embed: (k, id, cap) => `<p style="border:1px dashed #8E8371;padding:8px">[${k} « ${id} »${cap ? ' — ' + cap : ''}]</p>`, asset: (id) => assets[id] || null, source: (id) => r.pack.meta.sources.find((s) => s.id === id)?.label || id });
    fs.writeFileSync(path.join(outDir, `${c.id}__${l.id}.lesson.html`), `<!doctype html><meta charset="utf-8"><style>body{font:16px/24px Arial;max-width:390px;margin:20px auto;background:#F5EFE3;color:#26302B}.callout{background:#FFFBF3;border-radius:16px;padding:12px 16px;margin:12px 0}.t-over{font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}table{border-collapse:collapse}td,th{border:1px solid #DDD3C1;padding:4px 8px}</style>${html}`);
  }
}

// PNG
const req = createRequire(pathToFileURL(process.cwd() + '/'));
let pw = null, resvg = null;
try { pw = await import(req.resolve('playwright')); } catch (e) { /* absent */ }
if (!pw) try { resvg = await import(req.resolve('@resvg/resvg-js')); } catch (e) { /* absent */ }
if (pw) {
  const b = await (pw.chromium || pw.default.chromium).launch();
  const page = await b.newPage({ deviceScaleFactor: 2 });
  for (const s of svgs) {
    const url = s.html ? pathToFileURL(s.html).href : null;
    if (url) { await page.setViewportSize({ width: 360, height: 400 }); await page.goto(url); await page.waitForTimeout(600); }
    else { await page.setViewportSize({ width: Math.ceil(Math.min(s.w, 2400)), height: Math.ceil(Math.min(s.h, 2400)) }); await page.setContent(`<body style="margin:0">${fs.readFileSync(s.svg, 'utf8').replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="100%"')}</body>`); }
    await page.screenshot({ path: path.join(outDir, s.name + '.png'), fullPage: true });
  }
  await b.close(); console.log(`PNG générés avec Playwright dans ${outDir}`);
} else if (resvg) {
  for (const s of svgs.filter((x) => x.svg)) fs.writeFileSync(path.join(outDir, s.name + '.png'), new resvg.Resvg(fs.readFileSync(s.svg, 'utf8'), { fitTo: { mode: 'zoom', value: 2 } }).render().asPng());
  console.log(`PNG générés avec resvg dans ${outDir}`);
} else console.log(`SVG générés dans ${outDir}. Pour des PNG : npm i playwright && npx playwright install chromium (ou npm i @resvg/resvg-js), puis relance.`);
console.log('Ouvre les PNG (ou SVG) et vérifie : textes lisibles, rien ne se chevauche, zones de légende au bon endroit.');

function scriptPage(d) {
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#F5EFE3"><canvas id="c" style="width:100%"></canvas><div id="k"></div><p id="err" style="color:#A42E3A"></p><script>
var W=${+d.width || 360},H=${+d.height || 240},C=${JSON.stringify(LIGHT)},cv=document.getElementById('c');cv.width=W*2;cv.height=H*2;var ctx=cv.getContext('2d');ctx.scale(2,2);
window.onerror=function(m){document.getElementById('err').textContent='ERREUR : '+m;};
</script><script>/* Aperçu simplifié : l'API complète (api.axes, api.plot, api.slider…) est fournie par l'app. Teste le rendu final dans l'app. */</script></body>`;
}

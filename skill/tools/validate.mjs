#!/usr/bin/env node
// Validateur de fichier Tomette — à lancer AVANT de livrer.
// Usage : node skill/tools/validate.mjs pack.json   (ou pack.zip)
// Code de sortie : 0 = importable sans perte, 1 = des éléments seraient ignorés, 2 = fichier inutilisable.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { validatePack, itemTitle } = await import(path.join(here, '../../src/engine/validate.js'));

const file = process.argv[2];
if (!file) { console.error('Usage : node skill/tools/validate.mjs <pack.json|pack.zip>'); process.exit(2); }
let raw;
try {
  if (file.endsWith('.zip')) {
    const { execSync } = await import('child_process');
    const list = execSync(`unzip -Z1 "${file}"`).toString().split('\n').filter(Boolean);
    const j = list.find((p) => /pack[^/]*\.json$/i.test(p)) || list.find((p) => p.endsWith('.json'));
    if (!j) throw new Error('aucun .json dans le zip');
    raw = JSON.parse(execSync(`unzip -p "${file}" "${j}"`, { maxBuffer: 1 << 28 }).toString());
    const base = j.includes('/') ? j.slice(0, j.lastIndexOf('/') + 1) : '';
    for (const a of raw.assets || []) if (a.file && !a.data) {
      if (!list.includes(base + a.file)) console.log(`✗ asset « ${a.id} » : fichier ${a.file} absent du zip`);
      else a.data = 'x'; // présence vérifiée
    }
  } else raw = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) { console.error('✗ Fichier illisible :', e.message); process.exit(2); }

const r = validatePack(raw);
const line = (c, t) => console.log(`${c} ${t}`);
console.log(`\n=== ${r.pack?.meta.title || file} ===`);
console.log(`Classeurs ${r.stats.subjects} · cours ${r.stats.courses} · leçons ${r.stats.lessons} · cartes ${r.stats.mindmaps} · schémas ${r.stats.diagrams} · exercices ${r.stats.items} · images ${r.stats.assets}`);
console.log('Par type :', Object.entries(r.stats.byType).map(([k, v]) => `${k} ${v}`).join(', ') || '—');
if (r.hasScripts) line('ℹ', 'Contient des visuels JavaScript (exécutés en bac à sable, désactivables par l\'utilisateur).');
r.errors.forEach((e) => line('✗ IGNORÉ', e));
r.warnings.forEach((e) => line('⚠', e));
r.infos.forEach((e) => line('ℹ', e));

// Contrôles qualité supplémentaires (règle « sans rien inventer » et confort mobile)
const q = [];
for (const s of r.pack?.subjects || []) for (const c of s.courses) {
  for (const it of c.items) {
    if (!it.source) q.push(`« ${c.title} » › ${it.id} : pas de "source" (d'où vient cette information ?)`);
    if (it.type === 'mcq' && it.choices.length > 6) q.push(`« ${c.title} » › ${it.id} : ${it.choices.length} choix, c'est beaucoup sur téléphone`);
    if (['cloze', 'label', 'match', 'categorize'].includes(it.type) && !(it.decoys || []).length) q.push(`« ${c.title} » › ${it.id} : aucune étiquette piège ("decoys") pour le mode difficile`);
    if (it.type === 'flashcard' && String(it.back).length > 400) q.push(`« ${c.title} » › ${it.id} : verso long (${String(it.back).length} car.) — une fiche = une idée`);
    if ((it.type === 'exam' || it.type === 'quick') && !it.lines) q.push(`« ${c.title} » › ${it.id} : précise "lines" (taille de réponse attendue)`);
  }
  const titles = new Map();
  c.items.forEach((it) => { const t = itemTitle(it).toLowerCase(); if (t && titles.has(t)) q.push(`« ${c.title} » : questions en double (${titles.get(t)} et ${it.id})`); titles.set(t, it.id); });
}
q.forEach((x) => line('·', x));

const bytes = Buffer.byteLength(JSON.stringify(raw));
console.log(`\nTaille : ${(bytes / 1024).toFixed(0)} Ko`);
if (!r.pack) { console.log('\nRÉSULTAT : fichier INUTILISABLE.'); process.exit(2); }
if (r.errors.length) { console.log(`\nRÉSULTAT : importable, mais ${r.errors.length} élément(s) seraient ignorés. Corrige-les.`); process.exit(1); }
console.log(`\nRÉSULTAT : OK, importable sans perte${r.warnings.length ? ` (${r.warnings.length} avertissement(s) à relire)` : ''}.`);
process.exit(0);

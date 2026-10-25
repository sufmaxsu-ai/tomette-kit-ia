// Validation + normalisation d'un fichier importé « tomette-pack ».
// Utilisé par l'application (import partiel avec rapport) ET par skill/tools/validate.mjs (contrôle par l'IA).
import { lintMarkdown } from './markdown.js';
import { renderDiagram, SHAPE_TYPES } from './diagram.js';
import { normalizeMindmap, LAYOUTS } from './mindmap.js';
import { ICONS } from './icon-data.js';
import { TONES } from './palette.js';

export const FORMAT = 'tomette-pack';
export const FORMAT_VERSION = 1;
export const ITEM_TYPES = {
  flashcard: { label: 'Fiches', icon: 'layers', auto: true },
  mcq: { label: 'QCM', icon: 'list-checks', auto: true },
  truefalse: { label: 'Vrai ou faux', icon: 'toggle', auto: true },
  quick: { label: 'Questions rapides', icon: 'circle-help', auto: false },
  exam: { label: 'Type examen', icon: 'pen-line', auto: false },
  short: { label: 'Réponse courte', icon: 'text-cursor', auto: true },
  match: { label: 'Associer', icon: 'arrow-right-left', auto: true },
  order: { label: 'Remettre en ordre', icon: 'list-ordered', auto: true },
  cloze: { label: 'Texte à trous', icon: 'puzzle', auto: true },
  label: { label: 'Schéma à légender', icon: 'tags', auto: true, beta: true },
  categorize: { label: 'Classement', icon: 'grid', auto: true, beta: true }
};
export const LIMITS = { scriptChars: 60000, assetBytes: 4 * 1024 * 1024, packBytes: 40 * 1024 * 1024, items: 5000, text: 20000 };
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const arr = (v) => Array.isArray(v);
export const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';

/**
 * @returns { ok, pack (normalisé, éléments invalides retirés), errors[], warnings[], infos[], stats, hasScripts }
 *  - errors   : éléments IGNORÉS à l'import (avec la raison)
 *  - warnings : importés mais à vérifier
 */
export function validatePack(input) {
  const errors = [], warnings = [], infos = [];
  const stats = { subjects: 0, courses: 0, lessons: 0, mindmaps: 0, diagrams: 0, items: 0, byType: {}, assets: 0, withSource: 0 };
  let hasScripts = false;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Le fichier ne contient pas un objet JSON.'], warnings, infos, stats, pack: null };
  if (input.format === 'tomette-backup') return { ok: false, backup: true, errors: ['Ce fichier est une sauvegarde complète, pas un fichier de cours.'], warnings, infos, stats, pack: null };
  if (input.format !== FORMAT) warnings.push(`Champ "format" attendu : "${FORMAT}" (lecture tentée quand même).`);
  if (input.version && input.version > FORMAT_VERSION) warnings.push(`Version ${input.version} plus récente que celle gérée (${FORMAT_VERSION}).`);

  const meta = typeof input.meta === 'object' && input.meta ? input.meta : {};
  const sources = arr(meta.sources) ? meta.sources.filter((s) => s && str(s.id)).map((s) => ({ id: String(s.id), label: String(s.label || s.id), type: s.type || 'document', url: str(s.url) && /^https?:\/\//.test(s.url) ? s.url : null, note: s.note ? String(s.note) : null })) : [];
  const sourceIds = new Set(sources.map((s) => s.id));
  const assets = [];
  const assetIds = new Set();
  (arr(input.assets) ? input.assets : []).forEach((a, k) => {
    if (!a || !str(a.id)) { errors.push(`assets[${k}] : identifiant manquant, image ignorée.`); return; }
    if (assetIds.has(a.id)) { errors.push(`assets[${k}] : identifiant « ${a.id} » en double.`); return; }
    let mime = a.mime, data = a.data;
    if (str(data) && data.startsWith('data:')) { const m = data.match(/^data:([^;]+);base64,(.*)$/s); if (m) { mime = mime || m[1]; data = m[2]; } }
    if (!str(data) && !str(a.file)) { errors.push(`assets « ${a.id} » : ni "data" (base64) ni "file" (chemin dans le .zip).`); return; }
    if (str(data) && data.length * 0.75 > LIMITS.assetBytes) { errors.push(`assets « ${a.id} » : image trop lourde (max ${LIMITS.assetBytes / 1048576} Mo).`); return; }
    if (mime && !MIMES.includes(mime)) { errors.push(`assets « ${a.id} » : type ${mime} non autorisé (${MIMES.join(', ')}).`); return; }
    assetIds.add(a.id); assets.push({ id: String(a.id), mime: mime || null, data: str(data) ? data : null, file: str(a.file) ? a.file : null, alt: a.alt ? String(a.alt) : '' });
  });
  stats.assets = assets.length;

  const subjects = [];
  const seenSubjects = new Set(), seenCourses = new Set();
  if (!arr(input.subjects) || !input.subjects.length) errors.push('Aucun classeur : la clé "subjects" doit être une liste non vide.');
  (arr(input.subjects) ? input.subjects : []).forEach((s, si) => {
    const where = `classeur ${si + 1}`;
    if (!s || !str(s.title)) { errors.push(`${where} : "title" manquant, classeur ignoré.`); return; }
    let sid = str(s.id) ? String(s.id) : slug(s.title);
    if (!ID_RE.test(sid)) { warnings.push(`${where} : identifiant « ${sid} » invalide, remplacé.`); sid = slug(s.title); }
    if (seenSubjects.has(sid)) { errors.push(`${where} : identifiant « ${sid} » en double.`); return; }
    seenSubjects.add(sid);
    const subj = {
      id: sid, title: String(s.title).slice(0, 80), description: s.description ? String(s.description) : '',
      icon: s.icon && ICONS[s.icon] ? s.icon : 'book', tone: TONES.includes(s.tone || s.color) ? (s.tone || s.color) : null,
      examDate: str(s.examDate) && /^\d{4}-\d{2}-\d{2}$/.test(s.examDate) ? s.examDate : null, level: s.level ? String(s.level) : '', courses: []
    };
    if (s.icon && !ICONS[s.icon]) warnings.push(`${where} : icône « ${s.icon} » inconnue, remplacée par « book ».`);
    stats.subjects++;
    (arr(s.courses) ? s.courses : []).forEach((c, ci) => {
      const cw = `« ${s.title} » › cours ${ci + 1}`;
      if (!c || !str(c.title)) { errors.push(`${cw} : "title" manquant, cours ignoré.`); return; }
      let cid = str(c.id) ? String(c.id) : `${sid}-${slug(c.title)}`;
      if (!ID_RE.test(cid)) { warnings.push(`${cw} : identifiant invalide, remplacé.`); cid = `${sid}-${slug(c.title)}`; }
      if (seenCourses.has(cid)) { errors.push(`${cw} : identifiant de cours « ${cid} » en double.`); return; }
      seenCourses.add(cid);
      const course = { id: cid, title: String(c.title).slice(0, 120), summary: c.summary ? String(c.summary) : '', order: typeof c.order === 'number' ? c.order : ci, lessons: [], mindmaps: [], diagrams: [], items: [] };
      const cwhere = `« ${course.title} »`;
      // schémas
      const diagIds = new Set();
      (arr(c.diagrams) ? c.diagrams : []).forEach((d, k) => {
        if (!d || !str(d.id) || !ID_RE.test(d.id)) { errors.push(`${cwhere} › diagrams[${k}] : "id" manquant ou invalide.`); return; }
        if (diagIds.has(d.id)) { errors.push(`${cwhere} › schéma « ${d.id} » en double.`); return; }
        const W = Number(d.width) || 360, H = Number(d.height) || 240;
        if (d.type === 'script') {
          if (!str(d.code)) { errors.push(`${cwhere} › schéma « ${d.id} » : "code" manquant.`); return; }
          if (d.code.length > LIMITS.scriptChars) { errors.push(`${cwhere} › schéma « ${d.id} » : code trop long (max ${LIMITS.scriptChars} caractères).`); return; }
          if (/\b(fetch|XMLHttpRequest|WebSocket|importScripts|localStorage|indexedDB|document\.cookie|parent\.|top\.)/.test(d.code)) warnings.push(`${cwhere} › schéma « ${d.id} » : le code utilise une API bloquée dans le bac à sable (réseau, stockage ou fenêtre parente).`);
          hasScripts = true;
          diagIds.add(d.id);
          course.diagrams.push({ id: d.id, type: 'script', title: d.title ? String(d.title) : '', width: W, height: H, code: d.code, animated: !!d.animated, interactive: !!d.interactive, alt: d.alt ? String(d.alt) : '' });
        } else {
          if (!arr(d.shapes)) { errors.push(`${cwhere} › schéma « ${d.id} » : "shapes" doit être une liste.`); return; }
          const bad = []; (function f(list) { list.forEach((sh) => { if (!sh || !SHAPE_TYPES.includes(sh.type)) bad.push(sh && sh.type); else if (sh.type === 'group') f(sh.shapes || []); if (sh && sh.type === 'image' && !assetIds.has(sh.asset)) warnings.push(`${cwhere} › schéma « ${d.id} » : image « ${sh.asset} » absente des assets.`); }); })(d.shapes);
          if (bad.length) warnings.push(`${cwhere} › schéma « ${d.id} » : formes inconnues ignorées (${[...new Set(bad)].join(', ')}).`);
          const res = renderDiagram({ ...d, width: W, height: H }, { colors: 'light' });
          res.errors.forEach((e) => warnings.push(`${cwhere} › schéma « ${d.id} » : ${e}.`));
          diagIds.add(d.id);
          course.diagrams.push({ id: d.id, type: 'shapes', title: d.title ? String(d.title) : '', width: W, height: H, background: d.background || 'none', shapes: d.shapes, alt: d.alt ? String(d.alt) : '' });
        }
        stats.diagrams++;
      });
      // cartes mentales
      const mmIds = new Set();
      (arr(c.mindmaps) ? c.mindmaps : []).forEach((m, k) => {
        if (!m || !str(m.id) || !ID_RE.test(m.id)) { errors.push(`${cwhere} › mindmaps[${k}] : "id" manquant ou invalide.`); return; }
        if (!m.root || !str(m.root.text)) { errors.push(`${cwhere} › carte « ${m.id} » : "root.text" manquant.`); return; }
        if (m.layout && !LAYOUTS.includes(m.layout)) warnings.push(`${cwhere} › carte « ${m.id} » : disposition « ${m.layout} » inconnue (radial utilisé).`);
        const tree = normalizeMindmap(m);
        tree.all.forEach((n) => { if (n.icon && !ICONS[n.icon]) warnings.push(`${cwhere} › carte « ${m.id} » : icône « ${n.icon} » inconnue (ignorée).`); });
        (arr(m.links) ? m.links : []).forEach((l) => { if (!tree.byId[l.from] || !tree.byId[l.to]) warnings.push(`${cwhere} › carte « ${m.id} » : lien ${l.from} → ${l.to} vers un nœud inconnu (donne un "id" aux nœuds reliés).`); });
        if (tree.all.length > 400) warnings.push(`${cwhere} › carte « ${m.id} » : ${tree.all.length} nœuds, c'est beaucoup pour un écran de téléphone.`);
        mmIds.add(m.id);
        course.mindmaps.push({ ...m, id: m.id, title: str(m.title) ? m.title : m.root.text });
        stats.mindmaps++;
      });
      // cours (leçons)
      const lessonsIn = arr(c.lessons) ? c.lessons : (c.lesson ? [c.lesson] : []);
      const lessonIds = new Set();
      lessonsIn.forEach((l, k) => {
        if (!l || !str(l.body)) { errors.push(`${cwhere} › lessons[${k}] : "body" manquant.`); return; }
        const lid = str(l.id) && ID_RE.test(l.id) ? l.id : `lecon-${k + 1}`;
        if (lessonIds.has(lid)) { errors.push(`${cwhere} › leçon « ${lid} » en double.`); return; }
        lessonIds.add(lid);
        const lint = lintMarkdown(l.body);
        lint.issues.forEach((x) => warnings.push(`${cwhere} › leçon « ${lid} » : ${x}.`));
        lint.refs.diagram.forEach((id) => { if (!diagIds.has(id)) warnings.push(`${cwhere} › leçon « ${lid} » : schéma « ${id} » introuvable dans ce cours.`); });
        lint.refs.mindmap.forEach((id) => { if (!mmIds.has(id)) warnings.push(`${cwhere} › leçon « ${lid} » : carte mentale « ${id} » introuvable dans ce cours.`); });
        lint.refs.image.forEach((id) => { if (!assetIds.has(id)) warnings.push(`${cwhere} › leçon « ${lid} » : image « ${id} » absente des assets.`); });
        lint.refs.source.forEach((id) => { if (!sourceIds.has(id)) warnings.push(`${cwhere} › leçon « ${lid} » : source « ${id} » non déclarée dans meta.sources.`); });
        if (l.body.length > LIMITS.text * 5) warnings.push(`${cwhere} › leçon « ${lid} » très longue : pense à la découper.`);
        course.lessons.push({ id: lid, title: str(l.title) ? String(l.title) : course.title, body: l.body, minutes: Number(l.minutes) || Math.max(1, Math.round(l.body.split(/\s+/).length / 180)), source: l.source || null });
        stats.lessons++;
      });
      // exercices
      const itemIds = new Set();
      (arr(c.items) ? c.items : []).forEach((it, k) => {
        const iw = `${cwhere} › items[${k}]${it && it.id ? ` (${it.id})` : ''}`;
        if (!it || !ITEM_TYPES[it.type]) { errors.push(`${iw} : type « ${it && it.type} » inconnu. Types : ${Object.keys(ITEM_TYPES).join(', ')}.`); return; }
        const id = str(it.id) && ID_RE.test(it.id) ? it.id : null;
        if (!id) { errors.push(`${iw} : "id" manquant ou invalide (lettres, chiffres, - _ .).`); return; }
        if (itemIds.has(id)) { errors.push(`${iw} : identifiant en double dans le cours.`); return; }
        const problem = checkItem(it, diagIds, assetIds);
        if (problem) { errors.push(`${iw} : ${problem}`); return; }
        const n = normalizeItem(it);
        if (n.source) { stats.withSource++; String(n.source).split(/[\s,;]+/).forEach((sid) => { const key = sid.split(':')[0]; if (sourceIds.size && key && !sourceIds.has(key) && /^[\w.-]+$/.test(key) && key === sid) warnings.push(`${iw} : source « ${key} » non déclarée dans meta.sources.`); }); }
        itemIds.add(id); course.items.push(n);
        stats.items++; stats.byType[it.type] = (stats.byType[it.type] || 0) + 1;
      });
      if (!course.lessons.length && !course.items.length && !course.mindmaps.length && !course.diagrams.length) warnings.push(`${cwhere} : cours vide.`);
      subj.courses.push(course); stats.courses++;
    });
    subjects.push(subj);
  });
  if (stats.items && sources.length && stats.withSource < stats.items * 0.5) infos.push(`${stats.items - stats.withSource} exercice(s) sur ${stats.items} sans champ "source". Indiquer la source rassure sur l'exactitude.`);
  if (!sources.length) infos.push('Aucune source déclarée dans meta.sources.');
  const pack = { format: FORMAT, version: FORMAT_VERSION, meta: { title: str(meta.title) ? meta.title : (subjects[0]?.title || 'Import'), author: meta.author || '', generator: meta.generator || '', createdAt: meta.createdAt || null, language: meta.language || 'fr', request: meta.request || '', notes: meta.notes || '', sources }, subjects, assets };
  return { ok: errors.length === 0, pack: subjects.length ? pack : null, errors, warnings, infos, stats, hasScripts };
}

function checkItem(it, diagIds, assetIds) {
  const need = (k) => (str(it[k]) ? null : `champ "${k}" manquant`);
  switch (it.type) {
    case 'flashcard': return need('front') || need('back');
    case 'mcq': {
      if (!str(it.question)) return 'champ "question" manquant';
      if (!arr(it.choices) || it.choices.length < 2) return 'au moins 2 "choices" requis';
      if (it.choices.some((c) => !c || !str(typeof c === 'string' ? c : c.text))) return 'un choix n\'a pas de "text"';
      if (!it.choices.some((c) => c && c.correct === true)) return 'aucun choix marqué "correct": true';
      return null;
    }
    case 'truefalse': return need('statement') || (typeof it.answer === 'boolean' ? null : '"answer" doit valoir true ou false');
    case 'quick': return need('question') || need('answer');
    case 'exam': return need('question') || (str(it.answer) || (arr(it.steps) && it.steps.length) ? null : '"answer" (corrigé) ou "steps" requis');
    case 'short': return need('question') || (arr(it.answers) && it.answers.some(str) ? null : '"answers" (liste des réponses acceptées) requis');
    case 'match': return arr(it.pairs) && it.pairs.length >= 2 && it.pairs.every((p) => p && str(p.left) && str(p.right)) ? null : 'au moins 2 "pairs" { left, right } requises';
    case 'order': return arr(it.items) && it.items.length >= 2 && it.items.every(str) ? null : 'au moins 2 "items" (dans le bon ordre) requis';
    case 'cloze': return str(it.text) && /\{\{[^}]+\}\}/.test(it.text) ? null : '"text" avec au moins un trou {{réponse}} requis';
    case 'label': {
      if (!str(it.diagram) && !str(it.image)) return '"diagram" (id de schéma) ou "image" (id d\'asset) requis';
      if (str(it.diagram) && !diagIds.has(it.diagram)) return `schéma « ${it.diagram} » introuvable dans ce cours (déclare-le dans "diagrams")`;
      if (str(it.image) && !assetIds.has(it.image)) return `image « ${it.image} » absente des assets`;
      if (!arr(it.zones) || !it.zones.length) return '"zones" requises';
      if (it.zones.some((z) => !z || typeof z.x !== 'number' || typeof z.y !== 'number' || !str(z.answer))) return 'chaque zone exige x, y (en % de 0 à 100) et "answer"';
      if (it.zones.some((z) => z.x < 0 || z.x > 100 || z.y < 0 || z.y > 100)) return 'x et y des zones sont des pourcentages (0 à 100)';
      return null;
    }
    case 'categorize': return arr(it.categories) && it.categories.length >= 2 && it.categories.every((c) => c && str(c.name) && arr(c.items) && c.items.length) ? null : 'au moins 2 "categories" { name, items[] } requises';
  }
  return 'type inconnu';
}

const LINES_DEFAULT = { quick: 3, exam: 8, short: 1 };
export function normalizeItem(it) {
  const base = { id: it.id, type: it.type, source: it.source ? String(it.source) : null, tags: arr(it.tags) ? it.tags.map(String) : [], hint: it.hint ? String(it.hint) : null, explanation: it.explanation ? String(it.explanation) : null, difficulty: [1, 2, 3].includes(it.difficulty) ? it.difficulty : 2 };
  switch (it.type) {
    case 'flashcard': return { ...base, front: it.front, back: it.back, reversible: !!it.reversible };
    case 'mcq': {
      const choices = it.choices.map((c) => (typeof c === 'string' ? { text: c, correct: false } : { text: String(c.text), correct: c.correct === true, explanation: c.explanation ? String(c.explanation) : null }));
      return { ...base, question: it.question, choices, multiple: typeof it.multiple === 'boolean' ? it.multiple : choices.filter((c) => c.correct).length > 1, shuffle: it.shuffle !== false };
    }
    case 'truefalse': return { ...base, statement: it.statement, answer: it.answer, correction: it.correction ? String(it.correction) : null };
    case 'quick': return { ...base, question: it.question, answer: it.answer, lines: num(it.lines, LINES_DEFAULT.quick) };
    case 'exam': return { ...base, question: it.question, context: it.context ? String(it.context) : null, answer: it.answer || '', points: num(it.points, 0) || (arr(it.steps) ? it.steps.reduce((s, x) => s + (Number(x.points) || 0), 0) : 0), steps: arr(it.steps) ? it.steps.filter((x) => x && str(x.text)).map((x) => ({ text: String(x.text), points: Number(x.points) || 0, detail: x.detail ? String(x.detail) : null })) : [], lines: num(it.lines, LINES_DEFAULT.exam), duration: num(it.duration, 0) };
    case 'short': return { ...base, question: it.question, answers: it.answers.filter(str).map(String), caseSensitive: !!it.caseSensitive, accents: !!it.accents, tolerance: typeof it.tolerance === 'number' ? it.tolerance : null, unit: it.unit ? String(it.unit) : null, lines: 1 };
    case 'match': return { ...base, prompt: it.prompt || 'Associe chaque élément.', pairs: it.pairs.map((p) => ({ left: String(p.left), right: String(p.right) })), decoys: arr(it.decoys) ? it.decoys.filter(str).map(String) : [] };
    case 'order': return { ...base, prompt: it.prompt || 'Remets dans le bon ordre.', items: it.items.map(String) };
    case 'cloze': return { ...base, prompt: it.prompt || 'Complète le texte.', text: it.text, decoys: arr(it.decoys) ? it.decoys.filter(str).map(String) : [] };
    case 'label': return { ...base, prompt: it.prompt || 'Place chaque étiquette au bon endroit.', diagram: it.diagram || null, image: it.image || null, zones: it.zones.map((z, i) => ({ id: z.id || `z${i + 1}`, x: z.x, y: z.y, answer: String(z.answer) })), decoys: arr(it.decoys) ? it.decoys.filter(str).map(String) : [] };
    case 'categorize': return { ...base, prompt: it.prompt || 'Range chaque étiquette dans la bonne catégorie.', categories: it.categories.map((c) => ({ name: String(c.name), items: c.items.filter(str).map(String) })), decoys: arr(it.decoys) ? it.decoys.filter(str).map(String) : [] };
  }
  return base;
}
function num(v, d) { const n = Number(v); return isFinite(n) && n >= 0 ? Math.min(n, 40) : d; }

/** Texte principal d'un exercice (listes, recherche, export). */
export function itemTitle(it) {
  return String(it.front || it.question || it.statement || it.prompt || it.text || '').replace(/\{\{([^}|]+)(\|[^}]*)?\}\}/g, '…').replace(/[*_=`$#>]/g, '').trim();
}

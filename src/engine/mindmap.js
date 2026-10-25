// Moteur de cartes mentales : l'IA fournit l'arborescence + des options, le moteur calcule la disposition.
// Dispositions : "radial" (par défaut), "balanced" (gauche/droite), "tree" (vers la droite), "tree-down".
import { makeColorResolver } from './palette.js';
import { wrapText, textWidth, escXml } from './diagram.js';
import { ICONS } from './icon-data.js';

export const LAYOUTS = ['radial', 'balanced', 'tree', 'tree-down'];
export const MM_TONES = ['accent', 'info', 'success', 'highlight', 'neutral'];
const TONE_STROKE = { accent: 'accent', info: 'info', success: 'success', highlight: 'highlight', neutral: 'border-strong' };
const TONE_FILL = { accent: 'accent-soft', info: 'info-soft', success: 'success-soft', highlight: 'highlight-soft', neutral: 'surface-2' };

const STYLE = [
  { size: 20, lh: 26, padX: 20, padY: 14, maxW: 200, display: true, bold: true },
  { size: 15, lh: 20, padX: 14, padY: 10, maxW: 168, display: false, bold: true },
  { size: 14, lh: 19, padX: 12, padY: 8, maxW: 152, display: false, bold: false }
];

/** Normalise l'arbre : identifiants, profondeur, ton de branche. */
export function normalizeMindmap(spec) {
  let auto = 0;
  const ids = new Set();
  const palette = Array.isArray(spec.palette) && spec.palette.length ? spec.palette.filter((t) => MM_TONES.includes(t)) : MM_TONES.slice(0, 4);
  function walk(n, depth, tone, parent) {
    if (!n || typeof n !== 'object') n = { text: String(n ?? '') };
    let id = n.id && !ids.has(String(n.id)) ? String(n.id) : `n${auto++}`;
    while (ids.has(id)) id = `n${auto++}`;
    ids.add(id);
    const own = MM_TONES.includes(n.color) ? n.color : null;
    const t = depth === 0 ? 'neutral' : own || tone;
    const node = {
      id, text: String(n.text ?? ''), icon: typeof n.icon === 'string' ? n.icon : null, tone: t,
      note: n.note ? String(n.note) : null, shape: n.shape || null, emphasis: !!n.emphasis,
      collapsed: !!n.collapsed, weight: typeof n.weight === 'number' ? Math.max(0.2, Math.min(10, n.weight)) : 1,
      depth, parent, children: []
    };
    const kids = Array.isArray(n.children) ? n.children : [];
    node.children = kids.map((c, i) => walk(c, depth + 1, depth === 0 ? (MM_TONES.includes(c?.color) ? c.color : palette[i % palette.length]) : t, node));
    return node;
  }
  const root = walk(spec.root || { text: spec.title || 'Carte' }, 0, 'neutral', null);
  const all = []; (function f(n) { all.push(n); n.children.forEach(f); })(root);
  if (spec.collapseDepth) all.forEach((n) => { if (n.depth >= spec.collapseDepth && n.children.length) n.collapsed = true; });
  return { root, all, byId: Object.fromEntries(all.map((n) => [n.id, n])) };
}

function measure(n, opts) {
  const st = STYLE[Math.min(n.depth, 2)];
  const maxW = Math.min(opts.maxNodeWidth || 999, st.maxW) * (n.depth === 0 && opts.rootWidth ? opts.rootWidth / st.maxW : 1);
  const hasIcon = n.icon && ICONS[n.icon] && n.depth <= 2;
  const iconW = hasIcon ? 18 + 8 : 0;
  const lines = wrapText(n.text, st.size, maxW - iconW, st.display, st.bold || n.emphasis);
  const tw = Math.max(...lines.map((l) => textWidth(l, st.size, st.display, st.bold || n.emphasis)), 8);
  n.lines = lines; n.st = st; n.hasIcon = !!hasIcon;
  n.w = Math.round(tw + iconW + st.padX * 2);
  n.h = Math.round(lines.length * st.lh + st.padY * 2);
  if (n.depth === 0 && (n.shape === 'circle' || opts.rootShape === 'circle')) { const d = Math.max(n.w, n.h) + 8; n.w = d; n.h = d; n.circle = true; }
}

/**
 * Calcule la disposition.
 * @param spec mindmap { root, layout, spacing, levelGap, startAngle, sweep, edgeStyle, rootShape, maxNodeWidth, links, collapseDepth, palette }
 * @param collapsedIds Set d'identifiants repliés (état de l'interface) ; si absent, utilise "collapsed" du fichier.
 */
export function layoutMindmap(spec, collapsedIds) {
  const tree = normalizeMindmap(spec);
  const opts = {
    layout: LAYOUTS.includes(spec.layout) ? spec.layout : 'radial',
    spacing: clamp(spec.spacing, 4, 80, 16), levelGap: clamp(spec.levelGap, 16, 200, 48),
    startAngle: typeof spec.startAngle === 'number' ? spec.startAngle : -90, sweep: clamp(spec.sweep, 60, 360, 360),
    edgeStyle: ['curve', 'straight', 'elbow'].includes(spec.edgeStyle) ? spec.edgeStyle : 'curve',
    rootShape: spec.rootShape, maxNodeWidth: spec.maxNodeWidth, rootWidth: spec.rootWidth
  };
  const isCollapsed = (n) => (collapsedIds ? collapsedIds.has(n.id) : n.collapsed);
  const visible = [];
  (function f(n) { visible.push(n); n.hidden = false; n.vis = isCollapsed(n) ? [] : n.children; n.hiddenCount = isCollapsed(n) ? countDesc(n) : 0; n.vis.forEach(f); })(tree.root);
  tree.all.forEach((n) => { if (!visible.includes(n)) n.hidden = true; });
  visible.forEach((n) => measure(n, opts));

  if (opts.layout === 'radial') radial(tree.root, visible, opts);
  else if (opts.layout === 'balanced') balanced(tree.root, opts);
  else treeLayout(tree.root, opts, opts.layout === 'tree-down' ? 'down' : 'right', 1);

  // Arêtes
  const edges = [];
  visible.forEach((n) => n.vis.forEach((c) => edges.push({ from: n, to: c, path: edgePath(n, c, opts) })));
  const links = (Array.isArray(spec.links) ? spec.links : []).map((l) => {
    const a = tree.byId[l.from], b = tree.byId[l.to];
    if (!a || !b || a.hidden || b.hidden) return null;
    return { from: a, to: b, label: l.label ? String(l.label) : '', ...linkPath(a, b, l.bend) };
  }).filter(Boolean);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  visible.forEach((n) => { minX = Math.min(minX, n.x - n.w / 2 - 14); maxX = Math.max(maxX, n.x + n.w / 2 + 14); minY = Math.min(minY, n.y - n.h / 2 - 14); maxY = Math.max(maxY, n.y + n.h / 2 + 14); });
  links.forEach((l) => { minX = Math.min(minX, l.cx - 20); maxX = Math.max(maxX, l.cx + 20); minY = Math.min(minY, l.cy - 20); maxY = Math.max(maxY, l.cy + 20); });
  return { tree, nodes: visible, edges, links, opts, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

function clamp(v, a, b, d) { return typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }
function countDesc(n) { let c = 0; (function f(m) { m.children.forEach((k) => { c++; f(k); }); })(n); return c; }

function radial(root, visible, opts) {
  const weight = (n) => (n.wt = n.vis.length ? n.vis.reduce((s, c) => s + weight(c), 0) : Math.max(1, n.h / 34) * n.weight);
  weight(root);
  const full = opts.sweep >= 359.9;
  const a0 = opts.startAngle * Math.PI / 180, span = opts.sweep * Math.PI / 180;
  (function assign(n, s, e) {
    n.angle = (s + e) / 2;
    let cur = s;
    const tot = n.vis.reduce((q, c) => q + c.wt, 0) || 1;
    n.vis.forEach((c) => { const part = (e - s) * c.wt / tot; assign(c, cur, cur + part); cur += part; });
  })(root, full ? a0 : a0 - span / 2, full ? a0 + span : a0 + span / 2);
  // Centre en 0,0 ; rayons par profondeur
  const byDepth = [];
  visible.forEach((n) => { (byDepth[n.depth] = byDepth[n.depth] || []).push(n); });
  const radExt = (n) => Math.abs(n.w * Math.cos(n.angle)) + Math.abs(n.h * Math.sin(n.angle));
  const tanExt = (n) => Math.abs(n.w * Math.sin(n.angle)) + Math.abs(n.h * Math.cos(n.angle));
  const R = [0];
  root.x = 0; root.y = 0;
  let prevMax = root.circle ? root.w : Math.max(root.w, root.h);
  for (let d = 1; d < byDepth.length; d++) {
    const ns = byDepth[d]; if (!ns) break;
    const curMax = Math.max(...ns.map(radExt));
    let r = R[d - 1] + prevMax / 2 + curMax / 2 + opts.levelGap;
    const sorted = [...ns].sort((a, b) => a.angle - b.angle);
    // Au-delà du 1er niveau, les voisins sont posés en quinconce sur deux rayons : la carte reste compacte.
    const stag = d >= 2 && sorted.length > 5;
    const step = stag ? 2 : 1;
    for (let i = 0; i < sorted.length; i++) {
      const j = i + step;
      if (j >= sorted.length && !full) continue;
      const a = sorted[i], b = sorted[j % sorted.length];
      if (a === b) continue;
      let dA = b.angle - a.angle; if (dA <= 0) dA += Math.PI * 2;
      dA = Math.min(dA, Math.PI);
      const need = (tanExt(a) + tanExt(b)) / 2 + opts.spacing;
      if (dA > 0.001) r = Math.max(r, need / (2 * Math.sin(dA / 2)));
    }
    if (stag) for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1], dA = Math.min(Math.abs(b.angle - a.angle), Math.PI);
      const need = (Math.min(tanExt(a), tanExt(b)) * 0.5 + opts.spacing);
      if (dA > 0.001) r = Math.max(r, need / (2 * Math.sin(dA / 2)));
    }
    R[d] = Math.min(r, 4000);
    const extra = stag ? curMax * 0.8 + 8 : 0;
    prevMax = curMax + extra;
    sorted.forEach((n, i) => { const rr = R[d] + (i % 2 ? extra : 0); n.x = Math.cos(n.angle) * rr; n.y = Math.sin(n.angle) * rr; n.r = rr; });
  }
  root.r = 0;
}

function treeLayout(root, opts, dir, side) {
  // dir "right" : profondeur sur x, empilement sur y. "down" : l'inverse.
  const D = dir === 'right' ? 'w' : 'h', B = dir === 'right' ? 'h' : 'w';
  const colSize = [];
  (function f(n) { colSize[n.depth] = Math.max(colSize[n.depth] || 0, n[D]); n.vis.forEach(f); })(root);
  const start = [0];
  for (let d = 1; d < colSize.length; d++) start[d] = start[d - 1] + (d === 1 ? colSize[0] / 2 : colSize[d - 1]) + opts.levelGap;
  let cursor = 0;
  (function place(n) {
    const depthPos = n.depth === 0 ? 0 : start[n.depth] + n[D] / 2;
    if (!n.vis.length) { n.b = cursor + n[B] / 2; cursor += n[B] + opts.spacing; }
    else {
      n.vis.forEach(place);
      const first = n.vis[0].b, last = n.vis[n.vis.length - 1].b;
      n.b = (first + last) / 2;
      if (cursor < n.b + n[B] / 2 + opts.spacing) cursor = n.b + n[B] / 2 + opts.spacing;
    }
    n.dp = depthPos * side;
  })(root);
  const mid = root.b;
  (function f(n) { if (dir === 'right') { n.x = n.dp; n.y = n.b - mid; } else { n.x = n.b - mid; n.y = n.dp; } n.dir = dir; n.side = side; n.vis.forEach(f); })(root);
}

function balanced(root, opts) {
  const kids = root.vis;
  const size = (n) => (n.vis.length ? n.vis.reduce((s, c) => s + size(c), 0) : n.h + opts.spacing);
  const total = kids.reduce((s, c) => s + size(c), 0);
  let acc = 0, split = kids.length;
  for (let i = 0; i < kids.length; i++) { if (acc + size(kids[i]) / 2 > total / 2) { split = i; break; } acc += size(kids[i]); }
  if (split === 0 && kids.length > 1) split = 1;
  const right = kids.slice(0, split), left = kids.slice(split).reverse();
  const make = (list, side) => {
    if (!list.length) return;
    const fake = { ...root, vis: list, children: list };
    treeLayout(fake, opts, 'right', side);
  };
  make(right, 1); make(left, -1);
  root.x = 0; root.y = 0; root.dir = 'right';
}

function edgePath(p, c, opts) {
  if (opts.edgeStyle === 'straight') return `M${r(p.x)} ${r(p.y)}L${r(c.x)} ${r(c.y)}`;
  if (opts.layout === 'radial') {
    if (opts.edgeStyle === 'elbow') return `M${r(p.x)} ${r(p.y)}L${r(c.x)} ${r(c.y)}`;
    const mr = p.depth === 0 ? (c.r * 0.45) : (p.r + c.r) / 2;
    const cx = Math.cos(c.angle) * mr, cy = Math.sin(c.angle) * mr;
    return `M${r(p.x)} ${r(p.y)}Q${r(cx)} ${r(cy)} ${r(c.x)} ${r(c.y)}`;
  }
  if (c.dir === 'down') {
    const y1 = p.y + p.h / 2, y2 = c.y - c.h / 2, my = (y1 + y2) / 2;
    return opts.edgeStyle === 'elbow' ? `M${r(p.x)} ${r(y1)}V${r(my)}H${r(c.x)}V${r(y2)}` : `M${r(p.x)} ${r(y1)}C${r(p.x)} ${r(my)} ${r(c.x)} ${r(my)} ${r(c.x)} ${r(y2)}`;
  }
  const s = c.side || 1;
  const x1 = p.x + s * p.w / 2, x2 = c.x - s * c.w / 2, mx = (x1 + x2) / 2;
  return opts.edgeStyle === 'elbow' ? `M${r(x1)} ${r(p.y)}H${r(mx)}V${r(c.y)}H${r(x2)}` : `M${r(x1)} ${r(p.y)}C${r(mx)} ${r(p.y)} ${r(mx)} ${r(c.y)} ${r(x2)} ${r(c.y)}`;
}

function linkPath(a, b, bend) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, k = (typeof bend === 'number' ? bend : 0.25) * L + (typeof bend === 'number' ? 0 : Math.max(0, 90 - L * 0.25));
  const cx = (a.x + b.x) / 2 - dy / L * k, cy = (a.y + b.y) / 2 + dx / L * k;
  const clip = (n, qx, qy) => {
    const ddx = n.x - qx, ddy = n.y - qy;
    const f = Math.min(Math.abs((n.w / 2 + 6) / (ddx || 1e-6)), Math.abs((n.h / 2 + 6) / (ddy || 1e-6)), 1);
    return [n.x - ddx * f, n.y - ddy * f];
  };
  const [sx, sy] = clip(a, cx, cy), [ex, ey] = clip(b, cx, cy);
  return { d: `M${r(sx)} ${r(sy)}Q${r(cx)} ${r(cy)} ${r(ex)} ${r(ey)}`, cx: (sx + 2 * cx + ex) / 4, cy: (sy + 2 * cy + ey) / 4 };
}
const r = (v) => Math.round(v * 10) / 10;

/**
 * Rendu SVG d'une disposition.
 * @param opts { colors: 'css'|'light'|'dark', interactive, idPrefix, fonts, background }
 */
export function renderMindmap(layout, opts = {}) {
  const C = makeColorResolver(opts.colors || 'css');
  const FD = opts.fonts?.display || "'Fraunces', Georgia, serif";
  const FB = opts.fonts?.body || "'Atkinson Hyperlegible', Arial, sans-serif";
  const pid = opts.idPrefix || 'mm';
  const { bounds } = layout;
  let edges = '', nodes = '', links = '';
  for (const e of layout.edges) {
    const tone = e.to.tone;
    const w = e.to.depth === 1 ? 3 : e.to.depth === 2 ? 2 : 1.5;
    edges += `<path d="${e.path}" fill="none" stroke="${C(TONE_STROKE[tone])}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  const mk = `${pid}-lk`;
  for (const l of layout.links) {
    links += `<path d="${l.d}" fill="none" stroke="${C('text-2')}" stroke-width="1.5" stroke-dasharray="5 5" stroke-linecap="round" marker-end="url(#${mk})"/>`;
    if (l.label) {
      const tw = textWidth(l.label, 12, false, true) + 12;
      links += `<rect x="${r(l.cx - tw / 2)}" y="${r(l.cy - 11)}" width="${r(tw)}" height="22" rx="6" fill="${C('bg')}"/><text x="${r(l.cx)}" y="${r(l.cy)}" text-anchor="middle" dominant-baseline="central" font-size="12" style="font-family:${FB};font-weight:700" fill="${C('text-2')}">${escXml(l.label)}</text>`;
    }
  }
  for (const n of layout.nodes) {
    const st = n.st, x = n.x - n.w / 2, y = n.y - n.h / 2;
    let fill, stroke, sw, txt;
    if (n.depth === 0) { fill = C('text-1'); stroke = 'none'; sw = 0; txt = C('bg'); }
    else if (n.depth === 1) { fill = C(TONE_FILL[n.tone]); stroke = C(TONE_STROKE[n.tone]); sw = 1.5; txt = C('text-1'); }
    else { fill = n.tone === 'highlight' && n.emphasis ? C('highlight-soft') : C('surface-1'); stroke = C(n.emphasis ? TONE_STROKE[n.tone] : 'border'); sw = n.emphasis ? 1.5 : 1; txt = C('text-1'); }
    const rx = n.circle ? n.w / 2 : n.depth === 0 ? Math.min(n.h / 2, 24) : n.depth === 1 ? 14 : 12;
    const dash = n.shape === 'note' ? ' stroke-dasharray="4 4"' : '';
    let g = `<rect x="${r(x)}" y="${r(y)}" width="${n.w}" height="${n.h}" rx="${r(rx)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
    const iconW = n.hasIcon ? 26 : 0;
    const textX = n.hasIcon ? x + st.padX + iconW : n.x;
    const anchor = n.hasIcon ? 'start' : 'middle';
    const ty0 = n.y - ((n.lines.length - 1) * st.lh) / 2;
    if (n.hasIcon) {
      const inner = ICONS[n.icon].map(([t, a]) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${escXml(v)}"`).join(' ')}/>`).join('');
      g += `<g transform="translate(${r(x + st.padX)} ${r(n.y - 9)}) scale(0.75)" fill="none" stroke="${txt}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
    }
    const font = st.display ? `font-family:${FD};font-variation-settings:'SOFT' 50;font-weight:600` : `font-family:${FB};font-weight:${st.bold || n.emphasis ? 700 : 400}`;
    g += `<text x="${r(textX)}" y="${r(ty0)}" text-anchor="${anchor}" dominant-baseline="central" font-size="${st.size}" style="${font}" fill="${txt}">` +
      n.lines.map((l, i) => `<tspan x="${r(textX)}" dy="${i ? st.lh : 0}">${escXml(l)}</tspan>`).join('') + '</text>';
    if (n.hiddenCount) {
      const side = layout.opts.layout === 'radial' ? [Math.cos(n.angle || 0), Math.sin(n.angle || 0)] : n.dir === 'down' ? [0, 1] : [n.side || 1, 0];
      const bx = n.x + side[0] * (n.w / 2 + 4), by = n.y + side[1] * (n.h / 2 + 4);
      const label = '+' + n.hiddenCount, bw = Math.max(24, textWidth(label, 12, false, true) + 12);
      g += `<rect x="${r(bx - bw / 2)}" y="${r(by - 12)}" width="${r(bw)}" height="24" rx="12" fill="${C('surface-1')}" stroke="${C(TONE_STROKE[n.tone])}" stroke-width="1.5"/><text x="${r(bx)}" y="${r(by)}" text-anchor="middle" dominant-baseline="central" font-size="12" style="font-family:${FB};font-weight:700" fill="${C('text-1')}">${label}</text>`;
    }
    if (n.note) {
      const nx = x + n.w - 2, ny = y + 2;
      g += `<circle cx="${r(nx)}" cy="${r(ny)}" r="5" fill="${C('accent')}" stroke="${C('bg')}" stroke-width="2"/>`;
    }
    nodes += opts.interactive ? `<g class="mm-node" data-id="${escXml(n.id)}" role="button" tabindex="0" aria-label="${escXml(n.text)}">${g}</g>` : g;
  }
  const defs = `<defs><marker id="${mk}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1.5 L8.5 5 L1 8.5" fill="none" stroke="${C('text-2')}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  const bg = opts.background ? `<rect x="${r(bounds.x)}" y="${r(bounds.y)}" width="${r(bounds.w)}" height="${r(bounds.h)}" fill="${C(opts.background)}"/>` : '';
  const inner = `${defs}${bg}<g class="mm-edges">${edges}</g><g class="mm-nodes">${nodes}</g><g class="mm-links">${links}</g>`;
  if (opts.innerOnly) return inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(bounds.x)} ${r(bounds.y)} ${r(bounds.w)} ${r(bounds.h)}" width="${Math.ceil(bounds.w)}" height="${Math.ceil(bounds.h)}">${inner}</svg>`;
}

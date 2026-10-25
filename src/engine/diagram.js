// Moteur de schémas DÉCLARATIFS → SVG (chaîne). Aucun code exécuté : uniquement des formes décrites.
// Fonctionne dans le navigateur et sous Node (aperçu / validation par l'IA).
import { makeColorResolver } from './palette.js';
import { compileExpr } from './expr.js';

export const SHAPE_TYPES = ['rect', 'circle', 'ellipse', 'line', 'arrow', 'polyline', 'polygon', 'path', 'text', 'label',
  'axes', 'plot', 'point', 'arc', 'image', 'group', 'grid', 'brace'];
export const TEXT_SIZES = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 28 };
export const ANIMATIONS = ['pulse', 'blink', 'draw', 'spin', 'float', 'flow', 'fade'];

export const escXml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const r2 = (v) => Math.round(v * 100) / 100;

/** Largeur approximative d'un texte (même heuristique partout : app, export, Node). */
export function textWidth(str, size, display = false, bold = false) {
  let w = 0;
  for (const ch of String(str)) {
    if (/[iljtf.,;:'!|ı ]/.test(ch)) w += 0.3;
    else if (/[mwMWŒœ]/.test(ch)) w += 0.85;
    else if (/[A-Z0-9ÀÂÉÈÊÎÔÛÇ]/.test(ch)) w += 0.64;
    else w += 0.53;
  }
  return w * size * (display ? 1.06 : 1) * (bold ? 1.06 : 1);
}
/** Découpe un texte en lignes pour une largeur max. Respecte les retours à la ligne explicites (\n). */
export function wrapText(str, size, maxWidth, display = false, bold = false) {
  const out = [];
  for (const para of String(str ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean); let line = '';
    if (!words.length) { out.push(''); continue; }
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (!line || textWidth(t, size, display, bold) <= maxWidth) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

function sizeOf(v, def = 15) {
  if (typeof v === 'number') return Math.max(10, Math.min(48, v));
  return TEXT_SIZES[v] || def;
}

/**
 * @param spec  { id, width, height, background?, shapes: [...] }
 * @param opts  { colors: 'css'|'light'|'dark', idPrefix, assetUrl(id) => url|null, fonts: {display, body} }
 */
export function renderDiagram(spec, opts = {}) {
  const C = makeColorResolver(opts.colors || 'css');
  const W = num(spec.width, 360), H = num(spec.height, 240);
  const pid = (opts.idPrefix || 'dg') + '-' + String(spec.id || 'x').replace(/[^\w-]/g, '');
  const FD = opts.fonts?.display || "'Fraunces', Georgia, serif";
  const FB = opts.fonts?.body || "'Atkinson Hyperlegible', Arial, sans-serif";
  const markers = new Map();
  const axesMap = {};
  const errors = [];
  let animUsed = false;

  function marker(color) {
    if (!markers.has(color)) markers.set(color, `${pid}-m${markers.size}`);
    return markers.get(color);
  }
  function common(s, defStroke = 'text-1', defFill = 'none') {
    const fill = s.fill !== undefined ? C(s.fill, defFill) : C(defFill, 'none');
    const stroke = s.stroke !== undefined ? C(s.stroke, defStroke) : C(defStroke, 'none');
    const sw = num(s.strokeWidth, 1.5);
    let a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    if (s.dash) a += ` stroke-dasharray="${typeof s.dash === 'string' && /^[\d .]+$/.test(s.dash) ? s.dash : '6 5'}"`;
    if (s.opacity !== undefined) a += ` opacity="${Math.max(0, Math.min(1, num(s.opacity, 1)))}"`;
    return { a, stroke, fill, sw };
  }
  function anim(s) {
    if (!s.animate) return '';
    const t = typeof s.animate === 'string' ? s.animate : s.animate.type;
    if (!ANIMATIONS.includes(t)) return '';
    animUsed = true;
    const dur = Math.max(300, Math.min(20000, num(s.animate.dur, t === 'spin' ? 6000 : 2000)));
    const delay = Math.max(0, num(s.animate.delay, 0));
    return ` class="dg-a dg-${t}" style="animation-duration:${dur}ms;animation-delay:${delay}ms"${t === 'draw' ? ' pathLength="1"' : ''}`;
  }
  // Conversion coordonnées « données » → pixels si la forme référence des axes.
  function P(s, x, y) {
    const ax = s.axes && axesMap[s.axes];
    if (!ax) return [num(x), num(y)];
    return [ax.x + (num(x) - ax.xmin) / (ax.xmax - ax.xmin) * ax.w, ax.y + ax.h - (num(y) - ax.ymin) / (ax.ymax - ax.ymin) * ax.h];
  }
  function textEl(x, y, str, s, defColor = 'text-1', defSize = 15, anchor = 'middle') {
    const size = sizeOf(s.size ?? s.textSize, defSize);
    const display = s.font === 'display';
    const bold = s.bold || s.weight === 'bold' || display;
    const lines = s.maxWidth ? wrapText(str, size, num(s.maxWidth, 200), display, bold) : String(str ?? '').split('\n');
    const lh = Math.round(size * 1.3);
    const color = C(s.color ?? s.textColor, defColor);
    const y0 = y - ((lines.length - 1) * lh) / 2;
    const rot = s.rotate ? ` transform="rotate(${num(s.rotate)} ${r2(x)} ${r2(y)})"` : '';
    const style = display ? `font-family:${FD};font-variation-settings:'SOFT' 50;font-weight:600` : `font-family:${FB};font-weight:${bold ? 700 : 400}`;
    const it = s.italic ? ';font-style:italic' : '';
    return `<text x="${r2(x)}" y="${r2(y0)}" text-anchor="${anchor}" dominant-baseline="central" fill="${color}" font-size="${size}" style="${style}${it}"${rot}${anim(s)}>` +
      lines.map((l, i) => `<tspan x="${r2(x)}" dy="${i ? lh : 0}">${escXml(l)}</tspan>`).join('') + '</text>';
  }
  function arrowAttrs(s, stroke, def = 'none') {
    const mode = s.arrow || def; if (mode === 'none') return '';
    const m = marker(stroke); let a = '';
    if (mode === 'end' || mode === 'both') a += ` marker-end="url(#${m})"`;
    if (mode === 'both' || mode === 'start') a += ` marker-start="url(#${m}-s)"`;
    return a;
  }

  function shape(s) {
    if (!s || typeof s !== 'object') return '';
    try {
      switch (s.type) {
        case 'rect': {
          const c = common(s, 'text-1', 'surface-1');
          const x = num(s.x), y = num(s.y), w = num(s.w, 80), h = num(s.h, 40), rr = num(s.r, 8);
          let o = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rr}" ${c.a}${anim(s)}/>`;
          if (s.text != null) o += textEl(x + w / 2, y + h / 2, s.text, { ...s, maxWidth: s.maxWidth ?? w - 12, animate: null });
          return o;
        }
        case 'circle': {
          const c = common(s, 'text-1', 'none');
          const [cx, cy] = P(s, s.cx ?? s.x, s.cy ?? s.y);
          let o = `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${num(s.r, 20)}" ${c.a}${anim(s)}/>`;
          if (s.text != null) o += textEl(cx, cy, s.text, { ...s, maxWidth: s.maxWidth ?? num(s.r, 20) * 1.7, animate: null });
          return o;
        }
        case 'ellipse': {
          const c = common(s, 'text-1', 'none');
          const [cx, cy] = P(s, s.cx ?? s.x, s.cy ?? s.y);
          let o = `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${num(s.rx, 40)}" ry="${num(s.ry, 24)}" ${c.a}${anim(s)}/>`;
          if (s.text != null) o += textEl(cx, cy, s.text, { ...s, maxWidth: s.maxWidth ?? num(s.rx, 40) * 1.6, animate: null });
          return o;
        }
        case 'line': case 'arrow': {
          const c = common(s, 'text-1');
          const [x1, y1] = P(s, s.x1, s.y1), [x2, y2] = P(s, s.x2, s.y2);
          const ar = arrowAttrs(s, c.stroke, s.type === 'arrow' ? 'end' : 'none');
          let o;
          if (s.curve) {
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
            const k = num(s.curve, 0);
            o = `<path d="M${r2(x1)} ${r2(y1)} Q${r2(mx - dy / L * k)} ${r2(my + dx / L * k)} ${r2(x2)} ${r2(y2)}" ${c.a}${ar}${anim(s)}/>`;
          } else o = `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" ${c.a}${ar}${anim(s)}/>`;
          if (s.text != null) o += textEl((x1 + x2) / 2 + num(s.textDx, 0), (y1 + y2) / 2 + num(s.textDy, -12), s.text, { ...s, size: s.size ?? 'sm', animate: null }, 'text-2', 13);
          return o;
        }
        case 'polyline': case 'polygon': {
          const c = common(s, 'text-1', s.type === 'polygon' ? 'surface-1' : 'none');
          const pts = (Array.isArray(s.points) ? s.points : []).map((pt) => P(s, pt[0], pt[1]));
          if (pts.length < 2) return '';
          if (s.smooth && s.type === 'polyline') {
            let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
              d += ` C${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(p1[1] + (p2[1] - p0[1]) / 6)} ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${r2(p2[0])} ${r2(p2[1])}`;
            }
            return `<path d="${d}" ${c.a}${arrowAttrs(s, c.stroke)}${anim(s)}/>`;
          }
          return `<${s.type} points="${pts.map((q) => r2(q[0]) + ',' + r2(q[1])).join(' ')}" ${c.a}${s.type === 'polyline' ? arrowAttrs(s, c.stroke) : ''}${anim(s)}/>`;
        }
        case 'path': {
          if (typeof s.d !== 'string' || !/^[MLHVCSQTAZmlhvcsqtaz0-9\s.,eE-]+$/.test(s.d)) { errors.push(`path « ${s.id || ''} » : attribut d invalide`); return ''; }
          const c = common(s, 'text-1');
          return `<path d="${s.d}" ${c.a}${arrowAttrs(s, c.stroke)}${anim(s)}/>`;
        }
        case 'text': {
          const [x, y] = P(s, s.x, s.y);
          const anchor = s.align === 'start' || s.align === 'left' ? 'start' : s.align === 'end' || s.align === 'right' ? 'end' : 'middle';
          return textEl(x, y, s.text, s, 'text-1', 15, anchor);
        }
        case 'label': {
          const [x, y] = P(s, s.x, s.y);
          const size = sizeOf(s.size, 13);
          const lines = wrapText(s.text, size, num(s.maxWidth, 160), false, true);
          const w = Math.max(...lines.map((l) => textWidth(l, size, false, true))) + 16, h = lines.length * Math.round(size * 1.3) + 10;
          const tone = s.tone || 'surface-2';
          const fill = C(tone.endsWith('-soft') || tone.startsWith('surface') ? tone : tone + '-soft', 'surface-2');
          return `<g${anim(s)}><rect x="${r2(x - w / 2)}" y="${r2(y - h / 2)}" width="${r2(w)}" height="${h}" rx="6" fill="${fill}" ${s.stroke ? `stroke="${C(s.stroke)}" stroke-width="1"` : ''}/>` +
            textEl(x, y, s.text, { ...s, bold: true, maxWidth: num(s.maxWidth, 160), animate: null }, 'text-1', 13) + '</g>';
        }
        case 'grid': {
          const x = num(s.x), y = num(s.y), w = num(s.w, W), h = num(s.h, H), st = Math.max(4, num(s.step, 20));
          let d = '';
          for (let gx = x; gx <= x + w + 0.01; gx += st) d += `M${r2(gx)} ${y}V${y + h}`;
          for (let gy = y; gy <= y + h + 0.01; gy += st) d += `M${x} ${r2(gy)}H${x + w}`;
          return `<path d="${d}" stroke="${C(s.color, 'border')}" stroke-width="1" fill="none"/>`;
        }
        case 'axes': {
          const ax = { x: num(s.x, 30), y: num(s.y, 10), w: num(s.w, W - 50), h: num(s.h, H - 40), xmin: num(s.xmin, -5), xmax: num(s.xmax, 5), ymin: num(s.ymin, -5), ymax: num(s.ymax, 5) };
          if (ax.xmax <= ax.xmin || ax.ymax <= ax.ymin) { errors.push('axes : bornes invalides'); return ''; }
          axesMap[s.id || 'axes'] = ax;
          const X = (v) => ax.x + (v - ax.xmin) / (ax.xmax - ax.xmin) * ax.w;
          const Y = (v) => ax.y + ax.h - (v - ax.ymin) / (ax.ymax - ax.ymin) * ax.h;
          const xs = num(s.xstep, niceStep(ax.xmax - ax.xmin)), ys = num(s.ystep, niceStep(ax.ymax - ax.ymin));
          const ox = Math.min(Math.max(0, ax.xmin), ax.xmax), oy = Math.min(Math.max(0, ax.ymin), ax.ymax);
          const axisColor = C(s.color, 'text-2');
          let o = '';
          if (s.grid !== false) {
            let d = '';
            for (let v = Math.ceil(ax.xmin / xs) * xs; v <= ax.xmax + 1e-9; v += xs) d += `M${r2(X(v))} ${ax.y}V${ax.y + ax.h}`;
            for (let v = Math.ceil(ax.ymin / ys) * ys; v <= ax.ymax + 1e-9; v += ys) d += `M${ax.x} ${r2(Y(v))}H${ax.x + ax.w}`;
            o += `<path d="${d}" stroke="${C('border')}" stroke-width="1" fill="none"/>`;
          }
          const m = marker(axisColor);
          o += `<line x1="${ax.x}" y1="${r2(Y(oy))}" x2="${ax.x + ax.w}" y2="${r2(Y(oy))}" stroke="${axisColor}" stroke-width="1.5" marker-end="url(#${m})"/>`;
          o += `<line x1="${r2(X(ox))}" y1="${ax.y + ax.h}" x2="${r2(X(ox))}" y2="${ax.y}" stroke="${axisColor}" stroke-width="1.5" marker-end="url(#${m})"/>`;
          if (s.ticks !== false) {
            const fmt = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');
            for (let v = Math.ceil(ax.xmin / xs) * xs; v <= ax.xmax - xs * 0.5 + 1e-9; v += xs) {
              if (Math.abs(v - ox) < 1e-9) continue;
              o += `<line x1="${r2(X(v))}" y1="${r2(Y(oy) - 3)}" x2="${r2(X(v))}" y2="${r2(Y(oy) + 3)}" stroke="${axisColor}" stroke-width="1.5"/>`;
              o += textEl(X(v), Y(oy) + 14, fmt(v), { size: 12 }, 'text-2', 12);
            }
            for (let v = Math.ceil(ax.ymin / ys) * ys; v <= ax.ymax - ys * 0.5 + 1e-9; v += ys) {
              if (Math.abs(v - oy) < 1e-9) continue;
              o += `<line x1="${r2(X(ox) - 3)}" y1="${r2(Y(v))}" x2="${r2(X(ox) + 3)}" y2="${r2(Y(v))}" stroke="${axisColor}" stroke-width="1.5"/>`;
              o += textEl(X(ox) - 6, Y(v), fmt(v), { size: 12 }, 'text-2', 12, 'end');
            }
            o += textEl(X(ox) - 8, Y(oy) + 14, 'O', { size: 12 }, 'text-2', 12, 'end');
          }
          if (s.xlabel) o += textEl(ax.x + ax.w, Y(oy) - 12, s.xlabel, { size: 13, italic: true }, 'text-1', 13, 'end');
          if (s.ylabel) o += textEl(X(ox) + 8, ax.y + 6, s.ylabel, { size: 13, italic: true }, 'text-1', 13, 'start');
          return o;
        }
        case 'plot': {
          const ax = axesMap[s.axes || 'axes'];
          if (!ax) { errors.push(`plot : axes « ${s.axes || 'axes'} » introuvables (déclarer les axes avant)`); return ''; }
          let f; try { f = compileExpr(s.fn); } catch (e) { errors.push(`plot « ${s.fn} » : ${e.message}`); return ''; }
          const a = num(s.from, ax.xmin), b = num(s.to, ax.xmax), n = Math.max(20, Math.min(800, num(s.samples, 240)));
          const c = common({ ...s, stroke: s.color ?? s.stroke }, 'accent');
          const params = s.params && typeof s.params === 'object' ? s.params : {};
          let d = '', pen = false;
          for (let i = 0; i <= n; i++) {
            const x = a + (b - a) * i / n, y = f({ ...params, x });
            if (!isFinite(y) || y < ax.ymin - (ax.ymax - ax.ymin) || y > ax.ymax + (ax.ymax - ax.ymin)) { pen = false; continue; }
            const px = ax.x + (x - ax.xmin) / (ax.xmax - ax.xmin) * ax.w, py = ax.y + ax.h - (y - ax.ymin) / (ax.ymax - ax.ymin) * ax.h;
            d += `${pen ? 'L' : 'M'}${r2(px)} ${r2(py)}`; pen = true;
          }
          const clip = `${pid}-clip-${s.axes || 'axes'}`;
          let o = `<clipPath id="${clip}-${r2(a)}${r2(b)}"><rect x="${ax.x}" y="${ax.y}" width="${ax.w}" height="${ax.h}"/></clipPath>`;
          o += `<path d="${d}" ${c.a.replace(/stroke-width="[^"]*"/, `stroke-width="${num(s.strokeWidth, 2.5)}"`)} clip-path="url(#${clip}-${r2(a)}${r2(b)})"${anim(s)}/>`;
          if (s.label) {
            const lx = num(s.labelX, b - (b - a) * 0.1), ly = f({ ...params, x: lx });
            if (isFinite(ly)) { const [px, py] = P({ axes: s.axes || 'axes' }, lx, ly); o += textEl(px, py - 14, s.label, { size: 13, italic: true, color: s.color }, 'accent', 13); }
          }
          return o;
        }
        case 'point': {
          const [x, y] = P(s, s.x, s.y);
          const col = C(s.color, 'text-1');
          let o = `<circle cx="${r2(x)}" cy="${r2(y)}" r="${num(s.r, 4)}" fill="${s.hollow ? C('surface-1') : col}" stroke="${col}" stroke-width="1.5"${anim(s)}/>`;
          if (s.label) {
            const pos = s.labelPos || 'ne';
            const dx = pos.includes('e') ? 8 : pos.includes('w') ? -8 : 0, dy = pos.includes('n') ? -12 : pos.includes('s') ? 14 : 0;
            o += textEl(x + dx, y + dy, s.label, { size: s.size ?? 13, bold: true }, 'text-1', 13, dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle');
          }
          if (s.guides && s.axes && axesMap[s.axes]) {
            const ax = axesMap[s.axes], [, oy] = P(s, 0, Math.min(Math.max(0, ax.ymin), ax.ymax)), [ox] = P(s, Math.min(Math.max(0, ax.xmin), ax.xmax), 0);
            o = `<path d="M${r2(x)} ${r2(y)}V${r2(oy)}M${r2(x)} ${r2(y)}H${r2(ox)}" stroke="${C('text-2')}" stroke-width="1" stroke-dasharray="4 4" fill="none"/>` + o;
          }
          return o;
        }
        case 'arc': {
          const c = common(s, 'text-1');
          const [cx, cy] = P(s, s.cx ?? s.x, s.cy ?? s.y);
          const rr = num(s.r, 30), a0 = num(s.start, 0) * Math.PI / 180, a1 = num(s.end, 90) * Math.PI / 180;
          const x0 = cx + rr * Math.cos(a0), y0 = cy + rr * Math.sin(a0), x1 = cx + rr * Math.cos(a1), y1 = cy + rr * Math.sin(a1);
          const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
          let o = `<path d="M${r2(x0)} ${r2(y0)} A${rr} ${rr} 0 ${large} ${sweep} ${r2(x1)} ${r2(y1)}" ${c.a}${arrowAttrs(s, c.stroke)}${anim(s)}/>`;
          if (s.text != null) { const am = (a0 + a1) / 2; o += textEl(cx + (rr + 14) * Math.cos(am), cy + (rr + 14) * Math.sin(am), s.text, { size: 13 }, 'text-1', 13); }
          return o;
        }
        case 'brace': {
          const c = common(s, 'text-2');
          const [x1, y1] = P(s, s.x1, s.y1), [x2, y2] = P(s, s.x2, s.y2);
          const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, k = num(s.depth, 10);
          const nx = -dy / L * k, ny = dx / L * k, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          let o = `<path d="M${r2(x1)} ${r2(y1)} Q${r2(x1 + nx)} ${r2(y1 + ny)} ${r2(x1 + nx + dx * 0.25)} ${r2(y1 + ny + dy * 0.25)} T${r2(mx + nx * 2)} ${r2(my + ny * 2)} M${r2(x2)} ${r2(y2)} Q${r2(x2 + nx)} ${r2(y2 + ny)} ${r2(x2 + nx - dx * 0.25)} ${r2(y2 + ny - dy * 0.25)} T${r2(mx + nx * 2)} ${r2(my + ny * 2)}" ${c.a}/>`;
          if (s.text != null) o += textEl(mx + nx * 3.4, my + ny * 3.4, s.text, { size: 13, maxWidth: s.maxWidth }, 'text-1', 13);
          return o;
        }
        case 'image': {
          const url = opts.assetUrl ? opts.assetUrl(s.asset) : null;
          const x = num(s.x), y = num(s.y), w = num(s.w, W), h = num(s.h, H);
          if (!url) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${C('surface-2')}"/>` + textEl(x + w / 2, y + h / 2, `image « ${s.asset} »`, { size: 13 }, 'text-2', 13);
          return `<image href="${escXml(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${s.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"${anim(s)}/>`;
        }
        case 'group': {
          const t = [];
          if (s.x || s.y) t.push(`translate(${num(s.x)} ${num(s.y)})`);
          if (s.rotate) t.push(`rotate(${num(s.rotate)})`);
          if (s.scale) t.push(`scale(${Math.max(0.05, Math.min(20, num(s.scale, 1)))})`);
          return `<g${t.length ? ` transform="${t.join(' ')}"` : ''}${s.opacity !== undefined ? ` opacity="${num(s.opacity, 1)}"` : ''}><g${anim(s)}>${(s.shapes || []).map(shape).join('')}</g></g>`;
        }
        default:
          errors.push(`forme inconnue « ${s.type} »`); return '';
      }
    } catch (e) { errors.push(`${s.type} : ${e.message}`); return ''; }
  }

  const bg = spec.background && spec.background !== 'none' ? `<rect width="${W}" height="${H}" fill="${C(spec.background, 'surface-1')}"/>` : '';
  const body = (spec.shapes || []).map(shape).join('');
  let defs = '';
  for (const [color, id] of markers) {
    defs += `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1.5 L8.5 5 L1 8.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
    defs += `<marker id="${id}-s" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M9 1.5 L1.5 5 L9 8.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
  }
  const style = animUsed ? `<style>.dg-a{transform-box:fill-box;transform-origin:center;animation-iteration-count:infinite;animation-timing-function:ease-in-out}.dg-pulse{animation-name:dgp}.dg-blink{animation-name:dgb}.dg-fade{animation-name:dgb;animation-iteration-count:1;animation-fill-mode:both}.dg-spin{animation-name:dgs;animation-timing-function:linear}.dg-float{animation-name:dgf}.dg-flow{stroke-dasharray:6 6;animation-name:dgfl;animation-timing-function:linear}.dg-draw{stroke-dasharray:1;animation-name:dgd;animation-iteration-count:1;animation-fill-mode:both}@keyframes dgp{50%{transform:scale(1.08)}}@keyframes dgb{0%{opacity:0}100%{opacity:1}}@keyframes dgs{to{transform:rotate(360deg)}}@keyframes dgf{50%{transform:translateY(-4px)}}@keyframes dgfl{to{stroke-dashoffset:-24}}@keyframes dgd{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}@media (prefers-reduced-motion: reduce){.dg-a{animation:none!important}}</style>` : '';
  const title = spec.title ? `<title>${escXml(spec.title)}</title>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${title}${style}<defs>${defs}</defs>${bg}${body}</svg>`;
  return { svg, errors, width: W, height: H, animated: animUsed };
}

function niceStep(range) {
  const raw = range / 8, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

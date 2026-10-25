// « Markdown enrichi » Tomette → HTML sûr. Le HTML brut n'est JAMAIS accepté (tout est échappé).
// ctx = { math(tex, display) => html, icon(name, size) => svg, embed(kind, id, caption) => html,
//         asset(id) => url|null, source(id) => label|null }
export const CALLOUTS = {
  definition: { label: 'Définition', icon: 'book-open' },
  theoreme: { label: 'Théorème', icon: 'sigma' },
  propriete: { label: 'Propriété', icon: 'sigma', cls: 'theoreme' },
  loi: { label: 'Loi', icon: 'scale', cls: 'theoreme' },
  exemple: { label: 'Exemple', icon: 'lightbulb' },
  methode: { label: 'Méthode', icon: 'list-checks' },
  attention: { label: 'Attention', icon: 'triangle-alert' },
  retenir: { label: 'À retenir', icon: 'bookmark' },
  remarque: { label: 'Remarque', icon: 'message' },
  astuce: { label: 'Astuce', icon: 'sparkle' },
  formule: { label: 'Formule', icon: 'sigma' },
  date: { label: 'Date clé', icon: 'calendar' },
  personnage: { label: 'Personnage', icon: 'users' },
  citation: { label: 'Citation', icon: 'quote', cls: 'remarque' }
};
export const BLOCK_DIRECTIVES = ['reveal', 'timeline', 'vocab', 'steps', 'columns', 'diagram', 'mindmap', 'image', 'source'];
export const ALL_DIRECTIVES = [...Object.keys(CALLOUTS), ...BLOCK_DIRECTIVES];

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const defaultCtx = {
  math: (tex, display) => `<code>${esc(display ? `$$${tex}$$` : `$${tex}$`)}</code>`,
  icon: () => '', embed: (k, id) => `<p>[${esc(k)} ${esc(id)}]</p>`, asset: () => null, source: (id) => id
};

/** Typographie française : espaces insécables fines avant ; : ! ? et dans les guillemets. */
function frTypo(s) {
  return s.replace(/ ([;:!?»%])/g, '\u202F$1').replace(/« /g, '«\u202F');
}

/** Rendu en ligne. */
export function inline(src, ctx = defaultCtx) {
  ctx = { ...defaultCtx, ...ctx };
  const keep = [];
  const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = String(src ?? '');
  // code en ligne
  s = s.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  // maths : \( \), $$ $$ en ligne, $ $
  s = s.replace(/\\\((.+?)\\\)/g, (_, t) => hold(ctx.math(t, false)));
  s = s.replace(/\$\$([^$]+?)\$\$/g, (_, t) => hold(ctx.math(t, true)));
  s = s.replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, pre, t) => pre + hold(ctx.math(t, false)));
  // liens [texte](https://...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => hold(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`));
  s = esc(s).replace(/\\\$/g, '$');
  s = s.replace(/\*\*(?=\S)([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=\S)([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/==(?=\S)([^=\n]+?)==/g, '<mark>$1</mark>')
    .replace(/~~(?=\S)([^~\n]+?)~~/g, '<del>$1</del>')
    .replace(/\^(?=\S)([^^\s]{1,20})\^/g, '<sup>$1</sup>')
    .replace(/,,(?=\S)([^,\s]{1,20}),,/g, '<sub>$1</sub>')
    .replace(/ {2,}\n|\\\n/g, '<br>');
  s = frTypo(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

/** Rendu des blocs. */
export function renderMarkdown(src, ctx = defaultCtx) {
  ctx = { ...defaultCtx, ...ctx };
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  return blocks(lines, ctx);
}

function blocks(lines, ctx) {
  const out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join('\n'), ctx)}</p>`); para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); i++; continue; }
    // bloc de code
    if (t.startsWith('```')) {
      flush(); const buf = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    // formule en bloc
    if (t.startsWith('$$')) {
      flush();
      if (t.length > 4 && t.endsWith('$$')) { out.push(`<div class="math-block">${ctx.math(t.slice(2, -2), true)}</div>`); i++; continue; }
      const buf = [t.slice(2)]; i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) buf.push(lines[i++]);
      if (i < lines.length) buf.push(lines[i].trim().slice(0, -2));
      i++; out.push(`<div class="math-block">${ctx.math(buf.join('\n').trim(), true)}</div>`); continue;
    }
    // directive :::type args
    const dm = t.match(/^:::\s*([a-zA-Zéè-]+)\s*(.*)$/);
    if (dm) {
      flush();
      const type = dm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const args = dm[2].trim();
      // directives sur une ligne
      if (['diagram', 'mindmap', 'image', 'source'].includes(type) && !hasClosing(lines, i)) { out.push(single(type, args, ctx)); i++; continue; }
      const buf = []; let depth = 1; i++;
      while (i < lines.length) {
        const tt = lines[i].trim();
        if (/^:::\s*[a-zA-Zéè-]+/.test(tt) && !isSingleLine(tt, lines, i)) depth++;
        else if (tt === ':::') { depth--; if (depth === 0) break; }
        buf.push(lines[i]); i++;
      }
      i++;
      out.push(directive(type, args, buf, ctx));
      continue;
    }
    // titres
    const hm = t.match(/^(#{1,4})\s+(.+)$/);
    if (hm) { flush(); const lv = hm[1].length; out.push(`<h${lv}>${inline(hm[2], ctx)}</h${lv}>`); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { flush(); out.push('<hr>'); i++; continue; }
    // tableau
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flush();
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = row(t); i += 2; const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) body.push(row(lines[i++]));
      out.push(`<div class="tbl-wrap" data-sb="x"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '', ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    // citation
    if (t.startsWith('>')) {
      flush(); const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push(`<blockquote>${blocks(buf, ctx)}</blockquote>`); continue;
    }
    // listes
    if (/^([-*+]|\d+[.)])\s+/.test(t)) {
      flush(); const res = list(lines, i, ctx); out.push(res.html); i = res.next; continue;
    }
    para.push(t); i++;
  }
  flush();
  return out.join('\n');
}

function isSingleLine(tt, lines, i) {
  const m = tt.match(/^:::\s*([a-zA-Z]+)/); if (!m) return false;
  return ['diagram', 'mindmap', 'image', 'source'].includes(m[1].toLowerCase()) && !hasClosing(lines, i);
}
// Une directive diagram/mindmap/image/source est « sur une ligne » sauf si la ligne suivante non vide est un contenu suivi de ':::'
function hasClosing(lines, i) {
  const next = lines[i + 1];
  return next !== undefined && next.trim() !== '' && !next.trim().startsWith(':::') && lines.slice(i + 1, i + 4).some((l) => l.trim() === ':::') && false;
}

function list(lines, start, ctx) {
  const baseIndent = lines[start].match(/^\s*/)[0].length;
  const ordered = /^\s*\d+[.)]/.test(lines[start]);
  const items = []; let i = start;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { if (i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1]) && lines[i + 1].match(/^\s*/)[0].length >= baseIndent) { i++; continue; } break; }
    const ind = l.match(/^\s*/)[0].length;
    const m = l.trim().match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (m && ind === baseIndent) { items.push({ text: [m[2]], sub: [] }); i++; continue; }
    if (ind > baseIndent && items.length) { items[items.length - 1].sub.push(l); i++; continue; }
    if (!m && items.length && ind >= baseIndent) { items[items.length - 1].text.push(l.trim()); i++; continue; }
    break;
  }
  const tag = ordered ? 'ol' : 'ul';
  const html = `<${tag}>${items.map((it) => {
    let body = inline(it.text.join(' '), ctx).replace(/^\[( |x)\]\s*/i, (_, c) => (c.trim() ? '☑ ' : '☐ '));
    if (it.sub.length) body += blocks(dedent(it.sub), ctx);
    return `<li>${body}</li>`;
  }).join('')}</${tag}>`;
  return { html, next: i };
}

function dedent(ls) {
  const min = Math.min(...ls.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  return ls.map((l) => l.slice(isFinite(min) ? min : 0));
}

function splitArgs(args) {
  const [a, ...rest] = args.split('|');
  return { main: a.trim(), caption: rest.join('|').trim() };
}

function single(type, args, ctx) {
  const { main, caption } = splitArgs(args);
  if (type === 'diagram' || type === 'mindmap') return ctx.embed(type, main, caption);
  if (type === 'image') {
    const url = ctx.asset(main);
    const img = url ? `<img src="${esc(url)}" alt="${esc(caption || main)}" loading="lazy">` : `<div class="sandbox-note">${ctx.icon('image', 20)}Image « ${esc(main)} » absente du fichier.</div>`;
    return `<figure class="figure"><div class="fig-canvas">${img}</div>${caption ? `<figcaption class="t-caption">${inline(caption, ctx)}</figcaption>` : ''}</figure>`;
  }
  if (type === 'source') {
    const [id, ...more] = main.split(/\s+/);
    const label = ctx.source(id) || id;
    const extra = [more.join(' '), caption].filter(Boolean).join(' · ');
    return `<p class="src-cite">${ctx.icon('book', 16)}<span>Source : ${esc(label)}${extra ? ' · ' + esc(extra) : ''}</span></p>`;
  }
  return '';
}

function directive(type, args, body, ctx) {
  if (CALLOUTS[type]) {
    const c = CALLOUTS[type];
    const cls = c.cls || type;
    return `<div class="callout co-${cls}"><div class="co-head">${ctx.icon(c.icon, 20)}<span class="t-over">${c.label}</span></div>${args ? `<div class="co-title">${inline(args, ctx)}</div>` : ''}<div class="co-body">${blocks(body, ctx)}</div></div>`;
  }
  switch (type) {
    case 'reveal':
      return `<button type="button" class="reveal" data-reveal><div class="rv-q">${ctx.icon('eye', 20)}<span>${inline(args || 'Question', ctx)}</span></div><div class="rv-hint t-caption">Touche pour révéler la réponse</div><div class="rv-a lesson">${blocks(body, ctx)}</div></button>`;
    case 'timeline':
      return `<ul class="timeline">${body.filter((l) => l.trim()).map((l) => {
        const s = l.trim().replace(/^[-*]\s*/, '');
        const m = s.match(/^(.+?)\s*(?:\||\s:\s|\s—\s|\s–\s)\s*(.+)$/);
        return m ? `<li><span class="when">${inline(m[1], ctx)}</span><span class="what">${inline(m[2], ctx)}</span></li>` : `<li><span class="what">${inline(s, ctx)}</span></li>`;
      }).join('')}</ul>`;
    case 'vocab':
      return `<div class="vocab">${body.filter((l) => l.trim()).map((l) => {
        const s = l.trim().replace(/^[-*]\s*/, '');
        const m = s.match(/^(.+?)\s*(?:=|\|)\s*(.+)$/);
        return m ? `<div class="v-row"><span class="v-term">${inline(m[1], ctx)}</span><span class="v-def">${inline(m[2], ctx)}</span></div>` : `<div class="v-row"><span class="v-term">${inline(s, ctx)}</span><span></span></div>`;
      }).join('')}</div>`;
    case 'steps': {
      const items = []; let cur = null;
      for (const l of body) {
        const m = l.trim().match(/^(?:[-*]|\d+[.)])\s+(.*)$/);
        if (m) { cur = [m[1]]; items.push(cur); } else if (l.trim() && cur) cur.push(l.trim());
      }
      return `${args ? `<h3>${inline(args, ctx)}</h3>` : ''}<ol class="steps">${items.map((it) => `<li>${inline(it.join(' '), ctx)}</li>`).join('')}</ol>`;
    }
    case 'columns': {
      const cols = [[]];
      for (const l of body) { if (l.trim() === '+++') cols.push([]); else cols[cols.length - 1].push(l); }
      return `<div class="cols">${cols.map((c) => `<div>${blocks(c, ctx)}</div>`).join('')}</div>`;
    }
    case 'diagram': case 'mindmap': case 'image': case 'source':
      return single(type, args + (body.length ? ' | ' + body.join(' ').trim() : ''), ctx);
    default:
      return `<div class="callout co-remarque"><div class="co-head">${ctx.icon('info', 20)}<span class="t-over">${esc(type)}</span></div>${args ? `<div class="co-title">${inline(args, ctx)}</div>` : ''}<div class="co-body">${blocks(body, ctx)}</div></div>`;
  }
}

/** Analyse de structure, utilisée par le validateur (directives inconnues, blocs non fermés, références). */
export function lintMarkdown(src) {
  const issues = [], refs = { diagram: [], mindmap: [], image: [], source: [] };
  const lines = String(src ?? '').split('\n');
  let depth = 0, inCode = false;
  lines.forEach((l, n) => {
    const t = l.trim();
    if (t.startsWith('```')) { inCode = !inCode; return; }
    if (inCode) return;
    const m = t.match(/^:::\s*([a-zA-Zéè-]+)\s*(.*)$/);
    if (m) {
      const type = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!ALL_DIRECTIVES.includes(type)) issues.push(`ligne ${n + 1} : directive inconnue « ${m[1]} » (rendue comme remarque)`);
      if (refs[type]) { const id = m[2].split('|')[0].trim().split(/\s+/)[0]; if (id) refs[type].push(id); else issues.push(`ligne ${n + 1} : « :::${type} » sans identifiant`); }
      else depth++;
    } else if (t === ':::') { depth--; if (depth < 0) { issues.push(`ligne ${n + 1} : « ::: » fermant en trop`); depth = 0; } }
    const dollars = (t.replace(/\\\$/g, '').match(/\$/g) || []).length;
    if (dollars % 2 === 1 && !t.startsWith('$$') && !t.endsWith('$$')) issues.push(`ligne ${n + 1} : nombre impair de « $ » (formule non fermée ?)`);
  });
  if (depth > 0) issues.push(`${depth} bloc(s) « ::: » non fermé(s)`);
  if (inCode) issues.push('bloc de code ``` non fermé');
  return { issues, refs };
}

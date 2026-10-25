// Analyseur d'expressions mathématiques SÛR (aucun eval / Function).
// Utilisé par les courbes des schémas déclaratifs : "x^2 - 2*x + 1", "2sin(x)", "exp(-x/2)".
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-zA-Zπ_]/.test(c)) {
      const m = src.slice(i).match(/^[a-zA-Zπ_][a-zA-Z0-9_]*/);
      toks.push({ t: 'id', v: m[0] === 'π' ? 'pi' : m[0] }); i += m[0].length; continue;
    }
    if ('+-*/^(),'.includes(c)) { toks.push({ t: c }); i++; continue; }
    if (c === '×' || c === '·') { toks.push({ t: '*' }); i++; continue; }
    if (c === '÷') { toks.push({ t: '/' }); i++; continue; }
    if (c === '−') { toks.push({ t: '-' }); i++; continue; }
    throw new Error(`Caractère non autorisé « ${c} »`);
  }
  // multiplication implicite : 2x, 2(x), )(, x(… si x n'est pas une fonction
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const a = out[out.length - 1], b = toks[k];
    if (a && (a.t === 'num' || a.t === ')' || (a.t === 'id' && !FUNCS[a.v])) && (b.t === 'num' || b.t === 'id' || b.t === '(')) {
      if (!(a.t === 'num' && b.t === 'num')) out.push({ t: '*' });
    }
    out.push(b);
  }
  return out;
}

/** Compile une expression en fonction (vars) => nombre. Lève une erreur claire si invalide. */
export function compileExpr(src, allowed = ['x', 't', 'n', 'a', 'b', 'k']) {
  if (typeof src !== 'string' || src.length > 300) throw new Error('Expression absente ou trop longue');
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], eat = (t) => { if (!toks[p] || toks[p].t !== t) throw new Error(`« ${t} » attendu`); return toks[p++]; };
  function primary() {
    const tk = toks[p++];
    if (!tk) throw new Error('Expression incomplète');
    if (tk.t === 'num') return () => tk.v;
    if (tk.t === '(') { const e = expr(); eat(')'); return e; }
    if (tk.t === '-') { const e = power(); return (v) => -e(v); }
    if (tk.t === '+') return power();
    if (tk.t === 'id') {
      if (FUNCS[tk.v]) {
        const f = FUNCS[tk.v]; eat('('); const args = [expr()];
        while (peek() && peek().t === ',') { p++; args.push(expr()); }
        eat(')');
        return (v) => f(...args.map((a) => a(v)));
      }
      if (CONSTS[tk.v] !== undefined) { const c = CONSTS[tk.v]; return () => c; }
      if (allowed.includes(tk.v)) return (v) => (v[tk.v] ?? 0);
      throw new Error(`Nom inconnu « ${tk.v} »`);
    }
    throw new Error('Expression mal formée');
  }
  function power() {
    const base = primary();
    if (peek() && peek().t === '^') { p++; const ex = unary(); return (v) => Math.pow(base(v), ex(v)); }
    return base;
  }
  function unary() {
    if (peek() && peek().t === '-') { p++; const e = unary(); return (v) => -e(v); }
    if (peek() && peek().t === '+') { p++; return unary(); }
    return power();
  }
  function term() {
    let l = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = toks[p++].t, r = unary(), a = l;
      l = op === '*' ? (v) => a(v) * r(v) : (v) => a(v) / r(v);
    }
    return l;
  }
  function expr() {
    let l = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = toks[p++].t, r = term(), a = l;
      l = op === '+' ? (v) => a(v) + r(v) : (v) => a(v) - r(v);
    }
    return l;
  }
  const fn = expr();
  if (p < toks.length) throw new Error('Symbole inattendu en fin d\'expression');
  return (vars = {}) => { const r = fn(vars); return typeof r === 'number' ? r : NaN; };
}

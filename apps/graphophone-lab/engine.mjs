const IDENTIFIERS = new Set([
  'x','t','a','b','c','sin','cos','tan','asin','acos','atan','abs','sqrt','exp','log','pow','min','max','floor','ceil','round','sign','PI','E'
]);

const MATH_NAMES = ['sin','cos','tan','asin','acos','atan','abs','sqrt','exp','log','pow','min','max','floor','ceil','round','sign','PI','E'];

export function normalizeExpression(input) {
  if (typeof input !== 'string') throw new Error('Formula must be text.');
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter a formula first.');
  if (trimmed.length > 160) throw new Error('Formula is too long.');

  let expr = trimmed.replaceAll('π', 'PI').replaceAll('×', '*').replaceAll('÷', '/');
  if (!/^[0-9A-Za-z_+\-*/%^().,\s]+$/.test(expr)) {
    throw new Error('Formula contains unsupported characters.');
  }

  const identifiers = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const id of identifiers) {
    if (!IDENTIFIERS.has(id)) throw new Error(`Unsupported name: ${id}`);
  }

  expr = expr.replaceAll('^', '**');
  for (const name of MATH_NAMES) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), `Math.${name}`);
  }
  return expr;
}

export function compileExpression(input) {
  const normalized = normalizeExpression(input);
  let fn;
  try {
    fn = new Function('x', 't', 'a', 'b', 'c', `"use strict"; return (${normalized});`);
  } catch {
    throw new Error('Formula could not be parsed.');
  }
  return (vars = {}) => {
    const x = Number(vars.x ?? 0);
    const t = Number(vars.t ?? x);
    const a = Number(vars.a ?? 1);
    const b = Number(vars.b ?? 1);
    const c = Number(vars.c ?? 0);
    const value = Number(fn(x, t, a, b, c));
    if (!Number.isFinite(value)) return NaN;
    return value;
  };
}

export function sampleCartesian(formula, params = {}, range = [-8, 8], count = 720) {
  const fn = compileExpression(formula);
  const [from, to] = range;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const x = from + (to - from) * (i / (count - 1));
    points.push({ x, y: fn({ x, t: x, ...params }) });
  }
  return points;
}

export function sampleParametric(xFormula, yFormula, params = {}, range = [0, Math.PI * 2], count = 720) {
  const xFn = compileExpression(xFormula);
  const yFn = compileExpression(yFormula);
  const [from, to] = range;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const t = from + (to - from) * (i / (count - 1));
    points.push({ x: xFn({ t, x: t, ...params }), y: yFn({ t, x: t, ...params }) });
  }
  return points;
}

export function valueToFrequency(value, baseHz = 220) {
  if (!Number.isFinite(value)) return baseHz;
  const semitones = Math.max(-24, Math.min(24, value * 3));
  return Math.max(55, Math.min(1760, baseHz * (2 ** (semitones / 12))));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function encodeState(state) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function decodeState(encoded) {
  return JSON.parse(decodeURIComponent(escape(atob(encoded))));
}

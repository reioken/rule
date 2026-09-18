/* Deductidle — generic round generator. Works on any domain's pool + rule. Server-only.
   The board is always six examples, three in and three out. Difficulty comes from the rule:
   1. compound rules (A and B, A or B, A unless B) built from each domain's atoms, with the join shown or hidden,
   2. "ugly" examples: of many candidate sets, the one that keeps the most wrong rules alive. */
import { RuleDomains } from './domains.js';
import { LAUNCH_UTC, domainFor, LEVELS_PER_DAY } from './schedule.js';

export { LAUNCH_UTC, domainFor, dayIndex, LEVEL_NAMES, LEVELS_PER_DAY } from './schedule.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
const pool = (domain, rule, rng) => shuffle(domain.pool(rule.range), rng);

/* ---------- compound rules ---------- */
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
/* How two simple rules combine. `word` is what the player sees between the two parts. */
const OPS = {
  and: { word: 'and', join: (a, b) => `${a}, and ${lower(b)}`, test: (a, b) => (x) => a(x) && b(x), how: 'Both parts have to be true.' },
  or: { word: 'or', join: (a, b) => `${a}, or ${lower(b)}`, test: (a, b) => (x) => a(x) || b(x), how: 'Either part on its own is enough.' },
  except: { word: 'unless', join: (a, b) => `${a}, unless ${lower(b)}`, test: (a, b) => (x) => a(x) && !b(x), how: 'The first part has to be true and the second part has to be false.' },
};
const MAX_COMPOUNDS = 36;
const MAX_PER_ATOM = 7;

function buildCompounds(domain) {
  const atoms = domain.rules.filter((r) => (r.level || 1) === 1);
  const candidates = [];
  for (const a of atoms) for (const b of atoms) {
    if (a === b) continue;
    const range = a.range && b.range ? (a.range[1] - a.range[0] <= b.range[1] - b.range[0] ? a.range : b.range) : (a.range || b.range);
    const items = domain.pool(range);
    const n = items.length;
    for (const [op, spec] of Object.entries(OPS)) {
      if (op !== 'except' && a.id > b.id) continue; // and/or are symmetric: keep one ordering
      const test = spec.test(a.test, b.test);
      const trap = a.test;
      let inN = 0, agreeIn = 0, agreeOut = 0, splitIn = 0, splitOut = 0, diffB = 0;
      for (const x of items) {
        const t = test(x), tr = trap(x), bb = b.test(x);
        if (t) inN++;
        if (t && tr) agreeIn++;
        if (!t && !tr) agreeOut++;
        if (t && !tr) splitIn++;
        if (!t && tr) splitOut++;
        if (t !== bb) diffB++;
      }
      const frac = inN / n;
      if (frac < 0.12 || frac > 0.62) continue;
      const splits = splitIn + splitOut;
      /* enough of everything for six opening examples plus three prove rounds */
      if (inN < 12 || n - inN < 12 || agreeIn < 9 || agreeOut < 9 || splits < Math.max(12, n * 0.08) || diffB < n * 0.08) continue;
      /* a compound that is just another atom in disguise (a club or a spade = a black suit) is not a compound */
      const twin = atoms.some((c) => { let d = 0; for (const x of items) if (test(x) !== c.test(x)) { d++; if (d > n * 0.04) break; } return d <= n * 0.04; });
      if (twin) continue;
      candidates.push({ a, b, op, spec, range, score: Math.min(splits, n * 0.4) / n + Math.min(frac, 1 - frac) });
    }
  }
  candidates.sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id) || x.b.id.localeCompare(y.b.id) || x.op.localeCompare(y.op));
  const used = {};
  const out = [];
  for (const c of candidates) {
    if (out.length >= MAX_COMPOUNDS) break;
    if ((used[c.a.id] || 0) >= MAX_PER_ATOM || (used[c.b.id] || 0) >= MAX_PER_ATOM) continue;
    used[c.a.id] = (used[c.a.id] || 0) + 1;
    used[c.b.id] = (used[c.b.id] || 0) + 1;
    const { a, b, op, spec } = c;
    out.push({
      id: `${a.id}${op === 'and' ? '+' : op === 'or' ? '|' : '-'}${b.id}`,
      level: 2,
      op,
      word: spec.word,
      rule: spec.join(a.rule, b.rule),
      detail: spec.how,
      parts: [{ rule: a.rule, detail: a.detail }, { rule: b.rule, detail: b.detail }],
      test: spec.test(a.test, b.test),
      trap: a.test,
      trapName: lower(a.rule),
      par: Math.max(a.par, b.par) + 2,
      ...(c.range ? { range: c.range } : {}),
    });
  }
  return out;
}

if (!RuleDomains.__compounded) {
  for (const domain of RuleDomains.list) {
    for (const r of domain.rules) r.level = r.level || 1;
    domain.rules = [...domain.rules, ...buildCompounds(domain)];
  }
  RuleDomains.__compounded = true;
}

/* ---------- levels ---------- */
/* Same board every day: six examples, three in and three out. Difficulty lives in the rule.
   1: one simple rule. 2: two rules joined, and you are told the join. 3: two rules joined, join hidden. */
export const LEVELS = {
  1: { evidence: 6, compound: false, showJoin: false, name: 'Easy' },
  2: { evidence: 6, compound: true, showJoin: true, name: 'Medium' },
  3: { evidence: 6, compound: true, showJoin: false, name: 'Hard' },
};
export const levelOf = (rule) => ((rule.level || 1) === 1 ? 1 : 2);
export const evidenceCountFor = (rule, level) => LEVELS[level || levelOf(rule)].evidence;

/* ---------- evidence ---------- */
/* The hypotheses a player might believe: every rule in the domain's library, atoms and compounds,
   plus each atom's opposite. Used to pick ugly examples and to count how many rules still fit. */
function hypotheses(domain, rule) {
  const hs = [];
  for (const r of domain.rules) {
    hs.push(r.test);
    if ((r.level || 1) === 1) hs.push((x) => !r.test(x));
  }
  return hs.filter((h) => h !== rule.test);
}
const consistent = (h, evidence) => evidence.every((e) => h(e.item) === e.in);

/* n opening examples, half In and half Out, on which the real rule and the trap agree.
   Of many candidate sets, keep the one that leaves the most wrong hypotheses alive. */
export function buildEvidence(domain, rule, rng, n = 6) {
  const list = pool(domain, rule, rng);
  const half = Math.max(1, Math.floor(n / 2));
  const agreeIn = list.filter((x) => rule.test(x) && rule.trap(x));
  const agreeOut = list.filter((x) => !rule.test(x) && !rule.trap(x));
  const hs = hypotheses(domain, rule);
  const tries = 40;
  let best = null, bestScore = -1;
  for (let t = 0; t < tries; t++) {
    const ins = shuffle(agreeIn.slice(0, 40), rng).slice(0, half);
    const outs = shuffle(agreeOut.slice(0, 40), rng).slice(0, half);
    const ev = [...ins.map((x) => ({ item: x, in: true })), ...outs.map((x) => ({ item: x, in: false }))];
    if (ev.length < 2 * half) continue;
    const score = hs.reduce((acc, h) => acc + (consistent(h, ev) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = ev; }
  }
  return shuffle(best || [], rng);
}

/* How many library rules still fit everything on the board, the real one included. Never below 1. */
export function aliveHypotheses(domain, rule, evidence) {
  return 1 + hypotheses(domain, rule).filter((h) => consistent(h, evidence)).length;
}

/* Six items to prove yourself on: four disagree with the trap where the pool allows (never fewer than
   three), split evenly between the two trap directions, and the six answers are as near 3 In / 3 Out as possible. */
export function buildProve(domain, rule, used, rng) {
  const list = pool(domain, rule, rng).filter((x) => !used.has(x));
  const group = (isIn, splits) => list.filter((x) => rule.test(x) === isIn && (rule.test(x) !== rule.trap(x)) === splits);
  const dIn = group(true, true), dOut = group(false, true), aIn = group(true, false), aOut = group(false, false);
  const picks = [], take = (src) => (src.length ? (picks.push(src.shift()), true) : false);
  for (let i = 0; i < 2; i++) { take(dIn); take(dOut); }
  while (picks.length < 4 && take(dIn.length >= dOut.length ? dIn : dOut));
  while (picks.length < 6) {
    const inN = picks.filter((x) => rule.test(x)).length;
    if (!(inN * 2 <= picks.length ? [aIn, dIn, aOut, dOut] : [aOut, dOut, aIn, dIn]).some(take)) break;
  }
  return shuffle(picks.slice(0, 6), rng).map((x) => ({ item: x, in: rule.test(x) }));
}

/* One item that exposes the trap in each direction. */
export function trapBreakers(domain, rule) {
  const list = domain.pool(rule.range);
  let falseIn = null, falseOut = null;
  for (const x of list) {
    if (falseIn === null && rule.trap(x) && !rule.test(x)) falseIn = x;
    if (falseOut === null && !rule.trap(x) && rule.test(x)) falseOut = x;
    if (falseIn !== null && falseOut !== null) break;
  }
  return { falseIn, falseOut };
}

/* ---------- schedule ---------- */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function strideFor(len) {
  let stride = 3;
  while (len > 1 && gcd(stride, len) !== 1) stride++;
  return stride;
}
/* The puzzle for one slot of one day. Within a domain and a level band (simple or compound), rules
   are dealt in a fixed stride so nothing repeats before the whole band has been used. */
export function dailyPick(day, level = 1) {
  level = LEVELS_PER_DAY.includes(level) ? level : 1;
  const domainId = domainFor(day, level);
  const wantCompound = LEVELS[level].compound;
  const domain = RuleDomains[domainId];
  let subset = domain.rules.map((r, i) => ({ r, i })).filter(({ r }) => ((r.level || 1) === 2) === wantCompound);
  if (!subset.length) subset = domain.rules.map((r, i) => ({ r, i }));
  let nth = 0; // earlier puzzles with the same domain and the same level band
  for (let d = 0; d < day; d++) for (const l of LEVELS_PER_DAY) if (domainFor(d, l) === domainId && LEVELS[l].compound === wantCompound) nth++;
  const pick = subset[(nth * strideFor(subset.length)) % subset.length];
  return { domainId, ruleIdx: pick.i, seed: day * 1000 + 17 + (level - 1) * 331, level };
}

export const RuleEngine = { mulberry32, buildEvidence, buildProve, trapBreakers, dailyPick, LAUNCH_UTC };

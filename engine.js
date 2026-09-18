/* Deductidle — generic round generator. Works on any domain's pool + rule. Server-only.
   The board is always six examples, three in and three out. Every puzzle is one hidden rule.
   Of many candidate opening sets, keep the one that leaves the most wrong rules alive. */
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

/* ---------- slots ---------- */
/* Same board every day: six examples, three in and three out. Each of the three daily puzzles
   is one hidden rule, a different kind of thing. Slot numbers 1–3 are only which puzzle of the day. */
export const LEVELS = {
  1: { evidence: 6, name: 'Easy' },
  2: { evidence: 6, name: 'Medium' },
  3: { evidence: 6, name: 'Hard' },
};
export const levelOf = () => 1;
export const evidenceCountFor = () => 6;

/* ---------- evidence ---------- */
/* The hypotheses a player might believe: every rule in the domain's library, plus each rule's
   opposite. Used to pick ugly examples and to count how many rules still fit. */
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
/* The puzzle for one slot of one day. Within a domain, rules are dealt in a fixed stride
   so nothing repeats before the whole library has been used. */
export function dailyPick(day, level = 1) {
  level = LEVELS_PER_DAY.includes(level) ? level : 1;
  const domainId = domainFor(day, level);
  const domain = RuleDomains[domainId];
  const subset = domain.rules.map((r, i) => ({ r, i }));
  let nth = 0; // earlier puzzles with the same domain, any slot
  for (let d = 0; d < day; d++) for (const l of LEVELS_PER_DAY) if (domainFor(d, l) === domainId) nth++;
  const pick = subset[(nth * strideFor(subset.length)) % subset.length];
  return { domainId, ruleIdx: pick.i, seed: day * 1000 + 17 + (level - 1) * 331, level };
}

export const RuleEngine = { mulberry32, buildEvidence, buildProve, trapBreakers, dailyPick, LAUNCH_UTC };

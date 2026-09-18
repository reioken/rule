/* Deductidle — HTTP API. Evaluates the secret rule so it never ships to the browser. */
import { RuleDomains } from './domains.js';
import * as E from './engine.js';
import { dayIndex } from './schedule.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function bodyOf(value) {
  if (value && typeof value === 'object') return value;
  fail(400, 'Expected JSON');
}

function resolveRound(input) {
  const mode = input.mode === 'practice' ? 'practice' : 'daily';
  const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
  if (mode === 'daily') {
    if (day > dayIndex() + 1) fail(400, 'That day is not out yet'); // one day of clock slack for players ahead of UTC
    const pick = E.dailyPick(day);
    const domain = RuleDomains[pick.domainId];
    return { mode, day, ...pick, domain, rule: domain.rules[pick.ruleIdx] };
  }
  const domain = RuleDomains[input.domainId];
  if (!domain) fail(400, 'Unknown domain');
  const ruleIdx = Number.parseInt(input.ruleIdx, 10);
  const rule = domain.rules[ruleIdx];
  if (!rule) fail(400, 'Unknown rule');
  const seed = Number.parseInt(input.seed, 10);
  if (!Number.isFinite(seed)) fail(400, 'Missing seed');
  const level = [1, 2, 3].includes(Number(input.level)) ? Number(input.level) : E.levelOf(rule);
  return { mode, day, domainId: domain.id, ruleIdx, seed, level, domain, rule };
}

const evidenceOf = (round) => E.buildEvidence(round.domain, round.rule, E.mulberry32(round.seed), E.evidenceCountFor(round.rule, round.level));

function publicMeta(round) {
  const { domain, rule } = round;
  const evidence = evidenceOf(round);
  return {
    alive: E.aliveHypotheses(domain, rule, evidence),
    mode: round.mode,
    day: round.day,
    domainId: domain.id,
    seed: round.seed,
    level: round.level,
    levelName: E.LEVELS[round.level].name,
    par: rule.par,
    ...(rule.level === 2 ? { joined: rule.word } : {}),
    evidence,
    ...(round.mode === 'practice' ? { ruleIdx: round.ruleIdx } : {}),
  };
}

function coerce(domain, raw) {
  const parsed = domain.parse(raw);
  if (parsed.error) fail(400, parsed.error);
  return parsed.item;
}

function usedSet(round, tested = []) {
  const evidence = evidenceOf(round);
  const used = new Set(evidence.map((e) => e.item));
  for (const raw of tested) {
    try { used.add(coerce(round.domain, raw)); } catch { /* ignore junk from a stale client */ }
  }
  return { evidence, used };
}

function proveItems(round, tested, proveRound) {
  const roundN = Math.max(0, Number.parseInt(proveRound, 10) || 0);
  const { used } = usedSet(round, tested);
  return E.buildProve(round.domain, round.rule, used, E.mulberry32(round.seed + 7919 * (roundN + 1)));
}

function revealPayload(round) {
  const { falseIn, falseOut } = E.trapBreakers(round.domain, round.rule);
  const r = round.rule;
  return {
    rule: r.rule, detail: r.detail, trapName: r.trapName, breakers: { falseIn, falseOut },
    ...(r.level === 2 ? { joined: r.word, parts: r.parts } : {}),
  };
}

/* ================= solve rates ================= */
/* One JSON blob per day in KV: { played, solved, stars: [n0, n1, n2, n3], tests: sum }. Missing binding means no stats. */
async function readStats(env, day) {
  if (!env || !env.STATS) return null;
  try { const raw = await env.STATS.get(`day:${day}`); return raw ? JSON.parse(raw) : { played: 0, solved: 0, stars: [0, 0, 0, 0], tests: 0 }; }
  catch { return null; }
}
async function recordResult(env, day, input) {
  const st = await readStats(env, day);
  if (!st) return null;
  const solved = input.result === 'solved';
  const stars = Math.max(0, Math.min(3, Number.parseInt(input.stars, 10) || 0));
  const tests = Math.max(0, Math.min(60, Number.parseInt(input.tests, 10) || 0));
  st.played += 1;
  if (solved) st.solved += 1;
  st.stars[solved ? stars : 0] += 1;
  st.tests += tests;
  try { await env.STATS.put(`day:${day}`, JSON.stringify(st)); } catch { /* best effort */ }
  return st;
}
function statsPayload(st) {
  if (!st || !st.played) return null;
  return { players: st.played, solvedPct: Math.round((100 * st.solved) / st.played), threeStarPct: Math.round((100 * st.stars[3]) / st.played), avgTests: Math.round((10 * st.tests) / st.played) / 10 };
}

/* ================= routing ================= */
async function readInput(request, url) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return Object.fromEntries(url.searchParams.entries());
  }
  if (request.method !== 'POST') fail(405, 'Method not allowed');
  const text = await request.text();
  if (!text) return {};
  try { return bodyOf(JSON.parse(text)); } catch { fail(400, 'Invalid JSON'); }
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  try {
    const input = await readInput(request, url);
    const route = url.pathname.replace(/\/+$/, '') || '/';

    if (route === '/api/round') {
      if (input.mode === 'practice') {
        const domain = input.domainId != null && input.domainId !== ''
          ? RuleDomains[input.domainId]
          : RuleDomains.list[Math.floor(Math.random() * RuleDomains.list.length)];
        if (!domain) fail(400, 'Unknown domain');
        const hasRule = input.ruleIdx != null && input.ruleIdx !== '';
        const hasSeed = input.seed != null && input.seed !== '';
        const wantLevel = [1, 2, 3].includes(Number(input.level)) ? Number(input.level) : 1 + Math.floor(Math.random() * 3);
        let ruleIdx;
        if (hasRule) ruleIdx = Number.parseInt(input.ruleIdx, 10);
        else {
          const wantCompound = E.LEVELS[wantLevel].compound;
          const subset = domain.rules.map((r, i) => ({ r, i })).filter(({ r }) => ((r.level || 1) === 2) === wantCompound);
          const from = subset.length ? subset : domain.rules.map((r, i) => ({ r, i }));
          ruleIdx = from[Math.floor(Math.random() * from.length)].i;
        }
        const rule = domain.rules[ruleIdx];
        if (!rule) fail(400, 'Unknown rule');
        const seed = hasSeed ? Number.parseInt(input.seed, 10) : Math.floor(Math.random() * 1e9);
        if (!Number.isFinite(seed)) fail(400, 'Missing seed');
        const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
        const level = E.levelOf(rule) === 1 ? 1 : (wantLevel === 3 ? 3 : 2);
        return json(publicMeta({ mode: 'practice', day, domainId: domain.id, ruleIdx, seed, level, domain, rule }));
      }
      return json(publicMeta(resolveRound(input)));
    }

    if (route === '/api/test') {
      const round = resolveRound(input);
      const item = coerce(round.domain, input.item);
      const { used } = usedSet(round, input.tested);
      if (used.has(item)) fail(409, 'Already tested');
      const isIn = round.rule.test(item);
      const { evidence } = usedSet(round, input.tested);
      const known = [...evidence, ...(input.log || []).map((e) => ({ item: e.item, in: e.in === true })), { item, in: isIn }];
      return json({ item, in: isIn, alive: E.aliveHypotheses(round.domain, round.rule, known) });
    }

    if (route === '/api/prove') {
      const round = resolveRound(input);
      const prove = proveItems(round, input.tested, input.proveRound);
      return json({ items: prove.map((p) => ({ item: p.item })) });
    }

    if (route === '/api/check') {
      const round = resolveRound(input);
      const prove = proveItems(round, input.tested, input.proveRound);
      const guesses = new Map((input.answers || []).map((a) => [String(coerce(round.domain, a.item)), a.guess === true]));
      if (prove.some((p) => !guesses.has(String(p.item)))) fail(400, 'Sort all six');
      const results = prove.map((p) => ({ item: p.item, in: p.in, ok: guesses.get(String(p.item)) === p.in }));
      const allRight = results.every((r) => r.ok);
      return json({ results, allRight, reveal: allRight ? revealPayload(round) : null });
    }

    if (route === '/api/reveal') {
      const round = resolveRound(input);
      const st = round.mode === 'daily' ? statsPayload(await readStats(env, round.day)) : null;
      return json({ ...revealPayload(round), stats: st });
    }

    /* The client reports how a daily round ended, once. Practice rounds are not counted. */
    if (route === '/api/result') {
      const round = resolveRound(input);
      if (round.mode !== 'daily') return json({ stats: null });
      const st = await recordResult(env, round.day, input);
      return json({ stats: statsPayload(st) });
    }

    if (route === '/api/stats') {
      const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
      return json({ stats: statsPayload(await readStats(env, day)) });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err.status) return json({ error: err.message }, err.status);
    return json({ error: 'Server error' }, 500);
  }
}

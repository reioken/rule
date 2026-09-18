/* Deductidle — HTTP API. Evaluates the secret rule so it never ships to the browser. */
import { RuleDomains } from './domains.js';
import * as E from './engine.js';
import * as B from './box.js';

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

/* ================= In or Out ================= */
function resolveRound(input) {
  const mode = input.mode === 'practice' ? 'practice' : 'daily';
  const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
  if (mode === 'daily') {
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
    game: 'sort',
    mode: round.mode,
    day: round.day,
    domainId: domain.id,
    seed: round.seed,
    level: round.level,
    levelName: E.LEVELS[round.level].name,
    par: rule.par,
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
  return { rule: round.rule.rule, detail: round.rule.detail, trapName: round.rule.trapName, breakers: { falseIn, falseOut } };
}

/* ================= Black Box ================= */
function resolveBox(input) {
  const mode = input.mode === 'practice' ? 'practice' : 'daily';
  const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
  if (mode === 'daily') {
    const pick = B.dailyBox(day);
    const domain = B.BoxDomains[pick.domainId];
    return { mode, day, ...pick, domain, fn: domain.funcs[pick.fnIdx] };
  }
  const domain = B.BoxDomains[input.domainId];
  if (!domain) fail(400, 'Unknown domain');
  const fnIdx = Number.parseInt(input.fnIdx, 10);
  const fn = domain.funcs[fnIdx];
  if (!fn) fail(400, 'Unknown function');
  const seed = Number.parseInt(input.seed, 10);
  if (!Number.isFinite(seed)) fail(400, 'Missing seed');
  return { mode, day, domainId: domain.id, fnIdx, seed, domain, fn };
}
const givenOf = (round) => B.buildGiven(round.domain, round.fn, B.mulberry32(round.seed));
function boxMeta(round) {
  const { given } = givenOf(round);
  return {
    game: 'box', mode: round.mode, day: round.day, domainId: round.domain.id, seed: round.seed,
    par: round.fn.par, given,
    ...(round.mode === 'practice' ? { fnIdx: round.fnIdx } : {}),
  };
}
function boxUsed(round, tested = []) {
  const { given } = givenOf(round);
  const used = new Set(given.map((g) => g.input));
  for (const raw of tested) { try { used.add(coerce(round.domain, raw)); } catch { /* stale */ } }
  return used;
}
function boxProve(round, tested, proveRound) {
  const roundN = Math.max(0, Number.parseInt(proveRound, 10) || 0);
  return B.buildProve(round.domain, round.fn, boxUsed(round, tested), B.mulberry32(round.seed + 7919 * (roundN + 1)));
}
function boxReveal(round) {
  const { lookalike } = givenOf(round);
  return { name: round.fn.name, detail: round.fn.detail, lookalike };
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

export async function handleApi(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  try {
    const input = await readInput(request, url);
    const route = url.pathname.replace(/\/+$/, '') || '/';

    /* ----- In or Out ----- */
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
      return json({ item, in: round.rule.test(item) });
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
      return json(revealPayload(resolveRound(input)));
    }

    /* ----- Black Box ----- */
    if (route === '/api/box/round') {
      if (input.mode === 'practice') {
        const domain = input.domainId != null && input.domainId !== ''
          ? B.BoxDomains[input.domainId]
          : B.BoxDomains.list[Math.floor(Math.random() * B.BoxDomains.list.length)];
        if (!domain) fail(400, 'Unknown domain');
        const fnIdx = input.fnIdx != null && input.fnIdx !== '' ? Number.parseInt(input.fnIdx, 10) : Math.floor(Math.random() * domain.funcs.length);
        const fn = domain.funcs[fnIdx];
        if (!fn) fail(400, 'Unknown function');
        const seed = input.seed != null && input.seed !== '' ? Number.parseInt(input.seed, 10) : Math.floor(Math.random() * 1e9);
        if (!Number.isFinite(seed)) fail(400, 'Missing seed');
        const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
        return json(boxMeta({ mode: 'practice', day, domainId: domain.id, fnIdx, seed, domain, fn }));
      }
      return json(boxMeta(resolveBox(input)));
    }

    if (route === '/api/box/run') {
      const round = resolveBox(input);
      const item = coerce(round.domain, input.input);
      if (boxUsed(round, input.tested).has(item)) fail(409, 'Already tested');
      return json({ input: item, output: B.run(round.domain, round.fn, item) });
    }

    if (route === '/api/box/prove') {
      const round = resolveBox(input);
      return json({ items: boxProve(round, input.tested, input.proveRound).map((p) => ({ input: p.input })) });
    }

    if (route === '/api/box/check') {
      const round = resolveBox(input);
      const prove = boxProve(round, input.tested, input.proveRound);
      const guesses = new Map((input.answers || []).map((a) => [String(coerce(round.domain, a.input)), String(a.output ?? '')]));
      if (prove.some((p) => !guesses.has(String(p.input)))) fail(400, 'Fill in all four');
      const results = prove.map((p) => ({ input: p.input, output: p.output, ok: B.sameOut(guesses.get(String(p.input)), p.output) }));
      const allRight = results.every((r) => r.ok);
      return json({ results, allRight, reveal: allRight ? boxReveal(round) : null });
    }

    if (route === '/api/box/reveal') {
      return json(boxReveal(resolveBox(input)));
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err.status) return json({ error: err.message }, err.status);
    return json({ error: 'Server error' }, 500);
  }
}

/* Rule — HTTP API. Evaluates the secret rule so it never ships to the browser. */
import { RuleDomains } from './domains.js';
import * as E from './engine.js';

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
  return { mode, day, domainId: domain.id, ruleIdx, seed, domain, rule };
}

function publicMeta(round) {
  const { domain, rule } = round;
  return {
    mode: round.mode,
    day: round.day,
    domainId: domain.id,
    seed: round.seed,
    par: rule.par,
    evidence: E.buildEvidence(domain, rule, E.mulberry32(round.seed)),
    ...(round.mode === 'practice' ? { ruleIdx: round.ruleIdx } : {}),
  };
}

function coerce(domain, raw) {
  const parsed = domain.parse(raw);
  if (parsed.error) fail(400, parsed.error);
  return parsed.item;
}

function usedSet(round, tested = []) {
  const evidence = E.buildEvidence(round.domain, round.rule, E.mulberry32(round.seed));
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

    if (route === '/api/round') {
      if (input.mode === 'practice' && (input.domainId == null || input.ruleIdx == null || input.seed == null)) {
        const domain = RuleDomains.list[Math.floor(Math.random() * RuleDomains.list.length)];
        const ruleIdx = Math.floor(Math.random() * domain.rules.length);
        const seed = Math.floor(Math.random() * 1e9);
        const day = Math.max(0, Number.parseInt(input.day, 10) || 0);
        return json(publicMeta({ mode: 'practice', day, domainId: domain.id, ruleIdx, seed, domain, rule: domain.rules[ruleIdx] }));
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
      const results = prove.map((p) => {
        const ok = guesses.get(String(p.item)) === p.in;
        return { item: p.item, in: p.in, ok };
      });
      const allRight = results.every((r) => r.ok);
      return json({ results, allRight, reveal: allRight ? revealPayload(round) : null });
    }

    if (route === '/api/reveal') {
      return json(revealPayload(resolveRound(input)));
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err.status) return json({ error: err.message }, err.status);
    return json({ error: 'Server error' }, 500);
  }
}

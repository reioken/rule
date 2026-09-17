/* Audits every rule of every domain over 60 fixed seeds and the first 365 daily boards,
   plus the HTTP API that keeps those rules off the client.
   Run with: node scripts/check.js — exits 1 if any board or API contract breaks. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleDomains as D } from '../domains.js';
import * as E from '../engine.js';
import { handleApi } from '../api.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let boards = 0, bad = 0;
const fail = (who, msg) => { bad++; console.log(`${who}: ${msg}`); };

/* rounds > 1 replays consecutive prove rounds the way game.js does after a failed prove:
   round r draws from seed + 7919 * (r + 1), and every earlier prove item is already on the board. */
function check(who, domain, rule, seed, rounds = 1) {
  boards++;
  const evidence = E.buildEvidence(domain, rule, E.mulberry32(seed));
  const used = new Set(evidence.map((e) => e.item));
  const evIn = evidence.filter((e) => e.in).length;
  if (evidence.length !== 8) fail(who, `evidence has ${evidence.length} items, want 8`);
  if (evIn !== 4) fail(who, `evidence is ${evIn} In / ${evidence.length - evIn} Out, want 4/4`);
  if (used.size !== evidence.length) fail(who, 'evidence repeats an item');
  for (let r = 0; r < rounds; r++) {
    const at = rounds > 1 ? `${who} prove round ${r + 1}` : who;
    const prove = E.buildProve(domain, rule, used, E.mulberry32(seed + 7919 * (r + 1)));
    if (prove.length !== 6) fail(at, `prove has ${prove.length} items, want 6`);
    if (prove.some((p) => used.has(p.item))) fail(at, 'prove reuses an item already on the board');
    const splits = prove.filter((p) => rule.test(p.item) !== rule.trap(p.item)).length;
    if (splits < 3) fail(at, `prove has only ${splits} disagreements, want 3 or more`);
    const prIn = prove.filter((p) => p.in).length;
    if (prIn < 2 || prove.length - prIn < 2) fail(at, `prove is ${prIn} In / ${prove.length - prIn} Out, want 2 or more of each`);
    if (prove.every((p) => rule.trap(p.item) === p.in)) fail(at, 'the trap answers all six prove items correctly');
    for (const p of prove) used.add(p.item);
  }
}

for (const domain of D.list) {
  for (const rule of domain.rules) {
    for (let s = 0; s < 60; s++) check(`${domain.id}/${rule.id} seed ${s * 1000 + 17}`, domain, rule, s * 1000 + 17);
  }
}
for (let day = 0; day < 365; day++) {
  const pick = E.dailyPick(day);
  const domain = D[pick.domainId], rule = domain.rules[pick.ruleIdx];
  check(`#${day + 1} ${pick.domainId}/${rule.id}`, domain, rule, pick.seed, 3);
}

/* Every rule of every domain must be scheduled at least once within its first cycle of days. */
const seen = {};
for (let day = 0; day < 7 * 30; day++) { const p = E.dailyPick(day); (seen[p.domainId] ||= new Set()).add(p.ruleIdx); }
for (const domain of D.list) {
  const missed = domain.rules.filter((_, i) => !(seen[domain.id] || new Set()).has(i)).map((r) => r.id);
  if (missed.length) fail(`schedule ${domain.id}`, `never scheduled in 30 weeks: ${missed.join(', ')}`);
}

/* Client-facing files must not ship rule predicates or reveal copy. */
const clientFiles = ['catalog.js', 'game.js', 'schedule.js', 'icons.js', 'index.html'];
for (const f of clientFiles) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const domain of D.list) {
    for (const rule of domain.rules) {
      if (text.includes(rule.rule)) fail(`client ${f}`, `contains rule text "${rule.rule}"`);
      if (text.includes(rule.detail)) fail(`client ${f}`, `contains detail for ${rule.id}`);
      if (text.includes(rule.trapName)) fail(`client ${f}`, `contains trap name "${rule.trapName}"`);
    }
  }
  if (/from ['"]\.\/(?:domains|words|engine|api)\.js['"]/.test(text)) fail(`client ${f}`, 'imports server-only modules');
}

async function call(path, body, method) {
  const init = { method: method || (body === undefined ? 'GET' : 'POST') };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return handleApi(new Request('http://rule.test' + path, init));
}

const daily = await (await call('/api/round?day=0&mode=daily')).json();
if (daily.domainId !== 'numbers') fail('api daily', `day 0 domain is ${daily.domainId}, want numbers`);
if (!daily.evidence || daily.evidence.length !== 8) fail('api daily', 'day 0 did not return 8 evidence items');
if (daily.rule || daily.detail || daily.trapName || daily.ruleIdx != null) fail('api daily', 'daily round leaked the rule');
if (typeof daily.par !== 'number') fail('api daily', 'daily round missing par');

const probe = await (await call('/api/test', { mode: 'daily', day: 0, item: 8 })).json();
if (typeof probe.in !== 'boolean') fail('api test', 'test did not return in/out');
const pick = E.dailyPick(0);
const rule = D[pick.domainId].rules[pick.ruleIdx];
if (probe.in !== rule.test(8)) fail('api test', 'test disagrees with the rule');

const prove = await (await call('/api/prove', { mode: 'daily', day: 0, tested: [], proveRound: 0 })).json();
if (!prove.items || prove.items.length !== 6) fail('api prove', 'prove did not return 6 items');
if (prove.items.some((p) => 'in' in p)) fail('api prove', 'prove items included answers');

const wrong = await (await call('/api/check', {
  mode: 'daily', day: 0, tested: [], proveRound: 0,
  answers: prove.items.map((p) => ({ item: p.item, guess: false })),
})).json();
if (wrong.allRight) fail('api check', 'all-Out guesses should not pass');
if (wrong.reveal) fail('api check', 'failed prove returned the reveal');

const expected = E.buildProve(D[pick.domainId], rule, new Set(daily.evidence.map((e) => e.item)), E.mulberry32(pick.seed + 7919));
const right = await (await call('/api/check', {
  mode: 'daily', day: 0, tested: [], proveRound: 0,
  answers: expected.map((p) => ({ item: p.item, guess: p.in })),
})).json();
if (!right.allRight) fail('api check', 'correct prove answers were rejected');
if (!right.reveal || right.reveal.rule !== rule.rule) fail('api check', 'solved prove did not return the reveal');

const practice = await (await call('/api/round', { mode: 'practice', day: 0 })).json();
if (practice.mode !== 'practice' || practice.ruleIdx == null || !practice.evidence) fail('api practice', 'practice round incomplete');

console.log(`${boards} boards checked, ${bad} violation${bad === 1 ? '' : 's'}`);
process.exit(bad ? 1 : 0);

/* Audits every rule of every domain over 60 fixed seeds and the first 365 daily boards,
   plus the HTTP API that keeps those rules off the client.
   Run with: node scripts/check.js — exits 1 if any board or API contract breaks. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleDomains as D } from '../domains.js';
import * as E from '../engine.js';
import { handleApi } from '../api.js';
import { DAILY_DOMAINS, LEVELS_PER_DAY, dayPlan } from '../schedule.js';
import {
  starsFor, starsStillPossible, shareText, dayShareText, alreadyOnBoard, proveReady,
  needAnotherLook, normalizePhase,
} from '../logic.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let boards = 0, bad = 0;
const fail = (who, msg) => { bad++; console.log(`${who}: ${msg}`); };

/* rounds > 1 replays consecutive prove rounds the way game.js does after a failed prove:
   round r draws from seed + 7919 * (r + 1), and every earlier prove item is already on the board. */
function check(who, domain, rule, seed, rounds = 1, level = E.levelOf(rule)) {
  boards++;
  const want = E.evidenceCountFor(rule, level);
  const evidence = E.buildEvidence(domain, rule, E.mulberry32(seed), want);
  const used = new Set(evidence.map((e) => e.item));
  const evIn = evidence.filter((e) => e.in).length;
  if (evidence.length !== want) fail(who, `evidence has ${evidence.length} items, want ${want}`);
  if (evIn * 2 !== want) fail(who, `evidence is ${evIn} In / ${evidence.length - evIn} Out, want ${want / 2}/${want / 2}`);
  if (used.size !== evidence.length) fail(who, 'evidence repeats an item');
  if (evidence.some((e) => rule.trap(e.item) !== e.in)) fail(who, 'the trap does not fit the opening examples');
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
    const seeds = rule.level === 2 ? 12 : 40;
    for (let s = 0; s < seeds; s++) {
      check(`${domain.id}/${rule.id} seed ${s * 1000 + 17}`, domain, rule, s * 1000 + 17);
      if (rule.level === 2) check(`${domain.id}/${rule.id} L3 seed ${s * 1000 + 17}`, domain, rule, s * 1000 + 17, 1, 3);
    }
  }
  const atoms = domain.rules.filter((r) => r.level === 1).length;
  if (DAILY_DOMAINS.includes(domain.id) && domain.rules.length - atoms < 3) fail(`compounds ${domain.id}`, `only ${domain.rules.length - atoms} compound rules`);
}
for (let day = 0; day < 365; day++) {
  for (const level of LEVELS_PER_DAY) {
    const pick = E.dailyPick(day, level);
    const domain = D[pick.domainId], rule = domain.rules[pick.ruleIdx];
    if (pick.level !== level) fail(`#${day + 1} L${level}`, `pick came back as level ${pick.level}`);
    if (E.LEVELS[level].compound !== (rule.level === 2)) fail(`#${day + 1} L${level}`, `${E.LEVELS[level].name} puzzle with the wrong kind of rule`);
    if (rule.level === 2 && (!rule.parts || rule.parts.length !== 2 || !rule.word)) fail(`#${day + 1} L${level}`, 'compound rule without its two parts');
    check(`#${day + 1} L${level} ${pick.domainId}/${rule.id}`, domain, rule, pick.seed, 3, level);
  }
}

/* The draw: three different kinds each day, every daily domain shows up often, and a slot never repeats its kind on consecutive days. */
{
  const dom = {};
  for (let day = 0; day < 365; day++) {
    const slots = dayPlan(day);
    if (slots.length !== 3 || slots.some((s, i) => s.level !== i + 1)) fail('draw', `day ${day + 1} does not have levels 1, 2, 3`);
    if (new Set(slots.map((s) => s.domainId)).size !== 3) fail('draw', `day ${day + 1} repeats a kind within the day`);
    for (const s of slots) {
      dom[s.domainId] = (dom[s.domainId] || 0) + 1;
      if (!DAILY_DOMAINS.includes(s.domainId)) fail('draw', `day ${day + 1} draws ${s.domainId}, which is not a daily domain`);
      if (day > 0 && dayPlan(day - 1)[s.level - 1].domainId === s.domainId) fail('draw', `day ${day + 1} ${E.LEVELS[s.level].name} repeats yesterday's kind`);
    }
  }
  for (const id of DAILY_DOMAINS) if ((dom[id] || 0) < 60) fail('draw', `${id} only ${dom[id] || 0} times in a year`);
}

/* Within each domain and level band, no rule repeats before the whole band has been used. */
const scheduled = new Set(DAILY_DOMAINS);
for (const domain of D.list) {
  if (!scheduled.has(domain.id)) continue;
  for (const compound of [false, true]) {
    const band = domain.rules.map((r, i) => ({ r, i })).filter(({ r }) => (r.level === 2) === compound).map(({ i }) => i);
    const seq = [];
    for (let day = 0; day < 3000 && seq.length < band.length; day++) {
      for (const level of LEVELS_PER_DAY) {
        const p = E.dailyPick(day, level);
        if (p.domainId === domain.id && E.LEVELS[level].compound === compound) seq.push(p.ruleIdx);
      }
    }
    if (seq.length && new Set(seq).size !== seq.length) fail(`schedule ${domain.id}`, `${compound ? 'compound' : 'atom'} rules repeat before the band is used up`);
  }
}


/* Client-facing files must not ship rule predicates or reveal copy. */
const clientFiles = ['catalog.js', 'game.js', 'schedule.js', 'icons.js', 'index.html', 'logic.js'];
for (const f of clientFiles) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const domain of D.list) {
    for (const rule of domain.rules) {
      if (rule.level !== 1) continue;
      if (rule.rule.length > 6 && text.includes(rule.rule)) fail(`client ${f}`, `contains rule text "${rule.rule}"`);
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
if (!daily.evidence || daily.evidence.length !== E.LEVELS[daily.level].evidence) fail('api daily', 'day 0 evidence count does not match its level');
if (daily.rule || daily.detail || daily.trapName || daily.ruleIdx != null) fail('api daily', 'daily round leaked the rule');
if (typeof daily.par !== 'number') fail('api daily', 'daily round missing par');

const medium = await (await call('/api/round?day=0&mode=daily&level=2')).json();
if (medium.level !== 2 || medium.domainId !== 'words') fail('api daily', `day 0 level 2 is ${medium.levelName} ${medium.domainId}, want Medium words`);
if (!['and', 'or', 'unless'].includes(medium.joined)) fail('api daily', 'Medium round did not say its join');
const hardR = await (await call('/api/round?day=0&mode=daily&level=3')).json();
if (hardR.level !== 3 || hardR.joined !== 'hidden') fail('api daily', 'Hard round should hide its join');
if (medium.seed === daily.seed || hardR.seed === medium.seed) fail('api daily', 'the three puzzles of a day share a seed');
const badLevel = await (await call('/api/round?day=0&mode=daily&level=9')).json();
if (badLevel.level !== 1) fail('api daily', 'an unknown level should fall back to Easy');

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

const practiceKind = await (await call('/api/round', { mode: 'practice', day: 0, domainId: 'emoji' })).json();
if (practiceKind.domainId !== 'emoji') fail('api practice domain', `wanted emoji, got ${practiceKind.domainId}`);
if (practiceKind.rule || practiceKind.detail || practiceKind.trapName) fail('api practice domain', 'practice round leaked the rule');


if (starsFor({ result: 'gaveup', strokes: 0, par: 4 }) !== 0) fail('stars', 'give up should be 0');
if (starsFor({ result: 'solved', strokes: 4, par: 4 }) !== 3) fail('stars', 'at par should be 3');
if (starsFor({ result: 'solved', strokes: 6, par: 4 }) !== 2) fail('stars', 'par+2 should be 2');
if (starsFor({ result: 'solved', strokes: 7, par: 4 }) !== 1) fail('stars', 'over par+2 should be 1');
if (starsStillPossible(5, 4) !== 2) fail('stars', 'live status should match remaining band');
if (normalizePhase('play') !== 'explore' || normalizePhase('done') !== 'result') fail('phase', 'legacy phases should map');
if (alreadyOnBoard([{ item: 12, in: true }], [], 12) !== true) fail('dup', 'seed item should count as tested');
if (alreadyOnBoard([], [{ item: 'cat', kind: 'test' }], 'cat') !== true) fail('dup', 'log item should count as tested');
if (proveReady([{ item: 1 }, { item: 2 }], { 1: true }) !== false) fail('prove', 'incomplete answers should not be ready');
if (proveReady([{ item: 1 }, { item: 2 }], { 1: true, 2: false }) !== true) fail('prove', 'complete answers should be ready');
if (needAnotherLook(2) !== 'Two need another look.') fail('copy', 'wrong-count copy mismatch');
const share = shareText({ mode: 'daily', day: 0, domainName: 'Numbers', levelName: 'Medium', stars: 2, result: 'solved', log: [{ in: true, kind: 'test' }, { in: false, kind: 'test' }], proveFails: 1 });
const shareLines = share.split('\n');
if (shareLines[0] !== 'Deductidle #1 · Medium · Numbers · ★★☆') fail('share', `unexpected share head: ${shareLines[0]}`);
if (shareLines[1] !== '🟩⬛ ❌✅') fail('share', `unexpected share row: ${shareLines[1]}`);
if (!/^https:\/\//.test(shareLines[2] || '')) fail('share', 'share text has no link');
const dayShare = dayShareText({ day: 1, slots: [
  { levelName: 'Easy', domainName: 'Emoji', stars: 3, result: 'solved', log: [{ in: true, kind: 'test' }], proveFails: 0 },
  { levelName: 'Medium', domainName: 'Cards', stars: 0, result: 'gaveup', log: [], proveFails: 1 },
  { levelName: 'Hard', domainName: 'Words', stars: 1, result: 'solved', log: [{ in: false, kind: 'test' }], proveFails: 0 },
] }).split('\n');
if (dayShare[0] !== 'Deductidle #2 · 4/9 ★' || dayShare.length !== 5) fail('share', `unexpected day share: ${dayShare.join(' | ')}`);
if (dayShare[2] !== 'Medium · Cards ☆☆☆ ❌🏳️') fail('share', `unexpected day share line: ${dayShare[2]}`);

console.log(`${boards} boards checked, ${bad} violation${bad === 1 ? '' : 's'}`);
process.exit(bad ? 1 : 0);

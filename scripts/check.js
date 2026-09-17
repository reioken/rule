/* Audits every rule of every domain over 60 fixed seeds and the first 365 daily boards.
   Run with: node scripts/check.js — exits 1 if any board breaks a guarantee. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
for (const f of ['words.js', 'domains.js', 'engine.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const E = window.RuleEngine, D = window.RuleDomains;

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

console.log(`${boards} boards checked, ${bad} violation${bad === 1 ? '' : 's'}`);
process.exit(bad ? 1 : 0);

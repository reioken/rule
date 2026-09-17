/* Rule — generic round generator. Works on any domain's pool + rule. */
(() => {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }
  const pool = (domain, rule, rng) => shuffle(domain.pool(rule.range), rng);

  /* Eight opening examples on which the real rule and the trap agree. */
  function buildEvidence(domain, rule, rng) {
    const list = pool(domain, rule, rng);
    const agreeIn = list.filter((x) => rule.test(x) && rule.trap(x)).slice(0, 4);
    const agreeOut = list.filter((x) => !rule.test(x) && !rule.trap(x)).slice(0, 4);
    return shuffle([...agreeIn.map((x) => ({ item: x, in: true })), ...agreeOut.map((x) => ({ item: x, in: false }))], rng);
  }

  /* Six items to prove yourself on; at least three split the rule from the trap. */
  function buildProve(domain, rule, used, rng) {
    const list = pool(domain, rule, rng).filter((x) => !used.has(x));
    const disagree = list.filter((x) => rule.test(x) !== rule.trap(x));
    const agree = list.filter((x) => rule.test(x) === rule.trap(x));
    let picks = [...disagree.slice(0, 4), ...agree.slice(0, 2)];
    let i = 2;
    while (picks.length < 6 && i < agree.length) picks.push(agree[i++]);
    let j = 4;
    while (picks.length < 6 && j < disagree.length) picks.push(disagree[j++]);
    return shuffle(picks.slice(0, 6), rng).map((x) => ({ item: x, in: rule.test(x) }));
  }

  /* One item that exposes the trap in each direction. */
  function trapBreakers(domain, rule) {
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
  const LAUNCH_UTC = Date.UTC(2026, 8, 17); // puzzle #1, a Thursday
  const WEEK = { 1: 'numbers', 2: 'words', 3: 'shapes', 4: 'numbers', 5: 'words', 6: 'shapes', 0: 'words' };

  function dayIndex(date = new Date()) {
    const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((local - LAUNCH_UTC) / 86400000);
  }
  const domainFor = (day) => WEEK[new Date(LAUNCH_UTC + day * 86400000).getUTCDay()];
  function dailyPick(day) {
    const domainId = domainFor(day);
    const rules = window.RuleDomains[domainId].rules;
    let nth = 0; // how many earlier days used this domain
    for (let d = 0; d < day; d++) if (domainFor(d) === domainId) nth++;
    const ruleIdx = (nth * 3) % rules.length;
    return { domainId, ruleIdx, seed: day * 1000 + 17 };
  }

  window.RuleEngine = { mulberry32, buildEvidence, buildProve, trapBreakers, dayIndex, dailyPick, LAUNCH_UTC };
})();

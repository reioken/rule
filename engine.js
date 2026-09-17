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

  /* Six items to prove yourself on: four disagree with the trap where the pool allows (never fewer than
     three), split evenly between the two trap directions, and the six answers are as near 3 In / 3 Out as possible. */
  function buildProve(domain, rule, used, rng) {
    const list = pool(domain, rule, rng).filter((x) => !used.has(x));
    const group = (isIn, splits) => list.filter((x) => rule.test(x) === isIn && (rule.test(x) !== rule.trap(x)) === splits);
    const dIn = group(true, true), dOut = group(false, true), aIn = group(true, false), aOut = group(false, false);
    const picks = [], take = (src) => (src.length ? (picks.push(src.shift()), true) : false);
    for (let i = 0; i < 2; i++) { take(dIn); take(dOut); }                 // two per direction before a third
    while (picks.length < 4 && take(dIn.length >= dOut.length ? dIn : dOut));
    while (picks.length < 6) {
      const inN = picks.filter((x) => rule.test(x)).length;                // top up whichever answer is behind
      if (!(inN * 2 <= picks.length ? [aIn, dIn, aOut, dOut] : [aOut, dOut, aIn, dIn]).some(take)) break;
    }
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
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let stride = 3; // smallest stride from 3 up that is coprime with the library size, so every rule gets a turn
    while (gcd(stride, rules.length) !== 1) stride++;
    const ruleIdx = (nth * stride) % rules.length;
    return { domainId, ruleIdx, seed: day * 1000 + 17 };
  }

  window.RuleEngine = { mulberry32, buildEvidence, buildProve, trapBreakers, dayIndex, dailyPick, LAUNCH_UTC };
})();

/* Deductidle — Black Box. A hidden function: something goes in, something comes out. Server-only.
   Two domains, numbers and words. Given pairs are chosen to keep as many wrong functions alive as possible. */
import { RuleWords } from './words.js';
import { mulberry32, shuffle } from './engine.js';
import { LAUNCH_UTC, boxDomainFor } from './schedule.js';

const digits = (n) => String(Math.abs(n)).split('').map(Number);
const dsum = (n) => digits(n).reduce((a, b) => a + b, 0);
const dprod = (n) => digits(n).reduce((a, b) => a * b, 1);
const rev = (n) => Number(String(Math.abs(n)).split('').reverse().join('')) * (n < 0 ? -1 : 1);

const NUM_FUNCS = [
  { id: 'double', name: 'Doubles it', detail: 'Output is the input times 2.', f: (n) => n * 2, par: 3 },
  { id: 'triple', name: 'Triples it', detail: 'Output is the input times 3.', f: (n) => n * 3, par: 3 },
  { id: 'plus7', name: 'Adds 7', detail: 'Output is the input plus 7.', f: (n) => n + 7, par: 3 },
  { id: 'square', name: 'Squares it', detail: 'Output is the input times itself.', f: (n) => n * n, par: 4 },
  { id: 'dsum', name: 'Adds up the digits', detail: '47 becomes 4 + 7 = 11.', f: dsum, par: 4 },
  { id: 'reverse', name: 'Reverses the digits', detail: '47 becomes 74. 120 becomes 21.', f: rev, par: 4 },
  { id: 'mod7', name: 'Remainder after dividing by 7', detail: '47 becomes 5, because 47 = 6 × 7 + 5.', f: (n) => ((n % 7) + 7) % 7, par: 5 },
  { id: 'from100', name: 'Subtracts it from 100', detail: 'Output is 100 minus the input.', f: (n) => 100 - n, par: 4 },
  { id: 'dprod', name: 'Multiplies the digits', detail: '47 becomes 4 × 7 = 28.', f: dprod, par: 4 },
  { id: 'ndigits', name: 'Counts the digits', detail: '47 becomes 2. 5 becomes 1.', f: (n) => digits(n).length, par: 3 },
  { id: 'maxdigit', name: 'Keeps the biggest digit', detail: '47 becomes 7. 903 becomes 9.', f: (n) => Math.max(...digits(n)), par: 4 },
  { id: 'mindigit', name: 'Keeps the smallest digit', detail: '47 becomes 4. 903 becomes 0.', f: (n) => Math.min(...digits(n)), par: 4 },
  { id: 'sortdigits', name: 'Sorts the digits', detail: 'Smallest first. 731 becomes 137.', f: (n) => Number(digits(n).sort((a, b) => a - b).join('')), par: 5 },
  { id: 'double1', name: 'Doubles it, then adds 1', detail: 'Output is 2 × input + 1.', f: (n) => n * 2 + 1, par: 4 },
  { id: 'ends', name: 'Adds the first and last digit', detail: '47 becomes 4 + 7 = 11. 5 becomes 10.', f: (n) => { const d = digits(n); return d[0] + d[d.length - 1]; }, par: 5 },
  { id: 'sqminus', name: 'Squares it, then takes it away', detail: 'Output is input × input − input. 5 becomes 20.', f: (n) => n * n - n, par: 5 },
  { id: 'tri', name: 'Adds every number up to it', detail: '5 becomes 1 + 2 + 3 + 4 + 5 = 15.', f: (n) => (n * (n + 1)) / 2, par: 5 },
  { id: 'collatz', name: 'Halves evens, triples odds and adds 1', detail: '10 becomes 5. 7 becomes 22. The Collatz step.', f: (n) => (n % 2 === 0 ? n / 2 : 3 * n + 1), par: 6 },
  { id: 'times11', name: 'Multiplies by 11', detail: 'Output is the input times 11.', f: (n) => n * 11, par: 4 },
  { id: 'dsum2', name: 'Squares the digit sum', detail: '47 becomes (4 + 7)² = 121.', f: (n) => dsum(n) ** 2, par: 5 },
  { id: 'twice', name: 'Writes it twice', detail: '47 becomes 4747.', f: (n) => Number(`${n}${n}`), par: 4 },
  { id: 'half', name: 'Halves it, rounding down', detail: '47 becomes 23.', f: (n) => Math.floor(n / 2), par: 4 },
  { id: 'plusdsum', name: 'Adds its own digit sum', detail: '47 becomes 47 + 11 = 58.', f: (n) => n + dsum(n), par: 5 },
  { id: 'sqlast', name: 'Last digit of the square', detail: '47 squared is 2209, so 9.', f: (n) => (n * n) % 10, par: 5 },
  { id: 'plusrev', name: 'Adds its own reverse', detail: '47 becomes 47 + 74 = 121.', f: (n) => n + rev(n), par: 5 },
  { id: 'to5', name: 'Rounds up to a multiple of 5', detail: '47 becomes 50. 20 stays 20.', f: (n) => Math.ceil(n / 5) * 5, par: 5 },
  { id: 'odddigits', name: 'Counts the odd digits', detail: '47 becomes 1. 135 becomes 3.', f: (n) => digits(n).filter((d) => d % 2).length, par: 5 },
  { id: 'gap', name: 'Biggest digit minus smallest', detail: '47 becomes 3. 909 becomes 9.', f: (n) => Math.max(...digits(n)) - Math.min(...digits(n)), par: 5 },
];

const V = /[aeiou]/g;
const WORD_FUNCS = [
  { id: 'reverse', name: 'Reverses it', detail: 'cat becomes tac.', f: (w) => [...w].reverse().join(''), par: 3 },
  { id: 'rotate', name: 'Moves the first letter to the end', detail: 'cat becomes atc.', f: (w) => w.slice(1) + w[0], par: 4 },
  { id: 'dbl-last', name: 'Doubles the last letter', detail: 'cat becomes catt.', f: (w) => w + w[w.length - 1], par: 3 },
  { id: 'novowels', name: 'Removes the vowels', detail: 'house becomes hs.', f: (w) => w.replace(V, ''), par: 4 },
  { id: 'length', name: 'Counts the letters', detail: 'cat becomes 3.', f: (w) => String(w.length), par: 3 },
  { id: 'sort', name: 'Sorts the letters', detail: 'cat becomes act.', f: (w) => [...w].sort().join(''), par: 4 },
  { id: 'rot1', name: 'Shifts every letter by one', detail: 'cat becomes dbu. z wraps to a.', f: (w) => [...w].map((c) => String.fromCharCode(97 + ((c.charCodeAt(0) - 97 + 1) % 26))).join(''), par: 4 },
  { id: 'ends', name: 'Keeps the first and last letter', detail: 'house becomes he.', f: (w) => w[0] + w[w.length - 1], par: 4 },
  { id: 'dbl-all', name: 'Doubles every letter', detail: 'cat becomes ccaatt.', f: (w) => [...w].map((c) => c + c).join(''), par: 3 },
  { id: 'consonants', name: 'Counts the consonants', detail: 'house becomes 2.', f: (w) => String(w.replace(V, '').length), par: 5 },
  { id: 'mirror', name: 'Adds its own mirror image', detail: 'cat becomes cattac.', f: (w) => w + [...w].reverse().join(''), par: 4 },
  { id: 'swap-ends', name: 'Swaps the first and last letter', detail: 'cat becomes tac. house becomes eoush.', f: (w) => (w.length < 2 ? w : w[w.length - 1] + w.slice(1, -1) + w[0]), par: 5 },
  { id: 'drop-first', name: 'Drops the first letter', detail: 'cat becomes at.', f: (w) => w.slice(1), par: 3 },
  { id: 'middle', name: 'Keeps the middle', detail: 'The middle letter, or middle two. house becomes u. cast becomes as.', f: (w) => (w.length % 2 ? w[(w.length - 1) / 2] : w.slice(w.length / 2 - 1, w.length / 2 + 1)), par: 5 },
  { id: 'first-rep', name: 'Repeats the first letter once per letter', detail: 'cat becomes ccc.', f: (w) => w[0].repeat(w.length), par: 4 },
  { id: 'vowels', name: 'Counts the vowels', detail: 'house becomes 3.', f: (w) => String((w.match(V) || []).length), par: 4 },
  { id: 'stars', name: 'Hides the vowels', detail: 'house becomes h**s*.', f: (w) => w.replace(V, '*'), par: 3 },
  { id: 'piglatin', name: 'Speaks pig latin', detail: 'Moves the starting consonants to the end and adds "ay". cat becomes atcay, apple becomes appleay.', f: (w) => { const m = w.match(/^[^aeiou]+/); return m ? w.slice(m[0].length) + m[0] + 'ay' : w + 'ay'; }, par: 5 },
  { id: 'alpha-pos', name: 'Position of the first letter', detail: 'a is 1, z is 26. cat becomes 3.', f: (w) => String(w.charCodeAt(0) - 96), par: 5 },
  { id: 'every-other', name: 'Keeps every other letter', detail: 'house becomes hue.', f: (w) => [...w].filter((_, i) => i % 2 === 0).join(''), par: 4 },
  { id: 'letter-sum', name: 'Adds up the letter positions', detail: 'a is 1, b is 2. cat becomes 3 + 1 + 20 = 24.', f: (w) => String([...w].reduce((a, c) => a + c.charCodeAt(0) - 96, 0)), par: 6 },
  { id: 'vowels-only', name: 'Keeps only the vowels', detail: 'house becomes oue.', f: (w) => (w.match(V) || []).join('') || '-', par: 4 },
  { id: 'caps-count', name: 'Counts the letters, doubled', detail: 'cat becomes 6.', f: (w) => String(w.length * 2), par: 5 },
];

const norm = (s) => String(s).trim().toLowerCase();
const numPool = () => { const a = []; for (let n = 2; n <= 140; n++) a.push(n); return a; };
const wordPool = () => RuleWords.filter((w) => w.length >= 3 && w.length <= 6).slice(0, 900);

export const BoxDomains = {
  numbers: {
    id: 'numbers', name: 'Numbers', noun: 'number', funcs: NUM_FUNCS, pool: numPool,
    parse(raw) { const s = norm(raw); if (!/^\d{1,4}$/.test(s)) return { error: 'Use one whole number.' }; return { item: Number.parseInt(s, 10) }; },
    out: (v) => String(v),
  },
  words: {
    id: 'words', name: 'Words', noun: 'word', funcs: WORD_FUNCS, pool: wordPool,
    parse(raw) { const s = norm(raw); if (!/^[a-z]{2,10}$/.test(s)) return { error: 'Letters only, 2 to 10.' }; return { item: s }; },
    out: (v) => String(v),
  },
  list: [],
};
BoxDomains.list = [BoxDomains.numbers, BoxDomains.words];

export const run = (domain, fn, input) => domain.out(fn.f(input));
export const sameOut = (a, b) => norm(a) === norm(b);

/* Three given pairs. Of many candidate sets, keep the one on which the most other functions agree. */
export function buildGiven(domain, fn, rng, n = 3) {
  const items = shuffle(domain.pool(), rng).slice(0, 60);
  const others = domain.funcs.filter((g) => g !== fn);
  let best = null, bestScore = -1, bestAlive = [];
  for (let t = 0; t < 60; t++) {
    const picks = shuffle(items.slice(), rng).slice(0, n);
    const outs = picks.map((x) => run(domain, fn, x));
    if (new Set(outs).size < Math.min(2, n)) continue; // avoid three identical outputs
    const alive = others.filter((g) => picks.every((x, i) => sameOut(run(domain, g, x), outs[i])));
    if (alive.length > bestScore) { bestScore = alive.length; best = picks; bestAlive = alive; }
  }
  return { given: best.map((x) => ({ input: x, output: run(domain, fn, x) })), lookalike: bestAlive[0] ? bestAlive[0].name : null };
}

/* Four inputs to prove on, none seen before. Chosen greedily so that no other function in the
   library produces the same four outputs: every lookalike is eliminated by at least one input. */
export function buildProve(domain, fn, used, rng, n = 4) {
  const items = shuffle(domain.pool(), rng).filter((x) => !used.has(x)).slice(0, 80);
  let alive = domain.funcs.filter((g) => g !== fn);
  const picks = [];
  const kills = (x) => { const o = run(domain, fn, x); return alive.filter((g) => !sameOut(run(domain, g, x), o)); };
  while (picks.length < n) {
    let best = null, bestKilled = null;
    for (const x of items) {
      if (picks.includes(x)) continue;
      const k = kills(x);
      if (!best || k.length > bestKilled.length) { best = x; bestKilled = k; }
    }
    if (best === null) break;
    picks.push(best);
    alive = alive.filter((g) => !bestKilled.includes(g));
  }
  return shuffle(picks, rng).map((x) => ({ input: x, output: run(domain, fn, x) }));
}

export function dailyBox(day) {
  const domainId = boxDomainFor(day);
  const funcs = BoxDomains[domainId].funcs;
  let nth = 0;
  for (let d = 0; d < day; d++) if (boxDomainFor(d) === domainId) nth++;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let stride = 5;
  while (gcd(stride, funcs.length) !== 1) stride++;
  return { domainId, fnIdx: (nth * stride) % funcs.length, seed: day * 1000 + 313 };
}
export { LAUNCH_UTC, mulberry32 };

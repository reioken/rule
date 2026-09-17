/* Rule — puzzle library and round generator.
   A puzzle is a hidden rule (test) plus a trap rule that agrees with it on the
   opening evidence but disagrees on the numbers you have to prove yourself on. */

const digits = (n) => String(n).split('').map(Number);
const digitSum = (n) => digits(n).reduce((a, b) => a + b, 0);
const isPrime = (n) => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
const ascending = (n) => {
  const d = digits(n);
  return d.length > 1 && d.every((x, i) => i === 0 || x > d[i - 1]);
};
const descending = (n) => {
  const d = digits(n);
  return d.length > 1 && d.every((x, i) => i === 0 || x < d[i - 1]);
};
const hasRepeat = (n) => new Set(digits(n)).size !== digits(n).length;
const hasDouble = (n) => /(\d)\1/.test(String(n));
const isPalindrome = (n) => {
  const s = String(n);
  return s === [...s].reverse().join('');
};
const first = (n) => digits(n)[0];
const last = (n) => n % 10;
const isSquare = (n) => Number.isInteger(Math.sqrt(n));

/* Each puzzle: rule/detail are shown on reveal. trapName is the wrong rule that
   fits the opening evidence. par is the number of tests a sharp player needs. */
const PUZZLES = [
  { id: 'curvy', rule: 'Has a curvy digit', detail: 'A 0, 2, 3, 5, 6, 8 or 9 appears somewhere in the number.',
    test: (n) => /[0235689]/.test(String(n)), trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },

  { id: 'sum-odd', rule: 'Digits add up to an odd number', detail: 'Add every digit together. The total is odd.',
    test: (n) => digitSum(n) % 2 === 1, trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 4 },

  { id: 'ascending', rule: 'Digits go up', detail: 'Two or more digits, and each one is bigger than the one before it.',
    test: ascending, trap: (n) => !hasRepeat(n), trapName: 'no repeated digits', par: 4 },

  { id: 'has-seven', rule: 'Contains a 7', detail: 'A 7 appears somewhere in the number.',
    test: (n) => String(n).includes('7'), trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 3 },

  { id: 'mult-3', rule: 'Divisible by 3', detail: 'The number is a multiple of 3.',
    test: (n) => n % 3 === 0, trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 3 },

  { id: 'square', rule: 'A square number', detail: 'Some whole number times itself. 25 is 5 × 5.',
    test: isSquare, trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 5, range: [10, 999] },

  { id: 'first-gt-last', rule: 'First digit beats last digit', detail: 'The first digit is bigger than the last digit.',
    test: (n) => first(n) > last(n), trap: (n) => first(n) >= 5, trapName: 'starts with 5 or higher', par: 4 },

  { id: 'repeat', rule: 'A digit appears twice', detail: 'Some digit shows up more than once, anywhere in the number.',
    test: hasRepeat, trap: hasDouble, trapName: 'two identical digits side by side', par: 4 },

  { id: 'sum-10', rule: 'Digits add up to 10', detail: 'Add every digit together. The total is exactly 10.',
    test: (n) => digitSum(n) === 10, trap: (n) => last(n) >= 5, trapName: 'ends in 5 or higher', par: 5 },

  { id: 'palindrome', rule: 'Reads the same backwards', detail: '121 backwards is still 121.',
    test: isPalindrome, trap: hasRepeat, trapName: 'a repeated digit', par: 4 },

  { id: 'prime', rule: 'A prime number', detail: 'Only divisible by 1 and itself.',
    test: isPrime, trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 5, range: [10, 200] },

  { id: 'has-zero', rule: 'Contains a 0', detail: 'A 0 appears somewhere in the number.',
    test: (n) => String(n).includes('0'), trap: (n) => n % 10 === 0, trapName: 'multiples of 10', par: 3 },

  { id: 'mult-4', rule: 'Divisible by 4', detail: 'The number is a multiple of 4.',
    test: (n) => n % 4 === 0, trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },

  { id: 'even-digit', rule: 'Has an even digit', detail: 'A 0, 2, 4, 6 or 8 appears somewhere in the number.',
    test: (n) => /[02468]/.test(String(n)), trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },

  { id: 'has-one', rule: 'Contains a 1', detail: 'A 1 appears somewhere in the number.',
    test: (n) => String(n).includes('1'), trap: (n) => first(n) === 1, trapName: 'starts with 1', par: 3 },

  { id: 'mult-5', rule: 'Divisible by 5', detail: 'The number ends in 0 or 5.',
    test: (n) => n % 5 === 0, trap: (n) => last(n) === 5, trapName: 'ends in 5', par: 3 },

  { id: 'even-length', rule: 'An even number of digits', detail: 'Two digits or four digits. Not one, not three.',
    test: (n) => String(n).length % 2 === 0, trap: (n) => n >= 10 && n <= 99, trapName: 'two-digit numbers', par: 4, range: [10, 9999] },

  { id: 'descending', rule: 'Digits go down', detail: 'Two or more digits, and each one is smaller than the one before it.',
    test: descending, trap: (n) => first(n) > last(n), trapName: 'first digit beats last digit', par: 4 },

  { id: 'sum-even', rule: 'Digits add up to an even number', detail: 'Add every digit together. The total is even.',
    test: (n) => digitSum(n) % 2 === 0, trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },

  { id: 'sum-small', rule: 'Digits add up to less than 10', detail: 'Add every digit together. The total is 9 or less.',
    test: (n) => digitSum(n) < 10, trap: (n) => n < 100, trapName: 'numbers under 100', par: 4 },
];

/* Seeded random so everyone gets the same board on the same day. */
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
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pool(puzzle, rng) {
  const [lo, hi] = puzzle.range || [10, 999];
  const list = [];
  for (let n = lo; n <= hi; n++) list.push(n);
  return shuffle(list, rng);
}

/* Eight opening examples on which the real rule and the trap agree. */
function buildEvidence(puzzle, rng) {
  const list = pool(puzzle, rng);
  const agreeIn = list.filter((n) => puzzle.test(n) && puzzle.trap(n)).slice(0, 4);
  const agreeOut = list.filter((n) => !puzzle.test(n) && !puzzle.trap(n)).slice(0, 4);
  return shuffle([
    ...agreeIn.map((n) => ({ n, in: true })),
    ...agreeOut.map((n) => ({ n, in: false })),
  ], rng);
}

/* Six numbers to prove yourself on. At least three of them separate the real
   rule from the trap, so a player following the trap cannot pass. */
function buildProve(puzzle, used, rng) {
  const list = pool(puzzle, rng).filter((n) => !used.has(n));
  const disagree = list.filter((n) => puzzle.test(n) !== puzzle.trap(n));
  const agree = list.filter((n) => puzzle.test(n) === puzzle.trap(n));
  const picks = [...disagree.slice(0, 4), ...agree.slice(0, 2)];
  while (picks.length < 6 && agree.length > picks.length - 4) picks.push(agree[picks.length - 4]);
  return shuffle(picks.slice(0, 6), rng).map((n) => ({ n, in: puzzle.test(n) }));
}

/* The smallest number that exposes the trap in each direction. */
function trapBreakers(puzzle) {
  const [lo, hi] = puzzle.range || [10, 999];
  let falseIn = null, falseOut = null;
  for (let n = lo; n <= hi; n++) {
    if (falseIn === null && puzzle.trap(n) && !puzzle.test(n)) falseIn = n;
    if (falseOut === null && !puzzle.trap(n) && puzzle.test(n)) falseOut = n;
    if (falseIn !== null && falseOut !== null) break;
  }
  return { falseIn, falseOut };
}

const LAUNCH_UTC = Date.UTC(2026, 8, 17); // puzzle #1

function dayIndex(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - LAUNCH_UTC) / 86400000);
}

function dailyPuzzle(day) {
  const idx = ((day * 7) % PUZZLES.length + PUZZLES.length) % PUZZLES.length;
  return { puzzle: PUZZLES[idx], puzzleIdx: idx, seed: day * 1000 + 17 };
}

window.RulePuzzles = { PUZZLES, mulberry32, buildEvidence, buildProve, trapBreakers, dayIndex, dailyPuzzle };

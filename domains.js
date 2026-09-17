/* Rule — domains. A domain is a pool of items plus a rule library.
   Items are primitives (number or string) so game state stays JSON-safe.
   Each rule: { id, rule, detail, test(item), trap(item), trapName, par }. */
(() => {
  /* ---------------- helpers ---------------- */
  const digits = (n) => String(n).split('').map(Number);
  const digitSum = (n) => digits(n).reduce((a, b) => a + b, 0);
  const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  const ascending = (n) => { const d = digits(n); return d.length > 1 && d.every((x, i) => i === 0 || x > d[i - 1]); };
  const descending = (n) => { const d = digits(n); return d.length > 1 && d.every((x, i) => i === 0 || x < d[i - 1]); };
  const hasRepeatDigit = (n) => new Set(digits(n)).size !== digits(n).length;
  const hasDoubleDigit = (n) => /(\d)\1/.test(String(n));
  const isPalindrome = (s) => { s = String(s); return s === [...s].reverse().join(''); };
  const first = (n) => digits(n)[0];
  const last = (n) => n % 10;
  const isSquare = (n) => Number.isInteger(Math.sqrt(n));

  /* ---------------- NUMBERS ---------------- */
  const NUMBERS = {
    id: 'numbers', name: 'Numbers', noun: 'number', input: 'text',
    placeholder: 'Try any number', inputMode: 'numeric', maxLength: 6,
    lead: 'Some numbers are <b class="in-word">in</b>, some are <b class="out-word">out</b>. One rule decides. Work it out.',
    pool(range = [10, 999]) { const a = []; for (let n = range[0]; n <= range[1]; n++) a.push(n); return a; },
    parse(raw) {
      const s = raw.trim();
      if (!/^\d{1,6}$/.test(s)) return { error: 'Whole numbers only' };
      return { item: Number.parseInt(s, 10) };
    },
    render(n) { return `<span class="t-num">${n}</span>`; },
    label(n) { return String(n); },
    rules: [
      { id: 'curvy', rule: 'Has a curvy digit', detail: 'A 0, 2, 3, 5, 6, 8 or 9 appears somewhere in the number.', test: (n) => /[0235689]/.test(String(n)), trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },
      { id: 'sum-odd', rule: 'Digits add up to an odd number', detail: 'Add every digit together. The total is odd.', test: (n) => digitSum(n) % 2 === 1, trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 4 },
      { id: 'ascending', rule: 'Digits go up', detail: 'Two or more digits, each bigger than the one before it.', test: ascending, trap: (n) => !hasRepeatDigit(n), trapName: 'no repeated digits', par: 4 },
      { id: 'has-seven', rule: 'Contains a 7', detail: 'A 7 appears somewhere in the number.', test: (n) => String(n).includes('7'), trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 3 },
      { id: 'mult-3', rule: 'Divisible by 3', detail: 'The number is a multiple of 3.', test: (n) => n % 3 === 0, trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 3 },
      { id: 'square', rule: 'A square number', detail: 'Some whole number times itself. 25 is 5 × 5.', test: isSquare, trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 5 },
      { id: 'first-gt-last', rule: 'First digit beats last digit', detail: 'The first digit is bigger than the last digit.', test: (n) => first(n) > last(n), trap: (n) => first(n) >= 5, trapName: 'starts with 5 or higher', par: 4 },
      { id: 'repeat', rule: 'A digit appears twice', detail: 'Some digit shows up more than once, anywhere in the number.', test: hasRepeatDigit, trap: hasDoubleDigit, trapName: 'two identical digits side by side', par: 4 },
      { id: 'sum-10', rule: 'Digits add up to 10', detail: 'Add every digit together. The total is exactly 10.', test: (n) => digitSum(n) === 10, trap: (n) => last(n) >= 5, trapName: 'ends in 5 or higher', par: 5 },
      { id: 'palindrome', rule: 'Reads the same backwards', detail: '121 backwards is still 121.', test: isPalindrome, trap: hasRepeatDigit, trapName: 'a repeated digit', par: 4 },
      { id: 'prime', rule: 'A prime number', detail: 'Only divisible by 1 and itself.', test: isPrime, trap: (n) => n % 2 === 1, trapName: 'odd numbers', par: 5, range: [10, 200] },
      { id: 'has-zero', rule: 'Contains a 0', detail: 'A 0 appears somewhere in the number.', test: (n) => String(n).includes('0'), trap: (n) => n % 10 === 0, trapName: 'multiples of 10', par: 3 },
      { id: 'mult-4', rule: 'Divisible by 4', detail: 'The number is a multiple of 4.', test: (n) => n % 4 === 0, trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },
      { id: 'even-digit', rule: 'Has an even digit', detail: 'A 0, 2, 4, 6 or 8 appears somewhere in the number.', test: (n) => /[02468]/.test(String(n)), trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },
      { id: 'has-one', rule: 'Contains a 1', detail: 'A 1 appears somewhere in the number.', test: (n) => String(n).includes('1'), trap: (n) => first(n) === 1, trapName: 'starts with 1', par: 3 },
      { id: 'mult-5', rule: 'Divisible by 5', detail: 'The number ends in 0 or 5.', test: (n) => n % 5 === 0, trap: (n) => last(n) === 5, trapName: 'ends in 5', par: 3 },
      { id: 'even-length', rule: 'An even number of digits', detail: 'Two digits or four digits. Not one, not three.', test: (n) => String(n).length % 2 === 0, trap: (n) => n >= 10 && n <= 99, trapName: 'two-digit numbers', par: 4, range: [10, 9999] },
      { id: 'descending', rule: 'Digits go down', detail: 'Two or more digits, each smaller than the one before it.', test: descending, trap: (n) => first(n) > last(n), trapName: 'first digit beats last digit', par: 4 },
      { id: 'sum-even', rule: 'Digits add up to an even number', detail: 'Add every digit together. The total is even.', test: (n) => digitSum(n) % 2 === 0, trap: (n) => n % 2 === 0, trapName: 'even numbers', par: 4 },
      { id: 'sum-small', rule: 'Digits add up to less than 10', detail: 'Add every digit together. The total is 9 or less.', test: (n) => digitSum(n) < 10, trap: (n) => n < 100, trapName: 'numbers under 100', par: 4 },
    ],
  };

  /* ---------------- WORDS ---------------- */
  const V = /[aeiou]/;
  const vowels = (w) => (w.match(/[aeiou]/g) || []).length;
  const consonants = (w) => w.length - vowels(w);
  const hasDoubleLetter = (w) => /([a-z])\1/.test(w);
  const uniqueLetters = (w) => new Set(w).size === w.length;
  const alternates = (w) => { for (let i = 1; i < w.length; i++) if (V.test(w[i]) === V.test(w[i - 1])) return false; return true; };
  const alphabetical = (w) => { for (let i = 1; i < w.length; i++) if (w[i] < w[i - 1]) return false; return true; };
  const leftHand = (w) => /^[qwertasdfgzxcvb]+$/.test(w);
  const threeConsonants = (w) => /[^aeiou]{3}/.test(w);

  const WORDS = {
    id: 'words', name: 'Words', noun: 'word', input: 'text',
    placeholder: 'Try any word', inputMode: 'text', maxLength: 12,
    lead: 'Some words are <b class="in-word">in</b>, some are <b class="out-word">out</b>. One rule decides. Work it out.',
    pool() { return window.RuleWords.slice(); },
    parse(raw) {
      const s = raw.trim().toLowerCase();
      if (!/^[a-z]{2,12}$/.test(s)) return { error: 'Letters only, 2 to 12' };
      return { item: s };
    },
    render(w) { return `<span class="t-word">${w}</span>`; },
    label(w) { return w; },
    rules: [
      { id: 'double', rule: 'Has a double letter', detail: 'Two identical letters side by side, like the LL in yellow.', test: hasDoubleLetter, trap: (w) => w.length >= 6, trapName: 'long words', par: 4 },
      { id: 'same-ends', rule: 'Starts and ends with the same letter', detail: 'First letter equals last letter, like "trust".', test: (w) => w[0] === w[w.length - 1], trap: (w) => !uniqueLetters(w), trapName: 'a repeated letter', par: 4 },
      { id: 'alternate', rule: 'Vowels and consonants alternate', detail: 'No two vowels or two consonants touch, like "banana".', test: alternates, trap: (w) => !hasDoubleLetter(w), trapName: 'no double letters', par: 5 },
      { id: 'has-e', rule: 'Contains an E', detail: 'The letter E appears somewhere in the word.', test: (w) => w.includes('e'), trap: (w) => w.length >= 5, trapName: 'words with 5 or more letters', par: 3 },
      { id: 'abc-order', rule: 'Letters in alphabetical order', detail: 'Each letter comes at or after the one before it, like "first" or "almost".', test: alphabetical, trap: uniqueLetters, trapName: 'no repeated letters', par: 5 },
      { id: 'vowel-start', rule: 'Starts with a vowel', detail: 'The first letter is A, E, I, O or U.', test: (w) => V.test(w[0]), trap: (w) => w[0] === 'a', trapName: 'words starting with A', par: 3 },
      { id: 'left-hand', rule: 'Typed with the left hand', detail: 'Every letter sits on the left side of a keyboard: Q W E R T, A S D F G, Z X C V B.', test: leftHand, trap: (w) => w.length <= 5, trapName: 'short words', par: 5 },
      { id: 'vowel-end', rule: 'Ends with a vowel', detail: 'The last letter is A, E, I, O or U.', test: (w) => V.test(w[w.length - 1]), trap: (w) => w.endsWith('e'), trapName: 'words ending in E', par: 3 },
      { id: 'odd-length', rule: 'An odd number of letters', detail: 'Three, five or seven letters. Not four, six or eight.', test: (w) => w.length % 2 === 1, trap: (w) => w.length === 5, trapName: 'five-letter words', par: 4 },
      { id: 'unique', rule: 'No letter repeats', detail: 'Every letter in the word is different.', test: uniqueLetters, trap: (w) => w.length <= 5, trapName: 'short words', par: 4 },
      { id: 'has-y', rule: 'Contains a Y', detail: 'The letter Y appears somewhere in the word.', test: (w) => w.includes('y'), trap: (w) => w.endsWith('y'), trapName: 'words ending in Y', par: 3 },
      { id: 'three-cons', rule: 'Three consonants in a row', detail: 'Somewhere, three consonants touch, like the NGT in "length".', test: threeConsonants, trap: (w) => w.length >= 6, trapName: 'long words', par: 4 },
      { id: 'more-vowels', rule: 'More vowels than consonants', detail: 'Count them. Vowels win, like in "audio" or "idea".', test: (w) => vowels(w) > consonants(w), trap: (w) => w.length <= 5, trapName: 'short words', par: 5 },
      { id: 'two-vowels', rule: 'Exactly two vowels', detail: 'Count A, E, I, O and U. There are exactly two.', test: (w) => vowels(w) === 2, trap: (w) => w.length <= 5, trapName: 'short words', par: 4 },
    ],
  };

  /* ---------------- SHAPES ---------------- */
  const SIDES = [3, 4, 5, 6, 7, 8, 0];   // 0 = circle
  const COLORS = ['red', 'yellow', 'green', 'blue'];
  const FILLS = ['filled', 'outline'];
  const SIZES = ['big', 'small'];
  const shape = (key) => { const [s, c, f, z] = key.split(':'); return { sides: Number(s), color: c, fill: f, size: z || 'big' }; };
  const SHAPE_NAMES = { 0: 'circle', 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };
  const HEX = { red: '#e0563f', yellow: '#e7b131', green: '#2f9e6e', blue: '#3b6fe0' };

  function polygonPoints(n, r = 20, cx = 24, cy = 24) {
    const pts = [];
    const start = n === 4 ? -Math.PI / 4 : -Math.PI / 2; // squares sit flat, everything else points up
    for (let i = 0; i < n; i++) { const a = start + (i * 2 * Math.PI) / n; pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`); }
    return pts.join(' ');
  }
  function shapeSvg(key, size = 48) {
    const { sides, color, fill, size: sz } = shape(key);
    const col = HEX[color];
    const r = sz === 'small' ? 12 : 20;   // same centre, same stroke, smaller body
    const paint = fill === 'filled' ? `fill="${col}" stroke="${col}"` : `fill="none" stroke="${col}"`;
    const body = sides === 0 ? `<circle cx="24" cy="24" r="${r}" ${paint} stroke-width="4" stroke-linejoin="round"/>`
      : `<polygon points="${polygonPoints(sides, r)}" ${paint} stroke-width="4" stroke-linejoin="round"/>`;
    return `<svg class="t-shape" width="${size}" height="${size}" viewBox="0 0 48 48" aria-label="${sz} ${fill} ${color} ${SHAPE_NAMES[sides]}">${body}</svg>`;
  }
  const warm = (k) => ['red', 'yellow'].includes(shape(k).color);
  const filled = (k) => shape(k).fill === 'filled';
  const small = (k) => shape(k).size === 'small';
  const big = (k) => shape(k).size === 'big';
  const sidesOf = (k) => shape(k).sides;

  const SHAPES = {
    id: 'shapes', name: 'Shapes', noun: 'shape', input: 'builder',
    lead: 'Some shapes are <b class="in-word">in</b>, some are <b class="out-word">out</b>. One rule decides. Work it out.',
    SIDES, COLORS, FILLS, SIZES, SHAPE_NAMES, HEX, svg: shapeSvg,
    pool() { const a = []; for (const s of SIDES) for (const c of COLORS) for (const f of FILLS) for (const z of SIZES) a.push(`${s}:${c}:${f}:${z}`); return a; },
    parse(raw) { return { item: raw }; },
    render(k) { return shapeSvg(k, 44); },
    label(k) { const { sides, color, fill, size } = shape(k); return `${size} ${fill} ${color} ${SHAPE_NAMES[sides]}`; },
    rules: [
      { id: 'odd-sides', rule: 'An odd number of sides', detail: 'Triangles, pentagons and heptagons. Circles have no sides.', test: (k) => [3, 5, 7].includes(sidesOf(k)), trap: filled, trapName: 'filled shapes', par: 4 },
      { id: 'warm', rule: 'A warm colour', detail: 'Red or yellow, whatever the shape.', test: warm, trap: filled, trapName: 'filled shapes', par: 3 },
      { id: 'filled', rule: 'Filled in', detail: 'Solid shapes are in. Outlines are out. Colour and sides don\'t matter.', test: filled, trap: warm, trapName: 'warm colours', par: 3 },
      { id: 'many-sides', rule: 'More than four sides', detail: 'Pentagon or up. Circles don\'t count.', test: (k) => sidesOf(k) > 4, trap: (k) => !warm(k), trapName: 'cool colours', par: 4 },
      { id: 'four-sides', rule: 'Exactly four sides', detail: 'Only squares get in.', test: (k) => sidesOf(k) === 4, trap: (k) => !filled(k), trapName: 'outlined shapes', par: 3 },
      { id: 'cool', rule: 'A cool colour', detail: 'Green or blue, whatever the shape.', test: (k) => !warm(k), trap: (k) => sidesOf(k) % 2 === 0, trapName: 'an even number of sides', par: 4 },
      { id: 'few-sides', rule: 'Four sides or fewer', detail: 'Triangles and squares only.', test: (k) => sidesOf(k) > 0 && sidesOf(k) <= 4, trap: (k) => shape(k).color === 'yellow' || shape(k).color === 'red', trapName: 'warm colours', par: 4 },
      { id: 'round-or-8', rule: 'Rolls', detail: 'Circles and octagons. Anything that would roll down a hill.', test: (k) => sidesOf(k) === 0 || sidesOf(k) === 8, trap: (k) => shape(k).color === 'blue', trapName: 'blue shapes', par: 4 },
      { id: 'red-filled', rule: 'Red and filled', detail: 'Both at once. A red outline is out, a filled blue is out.', test: (k) => shape(k).color === 'red' && filled(k), trap: (k) => shape(k).color === 'red', trapName: 'red shapes', par: 5 },
      { id: 'even-sides', rule: 'An even number of sides', detail: 'Squares, hexagons and octagons. Circles are out.', test: (k) => sidesOf(k) > 0 && sidesOf(k) % 2 === 0, trap: (k) => shape(k).color === 'green' || shape(k).color === 'blue', trapName: 'cool colours', par: 4 },
      { id: 'small', rule: 'Small', detail: 'Size is all that matters. Colour, sides and fill are ignored.', test: small, trap: (k) => !filled(k), trapName: 'outlined shapes', par: 3 },
      { id: 'big-warm', rule: 'Big and warm', detail: 'Big, and red or yellow. A small red shape is out, a big blue one is out.', test: (k) => big(k) && warm(k), trap: warm, trapName: 'warm colours', par: 5 },
    ],
  };

  window.RuleDomains = { numbers: NUMBERS, words: WORDS, shapes: SHAPES, list: [NUMBERS, WORDS, SHAPES] };
})();

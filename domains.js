/* Deductidle — domains. A domain is a pool of items plus a rule library.
   Items are primitives (number or string) so game state stays JSON-safe.
   Each rule: { id, rule, detail, test(item), trap(item), trapName, par }.
   Server-only: the client never loads this file. */
import {
  numbersView, wordsView, shapesView, lettersView, emojiView, colorsView, cardsView,
  digits, LETTERS, EMOJIS, COLOR_CHIPS, CARD_RANKS, CARD_SUITS, cardKey, cardParts,
} from './catalog.js';
import { RuleWords } from './words.js';

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

const NUMBERS = {
  ...numbersView,
  pool(range = [10, 999]) { const a = []; for (let n = range[0]; n <= range[1]; n++) a.push(n); return a; },
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
  ...wordsView,
  pool() { return RuleWords.slice(); },
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

const { SIDES, COLORS, FILLS, SIZES, shape } = shapesView;
const warm = (k) => ['red', 'yellow'].includes(shape(k).color);
const filled = (k) => shape(k).fill === 'filled';
const small = (k) => shape(k).size === 'small';
const big = (k) => shape(k).size === 'big';
const sidesOf = (k) => shape(k).sides;

const SHAPES = {
  ...shapesView,
  pool() { const a = []; for (const s of SIDES) for (const c of COLORS) for (const f of FILLS) for (const z of SIZES) a.push(`${s}:${c}:${f}:${z}`); return a; },
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

const letterNo = (ch) => ch.charCodeAt(0) - 96; // A = 1
const firstHalf = (ch) => letterNo(ch) <= 13;
const evenLetter = (ch) => letterNo(ch) % 2 === 0;
const STRAIGHT = new Set([...'aefhiklmntvwxyz']);
const straight = (ch) => STRAIGHT.has(ch);
const VOWEL_L = new Set([...'aeiou']);
const LOOPED = new Set([...'abdopqr']); // capitals with an enclosed space
const TALL = new Set([...'bdfhklt']);   // lowercase ascenders

const LETTERS_D = {
  ...lettersView,
  pool() { return LETTERS.slice(); },
  rules: [
    { id: 'first-half', rule: 'In the first half of the alphabet', detail: 'A through M. N through Z are out.', test: firstHalf, trap: evenLetter, trapName: 'an even place in the alphabet', par: 3 },
    { id: 'straight', rule: 'Made of straight lines', detail: 'Drawn as a capital, every stroke is straight. A, E, F, H, I, K, L, M, N, T, V, W, X, Y, Z.', test: straight, trap: firstHalf, trapName: 'in the first half of the alphabet', par: 4 },
    { id: 'second-half', rule: 'In the second half of the alphabet', detail: 'N through Z. A through M are out.', test: (ch) => !firstHalf(ch), trap: straight, trapName: 'made of straight lines', par: 4 },
    { id: 'even-place', rule: 'An even place in the alphabet', detail: 'B, D, F, H, J, L, N, P, R, T, V, X or Z. A is 1st.', test: evenLetter, trap: firstHalf, trapName: 'in the first half of the alphabet', par: 3 },
    { id: 'vowel', rule: 'A vowel', detail: 'A, E, I, O or U.', test: (ch) => VOWEL_L.has(ch), trap: firstHalf, trapName: 'in the first half of the alphabet', par: 3 },
    { id: 'looped', rule: 'Has an enclosed space', detail: 'As a capital, the letter traps some paper inside it: A, B, D, O, P, Q, R.', test: (ch) => LOOPED.has(ch), trap: (ch) => !straight(ch), trapName: 'has a curve', par: 4 },
    { id: 'tall', rule: 'Tall in lowercase', detail: 'b, d, f, h, k, l, t reach above the others.', test: (ch) => TALL.has(ch), trap: (ch) => !VOWEL_L.has(ch), trapName: 'a consonant', par: 4 },
  ],
};

const EMOJI_TAGS = {
  '🐶': ['animal', 'face'], '🐱': ['animal', 'face'], '🐻': ['animal', 'face'], '🦊': ['animal', 'face'],
  '🐼': ['animal', 'face'], '🐵': ['animal', 'face'], '🐷': ['animal', 'face'], '🦁': ['animal', 'face'],
  '🐮': ['animal', 'face'], '🐸': ['animal', 'face'],
  '🐙': ['animal'], '🦋': ['animal'], '🐝': ['animal'], '🐢': ['animal'], '🐟': ['animal'], '🦀': ['animal', 'red'],
  '😀': ['face'], '😎': ['face'], '🥳': ['face'], '😴': ['face'], '😍': ['face'], '😡': ['face', 'red'],
  '🥶': ['face'], '😇': ['face'],
  '🍎': ['food', 'red'], '🍓': ['food', 'red'], '🍒': ['food', 'red'], '🍅': ['food', 'red'],
  '🍋': ['food'], '🍇': ['food'], '🍕': ['food'], '🍔': ['food'], '🍪': ['food'], '🥕': ['food'],
  '🍩': ['food'], '🌮': ['food'], '🥦': ['food'], '🧀': ['food'],
  '🚗': ['vehicle'], '🚕': ['vehicle'], '🚌': ['vehicle'], '🚲': ['vehicle'],
  '✈️': ['vehicle', 'sky'], '🚀': ['vehicle', 'sky'], '🚢': ['vehicle'], '🚂': ['vehicle'], '🚁': ['vehicle', 'sky'], '🚜': ['vehicle'],
  '❤️': ['red'], '🌹': ['red', 'plant'], '🎈': ['red', 'sky'], '🔥': ['red'], '📌': ['red'], '🛑': ['red'],
  '⭐': ['sky'], '🌙': ['sky'], '☀️': ['sky'], '🌲': ['plant'], '💎': [], '👑': [], '⚽': [], '🎵': [], '📚': [], '🔑': [],
  '🦋': ['animal', 'sky'], '🐝': ['animal', 'sky'],
};
const tagged = (e, t) => (EMOJI_TAGS[e] || []).includes(t);

const EMOJI = {
  ...emojiView,
  pool() { return EMOJIS.slice(); },
  rules: [
    { id: 'animal', rule: 'An animal', detail: 'Living creatures. Faces, food and the rest are out.', test: (e) => tagged(e, 'animal'), trap: (e) => tagged(e, 'face'), trapName: 'a face', par: 3 },
    { id: 'food', rule: 'Food', detail: 'Something you eat. Colour does not matter.', test: (e) => tagged(e, 'food'), trap: (e) => tagged(e, 'red'), trapName: 'red things', par: 4 },
    { id: 'face', rule: 'A face', detail: 'A face looks back at you, animal or smiley.', test: (e) => tagged(e, 'face'), trap: (e) => tagged(e, 'animal'), trapName: 'an animal', par: 3 },
    { id: 'red', rule: 'A red emoji', detail: 'The emoji is red, or mostly red.', test: (e) => tagged(e, 'red'), trap: (e) => tagged(e, 'food'), trapName: 'food', par: 4 },
    { id: 'vehicle', rule: 'Something that moves you', detail: 'Cars, bikes, planes, boats, trains.', test: (e) => tagged(e, 'vehicle'), trap: (e) => !tagged(e, 'animal') && !tagged(e, 'face'), trapName: 'not alive', par: 3 },
    { id: 'alive', rule: 'Alive', detail: 'Animals and plants. Objects, food and smileys are out.', test: (e) => tagged(e, 'animal') || tagged(e, 'plant'), trap: (e) => !tagged(e, 'face') && !tagged(e, 'food') && !tagged(e, 'vehicle'), trapName: 'neither food, a face nor a vehicle', par: 4 },
    { id: 'sky', rule: 'Found in the sky', detail: 'Things that fly or hang up there.', test: (e) => tagged(e, 'sky'), trap: (e) => !tagged(e, 'face') && !tagged(e, 'food'), trapName: 'neither food nor a face', par: 4 },
  ],
};

const WARM = new Set(['red', 'crimson', 'orange', 'gold', 'yellow', 'peach', 'coral', 'pink', 'magenta', 'maroon', 'rust', 'wine', 'umber', 'amber', 'brown', 'beige', 'ivory']);
const DARK = new Set(['crimson', 'maroon', 'rust', 'wine', 'umber', 'brown', 'olive', 'navy', 'indigo', 'black', 'charcoal']);
const BLUEISH = new Set(['teal', 'cyan', 'turquoise', 'sky', 'blue', 'navy', 'indigo']);
const SHORT = (id) => id.length <= 4;
const LIGHT = new Set(['peach', 'pink', 'beige', 'ivory', 'lime', 'mint', 'cyan', 'sky', 'lavender', 'white', 'yellow', 'gold']);
const GREENISH = new Set(['lime', 'green', 'olive', 'mint', 'teal', 'turquoise']);

const COLORS_D = {
  ...colorsView,
  pool() { return COLOR_CHIPS.map((c) => c.id); },
  rules: [
    { id: 'warm', rule: 'A warm colour', detail: 'Reds, oranges, yellows, pinks, browns. Cool greens and blues are out.', test: (id) => WARM.has(id), trap: (id) => DARK.has(id), trapName: 'a dark colour', par: 4 },
    { id: 'dark', rule: 'A dark colour', detail: 'Deep, low-light shades. Pastels and brights are out.', test: (id) => DARK.has(id), trap: (id) => WARM.has(id), trapName: 'a warm colour', par: 4 },
    { id: 'blueish', rule: 'A blue-green', detail: 'Teal, cyan, turquoise, sky, blue, navy or indigo.', test: (id) => BLUEISH.has(id), trap: SHORT, trapName: 'a name with four letters or fewer', par: 4 },
    { id: 'short-name', rule: 'A short name', detail: 'The colour\'s name has four letters or fewer.', test: SHORT, trap: (id) => BLUEISH.has(id), trapName: 'a blue-green', par: 4 },
    { id: 'cool', rule: 'A cool colour', detail: 'Greens, blues, purples, greys. Warm reds and yellows are out.', test: (id) => !WARM.has(id), trap: (id) => DARK.has(id), trapName: 'a dark colour', par: 4 },
    { id: 'light', rule: 'A light colour', detail: 'Pale and pastel shades. Anything deep or saturated is out.', test: (id) => LIGHT.has(id), trap: (id) => !DARK.has(id), trapName: 'not dark', par: 4 },
    { id: 'greenish', rule: 'Has green in it', detail: 'Lime, green, olive, mint, teal, turquoise.', test: (id) => GREENISH.has(id), trap: (id) => !WARM.has(id), trapName: 'a cool colour', par: 4 },
    { id: 'name-e', rule: 'The name has an E', detail: 'Ignore the colour, read the name.', test: (id) => id.includes('e'), trap: (id) => id.length >= 5, trapName: 'a long name', par: 5 },
  ],
};

const isRedSuit = (k) => { const { suit } = cardParts(k); return suit === 'H' || suit === 'D'; };
const isFace = (k) => { const { rank } = cardParts(k); return rank >= 11; };
const isSpade = (k) => cardParts(k).suit === 'S';
const isHeart = (k) => cardParts(k).suit === 'H';
const evenRank = (k) => cardParts(k).rank % 2 === 0;
const highRank = (k) => cardParts(k).rank >= 8;
const PRIMES_R = new Set([2, 3, 5, 7, 11, 13]);
const primeRank = (k) => PRIMES_R.has(cardParts(k).rank);
const isClub = (k) => cardParts(k).suit === 'C';
const lowRank = (k) => cardParts(k).rank <= 5;

const CARDS = {
  ...cardsView,
  pool() {
    const a = [];
    for (const r of CARD_RANKS) for (const s of CARD_SUITS) a.push(cardKey(r, s));
    return a;
  },
  rules: [
    { id: 'red-suit', rule: 'A red suit', detail: 'Hearts and diamonds. Spades and clubs are out.', test: isRedSuit, trap: isFace, trapName: 'a face card', par: 3 },
    { id: 'face', rule: 'A face card', detail: 'Jack, queen or king. Aces and numbers are out.', test: isFace, trap: isRedSuit, trapName: 'a red card', par: 3 },
    { id: 'spade', rule: 'A spade', detail: 'Only spades. The other three suits are out.', test: isSpade, trap: highRank, trapName: '8 or higher', par: 4 },
    { id: 'heart', rule: 'A heart', detail: 'Only hearts.', test: isHeart, trap: evenRank, trapName: 'an even rank', par: 3 },
    { id: 'even-rank', rule: 'An even rank', detail: '2, 4, 6, 8, 10 or queen. Ace is 1.', test: evenRank, trap: isRedSuit, trapName: 'a red card', par: 4 },
    { id: 'high', rule: '8 or higher', detail: '8, 9, 10, jack, queen or king. Ace is low.', test: highRank, trap: isRedSuit, trapName: 'a red card', par: 4 },
    { id: 'black', rule: 'A black suit', detail: 'Spades and clubs. Hearts and diamonds are out.', test: (k) => !isRedSuit(k), trap: (k) => !isFace(k), trapName: 'not a face card', par: 3 },
    { id: 'club', rule: 'A club', detail: 'Only clubs.', test: isClub, trap: lowRank, trapName: '5 or lower', par: 3 },
    { id: 'prime', rule: 'A prime rank', detail: '2, 3, 5, 7, jack (11) or king (13). Ace is 1, which is not prime.', test: primeRank, trap: (k) => !evenRank(k), trapName: 'an odd rank', par: 5 },
    { id: 'low', rule: '5 or lower', detail: 'Ace through 5. Ace is low.', test: lowRank, trap: (k) => !isRedSuit(k), trapName: 'a black card', par: 4 },
  ],
};

export const RuleDomains = {
  numbers: NUMBERS, words: WORDS, shapes: SHAPES,
  letters: LETTERS_D, emoji: EMOJI, colors: COLORS_D, cards: CARDS,
  list: [NUMBERS, WORDS, SHAPES, LETTERS_D, EMOJI, COLORS_D, CARDS],
};

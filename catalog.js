/* Deductidle — public domain UI. Render, parse and pickers. No rules, no pools. */
const digits = (n) => String(n).split('').map(Number);

export const numbersView = {
  id: 'numbers', name: 'Numbers', noun: 'number', input: 'text',
  placeholder: 'Try a number', inputMode: 'numeric', maxLength: 6,
  parse(raw) {
    const s = String(raw).trim();
    if (!/^\d{1,6}$/.test(s)) return { error: 'Use one whole number.' };
    return { item: Number.parseInt(s, 10) };
  },
  render(n) { return `<span class="t-num">${n}</span>`; },
  label(n) { return String(n); },
};

export const wordsView = {
  id: 'words', name: 'Words', noun: 'word', input: 'text',
  placeholder: 'Try a word', inputMode: 'text', maxLength: 12,
  parse(raw) {
    const s = String(raw).trim().toLowerCase();
    if (!/^[a-z]{2,12}$/.test(s)) return { error: 'Letters only, 2 to 12' };
    return { item: s };
  },
  render(w) { return `<span class="t-word">${w}</span>`; },
  label(w) { return w; },
};

const SIDES = [3, 4, 5, 6, 7, 8, 0];   // 0 = circle
const COLORS = ['red', 'yellow', 'green', 'blue'];
const FILLS = ['filled', 'outline'];
const SIZES = ['big', 'small'];
const shape = (key) => { const [s, c, f, z] = String(key).split(':'); return { sides: Number(s), color: c, fill: f, size: z || 'big' }; };
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

export const shapesView = {
  id: 'shapes', name: 'Shapes', noun: 'shape', input: 'builder',
  SIDES, COLORS, FILLS, SIZES, SHAPE_NAMES, HEX, svg: shapeSvg, shape,
  parse(raw) {
    const s = String(raw).trim();
    if (!/^\d+:(red|yellow|green|blue):(filled|outline)(?::(big|small))?$/.test(s)) return { error: 'Unknown shape' };
    return { item: s };
  },
  render(k) { return shapeSvg(k, 44); },
  label(k) { const { sides, color, fill, size } = shape(k); return `${size} ${fill} ${color} ${SHAPE_NAMES[sides]}`; },
};

export const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];
export const lettersView = {
  id: 'letters', name: 'Letters', noun: 'letter', input: 'text',
  placeholder: 'Try a letter', inputMode: 'text', maxLength: 1,
  choices: LETTERS,
  parse(raw) {
    const s = String(raw).trim();
    if (!/^[A-Za-z]$/.test(s)) return { error: 'Use one letter.' };
    return { item: s.toLowerCase() };
  },
  render(ch) { return `<span class="t-letter">${String(ch)}</span>`; },
  label(ch) { return String(ch); },
};

export const EMOJIS = [
  '🐶', '🐱', '🐻', '🦊', '🐼', '🐵', '🐷', '🦁', '🐮', '🐸',
  '🐙', '🦋', '🐝', '🐢', '🐟', '🦀',
  '😀', '😎', '🥳', '😴', '😍', '😡', '🥶', '😇',
  '🍎', '🍓', '🍒', '🍅', '🍋', '🍇', '🍕', '🍔', '🍪', '🥕', '🍩', '🌮', '🥦', '🧀',
  '🚗', '🚕', '🚌', '🚲', '✈️', '🚀', '🚢', '🚂', '🚁', '🚜',
  '❤️', '🌹', '🎈', '🔥', '📌', '🛑',
  '⭐', '🌙', '☀️', '🌲', '💎', '👑', '⚽', '🎵', '📚', '🔑',
];
export const emojiView = {
  id: 'emoji', name: 'Emoji', noun: 'emoji', input: 'pick',
  choices: EMOJIS,
  parse(raw) {
    const s = String(raw).trim();
    if (!EMOJIS.includes(s)) return { error: 'Pick an emoji from the list' };
    return { item: s };
  },
  render(e) { return `<span class="t-emoji">${e}</span>`; },
  label(e) { return e; },
};

export const COLOR_CHIPS = [
  { id: 'red', hex: '#e23d28', name: 'Red' },
  { id: 'crimson', hex: '#b91c3c', name: 'Crimson' },
  { id: 'orange', hex: '#ef7a2a', name: 'Orange' },
  { id: 'gold', hex: '#e2a51a', name: 'Gold' },
  { id: 'yellow', hex: '#e7c31a', name: 'Yellow' },
  { id: 'peach', hex: '#f3b48c', name: 'Peach' },
  { id: 'coral', hex: '#ef6b5a', name: 'Coral' },
  { id: 'pink', hex: '#e86aa0', name: 'Pink' },
  { id: 'magenta', hex: '#c23a8a', name: 'Magenta' },
  { id: 'maroon', hex: '#8a2030', name: 'Maroon' },
  { id: 'rust', hex: '#b54a2a', name: 'Rust' },
  { id: 'wine', hex: '#6e1d3a', name: 'Wine' },
  { id: 'umber', hex: '#5c3a1e', name: 'Umber' },
  { id: 'amber', hex: '#d4940a', name: 'Amber' },
  { id: 'brown', hex: '#7a4a28', name: 'Brown' },
  { id: 'beige', hex: '#d8c3a5', name: 'Beige' },
  { id: 'ivory', hex: '#f3ead2', name: 'Ivory' },
  { id: 'lime', hex: '#8bcf2b', name: 'Lime' },
  { id: 'green', hex: '#2f9e6e', name: 'Green' },
  { id: 'olive', hex: '#6b7a2a', name: 'Olive' },
  { id: 'mint', hex: '#8ed9b6', name: 'Mint' },
  { id: 'teal', hex: '#1f9a8a', name: 'Teal' },
  { id: 'cyan', hex: '#2ec4d4', name: 'Cyan' },
  { id: 'turquoise', hex: '#2aabb0', name: 'Turquoise' },
  { id: 'sky', hex: '#5aa7e8', name: 'Sky' },
  { id: 'blue', hex: '#3b6fe0', name: 'Blue' },
  { id: 'navy', hex: '#243a7a', name: 'Navy' },
  { id: 'indigo', hex: '#4b3fa8', name: 'Indigo' },
  { id: 'purple', hex: '#7a3fa8', name: 'Purple' },
  { id: 'lavender', hex: '#b9a8e0', name: 'Lavender' },
  { id: 'black', hex: '#1a1c1a', name: 'Black' },
  { id: 'charcoal', hex: '#3a3f3a', name: 'Charcoal' },
  { id: 'gray', hex: '#7a7f79', name: 'Gray' },
  { id: 'white', hex: '#f4f1ea', name: 'White' },
];
const colorById = Object.fromEntries(COLOR_CHIPS.map((c) => [c.id, c]));
export const colorsView = {
  id: 'colors', name: 'Colors', noun: 'color', input: 'pick',
  choices: COLOR_CHIPS.map((c) => c.id),
  chips: COLOR_CHIPS,
  parse(raw) {
    const id = String(raw).trim().toLowerCase();
    if (!colorById[id]) return { error: 'Pick a color' };
    return { item: id };
  },
  render(id) {
    const c = colorById[id] || { hex: '#888', name: id };
    return `<span class="t-color" style="background:${c.hex}" title="${c.name}"><span class="vh">${c.name}</span></span>`;
  },
  label(id) { return (colorById[id] || { name: id }).name; },
};

export const CARD_RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const CARD_SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANK_MARK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const cardKey = (rank, suit) => `${rank}${suit}`;
export const cardParts = (key) => ({ rank: Number(String(key).slice(0, -1)), suit: String(key).slice(-1) });
export const cardFace = (key) => {
  const { rank, suit } = cardParts(key);
  return `${RANK_MARK[rank] || rank}${SUIT_MARK[suit]}`;
};
export const cardsView = {
  id: 'cards', name: 'Cards', noun: 'card', input: 'pair',
  RANKS: CARD_RANKS, SUITS: CARD_SUITS, SUIT_MARK, RANK_MARK, key: cardKey, parts: cardParts,
  parse(raw) {
    const s = String(raw).trim().toUpperCase();
    const m = s.match(/^(A|J|Q|K|10|[1-9]|1[0-3])([SHDC])$/);
    if (!m) return { error: 'Pick a card' };
    const rankMap = { A: 1, J: 11, Q: 12, K: 13 };
    const rank = rankMap[m[1]] || Number(m[1]);
    if (rank < 1 || rank > 13) return { error: 'Pick a card' };
    return { item: cardKey(rank, m[2]) };
  },
  render(k) {
    const { suit } = cardParts(k);
    const red = suit === 'H' || suit === 'D';
    const suitName = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[suit] || suit;
    return `<span class="t-card ${red ? 'red' : 'blk'}"><b>${RANK_MARK[cardParts(k).rank] || cardParts(k).rank}</b><i>${SUIT_MARK[suit]}</i><span class="vh">${cardFace(k)} ${suitName}</span></span>`;
  },
  label(k) {
    const { rank, suit } = cardParts(k);
    const suitName = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[suit] || suit;
    return `${RANK_MARK[rank] || rank} of ${suitName}`;
  },
};

export const RuleCatalog = {
  numbers: numbersView, words: wordsView, shapes: shapesView,
  letters: lettersView, emoji: emojiView, colors: colorsView, cards: cardsView,
  list: [numbersView, wordsView, shapesView, lettersView, emojiView, colorsView, cardsView],
};

export function renderPhoto(image) {
  const pos = image && image.focalPoint ? `${image.focalPoint.x}% ${image.focalPoint.y}%` : '50% 50%';
  const alt = String((image && image.alt) || '').replace(/"/g, '&quot;');
  const src = image && image.src ? image.src : '';
  return `<img class="t-photo" src="${src}" alt="${alt}" style="object-position:${pos}">`;
}

export { digits };

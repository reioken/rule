/* Rule — public domain UI. Render, parse and the shape builder. No rules, no pools. */
const digits = (n) => String(n).split('').map(Number);

export const numbersView = {
  id: 'numbers', name: 'Numbers', noun: 'number', input: 'text',
  placeholder: 'Try any number', inputMode: 'numeric', maxLength: 6,
  lead: 'Some numbers are <b class="in-word">in</b>, some are <b class="out-word">out</b>. One rule decides. Work it out.',
  parse(raw) {
    const s = String(raw).trim();
    if (!/^\d{1,6}$/.test(s)) return { error: 'Whole numbers only' };
    return { item: Number.parseInt(s, 10) };
  },
  render(n) { return `<span class="t-num">${n}</span>`; },
  label(n) { return String(n); },
};

export const wordsView = {
  id: 'words', name: 'Words', noun: 'word', input: 'text',
  placeholder: 'Try any word', inputMode: 'text', maxLength: 12,
  lead: 'Some words are <b class="in-word">in</b>, some are <b class="out-word">out</b>. One rule decides. Work it out.',
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
  lead: 'Some shapes are <b class="in-word">in</b>, some are <b class="out-word">out</b>. One rule decides. Work it out.',
  SIDES, COLORS, FILLS, SIZES, SHAPE_NAMES, HEX, svg: shapeSvg, shape,
  parse(raw) {
    const s = String(raw).trim();
    if (!/^\d+:(red|yellow|green|blue):(filled|outline)(?::(big|small))?$/.test(s)) return { error: 'Unknown shape' };
    return { item: s };
  },
  render(k) { return shapeSvg(k, 44); },
  label(k) { const { sides, color, fill, size } = shape(k); return `${size} ${fill} ${color} ${SHAPE_NAMES[sides]}`; },
};

export const RuleCatalog = { numbers: numbersView, words: wordsView, shapes: shapesView, list: [numbersView, wordsView, shapesView] };

export { digits };

/* Deductidle — pure session helpers. Safe to import from the client and from CI. */

export const SHARE_URL = 'https://rule.dennis-bierreth.workers.dev';
export const PHASES = ['explore', 'prove', 'result'];

export function normalizePhase(phase) {
  if (phase === 'play') return 'explore';
  if (phase === 'done') return 'result';
  return PHASES.includes(phase) ? phase : 'explore';
}

export function starsFor({ result, strokes, par }) {
  if (result === 'gaveup') return 0;
  if (strokes <= par) return 3;
  if (strokes <= par + 2) return 2;
  return 1;
}

export function starsStillPossible(strokes, par) {
  return starsFor({ result: null, strokes, par });
}

export function starGlyphs(n) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

/* Three lines: who and how well, the shape of the attempt, the link.
   Sort: 🟩 for a test that came back In, ⬛ for Out, then ❌ per failed prove and ✅ on solve.
   Box:  🟦 per run, then the same prove marks. A give-up ends in 🏳️. */
export function shareText({ game = 'sort', mode, day, domainName, levelName, stars, result, log = [], proveFails = 0 }) {
  const id = mode === 'daily' ? `#${day + 1}` : 'practice';
  const what = game === 'box' ? 'Black box' : domainName || '';
  const hard = game === 'sort' && levelName && levelName !== 'Easy' ? ` · ${levelName}` : '';
  const head = `Deductidle ${id} · ${what}${hard} · ${starGlyphs(stars)}`;
  const tests = log.filter((e) => e.kind === 'test');
  const row = game === 'box' ? '🟦'.repeat(tests.length) : tests.map((e) => (e.in ? '🟩' : '⬛')).join('');
  const marks = '❌'.repeat(proveFails) + (result === 'solved' ? '✅' : result === 'gaveup' ? '🏳️' : '');
  return [head, `${row || '·'} ${marks}`.trim(), SHARE_URL].join('\n');
}

export function alreadyOnBoard(evidence = [], log = [], item) {
  const key = String(item);
  return evidence.some((e) => String(e.item ?? e.input) === key) || log.some((e) => String(e.item ?? e.input) === key);
}

export function proveReady(items = [], answers = {}) {
  return items.length > 0 && items.every((p) => {
    const v = answers[p.item] ?? answers[String(p.item)];
    return v === true || v === false;
  });
}

export function boxProveReady(items = [], answers = {}) {
  return items.length > 0 && items.every((p) => String(answers[String(p.input)] ?? '').trim() !== '');
}

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

export function needAnotherLook(wrongCount) {
  if (wrongCount === 1) return 'One needs another look.';
  const word = COUNT_WORDS[wrongCount] || String(wrongCount);
  return `${word} need another look.`;
}

export function evidenceLede(count) {
  const half = COUNT_WORDS[count / 2] || String(count / 2);
  return `${half} are in. ${half} are out. One rule decides.`;
}

export function inputHint(domain) {
  const id = domain && domain.id;
  if (id === 'words') return 'Try a word';
  if (id === 'letters') return 'Try a letter';
  if (id === 'shapes') return 'Choose a shape';
  if (id === 'emoji') return 'Choose an emoji';
  if (id === 'colors') return 'Choose a color';
  if (id === 'cards') return 'Choose a card';
  return 'Try a number';
}

export function parseMessage(domainId, message) {
  if (!message) return '';
  if (message === 'Already tested') return 'Already tested.';
  if (domainId === 'numbers' && /whole number/i.test(message)) return 'Use one whole number.';
  return message.endsWith('.') ? message : `${message}.`;
}

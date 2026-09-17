/* Rule — game loop. Vanilla JS module. Rules stay on the server. */
import { RuleCatalog as D } from './catalog.js';
import { dayIndex, domainFor } from './schedule.js';

const I = window.RuleIcons;
const $ = (id) => document.getElementById(id);
const SHARE_URL = 'https://rule.dennis-bierreth.workers.dev';
const STATE_PREFIX = 'rule.v2.day.';
const STATS_KEY = 'rule.v2.stats';

/* ---------- storage ---------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

/* ---------- round state ---------- */
let S = null;
const domain = () => D[S.domainId];
const tests = () => S.log.filter((e) => e.kind === 'test');
const onBoard = () => new Set([...(S.evidence || []).map((e) => e.item), ...S.log.map((e) => e.item)]);

function roundBody() {
  const body = { mode: S.mode, day: S.day };
  if (S.mode === 'practice') {
    body.domainId = S.domainId;
    body.ruleIdx = S.ruleIdx;
    body.seed = S.seed;
  }
  return body;
}

async function api(path, body, method) {
  const r = await fetch(path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = r.status;
    throw err;
  }
  return data;
}

function newRound(meta) {
  S = {
    mode: meta.mode, day: meta.day, domainId: meta.domainId, ruleIdx: meta.ruleIdx, seed: meta.seed,
    par: meta.par, evidence: meta.evidence,
    phase: 'play', strokes: 0, log: [], proveRound: 0, proveFails: 0, result: null, recorded: false, reveal: null,
  };
  return S;
}
const save = () => { if (S.mode === 'daily') store.set(STATE_PREFIX + S.day, S); };

/* ---------- helpers ---------- */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastTimer;
function toast(msg, iconName) {
  const t = $('toast');
  const bar = $('probeBar');
  /* The bar is in flow now, so anchor the toast to its top edge instead of a fixed offset. */
  t.style.bottom = bar.hidden ? '24px' : `${Math.round(window.innerHeight - bar.querySelector('.probe-inner').getBoundingClientRect().top + 10)}px`;
  t.innerHTML = (iconName ? I.icon(iconName) : '') + `<span>${msg}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
const tileHtml = (item) => `<div class="tile">${domain().render(item)}</div>`;
/* Stars out of three: inside the rule's target is three, within two more is two,
   solving it at all is one, giving up is none. During play it reads as "if you solved it now". */
function stars() {
  if (S.result === 'gaveup') return 0;
  const par = S.par;
  return S.strokes <= par ? 3 : S.strokes <= par + 2 ? 2 : 1;
}
const starRow = (n) => `<span class="stars">${[0, 1, 2].map((i) => I.icon('star', i < n ? 'star' : 'star dim')).join('')}</span>`;

/* ---------- rendering ---------- */
function showView() {
  $('viewPlay').hidden = S.phase !== 'play';
  $('viewProve').hidden = S.phase !== 'prove';
  $('viewDone').hidden = S.phase !== 'done';
  $('probeBar').hidden = S.phase !== 'play';
  document.body.classList.toggle('no-probe', S.phase !== 'play');
  $('meta').textContent = S.mode === 'daily' ? `#${S.day + 1} · ${domain().name}` : `Practice · ${domain().name}`;
}

function renderBoard(latestItem) {
  const gate = $('gate');
  gate.replaceChildren();
  const rows = [...S.evidence.map((e) => ({ ...e, kind: 'given' })), ...S.log];
  for (const r of rows) {
    const el = document.createElement('div');
    el.className = `grow ${r.in ? 'in' : 'out'} ${r.kind === 'given' ? 'given' : 'mine'}${latestItem !== undefined && r.item === latestItem ? ' latest' : ''}`;
    el.innerHTML = `${tileHtml(r.item)}<i class="tick"></i>`;
    gate.appendChild(el);
  }
  const n = tests().length;
  const got = stars();
  const par = S.par;
  const left = got === 3 ? par - S.strokes : par + 2 - S.strokes;
  const goal = got === 1 ? '1 star'
    : left === 0 ? `last one for ${got} stars`
    : `<b>${left}</b> left for ${got} stars`;
  $('strokes').innerHTML = `${starRow(got)}<span><b>${S.strokes}</b> ${S.strokes === 1 ? 'test' : 'tests'} · ${goal}</span>`;
  $('nodeSub').textContent = n === 0 ? (domain().input === 'text' ? `Try any ${domain().noun} below` : 'Build a shape below') : 'Try another one';
}

function renderInput() {
  const dom = domain();
  const text = dom.input === 'text';
  $('probeForm').hidden = !text;
  $('builder').hidden = text;
  if (text) {
    const inp = $('probeInput');
    inp.placeholder = dom.placeholder;
    inp.inputMode = dom.inputMode;
    inp.maxLength = dom.maxLength;
    inp.value = '';
  } else renderBuilder();
}

/* shape builder */
const sel = { sides: 3, color: 'red', fill: 'filled', size: 'big' };
const selKey = () => `${sel.sides}:${sel.color}:${sel.fill}:${sel.size}`;
function renderBuilder() {
  const dom = D.shapes;
  const mk = (row, options, get, set, content) => {
    row.replaceChildren();
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(get() === o));
      b.innerHTML = content(o);
      b.addEventListener('click', () => { set(o); renderBuilder(); });
      row.appendChild(b);
    }
  };
  mk($('pickSides'), dom.SIDES, () => sel.sides, (v) => { sel.sides = v; }, (s) => dom.svg(`${s}:${sel.color}:outline`, 22));
  mk($('pickColor'), dom.COLORS, () => sel.color, (v) => { sel.color = v; }, (c) => `<span class="sw" style="background:${dom.HEX[c]}"></span>`);
  mk($('pickFill'), dom.FILLS, () => sel.fill, (v) => { sel.fill = v; }, (f) => `<span class="fl">${f}</span>`);
  mk($('pickSize'), dom.SIZES, () => sel.size, (v) => { sel.size = v; }, (z) => `<span class="fl">${z}</span>`);
  $('builderPreview').innerHTML = dom.svg(selKey(), 40);
}

function renderPlay(latestItem) {
  showView();
  $('lead').innerHTML = domain().lead;
  renderInput();
  renderBoard(latestItem);
  resetGiveUp();
}

let answers = {};
let currentProve = [];
function renderProve() {
  showView();
  answers = {};
  $('proveNote').hidden = true;
  $('btnCheck').disabled = true;
  $('btnBack').disabled = false;
  const grid = $('proveGrid');
  grid.replaceChildren();
  for (const p of currentProve) {
    const card = document.createElement('div');
    card.className = 'pcard';
    card.dataset.item = String(p.item);
    card.innerHTML = `${tileHtml(p.item)}
      <div class="seg" role="group" aria-label="Is ${domain().label(p.item)} in or out?">
        <button type="button" class="in" aria-pressed="false">In</button>
        <button type="button" class="out" aria-pressed="false">Out</button>
      </div>
      <div class="truth"></div>`;
    const [bIn, bOut] = card.querySelectorAll('.seg button');
    const pick = (val) => {
      answers[p.item] = val;
      bIn.setAttribute('aria-pressed', String(val === true));
      bOut.setAttribute('aria-pressed', String(val === false));
      $('btnCheck').disabled = Object.keys(answers).length < currentProve.length;
    };
    bIn.addEventListener('click', () => pick(true));
    bOut.addEventListener('click', () => pick(false));
    grid.appendChild(card);
  }
}

function renderDone() {
  showView();
  const solved = S.result === 'solved';
  const got = stars();
  const big = $('doneScore');
  big.classList.remove('good', 'bad');
  big.innerHTML = starRow(got);
  big.classList.add(got >= 2 ? 'good' : 'bad');
  if (solved) {
    $('doneEyebrow').textContent = 'Solved';
    const t = `${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}`;
    $('doneSub').textContent = `${got === 3 ? 'Brilliant' : got === 2 ? 'Great' : 'Solved'} · ${t}`;
  } else {
    $('doneEyebrow').textContent = 'Revealed';
    $('doneSub').textContent = 'No stars today. Tomorrow is a new rule.';
  }
  const rev = S.reveal || {};
  $('doneRule').textContent = rev.rule || '';
  $('doneDetail').textContent = rev.detail || '';
  const { falseIn, falseOut } = rev.breakers || {};
  const n = (falseIn != null) + (falseOut != null);
  $('doneTrap').innerHTML = `Easy to mistake for <b>${rev.trapName || 'a simpler rule'}</b>. ${n > 1 ? 'These two prove otherwise.' : 'This one proves otherwise.'}`;
  const br = [];
  if (falseIn != null) br.push(`<span class="breaker out">${tileHtml(falseIn)}<small>out</small></span>`);
  if (falseOut != null) br.push(`<span class="breaker in">${tileHtml(falseOut)}<small>in</small></span>`);
  $('doneBreakers').innerHTML = br.join('');
  $('shareText').textContent = shareText();
  $('btnPractice').querySelector('span').textContent = S.mode === 'daily' ? 'Practice' : 'Practice again';
  tickCountdown();
}

function shareText() {
  const head = S.mode === 'daily' ? `Rule #${S.day + 1} · ${domain().name}` : `Rule practice · ${domain().name}`;
  const got = stars();
  const score = '★'.repeat(got) + '☆'.repeat(3 - got);
  const probes = tests().map((p) => (p.in ? '🟩' : '⬛')).join('') || '·';
  const prove = '❌'.repeat(S.proveFails) + (S.result === 'solved' ? '✅' : '');
  const lines = [`${head} ${score}`, `${probes} ${prove}`.trim()];
  if (SHARE_URL) lines.push(SHARE_URL);
  return lines.join('\n');
}

function tickCountdown() {
  if (S.phase !== 'done') return;
  if (S.mode !== 'daily') { $('nextIn').textContent = 'Practice rounds don\'t count toward your stats.'; return; }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const ms = midnight - now;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  const next = domainFor(S.day + 1);
  $('nextIn').textContent = `Next rule in ${h}h ${String(m).padStart(2, '0')}m · ${D[next].name}`;
}
setInterval(tickCountdown, 30000);

function renderStreak() {
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  const el = $('streakBadge');
  el.hidden = !(st.streak >= 2);
  el.innerHTML = el.hidden ? '' : `${I.icon('flame')}<span>${st.streak}</span>`;
}

function render(latestItem) {
  renderStreak();
  if (S.phase === 'play') renderPlay(latestItem);
  else if (S.phase === 'prove') renderProve();
  else renderDone();
}

/* ---------- actions ---------- */
async function probe(item) {
  if (onBoard().has(item)) { toast('Already tested'); return; }
  let res;
  try {
    res = await api('/api/test', { ...roundBody(), item, tested: S.log.map((e) => e.item) });
  } catch (err) {
    toast(err.message === 'Already tested' ? 'Already tested' : 'Could not test');
    return;
  }
  S.strokes += 1;
  S.log.push({ item: res.item, in: res.in, kind: 'test' });
  save();
  renderBoard(res.item);
  const node = $('node');
  node.classList.remove('hit-in', 'hit-out');
  void node.offsetWidth;
  node.classList.add(res.in ? 'hit-in' : 'hit-out');
  setTimeout(() => node.classList.remove('hit-in', 'hit-out'), 700);
  const v = $('verdict');
  v.className = `verdict ${res.in ? 'in' : 'out'}`;
  v.innerHTML = `${domain().id === 'shapes' ? domain().render(res.item) : `<span>${domain().label(res.item)}</span>`}<span>is ${res.in ? 'IN' : 'OUT'}</span>`;
  void v.offsetWidth;
  v.classList.add('show');
  /* Bring the bar, and so the newest row just above it, into view. The bar is sticky, so once it is
     pinned scrollIntoView on it is a no-op; scrolling to the page end is the same target that works. */
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
}

async function checkProve() {
  $('btnCheck').disabled = true;
  $('btnBack').disabled = true;
  let res;
  try {
    res = await api('/api/check', {
      ...roundBody(),
      tested: S.log.map((e) => e.item),
      proveRound: S.proveRound,
      answers: currentProve.map((p) => ({ item: p.item, guess: answers[p.item] })),
    });
  } catch (err) {
    toast(err.message || 'Could not check');
    $('btnCheck').disabled = false;
    $('btnBack').disabled = false;
    return;
  }
  let right = 0;
  for (const card of $('proveGrid').children) {
    const row = res.results.find((x) => String(x.item) === card.dataset.item);
    const ok = row && row.ok;
    right += ok ? 1 : 0;
    card.classList.add(ok ? 'right' : 'wrong');
    card.querySelector('.truth').innerHTML = ok ? I.icon('check') : `${I.icon('xmark')}<span>was ${row.in ? 'in' : 'out'}</span>`;
    card.querySelectorAll('.seg button').forEach((b) => { b.disabled = true; });
  }
  if (res.allRight) {
    S.result = 'solved';
    S.phase = 'done';
    S.reveal = res.reveal;
    record(); save();
    setTimeout(() => render(), reduceMotion ? 0 : 900);
  } else {
    S.proveFails += 1;
    S.proveRound += 1;
    S.strokes += 2;
    S.log.push(...res.results.map((p) => ({ item: p.item, in: p.in, kind: 'prove' })));
    S.phase = 'play';
    save();
    const note = $('proveNote');
    note.textContent = `${right} of 6. These six join the board. +2 tests.`;
    note.hidden = false;
    setTimeout(() => render(), reduceMotion ? 800 : 1800);
  }
}

let giveUpArmed = false;
let giveUpTimer = null;
let giveUpBusy = false;
function resetGiveUp() {
  giveUpArmed = false;
  giveUpBusy = false;
  clearTimeout(giveUpTimer);
  const btn = $('btnGiveUp');
  btn.disabled = false;
  btn.querySelector('span').textContent = 'Give up';
}
async function giveUp() {
  if (giveUpBusy) return;
  const btn = $('btnGiveUp');
  const span = btn.querySelector('span');
  if (!giveUpArmed) {
    span.textContent = 'Really? Show me';
    giveUpArmed = true;
    clearTimeout(giveUpTimer);
    giveUpTimer = setTimeout(resetGiveUp, 8000);
    return;
  }
  clearTimeout(giveUpTimer);
  giveUpBusy = true;
  btn.disabled = true;
  try {
    S.reveal = await api('/api/reveal', roundBody());
  } catch {
    giveUpBusy = false;
    btn.disabled = false;
    toast('Could not reveal');
    return;
  }
  giveUpArmed = false;
  giveUpBusy = false;
  S.result = 'gaveup';
  S.phase = 'done';
  record(); save(); render();
}

/* ---------- stats ---------- */
const emptyStats = { played: 0, solved: 0, streak: 0, best: 0, lastDay: null, stars: 0, tests: 0, testsOut: 0, domains: {} };
function record() {
  if (S.mode !== 'daily' || S.recorded) return;
  S.recorded = true;
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  st.domains = { ...(st.domains || {}) };
  const dd = st.domains[S.domainId] || { played: 0, solved: 0 };
  dd.played += 1;
  st.played += 1;
  const t = tests();
  st.tests += t.length;
  st.testsOut += t.filter((p) => !p.in).length;
  st.stars += stars();
  if (S.result === 'solved') {
    st.solved += 1; dd.solved += 1;
    st.streak = st.lastDay === S.day - 1 ? st.streak + 1 : 1;
    st.best = Math.max(st.best, st.streak);
  } else st.streak = 0;
  st.lastDay = S.day;
  st.domains[S.domainId] = dd;
  store.set(STATS_KEY, st);
}
function renderStats() {
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  const pct = st.played ? Math.round((100 * st.solved) / st.played) : 0;
  const fals = st.tests ? Math.round((100 * st.testsOut) / st.tests) : 0;
  const tiles = [[st.played, 'Played'], [`${pct}%`, 'Solved'], [st.streak, 'Streak'], [st.best, 'Best streak'],
    [`${I.icon('star', 'star')}${st.stars}`, 'Stars'], [st.tests ? `${fals}%` : '–', 'Out tests']];
  $('statTiles').innerHTML = tiles.map(([v, l]) => `<div class="tile-stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
  $('statDomains').innerHTML = D.list.map((d) => { const x = (st.domains || {})[d.id] || { played: 0, solved: 0 }; return `<div><span>${d.name}</span><b>${x.solved} / ${x.played}</b></div>`; }).join('');
  $('statNote').innerHTML = st.tests
    ? `<b>Out tests</b> is the share of your tests that came back <b>out</b>. Testing things you expect to fail is how you find the real rule. Aim for more than half.`
    : `Finish today's rule and your stats show up here.`;
}

/* ---------- wiring ---------- */
$('probeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('probeInput');
  const raw = inp.value;
  if (!raw.trim()) return;
  const p = domain().parse(raw);
  if (p.error) { toast(p.error); return; }
  probe(p.item);
  inp.value = '';
  inp.focus();
});
$('btnBuildTest').addEventListener('click', () => probe(selKey()));
$('btnProve').addEventListener('click', async () => {
  try {
    const res = await api('/api/prove', { ...roundBody(), tested: S.log.map((e) => e.item), proveRound: S.proveRound });
    currentProve = res.items;
    S.phase = 'prove';
    save();
    render();
    window.scrollTo(0, 0);
  } catch {
    toast('Could not load the prove set');
  }
});
$('btnBack').addEventListener('click', () => { S.phase = 'play'; save(); render(); });
$('btnCheck').addEventListener('click', checkProve);
$('btnGiveUp').addEventListener('click', giveUp);
$('btnCopy').addEventListener('click', async () => {
  const text = shareText();
  try { await navigator.clipboard.writeText(text); toast('Copied', 'check'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied', 'check'); } catch { toast('Copy failed', 'xmark'); }
    ta.remove();
  }
});
$('btnPractice').addEventListener('click', async () => {
  try {
    const meta = await api('/api/round', { mode: 'practice', day: S.day });
    newRound(meta);
    render();
    window.scrollTo(0, 0);
    if (domain().input === 'text') $('probeInput').focus();
  } catch {
    toast('Could not start practice');
  }
});
$('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
$('btnHelpClose').addEventListener('click', () => { $('dlgHelp').close(); if (domain().input === 'text') $('probeInput').focus(); });
$('btnStats').addEventListener('click', () => { renderStats(); $('dlgStats').showModal(); });
$('btnStatsClose').addEventListener('click', () => $('dlgStats').close());

/* ---------- boot ---------- */
I.mount();
(async () => {
  const day = Math.max(0, dayIndex());
  try {
    const meta = await api(`/api/round?day=${day}&mode=daily`);
    const saved = store.get(STATE_PREFIX + day, null);
    if (saved && saved.seed === meta.seed && saved.domainId === meta.domainId && Array.isArray(saved.evidence)) {
      S = saved;
      if (S.phase === 'prove') S.phase = 'play';
      S.par = meta.par;
      S.evidence = meta.evidence;
    } else {
      newRound(meta);
      save();
    }
    render();
    if (!store.get('rule.seen', false)) { store.set('rule.seen', true); $('dlgHelp').showModal(); }
  } catch {
    $('lead').textContent = 'Could not load today\'s rule. Refresh to try again.';
  }
})();

/* Deductidle — game loop. Vanilla JS module. Rules stay on the server. */
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
  const intro = S.phase === 'play' && !store.get('rule.seen', false);
  $('probeBar').hidden = S.phase !== 'play' || intro;
  $('btnStart').hidden = !intro;
  document.body.classList.toggle('no-probe', S.phase !== 'play' || intro);
  $('headline').hidden = S.phase !== 'play';
  $('headline').textContent = 'What\'s the rule?';
  $('stepsRail').hidden = S.phase === 'done';
  $('kinds').hidden = S.phase === 'done';
  $('meta').textContent = S.mode === 'daily' ? `Puzzle #${S.day + 1} · ${domain().name}` : `Practice · ${domain().name}`;
  renderKinds();
  const step = intro ? 'look' : S.phase === 'prove' ? 'prove' : 'test';
  for (const li of $('stepsRail').children) {
    const name = li.dataset.step;
    li.classList.toggle('on', name === step);
    li.classList.toggle('done', (step === 'test' && name === 'look') || (step === 'prove' && name !== 'prove'));
  }
}

function rotOf(item) {
  const s = String(item);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 11) - 5;
}

function chipHtml(item, extra = '') {
  return `<div class="chip ${extra}" style="--rot:${rotOf(item)}deg">${domain().render(item)}</div>`;
}

function renderKinds() {
  const row = $('kinds');
  if (!row) return;
  const pills = [{ id: 'today', name: 'Today' }, ...D.list];
  row.replaceChildren();
  for (const p of pills) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = p.id;
    b.textContent = p.name;
    const on = p.id === 'today' ? S.mode === 'daily' : (S.mode === 'practice' && S.domainId === p.id);
    b.classList.toggle('on', on);
    row.appendChild(b);
  }
}

function renderBoard(latestItem) {
  const inn = $('bowlIn');
  const out = $('bowlOut');
  inn.replaceChildren();
  out.replaceChildren();
  const rows = [...S.evidence.map((e) => ({ ...e, kind: 'given' })), ...S.log];
  const firstPaint = latestItem === undefined && S.log.length === 0;
  let n = 0;
  for (const r of rows) {
    const extra = [r.kind === 'given' ? 'given' : 'mine', latestItem !== undefined && r.item === latestItem ? 'latest' : ''].filter(Boolean).join(' ');
    const wrap = document.createElement('div');
    wrap.innerHTML = chipHtml(r.item, extra);
    const el = wrap.firstElementChild;
    if (firstPaint) {
      el.classList.add('drop');
      el.style.animationDelay = `${n * 40}ms`;
    } else if (latestItem !== undefined && r.item === latestItem) {
      el.classList.add('drop');
    }
    (r.in ? inn : out).appendChild(el);
    n += 1;
  }
  const got = stars();
  const par = S.par;
  const left = got === 3 ? par - S.strokes : par + 2 - S.strokes;
  const goal = got === 1 ? '1 star'
    : left === 0 ? `last one for ${got} stars`
    : `<b>${left}</b> left for ${got} stars`;
  $('strokes').innerHTML = `${starRow(got)}<span><b>${S.strokes}</b> ${S.strokes === 1 ? 'test' : 'tests'} · ${goal}</span>`;
}

function renderInput() {
  const dom = domain();
  const text = dom.input === 'text';
  const builder = dom.input === 'builder';
  const pick = dom.input === 'pick' || dom.input === 'pair';
  $('probeForm').hidden = !text;
  $('builder').hidden = !builder;
  $('picker').hidden = !pick;
  if (text) {
    const inp = $('probeInput');
    inp.placeholder = dom.placeholder;
    inp.inputMode = dom.inputMode;
    inp.maxLength = dom.maxLength;
    inp.value = '';
  } else if (builder) renderBuilder();
  else renderPicker();
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

const cardSel = { rank: 1, suit: 'S' };
function renderPicker() {
  const dom = domain();
  const root = $('picker');
  root.replaceChildren();
  if (dom.input === 'pair') {
    root.className = 'picker pair';
    const prev = document.createElement('div');
    prev.className = 'pair-preview';
    prev.innerHTML = dom.render(dom.key(cardSel.rank, cardSel.suit));
    const rows = document.createElement('div');
    rows.className = 'pair-rows';
    const rankRow = document.createElement('div');
    rankRow.className = 'seg-row';
    for (const r of dom.RANKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cardSel.rank === r));
      b.textContent = dom.RANK_MARK[r] || String(r);
      b.addEventListener('click', () => { cardSel.rank = r; renderPicker(); });
      rankRow.appendChild(b);
    }
    const suitRow = document.createElement('div');
    suitRow.className = 'seg-row';
    for (const s of dom.SUITS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cardSel.suit === s));
      b.innerHTML = `<span class="t-card ${s === 'H' || s === 'D' ? 'red' : 'blk'}">${dom.SUIT_MARK[s]}</span>`;
      b.addEventListener('click', () => { cardSel.suit = s; renderPicker(); });
      suitRow.appendChild(b);
    }
    rows.append(rankRow, suitRow);
    const go = document.createElement('button');
    go.className = 'btn pair-go';
    go.type = 'button';
    go.innerHTML = I.icon('flask');
    go.setAttribute('aria-label', 'Test');
    go.addEventListener('click', () => probe(dom.key(cardSel.rank, cardSel.suit)));
    root.append(prev, rows, go);
    return;
  }
  root.className = 'picker';
  for (const item of dom.choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = dom.render(item);
    b.setAttribute('aria-label', `Test ${dom.label(item)}`);
    b.addEventListener('click', () => probe(item));
    root.appendChild(b);
  }
}

function renderPlay(latestItem) {
  showView();
  renderInput();
  renderBoard(latestItem);
  if (!giveUpArmed && !giveUpBusy) {
    $('btnGiveUp').disabled = false;
    $('btnGiveUp').querySelector('span').textContent = 'Give up';
  }
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

function burst() {
  const host = $('scoreCard');
  host.querySelectorAll('.burst').forEach((el) => el.remove());
  if (reduceMotion) return;
  const bits = document.createElement('div');
  bits.className = 'burst';
  bits.innerHTML = Array.from({ length: 14 }, (_, i) => {
    const ang = (i / 14) * Math.PI * 2;
    const dist = 52 + (i % 3) * 16;
    return `<i style="--i:${i};--x:${Math.cos(ang) * dist}px;--y:${Math.sin(ang) * dist}px"></i>`;
  }).join('');
  host.appendChild(bits);
}

function renderDone() {
  showView();
  const solved = S.result === 'solved';
  const got = stars();
  const big = $('doneScore');
  big.classList.remove('good', 'bad');
  big.innerHTML = starRow(got);
  big.classList.add(got >= 2 ? 'good' : 'bad');
  $('scoreCard').classList.toggle('win', solved);
  if (solved) burst();
  else $('scoreCard').querySelectorAll('.burst').forEach((el) => el.remove());
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
  $('shareText').textContent = shareText();
  $('btnPractice').querySelector('span').textContent = S.mode === 'daily' ? 'Practice' : 'Practice again';
  tickCountdown();
}

function shareText() {
  const head = S.mode === 'daily' ? `Deductidle #${S.day + 1} · ${domain().name}` : `Deductidle practice · ${domain().name}`;
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
  const wrap = $(res.in ? 'bowlInWrap' : 'bowlOutWrap');
  wrap.classList.remove('pop');
  void wrap.offsetWidth;
  wrap.classList.add('pop');
  setTimeout(() => wrap.classList.remove('pop'), 700);
  const v = $('verdict');
  v.className = `verdict ${res.in ? 'in' : 'out'}`;
  v.innerHTML = `${['shapes', 'emoji', 'colors', 'cards'].includes(domain().id) ? domain().render(res.item) : `<span>${domain().label(res.item)}</span>`}<span>is ${res.in ? 'IN' : 'OUT'}</span>`;
  void v.offsetWidth;
  v.classList.add('show');
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
  $('statNote').hidden = true;
  $('statNote').textContent = '';
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
    const meta = await api('/api/round', { mode: 'practice', day: S.day, domainId: S.domainId });
    newRound(meta);
    render();
    window.scrollTo(0, 0);
    if (domain().input === 'text') $('probeInput').focus();
  } catch {
    toast('Could not start practice');
  }
});
$('kinds').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !S) return;
  const id = btn.dataset.id;
  try {
    if (id === 'today') {
      const day = Math.max(0, dayIndex());
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
    } else {
      const meta = await api('/api/round', { mode: 'practice', day: Math.max(0, dayIndex()), domainId: id });
      newRound(meta);
    }
    resetGiveUp();
    render();
    window.scrollTo(0, 0);
  } catch {
    toast('Could not start');
  }
});
$('btnStart').addEventListener('click', () => {
  store.set('rule.seen', true);
  showView();
  if (domain().input === 'text') $('probeInput').focus();
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
    if (!store.get('rule.seen', false)) showView();
  } catch {
    $('headline').textContent = 'Could not load today\'s puzzle. Refresh to try again.';
  }
})();

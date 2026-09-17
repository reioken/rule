/* Deductidle — game loop. Vanilla JS module. Rules stay on the server. */
import { RuleCatalog as D } from './catalog.js';
import { dayIndex, domainFor } from './schedule.js';
import {
  normalizePhase, starsFor, starsStillPossible, starGlyphs, shareText,
  alreadyOnBoard, proveReady, needAnotherLook, inputHint, parseMessage,
} from './logic.js';

const I = window.RuleIcons;
const $ = (id) => document.getElementById(id);
const STATE_PREFIX = 'deductidle.v1.day.';
const STATS_KEY = 'rule.v2.stats';
const THEME_KEY = 'deductidle.theme';

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

let S = null;
const domain = () => D[S.domainId];
const tests = () => S.log.filter((e) => e.kind === 'test');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    phase: 'explore', strokes: 0, log: [], proveRound: 0, proveFails: 0,
    proveItems: [], proveAnswers: {},
    result: null, recorded: false, reveal: null,
  };
  return S;
}
const save = () => { if (S.mode === 'daily') store.set(STATE_PREFIX + S.day, S); };

function hydrate(saved, meta) {
  S = saved;
  S.phase = normalizePhase(S.phase);
  S.par = meta.par;
  S.evidence = meta.evidence;
  S.proveItems = Array.isArray(S.proveItems) ? S.proveItems : [];
  S.proveAnswers = S.proveAnswers && typeof S.proveAnswers === 'object' ? S.proveAnswers : {};
  if (S.phase === 'prove' && S.proveItems.length !== 6) S.phase = 'explore';
}

/* ---------- theme ---------- */
function currentTheme() {
  return document.documentElement.getAttribute('data-theme')
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('btnTheme');
  btn.dataset.icon = theme === 'dark' ? 'sun' : 'moon';
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  btn.querySelector('svg')?.remove();
  I.mount(btn.parentElement);
  const meta = document.querySelector('meta[name="theme-color"][media*="light"]');
  const metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (theme === 'dark') {
    if (metaDark) metaDark.content = '#121615';
  } else if (meta) meta.content = '#f1eee6';
}
function initTheme() {
  const saved = store.get(THEME_KEY, null);
  applyTheme(saved === 'dark' || saved === 'light' ? saved : currentTheme());
}

/* ---------- tokens ---------- */
function tokenNode(item, { compact = false, membership = null, selected = false, latest = false } = {}) {
  const el = document.createElement('div');
  el.className = 'token';
  if (compact) el.classList.add('compact');
  if (selected) el.classList.add('selected');
  if (latest) el.classList.add('latest');
  if (membership === true || membership === 'in') el.classList.add('is-in');
  if (membership === false || membership === 'out') el.classList.add('is-out');
  const dom = domain();
  const label = dom.label(item);
  const mem = el.classList.contains('is-in') ? 'IN' : el.classList.contains('is-out') ? 'OUT' : '';
  el.setAttribute('aria-label', mem ? `${label}, ${mem}` : label);
  const face = document.createElement('span');
  face.className = 'token-face';
  let html = dom.render(item);
  if (dom.id === 'words' && String(item).length > 8) html = html.replace('t-word', 't-word long');
  face.innerHTML = html;
  el.appendChild(face);
  if (mem) {
    const tag = document.createElement('span');
    tag.className = 'token-tag';
    tag.textContent = mem;
    el.appendChild(tag);
  }
  return el;
}

function say(el, text, kind = '') {
  el.className = `feedback ${kind}`.trim();
  el.textContent = text || '';
}

function starsNow() {
  return starsFor({ result: S.result, strokes: S.strokes, par: S.par });
}

/* ---------- render ---------- */
function renderPhaseHead() {
  const daily = S.mode === 'daily';
  $('meta').textContent = daily
    ? `Daily ${S.day + 1} · ${domain().name}`
    : `Practice · ${domain().name}`;
  if (S.phase === 'explore') {
    $('eyebrow').textContent = 'Explore · 1 of 2';
    $('headline').textContent = 'What’s the rule?';
    $('lede').textContent = 'Four are in. Four are out. Test an item when you have a theory.';
  } else if (S.phase === 'prove') {
    $('eyebrow').textContent = 'Prove · 2 of 2';
    $('headline').textContent = 'Sort all six.';
    $('lede').textContent = 'Every item must be right.';
  } else {
    $('eyebrow').textContent = daily ? `Daily ${S.day + 1}` : 'Practice';
    $('headline').textContent = S.result === 'solved' ? 'You found the rule.' : 'The rule';
    $('lede').textContent = '';
  }
  $('phaseHead').hidden = false;
}

function renderStatus() {
  const possible = S.phase === 'result' ? starsNow() : starsStillPossible(S.strokes, S.par);
  $('testCount').textContent = `Tests ${S.strokes}`;
  $('starStatus').innerHTML = `<span class="vh">${possible} star${possible === 1 ? '' : 's'} still possible</span><span aria-hidden="true">${starGlyphs(possible)} still possible</span>`;
  $('statusRow').hidden = S.phase === 'result';
}

function renderBoard(latestItem) {
  const seedIn = $('seedIn'), seedOut = $('seedOut');
  const testIn = $('testedIn'), testOut = $('testedOut');
  seedIn.replaceChildren(); seedOut.replaceChildren();
  testIn.replaceChildren(); testOut.replaceChildren();
  for (const row of S.evidence) {
    (row.in ? seedIn : seedOut).appendChild(tokenNode(row.item));
  }
  for (const row of S.log) {
    const el = tokenNode(row.item, {
      compact: true,
      membership: row.in ? 'in' : 'out',
      latest: latestItem !== undefined && String(row.item) === String(latestItem),
    });
    if (latestItem !== undefined && String(row.item) === String(latestItem)) el.classList.add('enter');
    (row.in ? testIn : testOut).appendChild(el);
  }
}

const sel = { sides: 3, color: 'red', fill: 'filled', size: 'big' };
const cardSel = { rank: 1, suit: 'S' };
let trayPick = null;

function selKey() { return `${sel.sides}:${sel.color}:${sel.fill}:${sel.size}`; }
function cardKey() { return D.cards.key(cardSel.rank, cardSel.suit); }

function setTestEnabled(on) {
  $('btnTextTest').disabled = !on;
  $('btnTrayTest').disabled = !on;
}

function currentTrayItem() {
  const dom = domain();
  if (dom.input === 'pick') return trayPick;
  if (dom.input === 'builder') return selKey();
  if (dom.input === 'pair') return cardKey();
  return null;
}

function renderTray() {
  const dom = domain();
  const tray = $('tray');
  tray.hidden = false;
  tray.replaceChildren();
  $('btnTrayTest').hidden = false;
  $('probeForm').hidden = true;

  if (dom.input === 'pick') {
    tray.className = `tray${dom.id === 'colors' ? ' swatches' : ''}`;
    for (const item of dom.choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'token hoverable';
      if (trayPick !== null && String(trayPick) === String(item)) b.classList.add('selected');
      b.innerHTML = `<span class="token-face">${dom.render(item)}</span>`;
      b.setAttribute('aria-label', `Select ${dom.label(item)}`);
      b.setAttribute('aria-pressed', String(trayPick !== null && String(trayPick) === String(item)));
      b.addEventListener('click', () => { trayPick = item; renderTray(); say($('feedback'), ''); });
      tray.appendChild(b);
    }
    setTestEnabled(trayPick !== null);
    return;
  }

  if (dom.input === 'pair') {
    tray.className = 'tray pair';
    const preview = tokenNode(cardKey(), { selected: true });
    const ranks = document.createElement('div');
    ranks.className = 'seg';
    for (const r of D.cards.RANKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = D.cards.RANK_MARK[r] || String(r);
      b.setAttribute('aria-pressed', String(cardSel.rank === r));
      b.addEventListener('click', () => { cardSel.rank = r; renderTray(); });
      ranks.appendChild(b);
    }
    const suits = document.createElement('div');
    suits.className = 'seg';
    for (const s of D.cards.SUITS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="t-card ${s === 'H' || s === 'D' ? 'red' : 'blk'}">${D.cards.SUIT_MARK[s]}</span>`;
      b.setAttribute('aria-label', { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[s]);
      b.setAttribute('aria-pressed', String(cardSel.suit === s));
      b.addEventListener('click', () => { cardSel.suit = s; renderTray(); });
      suits.appendChild(b);
    }
    tray.append(preview, ranks, suits);
    setTestEnabled(true);
    return;
  }

  tray.className = 'tray pair';
  const box = document.createElement('div');
  box.className = 'builder';
  const mk = (options, get, set, content, label) => {
    const row = document.createElement('div');
    row.className = 'seg';
    row.setAttribute('aria-label', label);
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(get() === o));
      b.innerHTML = content(o);
      b.addEventListener('click', () => { set(o); renderTray(); });
      row.appendChild(b);
    }
    return row;
  };
  box.append(
    tokenNode(selKey(), { selected: true }),
    mk(D.shapes.SIDES, () => sel.sides, (v) => { sel.sides = v; }, (s) => D.shapes.svg(`${s}:${sel.color}:outline`, 22), 'Sides'),
    mk(D.shapes.COLORS, () => sel.color, (v) => { sel.color = v; }, (c) => `<span class="t-color" style="background:${D.shapes.HEX[c]}"></span>`, 'Color'),
    mk(D.shapes.FILLS, () => sel.fill, (v) => { sel.fill = v; }, (f) => f, 'Fill'),
    mk(D.shapes.SIZES, () => sel.size, (v) => { sel.size = v; }, (z) => z, 'Size'),
  );
  tray.appendChild(box);
  setTestEnabled(true);
}

function renderInput() {
  const dom = domain();
  const text = dom.input === 'text';
  $('probeForm').hidden = !text;
  $('tray').hidden = text;
  $('btnTrayTest').hidden = text;
  trayPick = text ? null : trayPick;
  if (text) {
    const hint = inputHint(dom);
    $('probeLabel').textContent = hint;
    $('probeInput').placeholder = hint;
    $('probeInput').setAttribute('aria-label', hint);
    $('probeInput').inputMode = dom.inputMode || 'text';
    $('probeInput').maxLength = dom.maxLength || 12;
    setTestEnabled(!!$('probeInput').value.trim());
  } else {
    if (dom.input === 'pick') trayPick = trayPick && dom.choices.some((c) => String(c) === String(trayPick)) ? trayPick : null;
    renderTray();
  }
}

function renderExplore(latestItem) {
  renderPhaseHead();
  $('exploreBoard').hidden = false;
  $('proveBoard').hidden = true;
  $('testPanel').hidden = false;
  $('proveActions').hidden = true;
  $('resultPanel').hidden = true;
  renderBoard(latestItem);
  renderInput();
  renderStatus();
  if (!giveUpArmed && !giveUpBusy) {
    $('btnGiveUp').disabled = false;
    $('btnGiveUp').textContent = 'Give up';
  }
}

function renderProve() {
  renderPhaseHead();
  $('exploreBoard').hidden = true;
  $('proveBoard').hidden = false;
  $('testPanel').hidden = true;
  $('proveActions').hidden = false;
  $('resultPanel').hidden = true;
  renderStatus();
  const grid = $('proveGrid');
  grid.replaceChildren();
  S.proveItems.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'prove-item';
    wrap.dataset.item = String(p.item);
    const name = `prove-${i}`;
    const chosen = S.proveAnswers[p.item] ?? S.proveAnswers[String(p.item)];
    wrap.appendChild(tokenNode(p.item));
    const group = document.createElement('div');
    group.className = 'choice';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', `Is ${domain().label(p.item)} in or out?`);
    for (const [val, cls, text] of [[true, 'in', 'IN'], [false, 'out', 'OUT']]) {
      const lab = document.createElement('label');
      lab.className = cls;
      lab.innerHTML = `<input type="radio" name="${name}" value="${cls}" ${chosen === val ? 'checked' : ''}><span>${text}</span>`;
      lab.querySelector('input').addEventListener('change', () => {
        S.proveAnswers[String(p.item)] = val;
        save();
        $('btnCheck').disabled = !proveReady(S.proveItems, S.proveAnswers);
        say($('proveFeedback'), '');
      });
      group.appendChild(lab);
    }
    wrap.appendChild(group);
    const truth = document.createElement('div');
    truth.className = 'truth';
    wrap.appendChild(truth);
    grid.appendChild(wrap);
  });
  $('btnCheck').disabled = !proveReady(S.proveItems, S.proveAnswers);
  $('btnBack').disabled = false;
}

function renderResult() {
  renderPhaseHead();
  $('exploreBoard').hidden = true;
  $('proveBoard').hidden = true;
  $('testPanel').hidden = true;
  $('proveActions').hidden = true;
  $('resultPanel').hidden = false;
  $('statusRow').hidden = true;
  const solved = S.result === 'solved';
  const got = starsNow();
  $('doneHeadline').textContent = solved ? 'You found the rule.' : 'The rule';
  $('doneScore').innerHTML = [0, 1, 2].map((i) => `<span class="star ${i < got ? 'on' : ''}" aria-hidden="true">${i < got ? '★' : '☆'}</span>`).join('');
  $('doneScore').setAttribute('aria-label', `${got} of 3 stars`);
  $('doneTests').textContent = `${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}`;
  const rev = S.reveal || {};
  $('doneRule').textContent = rev.rule || '';
  $('doneDetail').textContent = rev.detail || '';
  $('shareText').textContent = shareText({ mode: S.mode, day: S.day, strokes: S.strokes, stars: got, result: S.result });
  const selEl = $('practiceKind');
  if (!selEl.options.length) {
    for (const d of D.list) {
      const opt = document.createElement('option');
      opt.value = d.id; opt.textContent = d.name;
      selEl.appendChild(opt);
    }
  }
  selEl.value = S.domainId;
}

function render(latestItem) {
  if (S.phase === 'explore') renderExplore(latestItem);
  else if (S.phase === 'prove') renderProve();
  else renderResult();
}

/* ---------- actions ---------- */
async function probe(item) {
  if (alreadyOnBoard(S.evidence, S.log, item)) {
    say($('feedback'), 'Already tested.');
    return;
  }
  setTestEnabled(false);
  let res;
  try {
    res = await api('/api/test', { ...roundBody(), item, tested: S.log.map((e) => e.item) });
  } catch (err) {
    say($('feedback'), parseMessage(S.domainId, err.message === 'Already tested' ? 'Already tested' : err.message));
    setTestEnabled(true);
    return;
  }
  S.strokes += 1;
  S.log.push({ item: res.item, in: res.in, kind: 'test' });
  save();
  renderBoard(res.item);
  const panel = document.querySelector(`.group.${res.in ? 'in' : 'out'}`);
  panel.classList.remove('flash');
  void panel.offsetWidth;
  panel.classList.add('flash');
  setTimeout(() => panel.classList.remove('flash'), 180);
  const label = domain().label(res.item);
  say($('feedback'), `${label} is ${res.in ? 'IN' : 'OUT'}.`, res.in ? 'in' : 'out');
  if (domain().input === 'text') {
    $('probeInput').value = '';
    $('probeInput').focus();
    setTestEnabled(false);
  } else {
    trayPick = null;
    renderTray();
  }
  renderStatus();
}

async function checkProve() {
  if (!proveReady(S.proveItems, S.proveAnswers)) {
    say($('proveFeedback'), 'Mark all six first.');
    return;
  }
  $('btnCheck').disabled = true;
  $('btnBack').disabled = true;
  let res;
  try {
    res = await api('/api/check', {
      ...roundBody(),
      tested: S.log.map((e) => e.item),
      proveRound: S.proveRound,
      answers: S.proveItems.map((p) => ({ item: p.item, guess: S.proveAnswers[p.item] ?? S.proveAnswers[String(p.item)] })),
    });
  } catch (err) {
    say($('proveFeedback'), err.message || 'Could not check.');
    $('btnCheck').disabled = false;
    $('btnBack').disabled = false;
    return;
  }
  const cards = [...$('proveGrid').children];
  const delay = reduceMotion ? 0 : 45;
  let wrong = 0;
  const mark = (i) => {
    const card = cards[i];
    const row = res.results.find((x) => String(x.item) === card.dataset.item);
    const ok = row && row.ok;
    if (!ok) wrong += 1;
    card.classList.add(ok ? 'correct' : 'incorrect');
    card.querySelector('.truth').textContent = ok ? '' : `Was ${row.in ? 'IN' : 'OUT'}.`;
    card.querySelectorAll('input').forEach((b) => { b.disabled = true; });
  };
  for (let i = 0; i < cards.length; i++) {
    if (reduceMotion) mark(i);
    else await new Promise((r) => setTimeout(() => { mark(i); r(); }, delay));
  }
  if (res.allRight) {
    say($('proveFeedback'), 'All six are right.', 'in');
    S.result = 'solved';
    S.phase = 'result';
    S.reveal = res.reveal;
    record(); save();
    setTimeout(() => render(), reduceMotion ? 0 : 220);
  } else {
    S.proveFails += 1;
    S.proveRound += 1;
    S.strokes += 2;
    S.log.push(...res.results.map((p) => ({ item: p.item, in: p.in, kind: 'prove' })));
    S.proveItems = [];
    S.proveAnswers = {};
    S.phase = 'explore';
    save();
    say($('proveFeedback'), needAnotherLook(wrong));
    setTimeout(() => {
      render();
      say($('feedback'), needAnotherLook(wrong));
    }, reduceMotion ? 400 : 900);
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
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = 'Give up';
}
async function giveUp() {
  if (giveUpBusy) return;
  const btn = $('btnGiveUp');
  if (!giveUpArmed) {
    btn.textContent = 'Show the rule';
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
    say($('feedback'), 'Could not reveal.');
    return;
  }
  giveUpArmed = false;
  giveUpBusy = false;
  S.result = 'gaveup';
  S.phase = 'result';
  record(); save(); render();
}

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
  st.stars += starsNow();
  if (S.result === 'solved') {
    st.solved += 1; dd.solved += 1;
    st.streak = st.lastDay === S.day - 1 ? st.streak + 1 : 1;
    st.best = Math.max(st.best, st.streak);
  } else st.streak = 0;
  st.lastDay = S.day;
  st.domains[S.domainId] = dd;
  store.set(STATS_KEY, st);
}
function fillHelpStats() {
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  const box = $('helpStats');
  if (!st.played) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div>Played <b>${st.played}</b> · solved <b>${st.solved}</b></div><div>Stars <b>${st.stars}</b> · streak <b>${st.streak}</b></div>`;
}

/* ---------- wiring ---------- */
$('probeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('probeInput').value;
  if (!raw.trim()) return;
  const p = domain().parse(raw);
  if (p.error) { say($('feedback'), parseMessage(S.domainId, p.error)); return; }
  probe(p.item);
});
$('probeInput').addEventListener('input', () => {
  setTestEnabled(!!$('probeInput').value.trim());
  if ($('feedback').textContent) say($('feedback'), '');
});
$('btnTrayTest').addEventListener('click', () => {
  const item = currentTrayItem();
  if (item == null) return;
  probe(item);
});
$('btnProve').addEventListener('click', async () => {
  try {
    const res = await api('/api/prove', { ...roundBody(), tested: S.log.map((e) => e.item), proveRound: S.proveRound });
    S.proveItems = res.items;
    S.proveAnswers = {};
    S.phase = 'prove';
    save();
    render();
    window.scrollTo(0, 0);
  } catch {
    say($('feedback'), 'Could not load Prove.');
  }
});
$('btnBack').addEventListener('click', () => {
  S.phase = 'explore';
  save();
  render();
});
$('btnCheck').addEventListener('click', checkProve);
$('btnGiveUp').addEventListener('click', giveUp);
$('btnShare').addEventListener('click', async () => {
  const text = shareText({ mode: S.mode, day: S.day, strokes: S.strokes, stars: starsNow(), result: S.result });
  try {
    if (navigator.share) {
      await navigator.share({ text });
      say($('resultFeedback'), 'Result copied.');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    say($('resultFeedback'), 'Result copied.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); say($('resultFeedback'), 'Result copied.'); }
    catch { say($('resultFeedback'), 'Copy failed.'); }
    ta.remove();
  }
});
$('btnPractice').addEventListener('click', async () => {
  try {
    const domainId = $('practiceKind').value || S.domainId;
    const meta = await api('/api/round', { mode: 'practice', day: S.day, domainId });
    newRound(meta);
    render();
    window.scrollTo(0, 0);
    if (domain().input === 'text') $('probeInput').focus();
  } catch {
    say($('doneDetail'), 'Could not start practice.');
  }
});
$('btnHelp').addEventListener('click', () => { fillHelpStats(); $('dlgHelp').showModal(); });
$('btnTheme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  store.set(THEME_KEY, next);
  applyTheme(next);
});

I.mount();
initTheme();
(async () => {
  const day = Math.max(0, dayIndex());
  try {
    const meta = await api(`/api/round?day=${day}&mode=daily`);
    const saved = store.get(STATE_PREFIX + day, null);
    if (saved && saved.seed === meta.seed && saved.domainId === meta.domainId && Array.isArray(saved.evidence)) {
      hydrate(saved, meta);
    } else {
      newRound(meta);
      save();
    }
    render();
  } catch {
    $('headline').textContent = 'Could not load today’s puzzle.';
    $('lede').textContent = 'Refresh to try again.';
  }
})();

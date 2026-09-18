/* Deductidle — game loop. Vanilla JS module. Rules stay on the server. */
import { RuleCatalog as D } from './catalog.js';
import { dayIndex } from './schedule.js';
import {
  normalizePhase, starsFor, starsStillPossible, starGlyphs, shareText,
  alreadyOnBoard, proveReady, needAnotherLook, evidenceLede, inputHint, parseMessage,
} from './logic.js';

const I = window.RuleIcons;
const $ = (id) => document.getElementById(id);
const SORT_PREFIX = 'deductidle.v2.day.';
const STATS_KEY = 'rule.v2.stats';
const THEME_KEY = 'deductidle.theme';
const LEVEL_NAMES = { 1: 'Easy', 2: 'Hard', 3: 'Brutal' };

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const day = Math.max(0, dayIndex());

async function api(path, body, method) {
  const r = await fetch(path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error || 'Request failed'); err.status = r.status; throw err; }
  return data;
}
function say(el, text, kind = '') { el.className = `feedback ${kind}`.trim(); el.textContent = text || ''; }
function starsHtml(got) {
  return [0, 1, 2].map((i) => `<span class="star ${i < got ? 'on' : ''}" aria-hidden="true">${i < got ? '★' : '☆'}</span>`).join('');
}
async function copyText(text, el) {
  try { if (navigator.share) { await navigator.share({ text }); say(el, 'Shared.'); return; } }
  catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); say(el, 'Result copied.'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); say(el, 'Result copied.'); } catch { say(el, 'Copy failed.'); }
    ta.remove();
  }
}

/* ---------- theme ---------- */
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('btnTheme');
  btn.dataset.icon = theme === 'dark' ? 'sun' : 'moon';
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  btn.querySelector('svg')?.remove();
  I.mount(btn.parentElement);
}
function initTheme() {
  const saved = store.get(THEME_KEY, null);
  applyTheme(saved === 'dark' || saved === 'light' ? saved : 'dark');
}

/* ---------- celebration ---------- */
let celebratedKey = null;
function celebrate(stars) {
  const key = `${S.mode}-${S.day}-${S.seed}`;
  if (reduceMotion || celebratedKey === key) return;
  celebratedKey = key;
  const canvas = $('fx');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = [css.getPropertyValue('--in').trim(), css.getPropertyValue('--amber').trim(), css.getPropertyValue('--ink').trim(), css.getPropertyValue('--out').trim()];
  const W = window.innerWidth, H = window.innerHeight;
  const n = 26 + stars * 14;
  const parts = Array.from({ length: n }, () => ({
    x: W * (0.3 + Math.random() * 0.4), y: H * 0.28,
    vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 7,
    r: 3 + Math.random() * 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)], life: 1,
  }));
  const t0 = performance.now();
  function frame(t) {
    const dt = Math.min(32, t - (frame.last || t)) / 16; frame.last = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.28 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.life -= 0.012 * dt;
      if (p.life <= 0) continue;
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); ctx.restore();
    }
    if (t - t0 < 1800) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

/* ---------- round state ---------- */
let S = null;
const domain = () => D[S.domainId];
const tests = () => S.log.filter((e) => e.kind === 'test');
const starsNow = () => starsFor({ result: S.result, strokes: S.strokes, par: S.par });

function roundBody() {
  const body = { mode: S.mode, day: S.day };
  if (S.mode === 'practice') { body.domainId = S.domainId; body.ruleIdx = S.ruleIdx; body.seed = S.seed; body.level = S.level; }
  return body;
}
function newRound(meta) {
  S = {
    mode: meta.mode, day: meta.day, domainId: meta.domainId, ruleIdx: meta.ruleIdx, seed: meta.seed,
    level: meta.level, par: meta.par, evidence: meta.evidence,
    phase: 'explore', strokes: 0, log: [], proveRound: 0, proveFails: 0, proveItems: [], proveAnswers: {},
    result: null, recorded: false, reveal: null,
  };
  return S;
}
const save = () => { if (S.mode === 'daily') store.set(SORT_PREFIX + S.day, S); };
function hydrate(saved, meta) {
  S = saved;
  S.phase = normalizePhase(S.phase);
  S.par = meta.par; S.evidence = meta.evidence; S.level = meta.level;
  S.proveItems = Array.isArray(S.proveItems) ? S.proveItems : [];
  S.proveAnswers = S.proveAnswers && typeof S.proveAnswers === 'object' ? S.proveAnswers : {};
  if (S.phase === 'prove' && S.proveItems.length !== 6) S.phase = 'explore';
}

function tokenNode(item, { compact = false, selected = false } = {}) {
  const el = document.createElement('div');
  el.className = 'token' + (compact ? ' compact' : '') + (selected ? ' selected' : '');
  const dom = domain();
  el.setAttribute('aria-label', dom.label(item));
  const face = document.createElement('span');
  face.className = 'token-face';
  let html = dom.render(item);
  if (dom.id === 'words' && String(item).length > 8) html = html.replace('t-word', 't-word long');
  face.innerHTML = html;
  el.appendChild(face);
  return el;
}

function sortMeta() {
  const lvl = S.level ? ` <span class="lvl l${S.level}">${LEVEL_NAMES[S.level]}</span>` : '';
  return `<span>${S.mode === 'daily' ? `Daily ${S.day + 1}` : 'Practice'} · ${domain().name}</span>${lvl}`;
}
function renderPhaseHead() {
  $('meta').innerHTML = sortMeta();
  if (S.phase === 'explore') {
    $('headline').textContent = 'What’s the rule?';
    $('lede').textContent = `${evidenceLede(S.evidence.length)} ${S.level >= 2 ? 'Today it joins two conditions.' : 'Test anything when you have a theory.'}`;
  } else if (S.phase === 'prove') {
    $('headline').textContent = 'Sort all six.';
    $('lede').textContent = 'Every one has to be right.';
  }
  $('phaseHead').hidden = S.phase === 'result';
}
function renderStatus() {
  const possible = S.phase === 'result' ? starsNow() : starsStillPossible(S.strokes, S.par);
  $('testCount').innerHTML = `<span class="pill">Tests ${S.strokes}</span>`;
  $('starStatus').innerHTML = `<span class="vh">${possible} star${possible === 1 ? '' : 's'} still possible</span><span class="stars" aria-hidden="true">${'★'.repeat(possible)}<span class="dim">${'★'.repeat(3 - possible)}</span></span> <span aria-hidden="true">possible</span>`;
  $('statusRow').hidden = S.phase === 'result';
}
function renderBoard(latestItem) {
  const gate = $('gate');
  gate.replaceChildren();
  const rows = [...S.evidence.map((e) => ({ ...e, kind: 'given' })), ...S.log];
  for (const r of rows) {
    const el = document.createElement('div');
    const latest = latestItem !== undefined && String(r.item) === String(latestItem);
    el.className = `grow ${r.in ? 'in' : 'out'} ${r.kind === 'given' ? 'given' : 'mine'}${r.kind === 'prove' ? ' prove' : ''}${latest ? ' latest enter' : ''}`;
    el.appendChild(tokenNode(r.item, { compact: true }));
    const tick = document.createElement('i');
    tick.className = 'tick';
    el.appendChild(tick);
    gate.appendChild(el);
  }
}

const sel = { sides: 3, color: 'red', fill: 'filled', size: 'big' };
const cardSel = { rank: 1, suit: 'S' };
let trayPick = null;
const selKey = () => `${sel.sides}:${sel.color}:${sel.fill}:${sel.size}`;
const cardKey = () => D.cards.key(cardSel.rank, cardSel.suit);
function setTestEnabled(on) { $('btnTextTest').disabled = !on; $('btnTrayTest').disabled = !on; }
function currentTrayItem() {
  const dom = domain();
  if (dom.input === 'pick') return trayPick;
  if (dom.input === 'builder') return selKey();
  if (dom.input === 'pair') return cardKey();
  return null;
}
function segRow(cls, label, options, get, set, content) {
  const row = document.createElement('div');
  row.className = `seg ${cls}`.trim();
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
      const on = trayPick !== null && String(trayPick) === String(item);
      if (on) b.classList.add('selected');
      b.innerHTML = `<span class="token-face">${dom.render(item)}</span>`;
      b.setAttribute('aria-label', `Select ${dom.label(item)}`);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => { trayPick = item; renderTray(); say($('feedback'), ''); });
      tray.appendChild(b);
    }
    setTestEnabled(trayPick !== null);
    return;
  }
  if (dom.input === 'pair') {
    tray.className = 'tray pair';
    const names = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
    tray.append(
      tokenNode(cardKey(), { selected: true }),
      segRow('ranks', 'Rank', D.cards.RANKS, () => cardSel.rank, (v) => { cardSel.rank = v; }, (r) => D.cards.RANK_MARK[r] || String(r)),
      segRow('suits', 'Suit', D.cards.SUITS, () => cardSel.suit, (v) => { cardSel.suit = v; }, (s) => `<span class="t-card ${s === 'H' || s === 'D' ? 'red' : 'blk'}" aria-label="${names[s]}">${D.cards.SUIT_MARK[s]}</span>`),
    );
    setTestEnabled(true);
    return;
  }
  tray.className = 'tray pair';
  const box = document.createElement('div');
  box.className = 'builder';
  box.append(
    tokenNode(selKey(), { selected: true }),
    segRow('', 'Sides', D.shapes.SIDES, () => sel.sides, (v) => { sel.sides = v; }, (s) => D.shapes.svg(`${s}:${sel.color}:outline`, 22)),
    segRow('', 'Color', D.shapes.COLORS, () => sel.color, (v) => { sel.color = v; }, (c) => `<span class="t-color" style="background:${D.shapes.HEX[c]}"></span>`),
    segRow('', 'Fill', D.shapes.FILLS, () => sel.fill, (v) => { sel.fill = v; }, (f) => f),
    segRow('', 'Size', D.shapes.SIZES, () => sel.size, (v) => { sel.size = v; }, (z) => z),
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
  $('exploreBoard').hidden = false; $('proveBoard').hidden = true;
  $('testPanel').hidden = false; $('proveActions').hidden = true; $('resultPanel').hidden = true;
  renderBoard(latestItem);
  renderInput();
  renderStatus();
  if (!giveUp.armed && !giveUp.busy) { $('btnGiveUp').disabled = false; $('btnGiveUp').textContent = 'Give up'; }
}
function renderProve() {
  renderPhaseHead();
  $('exploreBoard').hidden = true; $('proveBoard').hidden = false;
  $('testPanel').hidden = true; $('proveActions').hidden = false; $('resultPanel').hidden = true;
  renderStatus();
  const grid = $('proveGrid');
  grid.replaceChildren();
  S.proveItems.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'prove-item';
    wrap.dataset.item = String(p.item);
    const chosen = S.proveAnswers[p.item] ?? S.proveAnswers[String(p.item)];
    wrap.appendChild(tokenNode(p.item));
    const group = document.createElement('div');
    group.className = 'choice';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', `Is ${domain().label(p.item)} in or out?`);
    for (const [val, cls, text] of [[true, 'in', 'IN'], [false, 'out', 'OUT']]) {
      const lab = document.createElement('label');
      lab.className = cls;
      lab.innerHTML = `<input type="radio" name="prove-${i}" value="${cls}" ${chosen === val ? 'checked' : ''}><span>${text}</span>`;
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
function sortShare() {
  return shareText({ game: 'sort', mode: S.mode, day: S.day, domainName: domain().name, levelName: LEVEL_NAMES[S.level], stars: starsNow(), result: S.result, log: S.log, proveFails: S.proveFails });
}
function renderResult() {
  renderPhaseHead();
  $('meta').innerHTML = sortMeta();
  $('exploreBoard').hidden = true; $('proveBoard').hidden = true;
  $('testPanel').hidden = true; $('proveActions').hidden = true; $('resultPanel').hidden = false;
  $('statusRow').hidden = true;
  const solved = S.result === 'solved';
  const got = starsNow();
  $('doneHeadline').textContent = solved ? 'You found the rule.' : 'The rule';
  $('doneScore').innerHTML = starsHtml(got);
  $('doneScore').setAttribute('aria-label', `${got} of 3 stars`);
  if (solved && got > 0) celebrate(got);
  $('doneTests').textContent = `${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}${S.level >= 2 ? ` · ${LEVEL_NAMES[S.level]} day` : ''}`;
  const rev = S.reveal || {};
  $('doneRule').textContent = rev.rule || '';
  $('doneDetail').textContent = rev.detail || '';
  const br = rev.breakers || {};
  const chips = [];
  if (br.falseIn != null) chips.push(`<span class="breaker out">${tokenNode(br.falseIn).outerHTML}<small>out</small></span>`);
  if (br.falseOut != null) chips.push(`<span class="breaker in">${tokenNode(br.falseOut).outerHTML}<small>in</small></span>`);
  $('doneTrap').innerHTML = rev.trapName ? `Looks like <b>${rev.trapName}</b> at first. ${chips.length > 1 ? 'These break it.' : 'This breaks it.'}` : '';
  $('doneBreakers').innerHTML = chips.join('');
  $('shareText').textContent = sortShare();
  const selEl = $('practiceKind');
  if (!selEl.options.length) for (const d of D.list) { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name; selEl.appendChild(o); }
  selEl.value = S.domainId;
  say($('resultFeedback'), '');
}
function renderSort(latestItem) {
  if (S.phase === 'explore') renderExplore(latestItem);
  else if (S.phase === 'prove') renderProve();
  else renderResult();
}

async function probe(item) {
  if (alreadyOnBoard(S.evidence, S.log, item)) { say($('feedback'), 'Already tested.'); return; }
  setTestEnabled(false);
  let res;
  try { res = await api('/api/test', { ...roundBody(), item, tested: S.log.map((e) => e.item) }); }
  catch (err) { say($('feedback'), parseMessage(S.domainId, err.message)); setTestEnabled(true); return; }
  S.strokes += 1;
  S.log.push({ item: res.item, in: res.in, kind: 'test' });
  save();
  renderBoard(res.item);
  const node = $('node');
  node.classList.remove('hit-in', 'hit-out'); void node.offsetWidth;
  node.classList.add(res.in ? 'hit-in' : 'hit-out');
  setTimeout(() => node.classList.remove('hit-in', 'hit-out'), 700);
  if (!reduceMotion) {
    const ring = document.createElement('span');
    ring.className = `ring${res.in ? '' : ' out'}`;
    node.appendChild(ring);
    setTimeout(() => ring.remove(), 900);
  }
  const aura = $('aura');
  aura.classList.remove('in', 'out'); void aura.offsetWidth;
  aura.classList.add(res.in ? 'in' : 'out');
  setTimeout(() => aura.classList.remove('in', 'out'), 1200);
  say($('feedback'), `${domain().label(res.item)} is ${res.in ? 'IN' : 'OUT'}.`, res.in ? 'in' : 'out');
  if (domain().input === 'text') { $('probeInput').value = ''; $('probeInput').focus(); setTestEnabled(false); }
  else { trayPick = null; renderTray(); }
  renderStatus();
  document.querySelector('.grow.latest')?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}
async function checkProve() {
  if (!proveReady(S.proveItems, S.proveAnswers)) { say($('proveFeedback'), 'Mark all six first.'); return; }
  $('btnCheck').disabled = true; $('btnBack').disabled = true;
  let res;
  try {
    res = await api('/api/check', { ...roundBody(), tested: S.log.map((e) => e.item), proveRound: S.proveRound,
      answers: S.proveItems.map((p) => ({ item: p.item, guess: S.proveAnswers[p.item] ?? S.proveAnswers[String(p.item)] })) });
  } catch (err) { say($('proveFeedback'), err.message || 'Could not check.'); $('btnCheck').disabled = false; $('btnBack').disabled = false; return; }
  const cards = [...$('proveGrid').children];
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
    if (reduceMotion) mark(i); else await new Promise((r) => setTimeout(() => { mark(i); r(); }, 45));
  }
  if (res.allRight) {
    say($('proveFeedback'), 'All six are right.', 'in');
    S.result = 'solved'; S.phase = 'result'; S.reveal = res.reveal;
    recordSort(); save();
    setTimeout(() => renderSort(), reduceMotion ? 0 : 220);
  } else {
    S.proveFails += 1; S.proveRound += 1; S.strokes += 2;
    S.log.push(...res.results.map((p) => ({ item: p.item, in: p.in, kind: 'prove' })));
    S.proveItems = []; S.proveAnswers = {}; S.phase = 'explore';
    save();
    say($('proveFeedback'), needAnotherLook(wrong));
    setTimeout(() => { renderSort(); say($('feedback'), `${needAnotherLook(wrong)} They join the board. +2 tests.`); }, reduceMotion ? 400 : 900);
  }
}
const giveUp = { armed: false, busy: false, timer: null };
function resetGiveUp() {
  giveUp.armed = false; giveUp.busy = false; clearTimeout(giveUp.timer);
  const btn = $('btnGiveUp'); if (btn) { btn.disabled = false; btn.textContent = 'Give up'; }
}
async function doGiveUp() {
  if (giveUp.busy) return;
  const btn = $('btnGiveUp');
  if (!giveUp.armed) { btn.textContent = 'Show the rule'; giveUp.armed = true; clearTimeout(giveUp.timer); giveUp.timer = setTimeout(resetGiveUp, 8000); return; }
  clearTimeout(giveUp.timer); giveUp.busy = true; btn.disabled = true;
  try { S.reveal = await api('/api/reveal', roundBody()); }
  catch { giveUp.busy = false; btn.disabled = false; say($('feedback'), 'Could not reveal.'); return; }
  giveUp.armed = false; giveUp.busy = false;
  S.result = 'gaveup'; S.phase = 'result';
  recordSort(); save(); renderSort();
}
const emptyStats = { played: 0, solved: 0, streak: 0, best: 0, lastDay: null, stars: 0, tests: 0, testsOut: 0, domains: {} };
function recordSort() {
  if (S.mode !== 'daily' || S.recorded) return;
  S.recorded = true;
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  st.domains = { ...(st.domains || {}) };
  const dd = st.domains[S.domainId] || { played: 0, solved: 0 };
  dd.played += 1; st.played += 1;
  const t = tests();
  st.tests += t.length; st.testsOut += t.filter((p) => !p.in).length;
  st.stars += starsNow();
  if (S.result === 'solved') { st.solved += 1; dd.solved += 1; st.streak = st.lastDay === S.day - 1 ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak); }
  else st.streak = 0;
  st.lastDay = S.day; st.domains[S.domainId] = dd;
  store.set(STATS_KEY, st);
}

/* ---------- help, boot ---------- */
function fillHelpStats() {
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  const box = $('helpStats');
  if (!st.played) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div>Played <b>${st.played}</b> · solved <b>${st.solved}</b></div><div>Stars <b>${st.stars}</b> · streak <b>${st.streak}</b></div>`;
}

/* ---------- wiring: sort ---------- */
$('probeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('probeInput').value;
  if (!raw.trim()) return;
  const p = domain().parse(raw);
  if (p.error) { say($('feedback'), parseMessage(S.domainId, p.error)); return; }
  probe(p.item);
});
$('probeInput').addEventListener('input', () => { setTestEnabled(!!$('probeInput').value.trim()); if ($('feedback').textContent) say($('feedback'), ''); });
$('btnTrayTest').addEventListener('click', () => { const item = currentTrayItem(); if (item != null) probe(item); });
$('btnProve').addEventListener('click', async () => {
  try {
    const res = await api('/api/prove', { ...roundBody(), tested: S.log.map((e) => e.item), proveRound: S.proveRound });
    S.proveItems = res.items; S.proveAnswers = {}; S.phase = 'prove';
    save(); renderSort(); window.scrollTo(0, 0);
  } catch { say($('feedback'), 'Could not load Prove.'); }
});
$('btnBack').addEventListener('click', () => { S.phase = 'explore'; save(); renderSort(); });
$('btnCheck').addEventListener('click', checkProve);
$('btnGiveUp').addEventListener('click', doGiveUp);
$('btnShare').addEventListener('click', () => copyText(sortShare(), $('resultFeedback')));
$('btnPractice').addEventListener('click', async () => {
  try {
    const domainId = $('practiceKind').value || S.domainId;
    const level = $('practiceLevel').value || undefined;
    const meta = await api('/api/round', { mode: 'practice', day: S.day, domainId, level });
    newRound(meta); renderSort(); window.scrollTo(0, 0);
    if (domain().input === 'text') $('probeInput').focus();
  } catch { say($('resultFeedback'), 'Could not start practice.'); }
});

/* ---------- help, theme ---------- */
$('btnHelp').addEventListener('click', () => { fillHelpStats(); $('dlgHelp').showModal(); });
$('btnTheme').addEventListener('click', () => { const next = currentTheme() === 'dark' ? 'light' : 'dark'; store.set(THEME_KEY, next); applyTheme(next); });

I.mount();
initTheme();
(async () => {
  try {
    const meta = await api(`/api/round?day=${day}&mode=daily`);
    const saved = store.get(SORT_PREFIX + day, null);
    if (saved && saved.seed === meta.seed && saved.domainId === meta.domainId && Array.isArray(saved.evidence)) hydrate(saved, meta);
    else { newRound(meta); save(); }
    renderSort();
  } catch {
    $('headline').textContent = 'Could not load today’s puzzle.';
    $('lede').textContent = 'Refresh to try again.';
  }
})();

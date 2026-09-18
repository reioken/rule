/* Deductidle — game loop. Vanilla JS module. Rules stay on the server. */
import { RuleCatalog as D } from './catalog.js';
import { dayIndex, domainFor, WEEK, LEVEL_FOR, LAUNCH_UTC } from './schedule.js';
import {
  normalizePhase, starsFor, starsStillPossible, starGlyphs, shareText, SHARE_URL,
  alreadyOnBoard, proveReady, needAnotherLook, evidenceLede, inputHint, parseMessage,
} from './logic.js';

const I = window.RuleIcons;
const $ = (id) => document.getElementById(id);
const SORT_PREFIX = 'deductidle.v2.day.';
const STATS_KEY = 'rule.v2.stats';
const THEME_KEY = 'deductidle.theme';
const SOUND_KEY = 'deductidle.sound';
const COACH_KEY = 'deductidle.coach';
const LEVEL_NAMES = { 1: 'Easy', 2: 'Hard', 3: 'Brutal' };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const today = Math.max(0, dayIndex());
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

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
const starsHtml = (got) => [0, 1, 2].map((i) => `<span class="star ${i < got ? 'on' : ''}" aria-hidden="true">${i < got ? '★' : '☆'}</span>`).join('');
const dateOf = (day) => new Date(LAUNCH_UTC + day * 86400000);
const fmtDate = (day) => dateOf(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
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
function setIcon(btn, name) { btn.dataset.icon = name; btn.querySelector('svg')?.remove(); I.mount(btn.parentElement); }
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('btnTheme');
  setIcon(btn, theme === 'dark' ? 'sun' : 'moon');
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0e1013' : '#f4f2ec';
}
function initTheme() {
  const saved = store.get(THEME_KEY, null);
  applyTheme(saved === 'dark' || saved === 'light' ? saved : 'dark');
}

/* ---------- sound: tiny synth, no files ---------- */
let soundOn = store.get(SOUND_KEY, false) === true;
let actx = null;
function tone(freq, { type = 'sine', dur = 0.12, gain = 0.08, at = 0, slide = 0 } = {}) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + at;
    const o = actx.createOscillator(); const g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no audio */ }
}
const sfx = {
  tick: () => tone(1200, { type: 'square', dur: 0.04, gain: 0.03 }),
  in: () => { tone(523, { dur: 0.12 }); tone(784, { dur: 0.18, at: 0.08 }); },
  out: () => tone(180, { type: 'triangle', dur: 0.22, gain: 0.1, slide: -80 }),
  solve: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.22, at: i * 0.09, gain: 0.07 })); },
  fail: () => { tone(220, { type: 'triangle', dur: 0.18, gain: 0.08 }); tone(165, { type: 'triangle', dur: 0.26, at: 0.14, gain: 0.08 }); },
};
function applySound() {
  const btn = $('btnSound');
  setIcon(btn, soundOn ? 'sound-on' : 'sound-off');
  btn.setAttribute('aria-pressed', String(soundOn));
  btn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
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
  const colors = ['--in', '--amber', '--ink', '--out'].map((v) => css.getPropertyValue(v).trim());
  const W = window.innerWidth, H = window.innerHeight;
  const parts = Array.from({ length: 26 + stars * 14 }, () => ({
    x: W * (0.3 + Math.random() * 0.4), y: H * 0.28, vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 7,
    r: 3 + Math.random() * 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * colors.length)], life: 1,
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
    level: meta.level, par: meta.par, evidence: meta.evidence, alive: meta.alive, joined: meta.joined || null,
    phase: 'explore', strokes: 0, log: [], proveRound: 0, proveFails: 0, proveItems: [], proveAnswers: {},
    result: null, recorded: false, reveal: null, stats: null, reported: false,
  };
  return S;
}
const save = () => { if (S.mode === 'daily') store.set(SORT_PREFIX + S.day, S); };
function hydrate(saved, meta) {
  S = saved;
  S.phase = normalizePhase(S.phase);
  S.par = meta.par; S.evidence = meta.evidence; S.level = meta.level; S.joined = meta.joined || null;
  if (S.alive === undefined) S.alive = meta.alive;
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
  const when = S.mode === 'daily' ? (S.day === today ? `Daily ${S.day + 1}` : `Archive · Daily ${S.day + 1}`) : 'Practice';
  return `<span>${when} · ${domain().name}</span>${lvl}`;
}
function renderPhaseHead() {
  $('meta').innerHTML = sortMeta();
  if (S.phase === 'explore') {
    $('headline').textContent = 'What’s the rule?';
    if (S.joined) {
      $('lede').innerHTML = `${evidenceLede(S.evidence.length)} Today it is <b>two simple rules</b> joined by <span class="joiner">${S.joined}</span>${S.evidence.length <= 4 ? ', and you get only four examples' : ''}.`;
    } else $('lede').textContent = `${evidenceLede(S.evidence.length)} Test anything when you have a theory.`;
  } else if (S.phase === 'prove') {
    $('headline').textContent = 'Sort all six.';
    $('lede').textContent = 'Every one has to be right.';
  }
  $('phaseHead').hidden = S.phase === 'result';
}
function renderStatus(bump = false) {
  const possible = S.phase === 'result' ? starsNow() : starsStillPossible(S.strokes, S.par);
  $('testCount').innerHTML = `<span class="pill">Tests ${S.strokes}</span>`;
  $('starStatus').innerHTML = `<span class="vh">${possible} star${possible === 1 ? '' : 's'} still possible</span><span class="stars" aria-hidden="true">${'★'.repeat(possible)}<span class="dim">${'★'.repeat(3 - possible)}</span></span> <span aria-hidden="true">possible</span>`;
  const n = Math.max(1, S.alive ?? 1);
  $('alive').innerHTML = `<b class="${bump ? 'bump' : ''}">${n}</b> ${n === 1 ? 'rule still fits' : 'rules still fit'}`;
  $('alive').hidden = S.phase !== 'explore';
  if (S.phase !== 'explore') $('aliveNote').hidden = true;
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
function scrollToLatest() {
  const el = document.querySelector('.grow.latest') || $('node');
  if (!el) return;
  if (isDesktop()) {
    const sc = $('gateScroll');
    sc.scrollTo({ left: sc.scrollWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  } else el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}

/* ---------- coach: first run, two nudges in place of the help dialog ---------- */
function renderCoach() {
  const step = store.get(COACH_KEY, 0);
  const box = $('coach');
  if (S.mode !== 'daily' || S.phase !== 'explore' || step >= 2) { box.hidden = true; return; }
  const n = tests().length;
  if (step === 0 && n === 0) {
    $('coachText').innerHTML = 'These already went through the gate. One secret rule decides who gets in. <b>Send anything through</b> to see which side it lands on.';
    box.hidden = false;
  } else if (n >= 1) {
    store.set(COACH_KEY, 1);
    $('coachText').innerHTML = 'The obvious rule is usually a trap. <b>Test something you expect to be out.</b> The counter above shows how many rules from our library still match the board. Get it low, then prove it.';
    box.hidden = false;
  } else box.hidden = true;
}

/* ---------- pickers ---------- */
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
    b.addEventListener('click', () => { set(o); sfx.tick(); renderTray(); });
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
      b.addEventListener('click', () => { trayPick = item; sfx.tick(); renderTray(); say($('feedback'), ''); });
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

/* ---------- views ---------- */
function renderExplore(latestItem) {
  renderPhaseHead();
  $('exploreBoard').hidden = false; $('proveBoard').hidden = true;
  $('testPanel').hidden = false; $('proveActions').hidden = true; $('resultPanel').hidden = true;
  renderBoard(latestItem);
  renderInput();
  renderStatus();
  renderCoach();
  if (!giveUp.armed && !giveUp.busy) { $('btnGiveUp').disabled = false; $('btnGiveUp').textContent = 'Give up'; }
  if (isDesktop()) requestAnimationFrame(() => { $('gateScroll').scrollLeft = $('gateScroll').scrollWidth; });
}
let proveFocus = 0;
function renderProve() {
  renderPhaseHead();
  $('exploreBoard').hidden = true; $('proveBoard').hidden = false;
  $('testPanel').hidden = true; $('proveActions').hidden = false; $('resultPanel').hidden = true;
  $('coach').hidden = true;
  renderStatus();
  const grid = $('proveGrid');
  grid.replaceChildren();
  S.proveItems.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'prove-item';
    wrap.dataset.item = String(p.item);
    wrap.tabIndex = -1;
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
      lab.querySelector('input').addEventListener('change', () => { setAnswer(p.item, val); });
      group.appendChild(lab);
    }
    wrap.appendChild(group);
    const truth = document.createElement('div');
    truth.className = 'truth';
    wrap.appendChild(truth);
    grid.appendChild(wrap);
  });
  proveFocus = 0;
  $('btnCheck').disabled = !proveReady(S.proveItems, S.proveAnswers);
  $('btnBack').disabled = false;
}
function setAnswer(item, val) {
  S.proveAnswers[String(item)] = val;
  save();
  sfx.tick();
  const card = [...$('proveGrid').children].find((c) => c.dataset.item === String(item));
  if (card) card.querySelector(`input[value="${val ? 'in' : 'out'}"]`).checked = true;
  $('btnCheck').disabled = !proveReady(S.proveItems, S.proveAnswers);
  say($('proveFeedback'), '');
}
function sortShare() {
  return shareText({ mode: S.mode, day: S.day, domainName: domain().name, levelName: LEVEL_NAMES[S.level], stars: starsNow(), result: S.result, log: S.log, proveFails: S.proveFails });
}
function crowdLine(st) {
  if (!st || !st.players) return '';
  const who = st.players === 1 ? 'One player so far' : `<b>${st.players}</b> players so far`;
  return `${who} · <b>${st.solvedPct}%</b> solved · <b>${st.threeStarPct}%</b> with three stars · <b>${st.avgTests}</b> tests on average`;
}
function renderResult() {
  renderPhaseHead();
  $('meta').innerHTML = sortMeta();
  $('exploreBoard').hidden = true; $('proveBoard').hidden = true;
  $('testPanel').hidden = true; $('proveActions').hidden = true; $('resultPanel').hidden = false;
  $('statusRow').hidden = true; $('coach').hidden = true; $('aliveNote').hidden = true;
  const solved = S.result === 'solved';
  const got = starsNow();
  $('doneHeadline').textContent = solved ? 'You found the rule.' : 'The rule';
  $('doneScore').innerHTML = starsHtml(got);
  $('doneScore').setAttribute('aria-label', `${got} of 3 stars`);
  if (solved && got > 0) celebrate(got);
  $('doneTests').textContent = `${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}${S.level >= 2 ? ` · ${LEVEL_NAMES[S.level]} day` : ''}`;
  const crowd = crowdLine(S.stats);
  $('doneCrowd').innerHTML = crowd;
  $('doneCrowd').hidden = !crowd;
  const rev = S.reveal || {};
  $('doneRule').textContent = rev.rule || '';
  $('doneDetail').textContent = rev.detail || '';
  const parts = $('doneParts');
  if (rev.parts && rev.parts.length === 2) {
    parts.hidden = false;
    parts.innerHTML = `<div class="part"><span class="eyebrow">Part one</span><h4>${rev.parts[0].rule}</h4><p>${rev.parts[0].detail}</p></div>
      <div class="joiner-chip">${rev.joined}</div>
      <div class="part"><span class="eyebrow">Part two</span><h4>${rev.parts[1].rule}</h4><p>${rev.parts[1].detail}</p></div>`;
  } else { parts.hidden = true; parts.innerHTML = ''; }
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

/* ---------- actions ---------- */
async function probe(item) {
  if (alreadyOnBoard(S.evidence, S.log, item)) { say($('feedback'), 'Already tested.'); return; }
  setTestEnabled(false);
  sfx.tick();
  let res;
  try { res = await api('/api/test', { ...roundBody(), item, tested: S.log.map((e) => e.item), log: S.log.map((e) => ({ item: e.item, in: e.in })) }); }
  catch (err) { say($('feedback'), parseMessage(S.domainId, err.message)); setTestEnabled(true); return; }
  S.strokes += 1;
  S.log.push({ item: res.item, in: res.in, kind: 'test' });
  const aliveBefore = S.alive;
  if (typeof res.alive === 'number') S.alive = res.alive;
  save();
  renderBoard(res.item);
  (res.in ? sfx.in : sfx.out)();
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
  renderStatus(aliveBefore !== S.alive);
  renderCoach();
  scrollToLatest();
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
    sfx.tick();
  };
  for (let i = 0; i < cards.length; i++) {
    if (reduceMotion) mark(i); else await new Promise((r) => setTimeout(() => { mark(i); r(); }, 60));
  }
  if (res.allRight) {
    say($('proveFeedback'), 'All six are right.', 'in');
    sfx.solve();
    S.result = 'solved'; S.phase = 'result'; S.reveal = res.reveal;
    recordSort(); save();
    await report();
    setTimeout(() => renderSort(), reduceMotion ? 0 : 220);
  } else {
    sfx.fail();
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
  recordSort(); save();
  await report();
  renderSort();
}
/* Tell the server how a daily round ended, once, and keep the crowd numbers it returns. */
async function report() {
  if (S.mode !== 'daily' || S.reported) return;
  S.reported = true;
  try {
    const r = await api('/api/result', { ...roundBody(), result: S.result, stars: starsNow(), tests: S.strokes });
    S.stats = r.stats || null;
  } catch { S.reported = false; }
  save();
}

/* ---------- local stats ---------- */
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
  if (S.result === 'solved') { st.solved += 1; dd.solved += 1; }
  if (S.day === today) {
    if (S.result === 'solved') { st.streak = st.lastDay === today - 1 ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak); }
    else st.streak = 0;
    st.lastDay = today;
  }
  st.domains[S.domainId] = dd;
  store.set(STATS_KEY, st);
}
const dayState = (d) => store.get(SORT_PREFIX + d, null);
function renderStatsDialog() {
  const st = { ...emptyStats, ...store.get(STATS_KEY, {}) };
  const pct = st.played ? Math.round((100 * st.solved) / st.played) : 0;
  const avgStars = st.played ? (st.stars / st.played).toFixed(1) : '–';
  const fals = st.tests ? Math.round((100 * st.testsOut) / st.tests) : 0;
  const tiles = [[st.played, 'Played'], [`${pct}%`, 'Solved'], [avgStars, 'Avg stars'], [st.streak, 'Streak'], [st.best, 'Best streak'], [st.tests ? `${fals}%` : '–', 'Falsifier']];
  $('statTiles').innerHTML = tiles.map(([v, l]) => `<div class="tile-stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
  const cal = [];
  for (let d = today - 27; d <= today; d++) {
    const s = d >= 0 ? dayState(d) : null;
    const cls = !s || s.phase !== 'result' ? '' : s.result === 'solved' ? 'solved' : 'failed';
    cal.push(`<i class="${cls}${d === today ? ' today' : ''}" title="${d >= 0 ? `Daily ${d + 1}` : ''}"></i>`);
  }
  $('calendar').innerHTML = cal.join('');
  $('statDomains').innerHTML = D.list.map((d) => {
    const x = (st.domains || {})[d.id] || { played: 0, solved: 0 };
    const w = x.played ? Math.round((100 * x.solved) / x.played) : 0;
    return `<div><span>${d.name}</span><span class="bar"><i style="width:${w}%"></i></span><b>${x.solved} / ${x.played}</b></div>`;
  }).join('');
  const arch = [];
  for (let d = today; d >= 0; d--) {
    const s = dayState(d);
    const done = s && s.phase === 'result';
    const stars = done ? starsFor({ result: s.result, strokes: s.strokes, par: s.par }) : null;
    const status = done ? starGlyphs(stars) : (s && s.strokes ? 'in progress' : 'not played');
    arch.push(`<button type="button" data-day="${d}" class="${S && S.mode === 'daily' && S.day === d ? 'current' : ''}"><span class="n">${d + 1}</span><span class="d">${DAY_NAMES[dateOf(d).getUTCDay()]} ${fmtDate(d)} · ${D[domainFor(d)].name}</span><span class="s ${done ? '' : 'none'}">${status}</span></button>`);
  }
  $('archive').innerHTML = arch.join('');
  $('archive').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('dlgStats').close(); loadDay(Number(b.dataset.day)); }));
}

/* ---------- below the game ---------- */
function renderBelow() {
  const list = [];
  const wd = dateOf(today).getUTCDay();
  for (let i = 0; i < 7; i++) {
    const w = (1 + i) % 7; // Monday first
    const lvl = LEVEL_FOR[w];
    list.push(`<li class="${w === wd ? 'today' : ''}"><b>${DAY_NAMES[w]}</b><span>${D[WEEK[w]].name}</span><span class="lvl l${lvl}">${LEVEL_NAMES[lvl]}</span></li>`);
  }
  $('weekList').innerHTML = list.join('');
  if (today >= 1) {
    Promise.all([api('/api/reveal', { mode: 'daily', day: today - 1 }), api(`/api/stats?day=${today - 1}`)]).then(([rev, st]) => {
      $('yesterdayRule').textContent = rev.rule;
      $('yesterdayDetail').textContent = rev.detail;
      $('yesterdayCrowd').innerHTML = crowdLine(st.stats);
      $('yesterdayCard').hidden = false;
    }).catch(() => {});
  }
}

/* ---------- share image ---------- */
function shareImage() {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0e1013'); g.addColorStop(1, '#1a1f23');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, col) => { const r = x.createRadialGradient(cx, cy, 0, cx, cy, 520); r.addColorStop(0, col); r.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H); };
  glow(120, 140, 'rgba(70,224,163,0.28)'); glow(W - 100, H - 120, 'rgba(255,110,90,0.22)');
  x.fillStyle = '#f4f3ee'; x.font = '800 74px Syne, "Bricolage Grotesque", sans-serif'; x.fillText('Deductidle', 80, 170);
  x.fillStyle = v('--in') || '#46e0a3'; x.fillText('.', 80 + x.measureText('Deductidle').width, 170);
  x.fillStyle = '#9aa19d'; x.font = '500 34px "IBM Plex Sans", sans-serif';
  x.fillText(`${S.mode === 'daily' ? `Daily ${S.day + 1}` : 'Practice'} · ${domain().name}${S.level >= 2 ? ` · ${LEVEL_NAMES[S.level]}` : ''}`, 80, 230);
  const got = starsNow();
  x.font = '700 150px "Bricolage Grotesque", sans-serif';
  for (let i = 0; i < 3; i++) { x.fillStyle = i < got ? '#ffd166' : '#3a3f42'; x.fillText('★', 80 + i * 150, 460); }
  x.fillStyle = '#f4f3ee'; x.font = '700 56px "Bricolage Grotesque", sans-serif';
  x.fillText(S.result === 'solved' ? 'Found the rule' : 'Gave up', 80, 560);
  x.fillStyle = '#9aa19d'; x.font = '500 34px "IBM Plex Sans", sans-serif';
  x.fillText(`${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}`, 80, 615);
  const row = tests(); const size = 64, gap = 14;
  row.forEach((t, i) => { x.fillStyle = t.in ? '#46e0a3' : '#3a3f42'; const rx = 80 + (i % 12) * (size + gap), ry = 700 + Math.floor(i / 12) * (size + gap); x.beginPath(); x.roundRect(rx, ry, size, size, 14); x.fill(); });
  const marksY = 700 + (Math.ceil(row.length / 12) || 1) * (size + gap) + 30;
  x.fillStyle = '#9aa19d'; x.font = '500 30px "IBM Plex Sans", sans-serif';
  x.fillText(`${'✗ '.repeat(S.proveFails)}${S.result === 'solved' ? '✓ proved it' : ''}`.trim(), 80, marksY + 30);
  x.fillStyle = '#6b726e'; x.font = '600 30px "IBM Plex Sans", sans-serif'; x.fillText(SHARE_URL.replace('https://', ''), 80, H - 90);
  c.toBlob((blob) => {
    if (!blob) { say($('resultFeedback'), 'Could not make the image.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `deductidle-${S.mode === 'daily' ? S.day + 1 : 'practice'}.png`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say($('resultFeedback'), 'Image saved.');
  }, 'image/png');
}

/* ---------- keyboard ---------- */
const RANK_KEYS = { a: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '0': 10, j: 11, q: 12, k: 13 };
const SUIT_KEYS = { s: 'S', h: 'H', d: 'D', c: 'C' };
document.addEventListener('keydown', (e) => {
  if (!S) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (S.phase === 'prove') {
    const cards = [...$('proveGrid').children];
    if (!cards.length) return;
    if (k === 'arrowright' || k === 'arrowdown') { proveFocus = (proveFocus + 1) % cards.length; cards[proveFocus].focus(); e.preventDefault(); }
    else if (k === 'arrowleft' || k === 'arrowup') { proveFocus = (proveFocus - 1 + cards.length) % cards.length; cards[proveFocus].focus(); e.preventDefault(); }
    else if (k === 'i' || k === 'o') { const item = S.proveItems[proveFocus].item; setAnswer(item, k === 'i'); proveFocus = Math.min(cards.length - 1, proveFocus + 1); cards[proveFocus].focus(); e.preventDefault(); }
    else if (k === 'enter' && !$('btnCheck').disabled) { checkProve(); e.preventDefault(); }
    return;
  }
  if (S.phase === 'explore' && domain().input === 'pair') {
    if (k in RANK_KEYS) { cardSel.rank = RANK_KEYS[k]; renderTray(); e.preventDefault(); }
    else if (k in SUIT_KEYS) { cardSel.suit = SUIT_KEYS[k]; renderTray(); e.preventDefault(); }
    else if (k === 'enter') { probe(cardKey()); e.preventDefault(); }
  }
});

/* ---------- wiring ---------- */
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
    save(); renderSort(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  } catch { say($('feedback'), 'Could not load Prove.'); }
});
$('btnBack').addEventListener('click', () => { S.phase = 'explore'; save(); renderSort(); });
$('btnCheck').addEventListener('click', checkProve);
$('btnGiveUp').addEventListener('click', doGiveUp);
$('btnCoachClose').addEventListener('click', () => { store.set(COACH_KEY, 2); $('coach').hidden = true; });
$('alive').addEventListener('click', () => {
  const note = $('aliveNote');
  note.hidden = !note.hidden;
});
$('btnShare').addEventListener('click', () => copyText(sortShare(), $('resultFeedback')));
$('btnImage').addEventListener('click', shareImage);
$('btnPractice').addEventListener('click', async () => {
  try {
    const domainId = $('practiceKind').value || S.domainId;
    const level = $('practiceLevel').value || undefined;
    const meta = await api('/api/round', { mode: 'practice', day: S.day, domainId, level });
    newRound(meta); renderSort(); window.scrollTo(0, 0);
    if (domain().input === 'text') $('probeInput').focus();
  } catch { say($('resultFeedback'), 'Could not start practice.'); }
});
$('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
$('btnStats').addEventListener('click', () => { renderStatsDialog(); $('dlgStats').showModal(); });
$('btnTheme').addEventListener('click', () => { const next = currentTheme() === 'dark' ? 'light' : 'dark'; store.set(THEME_KEY, next); applyTheme(next); });
$('btnSound').addEventListener('click', () => { soundOn = !soundOn; store.set(SOUND_KEY, soundOn); applySound(); if (soundOn) sfx.in(); });
window.addEventListener('resize', () => { if (S && S.phase === 'explore') renderBoard(); });

/* ---------- boot and day loading ---------- */
async function loadDay(day) {
  const meta = await api(`/api/round?day=${day}&mode=daily`);
  const saved = store.get(SORT_PREFIX + day, null);
  if (saved && saved.seed === meta.seed && saved.domainId === meta.domainId && Array.isArray(saved.evidence)) hydrate(saved, meta);
  else { newRound(meta); save(); }
  if (S.phase === 'result' && S.mode === 'daily' && !S.stats) {
    api(`/api/stats?day=${day}`).then((r) => { S.stats = r.stats || null; save(); if (S.phase === 'result') renderResult(); }).catch(() => {});
  }
  renderSort();
  const url = new URL(location.href);
  if (day === today) url.searchParams.delete('day'); else url.searchParams.set('day', String(day + 1));
  history.replaceState(null, '', url);
  window.scrollTo(0, 0);
}

I.mount();
initTheme();
applySound();
renderBelow();
(async () => {
  const wanted = Number.parseInt(new URL(location.href).searchParams.get('day'), 10);
  const day = Number.isFinite(wanted) && wanted >= 1 && wanted - 1 <= today ? wanted - 1 : today;
  try { await loadDay(day); }
  catch {
    $('headline').textContent = 'Could not load today’s puzzle.';
    $('lede').textContent = 'Refresh to try again.';
  }
})();

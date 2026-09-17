/* Rule — game loop for The Gate. Vanilla JS, no build step. */
(() => {
  const D = window.RuleDomains;
  const E = window.RuleEngine;
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
  const rule = () => domain().rules[S.ruleIdx];
  const evidence = () => E.buildEvidence(domain(), rule(), E.mulberry32(S.seed));
  const tests = () => S.log.filter((e) => e.kind === 'test');
  const onBoard = () => new Set([...evidence().map((e) => e.item), ...S.log.map((e) => e.item)]);
  const proveSet = () => E.buildProve(domain(), rule(), onBoard(), E.mulberry32(S.seed + 7919 * (S.proveRound + 1)));

  function newRound(init) {
    S = { mode: init.mode, day: init.day, domainId: init.domainId, ruleIdx: init.ruleIdx, seed: init.seed,
      phase: 'play', strokes: 0, log: [], proveRound: 0, proveFails: 0, result: null, recorded: false };
    return S;
  }
  const save = () => { if (S.mode === 'daily') store.set(STATE_PREFIX + S.day, S); };

  /* ---------- helpers ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let toastTimer;
  function toast(msg, iconName) {
    const t = $('toast');
    t.innerHTML = (iconName ? I.icon(iconName) : '') + `<span>${msg}</span>`;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }
  const tileHtml = (item) => `<div class="tile">${domain().render(item)}</div>`;
  const scoreLabel = (d) => d <= -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : 'Over par';
  const scoreStr = (d) => d === 0 ? 'Par' : d > 0 ? `+${d}` : `−${Math.abs(d)}`;
  function fmtDate(day) {
    return new Date(E.LAUNCH_UTC + day * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

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
    const rows = [...evidence().map((e) => ({ ...e, kind: 'given' })), ...S.log];
    for (const r of rows) {
      const el = document.createElement('div');
      el.className = `grow ${r.in ? 'in' : 'out'} ${r.kind === 'given' ? 'given' : 'mine'}${latestItem !== undefined && r.item === latestItem ? ' latest' : ''}`;
      el.innerHTML = `${tileHtml(r.item)}<i class="tick"></i>`;
      gate.appendChild(el);
    }
    const n = tests().length;
    $('strokes').innerHTML = `<b>${S.strokes}</b> ${S.strokes === 1 ? 'test' : 'tests'} · par ${rule().par}`;
    $('nodeSub').textContent = n === 0 ? `Try any ${domain().noun}` : 'Try another';
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
    $('btnGiveUp').querySelector('span').textContent = 'Give up';
  }

  let answers = {};
  let currentProve = [];
  function renderProve() {
    showView();
    currentProve = proveSet();
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
    const r = rule();
    const solved = S.result === 'solved';
    const diff = S.strokes - r.par;
    const big = $('doneScore');
    big.classList.remove('good', 'bad');
    if (solved) {
      $('doneEyebrow').textContent = 'Solved';
      big.textContent = scoreStr(diff);
      big.classList.add(diff > 0 ? 'bad' : 'good');
      const t = `${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}`;
      $('doneSub').textContent = diff === 0 ? `${t}, exactly par` : `${scoreLabel(diff)} · ${t}, ${Math.abs(diff)} ${diff < 0 ? 'under' : 'over'} par`;
    } else {
      $('doneEyebrow').textContent = 'Revealed';
      big.textContent = '—';
      big.classList.add('bad');
      $('doneSub').textContent = 'No score today. Tomorrow is a new rule.';
    }
    $('doneRule').textContent = r.rule;
    $('doneDetail').textContent = r.detail;
    const { falseIn, falseOut } = E.trapBreakers(domain(), r);
    const n = (falseIn !== null) + (falseOut !== null);
    $('doneTrap').innerHTML = `Looks like <b>${r.trapName}</b> at first. ${n > 1 ? 'These break it.' : 'This breaks it.'}`;
    const br = [];
    if (falseIn !== null) br.push(`<span class="breaker out">${tileHtml(falseIn)}<small>out</small></span>`);
    if (falseOut !== null) br.push(`<span class="breaker in">${tileHtml(falseOut)}<small>in</small></span>`);
    $('doneBreakers').innerHTML = br.join('');
    $('shareText').textContent = shareText();
    $('btnPractice').querySelector('span').textContent = S.mode === 'daily' ? 'Practice round' : 'Another practice round';
    tickCountdown();
  }

  function shareText() {
    const head = S.mode === 'daily' ? `Rule #${S.day + 1} · ${domain().name}` : `Rule practice · ${domain().name}`;
    const score = S.result === 'solved' ? scoreStr(S.strokes - rule().par) : '🏳️';
    const probes = tests().map((p) => (p.in ? '🟩' : '⬛')).join('') || '·';
    const prove = '❌'.repeat(S.proveFails) + (S.result === 'solved' ? '✅' : '');
    const lines = [`${head} · ${score}`, `${probes} ${prove}`.trim()];
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
    const next = E.dailyPick(S.day + 1);
    $('nextIn').textContent = `Next rule in ${h}h ${String(m).padStart(2, '0')}m · ${D[next.domainId].name}`;
  }
  setInterval(tickCountdown, 30000);

  function render(latestItem) {
    if (S.phase === 'play') renderPlay(latestItem);
    else if (S.phase === 'prove') renderProve();
    else renderDone();
  }

  /* ---------- actions ---------- */
  function probe(item) {
    if (onBoard().has(item)) { toast('Already through the gate'); return; }
    const isIn = rule().test(item);
    S.strokes += 1;
    S.log.push({ item, in: isIn, kind: 'test' });
    save();
    renderBoard(item);
    const node = $('node');
    node.classList.remove('hit-in', 'hit-out');
    void node.offsetWidth;
    node.classList.add(isIn ? 'hit-in' : 'hit-out');
    setTimeout(() => node.classList.remove('hit-in', 'hit-out'), 700);
    const v = $('verdict');
    v.className = `verdict ${isIn ? 'in' : 'out'}`;
    v.innerHTML = `${domain().id === 'shapes' ? domain().render(item) : `<span>${domain().label(item)}</span>`}<span>is ${isIn ? 'IN' : 'OUT'}</span>`;
    void v.offsetWidth;
    v.classList.add('show');
    const latest = document.querySelector('.grow.latest');
    if (latest) latest.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function checkProve() {
    $('btnCheck').disabled = true;
    $('btnBack').disabled = true;
    let right = 0;
    for (const card of $('proveGrid').children) {
      const p = currentProve.find((x) => String(x.item) === card.dataset.item);
      const ok = answers[p.item] === p.in;
      right += ok ? 1 : 0;
      card.classList.add(ok ? 'right' : 'wrong');
      card.querySelector('.truth').innerHTML = ok ? I.icon('check') : `${I.icon('xmark')}<span>was ${p.in ? 'in' : 'out'}</span>`;
      card.querySelectorAll('.seg button').forEach((b) => { b.disabled = true; });
    }
    if (right === currentProve.length) {
      S.result = 'solved';
      S.phase = 'done';
      record(); save();
      setTimeout(() => render(), reduceMotion ? 0 : 900);
    } else {
      S.proveFails += 1;
      S.proveRound += 1;
      S.strokes += 2;
      S.log.push(...currentProve.map((p) => ({ item: p.item, in: p.in, kind: 'prove' })));
      S.phase = 'play';
      save();
      const note = $('proveNote');
      note.textContent = `${right} of 6. These six go through the gate. +2 tests.`;
      note.hidden = false;
      setTimeout(() => render(), reduceMotion ? 800 : 1800);
    }
  }

  let giveUpArmed = null;
  function giveUp() {
    const span = $('btnGiveUp').querySelector('span');
    if (!giveUpArmed) {
      span.textContent = 'Really? Show me';
      giveUpArmed = setTimeout(() => { giveUpArmed = null; span.textContent = 'Give up'; }, 3000);
      return;
    }
    clearTimeout(giveUpArmed); giveUpArmed = null;
    S.result = 'gaveup';
    S.phase = 'done';
    record(); save(); render();
  }

  /* ---------- stats ---------- */
  const emptyStats = { played: 0, solved: 0, streak: 0, best: 0, lastDay: null, overPar: 0, tests: 0, testsOut: 0, domains: {} };
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
    if (S.result === 'solved') {
      st.solved += 1; dd.solved += 1;
      st.overPar += S.strokes - rule().par;
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
    const avg = st.solved ? st.overPar / st.solved : 0;
    const avgStr = st.solved ? (avg > 0 ? `+${avg.toFixed(1)}` : avg < 0 ? `−${Math.abs(avg).toFixed(1)}` : 'Par') : '–';
    const fals = st.tests ? Math.round((100 * st.testsOut) / st.tests) : 0;
    const tiles = [[st.played, 'Played'], [`${pct}%`, 'Solved'], [st.streak, 'Streak'], [st.best, 'Best streak'], [avgStr, 'Avg vs par'], [st.tests ? `${fals}%` : '–', 'Falsifier']];
    $('statTiles').innerHTML = tiles.map(([v, l]) => `<div class="tile-stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    $('statDomains').innerHTML = D.list.map((d) => { const x = (st.domains || {})[d.id] || { played: 0, solved: 0 }; return `<div><span>${d.name}</span><b>${x.solved} / ${x.played}</b></div>`; }).join('');
    $('statNote').innerHTML = st.tests
      ? `<b>Falsifier</b> is the share of your tests that came back <b>out</b>. Testing what you expect to fail is how you catch the trap. Sharp players sit above 50%.`
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
  $('btnProve').addEventListener('click', () => { S.phase = 'prove'; save(); render(); window.scrollTo(0, 0); });
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
  $('btnPractice').addEventListener('click', () => {
    const dom = D.list[Math.floor(Math.random() * D.list.length)];
    newRound({ mode: 'practice', day: S.day, domainId: dom.id, ruleIdx: Math.floor(Math.random() * dom.rules.length), seed: Math.floor(Math.random() * 1e9) });
    render();
    window.scrollTo(0, 0);
    if (dom.input === 'text') $('probeInput').focus();
  });
  $('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
  $('btnHelpClose').addEventListener('click', () => { $('dlgHelp').close(); if (domain().input === 'text') $('probeInput').focus(); });
  $('btnStats').addEventListener('click', () => { renderStats(); $('dlgStats').showModal(); });
  $('btnStatsClose').addEventListener('click', () => $('dlgStats').close());

  /* ---------- boot ---------- */
  I.mount();
  const day = Math.max(0, E.dayIndex());
  const saved = store.get(STATE_PREFIX + day, null);
  if (saved && saved.seed !== undefined && D[saved.domainId]) {
    S = saved;
    if (S.phase === 'prove') S.phase = 'play';
  } else {
    const p = E.dailyPick(day);
    newRound({ mode: 'daily', day, domainId: p.domainId, ruleIdx: p.ruleIdx, seed: p.seed });
    save();
  }
  render();
  if (!store.get('rule.seen', false)) { store.set('rule.seen', true); $('dlgHelp').showModal(); }
})();

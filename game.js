/* Rule — game loop. Vanilla JS, no build step. */
(() => {
  const P = window.RulePuzzles;
  const $ = (id) => document.getElementById(id);
  const SHARE_URL = ''; // set to the public URL once deployed, it's appended to the share text

  /* ---------- storage (per-browser, best effort) ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
    },
  };

  /* ---------- round state ---------- */
  let S = null;
  const puzzle = () => P.PUZZLES[S.puzzleIdx];
  const evidence = () => P.buildEvidence(puzzle(), P.mulberry32(S.seed));
  const onBoard = () => new Set([...evidence().map((e) => e.n), ...S.probes.map((p) => p.n), ...S.extra.map((e) => e.n)]);
  const proveSet = () => P.buildProve(puzzle(), onBoard(), P.mulberry32(S.seed + 7919 * (S.proveRound + 1)));

  function newRound(init) {
    S = {
      mode: init.mode, day: init.day, puzzleIdx: init.puzzleIdx, seed: init.seed,
      phase: 'play', strokes: 0, probes: [], extra: [], proveRound: 0, proveFails: 0,
      result: null, recorded: false,
    };
    return S;
  }
  function save() { if (S.mode === 'daily') store.set(`rule.day.${S.day}`, S); }

  /* ---------- helpers ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }
  function chipEl(n, mine, latest) {
    const el = document.createElement('span');
    el.className = 'chip' + (mine ? ' mine' : '') + (latest ? ' latest' : '');
    el.textContent = n;
    return el;
  }
  function scoreLabel(diff) {
    if (diff <= -2) return 'Eagle';
    if (diff === -1) return 'Birdie';
    if (diff === 0) return 'Par';
    if (diff === 1) return 'Bogey';
    if (diff === 2) return 'Double bogey';
    return 'Over par';
  }
  function scoreStr(diff) {
    if (diff === 0) return 'Par';
    return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
  }
  function fmtDate(day) {
    const d = new Date(Date.UTC(2026, 8, 17) + day * 86400000);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  /* ---------- rendering ---------- */
  function showView() {
    $('viewPlay').hidden = S.phase !== 'play';
    $('viewProve').hidden = S.phase !== 'prove';
    $('viewDone').hidden = S.phase !== 'done';
    $('probeBar').hidden = S.phase !== 'play';
    $('meta').textContent = S.mode === 'daily' ? `#${S.day + 1} · ${fmtDate(S.day)}` : 'Practice';
  }

  function renderBoard(latestN) {
    const cin = $('chipsIn'), cout = $('chipsOut');
    cin.replaceChildren(); cout.replaceChildren();
    for (const e of evidence()) (e.in ? cin : cout).appendChild(chipEl(e.n, false, false));
    for (const p of [...S.extra, ...S.probes]) (p.in ? cin : cout).appendChild(chipEl(p.n, true, p.n === latestN));
    const par = puzzle().par;
    $('strokes').innerHTML = `<b>${S.strokes}</b> ${S.strokes === 1 ? 'test' : 'tests'} · par ${par}`;
  }

  function renderPlay(latestN) {
    showView();
    renderBoard(latestN);
    $('btnGiveUp').textContent = 'Give up';
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
    for (const item of currentProve) {
      const card = document.createElement('div');
      card.className = 'pcard';
      card.dataset.n = item.n;
      card.innerHTML = `
        <div class="num">${item.n}</div>
        <div class="seg" role="group" aria-label="Is ${item.n} in or out?">
          <button type="button" class="in" aria-pressed="false">In</button>
          <button type="button" class="out" aria-pressed="false">Out</button>
        </div>
        <div class="truth"></div>`;
      const [bIn, bOut] = card.querySelectorAll('.seg button');
      const pick = (val) => {
        answers[item.n] = val;
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
    const pz = puzzle();
    const solved = S.result === 'solved';
    const diff = S.strokes - pz.par;
    const big = $('doneScore');
    big.classList.remove('good', 'bad');
    if (solved) {
      $('doneEyebrow').textContent = 'Solved';
      big.textContent = scoreStr(diff);
      big.classList.add(diff > 0 ? 'bad' : 'good');
      const tests = `${S.strokes} ${S.strokes === 1 ? 'test' : 'tests'}`;
      $('doneSub').textContent = diff === 0
        ? `${tests}, exactly par`
        : `${scoreLabel(diff)} · ${tests}, ${Math.abs(diff)} ${diff < 0 ? 'under' : 'over'} par`;
    } else {
      $('doneEyebrow').textContent = 'Revealed';
      big.textContent = '—';
      big.classList.add('bad');
      $('doneSub').textContent = 'No score today. Tomorrow is a new rule.';
    }
    $('doneRule').textContent = pz.rule;
    $('doneDetail').textContent = pz.detail;

    const { falseIn, falseOut } = P.trapBreakers(pz);
    let trap = `Looks like <b>${pz.trapName}</b> at first.`;
    if (falseIn !== null) trap += ` But <span class="num">${falseIn}</span> is out.`;
    if (falseOut !== null) trap += ` And <span class="num">${falseOut}</span> is in.`;
    $('doneTrap').innerHTML = trap;

    $('shareText').textContent = shareText();
    $('btnPractice').textContent = S.mode === 'daily' ? 'Practice round' : 'Another practice round';
    tickCountdown();
  }

  function shareText() {
    const pz = puzzle();
    const head = S.mode === 'daily' ? `Rule #${S.day + 1}` : 'Rule practice';
    const score = S.result === 'solved' ? scoreStr(S.strokes - pz.par) : '🏳️';
    const probes = S.probes.map((p) => (p.in ? '🟩' : '⬛')).join('') || '·';
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
    $('nextIn').textContent = `Next rule in ${h}h ${String(m).padStart(2, '0')}m`;
  }
  setInterval(tickCountdown, 30000);

  function render(latestN) {
    if (S.phase === 'play') renderPlay(latestN);
    else if (S.phase === 'prove') renderProve();
    else renderDone();
  }

  /* ---------- actions ---------- */
  function probe(raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0 || String(n) !== raw.replace(/^0+(?=\d)/, '')) { toast('Whole numbers only'); return; }
    if (onBoard().has(n)) { toast(`${n} is already on the board`); return; }
    const isIn = puzzle().test(n);
    S.strokes += 1;
    S.probes.push({ n, in: isIn });
    save();
    renderBoard(n);
    const col = $(isIn ? 'colIn' : 'colOut');
    col.classList.add(isIn ? 'flash-in' : 'flash-out');
    setTimeout(() => col.classList.remove('flash-in', 'flash-out'), 500);
    const v = $('verdict');
    v.className = `verdict ${isIn ? 'in' : 'out'}`;
    v.textContent = `${n} is ${isIn ? 'IN' : 'OUT'}`;
    void v.offsetWidth;
    v.classList.add('show');
  }

  function checkProve() {
    $('btnCheck').disabled = true;
    $('btnBack').disabled = true;
    let right = 0;
    for (const card of $('proveGrid').children) {
      const n = Number(card.dataset.n);
      const truth = puzzle().test(n);
      const ok = answers[n] === truth;
      right += ok ? 1 : 0;
      card.classList.add(ok ? 'right' : 'wrong');
      card.querySelector('.truth').textContent = ok ? '✓' : `was ${truth ? 'in' : 'out'}`;
      card.querySelectorAll('.seg button').forEach((b) => { b.disabled = true; });
    }
    if (right === currentProve.length) {
      S.result = 'solved';
      S.phase = 'done';
      record();
      save();
      setTimeout(() => render(), reduceMotion ? 0 : 900);
    } else {
      S.proveFails += 1;
      S.proveRound += 1;
      S.strokes += 2;
      S.extra.push(...currentProve);
      S.phase = 'play';
      save();
      const note = $('proveNote');
      note.textContent = `${right} of 6. These six join the board. +2 tests.`;
      note.hidden = false;
      setTimeout(() => render(), reduceMotion ? 800 : 1800);
    }
  }

  let giveUpArmed = null;
  function giveUp() {
    if (!giveUpArmed) {
      $('btnGiveUp').textContent = 'Really? Show me';
      giveUpArmed = setTimeout(() => { giveUpArmed = null; $('btnGiveUp').textContent = 'Give up'; }, 3000);
      return;
    }
    clearTimeout(giveUpArmed); giveUpArmed = null;
    S.result = 'gaveup';
    S.phase = 'done';
    record();
    save();
    render();
  }

  /* ---------- stats ---------- */
  const emptyStats = { played: 0, solved: 0, streak: 0, best: 0, lastDay: null, overPar: 0, tests: 0, testsOut: 0 };
  function record() {
    if (S.mode !== 'daily' || S.recorded) return;
    S.recorded = true;
    const st = { ...emptyStats, ...store.get('rule.stats', {}) };
    st.played += 1;
    st.tests += S.probes.length;
    st.testsOut += S.probes.filter((p) => !p.in).length;
    if (S.result === 'solved') {
      st.solved += 1;
      st.overPar += S.strokes - puzzle().par;
      st.streak = st.lastDay === S.day - 1 ? st.streak + 1 : 1;
      st.best = Math.max(st.best, st.streak);
    } else {
      st.streak = 0;
    }
    st.lastDay = S.day;
    store.set('rule.stats', st);
  }
  function renderStats() {
    const st = { ...emptyStats, ...store.get('rule.stats', {}) };
    const pct = st.played ? Math.round((100 * st.solved) / st.played) : 0;
    const avg = st.solved ? (st.overPar / st.solved) : 0;
    const avgStr = st.solved ? (avg > 0 ? `+${avg.toFixed(1)}` : avg < 0 ? `−${Math.abs(avg).toFixed(1)}` : 'Par') : '–';
    const fals = st.tests ? Math.round((100 * st.testsOut) / st.tests) : 0;
    const tiles = [
      [st.played, 'Played'], [`${pct}%`, 'Solved'], [st.streak, 'Streak'],
      [st.best, 'Best streak'], [avgStr, 'Avg vs par'], [st.tests ? `${fals}%` : '–', 'Falsifier'],
    ];
    $('statTiles').innerHTML = tiles.map(([v, l]) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
    $('statNote').innerHTML = st.tests
      ? `<b>Falsifier</b> is the share of your tests that came back <b>out</b>. Testing what you expect to fail is how you catch the trap. Sharp players sit above 50%.`
      : `Finish today's rule and your stats show up here.`;
  }

  /* ---------- wiring ---------- */
  $('probeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('probeInput');
    const raw = input.value.trim();
    if (!raw) return;
    probe(raw);
    input.value = '';
    input.focus();
  });
  $('btnProve').addEventListener('click', () => { S.phase = 'prove'; save(); render(); });
  $('btnBack').addEventListener('click', () => { S.phase = 'play'; save(); render(); });
  $('btnCheck').addEventListener('click', checkProve);
  $('btnGiveUp').addEventListener('click', giveUp);
  $('btnCopy').addEventListener('click', async () => {
    const text = shareText();
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied'); } catch { toast('Copy failed'); }
      ta.remove();
    }
  });
  $('btnPractice').addEventListener('click', () => {
    const puzzleIdx = Math.floor(Math.random() * P.PUZZLES.length);
    newRound({ mode: 'practice', day: S.day, puzzleIdx, seed: Math.floor(Math.random() * 1e9) });
    render();
    $('probeInput').focus();
  });
  $('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
  $('btnHelpClose').addEventListener('click', () => { $('dlgHelp').close(); $('probeInput').focus(); });
  $('btnStats').addEventListener('click', () => { renderStats(); $('dlgStats').showModal(); });
  $('btnStatsClose').addEventListener('click', () => $('dlgStats').close());

  /* ---------- boot ---------- */
  const day = Math.max(0, P.dayIndex());
  const saved = store.get(`rule.day.${day}`, null);
  if (saved && saved.seed !== undefined) {
    S = saved;
    if (S.phase === 'prove') S.phase = 'play'; // never resume mid-prove
  } else {
    const d = P.dailyPuzzle(day);
    newRound({ mode: 'daily', day, puzzleIdx: d.puzzleIdx, seed: d.seed });
    save();
  }
  render();
  if (!store.get('rule.seen', false)) {
    store.set('rule.seen', true);
    $('dlgHelp').showModal();
  }
})();

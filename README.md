# Deductidle

Three daily deduction puzzles, the same for everyone, at [rule.dennis-bierreth.workers.dev](https://rule.dennis-bierreth.workers.dev).

A few things are already sorted: three follow a hidden rule, three don’t. Test your own, then prove you know the rule by sorting six more. Every day has three puzzles — Rule 1, Rule 2 and Rule 3 — each a different kind of thing: numbers, words, shapes, emoji or cards. Each puzzle hides one rule.

- Every test costs one. Finish within par for three stars.
- Every rule has a **trap**: a plausible wrong rule that fits the opening examples. The prove items are chosen so the trap can't pass.
- **Same board every time, three puzzles a day.** Six examples, three in and three out. Each day draws three different kinds of thing from the day number so everyone gets the same three and there is no weekly pattern. Finish all three for a day share with one line per puzzle.
- **Ugly examples.** Of many candidate opening sets, the engine keeps the one that leaves the most wrong hypotheses alive, so the obvious pattern is rarely the rule.
- **Hypothesis counter.** After every test the dock shows how many rules from the library still fit the board.
- **Solve rates.** With a KV namespace bound as `STATS`, results are counted per puzzle and the reveal shows how many players solved it. Without it the game runs unchanged.
- **Archive.** Any earlier day can be played from the stats dialog or with `?day=N` (add `&level=2` or `&level=3` for the second or third puzzle). Archive plays count toward totals but not the streak, which counts days in a row with at least one solve.
- Three-line share result and a rendered share image: stars, the shape of your attempt, the link.
- Sound is a small synth, off by default. Desktop keys: I and O sort in prove, arrows move, Enter checks; on cards days the rank and suit keys pick.
- Rules are evaluated on the server, so they are not in the page's JavaScript.

## Run it

The site needs the API, so opening `index.html` as a file will not work. From the repo folder:

```
npm start
```

Then open http://127.0.0.1:8787. `npx wrangler dev` is the same shape as production (Worker + static assets).

`npm run check` (or `node scripts/check.js`) audits every rule of every domain, the first year of daily boards, and the API contract, and exits non-zero if any board breaks a guarantee. GitHub Actions runs that same command on every push.

Deploy on Cloudflare Workers (static assets + the Worker): connect the repo under Workers & Pages, leave the build command empty, and use `npx wrangler deploy` as the deploy command. Or run that command locally from the repo folder.

To turn on solve rates, create a KV namespace once and bind it:

```
npx wrangler kv namespace create STATS
```

Paste the id it prints into the commented `[[kv_namespaces]]` block in `wrangler.toml` and uncomment it. For a custom domain, add it under the Worker's Settings → Domains & Routes in the Cloudflare dashboard.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page: explore, prove, result |
| `styles.css` | Evidence-board visual system, light and dark |
| `catalog.js` | Public domain UI: item renderer, typed input, pickers. No rules. |
| `logic.js` | Stars, share text, phase helpers. Safe on the client. |
| `schedule.js` | Launch date and the seeded daily draw: three kinds of thing per day |
| `words.js` | Word pool, ~2,500 common English words. Server-only. |
| `domains.js` | Rule libraries with traps and item pools. Server-only. |
| `engine.js` | Ugly-evidence generator, prove set, schedule. Server-only. |
| `api.js` | HTTP handlers that test, prove and reveal without shipping the rule |
| `worker.js` | Cloudflare Worker: `/api/*` then static assets |
| `icons.js` | The Nucleo UI icons in use, plus a star and a flame drawn here |
| `game.js` | Game loop, the board, pickers, stars, share text, stats |

## Adding a rule or a domain

A rule is an entry in a domain's `rules` array in `domains.js`: a `test` predicate, a `trap` predicate that agrees with it on most items, a `par`, and the reveal copy. The generator picks opening examples where both agree and prove items where they disagree, so a new rule needs no hand-written boards. If the domain has a public renderer or input, put that in `catalog.js` so the client can draw tiles without loading the library.

A domain needs a `pool()` of items (primitives, so state stays JSON-safe), a `render(item)` for the tile, a `parse(raw)` for typed input or a picker (`input: 'builder'`, `'pick'` or `'pair'`), and its rules. Add it to `DAILY_DOMAINS` in `schedule.js` to put it in the daily draw.

## Not in the prototype yet

- Real "how many players solved" stats. The trap shown on reveal is designed, not measured.

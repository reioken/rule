# Deductidle

A daily puzzle. Eight things are already sorted into **In** and **Out** by a secret rule.
Test your own to work out the rule, then prove you know it by sorting six more.

Play at [rule.dennis-bierreth.workers.dev](https://rule.dennis-bierreth.workers.dev).

Domains take turns through the week: **numbers**, **words**, **shapes**, **emoji** and **cards**. Thursday is always numbers. **Letters** and **colors** are in the practice switcher so they can be tested without needing a huge pool.

- One rule per day, the same for everyone.
- Every test costs one. Solve within the rule's target for three stars.
- Every rule has a **trap**: a plausible wrong rule that fits the opening eight. The six prove items are chosen so the trap can't pass.
- Two-line spoiler-free share result.
- The rule itself is evaluated on the server, so it is not sitting in the page's JavaScript.

## Run it

The site needs the API, so opening `index.html` as a file will not work. From the repo folder:

```
npm start
```

Then open http://127.0.0.1:8787. `npx wrangler dev` is the same shape as production (Worker + static assets).

`npm run check` (or `node scripts/check.js`) audits every rule of every domain, the first year of daily boards, and the API contract, and exits non-zero if any board breaks a guarantee. GitHub Actions runs that same command on every push.

Deploy on Cloudflare Workers (static assets + the Worker): connect the repo under Workers & Pages, leave the build command empty, and use `npx wrangler deploy` as the deploy command. Or run that command locally from the repo folder.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page and the three views: play, prove, done |
| `styles.css` | Visual system, light and dark |
| `catalog.js` | Public domain UI: item renderer, typed input, pickers. No rules. |
| `schedule.js` | Launch date and weekday domain map |
| `words.js` | Word pool, ~2,500 common English words. Server-only. |
| `domains.js` | Rule libraries with traps and item pools. Server-only. |
| `engine.js` | Seeded board generator, prove set, weekday schedule. Server-only. |
| `api.js` | HTTP handlers that test, prove and reveal without shipping the rule |
| `worker.js` | Cloudflare Worker: `/api/*` then static assets |
| `icons.js` | The Nucleo UI icons in use, plus a star and a flame drawn here |
| `game.js` | Game loop, the bowls, pickers, stars, share text, stats |

## Adding a rule or a domain

A rule is an entry in a domain's `rules` array in `domains.js`: a `test` predicate, a `trap` predicate that agrees with it on most items, a `par`, and the reveal copy. The generator picks opening examples where both agree and prove items where they disagree, so a new rule needs no hand-written boards. If the domain has a public renderer or input, put that in `catalog.js` so the client can draw tiles without loading the library.

A domain needs a `pool()` of items (primitives, so state stays JSON-safe), a `render(item)` for the tile, a `parse(raw)` for typed input or a picker (`input: 'builder'`, `'pick'` or `'pair'`), and its rules. Add it to `WEEK` in `schedule.js` to schedule it.

## Not in the prototype yet

- Real "how many players solved" stats. The trap shown on reveal is designed, not measured.

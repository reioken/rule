# Deductidle

A daily deduction puzzle, the same for everyone, at [rule.dennis-bierreth.workers.dev](https://rule.dennis-bierreth.workers.dev).

A few things are already sorted through the gate by a secret rule. Send your own through, then prove you know the rule by sorting six more. Numbers, words, shapes, emoji and cards take turns through the week.

- Every test costs one. Finish within par for three stars.
- Every rule has a **trap**: a plausible wrong rule that fits the opening examples. The prove items are chosen so the trap can't pass.
- **Difficulty by weekday.** Monday and Wednesday: one rule, six examples. Tuesday, Thursday, Friday: two rules joined by and, or, or except. Weekends: two rules and only four examples.
- **Ugly examples.** Of many candidate opening sets, the engine keeps the one that leaves the most wrong hypotheses alive, so the obvious pattern is rarely the rule.
- Three-line share result: stars, the shape of your attempt as emoji, the link.
- Rules and functions are evaluated on the server, so they are not in the page's JavaScript.

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
| `index.html` | Page: explore, prove, result |
| `styles.css` | Evidence-board visual system, light and dark |
| `catalog.js` | Public domain UI: item renderer, typed input, pickers. No rules. |
| `logic.js` | Stars, share text, phase helpers. Safe on the client. |
| `schedule.js` | Launch date, weekday domain map, difficulty map |
| `words.js` | Word pool, ~2,500 common English words. Server-only. |
| `domains.js` | Atom rule libraries with traps and item pools. Server-only. |
| `engine.js` | Compound rule builder, levels, ugly-evidence generator, prove set, schedule. Server-only. |
| `api.js` | HTTP handlers that test, prove and reveal without shipping the rule |
| `worker.js` | Cloudflare Worker: `/api/*` then static assets |
| `icons.js` | The Nucleo UI icons in use, plus a star and a flame drawn here |
| `game.js` | Game loop, the gate, pickers, stars, share text, stats |

## Adding a rule or a domain

A rule is an entry in a domain's `rules` array in `domains.js`: a `test` predicate, a `trap` predicate that agrees with it on most items, a `par`, and the reveal copy. The generator picks opening examples where both agree and prove items where they disagree, so a new rule needs no hand-written boards. If the domain has a public renderer or input, put that in `catalog.js` so the client can draw tiles without loading the library.

A domain needs a `pool()` of items (primitives, so state stays JSON-safe), a `render(item)` for the tile, a `parse(raw)` for typed input or a picker (`input: 'builder'`, `'pick'` or `'pair'`), and its rules. Add it to `WEEK` in `schedule.js` to schedule it. Compound rules are built automatically from the atoms.

## Not in the prototype yet

- Real "how many players solved" stats. The trap shown on reveal is designed, not measured.

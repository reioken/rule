# Rule

A daily deduction game. Eight things are already sorted into **In** and **Out** by a secret rule.
Send your own through the gate, then prove you know the rule by sorting six more.

Three domains take turns through the week: **numbers**, **words** and **shapes**.

- One rule per day, the same for everyone.
- Every test costs a point. Score is tests against par, golf style.
- Every rule has a **trap**: a plausible wrong rule that fits the opening eight. The six prove numbers are chosen so the trap can't pass.
- Two-line spoiler-free share result.

## Run it

It's a static site with no build step. Open `index.html` directly, or serve the folder:

```
npx serve .
```

Deploy on Cloudflare Workers (static assets): connect the repo under Workers & Pages, leave the build command empty, and use `npx wrangler deploy` as the deploy command. Or run that command locally from the repo folder.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page and the three views: play, prove, done |
| `styles.css` | Visual system, light and dark |
| `domains.js` | The three domains: item pool, renderer, input type, rule library with traps |
| `words.js` | Word pool, 2,600 common English words |
| `engine.js` | Seeded board generator, prove set, weekday schedule |
| `icons.js` | The ten Nucleo UI icons in use |
| `game.js` | Game loop, the Gate board, shape builder, scoring, share text, stats |

## Adding a rule or a domain

A rule is an entry in a domain's `rules` array in `domains.js`: a `test` predicate, a `trap` predicate that agrees with it on most items, a `par`, and the reveal copy. The generator picks opening examples where both agree and prove items where they disagree, so a new rule needs no hand-written boards.

A domain needs a `pool()` of items (primitives, so state stays JSON-safe), a `render(item)` for the tile, a `parse(raw)` for typed input or `input: 'builder'` for a picker, and its rules. Add it to `WEEK` in `engine.js` to schedule it.

## Not in the prototype yet

- Server-side rule evaluation (the rule ships to the client, so it is readable in devtools).
- Real "how many players solved" stats. The trap shown on reveal is designed, not measured.
- More domains: colours, emoji, photos.

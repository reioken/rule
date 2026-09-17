# Rule

A daily deduction game. Eight numbers are already sorted into **In** and **Out** by a secret rule.
Test your own numbers, then prove you know the rule by sorting six more.

- One rule per day, the same for everyone.
- Every test costs a point. Score is tests against par, golf style.
- Every rule has a **trap**: a plausible wrong rule that fits the opening eight. The six prove numbers are chosen so the trap can't pass.
- Two-line spoiler-free share result.

## Run it

It's a static site with no build step. Open `index.html` directly, or serve the folder:

```
npx serve .
```

Deploy on Cloudflare Pages (or any static host) with the repo root as the output directory.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page and the three views: play, prove, done |
| `styles.css` | Visual system, light and dark |
| `puzzles.js` | Rule library, trap rules, seeded board generator |
| `game.js` | Game loop, scoring, share text, stats in localStorage |

## Adding a rule

Add an entry to `PUZZLES` in `puzzles.js`: a `test` predicate, a `trap` predicate that agrees with it on most numbers, a `par`, and the reveal copy. The generator picks opening examples where both rules agree and prove numbers where they disagree, so a new rule needs no hand-written boards.

## Not in the prototype yet

- Server-side rule evaluation (the rule ships to the client, so it is readable in devtools).
- Real "how many players solved" stats. The trap shown on reveal is designed, not measured.
- More domains: words and shapes.

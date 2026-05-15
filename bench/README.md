# Fireman-Bench-v1

The corpus that gates `opencode-fireman`'s detection guarantees. The
plugin is named after Twin Peaks' Fireman — the oracle who shows up to
deliver short, cryptic-but-correct warnings about hidden truth.
Fireman-Bench is the corpus of cases that decide whether his warnings
are actually load-bearing.

**This corpus is the spec.** Fireman's heuristics are tuned and gated
against the cases here.

## Why this exists

- **Recall (G5).** On the trap corpus, Fireman flags the labeled region in
  ≥80% of cases.
- **Precision (G6).** On the control corpus, Fireman emits at most 1
  finding per 10 controls.

CI runs the harness on every commit. PRs that regress either metric fail.

## Layout

```
bench/
├── schema/fireman-truth.schema.json
├── traps/                    cases where Fireman SHOULD fire
│   └── T001-serializer-key-ordering/
│       ├── user-serializer.ts
│       ├── product-serializer.ts
│       ├── audit-serializer.ts      the trap lives here
│       └── truth.json
├── controls/                 cases where Fireman SHOULD NOT fire
│   └── C001-clean-serializers/
│       ├── user-serializer.ts
│       ├── product-serializer.ts
│       ├── audit-serializer.ts
│       └── truth.json
└── harness/run.ts
```

Every case is one directory containing one or more `.ts` files plus
exactly one `truth.json`.

Each trap has a **matched control** — same file count, similar shape, no
trap. Matched pairs prevent Fireman from passing G5 by firing on anything
that looks complicated.

## Case ID convention

- `T###` for traps, `C###` for controls.
- Numbering is dense and never recycled. Deleting a case retires its ID.

## Trap categories (v1 target)

| Category               | What it is                                                                          |
|------------------------|-------------------------------------------------------------------------------------|
| `sibling-divergence`   | Near-identical functions where one preserves an externally-visible behavior         |
| `manual-escaping`      | A hand-rolled escape/encode that diverges from a generic equivalent for a reason    |
| `compatibility-marker` | Code with explicit "do not touch" / "ordering matters" / "workaround" annotations   |
| `timestamp-truncation` | Date/time handling that rounds or truncates in one path but not its siblings        |
| `bitmask-density`      | Bitmask operations that encode a wire-format or hardware contract                   |
| `retry-asymmetry`      | Retry paths where one preserves ordering / idempotency that the other doesn't       |

v0.1 ships with one case in `sibling-divergence`. Each new detector
category brings several trap/control pairs with it.

## Adding a case

1. Pick a category. If it doesn't fit one, propose a new category in a
   separate PR before adding cases for it.
2. Create `traps/T###-short-slug/` with the case files and `truth.json`.
3. Create the matched control `controls/C###-short-slug/`.
4. Run `bun run bench`. The case should fail (if it's a new pattern
   Fireman doesn't yet detect) — that's the right baseline before you
   write the detector code.
5. Implement the detector. Re-run the bench. Both gates must pass.
6. Open a PR.

## Provenance

Each `truth.json` carries an `inspired_by` array listing the real-world
libraries, issues, or patterns the synthetic case distills. Corpus files
are original; no upstream code is copied. This keeps the corpus
redistributable under the MIT license while preserving a paper trail to
the patterns we're modeling.

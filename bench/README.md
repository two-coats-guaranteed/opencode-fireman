# Fireman-Bench-v1

The corpus that gates `opencode-fireman`'s detection guarantees. The
plugin is named after Twin Peaks' Fireman — the oracle who shows up to
deliver short, cryptic-but-correct warnings about hidden truth.
Fireman-Bench is the corpus of cases that decide whether his warnings
are actually load-bearing.

**This corpus is the spec.** Fireman's heuristics are tuned and gated
against the cases here.

## Why this exists

- **Recall (G5).** On the core trap corpus, Fireman flags the labeled
  region in ≥80% of cases.
- **Precision (G6).** On the core control corpus, Fireman emits at most
  1 finding per 10 controls.

CI runs the harness on every commit. PRs that regress either metric fail.

## Tiers: core vs frontier

Each case carries a `tier` in its `truth.json`:

- **core** — gates CI. G5 and G6 are computed over core cases only.
- **frontier** — tracked and reported, but does **not** gate. Frontier
  cases document known detector limits: a pattern the current detector
  provably mishandles. They exist so the limit is visible and measured
  rather than hidden. When a future detector iteration handles a
  frontier case, it gets promoted to core.

Missing `tier` is treated as `core`.

This is why the bench can stay green while still containing cases the
detector gets wrong — the wrong answers are quarantined in the frontier
tier, in plain sight, not swept away.

## Current corpus (v0.1)

The v0.1 detector recognises one pattern: a function containing a sort
call (`.sort(` or the immutable `.toSorted(`) whose structurally similar
siblings — in *other* files in the same directory — lack one. Sort
tokens inside comments do not count.

**Core traps** — Fireman should fire (all are sort-divergence):

| Case | Pattern                                                           |
|------|-------------------------------------------------------------------|
| T001 | Audit serializer key-sorts for HMAC signature stability           |
| T002 | Query cache-key builder sorts params for canonical cache keys     |
| T003 | Request signer sorts header names for signature stability         |
| T004 | Set-digest function sorts members for an order-independent hash   |
| T005 | Permission comparison sorts both sides for set-equality           |
| T012 | One archive-key builder sorts tags — isolated among 4 siblings    |
| T013 | Config fingerprint sorts fields — minimal 2-file (1 sibling) case |

**Core controls** — Fireman should stay silent:

| Case | Why Fireman must not fire                                          |
|------|--------------------------------------------------------------------|
| C001 | Matched control for T001 — sort removed                            |
| C002 | Matched control for T002 — sort removed                            |
| C003 | Matched control for T003 — sort removed                            |
| C004 | A lone sort with no sibling files — nothing to diverge from        |
| C005 | Three similar functions that all sort — symmetric, not divergent   |
| C006 | A sort among structurally unrelated siblings — no comparable peer  |
| C008 | Matched control for T004 — sort removed                            |
| C009 | Matched control for T005 — sort removed                            |
| C010 | Matched control for T012 — sort removed                            |
| C011 | Matched control for T013 — sort removed                            |
| C012 | Two near-identical functions, neither sorts — plain duplication    |
| C013 | A sort whose only sibling file declares constants, not functions   |
| C014 | A `.sort()` mentioned only in a comment — must not trigger         |
| C015 | Siblings that both sort, one via `.sort()` one via `.toSorted()`   |

C004–C006 and C012–C015 are the cases that bound the false-positive
rate. A matched control alone only proves Fireman doesn't fire on
lookalike *structure*; the standalone controls exercise innocent uses of
the trigger feature — including the two adversarial cases (C014, C015)
that originally exposed real detector bugs and now serve as regression
tests against their reintroduction.

**Frontier** — known limits, tracked but not gated:

| Case | The limit it documents                                             |
|------|--------------------------------------------------------------------|
| C007 | Precision ceiling. An incidental, cosmetic divergent sort — structurally identical to a real trap, but display-only and safe to remove. v0.1 cannot tell it from a load-bearing sort and false-positives. |
| C016 | Precision residual. A `.sort()` mentioned inside a *string literal*. v0.1 strips comments but not strings, so it false-positives. Fixable, but deferred: naive string-stripping would also drop template-literal `${}` interpolations (which carry real identifiers) and destabilise structural similarity. |
| T006 | Recall: `manual-escaping`. One renderer HTML-escapes untrusted input; siblings don't. Removing the escape is stored XSS. |
| T007 | Recall: `compatibility-marker`. A function whose load-bearing legacy behavior is guarded by a DO-NOT-SIMPLIFY comment. |
| T008 | Recall: `timestamp-truncation`. One stamper truncates to whole seconds for a downstream contract; siblings keep millis. |
| T009 | Recall: `bitmask-density`. One flag-packer uses a non-contiguous bitmask fixed by a wire protocol. |
| T010 | Recall: `retry-asymmetry`. One retry loop halts the batch to preserve ordering; siblings continue past failures. |
| T011 | Recall (architectural). A real sort-divergence between three functions in the *same file* — v0.1 only compares across files. |
| T014 | Recall: `null-handling`. One extractor null-guards an optional-join field; siblings read mandatory fields. |
| T015 | Recall: `locale-sensitivity`. One normalizer uses locale-independent `toLowerCase()` for a security check; siblings use `toLocaleLowerCase()`. |
| T016 | Recall: `encoding-divergence`. One encoder uses base64url for URL/JWT safety; siblings use standard base64. |
| T017 | Recall: `numeric-rounding`. One function uses banker's rounding for money; siblings use ordinary `Math.round` for display. |
| T018 | Recall: `error-handling`. One loader lets errors propagate (a missing auth key must abort startup); siblings swallow and default. |
| T019 | Recall: `regex-anchoring`. One validator anchors its regex to block open redirects; siblings match loosely on trusted tokens. |

The twelve frontier traps T006–T019 are the recall roadmap made
concrete: each is a real bug class the v0.1 detector cannot see. They
MISS today (reported, not gated) and become `core` once a detector that
handles them lands. T011 is special — it's the same pattern v0.1
already catches, just within one file instead of across files, so it
documents an architectural gap rather than a missing category.

## Layout

```
bench/
├── schema/fireman-truth.schema.json
├── traps/                    cases where Fireman SHOULD fire
│   └── T00N-short-slug/
│       ├── <case files>.ts
│       └── truth.json
├── controls/                 cases where Fireman SHOULD NOT fire
│   └── C00N-short-slug/
│       ├── <case files>.ts
│       └── truth.json
└── harness/run.ts
```

Every case is one directory containing one or more `.ts` files plus
exactly one `truth.json`.

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
| `null-handling`        | One sibling defensively guards a nullable value the others assume is present        |
| `locale-sensitivity`   | Locale-dependent vs locale-independent operations that must not be unified          |
| `encoding-divergence`  | One path uses a specific encoding (base64url, hex, …) required by an external consumer |
| `numeric-rounding`     | Divergent rounding mode/precision — e.g. banker's rounding for money vs display rounding |
| `error-handling`       | One sibling propagates errors where the others swallow them, or vice versa          |
| `regex-anchoring`      | Anchored vs unanchored / flag-divergent regexes where the difference is load-bearing |

v0.1 ships three traps in `sibling-divergence`. Each new detector
category brings several trap/control pairs with it.

## Adding a case

1. Pick a category. If it doesn't fit one, propose a new category in a
   separate PR before adding cases for it.
2. Create `traps/T###-short-slug/` with the case files and `truth.json`.
3. Create the matched control `controls/C###-short-slug/`, plus any
   standalone controls that exercise innocent uses of the new detector's
   trigger features.
4. Run `bun run bench`. A trap for a pattern the detector can't yet see
   should be marked `tier: frontier` (it will MISS but won't gate) —
   that's the right baseline before you write the detector code.
5. Implement the detector. Re-run the bench. Promote the case to `core`.
   Both gates must pass.
6. Open a PR.

## Provenance

Each `truth.json` carries an `inspired_by` array listing the real-world
libraries, issues, or patterns the synthetic case distills. Corpus files
are original; no upstream code is copied. This keeps the corpus
redistributable under the MIT license while preserving a paper trail to
the patterns we're modeling.

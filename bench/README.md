# Fireman-Bench

The corpus that gates `opencode-fireman`'s detection guarantees.
Fireman-Bench is the corpus of cases that decide whether the plugin's
warnings are actually load-bearing.

**This corpus is the spec.** Fireman's heuristics are tuned and gated
against the cases here.

## Current corpus

**105 cases** — 75 traps + 30 controls — across 7 languages:

| Language       | Bench files | Adapters used                    |
|----------------|-------------|----------------------------------|
| TypeScript     | 145         | ts-adapter (TS compiler API)     |
| JavaScript     | 48          | ts-adapter (shared with TS)      |
| C              | 48          | c-adapter (tree-sitter-c)        |
| C++            | 30          | cpp-adapter (tree-sitter-cpp)    |
| Java           | 18          | java-adapter (tree-sitter-java)  |
| Python         | 9           | python-adapter (tree-sitter-python) |
| PHP            | 9           | php-adapter (tree-sitter-php)    |

Scala is supported by the analyzer (via tree-sitter-scala) but has no
bench cases yet.

The C and C++ bench includes cases from 7 hardware-accelerator
ecosystems: NVIDIA CUDA, AMD ROCm/HIP, Intel oneAPI/SYCL, Google
TFLite/Edge TPU, Huawei Ascend/CANN, Qualcomm SNPE/Hexagon DSP, plus
generic hardware (MMIO barriers, DMA cache, polling timeout).

## Metrics

CI runs the harness on every commit. PRs that regress any metric fail.

| ID | Claim | Scope | Current |
|----|-------|-------|---------|
| G5 | ≥ 80% recall on core traps | 7 core traps | 100.0% |
| G6 | ≤ 10% FP rate on core controls | 14 core controls | 0.00 |
| G7 | ≥ 40% recall on frontier traps | 68 frontier traps | 40.0% |
| G8 | ≤ 15% FP rate on frontier controls | 16 frontier controls | 0.10 |

## Tiers: core vs frontier

Each case carries a `tier` in its `truth.json`:

- **core** — gates CI. G5 and G6 are computed over core cases only.
- **frontier** — tracked and reported (G7, G8), but with softer
  thresholds. Frontier cases document known detector limits: a pattern
  the current detector provably mishandles. They exist so the limit is
  visible and measured rather than hidden. When a future detector
  iteration handles a frontier case, it gets promoted to core.

Missing `tier` is treated as `core`.

## Core traps (7)

| Case | Pattern |
|------|---------|
| T001 | Audit serializer key-sorts for HMAC signature stability |
| T002 | Query cache-key builder sorts params for canonical cache keys |
| T003 | Request signer sorts header names for signature stability |
| T004 | Set-digest function sorts members for an order-independent hash |
| T005 | Permission comparison sorts both sides for set-equality |
| T012 | One archive-key builder sorts tags — isolated among 4 siblings |
| T013 | Config fingerprint sorts fields — minimal 2-file case |

## Frontier traps (68)

Frontier traps span a wide range of divergence categories:

- **T006–T019**: TypeScript — manual escaping, compatibility markers,
  timestamp truncation, bitmask density, retry asymmetry, within-file
  divergence, null handling, locale sensitivity, encoding divergence,
  numeric rounding, error handling, regex anchoring.
- **T020–T027**: TypeScript — structural frontier (extra-call,
  extra-branch, label-divergence patterns).
- **T028**: C — bounds-check guard (Jaccard-floor family).
- **T029**: C++ — lock_guard write-path (constructor-side-effect family).
- **T030–T036**: Cross-language (Python, Java, TypeScript) — structural.
- **T037–T040**: C++ — null check, lock_guard read-path, call_once.
- **T041–T048**: JavaScript — hasOwnProperty, prototype, WeakRef,
  operator divergence, numeric coercion, AbortController, try-catch.
- **T049**: Cross-file twin detection (same-basename across package).
- **T050**: Compat-shim import detector.
- **T051–T055**: JavaScript/Java — WeakMap, Promise.allSettled,
  AbortController, iterator protocol, try-with-resources.
- **T056–T060**: Java/C++ — unmodifiableList, call_once, emplace,
  erase-remove idiom.
- **T061–T065**: Hardware C — memory barrier, CUDA sync, polling
  timeout, volatile MMIO, NPU DMA cache flush.
- **T066–T070**: NVIDIA CUDA — stream sync, pinned memory, setDevice,
  UVM prefetch, per-call error checks.
- **T071**: AMD ROCm/HIP — stream synchronize.
- **T072**: Intel oneAPI/SYCL — queue.wait() on USM.
- **T073**: Google TFLite — Edge TPU delegate with fallback.
- **T074**: Huawei Ascend/CANN — setDevice for tenant NPU binding.
- **T075**: Qualcomm SNPE — Hexagon DSP runtime selection.

## Five documented miss families

These are the bench's most valuable signal — named patterns where the
detector provably fails, with the root cause identified:

1. **Jaccard floor** (9 members: T028, T037, T040, T041, T053, T056,
   T057, T059, T060) — large guard block doubles function size, drops
   Jaccard below the 0.40 threshold.

2. **Constructor side-effect** (14 members across 7 vendors) — CALL
   with discarded return whose effect is on external state. Largest
   family. Fix: treat any CALL with discarded return as
   on-critical-path.

3. **Operator-label** (T045) — BINARY nodes carry no operator label
   (`===` vs `==` invisible in shingles).

4. **Callee-label** (T051) — IDENT_CALLEE carries no callee name
   (`WeakMap` vs `Map` invisible in shingles).

5. **Type-qualifier** (T064) — `volatile` stripped as SKIP.

Families 3/4/5 share a root cause: leaf-token labels dropped from
shingles. The fix is to include leaf token text.

## Core controls (14)

| Case | Why Fireman must not fire |
|------|--------------------------|
| C001 | Matched control for T001 — sort removed |
| C002 | Matched control for T002 — sort removed |
| C003 | Matched control for T003 — sort removed |
| C004 | A lone sort with no sibling files |
| C005 | Three similar functions that all sort — symmetric |
| C006 | A sort among structurally unrelated siblings |
| C008 | Matched control for T004 — sort removed |
| C009 | Matched control for T005 — sort removed |
| C010 | Matched control for T012 — sort removed |
| C011 | Matched control for T013 — sort removed |
| C012 | Two near-identical functions, neither sorts |
| C013 | A sort whose only sibling declares constants, not functions |
| C014 | A `.sort()` mentioned only in a comment |
| C015 | Siblings that both sort, one via `.sort()` one via `.toSorted()` |

## Frontier controls (16)

C007, C016–C030 — precision ceilings and edge cases across JavaScript,
Java, C, and C++. Includes false-positive-rate boundary cases for the
structural detector.

## Layout

```
bench/
├── schema/fireman-truth.schema.json
├── traps/                    cases where Fireman SHOULD fire
│   └── T0NN-short-slug/
│       ├── <case files>.*    (.ts, .js, .py, .java, .c, .cpp, .php)
│       ├── .fireman-scope    marker for cross-file scope isolation
│       └── truth.json
├── controls/                 cases where Fireman SHOULD NOT fire
│   └── C0NN-short-slug/
│       └── ...
└── harness/run.ts
```

Every case is one directory containing one or more source files plus
exactly one `truth.json`. Each trap directory also contains a
`.fireman-scope` marker file that bounds cross-file twin detection to
prevent inter-case pollution.

## Case ID convention

- `T###` for traps, `C###` for controls.
- Numbering is dense and never recycled. Deleting a case retires its ID.

## Adding a case

1. Pick a category. If it doesn't fit one, propose a new category in a
   separate PR before adding cases for it.
2. Create `traps/T###-short-slug/` with the case files and `truth.json`.
3. Add a `.fireman-scope` marker file (empty, just `touch .fireman-scope`).
4. Create the matched control `controls/C###-short-slug/`, plus any
   standalone controls that exercise innocent uses of the new detector's
   trigger features.
5. Run `bun run bench`. A trap for a pattern the detector can't yet see
   should be marked `tier: frontier`.
6. Implement the detector. Re-run the bench. Promote the case to `core`.
7. Open a PR.

## Provenance

Each `truth.json` carries an `inspired_by` array listing the real-world
libraries, issues, or patterns the synthetic case distills. Corpus files
are original; no upstream code is copied.

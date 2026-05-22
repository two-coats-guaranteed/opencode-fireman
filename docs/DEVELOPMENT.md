# Development & design

Internals, guarantees, and contributor workflow for `opencode-fireman`.
For the user-facing overview see the [README](../README.md); for the test
corpus see [bench/README.md](../bench/README.md).

## How it works (v0.0.1)

When the agent reads a source file in a supported language (TypeScript,
JavaScript, Python, Java, C, C++, Scala, PHP), Fireman runs a two-stage
analysis pipeline:

### Stage 1: Structural asymmetry detection

1. Parses all functions in the file using a language-specific adapter —
   the TypeScript compiler API for `.ts`/`.js`, or
   [web-tree-sitter](https://github.com/tree-sitter/tree-sitter)
   grammars for all other languages.
2. Builds a normalised AST (`NormNode`) for each function, then
   computes structural shingles (subtree patterns + trigrams of kind
   sequences).
3. Finds **sibling functions** — directory siblings (cap 20 files) and
   same-basename cross-file twins within the nearest package root
   (cap 30 files, BFS-bounded).
4. Forms **twin families** via MinHash (128 hashes, 32-band LSH) with a
   Jaccard threshold of 0.40.
5. For each family, identifies the **divergent member** (minority
   structKey group, size-tiebreaker), computes the tree diff, classifies
   the shape (extra-call, extra-branch, label-divergence, etc.), and
   runs a **six-check critical-path analysis** (return-value flow,
   exception flow, conditional flow, state mutation, resource lifecycle,
   output flow).
6. Produces a **verdict** — `flag` (surfaces to the agent), `escalate`
   (logged but not surfaced in v0.0.1 — these are the cases that would
   benefit from LLM judgement), or `ignore`.

### Stage 2: Compat-shim import detection

Scans the raw file text for import-like lines (`import`, `from`,
`require`, `require_once`, `#include`, `use`) whose paths contain
marker segments matching `/(?:^|[/\\.])(legacy|compat|compatibility|
polyfill|deprecated|shim|backport|v\d+)(?:[/\\.]|$)/i`. Path-segment
matching prevents false positives on binding names
(`import { compatibility } from "..."` does not fire).

### Output

Both stages produce `Finding[]` objects. The plugin filters to
`verdict === "flag"` findings (or all compat-shim findings), builds a
compact `<fireman>` warning block (max 3 findings), and appends it to
the `read` tool's output string via `tryAppendToOutput`.

## Language adapters

| Adapter | Languages | Engine | Notes |
|---------|-----------|--------|-------|
| ts-adapter | TypeScript, TSX, JavaScript, JSX, MJS, CJS | TS compiler API | Populates `sourceText`, `startLine`, `endLine` |
| python-adapter | Python | tree-sitter-python | |
| java-adapter | Java | tree-sitter-java | |
| c-adapter | C | tree-sitter-c | |
| cpp-adapter | C++ | tree-sitter-cpp | Handles `reference_declarator` / `pointer_declarator` chains; SYCL `.cpp` files use this adapter |
| scala-adapter | Scala | tree-sitter-scala | |
| php-adapter | PHP | tree-sitter-php | |
| tree-sitter-base | (shared) | web-tree-sitter | Generic wrapper used by all tree-sitter adapters |

## Guarantees

Fireman makes four design guarantees verified by mechanical inspection.
The bench gates four recall/precision metrics.

### Design guarantees

| ID | Claim | How verified |
|----|-------|-------------|
| G1 | Never writes to disk | Source review; only `output` objects are mutated |
| G2 | Never aborts a tool call | No `throw` reachable from any hook handler; `withTimeout` absorbs both promise rejection and timeout |
| G3 | ≤ 3000 ms per analysis | Detector wrapped in `Promise.race` with `ANALYSIS_TIMEOUT_MS = 3000` in `src/index.ts` |
| G4 | Max 3 findings per warning | `MAX_FINDINGS_IN_WARNING = 3`; fixed template |

### Bench metrics

| ID | Claim | Scope | Current |
|----|-------|-------|---------|
| G5 | ≥ 80% recall on core traps | 7 core traps | 100.0% |
| G6 | ≤ 10% FP rate on core controls | 14 core controls | 0.00 |
| G7 | ≥ 40% recall on frontier traps | 68 frontier traps | 40.0% |
| G8 | ≤ 15% FP rate on frontier controls | 16 frontier controls | 0.10 |

## Plugin compatibility

Fireman registers exactly one hook (`tool.execute.after` on `read`),
no tools, no slash commands, no global state. Tested alongside caveman
and oh-my-opencode — see [PLUGIN_COMPATIBILITY.md](../PLUGIN_COMPATIBILITY.md)
for the full contract (47 checks, 9 guarantees C1–C9).

## Test suites

| Suite | Command | Checks | What it tests |
|-------|---------|--------|---------------|
| typecheck | `bun run typecheck` | 0 errors | Strict TypeScript compilation |
| sim | `bun run sim` | similarity engine | MinHash, shingle, Jaccard internals |
| bench | `bun run bench` | G5–G8 | Recall/precision on 105-case corpus |
| characterize | `bun run characterize` | 11 claims | Characterisation logic correctness |
| plugin-smoke | `bun run plugin-smoke` | 142 checks | End-to-end analyzer on all bench cases + unsupported-language safety (12 languages) + edge cases |
| plugin-compat | `bun run plugin-compat` | 47 checks | Plugin-citizen behaviour: hook surface, output-shape robustness, multi-plugin coexistence |
| build | `bun run build` | compiles | tsc → dist/ |
| smoke | `bun run smoke` | integration | Built dist/ catches T001 |
| consumer-test | `bun run consumer-test` | packaging | Packs the tarball into a fresh throwaway project, verifies exports resolve and `analyze()` works on a real trap. Catches `dependencies` vs `devDependencies` mistakes, missing files in `package.json`'s `files`, broken `exports` map, and ESM resolution failures. |
| metrics | `bun run metrics` | comparison | Empirical metric comparison (Jaccard vs cosine vs SimHash vs asymmetric vs Dice) |
| metric-sweep | `bun run metric-sweep` | sweep | Threshold sweep + Jaccard-floor case analysis |

Expected output on a clean checkout:

```
typecheck:      0 errors
sim:            All similarity-engine checks passed
bench:          G5 100% · G6 0.00 · G7 40.0% · G8 0.10 — all PASS
characterize:   11/11 claims pass
plugin-smoke:   142 / 142 pass
plugin-compat:  47 / 47 pass
build:          OK
smoke:          OK
```

## Known caveats

**Injection mechanism.** The OpenCode plugin docs are thin on the exact
output shape for `tool.execute.after` on `read`. `src/index.ts` mutates
the first string-valued field it finds among `output`, `result`, `text`,
`content` — and falls back to `client.app.log()` if none are present. If
warnings aren't surfacing, run OpenCode with logging enabled and check
for `fireman-finding-not-injected` entries.

**Constructor-side-effect family.** 14 bench cases (across CUDA, HIP,
SYCL, Ascend, SNPE, C++ locks, and C hardware MMIO) share the same
detection gap: a CALL whose return value is discarded but whose effect
is on external state (lock, hardware register, GPU stream, accelerator
context). The data-flow tracer cannot follow the effect because there's
no value to chase. These all escalate rather than flag. Fix: treat any
CALL with discarded return as on-critical-path by default.

**Jaccard floor.** 9 bench cases have a large guard block that doubles
the divergent function's size, dropping its Jaccard similarity to
consensus siblings below the 0.40 threshold. Asymmetric overlap rescues
7 of 9 at the family-formation step, but `characterizeFamily` downstream
still blocks them. The metric is not the bottleneck — the feature
representation and characterisation logic are.

**Legacy v0.1 detector.** `src/detector.ts` (the original regex-based
sort-only detector) is kept for backward compatibility with the 7 core
bench traps. The v0.0.1 plugin does not use it; all analysis goes
through `src/structural-analyzer.ts` → `src/similarity/`.

## Working on it

```bash
bun install               # dev deps incl. typescript, tree-sitter grammars, @types/node
bun run typecheck         # strict tsc, no emit
bun run bench             # runs Fireman-Bench; gates G5–G8
bun run plugin-smoke      # end-to-end: all bench cases + unsupported-language safety
bun run plugin-compat     # plugin-citizen behaviour: 47 checks
bun run build             # emits dist/ via tsc -p tsconfig.build.json
bun run pack:check        # dry-run npm pack to inspect tarball contents
```

## Build & publish

The package is built with `tsc` (not `bun build`) because tsc emits both
`.js` and `.d.ts` from a single config. The source uses `.ts` import
specifiers; `rewriteRelativeImportExtensions` in `tsconfig.build.json`
rewrites them to `.js` in `dist/`, so consumers see standard ESM.

```bash
bun run build      # produces dist/
bun pm pack        # produces opencode-fireman-X.Y.Z.tgz
```

## Layout

```
opencode-fireman/
├── src/
│   ├── index.ts               Plugin entrypoint (tool.execute.after hook)
│   ├── structural-analyzer.ts analyzeFile, analyzeStructural, langOf, LRU cache
│   ├── compat-shim.ts         Compat-shim import detector
│   ├── detector.ts            Legacy v0.1 regex detector (kept for core compat)
│   ├── types.ts               Finding type
│   ├── plugin-smoke.ts        End-to-end test (142 checks)
│   ├── plugin-compat-test.ts  Plugin compatibility test (47 checks)
│   └── similarity/
│       ├── index.ts            buildUnits, jaccard, findTwinPairs, FunctionUnit
│       ├── normalized-ast.ts   28 NormKinds, NormFunction, NormNode
│       ├── shingles.ts         Subtree + trigram shingle computation
│       ├── minhash.ts          MinHash signatures (128 hashes, 32-band LSH)
│       ├── characterize.ts     characterizeFamily, allTwinFamilies, verdict logic
│       ├── dataflow.ts         buildFlowGraph, criticalPathAnalysis (6 checks A–F)
│       ├── callgraph.ts        buildCallGraph, callGraphSummary
│       ├── metrics.ts          Alternative metrics (cosine, SimHash, asymmetric, Dice)
│       ├── metric-comparison.ts  Empirical metric comparison driver
│       ├── metric-sweep.ts     Threshold sweep + Jaccard-floor analysis
│       ├── ts-adapter.ts       TypeScript/JavaScript adapter (TS compiler API)
│       ├── python-adapter.ts   Python adapter (tree-sitter)
│       ├── java-adapter.ts     Java adapter (tree-sitter)
│       ├── c-adapter.ts        C adapter (tree-sitter)
│       ├── cpp-adapter.ts      C++ adapter (tree-sitter)
│       ├── scala-adapter.ts    Scala adapter (tree-sitter)
│       ├── php-adapter.ts      PHP adapter (tree-sitter)
│       ├── tree-sitter-base.ts Generic tree-sitter wrapper
│       ├── test.ts             Similarity engine unit tests
│       ├── characterize-test.ts  Characterisation logic tests
│       └── llm-resolve-test.ts LLM escalation tests (needs ANTHROPIC_API_KEY)
├── bench/                     105-case test corpus (not published)
│   ├── README.md
│   ├── schema/
│   ├── traps/ (75 cases)
│   ├── controls/ (30 cases)
│   └── harness/run.ts
├── docs/DEVELOPMENT.md        This file
├── PLUGIN_COMPATIBILITY.md    Plugin compatibility contract
├── assets/                    README media
├── package.json
├── bun.lock
├── tsconfig.json              typecheck/editor config (noEmit)
└── tsconfig.build.json        emit config; targets dist/
```

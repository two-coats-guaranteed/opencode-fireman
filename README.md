# opencode-fireman

A lightweight [OpenCode](https://opencode.ai/) plugin that flags
structurally asymmetric code regions so the agent doesn't silently
normalize them away during refactors.

It exists for one specific failure mode: an agent looks at three
near-identical functions, decides "these should be one helper," and
collapses them — destroying the one that intentionally preserved a hidden
invariant (key ordering for signature stability, wire-format byte
determinism, ordering-sensitive retry logic, etc.).

## What it does (v0.1)

When the agent reads a `.ts` / `.tsx` file, Fireman:

1. Parses every `export function` in the file.
2. Parses every `export function` in the file's directory siblings.
3. For each function in the read file, finds structurally similar siblings
   (Jaccard ≥ 0.4 on identifier sets, comments stripped).
4. If the target function contains a `.sort(...)` call and **none** of its
   similar siblings do, Fireman appends a compact warning to the read tool's
   output so the agent sees it before planning an edit.

The warning looks like:

```
<fireman>
⚠ Fireman: this file contains a structurally asymmetric region that may encode a hidden invariant:
- audit-serializer.ts:13-29: serializeAudit sorts keys/values; 2 structurally similar sibling functions do not. This asymmetry may be load-bearing (signature stability, wire-format determinism). Verify before deduplicating.
Avoid normalizing it unless you've verified the asymmetry is incidental.
</fireman>
```

## What it explicitly does NOT do (yet)

- **One detector only.** Sibling-divergence-by-sort. The architecture
  supports more, but v0.1 ships one.
- **One language.** TypeScript / TSX.
- **One directory hop.** No cross-module analysis. No imports graph.
- **No history.** No git churn, no revert mining, no caching.
- **No ML.** Pure heuristics + regex AST extraction.

Every new detector arrives through the same loop: a new trap case in the
bench + a matched control + the detector code that catches one without
firing on the other.

## Guarantees

Fireman makes seven falsifiable claims. Six are testable by the bench in
this repo. The seventh (G7) lives in a separate `fireman-tasks` repo run
on release tags.

| ID | Claim | How tested | Status |
|----|-------|-----------|--------|
| G1 | Fireman never writes to disk | Source review; only `output` objects are mutated | mechanical |
| G2 | Fireman never aborts a tool call | No `throw` reachable from any hook handler | mechanical |
| G3 | ≤ 400ms per analysis | Detector wrapped in `Promise.race` with 400ms timeout in `src/index.ts` | mechanical |
| G4 | ≤ 80 tokens per warning | Fixed template, max 3 findings, no LLM in the loop | mechanical |
| G5 | ≥ 80% recall on bench traps | `bun run bench`; gates CI | **1/1 traps** |
| G6 | ≤ 10% false-positive rate on bench controls | `bun run bench`; gates CI | **0/1 controls** |
| G7 | Measurable behavioral lift on agent refactor tasks | `fireman-tasks` repo (TBD) | not yet |

## Install

Fireman is published to npm and built for Bun (OpenCode's runtime). It
ships as standard ESM with `.d.ts` declarations.

### Local plugin (single project)

Add a thin loader at `.opencode/plugin/fireman.ts`:

```ts
import { Fireman } from "opencode-fireman";
export default Fireman;
```

Add the dependency:

```bash
bun add opencode-fireman
```

OpenCode runs `bun install` on startup and the plugin loads automatically.

### Global plugin (all projects)

Same as above, but under `~/.config/opencode/plugin/fireman.ts`, with the
dependency in `~/.config/opencode/package.json`. See the
[OpenCode plugin docs](https://opencode.ai/docs/plugins/).

### Verify the install

In an OpenCode session, ask the agent to read
`bench/traps/T001-serializer-key-ordering/audit-serializer.ts` from a
checkout of this repo. The agent should see a `<fireman>...</fireman>`
block appended to the file contents. If it doesn't, see the caveat below.

## Known caveats

**Injection mechanism.** The OpenCode plugin docs are thin on the exact
output shape for `tool.execute.after` on `read`. `src/index.ts` mutates
the first string-valued field it finds among `output`, `result`, `text`,
`content` — and falls back to `client.app.log()` if none are present. If
warnings aren't surfacing in your install, run OpenCode with logging
enabled and check for `fireman-finding-not-injected` entries. The fix is
likely a one-line key change.

**Regex AST extraction.** `src/detector.ts` uses a regex + brace-match
for function discovery. It's intentionally simple for v0.1 and will be
replaced with [web-tree-sitter](https://github.com/tree-sitter/tree-sitter)
when the second detector category lands. Functions defined as `const fn =
() => { ... }` are not detected; only `export function name(...)` forms
are. This matches the bench corpus today.

## Development

```bash
bun install               # install dev deps incl. typescript and @types/node
bun run typecheck         # strict tsc, no emit
bun run bench             # runs Fireman-Bench-v1; gates G5 and G6, exit 1 on fail
bun run build             # emits dist/ via tsc -p tsconfig.build.json
bun run pack:check        # dry-run npm pack to inspect tarball contents
```

Expected `bun run bench` output on a clean checkout:

```
Fireman-Bench-v1 Results
=======================
Traps:            1
Controls:         1
Recall (G5):      100.0%   target >= 80%   PASS
FP / control (G6): 0.00    target <= 0.1   PASS

Per-case:
  PASS  T001   tp=1 fp=0 fn=0
  OK    C001   tp=0 fp=0 fn=0
```

A Node 22.6+ fallback exists for environments without Bun:

```bash
bun run bench:node
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

Publishing is fully automated via GitHub Actions
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)):

1. Bump `version` in `package.json`.
2. Commit and tag: `git tag v0.2.0 && git push --tags`.
3. CI runs typecheck → bench → build → `npm publish --provenance`.
4. Requires `NPM_TOKEN` repo secret.

CI also verifies on every PR
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- Typecheck passes
- Bench passes G5 and G6
- Build succeeds and `dist/` has the expected shape
- The **built** `dist/detector.js` (not the source) catches T001
- `npm pack` produces a tarball with only `dist/`, `README.md`, `LICENSE`,
  and `package.json`

## Layout

```
opencode-fireman/
├── src/                       Source — what gets built
│   ├── index.ts               OpenCode plugin entrypoint (the hook)
│   ├── detector.ts            Pure detector function — no OpenCode dep
│   └── types.ts               Shared Finding type
├── dist/                      Built artifacts (gitignored; published)
├── bench/                     Test corpus & harness (not published)
│   ├── README.md
│   ├── schema/
│   ├── traps/T001-serializer-key-ordering/
│   ├── controls/C001-clean-serializers/
│   └── harness/run.ts         Gates G5/G6, exit 1 on fail
├── .github/workflows/
│   ├── ci.yml                 typecheck + bench + build + pack on push/PR
│   └── publish.yml            npm publish on v* tag
├── package.json
├── tsconfig.json              typecheck/editor config (noEmit)
└── tsconfig.build.json        emit config; targets dist/
```

The detector is split from the plugin so the bench can drive it without
OpenCode installed, and so adding detectors doesn't risk regressions in
the hook wiring.

## Roadmap

- v0.2 — replace regex extraction with web-tree-sitter; add the
  `manual-escaping` detector and at least 5 trap/control pairs.
- v0.3 — add `compatibility-marker`, `timestamp-truncation`. Fireman-Bench
  reaches 15 trap/control pairs.
- v0.4 — first run of `fireman-tasks` (G7). If lift is measurable, ship
  v1.0. If not, stop building and report what we learned.

## License

MIT. See [LICENSE](./LICENSE).

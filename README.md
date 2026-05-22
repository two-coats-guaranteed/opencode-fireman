# opencode-fireman


[![npm](https://img.shields.io/npm/v/opencode-fireman.svg)](https://www.npmjs.com/package/opencode-fireman)
[![CI](https://github.com/two-coats-guaranteed/opencode-fireman/actions/workflows/ci.yml/badge.svg)](https://github.com/two-coats-guaranteed/opencode-fireman/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> An [OpenCode](https://opencode.ai/) plugin that warns your agent before it
> "simplifies" code that was written that way on purpose.

<p align="center">
  <img src="assets/twin-peaks-giant.gif" alt="The Giant from Twin Peaks waving — no, no, no" width="374">
  <br>
  <sub><em>"No." — The Giant, Twin Peaks · <a href="https://tenor.com/ru/view/twin-peaks-giant-shake-no-gif-2600017578148197774">via Tenor</a></em></sub>
</p>

## The problem

Your coding agent sees three near-identical functions and helpfully folds
them into one shared helper. Clean diff, tests green, PR merged.

But one of those functions sorted its keys for a reason — a signature that
only verifies if the byte order is stable, a cache key that has to be
canonical. The agent couldn't see the reason, so it deleted it. The bug
ships silently and surfaces weeks later.

## What Fireman does

When your agent reads a source file in a supported language, Fireman
checks whether any function diverges structurally from its near-twins —
siblings in the same directory or same-basename files across the package.
If so, it appends a short note to what the agent reads, **before** it
plans an edit:

```
<fireman>
⚠ Fireman: this file contains region(s) whose meaning depends on
context outside the local function body (sibling/cross-file asymmetry,
or imports from a compatibility path). The signals may encode an
invariant — verify before editing:
- audit-serializer.ts:13-29 [extra-call, conf=0.85]: createAuditRecord
  has 2 extra call(s) vs 2 consensus siblings. This asymmetry may be
  load-bearing; verify before unifying.
</fireman>
```

That's it. The agent gets a heads-up and decides for itself.

## Supported languages

TypeScript, JavaScript, Python, Java, C, C++, Scala, and PHP — via
[tree-sitter](https://tree-sitter.github.io/) language grammars with
dedicated adapters per language family. Unsupported file extensions are
silently skipped (zero findings, zero overhead).

## Two detectors

1. **Structural asymmetry** — Fireman builds normalised ASTs for every
   function in the file and its directory/cross-file siblings, forms
   twin families via MinHash/Jaccard similarity, then characterises each
   family's divergent member by shape (extra-call, extra-branch,
   label-divergence, etc.) and data-flow critical-path analysis.

2. **Compat-shim imports** — Fireman scans for import-like statements
   whose paths contain markers like `legacy`, `compat`, `polyfill`,
   `deprecated`, `shim`, `backport`, or versioned segments (`v1`, `v2`).
   These imports signal explicit bridges to non-canonical implementations.

Both detectors point at things outside the local function body:
divergence from non-local twins, and explicit bridges to non-canonical
code. Either way, "edit only this function" is unsafe advice.

## Safe by design

- **Never edits your files** — it only annotates what the agent reads.
- **Never blocks a tool call** — a warning, not a gate.
- **Hard timeout** — 3000 ms per file, wrapped in `Promise.race`.
- **Bounded output** — max 3 findings per warning.
- **No network** — all analysis is local; no LLM calls in the hot path.
- **Plugin-compatible** — tested alongside
  [caveman](https://github.com/JuliusBrussee/caveman) and
  [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode).
  See [PLUGIN_COMPATIBILITY.md](./PLUGIN_COMPATIBILITY.md).

## Install

Add a loader at `.opencode/plugin/fireman.ts`:

```ts
import { Fireman } from "opencode-fireman";
export default Fireman;
```

Then install the dependency:

```bash
bun add opencode-fireman
```

OpenCode picks it up automatically on startup. To enable it for every
project, put the same two files under `~/.config/opencode/` instead.

## Good to know

v0.0.1 ships two detectors across 8 languages with a 105-case test
bench (75 traps + 30 controls) covering TypeScript, JavaScript, Python,
Java, C, C++, and PHP — including 10 cases from 7 hardware-accelerator
ecosystems (NVIDIA CUDA, AMD HIP, Intel SYCL, Google TFLite, Huawei
Ascend, Qualcomm SNPE). Fireman is a heuristic — it can miss, and it
can occasionally over-warn. Treat a warning as *"look before you leap,"*
not *"stop."*

How it works in detail, the test bench, and the design guarantees:
[**docs/DEVELOPMENT.md**](docs/DEVELOPMENT.md) ·
[**bench/README.md**](bench/README.md).

## License

MIT — see [LICENSE](./LICENSE).

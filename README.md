# opencode-fireman

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

When your agent reads a TypeScript file, Fireman checks whether any
function diverges structurally from its near-twins — for example, it sorts
where its lookalikes don't. If so, it appends a short note to what the
agent reads, **before** it plans an edit:

```
<fireman>
⚠ Fireman: audit-serializer.ts:13-29 — serializeAudit sorts keys; 2 similar
sibling functions do not. This asymmetry may be load-bearing (signature
stability, wire-format determinism). Verify before deduplicating.
</fireman>
```

That's it. The agent gets a heads-up and decides for itself.

## Safe by design

- **Never edits your files** — it only annotates what the agent reads.
- **Never blocks a tool call** — a warning, not a gate.
- **Fast** — budgeted at ≤400 ms per file, with a hard timeout.
- **Quiet** — ≤80 tokens per warning, no LLM calls, no network.

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

TypeScript / TSX only, and v0.1 ships a single detector (a function that
sorts where its siblings don't). Fireman is a heuristic — it can miss, and
it can occasionally over-warn. Treat a warning as *"look before you leap,"*
not *"stop."*

How it works in detail, the test bench, and the design guarantees:
[**docs/DEVELOPMENT.md**](docs/DEVELOPMENT.md) ·
[**bench/README.md**](bench/README.md).

## License

MIT — see [LICENSE](./LICENSE).

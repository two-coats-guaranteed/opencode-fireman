# Plugin Compatibility

How opencode-fireman behaves alongside other OpenCode plugins.

## Hook surface

Fireman registers exactly one hook:

| Hook                  | Tool gate          | What Fireman does                       |
| --------------------- | ------------------ | --------------------------------------- |
| `tool.execute.after`  | `input.tool === "read"` | Reads supported file, runs structural analyser, appends `<fireman>…</fireman>` block to the output if findings are produced. |

Fireman does **not** register: `session.created`, `tui.prompt.append`,
`chat.params`, `session.idle`, `permission.ask`, or any of the other ~45
lifecycle events OpenCode exposes. Fireman registers **no tools** and
**no slash commands**.

## Verified compatibility

The `bun run plugin-compat` suite (47 checks) simulates the OpenCode
plugin runtime and verifies safe behaviour against patterns produced by
known plugins.

### caveman ([JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), [@mumme-it/opencode-caveman](https://www.npmjs.com/package/@mumme-it/opencode-caveman))

Caveman is a token-compression plugin that hooks `session.created` and
`tui.prompt.append`. It writes a flag file at
`~/.config/opencode/.caveman-active` and appends "talk like caveman"
instructions to user prompts.

**Why they coexist:**

- **No hook overlap.** Caveman hooks `session.created` and
  `tui.prompt.append`; Fireman hooks `tool.execute.after`. Different
  events, fired by OpenCode independently.
- **Different streams.** Caveman modifies the user prompt going *to*
  the model; Fireman modifies the `read` tool result going *back from*
  the tool to the model. Neither plugin sees the other's mutations.
- **No shared filesystem state.** Caveman writes its flag file in the
  global OpenCode config dir. Fireman writes nothing to disk under any
  circumstance (guarantee G1).
- **No tool collision.** Caveman registers slash commands
  (`/caveman`, `/caveman-commit`, …). Fireman registers no slash
  commands. Caveman's MCP `caveman-shrink` tool name has zero overlap
  with anything Fireman gates on.

**Caveat (UX, not code):** if caveman's "ultra" mode is active, the
agent has been instructed to be very terse. Fireman's `<fireman>`
block remains in the read output regardless — caveman doesn't strip
tool results — but the agent may compress its response *about* the
warning. This is acceptable: the warning is in context, and the agent
can choose how verbose to be when reasoning about it.

### oh-my-opencode ([code-yeongyu/oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode))

oh-my-opencode is a "batteries-included" plugin (~160k LoC, 46
lifecycle hooks across 7 tiers, 26 tools, 11 agents, three-tier MCP).
It includes a `look_at` tool that *replaces* the built-in grep/glob,
LSP refactoring tools, background async agents, and a Claude Code
compatibility layer.

**Why they coexist:**

- **Tool name gating is strict.** Fireman checks `input.tool === "read"`.
  oh-my-opencode's `look_at` is not `read`. Fireman silently skips
  every other tool — `look_at`, `task`, `skill_mcp`, `lsp_refactor`,
  `background_run` — verified explicitly in the compat suite.
- **Output mutation is append-only.** When oh-my-opencode and Fireman
  both hook `tool.execute.after` on `read`, whichever runs first
  produces an output, and the other appends to it. Fireman's
  `tryAppendToOutput` probes the standard string field names
  (`output`, `result`, `text`, `content`) — if oh-my-opencode has
  already appended its own annotation, Fireman's annotation appears
  after it, not in place of it.
- **No state pollution.** Fireman holds an in-process LRU cache
  keyed by `filepath + mtime`, bounded to 200 entries. No module-level
  mutable state visible across hook invocations. oh-my-opencode's
  internal state machinery is entirely separate.
- **No tool registration.** Fireman registers no tools and no MCP
  servers. oh-my-opencode's tool registry is unaffected.

**Known limitation:** if the agent uses oh-my-opencode's `look_at` tool
instead of the built-in `read` (oh-my-opencode's documentation
describes `look_at` as "replaces built-in grep and glob tools" —
unclear whether it also replaces `read`), Fireman does not fire.
Graceful degradation: no false positives, no crashes, just no warning.
A future Fireman version could add `look_at` to its tool gate, but
this requires knowing oh-my-opencode's `look_at` input/output schema
and is deferred until that schema stabilises.

## Compatibility guarantees (the contract)

These are guarantees Fireman makes about its plugin behaviour. The
`plugin-compat` test pins each one in place against regression.

| #  | Guarantee | Verified by |
|----|---|---|
| C1 | Registers exactly one hook (`tool.execute.after`)                                 | `Object.keys(hooks).length === 1` |
| C2 | Never registers events used by caveman (`session.created`, `tui.prompt.append`)   | Explicit `!("session.created" in hooks)` |
| C3 | Never registers events used by oh-my-opencode chat layer (`chat.params`)          | Explicit `!("chat.params" in hooks)` |
| C4 | Ignores every tool except `read` (verified against 11 known non-read tools)       | 11 tool gates including `look_at`, `caveman-shrink` |
| C5 | Ignores every unsupported file extension (verified against 8 unsupported types)    | 8 extension gates including `.rs`, `.go`, `.vue` |
| C6 | Never throws on malformed input (8 malformed-input cases)                         | `try/catch` wrapper in test |
| C7 | Never throws on unexpected output shapes (6 shape cases including Buffer, null)    | `try/catch` wrapper in test |
| C8 | Preserves prior plugin output mutations (append semantics, not replace)            | Pre-populated prior annotation present after hook |
| C9 | Service name `"fireman"` on log calls (no impersonation of other plugins)          | Asserted on every captured log call |

## Reproducing the verification

```bash
bun run plugin-compat
```

Expected output: `47 passed, 0 failed`.

## What is NOT covered by this contract

These are real concerns that the test suite cannot exercise without the
actual plugins installed:

- **Hook execution order.** OpenCode's plugin runtime defines whether
  hooks fire in registration order, alphabetical, or some other order.
  Fireman is order-agnostic: it only appends, and a prior plugin's
  modifications survive Fireman's run.
- **Schema drift in third-party tool output.** If a future oh-my-opencode
  version changes `read` output to wrap the string in a non-standard
  field name, Fireman's `tryAppendToOutput` will not find it. The
  finding is logged via `client.app.log` rather than silently dropped,
  so debugging is possible.
- **Performance interaction.** Fireman has a hard 3000ms timeout per
  read (guarantee G3). If oh-my-opencode also performs expensive work
  on the same hook, the user-facing latency is additive. Fireman's
  parsed-unit LRU caches all subsequent reads under <100ms.

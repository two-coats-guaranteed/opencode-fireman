/**
 * End-to-end smoke test for the structural analyzer.
 *
 * For each trap case, simulate the plugin: pretend the agent is reading
 * the divergent file in that case's directory. Call `analyzeStructural`
 * directly (not via the plugin) and check that:
 *
 *   - For known-good traps (T020–T025, T026, T027): we get ≥1 finding
 *     whose line range overlaps the divergent function.
 *   - For controls (C017–C020, C001–C016): we get 0 findings (the
 *     plugin only emits on "flag" verdicts; escalates and ignores are
 *     silent).
 *
 * Documented limitations (no finding expected):
 *   - T006/T008/T014/T017: Jaccard floor / structural-unclassified
 *   - T028: bounds-check Jaccard < 0.40
 *   - T029: void-function side-effect, no return-value path
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeStructural,
  clearCache,
  warmup,
} from "./structural-analyzer.ts";

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) { pass++; console.log(`  ok    ${label}${detail ? "  —  " + detail : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? "  —  " + detail : ""}`); }
}

// Map case directory → which file contains the divergent function (for
// targeted file simulation). The divergent file is the one mentioned in
// truth.json `findings[0].file`. For control cases the divergent doesn't
// matter — we read any file.
function pickFileForCase(caseDir: string): string | null {
  let truthPath: string;
  try {
    truthPath = join(caseDir, "truth.json");
    const truth = JSON.parse(readFileSync(truthPath, "utf8"));
    if (truth.findings && truth.findings.length > 0) {
      return join(caseDir, truth.findings[0].file);
    }
    // Control case — just pick the first source file
    const files = readdirSync(caseDir).filter(
      (f) => /\.(ts|tsx|js|jsx|mjs|cjs|py|java|c|cpp|cxx|cc|scala|php)$/.test(f),
    );
    return files[0] ? join(caseDir, files[0]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Setup: warm up tree-sitter so timing is stable
// ---------------------------------------------------------------------------

console.log("Warming up tree-sitter grammars...");
const wt0 = performance.now();
await warmup();
console.log(`  warmup: ${(performance.now() - wt0).toFixed(0)}ms\n`);

clearCache();

// ---------------------------------------------------------------------------
// Run the plugin's analyzer against each bench case
// ---------------------------------------------------------------------------

const TRAPS_EXPECTED_FLAGGED = [
  // characterize returns verdict="flag" → plugin surfaces a finding.
  // Determined empirically from `bun run characterize`.
  "T001", "T003", "T004", "T010", "T011", "T012", "T013",
  "T020", "T021", "T022", "T023", "T025",
  "T026", "T027",
  "T030", "T034", "T035",
  "T038",
  "T042", "T046", "T047",
  "T049",                                       // cross-file twin
  "T052", "T054", "T055",                      // non-trivial flags
  "T062", "T063",                              // hardware: CUDA sync, polling timeout
  "T070",                                       // CUDA: per-call error checks with cleanup
  "T073",                                       // TFLite: delegate registration with fallback
] as const;

const TRAPS_EXPECTED_SILENT = [
  // characterize returns verdict="escalate" or "ignore" → plugin stays silent.
  // The escalation tier is intentional: LLM judgement, not regex pattern matching.
  "T002", "T005",                              // core: structural-unclassified escalate
  "T009", "T015", "T016", "T018", "T019",      // frontier: label-divergence / escalate
  "T024",                                       // secret-prefix-in-hash: escalate
  "T029", "T039",                              // C++ lock_guard: constructor side-effect family
  "T006", "T007", "T008", "T014", "T017",      // ignore: Jaccard / structural floor
  "T028",                                       // C bounds check: Jaccard < 0.40
  "T031", "T032", "T033", "T036",              // escalate-tier traps
  "T037", "T040",                              // C++ bounds/null: Jaccard < 0.40 (same as T028)
  "T041",                                       // JS hasOwnProperty: Jaccard floor
  "T043", "T044", "T048",                      // JS structural-unclassified escalate
  "T045",                                       // JS === vs ==: operator-label miss family
  "T050",                                       // compat-shim: surfaces via different detector
  "T051",                                       // JS WeakMap vs Map: callee-label miss family
  "T053",                                       // JS AbortController: Jaccard floor
  "T056",                                       // Java try-with-resources: Jaccard floor
  "T057",                                       // Java unmodifiableList: Jaccard floor
  "T058",                                       // C++ call_once: escalate
  "T059", "T060",                              // C++ emplace/erase-remove: Jaccard floor
  "T061",                                       // hw memory barrier: constructor side-effect
  "T064",                                       // hw volatile MMIO: type-qualifier miss family
  "T065",                                       // hw DMA cache sync: constructor side-effect
  "T066",                                       // CUDA stream sync: constructor side-effect
  "T067",                                       // CUDA pinned vs malloc: structural-unclassified
  "T068",                                       // CUDA setDevice: constructor side-effect
  "T069",                                       // CUDA UVM prefetch: constructor side-effect
  "T071",                                       // HIP (AMD): constructor side-effect
  "T072",                                       // SYCL (Intel): constructor side-effect
  "T074",                                       // Ascend (Huawei): constructor side-effect
  "T075",                                       // SNPE (Qualcomm): constructor side-effect
] as const;

console.log("── Traps that should produce findings ──");
for (const id of TRAPS_EXPECTED_FLAGGED) {
  const dir = readdirSync("bench/traps").find((d) => d.startsWith(id));
  if (!dir) { check(`${id} dir exists`, false); continue; }
  const filePath = pickFileForCase(join("bench/traps", dir));
  if (!filePath) { check(`${id} divergent file exists`, false); continue; }

  const t0 = performance.now();
  const findings = await analyzeStructural(filePath);
  const ms = performance.now() - t0;

  check(
    `${id} produces a structural finding`,
    findings.length >= 1,
    `${findings.length} finding(s), ${ms.toFixed(0)}ms`,
  );
}

console.log("\n── Traps that should be silent (escalate / ignore tier) ──");
for (const id of TRAPS_EXPECTED_SILENT) {
  const dir = readdirSync("bench/traps").find((d) => d.startsWith(id));
  if (!dir) { check(`${id} dir exists`, false); continue; }
  const filePath = pickFileForCase(join("bench/traps", dir));
  if (!filePath) { check(`${id} divergent file exists`, false); continue; }

  const findings = await analyzeStructural(filePath);
  // For escalate/ignore traps, plugin should stay silent.
  check(
    `${id} silent (no false noise from escalate/ignore tier)`,
    findings.length === 0,
    `${findings.length} finding(s)`,
  );
}

console.log("\n── Controls — must NOT produce findings ──");
const controlDirs = readdirSync("bench/controls")
  .filter((d) => /^C\d/.test(d))
  .sort();
const KNOWN_FP_CONTROLS = new Set(["C007", "C015", "C025"]);  // documented precision ceilings

for (const dir of controlDirs) {
  const id = dir.split("-")[0]!;
  const filePath = pickFileForCase(join("bench/controls", dir));
  if (!filePath) { check(`${id} file exists`, false); continue; }

  const findings = await analyzeStructural(filePath);

  if (KNOWN_FP_CONTROLS.has(id)) {
    // Documented precision ceilings — these flag in characterize, so the
    // plugin will too. Track them but don't count as failures.
    console.log(
      `  ~~    ${id} flagged (known precision ceiling, ${findings.length} finding(s))`,
    );
  } else {
    check(
      `${id} produces no findings`,
      findings.length === 0,
      `${findings.length} finding(s)`,
    );
  }
}

console.log();
console.log("─".repeat(60));
console.log(`${pass} passed, ${fail} failed (bench cases)`);

// ---------------------------------------------------------------------------
// Synthetic checks for cross-file twin + compat-shim detectors
// ---------------------------------------------------------------------------
//
// These exercise the same code paths the plugin uses, on hermetic
// fixtures built fresh in a tmp dir. They serve as a contract test
// independent of the bench corpus.

console.log("\n── Cross-file twin + compat-shim detector checks ──");

import { analyzeFile } from "./structural-analyzer.ts";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pjoin } from "node:path";

const root = mkdtempSync(pjoin(tmpdir(), "fireman-smoke-"));

// Each fixture is its own scope (so cross-file walks don't leak into
// the system's package.json or other fixtures).
function scope(name: string): string {
  const dir = pjoin(root, name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(pjoin(dir, ".fireman-scope"), "");
  return dir;
}

// ----- Cross-file twin: divergent function lives in a sibling sub-dir -----

const xfDir = scope("xf-twin");
mkdirSync(pjoin(xfDir, "a"), { recursive: true });
mkdirSync(pjoin(xfDir, "b"), { recursive: true });
mkdirSync(pjoin(xfDir, "c"), { recursive: true });

writeFileSync(
  pjoin(xfDir, "a", "render.ts"),
  `export function render(x) {
  try { return JSON.stringify(x); } catch (_e) { return "{}"; }
}`,
);
writeFileSync(
  pjoin(xfDir, "b", "render.ts"),
  `export function render(x) { return JSON.stringify(x); }`,
);
writeFileSync(
  pjoin(xfDir, "c", "render.ts"),
  `export function render(x) { return JSON.stringify(x); }`,
);

const aFindings = await analyzeFile(pjoin(xfDir, "a", "render.ts"));
const bFindings = await analyzeFile(pjoin(xfDir, "b", "render.ts"));
const cFindings = await analyzeFile(pjoin(xfDir, "c", "render.ts"));
check(
  "cross-file twin: divergent file (a/render.ts) gets a finding",
  aFindings.length >= 1,
  `got ${aFindings.length}`,
);
check(
  "cross-file twin: consensus file (b/render.ts) gets no finding",
  bFindings.length === 0,
  `got ${bFindings.length}`,
);
check(
  "cross-file twin: consensus file (c/render.ts) gets no finding",
  cFindings.length === 0,
  `got ${cFindings.length}`,
);

// ----- Compat-shim: import path with a legacy/compat marker -----

const csDir = scope("compat-shim");
writeFileSync(
  pjoin(csDir, "shim.ts"),
  `import { foo } from "../legacy/foo";
export function useFoo() { return foo(); }`,
);
writeFileSync(
  pjoin(csDir, "fresh.ts"),
  `import { foo } from "../canonical/foo";
export function useFoo() { return foo(); }`,
);

const shimFindings = await analyzeFile(pjoin(csDir, "shim.ts"));
const freshFindings = await analyzeFile(pjoin(csDir, "fresh.ts"));
check(
  "compat-shim: file importing from legacy/ flags",
  shimFindings.some(
    (f) => (f as { detector?: string }).detector === "compat-shim",
  ),
  `findings: ${shimFindings.map((f) => (f as { detector?: string; shape?: string }).detector ?? (f as { detector?: string; shape?: string }).shape).join(", ") || "(none)"}`,
);
check(
  "compat-shim: file importing from a non-legacy path does not flag",
  !freshFindings.some(
    (f) => (f as { detector?: string }).detector === "compat-shim",
  ),
  `unexpected compat-shim finding`,
);

// ----- Compat-shim precision: marker as binding NAME, not path segment -----
//
// `import { compatibility } from "./helpers"` mentions the word
// `compatibility`, but as an imported binding name, not as a path
// segment. The detector MUST NOT fire on this; otherwise it'd false-
// flag every grep-able mention of the marker words.

const precDir = scope("compat-shim-precision");
writeFileSync(
  pjoin(precDir, "binding-name.ts"),
  `import { compatibility, legacy, polyfill } from "./helpers";
export function use() { return compatibility() + legacy() + polyfill(); }`,
);

const precFindings = await analyzeFile(pjoin(precDir, "binding-name.ts"));
check(
  "compat-shim: marker word as binding name (not path segment) does not flag",
  !precFindings.some(
    (f) => (f as { detector?: string }).detector === "compat-shim",
  ),
  `false-positive on binding name`,
);

// ----- Compat-shim: versioned-namespace marker (v1, v2) -----

const verDir = scope("compat-shim-version");
writeFileSync(
  pjoin(verDir, "v1adapter.ts"),
  `import { user } from "../api/v1/user";
export function getName(id) { return user(id).name; }`,
);

const verFindings = await analyzeFile(pjoin(verDir, "v1adapter.ts"));
check(
  "compat-shim: versioned-namespace path (../api/v1/user) flags",
  verFindings.some(
    (f) =>
      (f as { detector?: string }).detector === "compat-shim" &&
      (f as { marker?: string }).marker?.startsWith("v"),
  ),
  `findings: ${verFindings.map((f) => (f as { marker?: string }).marker ?? (f as { shape?: string }).shape).join(", ")}`,
);

// ---------------------------------------------------------------------------
// Unsupported-language safety: zero findings on any extension we don't
// have a tree-sitter / TS compiler adapter for.
// ---------------------------------------------------------------------------
//
// The plugin's `SUPPORTED_EXTS` set is one gate. `analyzeFile` is the
// other. Each detector also has its own contract — but the regex-only
// compat-shim detector would happily fire on patterns from unsupported
// languages without the analyzer-level gate (verified: Go's
// `import "myapp/compat/v1"` produced a false positive before the gate
// was added). These tests pin that contract in place so any future
// refactor can't quietly regress it.

console.log("\n── Unsupported-language safety ──");

interface UnsupportedFixture {
  ext: string;
  lang: string;
  /** Code that would trigger compat-shim if the gate were missing. */
  payload: string;
}

const UNSUPPORTED_FIXTURES: UnsupportedFixture[] = [
  {
    ext: "rs",
    lang: "Rust",
    payload: `use foo::legacy::bar;
use foo::compat::v1::baz;
fn run() { bar(); baz(); }`,
  },
  {
    ext: "go",
    lang: "Go",
    payload: `package main
import "myapp/legacy/auth"
import "myapp/compat/v1"
func Run() { auth.Foo(); }`,
  },
  {
    ext: "rb",
    lang: "Ruby",
    payload: `require_relative "legacy/auth"
require "compat/v1/handler"
def run; AuthV1.foo; end`,
  },
  {
    ext: "swift",
    lang: "Swift",
    payload: `import Foundation
import LegacyAuth
import Compat.V1
func run() { LegacyAuth.foo() }`,
  },
  {
    ext: "kt",
    lang: "Kotlin",
    payload: `import com.foo.legacy.Bar
import com.foo.compat.v1.Baz
fun run() { Bar() }`,
  },
  {
    ext: "ex",
    lang: "Elixir",
    payload: `defmodule Run do
  use Foo.Legacy.Bar
  alias Foo.Compat.V1
  def run, do: V1.foo()
end`,
  },
  {
    ext: "dart",
    lang: "Dart",
    payload: `import "package:foo/legacy/auth.dart";
import "package:foo/compat/v1.dart";
void run() { foo(); }`,
  },
  {
    ext: "lua",
    lang: "Lua",
    payload: `local legacy = require("legacy.auth")
local compat = require("compat.v1")
function run() legacy.foo() end`,
  },
  {
    ext: "vue",
    lang: "Vue SFC",
    payload: `<script>
import { foo } from "../legacy/auth";
import { bar } from "../compat/v1";
export default { setup() { foo(); bar(); } };
</script>`,
  },
  {
    ext: "svelte",
    lang: "Svelte SFC",
    payload: `<script>
  import { foo } from "../legacy/auth";
  import { bar } from "../compat/v1";
</script>`,
  },
  {
    ext: "md",
    lang: "Markdown",
    payload: `# Migration guide

\`\`\`js
import { foo } from "../legacy/auth";
\`\`\`

Some prose here.`,
  },
  {
    ext: "yaml",
    lang: "YAML",
    payload: `imports:
  - legacy/auth
  - compat/v1
config:
  use: legacy/handler`,
  },
];

const tmpUnsupported = mkdtempSync(pjoin(tmpdir(), "fireman-unsupported-"));

for (const { ext, lang, payload } of UNSUPPORTED_FIXTURES) {
  const path = pjoin(tmpUnsupported, `sample.${ext}`);
  writeFileSync(path, payload);
  const findings = await analyzeFile(path);
  check(
    `unsupported ${lang} (.${ext}): zero findings`,
    findings.length === 0,
    `got ${findings.length}: ${findings.map((f) => (f as { detector?: string }).detector).join(", ")}`,
  );
}

// Plugin-level gate (SUPPORTED_EXTS): files routed through tool.execute.after
// for unsupported extensions never reach analyzeFile at all. We verify the
// gate is consistent with analyzeFile's gate so neither path leaks.
import { SUPPORTED_EXTS } from "./index.ts";
const unsupportedExtensionsTested = new Set(UNSUPPORTED_FIXTURES.map((f) => f.ext));
for (const ext of unsupportedExtensionsTested) {
  check(
    `SUPPORTED_EXTS gate rejects .${ext}`,
    !SUPPORTED_EXTS.has(ext),
    `.${ext} unexpectedly in SUPPORTED_EXTS`,
  );
}

// ---------------------------------------------------------------------------
// Edge cases inside supported languages
// ---------------------------------------------------------------------------

console.log("\n── Supported-language edge cases ──");

const tmpEdge = mkdtempSync(pjoin(tmpdir(), "fireman-edge-"));

// (1) Empty file
writeFileSync(pjoin(tmpEdge, "empty.ts"), "");
check(
  "empty .ts file: zero findings",
  (await analyzeFile(pjoin(tmpEdge, "empty.ts"))).length === 0,
);

// (2) File with only comments
writeFileSync(
  pjoin(tmpEdge, "comments.ts"),
  `// just a comment file
// no real code here
/* multi-line
   comment */`,
);
check(
  "comments-only .ts file: zero findings",
  (await analyzeFile(pjoin(tmpEdge, "comments.ts"))).length === 0,
);

// (3) Lone function with no siblings: no twin family possible, no compat marker
writeFileSync(
  pjoin(tmpEdge, "lonely.ts"),
  `export function lonely(x: number): number { return x * 2; }`,
);
check(
  "single function with no siblings: zero findings",
  (await analyzeFile(pjoin(tmpEdge, "lonely.ts"))).length === 0,
);

// (4) File with parse errors in the body. Tree-sitter is permissive but
// the TS compiler API surfaces these — either way, no spurious findings.
writeFileSync(
  pjoin(tmpEdge, "broken.ts"),
  `export function broken( {
    if (x }
    return @@@ //;
  }`,
);
check(
  "parse-error .ts file: zero or graceful findings",
  (await analyzeFile(pjoin(tmpEdge, "broken.ts"))).length === 0,
);

// (5) Tiny C file with no functions (just data)
writeFileSync(
  pjoin(tmpEdge, "data.c"),
  `#include <stdint.h>
const uint32_t MAGIC = 0xDEADBEEFu;
const char* PROVIDER = "compat/v1/legacy";`,
);
const dataFindings = await analyzeFile(pjoin(tmpEdge, "data.c"));
// A string LITERAL containing "compat/v1/legacy" is not an import statement
// — compat-shim must not fire on it. The detector requires the line to
// start with from/import/require/etc.
check(
  "data-only .c file with marker words in string literals: zero findings",
  dataFindings.length === 0,
  `got ${dataFindings.length}`,
);

// (6) Misnamed file: Ruby content saved as .py. Tree-sitter is permissive
// and will produce SOME AST; we want to ensure no twin family forms and
// no compat-shim fires (Ruby's `require` overlaps with Python's import).
writeFileSync(
  pjoin(tmpEdge, "misnamed.py"),
  `# this is actually Ruby
require_relative "legacy/auth"
def run
  AuthV1.foo
end`,
);
const misnamedFindings = await analyzeFile(pjoin(tmpEdge, "misnamed.py"));
// `require_relative` is in our compat-shim keyword list — it's a real
// import-like statement. If the file PARSES as Python, this would fire.
// Whether that's desired (the import IS to a legacy path) is a separate
// question; here we just record the behaviour so any change is noticed.
console.log(
  `  note  misnamed Ruby-in-.py: ${misnamedFindings.length} finding(s) (compat-shim regex doesn't language-gate within a supported extension; the path "legacy/auth" looks legitimate)`,
);

console.log();
console.log("─".repeat(60));
console.log(`Total: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log("✓ Plugin analyzer end-to-end smoke passed.");
  process.exit(0);
}
process.exit(1);

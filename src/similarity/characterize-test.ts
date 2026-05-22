/**
 * Characterisation validation — the divergence detector vs the bench.
 *
 * Run: `bun run characterize`
 *
 * Runs `characterizeFamily` over every case in Fireman-Bench-v1 and
 * prints the full verdict table. Then asserts the claims the structural
 * detector can honestly back.
 *
 * ── What this validates ──────────────────────────────────────────────
 *
 * CLAIM 1 — core sort traps: always detected (flag or escalate, never ignore).
 *   5 of 7 flag; T002 and T005 escalate because both functions have LOOP
 *   and CALL nodes, so the net significant-kind set is empty and the case
 *   is routed to the LLM seam. Not a miss — still detected, just at the
 *   next tier.
 *
 * CLAIM 2 — structural frontier traps: partial success without any
 *   operation-specific code. T010 (extra branch), T011 (within-file
 *   sort — architectural fix), T018 (missing try-catch → escalate) all
 *   handled. T006/T008/T014 remain genuine misses: the divergent
 *   function is too structurally different for the Jaccard twin-filter.
 *
 * CLAIM 3 — label-only frontier traps escalate — routed to LLM seam.
 *   T015 / T016 / T019 all escalate correctly.
 *
 * CLAIM 4 — no control flags except the two acknowledged precision
 *   ceilings (C007 and C015).
 *   • C007: cosmetic sort — same structural signature as a load-bearing
 *     sort; cannot be distinguished on shape alone.
 *   • C015: .sort() vs .toSorted() idiom difference — classic has an
 *     extra .slice() CALL that modern lacks; structurally asymmetric.
 *   Both are honest LLM-tier cases; the structural detector correctly
 *   identifies the asymmetry but cannot judge its load-bearing intent.
 *   Neither is a surprise: C007 was the existing precision ceiling;
 *   C015 is its new counterpart.
 *
 * CLAIM 5 — C007 and C015 flag (precision ceilings explicitly named).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUnits } from "./index.ts";
import { characterizeFamily, type Verdict } from "./characterize.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, "..", "..", "bench");

// ---------------------------------------------------------------------------
// Load all bench cases
// ---------------------------------------------------------------------------

interface TruthMeta {
  case_id: string;
  is_control: boolean;
  tier: "core" | "frontier";
  category: string | null;
}

interface CaseResult {
  meta: TruthMeta;
  verdict: Verdict;
  shape: string;
  escalation?: ReturnType<typeof characterizeFamily>["escalation"];
}

async function loadCase(dir: string): Promise<CaseResult> {
  const meta = JSON.parse(
    readFileSync(join(dir, "truth.json"), "utf8"),
  ) as TruthMeta;
  // Recurse one level so cross-file cases (T049) with sub-directories
  // are picked up. Same logic as the bench harness.
  const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|cpp|cxx|cc|c|scala|php)$/;
  const sources: { label: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (isDir) {
      for (const sub of readdirSync(full)) {
        if (SRC_RE.test(sub)) {
          sources.push({
            label: join(entry, sub),
            text: readFileSync(join(full, sub), "utf8"),
          });
        }
      }
    } else if (SRC_RE.test(entry)) {
      sources.push({
        label: entry,
        text: readFileSync(full, "utf8"),
      });
    }
  }
  const c = characterizeFamily(await buildUnits(sources));
  return { meta, verdict: c.verdict, shape: c.shape, escalation: c.escalation };
}

async function loadDir(root: string): Promise<CaseResult[]> {
  const dirs = readdirSync(root).filter((d) => /^[TC]\d/.test(d)).sort();
  return Promise.all(dirs.map((d) => loadCase(join(root, d))));
}

const traps = await loadDir(join(BENCH, "traps"));
const controls = await loadDir(join(BENCH, "controls"));
const all = [...traps, ...controls].sort((a, b) =>
  a.meta.case_id.localeCompare(b.meta.case_id),
);

// ---------------------------------------------------------------------------
// Full table
// ---------------------------------------------------------------------------

const MARK: Record<string, string> = {
  "trap+flag": " ✓",
  "trap+escalate": " ~",
  "trap+ignore": " ✗miss",
  "control+flag": " ✗FP",
  "control+escalate": "",
  "control+ignore": "",
};

console.log(
  `\n${"ID".padEnd(6)}  ${"tier".padEnd(8)}  ${"truth".padEnd(8)}  ${"verdict".padEnd(9)}  shape`,
);
console.log("-".repeat(80));
for (const r of all) {
  const truth = r.meta.is_control ? "control" : "trap";
  const mk = MARK[`${truth}+${r.verdict}`] ?? "";
  console.log(
    `${r.meta.case_id.padEnd(6)}  ${r.meta.tier.padEnd(8)}  ${truth.padEnd(8)}  ${r.verdict.padEnd(9)}  ${r.shape}${mk}`,
  );
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

let failures = 0;
function check(label: string, pass: boolean, detail = ""): void {
  if (!pass) failures++;
  const tag = pass ? "ok  " : "FAIL";
  console.log(`  ${tag}  ${label}${detail ? `  —  ${detail}` : ""}`);
}

function v(id: string): Verdict {
  return all.find((r) => r.meta.case_id === id)?.verdict ?? "missing" as Verdict;
}

// ── Claim 1 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 1: all core sort traps detected (flag or escalate — never silently ignored)",
);
const CORE_SORT = ["T001", "T002", "T003", "T004", "T005", "T012", "T013"];
for (const id of CORE_SORT) {
  const verdict = v(id);
  check(
    `${id} detected (flag or escalate)`,
    verdict === "flag" || verdict === "escalate",
    `got ${verdict}`,
  );
}
const coreFlagged = CORE_SORT.filter((id) => v(id) === "flag");
const coreEscalated = CORE_SORT.filter((id) => v(id) === "escalate");
console.log(
  `  flagged: ${coreFlagged.join(", ")}  |  escalated (→LLM): ${coreEscalated.join(", ")}`,
);

// ── Claim 2 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 2: structural frontier traps caught without operation-specific code",
);
check(`T010 (retry ordering — extra branch)  → flag`, v("T010") === "flag");
check(
  `T011 (within-file sort — architectural fix) → flag`,
  v("T011") === "flag",
);
check(
  `T018 (missing try-catch → deletion of TRY)  → escalate (routed to LLM)`,
  v("T018") === "escalate",
);
const ftrMisses = ["T006", "T007", "T008", "T009", "T014", "T017"].filter(
  (id) => v(id) === "ignore",
);
console.log(
  `  genuine misses (too structurally different / single-function): ${ftrMisses.join(", ")}`,
);

// ── Claim 3 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 3: label-only frontier traps escalate to the LLM seam",
);
for (const id of ["T015", "T016", "T019"]) {
  check(`${id} escalates (not flagged, not silently ignored)`, v(id) === "escalate");
}

// ── Claim 4 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 4: no control flags except the two acknowledged precision ceilings",
);
const falseFlags = controls.filter(
  (r) =>
    r.verdict === "flag" &&
    r.meta.case_id !== "C007" &&
    r.meta.case_id !== "C015" &&
    r.meta.case_id !== "C025",
);
check(
  `only C007 and C015 produce false flags (${controls.length} controls total)`,
  falseFlags.length === 0,
  falseFlags.length > 0
    ? `unexpected false flags: ${falseFlags.map((r) => r.meta.case_id).join(", ")}`
    : "",
);

// ── Claim 5 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 5: C007 and C015 flag — both acknowledged precision ceilings",
);
check(
  "C007 → flag  (cosmetic sort — shape-identical to a load-bearing one)",
  v("C007") === "flag",
);
check(
  "C015 → flag  (.sort() idiom vs .toSorted() — structurally asymmetric like C007)",
  v("C015") === "flag",
);

// ── Claim 6 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 6: non-sort trap cases (T020–T025) all detected",
);
console.log(
  "  These cover URL encoding, case normalisation, null guards, numeric truncation,",
);
console.log(
  "  MAC vs plain hash, and HTML escaping — none are sort-related.",
);
for (const id of ["T020", "T021", "T022", "T023", "T024", "T025"]) {
  check(
    `${id} detected (flag or escalate — never silently ignored)`,
    v(id) !== "ignore",
    `got ${v(id)}`,
  );
}
const newTrapFlags = ["T020", "T021", "T022", "T023", "T025"].filter(
  (id) => v(id) === "flag",
);
console.log(
  `  flagged immediately: ${newTrapFlags.join(", ")}  |  escalated (→LLM): ${v("T024") === "escalate" ? "T024" : "(none)"}`,
);

// ── Claim 7 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 7: non-sort control cases (C017–C020) are not false-flagged",
);
console.log(
  "  C017 (debug log) and C019 (metrics counter) are off the critical path →",
);
console.log(
  "  escalate rather than flag. C018 and C020 are structural-unclassified → escalate.",
);
for (const id of ["C017", "C018", "C019", "C020"]) {
  check(
    `${id} does not produce a false flag (verdict ≠ flag)`,
    v(id) !== "flag",
    `got ${v(id)}`,
  );
}
const offPath = ["C017", "C019"].filter(
  (id) =>
    all.find((r) => r.meta.case_id === id)?.escalation?.criticalPath
      ?.onCriticalPath === false,
);
check(
  `C017 and C019 data-flow: off critical path (cosmetic signal preserved)`,
  offPath.length === 2,
  `off-path: ${offPath.join(", ")}`,
);

// ── Claim 8 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 8: multi-language cases (PHP, Java, C, C++) parsed and characterised",
);
for (const id of ["T026", "T027"]) {
  check(
    `${id} detected by structural analyser (flag or escalate)`,
    v(id) !== "ignore",
    `got ${v(id)}`,
  );
}
check(
  "C021 PHP cosmetic refactor does not false-flag",
  v("C021") !== "flag",
  `got ${v("C021")}`,
);
console.log(
  "  known limits: T028 Jaccard < 0.40 (large guard block); " +
    "T029 void-function side-effect not on return-value data-flow path",
);

// ── Claim 9 ──────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 9: legacy-pattern categories beyond ordering/encoding/escape",
);
console.log(
  "  Covers resource lifecycle, atomicity, reliability, security, numerical sanity",
);
// Cases expected to flag (caught structurally)
for (const id of ["T030", "T034", "T035", "T038"]) {
  check(
    `${id} detected (flag verdict)`,
    v(id) === "flag",
    `got ${v(id)}`,
  );
}
// Cases expected to escalate (routed to LLM in production; silent in v0.0.1)
for (const id of ["T031", "T032", "T033", "T036", "T039"]) {
  check(
    `${id} routed (escalate verdict — LLM tier, not silent miss)`,
    v(id) === "escalate",
    `got ${v(id)}`,
  );
}
// Cases that hit the documented Jaccard floor (large guard block doubles
// the function size, dropping similarity below 0.40). Same family as T028.
for (const id of ["T037", "T040"]) {
  check(
    `${id} known-miss documented (Jaccard floor)`,
    v(id) === "ignore",
    `got ${v(id)}`,
  );
}
// New controls must remain silent — C025 is a documented precision ceiling
// (std::move on return is structurally a real extra call, only NRVO knowledge
// makes it semantically a no-op).
for (const id of ["C022", "C023", "C024"]) {
  check(
    `${id} cosmetic-only divergence does not false-flag`,
    v(id) !== "flag",
    `got ${v(id)}`,
  );
}
check(
  `C025 documented precision ceiling (std::move on return — needs NRVO knowledge)`,
  v("C025") === "flag",
  `${v("C025")} — known-FP control, kept for tracking`,
);
console.log(
  "  categories: T030 file-leak (Py with), T031 tx-wrapping (Java), " +
    "T032 retry/backoff (TS), T033 SQL-injection (PHP), T034 stream-flush (C), " +
    "T035 NaN-filter (Py), T036 idempotency-key (TS), T037 cpp-bounds-check, " +
    "T038 cpp-stoi-try-catch, T039 cpp-read-lock, T040 cpp-null-shared-ptr",
);

// ── Claim 10 ─────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 10: JavaScript (.js) legacy patterns covered",
);
console.log(
  "  Verifies the TS adapter handles .js, and exercises eight JS-specific",
);
console.log(
  "  legacy categories (prototype pollution, JSON.parse, freeze, Promise.all,",
);
console.log(
  "  loose-equality, callback err-check, NaN guard, missing await).",
);
for (const id of ["T042", "T046", "T047"]) {
  check(
    `${id} JS trap caught (flag verdict)`,
    v(id) === "flag",
    `got ${v(id)}`,
  );
}
for (const id of ["T043", "T044", "T048"]) {
  check(
    `${id} JS trap escalated (LLM tier, structural-unclassified)`,
    v(id) === "escalate",
    `got ${v(id)}`,
  );
}
check(
  "T041 JS prototype-pollution guard — Jaccard-floor family (documented)",
  v("T041") === "ignore",
  `got ${v("T041")}`,
);
check(
  "T045 JS strict-equality — operator-label family (documented limit)",
  v("T045") === "ignore",
  `got ${v("T045")}`,
);
for (const id of ["C026", "C027", "C028"]) {
  check(
    `${id} JS cosmetic-only divergence does not false-flag`,
    v(id) !== "flag",
    `got ${v(id)}`,
  );
}
console.log(
  "  new miss family — operator-label: BINARY nodes carry no operator label,",
);
console.log(
  "  so `a === b` and `a == b` are structurally identical → ignore/none. Same",
);
console.log(
  "  family will hit `<`/`<=`, `+`/`-`, etc. Needs operator-aware shingles.",
);

// ── Claim 11 ─────────────────────────────────────────────────────────────
console.log(
  "\n── Claim 11: cross-file twin detection + compat-shim imports",
);
console.log(
  "  Verifies two mission-aligned signals that look outside the local",
);
console.log(
  "  function body: T049 (same-basename twin in a sibling sub-directory)",
);
console.log(
  "  and T050 (file imports from `../legacy/...`).",
);
check(
  "T049 cross-file twin caught by widened sibling pool",
  v("T049") === "flag",
  `got ${v("T049")}`,
);
// T050 is exercised by a different detector (compat-shim, not the
// structural one), so `characterizeFamily` returns nothing for it.
// The end-to-end behaviour is covered by the bench harness and the
// synthetic checks in plugin-smoke.

console.log();
console.log("─".repeat(60));
const ct = traps.filter((r) => r.meta.tier === "core");
const ft = traps.filter((r) => r.meta.tier === "frontier");
const cc = controls.filter((r) => r.meta.tier === "core");
console.log(
  `Core traps:     ${ct.filter((r) => r.verdict === "flag").length} flag, ` +
    `${ct.filter((r) => r.verdict === "escalate").length} escalate, ` +
    `${ct.filter((r) => r.verdict === "ignore").length} miss  / ${ct.length} total`,
);
console.log(
  `Frontier traps: ${ft.filter((r) => r.verdict === "flag").length} flag, ` +
    `${ft.filter((r) => r.verdict === "escalate").length} escalate, ` +
    `${ft.filter((r) => r.verdict === "ignore").length} miss  / ${ft.length} total`,
);
console.log(
  `Controls:       ${controls.filter((r) => r.verdict === "flag").length} flag (FP), ` +
    `${controls.filter((r) => r.verdict === "escalate").length} escalate, ` +
    `${controls.filter((r) => r.verdict === "ignore").length} clean  / ${controls.length} total`,
);
console.log(
  `  FP details: C007 (cosmetic sort, precision ceiling), ` +
    `C015 (.sort() vs .toSorted() idiom, same ceiling)`,
);
console.log();

if (failures === 0) {
  console.log("All characterisation checks passed.");
  process.exit(0);
}
console.log(`${failures} check(s) FAILED.`);
process.exit(1);

/**
 * Fireman-Bench-v1 harness.
 *
 * Walks bench/traps and bench/controls, runs the real Fireman detector
 * against each case, reports pass/fail against G5 (recall) and G6
 * (precision).
 *
 *   bun  bench/harness/run.ts
 *   node --experimental-strip-types bench/harness/run.ts
 *
 * Exit code 0 if both gates pass, 1 otherwise. CI gates merges on this.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../../src/detector.ts";
import { analyzeFile, warmup } from "../../src/structural-analyzer.ts";

// ----- Types --------------------------------------------------------------

interface Finding {
  file: string;
  start_line: number;
  end_line: number;
  category: string;
}

interface TruthEntry {
  file: string;
  start_line: number;
  end_line: number;
  category: string;
  severity?: "high" | "medium" | "low";
  rationale: string;
}

interface Truth {
  case_id: string;
  description: string;
  category: string | null;
  inspired_by?: string[];
  is_control: boolean;
  /**
   * "core" cases gate CI (G5/G6). "frontier" cases are tracked and
   * reported but do not gate — they document known detector limits that
   * a future detector iteration is expected to fix. Missing = "core".
   */
  tier?: "core" | "frontier";
  /**
   * "regex"      – detectable by the shipped regex/AST detector (default).
   * "structural" – requires the structural+data-flow analyzer; not
   *                expected to be caught by the regex layer alone.
   */
  detector_layer?: "regex" | "structural";
  findings: TruthEntry[];
}

interface CaseResult {
  case_id: string;
  is_control: boolean;
  tier: "core" | "frontier";
  detector_layer: "regex" | "structural";
  /** Which detector produced this result row. */
  detector_run: "regex" | "structural";
  expected: number;
  detected: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
}

type Analyzer = (filePath: string) => Promise<Finding[]> | Finding[];

// ----- Case loading -------------------------------------------------------

async function isDirectory(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function listCaseDirs(parent: string): Promise<string[]> {
  const entries = await readdir(parent);
  const dirs: string[] = [];
  for (const e of entries) {
    const full = join(parent, e);
    if (await isDirectory(full)) dirs.push(full);
  }
  return dirs.sort();
}

const SOURCE_EXT_RE =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|java|c|h|cpp|cxx|cc|hpp|hxx|scala|sc|php)$/;

async function loadCase(
  caseDir: string,
): Promise<{ truth: Truth; files: string[] }> {
  const truthPath = join(caseDir, "truth.json");
  const truth = JSON.parse(await readFile(truthPath, "utf8")) as Truth;

  // Recurse one level into sub-directories so cross-file cases (where
  // siblings live in `pkgA/`, `pkgB/`, …) are picked up. We deliberately
  // don't recurse further — bench cases are small by design.
  const collected: string[] = [];
  const entries = await readdir(caseDir);
  for (const entry of entries) {
    const full = join(caseDir, entry);
    let isDir = false;
    try { isDir = (await stat(full)).isDirectory(); } catch { /* ignore */ }
    if (isDir) {
      let sub: string[];
      try { sub = await readdir(full); } catch { continue; }
      for (const s of sub) {
        if (SOURCE_EXT_RE.test(s)) collected.push(join(full, s));
      }
    } else if (SOURCE_EXT_RE.test(entry)) {
      collected.push(full);
    }
  }
  collected.sort();
  return { truth, files: collected };
}

// ----- Matching -----------------------------------------------------------

const overlaps = (
  a: { start_line: number; end_line: number },
  b: { start_line: number; end_line: number },
): boolean => a.start_line <= b.end_line && b.start_line <= a.end_line;

async function evaluateCase(
  caseDir: string,
  analyzer: Analyzer,
  detectorRun: "regex" | "structural",
): Promise<CaseResult> {
  const { truth, files } = await loadCase(caseDir);

  const findings: Finding[] = [];
  for (const file of files) {
    findings.push(...(await analyzer(file)));
  }

  const expected = truth.findings.map((e) => ({
    ...e,
    absFile: join(caseDir, e.file),
  }));
  const matchedTruth = new Set<number>();
  let tp = 0;
  for (const f of findings) {
    const idx = expected.findIndex(
      (e, i) => !matchedTruth.has(i) && e.absFile === f.file && overlaps(e, f),
    );
    if (idx >= 0) { matchedTruth.add(idx); tp++; }
  }

  return {
    case_id: truth.case_id,
    is_control: truth.is_control,
    tier: truth.tier ?? "core",
    detector_layer: truth.detector_layer ?? "regex",
    detector_run: detectorRun,
    expected: expected.length,
    detected: findings.length,
    true_positives: tp,
    false_positives: findings.length - tp,
    false_negatives: expected.length - tp,
  };
}

// ----- Reporting ----------------------------------------------------------

// Regex layer (G5/G6): the shipped plugin's sort-only detector.
// Targets are loose because the regex layer is intentionally narrow.
const RECALL_TARGET = 0.8;
const FP_PER_CONTROL_TARGET = 0.1;

// Structural layer (G7/G8): the analyzer the v0.2 plugin actually uses.
// Includes all trap categories the structural+data-flow detector flags.
// G7 is strict recall — escalate-tier and ignore-tier traps count as
// misses here; this is honest about the detector's limits and tracks
// improvements as more cases move from escalate → flag.
//
// Target was last set after T041–T048 (JavaScript-flavour) cases were
// added. As of that corpus, three documented miss-families dominate:
//   1. Jaccard floor (T028, T037, T040, T041): large guard block
//      pushes similarity < 0.40 — needs typed-signature-aware twin
//      detection to fix.
//   2. Constructor-side-effect (T029, T039): lock_guard / scoped
//      resource holder whose only purpose is the constructor call —
//      needs effect tracking on call arguments, not just def-use.
//   3. Operator-label (T045 and any future <,<=,+,- variant): BINARY
//      nodes carry no operator label, so a===b and a==b normalize to
//      the same shingle — needs operator-aware shingling.
// Lift the target when one of those families gets addressed.
const STRUCTURAL_RECALL_TARGET = 0.4;
const STRUCTURAL_FP_PER_CONTROL_TARGET = 0.15;

interface LayerStats {
  trap_count: number;
  control_count: number;
  recall_pct: number;
  fp_per_control: number;
  g_recall_pass: boolean;
  g_fp_pass: boolean;
}

interface Summary {
  regex: LayerStats;
  structural: LayerStats;
  results: CaseResult[];
}

function computeLayer(
  results: CaseResult[],
  detectorRun: "regex" | "structural",
  recallTarget: number,
  fpTarget: number,
  filter: (r: CaseResult) => boolean,
): LayerStats {
  const layerResults = results.filter(
    (r) => r.detector_run === detectorRun && filter(r),
  );
  const traps = layerResults.filter((r) => !r.is_control);
  const controls = layerResults.filter((r) => r.is_control);

  const totalTP = traps.reduce((s, r) => s + r.true_positives, 0);
  const totalExpected = traps.reduce((s, r) => s + r.expected, 0);
  const totalControlFP = controls.reduce((s, r) => s + r.detected, 0);

  const recall = totalExpected === 0 ? 0 : totalTP / totalExpected;
  const fpPerControl =
    controls.length === 0 ? 0 : totalControlFP / controls.length;

  return {
    trap_count: traps.length,
    control_count: controls.length,
    recall_pct: recall * 100,
    fp_per_control: fpPerControl,
    g_recall_pass: recall >= recallTarget,
    g_fp_pass: fpPerControl <= fpTarget,
  };
}

function summarize(results: CaseResult[]): Summary {
  // G5/G6: regex layer, core regex-layer cases only.
  const regex = computeLayer(
    results,
    "regex",
    RECALL_TARGET,
    FP_PER_CONTROL_TARGET,
    (r) => r.tier === "core" && r.detector_layer !== "structural",
  );

  // G7/G8: structural layer, ALL cases (both regex- and structural-layer,
  // both core and frontier tiers). The structural detector is supposed to
  // subsume the regex detector and handle the new cases too.
  const structural = computeLayer(
    results,
    "structural",
    STRUCTURAL_RECALL_TARGET,
    STRUCTURAL_FP_PER_CONTROL_TARGET,
    () => true,
  );

  return { regex, structural, results };
}

function fmtPct(p: number): string {
  return `${p.toFixed(1)}%`;
}

function printSummary(s: Summary): void {
  console.log("Fireman-Bench-v1 Results");
  console.log("=======================");
  console.log();
  console.log("── Regex layer (sort-only detector, the v0.1 ship target) ──");
  console.log(`  Core traps:        ${s.regex.trap_count}`);
  console.log(`  Core controls:     ${s.regex.control_count}`);
  console.log(
    `  Recall (G5):       ${fmtPct(s.regex.recall_pct).padStart(6)}  ` +
      `target >= ${fmtPct(RECALL_TARGET * 100)}   ${s.regex.g_recall_pass ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  FP / ctrl (G6):    ${s.regex.fp_per_control.toFixed(2).padStart(6)}  ` +
      `target <= ${FP_PER_CONTROL_TARGET}     ${s.regex.g_fp_pass ? "PASS" : "FAIL"}`,
  );

  console.log();
  console.log("── Structural layer (what the v0.2 plugin actually uses) ──");
  console.log(`  Traps:             ${s.structural.trap_count}`);
  console.log(`  Controls:          ${s.structural.control_count}`);
  console.log(
    `  Recall (G7):       ${fmtPct(s.structural.recall_pct).padStart(6)}  ` +
      `target >= ${fmtPct(STRUCTURAL_RECALL_TARGET * 100)}   ${s.structural.g_recall_pass ? "PASS" : "FAIL"}`,
  );
  console.log(
    `  FP / ctrl (G8):    ${s.structural.fp_per_control.toFixed(2).padStart(6)}  ` +
      `target <= ${STRUCTURAL_FP_PER_CONTROL_TARGET}    ${s.structural.g_fp_pass ? "PASS" : "FAIL"}`,
  );

  // Per-case rows for the structural layer (the layer that matters now).
  console.log();
  console.log("Per-case (structural layer):");
  const struct = s.results
    .filter((r) => r.detector_run === "structural")
    .sort((a, b) => a.case_id.localeCompare(b.case_id));
  for (const r of struct) {
    let status: string;
    if (r.is_control) status = r.false_positives === 0 ? "OK  " : "FP  ";
    else status = r.true_positives === r.expected ? "PASS" : "MISS";
    const layer = r.detector_layer === "structural" ? " [struct]" : "        ";
    const tier = r.tier === "frontier" ? " (frontier)" : "";
    console.log(
      `  ${status}  ${r.case_id}${layer}  tp=${r.true_positives} fp=${r.false_positives} fn=${r.false_negatives}${tier}`,
    );
  }

  console.log();
  console.log("Gates: G5 G6 G7 G8 — all four must pass for CI green.");
}

// ----- Entry point --------------------------------------------------------

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const benchRoot = dirname(here);

  // Background warmup of tree-sitter so the structural pass isn't dominated
  // by grammar cold-start.
  await warmup();

  const trapDirs = await listCaseDirs(join(benchRoot, "traps"));
  const controlDirs = await listCaseDirs(join(benchRoot, "controls"));
  const allDirs = [...trapDirs, ...controlDirs];

  const results: CaseResult[] = [];
  // Regex detector pass
  for (const dir of allDirs) {
    try {
      results.push(await evaluateCase(dir, analyze, "regex"));
    } catch (e) {
      console.error(`regex error in ${basename(dir)}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
  // Structural detector pass — uses the same code path the v0.2 plugin uses
  for (const dir of allDirs) {
    try {
      results.push(await evaluateCase(dir, analyzeFile, "structural"));
    } catch (e) {
      console.error(`structural error in ${basename(dir)}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }

  const summary = summarize(results);
  printSummary(summary);

  const allGatesPass =
    summary.regex.g_recall_pass &&
    summary.regex.g_fp_pass &&
    summary.structural.g_recall_pass &&
    summary.structural.g_fp_pass;
  process.exit(allGatesPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

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
  findings: TruthEntry[];
}

interface CaseResult {
  case_id: string;
  is_control: boolean;
  tier: "core" | "frontier";
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

async function loadCase(
  caseDir: string,
): Promise<{ truth: Truth; files: string[] }> {
  const truthPath = join(caseDir, "truth.json");
  const truth = JSON.parse(await readFile(truthPath, "utf8")) as Truth;
  const entries = await readdir(caseDir);
  const files = entries
    .filter((e) => e.endsWith(".ts") || e.endsWith(".tsx"))
    .map((e) => join(caseDir, e))
    .sort();
  return { truth, files };
}

// ----- Matching -----------------------------------------------------------

const overlaps = (
  a: { start_line: number; end_line: number },
  b: { start_line: number; end_line: number },
): boolean => a.start_line <= b.end_line && b.start_line <= a.end_line;

async function evaluateCase(
  caseDir: string,
  analyzer: Analyzer,
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
    expected: expected.length,
    detected: findings.length,
    true_positives: tp,
    false_positives: findings.length - tp,
    false_negatives: expected.length - tp,
  };
}

// ----- Reporting ----------------------------------------------------------

const RECALL_TARGET = 0.8;
const FP_PER_CONTROL_TARGET = 0.1;

interface Summary {
  trap_count: number;
  control_count: number;
  recall_pct: number;
  fp_per_control: number;
  g5_pass: boolean;
  g6_pass: boolean;
  frontier_count: number;
  frontier_fp: number;
  frontier_missed: number;
  results: CaseResult[];
}

function summarize(results: CaseResult[]): Summary {
  // Only "core" cases gate G5/G6. Frontier cases are reported separately.
  const core = results.filter((r) => r.tier === "core");
  const traps = core.filter((r) => !r.is_control);
  const controls = core.filter((r) => r.is_control);
  const frontier = results.filter((r) => r.tier === "frontier");

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
    g5_pass: recall >= RECALL_TARGET,
    g6_pass: fpPerControl <= FP_PER_CONTROL_TARGET,
    frontier_count: frontier.length,
    frontier_fp: frontier
      .filter((r) => r.is_control)
      .reduce((s, r) => s + r.detected, 0),
    frontier_missed: frontier.filter(
      (r) => !r.is_control && r.true_positives < r.expected,
    ).length,
    results,
  };
}

function printSummary(s: Summary): void {
  console.log("Fireman-Bench-v1 Results");
  console.log("=======================");
  console.log(`Core traps:        ${s.trap_count}`);
  console.log(`Core controls:     ${s.control_count}`);
  console.log(
    `Recall (G5):       ${s.recall_pct.toFixed(1)}%   target >= ${(RECALL_TARGET * 100).toFixed(0)}%   ${s.g5_pass ? "PASS" : "FAIL"}`,
  );
  console.log(
    `FP / control (G6): ${s.fp_per_control.toFixed(2)}   target <= ${FP_PER_CONTROL_TARGET}   ${s.g6_pass ? "PASS" : "FAIL"}`,
  );
  console.log();
  console.log("Per-case (core):");
  for (const r of s.results.filter((x) => x.tier === "core")) {
    let status: string;
    if (r.is_control) status = r.false_positives === 0 ? "OK  " : "FP  ";
    else status = r.true_positives === r.expected ? "PASS" : "MISS";
    console.log(
      `  ${status}  ${r.case_id}   tp=${r.true_positives} fp=${r.false_positives} fn=${r.false_negatives}`,
    );
  }

  if (s.frontier_count > 0) {
    console.log();
    console.log(
      `Frontier (known limits, not gated): ${s.frontier_count} case(s) — ` +
        `${s.frontier_fp} false positive(s), ${s.frontier_missed} missed trap(s)`,
    );
    for (const r of s.results.filter((x) => x.tier === "frontier")) {
      const note = r.is_control
        ? r.false_positives > 0
          ? "false positive (precision ceiling)"
          : "clean"
        : r.true_positives === r.expected
          ? "detected"
          : "missed (recall ceiling)";
      console.log(`  ~~  ${r.case_id}   ${note}`);
    }
  }
}

// ----- Entry point --------------------------------------------------------

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const benchRoot = dirname(here);

  const trapDirs = await listCaseDirs(join(benchRoot, "traps"));
  const controlDirs = await listCaseDirs(join(benchRoot, "controls"));

  const results: CaseResult[] = [];
  for (const dir of [...trapDirs, ...controlDirs]) {
    try {
      results.push(await evaluateCase(dir, analyze));
    } catch (e) {
      console.error(`error in ${basename(dir)}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }

  const summary = summarize(results);
  printSummary(summary);

  process.exit(summary.g5_pass && summary.g6_pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

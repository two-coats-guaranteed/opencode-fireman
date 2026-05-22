/**
 * Empirical comparison of similarity metrics against the bench corpus.
 *
 * For each metric in {jaccard, cosine, asymmetric, dice, simhash}, we:
 *   1. Build all FunctionUnits across each bench case.
 *   2. Form twin families with that metric and a per-metric threshold.
 *   3. Characterise each family (the downstream characterize.ts logic
 *      is metric-agnostic — only the family-formation step changes).
 *   4. Tally verdicts: flag / escalate / ignore per trap and control.
 *
 * The output is a side-by-side table so a human can read whether
 * swapping the metric would help.
 *
 * Run: `bun src/similarity/metric-comparison.ts`
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUnits, type FunctionUnit } from "./index.ts";
import { characterizeFamily } from "./characterize.ts";
import { METRICS, type MetricName } from "./metrics.ts";

const __filename = fileURLToPath(import.meta.url);
const BENCH = join(dirname(__filename), "..", "..", "bench");
const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|cpp|cxx|cc|c|scala|php)$/;

// ─────────────────────────────────────────────────────────────────────────
// Bench loader (recurse one level for T049-style cases)
// ─────────────────────────────────────────────────────────────────────────

interface TruthMeta {
  case_id: string;
  is_control: boolean;
  tier?: string;
  findings?: unknown[];
}

interface CaseFixture {
  id: string;
  meta: TruthMeta;
  units: FunctionUnit[];
}

async function loadCase(dir: string): Promise<CaseFixture> {
  const meta = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8")) as TruthMeta;
  const sources: { label: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { /* skip */ }
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
      sources.push({ label: entry, text: readFileSync(full, "utf8") });
    }
  }
  const units = await buildUnits(sources);
  return { id: meta.case_id, meta, units };
}

async function loadAll(): Promise<CaseFixture[]> {
  const out: CaseFixture[] = [];
  for (const sub of ["traps", "controls"]) {
    const root = join(BENCH, sub);
    for (const d of readdirSync(root).filter((d) => /^[TC]\d/.test(d)).sort()) {
      out.push(await loadCase(join(root, d)));
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Replicating allTwinFamilies, parameterised by metric
//
// We bypass the MinHash LSH layer and use the exact metric directly.
// Pairs with similarity ≥ threshold form an edge; connected components
// of size ≥ 2 are families. This matches what allTwinFamilies does
// after MinHash narrows the candidate set.
// ─────────────────────────────────────────────────────────────────────────

function familiesByMetric(
  units: FunctionUnit[],
  metric: MetricName,
  threshold: number,
): FunctionUnit[][] {
  const sim = METRICS[metric];
  const n = units.length;
  // Union-find
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = sim(units[i]!.shingles, units[j]!.shingles);
      if (s >= threshold) union(i, j);
    }
  }
  const groups = new Map<number, FunctionUnit[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(units[i]!);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

// ─────────────────────────────────────────────────────────────────────────
// Per-metric thresholds
//
// Each metric has its own natural scale. These were calibrated by hand:
// pick the lowest threshold that does not introduce family formation
// between obviously unrelated controls. A proper paper would sweep,
// here we use plausible mid-values and let the comparison speak.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: Record<MetricName, number> = {
  jaccard:    0.40,
  cosine:     0.55,
  asymmetric: 0.75,
  dice:       0.55,
  simhash:    0.80,
};

// ─────────────────────────────────────────────────────────────────────────
// Per-case verdict under a given metric
// ─────────────────────────────────────────────────────────────────────────

interface Outcome { verdict: string; shape: string }

function outcome(c: CaseFixture, metric: MetricName, threshold: number): Outcome {
  const families = familiesByMetric(c.units, metric, threshold);
  if (families.length === 0) return { verdict: "no-family", shape: "—" };
  // Use the largest family — same logic the analyzer uses
  const largest = families.reduce((a, b) => a.length >= b.length ? a : b);
  if (largest.length < 2) return { verdict: "no-family", shape: "—" };
  const r = characterizeFamily(largest);
  return { verdict: r.verdict, shape: r.shape || "—" };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

const cases = await loadAll();
const metrics: MetricName[] = ["jaccard", "cosine", "asymmetric", "dice", "simhash"];

// Tally per metric
interface Tally {
  trapFlag: number;
  trapEscalate: number;
  trapNoFamily: number;
  trapIgnore: number;
  controlFlag: number; // false positives
  controlEscalate: number;
  controlOther: number;
  movedFromMiss: string[]; // trap IDs that this metric forms a family on but jaccard didn't
  newFPs: string[];        // control IDs flagged by this metric but not jaccard
}

const jaccardOutcomes = new Map<string, Outcome>();
for (const c of cases) {
  jaccardOutcomes.set(c.id, outcome(c, "jaccard", DEFAULT_THRESHOLDS.jaccard));
}

const results = new Map<MetricName, Tally>();

for (const m of metrics) {
  const t: Tally = {
    trapFlag: 0, trapEscalate: 0, trapNoFamily: 0, trapIgnore: 0,
    controlFlag: 0, controlEscalate: 0, controlOther: 0,
    movedFromMiss: [], newFPs: [],
  };
  for (const c of cases) {
    const o = outcome(c, m, DEFAULT_THRESHOLDS[m]);
    if (!c.meta.is_control) {
      if (o.verdict === "flag") t.trapFlag++;
      else if (o.verdict === "escalate") t.trapEscalate++;
      else if (o.verdict === "no-family") t.trapNoFamily++;
      else t.trapIgnore++;
      const jo = jaccardOutcomes.get(c.id)!;
      if (jo.verdict === "no-family" && o.verdict !== "no-family") {
        t.movedFromMiss.push(`${c.id}:${o.verdict}`);
      }
    } else {
      if (o.verdict === "flag") t.controlFlag++;
      else if (o.verdict === "escalate") t.controlEscalate++;
      else t.controlOther++;
      const jo = jaccardOutcomes.get(c.id)!;
      if (jo.verdict !== "flag" && o.verdict === "flag") {
        t.newFPs.push(c.id);
      }
    }
  }
  results.set(m, t);
}

// ─────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────

const totalTraps = cases.filter((c) => !c.meta.is_control).length;
const totalControls = cases.filter((c) => c.meta.is_control).length;

console.log("\nEmpirical comparison of similarity metrics");
console.log("─".repeat(72));
console.log(`Bench: ${totalTraps} traps, ${totalControls} controls`);
console.log();
console.log(
  "Metric        thr   trapFlag  trapEsc  trapMiss  ctlFlag  ctlEsc  ctlClean",
);
console.log("─".repeat(72));
for (const m of metrics) {
  const t = results.get(m)!;
  const trapMiss = t.trapNoFamily + t.trapIgnore;
  const tag = m.padEnd(11);
  const thr = DEFAULT_THRESHOLDS[m].toFixed(2);
  console.log(
    `${tag} ${thr}   ` +
    `${String(t.trapFlag).padStart(7)}   ` +
    `${String(t.trapEscalate).padStart(6)}   ` +
    `${String(trapMiss).padStart(7)}   ` +
    `${String(t.controlFlag).padStart(6)}  ` +
    `${String(t.controlEscalate).padStart(5)}  ` +
    `${String(t.controlOther).padStart(7)}`,
  );
}
console.log();

// Detailed delta vs Jaccard
console.log("Delta vs Jaccard reference (only the changes):");
console.log("─".repeat(72));
for (const m of metrics) {
  if (m === "jaccard") continue;
  const t = results.get(m)!;
  console.log(`\n  ${m}`);
  if (t.movedFromMiss.length) {
    console.log(`    + ${t.movedFromMiss.length} trap(s) now form a family:`);
    for (const id of t.movedFromMiss) console.log(`        ${id}`);
  }
  if (t.newFPs.length) {
    console.log(`    ! ${t.newFPs.length} control(s) newly flagged (false positives):`);
    for (const id of t.newFPs) console.log(`        ${id}`);
  }
  if (!t.movedFromMiss.length && !t.newFPs.length) {
    console.log(`    (no changes vs Jaccard)`);
  }
}

// Recall over the whole bench (flags + escalates count as "detected")
console.log();
console.log("Recall comparison (flag + escalate detected / total traps):");
console.log("─".repeat(72));
for (const m of metrics) {
  const t = results.get(m)!;
  const detected = t.trapFlag + t.trapEscalate;
  const recall = ((detected / totalTraps) * 100).toFixed(1);
  const strictRecall = ((t.trapFlag / totalTraps) * 100).toFixed(1);
  console.log(
    `  ${m.padEnd(11)}  strict=${strictRecall}%  detected=${recall}%`,
  );
}
console.log();

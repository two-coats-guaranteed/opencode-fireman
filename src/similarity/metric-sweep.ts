/**
 * Threshold sweep + targeted analysis of the Jaccard-floor miss family.
 *
 * The headline metric-comparison.ts uses one threshold per metric.
 * This script does two more rigorous things:
 *
 *   1. Sweep thresholds for each metric in 0.02-step increments and
 *      report the (strictRecall, fpRate) curve. Pick the metric+
 *      threshold combo that strictly dominates Jaccard, if any.
 *
 *   2. Focus on the documented Jaccard-floor cases (T028, T037, T040,
 *      T041, T053, T056, T057, T059, T060). Print each one's
 *      similarity score under every metric so we can see which ones
 *      would actually be rescued.
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

interface CaseFixture {
  id: string;
  isControl: boolean;
  units: FunctionUnit[];
}

async function loadCase(dir: string): Promise<CaseFixture> {
  const meta = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8"));
  const sources: { label: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { /* skip */ }
    if (isDir) {
      for (const sub of readdirSync(full)) {
        if (SRC_RE.test(sub)) {
          sources.push({ label: join(entry, sub), text: readFileSync(join(full, sub), "utf8") });
        }
      }
    } else if (SRC_RE.test(entry)) {
      sources.push({ label: entry, text: readFileSync(full, "utf8") });
    }
  }
  return { id: meta.case_id, isControl: !!meta.is_control, units: await buildUnits(sources) };
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

function familiesByMetric(
  units: FunctionUnit[], metric: MetricName, threshold: number,
): FunctionUnit[][] {
  const sim = METRICS[metric];
  const n = units.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sim(units[i]!.shingles, units[j]!.shingles) >= threshold) {
        const ra = find(i), rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
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

function verdictOf(c: CaseFixture, metric: MetricName, threshold: number): string {
  const families = familiesByMetric(c.units, metric, threshold);
  if (families.length === 0) return "no-family";
  const largest = families.reduce((a, b) => a.length >= b.length ? a : b);
  if (largest.length < 2) return "no-family";
  return characterizeFamily(largest).verdict;
}

// ─────────────────────────────────────────────────────────────────────────
// Sweep
// ─────────────────────────────────────────────────────────────────────────

const cases = await loadAll();
const traps = cases.filter((c) => !c.isControl);
const controls = cases.filter((c) => c.isControl);
const known_known_fps = new Set(["C007", "C015", "C025"]);  // documented precision ceilings

const metrics: MetricName[] = ["jaccard", "cosine", "asymmetric", "dice", "simhash"];

console.log("\nThreshold sweep — strict recall (flag) vs control-flag rate");
console.log("─".repeat(76));
console.log("Each row picks the threshold that maximises flag recall while");
console.log("keeping unknown-control flags ≤ 0 (only the documented FPs are tolerated).");
console.log();
console.log(
  "Metric        bestThr  flag  esc  miss  detRate  knownFP  unknownFP",
);
console.log("─".repeat(76));

for (const m of metrics) {
  let best: {
    thr: number; flag: number; esc: number; miss: number;
    knownFp: number; unknownFp: number;
  } | null = null;
  for (let thr = 0.20; thr <= 0.99; thr += 0.02) {
    let flag = 0, esc = 0, miss = 0;
    let knownFp = 0, unknownFp = 0;
    for (const t of traps) {
      const v = verdictOf(t, m, thr);
      if (v === "flag") flag++;
      else if (v === "escalate") esc++;
      else miss++;
    }
    for (const c of controls) {
      const v = verdictOf(c, m, thr);
      if (v === "flag") {
        if (known_known_fps.has(c.id)) knownFp++;
        else unknownFp++;
      }
    }
    // Pick max-flag with unknownFp ≤ 0 (i.e., zero new FPs allowed)
    if (unknownFp === 0 && (!best || flag > best.flag || (flag === best.flag && esc > best.esc))) {
      best = { thr, flag, esc, miss, knownFp, unknownFp };
    }
  }
  if (!best) {
    console.log(`${m.padEnd(11)} (no admissible threshold)`);
    continue;
  }
  const det = (((best.flag + best.esc) / traps.length) * 100).toFixed(1);
  console.log(
    `${m.padEnd(11)}  ${best.thr.toFixed(2)}    ${String(best.flag).padStart(4)} ` +
    ` ${String(best.esc).padStart(3)}  ${String(best.miss).padStart(4)}  ` +
    `${det.padStart(6)}%   ${String(best.knownFp).padStart(6)}  ${String(best.unknownFp).padStart(8)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Focused look at the Jaccard-floor cases
//
// The Jaccard-floor problem is divergent-to-consensus similarity, not
// consensus-to-consensus. For each case we compute the MIN pairwise
// similarity, which is the divergent's similarity to its closest twin.
// If that clears the threshold, the divergent connects to the family
// and characterise can produce a verdict.
// ─────────────────────────────────────────────────────────────────────────

const JACCARD_FLOOR = ["T028", "T037", "T040", "T041", "T053", "T056", "T057", "T059", "T060"];

console.log("\n\nJaccard-floor cases: MIN pair-wise similarity by metric");
console.log("─".repeat(76));
console.log("The MIN pairwise similarity is the divergent's score against its");
console.log("closest sibling. If it clears the threshold, family forms.");
console.log();
console.log(
  "Case   J=0.40   Cos=0.55  Asym=0.55  Dice=0.55  SH=0.80   biggest gain",
);
console.log("─".repeat(76));

for (const id of JACCARD_FLOOR) {
  const c = cases.find((x) => x.id === id);
  if (!c) continue;
  const u = c.units;
  if (u.length < 2) {
    console.log(`${id}   (only ${u.length} unit)`);
    continue;
  }
  // For each metric, compute the MIN pairwise similarity (across all pairs).
  const vals: Record<MetricName, number> = {
    jaccard: 1, cosine: 1, asymmetric: 1, dice: 1, simhash: 1,
  };
  for (let i = 0; i < u.length; i++) {
    for (let j = i + 1; j < u.length; j++) {
      for (const m of metrics) {
        const s = METRICS[m](u[i]!.shingles, u[j]!.shingles);
        if (s < vals[m]) vals[m] = s;
      }
    }
  }
  const t = { jaccard: 0.40, cosine: 0.55, asymmetric: 0.55, dice: 0.55, simhash: 0.80 };
  const flag = (m: MetricName) => vals[m] >= t[m] ? " ✓" : "  ";
  // "Biggest gain" = which alternative metric most clearly clears its
  // threshold when Jaccard does not.
  const jClears = vals.jaccard >= t.jaccard;
  let bestGain = "—";
  if (!jClears) {
    let best: { name: string; margin: number } | null = null;
    for (const m of metrics) {
      if (m === "jaccard") continue;
      const margin = vals[m] - t[m];
      if (margin > 0 && (!best || margin > best.margin)) {
        best = { name: m, margin };
      }
    }
    if (best) bestGain = `${best.name} +${best.margin.toFixed(2)}`;
  }
  console.log(
    `${id}   ${vals.jaccard.toFixed(2)}${flag("jaccard")}  ` +
    `${vals.cosine.toFixed(2)}${flag("cosine")}  ` +
    `${vals.asymmetric.toFixed(2)}${flag("asymmetric")}  ` +
    `${vals.dice.toFixed(2)}${flag("dice")}  ` +
    `${vals.simhash.toFixed(2)}${flag("simhash")}   ${bestGain}`,
  );
}

console.log("\n  ✓ = clears the per-metric threshold (divergent connects to family)");
console.log();


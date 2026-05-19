/**
 * LLM escalation validation.
 *
 * Run: `ANTHROPIC_API_KEY=... bun run llm-resolve`
 *
 * For each escalated bench case, calls resolveByLLM and checks that:
 *   - escalated TRAPS  → resolved to "flag"   (load-bearing)
 *   - escalated CONTROLS → resolved to "ignore" (cosmetic / safe)
 *
 * The structural detector escalates when it sees a divergence it cannot
 * classify confidently (label-only differences like sort vs toLocaleLowerCase,
 * or structural-unclassified where both sides have similar CALL/LOOP density).
 * The LLM tier resolves those ambiguous cases.
 *
 * Skip gracefully if ANTHROPIC_API_KEY is absent.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUnits } from "./index.ts";
import {
  characterizeFamily,
  resolveByLLM,
  type LLMResolution,
} from "./characterize.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, "..", "..", "bench");

// ---------------------------------------------------------------------------
// Load a bench case and return the escalation (if any)
// ---------------------------------------------------------------------------

interface CaseMeta {
  case_id: string;
  is_control: boolean;
  tier: "core" | "frontier";
}

interface EscalationCase {
  meta: CaseMeta;
  escalation: NonNullable<ReturnType<typeof characterizeFamily>["escalation"]>;
}

async function loadEscalations(root: string): Promise<EscalationCase[]> {
  const dirs = readdirSync(root).filter((d) => /^[TC]\d/.test(d)).sort();
  const results: EscalationCase[] = [];
  for (const d of dirs) {
    const dir = join(root, d);
    const meta = JSON.parse(
      readFileSync(join(dir, "truth.json"), "utf8"),
    ) as CaseMeta;
    const sources = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({
        label: f.replace(".ts", ""),
        text: readFileSync(join(dir, f), "utf8"),
      }));
    const units = await buildUnits(sources);
    const c = characterizeFamily(units);
    if (c.verdict === "escalate" && c.escalation) {
      results.push({ meta, escalation: c.escalation });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const apiKey = process.env["ANTHROPIC_API_KEY"];
if (!apiKey) {
  console.log("SKIP: ANTHROPIC_API_KEY not set.");
  console.log(
    "Set it and re-run: ANTHROPIC_API_KEY=<key> bun run llm-resolve",
  );
  process.exit(0);
}

console.log("Loading escalated bench cases...");
const traps = await loadEscalations(join(BENCH, "traps"));
const controls = await loadEscalations(join(BENCH, "controls"));
const all = [...traps, ...controls].sort((a, b) =>
  a.meta.case_id.localeCompare(b.meta.case_id),
);

console.log(
  `Found ${all.length} escalated cases (${traps.length} traps, ${controls.length} controls).\n`,
);

// ---------------------------------------------------------------------------
// Run and report
// ---------------------------------------------------------------------------

let failures = 0;
const results: Array<{
  id: string;
  tier: string;
  truth: string;
  expected: string;
  resolution: LLMResolution;
}> = [];

for (const { meta, escalation } of all) {
  process.stdout.write(`  ${meta.case_id.padEnd(6)}  resolving... `);
  const resolution = await resolveByLLM(escalation);
  const expected = meta.is_control ? "ignore" : "flag";
  const got = resolution.resolved ? resolution.verdict : "FAILED";
  const pass = got === expected;
  if (!pass) failures++;
  const tag = !resolution.resolved
    ? "ERROR"
    : pass
      ? "ok   "
      : "FAIL ";
  const reasoning = resolution.resolved ? resolution.reasoning : resolution.error;
  console.log(`${tag}  expected=${expected}  got=${got}`);
  console.log(`          ${reasoning}`);
  results.push({ id: meta.case_id, tier: meta.tier, truth: meta.is_control ? "control" : "trap", expected, resolution });
}

console.log();
console.log("─".repeat(60));
const resolved = results.filter((r) => r.resolution.resolved);
const correct = resolved.filter(
  (r) => r.resolution.resolved && r.resolution.verdict === r.expected,
);
console.log(`Resolved:  ${resolved.length}/${results.length}`);
console.log(`Correct:   ${correct.length}/${resolved.length}`);

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll LLM escalation checks passed.");

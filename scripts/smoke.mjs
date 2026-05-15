/**
 * Smoke test for the built dist/ output.
 *
 * Verifies that:
 *   - dist/detector.js is a valid ESM module
 *   - its `analyze` export is callable
 *   - it produces the expected finding on T001
 *
 * This is the post-build canary. If `bun run build` produced something
 * broken (wrong import paths, missing files, malformed emit), this fails.
 *
 * Run with:  bun scripts/smoke.mjs
 * Or:        node scripts/smoke.mjs
 *
 * Robust to CWD: paths are computed relative to this file's location, not
 * the working directory.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const distDetector = join(repoRoot, "dist", "detector.js");
const trapFile = join(
  repoRoot,
  "bench",
  "traps",
  "T001-serializer-key-ordering",
  "audit-serializer.ts",
);

function fail(msg, extra) {
  console.error(`smoke: ${msg}`);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}

if (!existsSync(distDetector)) {
  fail(`built detector not found at ${distDetector} — did you run 'bun run build'?`);
}
if (!existsSync(trapFile)) {
  fail(`trap file missing at ${trapFile}`);
}

const mod = await import(distDetector);
if (typeof mod.analyze !== "function") {
  fail(`dist/detector.js does not export an 'analyze' function (got ${typeof mod.analyze})`);
}

const findings = mod.analyze(trapFile);

if (!Array.isArray(findings)) {
  fail(`analyze() did not return an array (got ${typeof findings})`);
}
if (findings.length !== 1) {
  fail(`expected 1 finding, got ${findings.length}`, findings);
}

const f = findings[0];
if (f.category !== "sibling-divergence") {
  fail(`wrong category: ${f.category}`);
}
if (f.start_line !== 13 || f.end_line !== 29) {
  fail(`wrong line range: ${f.start_line}-${f.end_line} (expected 13-29)`);
}
if (typeof f.rationale !== "string" || f.rationale.length === 0) {
  fail(`missing or empty rationale`);
}

console.log("smoke: built detector OK");
console.log(`  category:  ${f.category}`);
console.log(`  lines:     ${f.start_line}-${f.end_line}`);
console.log(`  rationale: ${f.rationale}`);

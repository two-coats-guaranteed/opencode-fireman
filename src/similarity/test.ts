/**
 * Structural similarity engine — test / demonstration.
 *
 * Run: `bun src/similarity/test.ts`  (or `bun run sim`)
 *
 * Verifies the properties the engine is supposed to have, and prints the
 * numbers so the behaviour is visible, not just asserted. Hashing is
 * seeded, so every run is identical — a failure is a real failure, never
 * flakiness.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { buildUnits, findTwinPairs, jaccard, residual, shingleSet } from "./index.ts";
import { makeNode } from "./normalized-ast.ts";
import type { FunctionUnit } from "./index.ts";
import { buildFlowGraph, criticalPathAnalysis } from "./dataflow.ts";
import {
  buildCallGraph,
  callTargetLabels,
  directCallers,
  directCallees,
  externalCallTargets,
} from "./callgraph.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- assertion harness ------------------------------------------------

let failures = 0;
function check(label: string, pass: boolean, detail = ""): void {
  if (!pass) failures++;
  const tag = pass ? "ok  " : "FAIL";
  console.log(`  ${tag}  ${label}${detail ? `  —  ${detail}` : ""}`);
}
function section(name: string): void {
  console.log(`\n${name}`);
  console.log("-".repeat(name.length));
}
function f3(x: number): string {
  return x.toFixed(3);
}

// ---- helpers ----------------------------------------------------------

/** Shingle-set of the single function in a snippet. */
async function shinglesOf(label: string, src: string): Promise<Set<string>> {
  const units = await buildUnits([{ label, text: src }]);
  if (units.length !== 1) {
    throw new Error(`${label}: expected 1 function, got ${units.length}`);
  }
  return units[0]!.shingles;
}

/** The OLD approach: Jaccard over identifier *names*. For contrast only. */
function identifierNames(src: string): Set<string> {
  const sf = ts.createSourceFile(
    "x.tsx",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) names.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}
function nameJaccard(a: string, b: string): number {
  const na = identifierNames(a);
  const nb = identifierNames(b);
  let inter = 0;
  for (const x of na) if (nb.has(x)) inter++;
  const uni = na.size + nb.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

// ---- fixtures ---------------------------------------------------------

const MAP_A = `
export function alpha(items) {
  const out = [];
  for (const x of items) {
    out.push(x.trim());
  }
  return out;
}`;

// Same structure as MAP_A, every identifier renamed (params, locals,
// loop var, function name, AND both method names).
const MAP_A_RENAMED = `
export function omega(values) {
  const acc = [];
  for (const v of values) {
    acc.append(v.strip());
  }
  return acc;
}`;

// MAP_A plus one extra statement — a near-twin.
const MAP_A_PLUS = `
export function alpha2(items) {
  const out = [];
  for (const x of items) {
    out.push(x.trim());
  }
  out.sort();
  return out;
}`;

const GUARD_A = `
export function pick(value) {
  if (value > 10) {
    return "big";
  }
  return "small";
}`;
const GUARD_A_RENAMED = `
export function choose(amount) {
  if (amount > 10) {
    return "large";
  }
  return "tiny";
}`;

const REDUCE_A = `
export function total(rows) {
  let sum = 0;
  for (const r of rows) {
    sum = sum + r.amount;
  }
  return sum;
}`;
const REDUCE_A_RENAMED = `
export function aggregate(entries) {
  let acc = 0;
  for (const e of entries) {
    acc = acc + e.weight;
  }
  return acc;
}`;

const TINY = `
export function blank() {
  return null;
}`;

// ---- A. renaming invariance, vs the name-based approach ---------------

section("A. structural similarity is name-independent");
{
  const structural = jaccard(
    await shinglesOf("a", MAP_A),
    await shinglesOf("b", MAP_A_RENAMED),
  );
  const byName = nameJaccard(MAP_A, MAP_A_RENAMED);

  console.log(`  same algorithm, every identifier renamed:`);
  console.log(`    name-based Jaccard (old approach): ${f3(byName)}`);
  console.log(`    structural similarity (new):       ${f3(structural)}`);

  check(
    "structural similarity sees them as identical",
    structural === 1,
    `structural = ${f3(structural)}`,
  );
  check(
    "name-based Jaccard would NOT pair them (below the 0.4 twin threshold)",
    byName < 0.4,
    `name-based = ${f3(byName)}`,
  );
}

// ---- B. a near-twin produces a small, one-sided residual --------------

section("B. one inserted statement -> small residual");
{
  const base = await shinglesOf("base", MAP_A);
  const plus = await shinglesOf("plus", MAP_A_PLUS);
  const sim = jaccard(base, plus);
  const delta = residual(base, plus);

  console.log(`  similarity:        ${f3(sim)}`);
  console.log(`  shared shingles:   ${delta.shared}`);
  console.log(`  only in base:      ${delta.onlyA.length}`);
  console.log(`  only in plus (the inserted sort): ${delta.onlyB.length}`);
  for (const s of delta.onlyB) console.log(`      + ${s}`);

  check("near-twin: similarity is high", sim > 0.6, `sim = ${f3(sim)}`);
  check("near-twin: but not identical", sim < 1, `sim = ${f3(sim)}`);
  check(
    "the change is small — total residual far below the shared core",
    delta.onlyA.length + delta.onlyB.length < delta.shared / 2,
    `residual ${delta.onlyA.length + delta.onlyB.length} vs shared ${delta.shared}`,
  );
  check(
    "the base side barely changes — consistent with an insertion",
    delta.onlyA.length <= 2,
    `onlyA = ${delta.onlyA.length}`,
  );
  check(
    "the residual localizes the inserted statement (a CALL now in the block)",
    delta.onlyB.some((s) => s.includes("BLOCK") && s.includes("CALL")),
  );
}

// ---- C. structurally different functions score low -------------------

section("C. unrelated structure scores low");
{
  const sim = jaccard(await shinglesOf("m", MAP_A), await shinglesOf("g", GUARD_A));
  console.log(`  map (loop+call) vs guard (branch+returns): ${f3(sim)}`);
  check("non-twins score low", sim < 0.4, `sim = ${f3(sim)}`);
}

// ---- D. LSH blocking misses no real twin -----------------------------

section("D. LSH blocking returns every real twin");
{
  const corpus: Array<{ label: string; text: string }> = [
    { label: "mapA", text: MAP_A },
    { label: "mapB", text: MAP_A_RENAMED },
    { label: "mapC", text: MAP_A_PLUS },
    { label: "guardA", text: GUARD_A },
    { label: "guardB", text: GUARD_A_RENAMED },
    { label: "reduceA", text: REDUCE_A },
    { label: "reduceB", text: REDUCE_A_RENAMED },
    { label: "tiny", text: TINY },
  ];
  const units = await buildUnits(corpus);

  // Brute force: every pair, exact Jaccard.
  const TWIN = 0.6;
  const realTwins = new Set<string>();
  let allPairs = 0;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      allPairs++;
      const sim = jaccard(units[i]!.shingles, units[j]!.shingles);
      if (sim >= TWIN) {
        const a = units[i]!.id;
        const b = units[j]!.id;
        realTwins.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
  }

  // LSH candidate set (minSimilarity 0 -> raw candidates).
  const candidates = new Set(
    findTwinPairs(units, 0).map((p) =>
      p.a < p.b ? `${p.a}|${p.b}` : `${p.b}|${p.a}`,
    ),
  );

  console.log(`  ${units.length} functions, ${allPairs} possible pairs`);
  console.log(`  real twins (exact Jaccard >= ${TWIN}): ${realTwins.size}`);
  console.log(`  LSH candidate pairs: ${candidates.size}`);

  let missed = 0;
  for (const t of realTwins) if (!candidates.has(t)) missed++;

  check("LSH misses no real twin", missed === 0, `${missed} missed`);
  check(
    "LSH prunes — candidates fewer than all pairs",
    candidates.size < allPairs,
    `${candidates.size} < ${allPairs}`,
  );
  check("the real twins were actually found", realTwins.size > 0);
}

// ---- E. the real bench corpus (Fireman-Bench T001) -------------------

section("E. real corpus — the T001 serializers");
{
  const dir = join(
    HERE,
    "..",
    "..",
    "bench",
    "traps",
    "T001-serializer-key-ordering",
  );
  const sources = [
    { label: "user", file: "user-serializer.ts" },
    { label: "product", file: "product-serializer.ts" },
    { label: "audit", file: "audit-serializer.ts" },
  ].map((s) => ({
    label: s.label,
    text: readFileSync(join(dir, s.file), "utf8"),
  }));

  const units = await buildUnits(sources);
  const get = (name: string): Set<string> => {
    const u = units.find((x) => x.name === name);
    if (!u) throw new Error(`function ${name} not found`);
    return u.shingles;
  };

  const user = get("serializeUser");
  const product = get("serializeProduct");
  const audit = get("serializeAudit");

  const simUserProduct = jaccard(user, product);
  const simUserAudit = jaccard(user, audit);
  const delta = residual(user, audit);

  console.log(`  serializeUser  vs serializeProduct: ${f3(simUserProduct)}`);
  console.log(`  serializeUser  vs serializeAudit:   ${f3(simUserAudit)}`);
  console.log(
    `  residual (audit's extra structure): ${delta.onlyB.length} shingles`,
  );
  for (const s of delta.onlyB) console.log(`      + ${s}`);

  check(
    "the two non-sorting serializers are near-identical",
    simUserProduct > 0.9,
    `sim = ${f3(simUserProduct)}`,
  );
  check(
    "the audit serializer is a twin too, but less similar (it has the sort)",
    simUserAudit > 0.4 && simUserAudit < simUserProduct,
    `audit = ${f3(simUserAudit)}, product = ${f3(simUserProduct)}`,
  );
  check(
    "the audit serializer's extra structure shows up as a residual",
    delta.onlyB.length > 0,
  );
  check(
    "that residual includes loop / call structure (the key-sort)",
    delta.onlyB.some((s) => s.includes("LOOP")) &&
      delta.onlyB.some((s) => s.includes("CALL")),
  );
}

// ---- F. multi-language adapters ----------------------------------------

section("F. multi-language adapters");
{
  // ── Python ──────────────────────────────────────────────────────────────
  const PY_SRC = `
def process_items(data, flag):
    result = []
    for item in data:
        result.append(item.strip())
    if flag:
        result.reverse()
    return result

def compute_total(values, scale):
    result = []
    for val in values:
        result.append(val.strip())
    if scale:
        result.reverse()
    return result
`;
  {
    const pyUnits = await buildUnits([{ label: "funcs.py", text: PY_SRC }]);
    check("Python: finds 2 functions", pyUnits.length === 2, `got ${pyUnits.length}`);
    if (pyUnits.length === 2) {
      const j = jaccard(pyUnits[0]!.shingles, pyUnits[1]!.shingles);
      check("Python: renamed twins score ≥ 0.9", j >= 0.9, `Jaccard = ${f3(j)}`);
    }
  }

  // ── Python sort divergence → should characterize as flag ────────────────
  const PY_SORT_USER = `
def build_key_user(tenant, kind, tags):
    parts = [tenant, kind]
    for tag in tags:
        parts.append(tag)
    return "|".join(parts)
`;
  const PY_SORT_ARCHIVE = `
def build_key_archive(tenant, kind, tags):
    sorted_tags = sorted(tags)
    parts = [tenant, kind]
    for tag in sorted_tags:
        parts.append(tag)
    return "|".join(parts)
`;
  {
    const { characterizeFamily } = await import("./characterize.ts");
    const pyPair = await buildUnits([
      { label: "user.py", text: PY_SORT_USER },
      { label: "archive.py", text: PY_SORT_ARCHIVE },
    ]);
    check("Python: sort-divergent pair found", pyPair.length === 2, `got ${pyPair.length}`);
    if (pyPair.length === 2) {
      const c = characterizeFamily(pyPair);
      check(
        "Python: sort divergence → detected (flag or escalate)",
        c.verdict === "flag" || c.verdict === "escalate",
        `got ${c.verdict} (${c.shape})`,
      );
    }
  }

  // ── Java ────────────────────────────────────────────────────────────────
  const JAVA_SRC = `
class KeyBuilder {
  String buildUserKey(String tenant, String kind, List<String> tags) {
    List<String> parts = new ArrayList<>();
    parts.add(tenant);
    parts.add(kind);
    for (String tag : tags) { parts.add(tag); }
    return String.join("|", parts);
  }
  String buildOrderKey(String tenant, String kind, List<String> tags) {
    List<String> parts = new ArrayList<>();
    parts.add(tenant);
    parts.add(kind);
    for (String tag : tags) { parts.add(tag); }
    return String.join("|", parts);
  }
}
`;
  {
    const javaUnits = await buildUnits([{ label: "KeyBuilder.java", text: JAVA_SRC }]);
    check("Java: finds 2 methods", javaUnits.length === 2, `got ${javaUnits.length}`);
    if (javaUnits.length === 2) {
      const j = jaccard(javaUnits[0]!.shingles, javaUnits[1]!.shingles);
      check("Java: structurally identical twins score ≥ 0.9", j >= 0.9, `Jaccard = ${f3(j)}`);
    }
  }

  // ── C++ ─────────────────────────────────────────────────────────────────
  const CPP_SRC = `
std::string buildUserKey(std::string tenant, std::string kind, std::vector<std::string> tags) {
  std::vector<std::string> parts = {tenant, kind};
  for (const auto& tag : tags) { parts.push_back(tag); }
  return join(parts, "|");
}
std::string buildOrderKey(std::string tenant, std::string kind, std::vector<std::string> tags) {
  std::vector<std::string> parts = {tenant, kind};
  for (const auto& tag : tags) { parts.push_back(tag); }
  return join(parts, "|");
}
`;
  {
    const cppUnits = await buildUnits([{ label: "keys.cpp", text: CPP_SRC }]);
    check("C++: finds 2 functions", cppUnits.length === 2, `got ${cppUnits.length}`);
    if (cppUnits.length === 2) {
      const j = jaccard(cppUnits[0]!.shingles, cppUnits[1]!.shingles);
      check("C++: renamed twins score ≥ 0.9", j >= 0.9, `Jaccard = ${f3(j)}`);
    }
  }

  // ── C ──────────────────────────────────────────────────────────────────
  const C_SRC = `
int sum_array(int* arr, int n) {
  int result = 0;
  for (int i = 0; i < n; i++) { result += arr[i]; }
  return result;
}
int product_array(int* arr, int n) {
  int result = 1;
  for (int i = 0; i < n; i++) { result *= arr[i]; }
  return result;
}
`;
  {
    const cUnits = await buildUnits([{ label: "ops.c", text: C_SRC }]);
    check("C: finds 2 functions", cUnits.length === 2, `got ${cUnits.length}`);
    if (cUnits.length === 2) {
      const j = jaccard(cUnits[0]!.shingles, cUnits[1]!.shingles);
      check("C: near-identical functions score ≥ 0.8", j >= 0.8, `Jaccard = ${f3(j)}`);
    }
  }

  // ── Scala ───────────────────────────────────────────────────────────────
  const SCALA_SRC = `
def buildUserKey(tenant: String, kind: String, tags: List[String]): String = {
  val parts = List(tenant, kind) ++ tags
  parts.mkString("|")
}
def buildOrderKey(tenant: String, kind: String, tags: List[String]): String = {
  val parts = List(tenant, kind) ++ tags
  parts.mkString("|")
}
`;
  {
    const scalaUnits = await buildUnits([{ label: "keys.scala", text: SCALA_SRC }]);
    check("Scala: finds 2 functions", scalaUnits.length === 2, `got ${scalaUnits.length}`);
    if (scalaUnits.length === 2) {
      const j = jaccard(scalaUnits[0]!.shingles, scalaUnits[1]!.shingles);
      check("Scala: identical functions score ≥ 0.9", j >= 0.9, `Jaccard = ${f3(j)}`);
    }
  }
}

// ---- G. data-flow and call-graph analysis ---------------------------------

section("G. data-flow: critical-path analysis");
{

  // Construct a minimal FUNCTION tree manually:
  //
  //   function f(x) {
  //     const y = sort(x);   ← insertion
  //     return y;            ← y flows to RETURN
  //   }
  //
  // NormNode tree:
  //   FUNCTION
  //     PARAM → IDENT_PARAM("x")
  //     BLOCK
  //       DECL → IDENT_VAR("y") + CALL → MEMBER → IDENT_VAR("x") IDENT_CALLEE("sort")
  //       RETURN → IDENT_VAR("y")

  const xParam = makeNode("IDENT_PARAM", [], "x");
  const param = makeNode("PARAM", [xParam]);

  const xUse = makeNode("IDENT_VAR", [], "x");
  const sortCallee = makeNode("IDENT_CALLEE", [], "sort");
  const sortMember = makeNode("MEMBER", [xUse, sortCallee]);
  const sortCall = makeNode("CALL", [sortMember]);
  const yDef = makeNode("IDENT_VAR", [], "y");
  const decl = makeNode("DECL", [yDef, sortCall]);

  const yUse = makeNode("IDENT_VAR", [], "y");
  const ret = makeNode("RETURN", [yUse]);

  const block = makeNode("BLOCK", [decl, ret]);
  const fn = makeNode("FUNCTION", [param, block]);

  // The "insertion" is the DECL (extra sort statement).
  const cpa = criticalPathAnalysis([decl], fn);
  check(
    "sort DECL defining 'y' is on critical path when 'y' is returned",
    cpa.onCriticalPath,
    `criticalVars = ${JSON.stringify(cpa.criticalVars)}`,
  );
  check("critical var is 'y'", cpa.criticalVars.includes("y"));

  // Now construct a case where the insertion is OFF the critical path:
  //
  //   function g(x) {
  //     const z = sideEffect(x);  // plain function call — z is not returned
  //     return x;                 // x flows to RETURN directly
  //   }
  //
  // Key: sideEffect(x) is CALL(IDENT_CALLEE, IDENT_VAR) — no MEMBER receiver.
  // This represents a regular function call, not a method call on x.

  const sideCallee2 = makeNode("IDENT_CALLEE", [], "sideEffect");
  const x2Arg = makeNode("IDENT_VAR", [], "x");
  const sideCall2 = makeNode("CALL", [sideCallee2, x2Arg]); // sideEffect(x), not x.sideEffect()
  const zDef = makeNode("IDENT_VAR", [], "z");
  const sideDecl = makeNode("DECL", [zDef, sideCall2]);

  const xReturn = makeNode("IDENT_VAR", [], "x");
  const ret2 = makeNode("RETURN", [xReturn]);

  const block2 = makeNode("BLOCK", [sideDecl, ret2]);
  const fn2 = makeNode("FUNCTION", [makeNode("PARAM", [makeNode("IDENT_PARAM", [], "x")]), block2]);

  const cpa2 = criticalPathAnalysis([sideDecl], fn2);
  check(
    "side-effect DECL defining 'z' (never returned) is NOT on critical path",
    !cpa2.onCriticalPath,
    `offPathVars = ${JSON.stringify(cpa2.offPathVars)}`,
  );
  check("off-path var is 'z'", cpa2.offPathVars.includes("z"));
}

section("G2. call-graph: edge detection between corpus functions");
{

  // Build two minimal FunctionUnits where A calls B.
  const calleeLabel = makeNode("IDENT_CALLEE", [], "buildKey");
  const callNode = makeNode("CALL", [calleeLabel]);
  const retA = makeNode("RETURN", [callNode]);
  const treeA = makeNode("FUNCTION", [makeNode("BLOCK", [retA])]);

  const retB = makeNode("RETURN", [makeNode("IDENT_VAR", [], "x")]);
  const treeB = makeNode("FUNCTION", [makeNode("PARAM", [makeNode("IDENT_PARAM", [], "x")]), makeNode("BLOCK", [retB])]);

  const unitA: import("./index.ts").FunctionUnit = {
    id: "test::caller",
    name: "caller",
    source: "test",
    tree: treeA,
    shingles: shingleSet(treeA),
  };
  const unitB: import("./index.ts").FunctionUnit = {
    id: "test::buildKey",
    name: "buildKey",
    source: "test",
    tree: treeB,
    shingles: shingleSet(treeB),
  };

  const cg = buildCallGraph([unitA, unitB]);

  check(
    "call graph: caller → buildKey edge exists",
    cg.outEdges.get(unitA.id)?.has(unitB.id) === true,
  );
  check(
    "call graph: buildKey ← caller reverse edge exists",
    cg.inEdges.get(unitB.id)?.has(unitA.id) === true,
  );
  check(
    "directCallees(caller) includes buildKey",
    directCallees(unitA, cg).some((u) => u.name === "buildKey"),
  );
  check(
    "directCallers(buildKey) includes caller",
    directCallers(unitB, cg).some((u) => u.name === "caller"),
  );

  // External targets: 'buildKey' is corpus-internal; if caller also called 'sort',
  // that should appear as an external target.
  const extCallee = makeNode("IDENT_CALLEE", [], "sort");
  const treeAWithExt = makeNode("FUNCTION", [
    makeNode("BLOCK", [
      makeNode("RETURN", [makeNode("CALL", [calleeLabel, extCallee])]),
    ]),
  ]);
  const unitAExt: import("./index.ts").FunctionUnit = {
    ...unitA,
    tree: treeAWithExt,
    shingles: shingleSet(treeAWithExt),
  };
  const cg2 = buildCallGraph([unitAExt, unitB]);
  const ext = externalCallTargets(unitAExt, cg2);
  check("'sort' appears as external call target (not in corpus)", ext.has("sort"));
  check("'buildKey' is NOT an external target (it's in the corpus)", !ext.has("buildKey"));
}

// ---- summary ----------------------------------------------------------

console.log();
if (failures === 0) {
  console.log("All similarity-engine checks passed.");
  process.exit(0);
}
console.log(`${failures} check(s) FAILED.`);
process.exit(1);

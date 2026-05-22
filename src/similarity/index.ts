/**
 * Structural similarity engine — public API.
 *
 *   source  --[ts-adapter]--> NormFunction   (language-agnostic AST)
 *           --[shingles]----> shingle-set    (name-independent structure)
 *           --[minhash]-----> signature
 *           --[LSH]---------> candidate twin pairs   (blocking, ≈linear)
 *           --[exact Jaccard over shingle-sets]----> similarity verdict
 *
 * LSH only proposes candidates; the verdict is exact Jaccard over the
 * shingle-sets. `residual()` exposes the raw shingle-set difference —
 * the structural delta between two functions. CHARACTERISING that delta
 * (is it a localised extra call? an added guard? load-bearing or
 * cosmetic?) is the next milestone and is deliberately not done here.
 */

import { LshIndex, signature } from "./minhash.ts";
import { type NormFunction, type NormNode } from "./normalized-ast.ts";
import { shingleSet } from "./shingles.ts";
import { parseFunctions as parseFunctionsTs } from "./ts-adapter.ts";
import { parseFunctions as parseFunctionsPy } from "./python-adapter.ts";
import { parseFunctions as parseFunctionsJava } from "./java-adapter.ts";
import { parseFunctions as parseFunctionsCpp } from "./cpp-adapter.ts";
import { parseFunctions as parseFunctionsC } from "./c-adapter.ts";
import { parseFunctions as parseFunctionsScala } from "./scala-adapter.ts";
import { parseFunctions as parseFunctionsPhp } from "./php-adapter.ts";

export interface FunctionUnit {
  id: string;
  name: string;
  source: string;
  /** The normalized AST tree. Consumed by the characterisation stage. */
  tree: NormNode;
  shingles: Set<string>;
  /** Raw source text of this function — for LLM-escalation prompts. */
  sourceText?: string;
  /** 1-indexed line range of this function in its source file. */
  startLine?: number;
  endLine?: number;
}

export interface TwinPair {
  a: string;
  b: string;
  similarity: number;
}

export interface ResidualDelta {
  /** Shingles in A but not B. */
  onlyA: string[];
  /** Shingles in B but not A. */
  onlyB: string[];
  /** Count of shingles present in both. */
  shared: number;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function detectLanguage(
  label: string,
  explicit?: string,
): "ts" | "py" | "java" | "cpp" | "c" | "scala" | "php" | null {
  if (explicit) {
    const l = explicit.toLowerCase();
    if (l === "ts" || l === "typescript") return "ts";
    if (l === "py" || l === "python") return "py";
    if (l === "java") return "java";
    if (l === "cpp" || l === "c++") return "cpp";
    if (l === "c") return "c";
    if (l === "scala") return "scala";
    if (l === "php") return "php";
    return null;
  }
  const ext = label.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return "ts";
  if (ext === "py") return "py";
  if (ext === "java") return "java";
  if (ext === "cpp" || ext === "cxx" || ext === "cc" || ext === "hpp" || ext === "hxx") return "cpp";
  if (ext === "c" || ext === "h") return "c";
  if (ext === "scala" || ext === "sc") return "scala";
  if (ext === "php") return "php";
  // Default: TypeScript (preserves backward-compat for extension-less labels)
  return "ts";
}

async function parseForLang(
  lang: "ts" | "py" | "java" | "cpp" | "c" | "scala" | "php",
  source: string,
  label: string,
): Promise<NormFunction[]> {
  switch (lang) {
    case "ts":    return parseFunctionsTs(label, source);
    case "py":    return parseFunctionsPy(source, label);
    case "java":  return parseFunctionsJava(source, label);
    case "cpp":   return parseFunctionsCpp(source, label);
    case "c":     return parseFunctionsC(source, label);
    case "scala": return parseFunctionsScala(source, label);
    case "php":   return parseFunctionsPhp(source, label);
  }
}

// ---------------------------------------------------------------------------
// buildUnits — now async to support tree-sitter wasm grammars
// ---------------------------------------------------------------------------

/**
 * Lower a set of sources into function units.
 * Language is auto-detected from the file extension in `label`, or can
 * be overridden by supplying an explicit `language` field on each source.
 */
export async function buildUnits(
  sources: Array<{ label: string; text: string; language?: string }>,
): Promise<FunctionUnit[]> {
  const units: FunctionUnit[] = [];
  for (const { label, text, language } of sources) {
    const lang = detectLanguage(label, language);
    if (!lang) continue;
    const fns = await parseForLang(lang, text, label);
    for (const fn of fns) {
      const unit: FunctionUnit = {
        id: fn.id,
        name: fn.name,
        source: fn.source,
        tree: fn.tree,
        shingles: shingleSet(fn.tree),
      };
      if (fn.sourceText !== undefined) unit.sourceText = fn.sourceText;
      if (fn.startLine !== undefined) unit.startLine = fn.startLine;
      if (fn.endLine !== undefined) unit.endLine = fn.endLine;
      units.push(unit);
    }
  }
  return units;
}

/** Exact Jaccard similarity over two shingle-sets. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) {
    if (large.has(x)) inter++;
  }
  return inter / (a.size + b.size - inter);
}

/** Structural delta between two functions' shingle-sets. */
export function residual(a: Set<string>, b: Set<string>): ResidualDelta {
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  let shared = 0;
  for (const x of a) {
    if (b.has(x)) shared++;
    else onlyA.push(x);
  }
  for (const x of b) {
    if (!a.has(x)) onlyB.push(x);
  }
  return { onlyA, onlyB, shared };
}

/**
 * Find structural twin pairs. LSH proposes candidate pairs in ≈linear
 * time; each candidate is then scored with exact Jaccard. Pairs scoring
 * at least `minSimilarity` are returned, most-similar first.
 *
 * Call with `minSimilarity = 0` to inspect the raw LSH candidate set.
 */
export function findTwinPairs(
  units: FunctionUnit[],
  minSimilarity = 0.5,
): TwinPair[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const index = new LshIndex();
  for (const u of units) {
    index.add(u.id, signature(u.shingles));
  }

  const pairs: TwinPair[] = [];
  for (const [a, b] of index.candidatePairs()) {
    const ua = byId.get(a);
    const ub = byId.get(b);
    if (!ua || !ub) continue;
    const sim = jaccard(ua.shingles, ub.shingles);
    if (sim >= minSimilarity) pairs.push({ a, b, similarity: sim });
  }
  pairs.sort((x, y) => y.similarity - x.similarity);
  return pairs;
}

export { parseFunctions } from "./ts-adapter.ts";
export { parseFunctions as parseFunctionsPython } from "./python-adapter.ts";
export { parseFunctions as parseFunctionsJava } from "./java-adapter.ts";
export { parseFunctions as parseFunctionsCpp } from "./cpp-adapter.ts";
export { parseFunctions as parseFunctionsC } from "./c-adapter.ts";
export { parseFunctions as parseFunctionsScala } from "./scala-adapter.ts";
export { shingleSet } from "./shingles.ts";
export { LshIndex, signature, estimateJaccard } from "./minhash.ts";
export { preorder, size } from "./normalized-ast.ts";
export type {
  NormFunction,
  NormNode,
  NormKind,
} from "./normalized-ast.ts";

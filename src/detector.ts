/**
 * Fireman v0.1 detector.
 *
 * Pure function: (filePath) => Finding[]. No OpenCode dependency. The bench
 * harness drives this directly; the plugin entrypoint wraps it.
 *
 * Scope of v0.1: a single trap pattern — "sibling divergence by ordering".
 * If an exported function in the read file contains a `.sort(` call and its
 * structurally similar siblings in the same directory do not, Fireman flags
 * the function. This is the pattern in bench/traps/T001 (the audit
 * serializer that key-sorts for HMAC signature stability).
 *
 * Function extraction uses a forgiving regex + brace-matching rather than a
 * real AST. This is intentional for v0.1 — the goal is to demonstrate the
 * detector-plugin-bench loop on one well-defined case. v0.2 will swap in
 * web-tree-sitter once the second trap category lands and regex starts to
 * break down.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Finding } from "./types.ts";

interface FunctionRecord {
  name: string;
  /** 1-indexed line where `export function` appears. */
  startLine: number;
  /** 1-indexed line where the closing `}` sits. */
  endLine: number;
  /** Identifiers used inside the function body, for similarity comparison. */
  identifiers: Set<string>;
  /** Has at least one `.sort(...)` call. */
  hasSort: boolean;
}

/**
 * Matches `export function name(...): ReturnType {`. Forgiving on whitespace
 * and on whether a return type annotation is present.
 */
const FN_HEADER_RE =
  /export\s+function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g;

const IDENT_RE = /\b([A-Za-z_$][\w$]*)\b/g;
const SORT_RE = /\.sort\s*\(/;

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "default", "break", "continue", "new", "this",
  "typeof", "instanceof", "in", "of", "true", "false", "null", "undefined",
  "void", "throw", "try", "catch", "finally", "async", "await", "import",
  "export", "from", "as", "type", "interface", "class", "extends",
  "implements", "public", "private", "protected", "readonly", "static",
  "string", "number", "boolean", "any", "unknown", "never",
]);

/**
 * Strip `//`-line comments and `/* * /`-block comments so they don't
 * pollute the identifier set used for structural similarity. Doesn't try
 * to honour string-literal contents (commits this minor inaccuracy in
 * exchange for not pulling in a real lexer).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function extractIdentifiers(body: string): Set<string> {
  const cleaned = stripComments(body);
  const out = new Set<string>();
  IDENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IDENT_RE.exec(cleaned)) !== null) {
    const id = m[1];
    if (id && !KEYWORDS.has(id)) out.add(id);
  }
  return out;
}

function lineOf(source: string, idx: number): number {
  // 1-indexed line of the character at `idx`.
  let line = 1;
  for (let i = 0; i < idx; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

const OPEN_BRACE = "{".charCodeAt(0);
const CLOSE_BRACE = "}".charCodeAt(0);

/**
 * Extract every top-level `export function` from a TS source. Uses a
 * forgiving regex for the header and brace-matching for the body. Skips any
 * function whose braces don't balance (malformed source).
 */
export function extractFunctions(source: string): FunctionRecord[] {
  const out: FunctionRecord[] = [];
  FN_HEADER_RE.lastIndex = 0;
  let header: RegExpExecArray | null;
  while ((header = FN_HEADER_RE.exec(source)) !== null) {
    const name = header[1];
    const full = header[0];
    if (!name || !full) continue;
    const startLine = lineOf(source, header.index);
    // header[0] ends with the opening `{` — start brace-matching from there.
    const braceOpenIdx = header.index + full.length - 1;

    let depth = 0;
    let endIdx = -1;
    for (let i = braceOpenIdx; i < source.length; i++) {
      const c = source.charCodeAt(i);
      if (c === OPEN_BRACE) depth++;
      else if (c === CLOSE_BRACE) {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx < 0) continue; // unbalanced; skip

    const body = source.slice(braceOpenIdx, endIdx + 1);
    out.push({
      name,
      startLine,
      endLine: lineOf(source, endIdx),
      identifiers: extractIdentifiers(body),
      hasSort: SORT_RE.test(body),
    });
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Files Fireman will look at as potential siblings of the target. */
const SIBLING_EXTENSIONS = [".ts", ".tsx"];
/** Minimum identifier-Jaccard for two functions to count as "siblings". */
const SIMILARITY_THRESHOLD = 0.4;

/**
 * The main detector entrypoint. Reads `filePath`, parses sibling .ts files
 * in the same directory, and returns findings for any function in the
 * target whose `.sort(...)` usage is asymmetric versus structurally similar
 * siblings.
 *
 * Errors are swallowed (e.g., unreadable sibling) — silence is always safe.
 */
export function analyze(filePath: string): Finding[] {
  let targetSource: string;
  try {
    targetSource = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const targetFns = extractFunctions(targetSource);
  if (targetFns.length === 0) return [];

  const dir = dirname(filePath);
  let siblingNames: string[];
  try {
    siblingNames = readdirSync(dir);
  } catch {
    return [];
  }

  const targetBase = basename(filePath);
  const siblingFns: FunctionRecord[] = [];
  for (const name of siblingNames) {
    if (!SIBLING_EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    if (name === targetBase) continue; // don't compare the target with itself
    const sp = join(dir, name);
    try {
      siblingFns.push(...extractFunctions(readFileSync(sp, "utf8")));
    } catch {
      // skip unreadable sibling
    }
  }
  if (siblingFns.length === 0) return [];

  const findings: Finding[] = [];
  for (const target of targetFns) {
    if (!target.hasSort) continue; // detector v0.1 only flags this pattern

    const similar = siblingFns.filter(
      (s) => jaccard(s.identifiers, target.identifiers) >= SIMILARITY_THRESHOLD,
    );
    if (similar.length === 0) continue; // no siblings to compare against
    if (similar.some((s) => s.hasSort)) continue; // not asymmetric

    findings.push({
      file: filePath,
      start_line: target.startLine,
      end_line: target.endLine,
      category: "sibling-divergence",
      rationale:
        `${target.name} sorts keys/values; ${similar.length} structurally ` +
        `similar sibling function${similar.length === 1 ? "" : "s"} ` +
        `${similar.length === 1 ? "does" : "do"} not. This asymmetry may ` +
        `be load-bearing (signature stability, wire-format determinism). ` +
        `Verify before deduplicating.`,
    });
  }
  return findings;
}

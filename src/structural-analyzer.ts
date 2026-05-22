/**
 * Fireman structural analyzer.
 *
 * The plugin entrypoint hands a file path to `analyzeStructural`.
 * It:
 *   1. Detects the file's language from its extension.
 *   2. Finds sibling files in the same directory in the same language.
 *   3. Builds NormFunction units from the target + siblings (cached).
 *   4. Splits them into twin families (connected components, Jaccard ≥ 0.4).
 *   5. Runs `characterizeFamily` on each.
 *   6. Returns Finding[] for divergent functions that live in the target file.
 *
 * v0.1's regex sort-only detector is preserved in `detector.ts` for the
 * regex-layer bench (G5/G6). The plugin uses this structural analyzer.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { allTwinFamilies, characterizeFamily } from "./similarity/characterize.ts";
import { buildUnits, type FunctionUnit } from "./similarity/index.ts";
import { detectCompatShimImports, type CompatShimFinding } from "./compat-shim.ts";
import type { Finding } from "./types.ts";

// ---------------------------------------------------------------------------
// Language detection (sibling-eligible extensions per language)
// ---------------------------------------------------------------------------

interface LangSpec {
  /** Canonical language tag passed to `buildUnits`. */
  tag: string;
  /** File extensions (lowercase, no dot) that belong to this language. */
  exts: readonly string[];
}

const LANGS: readonly LangSpec[] = [
  { tag: "ts",    exts: ["ts", "tsx", "js", "jsx", "mjs", "cjs"] },
  { tag: "py",    exts: ["py"] },
  { tag: "java",  exts: ["java"] },
  { tag: "cpp",   exts: ["cpp", "cxx", "cc", "hpp", "hxx"] },
  { tag: "c",     exts: ["c", "h"] },
  { tag: "scala", exts: ["scala", "sc"] },
  { tag: "php",   exts: ["php"] },
];

function langOf(filePath: string): LangSpec | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGS.find((l) => l.exts.includes(ext)) ?? null;
}

// ---------------------------------------------------------------------------
// LRU cache for parsed file units (keyed by `path::mtime_ms`)
// ---------------------------------------------------------------------------

interface CacheEntry {
  mtimeMs: number;
  units: FunctionUnit[];
}

const MAX_CACHE_ENTRIES = 200;
const _cache = new Map<string, CacheEntry>();

function cacheGet(path: string, mtimeMs: number): FunctionUnit[] | null {
  const e = _cache.get(path);
  if (!e || e.mtimeMs !== mtimeMs) return null;
  // Refresh LRU position
  _cache.delete(path);
  _cache.set(path, e);
  return e.units;
}

function cacheSet(path: string, mtimeMs: number, units: FunctionUnit[]): void {
  if (_cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  _cache.set(path, { mtimeMs, units });
}

/** Clears the cache. For tests and warmup. */
export function clearCache(): void {
  _cache.clear();
}

// ---------------------------------------------------------------------------
// File loading with caching
// ---------------------------------------------------------------------------

async function loadFileUnits(filePath: string): Promise<FunctionUnit[]> {
  let mtimeMs: number;
  let text: string;
  try {
    const st = statSync(filePath);
    mtimeMs = st.mtimeMs;
    const cached = cacheGet(filePath, mtimeMs);
    if (cached) return cached;
    text = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  let units: FunctionUnit[];
  try {
    // Use the full path as the label so functions with the same basename
    // in different directories get distinct IDs. The label is used only
    // as the unit's `source`/`id` prefix — it's never user-facing (the
    // display strips it via id.split("::").pop()).
    units = await buildUnits([{ label: filePath, text }]);
  } catch {
    return [];
  }
  cacheSet(filePath, mtimeMs, units);
  return units;
}

// ---------------------------------------------------------------------------
// Sibling discovery — same directory, same language, capped at MAX_SIBLINGS
// ---------------------------------------------------------------------------

const MAX_SIBLINGS = 20;

function listSiblings(filePath: string, lang: LangSpec): string[] {
  const dir = dirname(filePath);
  const targetBase = basename(filePath);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const matches: string[] = [];
  for (const name of names) {
    if (name === targetBase) continue;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!lang.exts.includes(ext)) continue;
    matches.push(join(dir, name));
    if (matches.length >= MAX_SIBLINGS) break;
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Cross-file twin discovery
// ---------------------------------------------------------------------------
//
// The directory-scoped sibling list misses near-duplicate functions in
// other parts of the same package. We widen the search in a *bounded*
// way: find the nearest package-root ancestor, then collect files with
// the SAME basename as the target anywhere inside that root. Same-
// basename matches are the highest-signal cross-file twins (a
// `format.ts` in users/ vs a `format.ts` in orders/), and the
// basename-equality bound keeps the search cheap and avoids spurious
// matches across unrelated modules.

const PACKAGE_MARKERS: readonly string[] = [
  // Project-level markers Fireman recognises as a package boundary.
  // The `.fireman-scope` entry is a Fireman convention: a zero-byte file
  // marking "stop the cross-file search here", used by the bench fixtures
  // so each case directory is its own self-contained scope.
  ".fireman-scope",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "setup.py",
];

const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "vendor",
  ".venv",
  "__pycache__",
  ".next",
  ".nuxt",
]);

const MAX_CROSS_FILE_SIBLINGS = 30;
const MAX_PACKAGE_WALK_UP = 12;

/**
 * Walk up from the file's directory looking for a package marker.
 * Returns the absolute path to the package root, or null if none found
 * within MAX_PACKAGE_WALK_UP levels.
 */
function findPackageRoot(filePath: string): string | null {
  let dir = dirname(filePath);
  for (let i = 0; i < MAX_PACKAGE_WALK_UP; i++) {
    for (const marker of PACKAGE_MARKERS) {
      try {
        statSync(join(dir, marker));
        return dir;
      } catch {
        // marker not present here
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Returns paths to files within the package root that share the same
 * basename as `filePath` (excluding `filePath` itself). Bounded by
 * MAX_CROSS_FILE_SIBLINGS to keep first-read latency tractable.
 */
function listCrossFileSiblings(
  filePath: string,
  lang: LangSpec,
): string[] {
  const root = findPackageRoot(filePath);
  if (!root) return [];
  const targetBase = basename(filePath);
  const found: string[] = [];

  // BFS from the package root. Skip the directory the target lives in
  // — those siblings are already covered by listSiblings.
  const targetDir = dirname(filePath);
  const queue: string[] = [root];
  const visited = new Set<string>();

  while (queue.length > 0 && found.length < MAX_CROSS_FILE_SIBLINGS) {
    const dir = queue.shift()!;
    if (visited.has(dir)) continue;
    visited.add(dir);

    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }

    for (const name of names) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        queue.push(full);
        continue;
      }
      // Same basename, same language, not the target itself, and not in
      // the target's directory (already handled by listSiblings).
      if (
        name === targetBase &&
        dir !== targetDir &&
        lang.exts.includes(name.split(".").pop()?.toLowerCase() ?? "")
      ) {
        found.push(full);
        if (found.length >= MAX_CROSS_FILE_SIBLINGS) break;
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StructuralFinding extends Finding {
  /** Detector layer that produced this finding. */
  detector: "structural";
  /** Confidence from the characteriser (0–1). */
  confidence: number;
  /** Divergence shape: extra-call, extra-branch, etc. */
  shape: string;
}

/**
 * Analyse `filePath` against its siblings and return findings for
 * functions in `filePath` that diverge from their structural twins.
 *
 * Returns [] if:
 *   - the file's language is not supported,
 *   - no siblings in the same language are present,
 *   - no twin family forms above the Jaccard threshold,
 *   - no family has a flag-worthy structural divergence,
 *   - or the divergent function lives in a sibling rather than the target.
 *
 * Never throws. All errors are converted to an empty result.
 */
export async function analyzeStructural(filePath: string): Promise<StructuralFinding[]> {
  const lang = langOf(filePath);
  if (!lang) return [];

  // Load target file's units (cached).
  const targetUnits = await loadFileUnits(filePath);
  if (targetUnits.length === 0) return [];

  // Track which units originated in the target file (the unit `source`
  // matches the full path we used as label in loadFileUnits).
  const targetUnitIds = new Set(
    targetUnits.filter((u) => u.source === filePath).map((u) => u.id),
  );
  if (targetUnitIds.size === 0) return [];

  // Load siblings — both directory-scoped and cross-file (same basename
  // anywhere in the package root). De-duplicate by absolute path.
  const directorySiblings = listSiblings(filePath, lang);
  const crossFileSiblings = listCrossFileSiblings(filePath, lang);
  const seen = new Set<string>([filePath, ...directorySiblings]);
  const siblingPaths: string[] = [...directorySiblings];
  for (const p of crossFileSiblings) {
    if (!seen.has(p)) {
      seen.add(p);
      siblingPaths.push(p);
    }
  }

  const allUnits: FunctionUnit[] = [...targetUnits];
  for (const sp of siblingPaths) {
    const sUnits = await loadFileUnits(sp);
    for (const u of sUnits) allUnits.push(u);
  }

  if (allUnits.length < 2) return [];

  // Find every twin family in the corpus (not just the largest).
  const families = allTwinFamilies(allUnits);
  if (families.length === 0) return [];

  const findings: StructuralFinding[] = [];

  for (const family of families) {
    if (family.length < 2) continue;
    const result = characterizeFamily(family);
    if (result.verdict !== "flag") continue;
    if (!result.divergentId) continue;
    // Only surface findings whose divergent function lives in the target file.
    if (!targetUnitIds.has(result.divergentId)) continue;

    const divergentUnit = family.find((u) => u.id === result.divergentId);
    if (!divergentUnit) continue;

    findings.push({
      file: filePath,
      start_line: divergentUnit.startLine ?? 1,
      end_line: divergentUnit.endLine ?? 1,
      category: "sibling-divergence",
      rationale:
        `${divergentUnit.name} diverges structurally from ` +
        `${family.length - 1} sibling${family.length - 1 === 1 ? "" : "s"} ` +
        `(${(result.consensusIds ?? [])
          .slice(0, 3)
          .map((id) => id.split("::").pop())
          .join(", ")}): ` +
        result.summary +
        ". This asymmetry may be load-bearing; verify before unifying.",
      detector: "structural",
      confidence: result.confidence,
      shape: result.shape,
    });
  }

  return findings;
}

/**
 * Combined per-file analyzer: runs both detectors that are mission-aligned
 * (warn the agent that local context isn't sufficient to safely edit this
 * code).
 *
 *   - `analyzeStructural` — sibling and cross-file structural asymmetry
 *   - `detectCompatShimImports` — file-level imports from legacy paths
 *
 * Both signals point at things outside the local function body: divergence
 * from non-local twins, and explicit bridges to non-canonical
 * implementations. Either way, "edit only this function" is unsafe advice.
 */
export async function analyzeFile(
  filePath: string,
): Promise<Array<StructuralFinding | CompatShimFinding>> {
  // Single language gate for every detector under this entry point. We
  // refuse to analyse files in languages we don't have a parser for —
  // both the structural detector AND the regex-only compat-shim
  // detector. Without this gate, compat-shim would happily fire on
  // unsupported languages whose import syntax coincidentally matches
  // our patterns (verified: Go `import "myapp/compat/v1"` produces a
  // false positive on tree-sitter-unsupported Go files). The plugin's
  // own SUPPORTED_EXTS check guards against this for users hitting the
  // tool.execute.after hook, but the bench harness and any other direct
  // caller goes through this function — defence in depth is the right
  // posture for a "do no harm" tool.
  const lang = langOf(filePath);
  if (!lang) return [];

  const [structural, compat] = await Promise.all([
    analyzeStructural(filePath),
    Promise.resolve(detectCompatShimImports(filePath)),
  ]);
  return [...compat, ...structural];
}

/**
 * Optional warmup. The plugin can call this on startup to trigger
 * tree-sitter wasm initialisation in the background so the first
 * `read` doesn't pay the cold-start cost.
 */
export async function warmup(): Promise<void> {
  try {
    // Tiny PHP snippet exercises the tree-sitter loader. TypeScript is
    // already loaded by `import "typescript"` so no warmup needed for it.
    await buildUnits([{ label: "_warmup.php", text: "<?php\nfunction _w(){}" }]);
  } catch {
    // best-effort
  }
}

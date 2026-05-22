/**
 * Compat-shim entry-point detector.
 *
 * Mission-aligned because the signal lives outside the function's local
 * AST: a file that imports from `legacy/`, `compat/`, `polyfill/`,
 * `deprecated/`, `shim/`, `backport/`, or a versioned namespace
 * (`v1/`, `v2/`, …) is by definition a bridge between an old and a new
 * shape. Editing functions in such a file without understanding the
 * upstream contract breaks the bridge.
 *
 * The detector scans the raw file text for import-like statements,
 * extracts the imported path, and matches it against marker words
 * appearing as path segments (so `import { compatibility } from "./x"`
 * — where `compatibility` is the binding name, not a path segment —
 * does not fire). One finding is emitted per matching import,
 * positioned at the import line so the agent sees the warning before
 * it scrolls to the function body.
 */

import { readFileSync } from "node:fs";
import type { Finding } from "./types.ts";

export interface CompatShimFinding extends Finding {
  detector: "compat-shim";
  /** The imported path that matched a legacy marker. */
  import_path: string;
  /** The specific marker word in the path. */
  marker: string;
}

// Path-segment markers. A marker must be flanked by a separator (`/`,
// `\`, `.`) or at the start/end of the path. Case-insensitive.
const MARKER_RE =
  /(?:^|[/\\.])(legacy|compat|compatibility|polyfill|deprecated|shim|backport|v\d+)(?:[/\\.]|$)/i;

// Import-statement keywords across the supported languages. We accept
// each at the very beginning of the trimmed line so that occurrences
// inside expressions or string literals don't trigger.
const IMPORT_KEYWORDS_RE =
  /^(?:from|import|require|require_once|#\s*include|use)\b/;

/**
 * Returns one CompatShimFinding per import-like line whose target path
 * contains a legacy/compat/version marker as a path segment.
 *
 * Pure-text scan: never throws on parse failures, returns [] if the
 * file can't be read.
 */
export function detectCompatShimImports(
  filePath: string,
): CompatShimFinding[] {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const out: CompatShimFinding[] = [];
  const seenPaths = new Set<string>();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const ln = raw.trim();
    if (!IMPORT_KEYWORDS_RE.test(ln)) continue;

    // Extract the imported path. Three forms:
    //   1. Quoted string: "..." or '...'    (TS/JS, Python, Java strings, PHP, C string-include)
    //   2. Angle-bracketed: <...>            (C/C++ include)
    //   3. Bare path:        use Foo\Bar     (PHP/Scala/Rust)
    let path: string | null = null;
    const quoted = ln.match(/["']([^"']+)["']/);
    if (quoted && quoted[1] !== undefined) {
      path = quoted[1];
    } else {
      const angled = ln.match(/<([^>]+)>/);
      if (angled && angled[1] !== undefined) {
        path = angled[1];
      } else {
        // Bare path: `use Foo\Legacy\Bar;` or Python `import a.legacy.b`
        const bare = ln.match(
          /^(?:use|import|from)\s+([A-Za-z0-9_$.\\]+)/,
        );
        if (bare && bare[1] !== undefined) path = bare[1];
      }
    }

    if (!path) continue;
    const m = MARKER_RE.exec(path);
    if (!m) continue;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    out.push({
      file: filePath,
      start_line: i + 1,
      end_line: i + 1,
      category: "compat-shim",
      rationale:
        `imports from a compatibility path (${path}) — this file is a ` +
        `bridge between two implementations of the same surface. The ` +
        `agent should verify the upstream contract (what the non-compat ` +
        `path expects to receive / return) before editing any function ` +
        `in this file.`,
      detector: "compat-shim",
      import_path: path,
      marker: (m[1] ?? "").toLowerCase(),
    });
  }

  return out;
}

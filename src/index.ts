/**
 * opencode-fireman plugin entrypoint.
 *
 * Registers a `tool.execute.after` hook on the `read` tool. When the agent
 * reads a source file in a supported language (TypeScript, JavaScript,
 * Python, Java, C/C++, Scala, or PHP), Fireman runs its structural
 * analyser against the file and, if findings are produced, appends a
 * compact warning to the read output so the agent sees it before
 * planning any edit.
 *
 * The v0.1 legacy regex sort-only detector is preserved in `detector.ts`
 * for backward compatibility with the core bench. The production plugin
 * uses the structural+data-flow pipeline in `src/similarity/`, which
 * catches divergences across all supported languages.
 *
 * Design constraints (the plugin's guarantees):
 *   G1  Never writes to disk. Fireman only mutates the `output` object.
 *   G2  Never aborts a tool call. No `throw` on any code path here.
 *   G3  ≤ 3000ms per analysis. Wrapped in Promise.race with a hard timeout.
 *       (Tree-sitter cold start dominates the first call; subsequent
 *       calls are <100ms thanks to grammar caching and the parsed-unit
 *       LRU in structural-analyzer.ts.)
 *   G4  Max 3 findings shown per warning; fixed template.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { basename, extname } from "node:path";
import {
  analyzeFile,
  warmup,
} from "./structural-analyzer.ts";
import type { Finding } from "./types.ts";

const ANALYSIS_TIMEOUT_MS = 3000;
const MAX_FINDINGS_IN_WARNING = 3;

export const SUPPORTED_EXTS: ReadonlySet<string> = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", // TypeScript/JavaScript
  "py",                             // Python
  "java",                           // Java
  "c", "h",                         // C
  "cpp", "cxx", "cc", "hpp", "hxx", // C++
  "scala", "sc",                    // Scala
  "php",                            // PHP
]);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (r) => { clearTimeout(timer); resolve(r); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

function tagFor(f: Finding): string {
  const asAny = f as unknown as Record<string, unknown>;
  if (typeof asAny.shape === "string") {
    const conf = typeof asAny.confidence === "number" ? asAny.confidence : 0;
    return `${asAny.shape}, conf=${conf.toFixed(2)}`;
  }
  if (typeof asAny.marker === "string") return `compat-shim:${asAny.marker}`;
  return f.category;
}

function buildWarning(filePath: string, findings: Finding[]): string {
  const shown = findings.slice(0, MAX_FINDINGS_IN_WARNING);
  const basename = basenameOf(filePath);
  const lines = shown.map(
    (f) =>
      `- ${basename}:${f.start_line}-${f.end_line} ` +
      `[${tagFor(f)}]: ${f.rationale}`,
  );
  // Assemble piecewise so the "(... more suppressed)" footer only appears
  // when there's actually anything to suppress. The leading empty string
  // is intentional: `join("\n")` then produces a leading "\n" that
  // separates the warning from the preceding file content.
  const parts: string[] = [
    "",
    "<fireman>",
    "⚠ Fireman: this file contains region(s) whose meaning depends on " +
      "context outside the local function body (sibling/cross-file " +
      "asymmetry, or imports from a compatibility path). The signals may " +
      "encode an invariant — verify before editing:",
    ...lines,
  ];
  if (findings.length > MAX_FINDINGS_IN_WARNING) {
    parts.push(
      `  (… ${findings.length - MAX_FINDINGS_IN_WARNING} more findings suppressed)`,
    );
  }
  parts.push("</fireman>");
  return parts.join("\n");
}

/** Try to append `warning` to whichever string field the output exposes. */
function tryAppendToOutput(output: unknown, warning: string): boolean {
  if (output === null || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  for (const key of ["output", "result", "text", "content"]) {
    const v = o[key];
    if (typeof v === "string") {
      o[key] = v + warning;
      return true;
    }
  }
  return false;
}

function extFromPath(filePath: string): string {
  // `extname` correctly handles dotless filenames (returns ""), hidden
  // files (".bashrc" → ""), and Windows paths. Strip the leading dot
  // and lowercase for the SUPPORTED_EXTS lookup.
  const ext = extname(filePath);
  return ext.startsWith(".") ? ext.slice(1).toLowerCase() : "";
}

/** Cross-platform basename — `node:path` handles both `/` and `\`. */
function basenameOf(filePath: string): string {
  return basename(filePath) || filePath;
}

export const Fireman: Plugin = async ({ client }) => {
  // Background warmup of tree-sitter grammars. Best-effort — failures
  // here just mean the first real analysis pays the cold-start cost.
  void warmup();

  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "read") return;

      // Extract filePath from args (OpenCode's read tool uses `filePath`).
      const args = (input as { args?: Record<string, unknown> }).args ?? {};
      const filePath =
        (typeof args.filePath === "string" && args.filePath) ||
        (typeof args.file === "string" && args.file) ||
        (typeof args.path === "string" && args.path) ||
        null;
      if (!filePath) return;
      if (!SUPPORTED_EXTS.has(extFromPath(filePath))) return;

      const findings = await withTimeout(
        analyzeFile(filePath),
        ANALYSIS_TIMEOUT_MS,
      );
      if (!findings || findings.length === 0) return;

      const warning = buildWarning(filePath, findings);
      const appended = tryAppendToOutput(output, warning);

      if (!appended && client?.app?.log) {
        try {
          await client.app.log({
            body: {
              service: "fireman",
              level: "warn",
              message: "fireman-finding-not-injected",
              extra: { filePath, count: findings.length },
            },
          });
        } catch {
          // last-resort silence
        }
      }
    },
  };
};

export default Fireman;

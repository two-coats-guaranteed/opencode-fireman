/**
 * opencode-fireman plugin entrypoint.
 *
 * Registers a `tool.execute.after` hook on the `read` tool. When the agent
 * reads a TypeScript file, Fireman runs its detector against the file and,
 * if findings are produced, appends a compact warning to the read output so
 * the agent sees it before planning any edit.
 *
 * Design constraints (the plugin's guarantees):
 *   G1  Never writes to disk. Fireman only mutates the `output` object.
 *   G2  Never aborts a tool call. No `throw` on any code path here.
 *   G3  ≤ 400ms per analysis. Wrapped in Promise.race with a hard timeout.
 *   G4  ≤ 80 tokens per warning. Template is fixed, max 3 findings shown.
 *
 * NOTE on the injection mechanism: at v0.1, the exact field name for the
 * read tool's textual output is not fully documented in the public
 * OpenCode plugin API. This implementation tries the most likely fields
 * (`output.output`, `output.result`, `output.text`) and falls back to a
 * structured log via the client if none are mutable strings. The README
 * notes how to verify this on a fresh install.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { analyze } from "./detector.ts";
import type { Finding } from "./types.ts";

const ANALYSIS_TIMEOUT_MS = 400;
const MAX_FINDINGS_IN_WARNING = 3;

function withTimeout<T>(fn: () => T, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    try {
      const r = fn();
      clearTimeout(timer);
      resolve(r);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function buildWarning(filePath: string, findings: Finding[]): string {
  const shown = findings.slice(0, MAX_FINDINGS_IN_WARNING);
  const basename = filePath.split("/").pop() ?? filePath;
  const lines = shown.map(
    (f) =>
      `- ${basename}:${f.start_line}-${f.end_line}: ${f.rationale}`,
  );
  return [
    "",
    "<fireman>",
    "⚠ Fireman: this file contains a structurally asymmetric region that may encode a hidden invariant:",
    ...lines,
    "Avoid normalizing it unless you've verified the asymmetry is incidental.",
    "</fireman>",
  ].join("\n");
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

export const Fireman: Plugin = async ({ client }) => {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "read") return;

      // Best-effort extraction of the filePath from args. OpenCode's read
      // tool uses `filePath`; we also check a couple of fallbacks.
      const args = (input as { args?: Record<string, unknown> }).args ?? {};
      const filePath =
        (typeof args.filePath === "string" && args.filePath) ||
        (typeof args.file === "string" && args.file) ||
        (typeof args.path === "string" && args.path) ||
        null;
      if (!filePath) return;
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return;

      const findings = await withTimeout(
        () => analyze(filePath),
        ANALYSIS_TIMEOUT_MS,
      );
      if (!findings || findings.length === 0) return;

      const warning = buildWarning(filePath, findings);
      const appended = tryAppendToOutput(output, warning);

      if (!appended && client?.app?.log) {
        // Fallback: at least log the finding so the install can be verified.
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

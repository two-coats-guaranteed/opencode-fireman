/**
 * Residual characterisation — the divergence stage.
 *
 * The similarity engine (index.ts) finds twin functions and the shingle-
 * set residual between them. This module looks at a twin FAMILY and
 * decides what the divergence IS and what to do about it.
 *
 * Three outcomes:
 *
 *   flag      a localised structural divergence of a recognisable shape —
 *             the divergent function introduces a CALL / BRANCH / LOOP /
 *             TRY that its twins lack. Confident enough to warn. Shape
 *             names node KINDS, never library functions, so "extra-call"
 *             covers sort / escape / encode / normalise with one rule.
 *
 *   ignore    twins are identical, or there is no real twin family.
 *
 *   escalate  something is there but the structural detector cannot judge
 *             it on shape alone. Two causes:
 *               • label-only divergence: same structure, different callee
 *                 or literal value (e.g. toLowerCase vs toLocaleLowerCase,
 *                 "base64" vs "base64url", /^...$/ vs /.../). These are
 *                 exactly the cases that require semantic knowledge.
 *               • unclassified structure: structural residual present but
 *                 no recognisable control/call node introduced.
 *             Escalate is not a failure mode — it is the designed seam.
 *             Heuristics deliberately stop here; genuine semantic
 *             judgement is routed to an LLM via OpenCode's API. That call
 *             is NOT implemented. `resolveByLLM` is the seam it will
 *             occupy. Re-implementing an IDE analyser in rules is a road
 *             to nowhere; hard cases belong to the model.
 */

import { jaccard } from "./index.ts";
import {
  makeNode,
  type NormKind,
  type NormNode,
  preorder,
  size,
} from "./normalized-ast.ts";
import type { FunctionUnit } from "./index.ts";
import { criticalPathAnalysis } from "./dataflow.ts";
import {
  buildCallGraph,
  callGraphSummary,
  type CallGraphSummary,
} from "./callgraph.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Verdict = "flag" | "escalate" | "ignore";

export type DivergenceShape =
  | "none"
  | "extra-call"
  | "extra-branch"
  | "extra-loop"
  | "extra-try"
  | "label-divergence"
  | "structural-unclassified";

export interface EscalationRequest {
  reason: "label-divergence" | "structural-unclassified";
  /** IDs of all family members involved. */
  functionIds: string[];
  detail: string;
  /**
   * Actual source text of the consensus function(s).
   * Populated when available; absent for programmatically-built units.
   */
  consensusSources: Array<{ name: string; sourceText: string }>;
  /** Source text of the divergent function. */
  divergentSource: { name: string; sourceText: string } | null;
  /**
   * Intra-procedural critical-path result.
   * Is the structural divergence on a def-use path from parameters to
   * the function's RETURN value?
   */
  criticalPath: {
    onCriticalPath: boolean;
    criticalVars: string[];
    offPathVars: string[];
    summary: string;
  };
  /**
   * Inter-procedural call-graph context within the analysed corpus.
   */
  callGraph: CallGraphSummary;
}

export interface Characterization {
  verdict: Verdict;
  /** Confidence in a definitive (flag / ignore) call. Low ⇒ escalate. */
  confidence: number;
  shape: DivergenceShape;
  summary: string;
  /**
   * ID of the function that is structurally divergent from the consensus.
   * Present when verdict is "flag" or "escalate" with reason
   * "structural-unclassified" / "label-divergence". The plugin uses this
   * to know which specific function in the family to surface.
   */
  divergentId?: string;
  /** IDs of the consensus functions (everyone else in the family). */
  consensusIds?: string[];
  /** Present when verdict === "escalate" — what the LLM call will consume. */
  escalation?: EscalationRequest;
}

// ---------------------------------------------------------------------------
// LLM escalation seam
// ---------------------------------------------------------------------------

export type LLMResolution =
  | { resolved: true; verdict: "flag" | "ignore"; reasoning: string }
  | { resolved: false; error?: string };

/**
 * Forward `req` to an LLM and convert its semantic judgement into
 * flag / ignore.
 *
 * The heuristic layer deliberately stops at "is there structural
 * asymmetry?" — it cannot tell load-bearing from cosmetic. That
 * is the model's job.  Re-implementing IDE analysis in rules is a
 * road to nowhere.
 *
 * Requires the ANTHROPIC_API_KEY environment variable. Returns
 * `{ resolved: false }` if the key is absent, the API call fails,
 * or the response cannot be parsed.
 *
 * Consumers should always check `resolved` before using `verdict`.
 */
export async function resolveByLLM(
  req: EscalationRequest,
): Promise<LLMResolution> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return { resolved: false, error: "ANTHROPIC_API_KEY not set" };

  const consensusBlock = req.consensusSources.length
    ? req.consensusSources
        .map(
          (s) =>
            `### ${s.name}\n\`\`\`\n${s.sourceText.trim()}\n\`\`\``,
        )
        .join("\n\n")
    : "(source not available)";

  const divergentBlock = req.divergentSource
    ? `### ${req.divergentSource.name}\n\`\`\`\n${req.divergentSource.sourceText.trim()}\n\`\`\``
    : "(source not available)";

  const divergentName = req.divergentSource?.name ?? req.functionIds.at(-1) ?? "the divergent function";

  const cpSection =
    `## Data-flow analysis (intra-procedural)\n` +
    `Critical path to return value: **${req.criticalPath.onCriticalPath ? "YES" : "NO"}**\n` +
    req.criticalPath.summary +
    (req.criticalPath.criticalVars.length > 0
      ? `\nVariables on path: ${req.criticalPath.criticalVars.join(", ")}`
      : "") +
    (req.criticalPath.offPathVars.length > 0
      ? `\nVariables NOT on path: ${req.criticalPath.offPathVars.join(", ")}`
      : "");

  const cgSection =
    `## Call-graph context (within the analysed files)\n` +
    req.callGraph.summary +
    (req.callGraph.extraExternalCalls.length > 0
      ? `\nExternal functions called only by the divergent version: ${req.callGraph.extraExternalCalls.join(", ")}`
      : "");

  const prompt = `You are reviewing code to decide whether a structural difference between sibling functions is load-bearing or cosmetic.

## The twin family (consensus)
These functions all share the same structural pattern:

${consensusBlock}

## The divergent function
This function belongs to the same family but differs from its twins:

${divergentBlock}

## Structural difference detected
Reason: ${req.reason === "label-divergence" ? "functions are structurally identical but differ in a key identifier or literal (e.g. method name, string value, numeric constant)" : "functions differ in structural shape (extra statements, different control flow)"}
Detail: ${req.detail}

${cpSection}

${cgSection}

## Your task
Using ALL of the above — the source code, the structural diff, the data-flow analysis, and the call-graph context — decide whether the difference in \`${divergentName}\` compared to its twins is **load-bearing** (removing or normalising the difference would change observable behaviour, produce different output, or break correctness) or **cosmetic** (safe to normalise without affecting any observable behaviour).

Respond ONLY with a JSON object and nothing else:
{"verdict": "load_bearing" | "cosmetic", "reasoning": "<one concise sentence explaining why>"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        resolved: false,
        error: `API ${response.status}: ${await response.text()}`,
      };
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");

    // Strip any markdown fences the model might add despite instructions
    const clean = text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      verdict: string;
      reasoning: string;
    };

    const verdict =
      parsed.verdict === "load_bearing"
        ? ("flag" as const)
        : ("ignore" as const);

    return { resolved: true, verdict, reasoning: parsed.reasoning };
  } catch (err) {
    return {
      resolved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Structural key (memoised) — ignores labels, depends only on shape
// ---------------------------------------------------------------------------

const keyCache = new WeakMap<NormNode, string>();

function structKey(n: NormNode): string {
  let k = keyCache.get(n);
  if (k !== undefined) return k;
  k =
    n.children.length === 0
      ? n.kind
      : `${n.kind}(${n.children.map(structKey).join(",")})`;
  keyCache.set(n, k);
  return k;
}

// ---------------------------------------------------------------------------
// Tree diff
// ---------------------------------------------------------------------------

interface KindMismatch {
  a: NormNode;
  b: NormNode;
}

interface LabelDiff {
  kind: NormKind;
  a: string | undefined;
  b: string | undefined;
}

interface TreeDiff {
  /** Subtrees present in B but not structurally matched in A. */
  insertions: NormNode[];
  /** Subtrees present in A but not structurally matched in B. */
  deletions: NormNode[];
  /** Positions where A and B have nodes of *different kinds*. */
  kindMismatches: KindMismatch[];
  /** Positions where A and B are structurally identical but labels differ. */
  labelDiffs: LabelDiff[];
}

/** Align two trees and collect all structural / label differences. */
function treeDiff(a: NormNode, b: NormNode): TreeDiff {
  const d: TreeDiff = {
    insertions: [],
    deletions: [],
    kindMismatches: [],
    labelDiffs: [],
  };
  diffInto(a, b, d);
  return d;
}

/**
 * When same-kind nodes are unmatched after LCS alignment (a
 * "substitution": same structural role, different content), recurse
 * into them rather than treating them as wholesale deletion+insertion.
 * This prevents the noise where BOTH sides have a CALL node (e.g. a
 * `.push()` inside a loop on each side), which would cancel out in the
 * significant-kinds arithmetic and produce an empty `netIntroduced`.
 */
function pairAndDiff(
  unmatchedA: NormNode[],
  unmatchedB: NormNode[],
  d: TreeDiff,
): void {
  let i = 0;
  let j = 0;
  while (i < unmatchedA.length && j < unmatchedB.length) {
    const a = unmatchedA[i]!;
    const b = unmatchedB[j]!;
    if (a.kind === b.kind) {
      diffInto(a, b, d);
      i++;
      j++;
    } else {
      // Different kinds at this position — treat A as deleted and advance.
      d.deletions.push(a);
      i++;
    }
  }
  while (i < unmatchedA.length) {
    d.deletions.push(unmatchedA[i]!);
    i++;
  }
  while (j < unmatchedB.length) {
    d.insertions.push(unmatchedB[j]!);
    j++;
  }
}

function diffInto(a: NormNode, b: NormNode, d: TreeDiff): void {
  // Structurally identical — only label differences possible.
  if (structKey(a) === structKey(b)) {
    collectLabelDiffs(a, b, d.labelDiffs);
    return;
  }
  // Different root kinds — report the whole subtree pair as a mismatch.
  if (a.kind !== b.kind) {
    d.kindMismatches.push({ a, b });
    return;
  }
  // Same kind, different internal structure — align children by structKey,
  // then pair same-kind remainders rather than listing them as raw
  // insertions/deletions.
  const matched = lcsMatch(a.children, b.children);
  const matchedA = new Set(matched.map((m) => m[0]));
  const matchedB = new Set(matched.map((m) => m[1]));
  for (const [ia, ib] of matched) {
    diffInto(a.children[ia]!, b.children[ib]!, d);
  }
  pairAndDiff(
    a.children.filter((_, i) => !matchedA.has(i)),
    b.children.filter((_, i) => !matchedB.has(i)),
    d,
  );
}

/** Collect label diffs between two trees of identical structure. */
function collectLabelDiffs(
  a: NormNode,
  b: NormNode,
  out: LabelDiff[],
): void {
  if (a.label !== b.label) {
    out.push({ kind: a.kind, a: a.label, b: b.label });
  }
  for (let i = 0; i < a.children.length; i++) {
    collectLabelDiffs(a.children[i]!, b.children[i]!, out);
  }
}

/**
 * LCS of two NormNode arrays, keyed by structural hash.
 * Returns the matched index pairs.
 */
function lcsMatch(
  as: NormNode[],
  bs: NormNode[],
): Array<[number, number]> {
  const m = as.length;
  const n = bs.length;
  const ka = as.map(structKey);
  const kb = bs.map(structKey);

  // dp[i][j] = LCS length of as[i..], bs[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (ka[i] === kb[j]) {
        dp[i]![j] = (dp[i + 1]![j + 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
      }
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (ka[i] === kb[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Shape classification
// ---------------------------------------------------------------------------

const SIGNIFICANT: ReadonlySet<NormKind> = new Set<NormKind>([
  "CALL",
  "BRANCH",
  "LOOP",
  "TRY",
]);

function significantKinds(nodes: NormNode[]): Set<NormKind> {
  const s = new Set<NormKind>();
  for (const root of nodes) {
    for (const node of preorder(root)) {
      if (SIGNIFICANT.has(node.kind)) s.add(node.kind);
    }
  }
  return s;
}

const SHAPE_PRIORITY: NormKind[] = ["CALL", "BRANCH", "LOOP", "TRY"];

function primaryShape(kinds: Set<NormKind>): DivergenceShape {
  for (const k of SHAPE_PRIORITY) {
    if (kinds.has(k)) {
      if (k === "CALL") return "extra-call";
      if (k === "BRANCH") return "extra-branch";
      if (k === "LOOP") return "extra-loop";
      return "extra-try";
    }
  }
  return "structural-unclassified";
}

// Labels on these kinds carry semantic meaning; variation on other kinds
// (IDENT_VAR, IDENT_PARAM, IDENT_PROP) is routine across siblings.
function isMeaningfulLabelKind(k: NormKind): boolean {
  return (
    k === "IDENT_CALLEE" ||
    k === "LITERAL_STR" ||
    k === "LITERAL_NUM" ||
    k === "LITERAL_OTHER"
  );
}

// ---------------------------------------------------------------------------
// Pair-level characterisation
// ---------------------------------------------------------------------------

function characterizePair(
  consensus: FunctionUnit,
  divergent: FunctionUnit,
  familyIds: string[],
  callGraph: ReturnType<typeof buildCallGraph>,
): Characterization {
  const diff = treeDiff(consensus.tree, divergent.tree);

  const insSig = significantKinds([
    ...diff.insertions,
    ...diff.kindMismatches.map((k) => k.b),
  ]);
  const delSig = significantKinds([
    ...diff.deletions,
    ...diff.kindMismatches.map((k) => k.a),
  ]);
  // Kinds introduced by the divergent function but absent from consensus.
  const netIntroduced = new Set<NormKind>(
    [...insSig].filter((k) => !delSig.has(k)),
  );

  const hasStructural =
    diff.insertions.length > 0 ||
    diff.deletions.length > 0 ||
    diff.kindMismatches.length > 0;

  // Shared data-flow / call-graph context for any escalation.
  const cpa = criticalPathAnalysis(diff.insertions, divergent.tree);
  const cgSummary = callGraphSummary(
    divergent,
    [consensus],
    callGraph,
  );

  const consensusSources = consensus.sourceText
    ? [{ name: consensus.name, sourceText: consensus.sourceText }]
    : [];
  const divergentSource = divergent.sourceText
    ? { name: divergent.name, sourceText: divergent.sourceText }
    : null;

  if (netIntroduced.size > 0) {
    const shape = primaryShape(netIntroduced);

    // Data-flow check: if the insertion is provably OFF the critical path
    // (defines variables that never reach RETURN), the structural shape alone
    // is not enough to flag — route to the LLM for semantic judgement.
    if (!cpa.onCriticalPath && diff.insertions.length > 0) {
      return {
        verdict: "escalate",
        confidence: 0.45,
        shape,
        summary:
          `divergent function has extra ${shape} but it is not on the ` +
          `critical path to the return value — needs semantic review`,
        divergentId: divergent.id,
        consensusIds: [consensus.id],
        escalation: {
          reason: "structural-unclassified",
          functionIds: familyIds,
          detail:
            `shape: ${shape}; critical-path: ${cpa.summary}; ` +
            `call-graph: ${cgSummary.summary}`,
          consensusSources,
          divergentSource,
          criticalPath: cpa,
          callGraph: cgSummary,
        },
      };
    }

    return {
      verdict: "flag",
      confidence: cpa.onCriticalPath ? 0.85 : 0.7,
      shape,
      summary:
        `divergent function introduces ` +
        `${[...netIntroduced].join("+")} that its twins lack` +
        (cpa.onCriticalPath
          ? ` — on the critical path (${cpa.summary})`
          : ""),
      divergentId: divergent.id,
      consensusIds: [consensus.id],
    };
  }

  if (hasStructural) {
    // There is a structural residual but it does not introduce a
    // recognisable control/call shape — route to the LLM.
    return {
      verdict: "escalate",
      confidence: 0.35,
      shape: "structural-unclassified",
      summary:
        "structural divergence present but no recognisable call/control shape",
      divergentId: divergent.id,
      consensusIds: [consensus.id],
      escalation: {
        reason: "structural-unclassified",
        functionIds: familyIds,
        detail:
          `insertions: ${diff.insertions.length}, ` +
          `deletions: ${diff.deletions.length}, ` +
          `kind mismatches: ${diff.kindMismatches.length}; ` +
          `critical-path: ${cpa.summary}; ` +
          `call-graph: ${cgSummary.summary}`,
        consensusSources,
        divergentSource,
        criticalPath: cpa,
        callGraph: cgSummary,
      },
    };
  }

  // No structural residual at all — structKey(consensus) === structKey(divergent)
  // would have been caught in the all-same group. This path is a safety
  // fall-through; in practice it should not be reached from ≥2 groups.
  return {
    verdict: "ignore",
    confidence: 0.9,
    shape: "none",
    summary: "no meaningful divergence detected",
  };
}

// ---------------------------------------------------------------------------
// Family-level label-divergence detection
// ---------------------------------------------------------------------------

interface LabelFinding {
  kind: NormKind;
  majority: string;
  outlierLabel: string;
}

function labelDivergenceInFamily(family: FunctionUnit[]): LabelFinding[] {
  const lists = family.map((u) => [...preorder(u.tree)]);
  const len = lists[0]!.length;
  const findings: LabelFinding[] = [];

  for (let p = 0; p < len; p++) {
    const kind = lists[0]![p]!.kind;
    if (!isMeaningfulLabelKind(kind)) continue;

    const labels = lists.map((l) => l[p]!.label ?? "");

    const counts = new Map<string, number>();
    for (const lab of labels) {
      counts.set(lab, (counts.get(lab) ?? 0) + 1);
    }

    let majLabel = "";
    let majCount = 0;
    for (const [lab, c] of counts) {
      if (c > majCount) {
        majCount = c;
        majLabel = lab;
      }
    }

    // A clear majority exists and at least one member disagrees.
    if (majCount >= Math.ceil(family.length / 2) && counts.size > 1) {
      for (const [lab] of counts) {
        if (lab !== majLabel) {
          findings.push({ kind, majority: majLabel, outlierLabel: lab });
          break; // one finding per position is enough
        }
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Twin-family extraction (largest connected component by Jaccard >= 0.5)
// ---------------------------------------------------------------------------

function twinFamily(
  units: FunctionUnit[],
  threshold = 0.4,
): FunctionUnit[] {
  const families = allTwinFamilies(units, threshold);
  let best: FunctionUnit[] = [];
  for (const f of families) if (f.length > best.length) best = f;
  return best;
}

/**
 * Returns ALL twin families (connected components ≥ 2) in the unit set.
 * Used by the plugin to characterise every family in a directory, not
 * only the largest.
 */
export function allTwinFamilies(
  units: FunctionUnit[],
  threshold = 0.4,
): FunctionUnit[][] {
  const n = units.length;
  const adj: number[][] = units.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccard(units[i]!.shingles, units[j]!.shingles) >= threshold) {
        adj[i]!.push(j);
        adj[j]!.push(i);
      }
    }
  }

  const seen = new Array<boolean>(n).fill(false);
  const out: FunctionUnit[][] = [];

  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const comp: number[] = [];
    const stack: number[] = [i];
    seen[i] = true;
    while (stack.length > 0) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj[u]!) {
        if (!seen[v]) {
          seen[v] = true;
          stack.push(v);
        }
      }
    }
    if (comp.length >= 2) out.push(comp.map((idx) => units[idx]!));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Characterise the divergence within a set of function units.
 *
 * Expects the full set of units extracted from a bench case (or a
 * directory in production). The twin-family step filters to the largest
 * cluster of mutually-similar functions, so unrelated bystanders do not
 * pollute the analysis.
 */
export function characterizeFamily(
  units: FunctionUnit[],
): Characterization {
  if (units.length < 2) {
    return {
      verdict: "ignore",
      confidence: 0.95,
      shape: "none",
      summary: "no twin family (fewer than two functions to compare)",
    };
  }

  // Build the intra-corpus call graph once for the whole family.
  const cg = buildCallGraph(units);

  const family = twinFamily(units);
  if (family.length < 2) {
    return {
      verdict: "ignore",
      confidence: 0.9,
      shape: "none",
      summary: "no structurally-similar twin pair found",
    };
  }

  // Group family members by structural key.
  const groups = new Map<string, FunctionUnit[]>();
  for (const u of family) {
    const k = structKey(u.tree);
    const grp = groups.get(k);
    if (grp) grp.push(u);
    else groups.set(k, [u]);
  }

  const familyIds = family.map((u) => u.id);

  if (groups.size === 1) {
    // All structurally identical — check for label-level divergence.
    const findings = labelDivergenceInFamily(family);
    if (findings.length === 0) {
      return {
        verdict: "ignore",
        confidence: 0.95,
        shape: "none",
        summary: "twins are structurally and semantically identical",
      };
    }
    const detail = findings
      .map((f) => `${f.kind} ${JSON.stringify(f.majority)} vs ${JSON.stringify(f.outlierLabel)}`)
      .join("; ");

    // Find the label outlier(s) to use as the divergent source in the LLM prompt.
    // We compare each unit's label sequence to the majority at each finding position.
    const lists = family.map((u) => [...preorder(u.tree)]);
    const firstFinding = findings[0];
    const outlierUnits = firstFinding
      ? family.filter((u, i) => {
          const node = lists[i]!.find(
            (n) => n.kind === firstFinding.kind && n.label === firstFinding.outlierLabel,
          );
          return node !== undefined;
        })
      : [];
    const outlier = outlierUnits[0];
    const consensusMajority = family.filter((u) => u !== outlier);
    const consensusSources = consensusMajority
      .filter((u) => u.sourceText)
      .slice(0, 2)
      .map((u) => ({ name: u.name, sourceText: u.sourceText! }));
    const divergentSource = outlier?.sourceText
      ? { name: outlier.name, sourceText: outlier.sourceText }
      : null;

    const cgSummaryLabelDiv = outlier
      ? callGraphSummary(outlier, consensusMajority, cg)
      : { callers: [], callees: [], extraExternalCalls: [], summary: "" };

    // Label divergence is purely in identifier names — insertions are empty.
    // Critical path is N/A for label-only divergence; mark as on-path
    // conservatively (the label IS in the function's structure).
    const cpLabelDiv = {
      onCriticalPath: true,
      criticalVars: [] as string[],
      offPathVars: [] as string[],
      summary: "label-only divergence — structural shape is identical",
    };

    return {
      verdict: "escalate",
      confidence: 0.4,
      shape: "label-divergence",
      summary: `structurally identical twins differ in label(s): ${detail}`,
      ...(outlier ? { divergentId: outlier.id } : {}),
      consensusIds: consensusMajority.map((u) => u.id),
      escalation: {
        reason: "label-divergence",
        functionIds: familyIds,
        detail,
        consensusSources,
        divergentSource,
        criticalPath: cpLabelDiv,
        callGraph: cgSummaryLabelDiv,
      },
    };
  }

  // Structural divergence: pick consensus (largest group) and a divergent member.
  // When groups tie in size (common with 2-function families), use tree size
  // as a tie-breaker — the smaller tree is the baseline consensus, and any
  // larger tree is treated as "added structure" (divergent). Without this
  // tie-break, the diff is computed backwards: insertions come out empty
  // (the smaller tree has no extra structure) and the verdict misses to
  // escalate when it should flag.
  const sorted = [...groups.values()].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    return size(a[0]!.tree) - size(b[0]!.tree);
  });
  const consensus = sorted[0]![0]!;
  const divergent = sorted[1]![0]!;
  return characterizePair(consensus, divergent, familyIds, cg);
}

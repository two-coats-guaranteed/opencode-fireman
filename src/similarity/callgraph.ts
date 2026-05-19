/**
 * Inter-procedural call graph over a corpus of NormFunction units.
 *
 * Language-agnostic: built entirely from the IDENT_CALLEE labels that
 * every adapter places on call nodes, plus the function names on each
 * FunctionUnit. No language-specific knowledge required.
 *
 * ## What it captures
 *
 * A direct syntactic call edge A → B exists when function A contains a
 * CALL node whose IDENT_CALLEE label equals B's name. Only calls to
 * functions WITHIN the analysed corpus are captured; calls to library
 * functions are recorded as "external targets" but not as graph edges.
 *
 * ## What it deliberately does NOT do
 *
 * - Dynamic dispatch / virtual calls.
 * - Closure / higher-order function tracking.
 * - Cross-file calls where the callee is not in the analysed corpus.
 * - Argument-position sensitivity (which arg flows where).
 *
 * These are left for a future pass. The current analysis is sound for
 * direct named calls — the common case in the functions Fireman inspects.
 */

import type { FunctionUnit } from "./index.ts";
import { preorder } from "./normalized-ast.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallGraph {
  /**
   * Direct call edges within the corpus.
   * callerId → set of callee unit ids.
   */
  outEdges: Map<string, Set<string>>;

  /**
   * Reverse of outEdges: callee unit id → set of caller unit ids.
   */
  inEdges: Map<string, Set<string>>;

  /**
   * All IDENT_CALLEE labels found in a unit's CALL subtrees — includes
   * both corpus-internal and external (library) call targets.
   */
  allCallTargets: Map<string, Set<string>>;

  /** The original units used to build this graph. */
  units: ReadonlyArray<FunctionUnit>;
}

export interface ReachabilityResult {
  /** True if there is any call path from `fromId` to `toId`. */
  reachable: boolean;
  /** One shortest path, as a list of function names. Empty when not reachable. */
  path: string[];
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Collect all IDENT_CALLEE labels from CALL nodes in a NormNode tree.
 * Returns the set of function names this unit syntactically calls.
 */
export function callTargetLabels(unit: FunctionUnit): Set<string> {
  const targets = new Set<string>();
  for (const node of preorder(unit.tree)) {
    if (node.kind === "CALL") {
      for (const child of preorder(node)) {
        if (child.kind === "IDENT_CALLEE" && child.label !== undefined) {
          targets.add(child.label);
        }
      }
    }
  }
  return targets;
}

/**
 * Build a call graph over the analysed corpus.
 *
 * An edge A → B is added when A has a CALL node whose IDENT_CALLEE label
 * matches the name of function B in the corpus.  Method-name clashes (two
 * functions with the same name in different files) are handled by adding
 * edges to ALL matching targets.
 */
export function buildCallGraph(units: FunctionUnit[]): CallGraph {
  // Index: function name → unit ids with that name
  const byName = new Map<string, string[]>();
  for (const u of units) {
    const ids = byName.get(u.name);
    if (ids) ids.push(u.id);
    else byName.set(u.name, [u.id]);
  }

  const outEdges = new Map<string, Set<string>>();
  const inEdges = new Map<string, Set<string>>();
  const allCallTargets = new Map<string, Set<string>>();

  // Initialise empty edge sets for every unit.
  for (const u of units) {
    outEdges.set(u.id, new Set());
    inEdges.set(u.id, new Set());
  }

  for (const caller of units) {
    const targets = callTargetLabels(caller);
    allCallTargets.set(caller.id, targets);

    for (const label of targets) {
      const calleeIds = byName.get(label) ?? [];
      for (const calleeId of calleeIds) {
        if (calleeId === caller.id) continue; // skip self-calls for simplicity
        outEdges.get(caller.id)!.add(calleeId);
        inEdges.get(calleeId)!.add(caller.id);
      }
    }
  }

  return { outEdges, inEdges, allCallTargets, units };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Resolve a unit id to the FunctionUnit. */
export function unitById(
  id: string,
  cg: CallGraph,
): FunctionUnit | undefined {
  return cg.units.find((u) => u.id === id);
}

/** Direct callees of a unit (corpus-internal only). */
export function directCallees(unit: FunctionUnit, cg: CallGraph): FunctionUnit[] {
  const ids = cg.outEdges.get(unit.id) ?? new Set<string>();
  return [...ids].flatMap((id) => {
    const u = unitById(id, cg);
    return u ? [u] : [];
  });
}

/** Direct callers of a unit within the corpus. */
export function directCallers(unit: FunctionUnit, cg: CallGraph): FunctionUnit[] {
  const ids = cg.inEdges.get(unit.id) ?? new Set<string>();
  return [...ids].flatMap((id) => {
    const u = unitById(id, cg);
    return u ? [u] : [];
  });
}

/**
 * All external (non-corpus) function names called by `unit`.
 * Useful for showing the LLM what library functions the divergent function
 * uses that the consensus does not.
 */
export function externalCallTargets(
  unit: FunctionUnit,
  cg: CallGraph,
): Set<string> {
  const all = cg.allCallTargets.get(unit.id) ?? new Set<string>();
  const internalNames = new Set(cg.units.map((u) => u.name));
  return new Set([...all].filter((t) => !internalNames.has(t)));
}

/**
 * BFS reachability: is there any call path from `from` to `to`?
 * Follows outEdges (caller → callee direction).
 */
export function reachable(
  from: FunctionUnit,
  to: FunctionUnit,
  cg: CallGraph,
): ReachabilityResult {
  if (from.id === to.id) return { reachable: true, path: [from.name] };

  // BFS tracking paths
  const prev = new Map<string, string>(); // id → previous id
  const queue: string[] = [from.id];
  const visited = new Set<string>([from.id]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of cg.outEdges.get(cur) ?? []) {
      if (visited.has(next)) continue;
      prev.set(next, cur);
      if (next === to.id) {
        // Reconstruct path
        const path: string[] = [];
        let node: string | undefined = next;
        while (node !== undefined) {
          const u = unitById(node, cg);
          if (u) path.unshift(u.name);
          node = prev.get(node);
        }
        return { reachable: true, path };
      }
      visited.add(next);
      queue.push(next);
    }
  }
  return { reachable: false, path: [] };
}

/**
 * All units reachable from `from` via any number of call edges.
 */
export function allReachable(
  from: FunctionUnit,
  cg: CallGraph,
): FunctionUnit[] {
  const visited = new Set<string>([from.id]);
  const queue = [from.id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of cg.outEdges.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  visited.delete(from.id);
  return [...visited].flatMap((id) => {
    const u = unitById(id, cg);
    return u ? [u] : [];
  });
}

// ---------------------------------------------------------------------------
// Narrative summary (for LLM context)
// ---------------------------------------------------------------------------

export interface CallGraphSummary {
  /**
   * For the divergent function: which corpus functions call it?
   * If its callers use the return value in an order-sensitive way, the
   * divergence is load-bearing.
   */
  callers: string[];
  /**
   * Which corpus functions does the divergent function call?
   */
  callees: string[];
  /**
   * External library functions called by the divergent function but NOT
   * by the consensus functions. Key signal: if the divergent function
   * calls a sort/ordering function that consensus does not, that's notable.
   */
  extraExternalCalls: string[];
  /** Human-readable narrative. */
  summary: string;
}

export function callGraphSummary(
  divergent: FunctionUnit,
  consensus: FunctionUnit[],
  cg: CallGraph,
): CallGraphSummary {
  const callers = directCallers(divergent, cg).map((u) => u.name);
  const callees = directCallees(divergent, cg).map((u) => u.name);

  const divergentExternal = externalCallTargets(divergent, cg);
  const consensusExternal = new Set(
    consensus.flatMap((u) => [...(externalCallTargets(u, cg))]),
  );
  const extraExternalCalls = [...divergentExternal].filter(
    (t) => !consensusExternal.has(t),
  );

  const parts: string[] = [];
  if (callers.length > 0) {
    parts.push(`called by: ${callers.join(", ")}`);
  } else {
    parts.push("no corpus callers found (may be called from outside the analysed files)");
  }
  if (callees.length > 0) {
    parts.push(`calls corpus functions: ${callees.join(", ")}`);
  }
  if (extraExternalCalls.length > 0) {
    parts.push(
      `calls these external functions that its twins do not: ${extraExternalCalls.join(", ")}`,
    );
  }

  return {
    callers,
    callees,
    extraExternalCalls,
    summary: parts.join("; "),
  };
}

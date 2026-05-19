/**
 * Intra-procedural data-flow analysis over NormNode trees.
 *
 * The NormNode vocabulary is already language-agnostic: every adapter
 * (TypeScript, Python, Java, C/C++, Scala) produces the same kinds and
 * the same labelling scheme. This module therefore works identically
 * across all of them.
 *
 * ## What it builds
 *
 * A label-based forward-reachability graph: an edge `y → x` means
 * "the value of variable y flows into the definition of variable x".
 * Starting from a set of variables defined by the *structural divergence*
 * (the NormNodes present in the divergent function but absent from its
 * twins), we ask: can any of those variables reach a RETURN node via
 * the forward-reachability graph?
 *
 *   If YES → the divergence is on the *critical path* to the function's
 *             output. It potentially affects observable behaviour.
 *   If NO  → the divergence is OFF the critical path. It is a strong
 *             signal (not proof) that the change is cosmetic.
 *
 * ## What it deliberately does NOT do
 *
 * - Side-effect / mutation analysis (e.g., array.push is tracked
 *   structurally but not semantically).
 * - Alias analysis or pointer dereference.
 * - Cross-function (inter-procedural) flow — see callgraph.ts.
 * - Order-sensitivity: reachability tells us that a sort result affects
 *   the output, not WHETHER that effect is load-bearing. The LLM tier
 *   makes the final call.
 */

import { type NormKind, type NormNode, preorder } from "./normalized-ast.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowGraph {
  /**
   * Forward edges: y → set of x such that "y is used to define x".
   * Following forward edges from a label traces what depends on it.
   */
  forward: Map<string, Set<string>>;

  /**
   * Labels used directly inside RETURN subtrees (without going through
   * an intermediate definition).
   */
  returnUses: Set<string>;

  /**
   * All labels that appear as definitions (DECL / ASSIGN / PARAM).
   */
  allDefs: Set<string>;

  /**
   * For every LOOP: the iterable labels that produce the loop variable.
   * Edge direction: iterable-label → loop-var-label.
   * Already folded into `forward`; kept separately for diagnostics.
   */
  loopEdges: Array<{ from: string; to: string }>;
}

export interface CriticalPathResult {
  /** True if any insertion-defined variable can reach a RETURN. */
  onCriticalPath: boolean;
  /**
   * Variables defined by the insertion subtrees that flow to RETURN
   * (possibly transitively).
   */
  criticalVars: string[];
  /**
   * Variables defined by the insertion subtrees that do NOT flow to
   * any RETURN — strong signal that they are cosmetic.
   */
  offPathVars: string[];
  /**
   * Human-readable one-sentence summary for the LLM prompt.
   */
  summary: string;
}

// ---------------------------------------------------------------------------
// Flow graph construction
// ---------------------------------------------------------------------------

/**
 * Collect variable labels defined at the TOP level of a node
 * (i.e., the IDENT_VAR/IDENT_PARAM direct children that are in
 * lvalue / binding position).
 */
function defsOf(node: NormNode): string[] {
  const labels: string[] = [];
  switch (node.kind) {
    case "PARAM":
      for (const c of node.children) {
        if (
          (c.kind === "IDENT_PARAM" || c.kind === "IDENT_VAR") &&
          c.label !== undefined
        ) {
          labels.push(c.label);
        }
        // Destructured params: look one level deeper inside OTHER
        if (c.kind === "OTHER") {
          for (const gc of c.children) {
            if (
              (gc.kind === "IDENT_VAR" || gc.kind === "IDENT_PARAM") &&
              gc.label !== undefined
            ) {
              labels.push(gc.label);
            }
          }
        }
      }
      break;

    case "DECL": {
      // First IDENT_VAR (or first OTHER containing IDENT_VARs) is the lvalue.
      let foundLhs = false;
      for (const c of node.children) {
        if (foundLhs) break;
        if (c.kind === "IDENT_VAR" && c.label !== undefined) {
          labels.push(c.label);
          foundLhs = true;
        } else if (c.kind === "OTHER") {
          // Destructuring pattern: collect IDENT_VAR at depth 1
          for (const gc of c.children) {
            if (gc.kind === "IDENT_VAR" && gc.label !== undefined) {
              labels.push(gc.label);
            }
          }
          foundLhs = true;
        }
      }
      break;
    }

    case "ASSIGN": {
      // First IDENT_VAR child is the assignment target.
      const first = node.children.find(
        (c) =>
          (c.kind === "IDENT_VAR" || c.kind === "IDENT_PARAM") &&
          c.label !== undefined,
      );
      if (first?.label !== undefined) labels.push(first.label);
      break;
    }

    default:
      break;
  }
  return labels;
}

/**
 * Collect all variable labels used in the VALUE portion of a node
 * (i.e., everything except the lvalue binding site itself).
 *
 * For DECL/ASSIGN: skip the first lvalue child, collect from the rest.
 * For all other nodes: collect from all children recursively.
 */
function usesOf(node: NormNode): string[] {
  const labels: string[] = [];

  if (node.kind === "DECL" || node.kind === "ASSIGN") {
    // Skip the first child that represents the lvalue binding.
    let skippedLhs = false;
    for (const c of node.children) {
      if (!skippedLhs && (c.kind === "IDENT_VAR" || c.kind === "OTHER")) {
        skippedLhs = true;
        continue;
      }
      collectAllIdents(c, labels);
    }
  } else {
    for (const c of node.children) collectAllIdents(c, labels);
  }
  return labels;
}

/** Recursively collect all IDENT_VAR / IDENT_PARAM / IDENT_CALLEE labels. */
function collectAllIdents(node: NormNode, out: string[]): void {
  if (
    (node.kind === "IDENT_VAR" ||
      node.kind === "IDENT_PARAM" ||
      node.kind === "IDENT_CALLEE" ||
      node.kind === "IDENT_PROP") &&
    node.label !== undefined
  ) {
    out.push(node.label);
  }
  for (const c of node.children) collectAllIdents(c, out);
}

/**
 * Build the data-flow graph for one function body tree.
 *
 * The tree should be a FUNCTION node as produced by any language adapter.
 */
export function buildFlowGraph(functionTree: NormNode): FlowGraph {
  const forward = new Map<string, Set<string>>();
  const returnUses = new Set<string>();
  const allDefs = new Set<string>();
  const loopEdges: Array<{ from: string; to: string }> = [];

  function addForward(from: string, to: string): void {
    let s = forward.get(from);
    if (!s) {
      s = new Set();
      forward.set(from, s);
    }
    s.add(to);
  }

  function walk(node: NormNode, inReturn: boolean): void {
    if (node.kind === "RETURN") {
      // Everything under RETURN is a "use in return context".
      const used: string[] = [];
      for (const c of node.children) collectAllIdents(c, used);
      for (const u of used) returnUses.add(u);
      return; // don't recurse normally
    }

    if (node.kind === "LOOP") {
      // Structure (for most languages): [DECL(loopVar), iterableExpr, BLOCK(body)]
      // The iterable's variables flow into the loop-var definition.
      const children = node.children;
      const loopVarNode = children.find((c) => c.kind === "DECL");
      const blockNode = children.find((c) => c.kind === "BLOCK");
      const iterableChildren = children.filter(
        (c) => c.kind !== "DECL" && c.kind !== "BLOCK",
      );

      // Record the loop-var definition.
      if (loopVarNode) {
        const loopVarLabels = defsOf(loopVarNode);
        for (const lv of loopVarLabels) allDefs.add(lv);

        // Collect labels from the iterable expressions.
        const iterableLabels: string[] = [];
        for (const it of iterableChildren) collectAllIdents(it, iterableLabels);

        // Edge: every iterable label → loop var
        for (const il of iterableLabels) {
          for (const lv of loopVarLabels) {
            addForward(il, lv);
            loopEdges.push({ from: il, to: lv });
          }
        }
      }

      // Walk the iterable expressions as ordinary use nodes.
      for (const it of iterableChildren) walk(it, inReturn);
      // Walk the body.
      if (blockNode) walk(blockNode, inReturn);
      // Walk the loop-var DECL's value subtree if any.
      if (loopVarNode) {
        // Skip the lhs ident, walk the rhs (unlikely for loop-var DECLs).
        const usedByLoopVar = usesOf(loopVarNode);
        for (const defLabel of defsOf(loopVarNode)) {
          for (const used of usedByLoopVar) addForward(used, defLabel);
        }
      }
      return;
    }

    if (
      node.kind === "DECL" ||
      node.kind === "ASSIGN" ||
      node.kind === "PARAM"
    ) {
      const defLabels = defsOf(node);
      for (const d of defLabels) allDefs.add(d);

      const used = usesOf(node);
      for (const d of defLabels) {
        for (const u of used) {
          addForward(u, d); // u is used to define d → u flows into d
        }
      }

      // Recurse into child nodes that are themselves compound (e.g. nested
      // DECL inside a DECL value, anonymous functions, etc.)
      const children = node.children;
      let skippedLhs = false;
      for (const c of children) {
        if (!skippedLhs && (c.kind === "IDENT_VAR" || c.kind === "OTHER")) {
          skippedLhs = true;
          continue;
        }
        walk(c, inReturn);
      }
      return;
    }

    // Default: recurse into all children.
    for (const c of node.children) walk(c, inReturn);
  }

  // Kick off from the FUNCTION node — walk PARAM and BLOCK children.
  walk(functionTree, false);

  return { forward, returnUses, allDefs, loopEdges };
}

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

/**
 * BFS over forward edges to find all labels reachable from `startLabels`.
 */
function forwardReach(
  startLabels: Iterable<string>,
  forward: Map<string, Set<string>>,
): Set<string> {
  const visited = new Set<string>(startLabels);
  const queue = [...visited];
  while (queue.length > 0) {
    const label = queue.shift()!;
    for (const next of forward.get(label) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Critical path analysis
// ---------------------------------------------------------------------------

/**
 * Collect all variable labels defined by the top-level of a set of
 * NormNodes (i.e., labels defined BY the structural insertions, not within
 * their nested subtrees).
 */
function insertionDefLabels(insertions: NormNode[]): Set<string> {
  const labels = new Set<string>();
  for (const node of insertions) {
    for (const d of defsOf(node)) labels.add(d);
    // For compound nodes like LOOP that define loop vars inside:
    if (node.kind === "LOOP") {
      const loopDecl = node.children.find((c) => c.kind === "DECL");
      if (loopDecl) {
        for (const d of defsOf(loopDecl)) labels.add(d);
      }
    }
  }
  return labels;
}

/**
 * Language-agnostic heuristic for mutation-pattern calls:
 * if any CALL node inside the insertion subtrees has a MEMBER receiver
 * (the FIRST child) whose IDENT_VAR/IDENT_PARAM label is in `returnUses`,
 * the insertion is on the critical path — e.g. `arr.push(x)` where `arr`
 * is returned.
 *
 * We only check the FIRST child of each CALL because it is the callee
 * (the receiver of a method call). Subsequent children are arguments, and
 * an argument like `fn(obj.property)` must NOT be misread as mutating `obj`.
 */
function insertionsContainMutatingCallToReturnedVar(
  insertions: NormNode[],
  returnUses: Set<string>,
): boolean {
  for (const insertion of insertions) {
    for (const node of preorder(insertion)) {
      if (node.kind !== "CALL") continue;
      // Only the first child is the method callee/receiver.
      const first = node.children[0];
      if (first?.kind !== "MEMBER") continue;
      for (const mc of first.children) {
        if (
          (mc.kind === "IDENT_VAR" || mc.kind === "IDENT_PARAM") &&
          mc.label !== undefined &&
          returnUses.has(mc.label)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Given the structural insertions from treeDiff (the NormNodes present in
 * the divergent function but absent from the consensus) and the full
 * divergent function tree, determine whether the insertions are on the
 * critical path from parameters to the function's RETURN.
 *
 * @param insertions  - NormNodes from TreeDiff.insertions
 * @param divergentTree - The divergent function's NormNode (FUNCTION kind)
 */

/** True if `needle` is the same object as or is contained within `haystack`. */
function nodeInSubtree(needle: NormNode, haystack: NormNode): boolean {
  for (const n of preorder(haystack)) {
    if (n === needle) return true;
  }
  return false;
}

/**
 * Check: is any insertion the iterable expression of a LOOP whose body
 * mutates a returned variable?
 *
 * Covers: `for (const x of items.sort()) { acc.push(x); }  return acc;`
 * The insertion is CALL(items.sort()) in iterable position — it defines no
 * variable itself but changes which values `x` takes, which changes `acc`.
 */
function isLoopIterableInsertionMutatingReturn(
  insertions: NormNode[],
  fnTree: NormNode,
  returnUses: Set<string>,
): boolean {
  for (const node of preorder(fnTree)) {
    if (node.kind !== "LOOP") continue;
    const iterableChildren = node.children.filter(
      (c) => c.kind !== "DECL" && c.kind !== "BLOCK",
    );
    const bodyChild = node.children.find((c) => c.kind === "BLOCK");
    if (!bodyChild) continue;
    const anyInsertionIsIterable = insertions.some((ins) =>
      iterableChildren.some((it) => it === ins || nodeInSubtree(ins, it)),
    );
    if (!anyInsertionIsIterable) continue;
    if (insertionsContainMutatingCallToReturnedVar([bodyChild], returnUses)) {
      return true;
    }
  }
  return false;
}

export function criticalPathAnalysis(
  insertions: NormNode[],
  divergentTree: NormNode,
): CriticalPathResult {
  if (insertions.length === 0) {
    return {
      onCriticalPath: false,
      criticalVars: [],
      offPathVars: [],
      summary: "no insertions — divergence is structural deletion only",
    };
  }

  const graph = buildFlowGraph(divergentTree);

  // ── A: insertion directly inside a RETURN subtree ────────────────────────
  const returnSubtreeNodes = new Set<NormNode>();
  for (const node of preorder(divergentTree)) {
    if (node.kind === "RETURN") {
      for (const n of preorder(node)) returnSubtreeNodes.add(n);
    }
  }
  if (insertions.some((n) => returnSubtreeNodes.has(n))) {
    return {
      onCriticalPath: true,
      criticalVars: [],
      offPathVars: [],
      summary:
        "insertion is directly inside a return expression — definitely on the critical path",
    };
  }

  // ── B: insertion CONTAINS a RETURN — always load-bearing ─────────────────
  // Must precede the insertedDefs check because a co-insertion like DECL(ok)
  // has non-empty defs but the *other* co-insertion BRANCH(return) is what
  // makes it load-bearing (T010 pattern: void function with early return).
  if (insertions.some((n) => [...preorder(n)].some((c) => c.kind === "RETURN"))) {
    return {
      onCriticalPath: true,
      criticalVars: [],
      offPathVars: [],
      summary:
        "insertion contains a return statement — changes control flow, always on the critical path",
    };
  }

  // ── Collect variable names defined by the insertions ─────────────────────
  const insertedDefs = insertionDefLabels(insertions);

  if (insertedDefs.size === 0) {
    // ── C: mutation — insertion calls a method on a returned variable ───────
    if (insertionsContainMutatingCallToReturnedVar(insertions, graph.returnUses)) {
      return {
        onCriticalPath: true,
        criticalVars: [],
        offPathVars: [],
        summary:
          "insertion calls a method on a variable that is returned — mutation is on the critical path",
      };
    }

    // ── D: loop-iterable — insertion is the iterable of a loop that mutates a returned var
    if (isLoopIterableInsertionMutatingReturn(insertions, divergentTree, graph.returnUses)) {
      return {
        onCriticalPath: true,
        criticalVars: [],
        offPathVars: [],
        summary:
          "insertion is the iterable of a loop whose body mutates a returned variable — on the critical path",
      };
    }

    // ── E: insertion inside a DECL's value for a variable used in RETURN ───
    // Covers chain-call patterns like: `const body = fields.slice().sort().join("\n")`
    // where only the inner CALL(sort) is the insertion (the DECL itself is matched).
    for (const node of preorder(divergentTree)) {
      if (node.kind !== "DECL") continue;
      const defLabels = defsOf(node);
      if (!defLabels.some((l) => graph.returnUses.has(l))) continue;
      // DECL defines a returned variable — is any insertion in its value subtree?
      for (const vc of node.children.slice(1)) {
        if (insertions.some((ins) => ins === vc || nodeInSubtree(ins, vc))) {
          return {
            onCriticalPath: true,
            criticalVars: defLabels.filter((l) => graph.returnUses.has(l)),
            offPathVars: [],
            summary: `insertion is inside the value of '${defLabels[0]}' which flows into the return — on the critical path`,
          };
        }
      }
    }

    return {
      onCriticalPath: false,
      criticalVars: [],
      offPathVars: [],
      summary:
        "insertions define no named variables, contain no return, and mutate no returned variable — likely off the critical path",
    };
  }

  // ── E: forward reachability from insertion-defined labels ────────────────
  const criticalVars: string[] = [];
  const offPathVars: string[] = [];

  for (const defLabel of insertedDefs) {
    const reach = forwardReach([defLabel], graph.forward);
    if (
      graph.returnUses.has(defLabel) ||
      [...reach].some((r) => graph.returnUses.has(r))
    ) {
      criticalVars.push(defLabel);
    } else {
      offPathVars.push(defLabel);
    }
  }

  // ── F: mutation alongside named defs ─────────────────────────────────────
  const mutationOnPath = insertionsContainMutatingCallToReturnedVar(
    insertions,
    graph.returnUses,
  );

  const onCriticalPath = criticalVars.length > 0 || mutationOnPath;

  const summary = onCriticalPath
    ? criticalVars.length > 0
      ? `variable(s) ${criticalVars.join(", ")} defined by the insertion flow into the function's return value`
      : "insertion mutates a variable that is returned"
    : offPathVars.length > 0
      ? `variable(s) ${offPathVars.join(", ")} defined by the insertion do not reach any return — likely off the critical path`
      : "insertion labels do not reach any return expression";

  return { onCriticalPath, criticalVars, offPathVars, summary };
}

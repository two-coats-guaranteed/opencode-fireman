/**
 * Language-agnostic normalized AST.
 *
 * Every language adapter (today: TypeScript via the compiler API; later:
 * tree-sitter grammars) lowers its concrete syntax tree into this small,
 * uniform vocabulary. Everything downstream — structural shingling,
 * similarity — operates ONLY on NormNode and never sees a
 * language-specific node. That is what makes the similarity engine
 * genuinely language-agnostic rather than TypeScript-shaped.
 *
 * `label` carries the original identifier / literal text. The shingle
 * layer deliberately ignores it: similarity must be name-independent.
 * It is retained because a later analysis genuinely needs names —
 * call-graph resolution is the planned one — so the representation does
 * not have to be redesigned when that lands.
 */

export type NormKind =
  | "FUNCTION"
  | "PARAM"
  | "BLOCK"
  | "CALL"
  | "BRANCH"
  | "LOOP"
  | "RETURN"
  | "DECL"
  | "ASSIGN"
  | "TRY"
  | "BINARY"
  | "UNARY"
  | "MEMBER"
  | "OBJECT"
  | "ARRAY"
  | "LITERAL_STR"
  | "LITERAL_NUM"
  | "LITERAL_BOOL"
  | "LITERAL_OTHER"
  | "IDENT_PARAM"
  | "IDENT_CALLEE"
  | "IDENT_PROP"
  | "IDENT_VAR"
  | "OTHER";

export interface NormNode {
  kind: NormKind;
  /** Original source text for identifiers / literals. Ignored by shingling. */
  label?: string;
  children: NormNode[];
}

/** A named function unit lowered to the normalized AST. */
export interface NormFunction {
  /** Stable id: `<source-label>::<function-name>`. */
  id: string;
  name: string;
  source: string;
  tree: NormNode;
  /**
   * Raw source text of this function. Populated by all language adapters
   * so that the LLM-escalation tier can include it in the prompt.
   * Undefined for programmatically-constructed NormFunctions.
   */
  sourceText?: string;
}

/** Construct a node, honouring exactOptionalPropertyTypes for `label`. */
export function makeNode(
  kind: NormKind,
  children: NormNode[],
  label?: string,
): NormNode {
  return label === undefined ? { kind, children } : { kind, label, children };
}

/** Pre-order walk over a normalized tree. */
export function* preorder(node: NormNode): Generator<NormNode> {
  yield node;
  for (const c of node.children) {
    yield* preorder(c);
  }
}

/** Node count of a tree. */
export function size(node: NormNode): number {
  let n = 0;
  for (const _ of preorder(node)) n++;
  return n;
}

/**
 * Scala language adapter.
 *
 * Wraps tree-sitter-scala via web-tree-sitter.
 * Scala `def` compiles to `function_definition` nodes.
 * Bodies can be blocks, expressions, or field_expressions (e.g. `def f = x.sorted`).
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import type { NormFunction, NormKind } from "./normalized-ast.ts";
import { parseFunctionsForConfig, wasmPath, type LangConfig } from "./tree-sitter-base.ts";

// ---------------------------------------------------------------------------
// NormKind map
// ---------------------------------------------------------------------------

const KIND_MAP: ReadonlyMap<string, NormKind | "COLLAPSE" | "SKIP"> = new Map([
  // Function-like
  ["function_definition", "FUNCTION"],
  // Params
  ["parameters", "SKIP"],
  ["parameter", "PARAM"],
  // Block
  ["block", "BLOCK"],
  // Calls
  ["call_expression", "CALL"],
  ["generic_call_expression", "CALL"],
  // Control flow
  ["if_expression", "BRANCH"],
  ["match_expression", "BRANCH"],
  ["for_expression", "LOOP"],
  ["while_expression", "LOOP"],
  ["do_expression", "LOOP"],
  ["try_expression", "TRY"],
  ["return_expression", "RETURN"],
  // Declarations
  ["val_definition", "DECL"],
  ["var_definition", "DECL"],
  ["val_declaration", "DECL"],
  ["var_declaration", "DECL"],
  // Assignments
  ["assignment_expression", "ASSIGN"],
  // Expressions
  ["infix_expression", "BINARY"],
  ["postfix_expression", "UNARY"],
  ["prefix_expression", "UNARY"],
  ["field_expression", "MEMBER"],
  ["subscript_expression", "MEMBER"],
  // Literals
  ["string", "LITERAL_STR"],
  ["string_literal", "LITERAL_STR"],
  ["interpolated_string", "LITERAL_STR"],
  ["integer_literal", "LITERAL_NUM"],
  ["floating_point_literal", "LITERAL_NUM"],
  ["boolean_literal", "LITERAL_BOOL"],
  ["null_literal", "LITERAL_OTHER"],
  // Transparent wrappers
  ["parenthesized_expression", "COLLAPSE"],
  // Skip type noise
  ["type_identifier", "SKIP"],
  ["generic_type", "SKIP"],
  ["type_arguments", "SKIP"],
  ["annotation", "SKIP"],
  ["modifiers", "SKIP"],
]);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function extractName(fn: SyntaxNode): string | null {
  return fn.childForFieldName("name")?.text ?? null;
}

function extractParams(fn: SyntaxNode): SyntaxNode[] {
  // Scala allows multiple parameter lists; collect from the first `parameters` child
  const p = fn.childForFieldName("parameters");
  return p?.namedChildren.filter((n: any) => n.type === "parameter") ?? [];
}

function extractBody(fn: SyntaxNode): SyntaxNode | null {
  return fn.childForFieldName("body");
}

const SCALA_CONFIG: LangConfig = {
  wasmPath: wasmPath("tree-sitter-scala", "tree-sitter-scala.wasm"),
  functionTypes: new Set(["function_definition"]),
  extractName,
  extractParams,
  extractBody,
  kindOf: (t) => KIND_MAP.get(t),
  identifierTypes: new Set(["identifier", "operator_identifier"]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFunctions(
  source: string,
  label: string,
): Promise<NormFunction[]> {
  return parseFunctionsForConfig(source, label, SCALA_CONFIG);
}

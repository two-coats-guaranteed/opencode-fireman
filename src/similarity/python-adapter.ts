/**
 * Python language adapter.
 *
 * Wraps tree-sitter-python via web-tree-sitter to produce NormFunction[]
 * from Python source. Uses the generic parseFunctionsForConfig from
 * tree-sitter-base.ts.
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
  ["lambda", "FUNCTION"],
  // Params (handled by extractParams; skip as standalone nodes)
  ["parameters", "SKIP"],
  ["parameter", "PARAM"],
  ["typed_parameter", "PARAM"],
  ["default_parameter", "PARAM"],
  ["list_splat_pattern", "PARAM"],
  ["dictionary_splat_pattern", "PARAM"],
  // Block / control flow
  ["block", "BLOCK"],
  ["call", "CALL"],
  ["if_statement", "BRANCH"],
  ["elif_clause", "BRANCH"],
  ["conditional_expression", "BRANCH"],
  ["for_statement", "LOOP"],
  ["while_statement", "LOOP"],
  ["try_statement", "TRY"],
  ["with_statement", "TRY"],
  ["return_statement", "RETURN"],
  // Declarations / assignments
  ["assignment", "ASSIGN"],
  ["augmented_assignment", "ASSIGN"],
  ["named_expression", "ASSIGN"],
  // Expressions
  ["binary_operator", "BINARY"],
  ["comparison_operator", "BINARY"],
  ["boolean_operator", "BINARY"],
  ["unary_operator", "UNARY"],
  ["not_operator", "UNARY"],
  ["attribute", "MEMBER"],
  ["subscript", "MEMBER"],
  // Collections
  ["list", "ARRAY"],
  ["tuple", "ARRAY"],
  ["set", "ARRAY"],
  ["dictionary", "OBJECT"],
  // Literals
  ["string", "LITERAL_STR"],
  ["concatenated_string", "LITERAL_STR"],
  ["integer", "LITERAL_NUM"],
  ["float", "LITERAL_NUM"],
  ["true", "LITERAL_BOOL"],
  ["false", "LITERAL_BOOL"],
  ["none", "LITERAL_OTHER"],
  // Transparent wrappers
  ["expression_statement", "COLLAPSE"],
  ["parenthesized_expression", "COLLAPSE"],
  ["typed_annotation_expression", "SKIP"],
  ["type", "SKIP"],
  ["comment", "SKIP"],
]);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function extractName(fn: SyntaxNode): string | null {
  return fn.childForFieldName("name")?.text ?? null;
}

function extractParams(fn: SyntaxNode): SyntaxNode[] {
  const p = fn.childForFieldName("parameters");
  return p?.namedChildren ?? [];
}

function extractBody(fn: SyntaxNode): SyntaxNode | null {
  return fn.childForFieldName("body");
}

const PYTHON_CONFIG: LangConfig = {
  wasmPath: wasmPath("tree-sitter-python", "tree-sitter-python.wasm"),
  functionTypes: new Set(["function_definition", "lambda"]),
  extractName,
  extractParams,
  extractBody,
  kindOf: (t) => KIND_MAP.get(t),
  identifierTypes: new Set(["identifier"]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFunctions(
  source: string,
  label: string,
): Promise<NormFunction[]> {
  return parseFunctionsForConfig(source, label, PYTHON_CONFIG);
}

/**
 * Java language adapter.
 *
 * Wraps tree-sitter-java via web-tree-sitter.
 * Handles both method_declaration and constructor_declaration.
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import type { NormFunction, NormKind } from "./normalized-ast.ts";
import { parseFunctionsForConfig, wasmPath, type LangConfig } from "./tree-sitter-base.ts";

// ---------------------------------------------------------------------------
// NormKind map
// ---------------------------------------------------------------------------

const KIND_MAP: ReadonlyMap<string, NormKind | "COLLAPSE" | "SKIP"> = new Map([
  // Function-like
  ["method_declaration", "FUNCTION"],
  ["constructor_declaration", "FUNCTION"],
  // Params
  ["formal_parameters", "SKIP"],
  ["formal_parameter", "PARAM"],
  ["spread_parameter", "PARAM"],
  // Block
  ["block", "BLOCK"],
  ["constructor_body", "BLOCK"],
  // Calls
  ["method_invocation", "CALL"],
  ["object_creation_expression", "CALL"],
  ["explicit_constructor_invocation", "CALL"],
  // Control flow
  ["if_statement", "BRANCH"],
  ["ternary_expression", "BRANCH"],
  ["switch_statement", "BRANCH"],
  ["switch_expression", "BRANCH"],
  ["for_statement", "LOOP"],
  ["enhanced_for_statement", "LOOP"],
  ["while_statement", "LOOP"],
  ["do_statement", "LOOP"],
  ["try_statement", "TRY"],
  ["catch_clause", "TRY"],
  ["return_statement", "RETURN"],
  // Declarations
  ["local_variable_declaration", "DECL"],
  ["variable_declarator", "DECL"],
  // Assignments
  ["assignment_expression", "ASSIGN"],
  // Expressions
  ["binary_expression", "BINARY"],
  ["unary_expression", "UNARY"],
  ["instanceof_expression", "BINARY"],
  ["field_access", "MEMBER"],
  ["array_access", "MEMBER"],
  // Collections
  ["array_initializer", "ARRAY"],
  ["array_creation_expression", "ARRAY"],
  // Literals
  ["string_literal", "LITERAL_STR"],
  ["text_block", "LITERAL_STR"],
  ["decimal_integer_literal", "LITERAL_NUM"],
  ["hex_integer_literal", "LITERAL_NUM"],
  ["floating_point_literal", "LITERAL_NUM"],
  ["long_literal", "LITERAL_NUM"],
  ["character_literal", "LITERAL_STR"],
  ["true", "LITERAL_BOOL"],
  ["false", "LITERAL_BOOL"],
  ["null_literal", "LITERAL_OTHER"],
  // Transparent wrappers
  ["expression_statement", "COLLAPSE"],
  ["parenthesized_expression", "COLLAPSE"],
  // Skip type info
  ["type_identifier", "SKIP"],
  ["generic_type", "SKIP"],
  ["modifiers", "SKIP"],
  ["annotation", "SKIP"],
]);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function extractName(fn: SyntaxNode): string | null {
  return fn.childForFieldName("name")?.text ?? null;
}

function extractParams(fn: SyntaxNode): SyntaxNode[] {
  const p = fn.childForFieldName("parameters");
  return p?.namedChildren.filter((n: any) => n.type === "formal_parameter" || n.type === "spread_parameter") ?? [];
}

function extractBody(fn: SyntaxNode): SyntaxNode | null {
  return fn.childForFieldName("body");
}

const JAVA_CONFIG: LangConfig = {
  wasmPath: wasmPath("tree-sitter-java", "tree-sitter-java.wasm"),
  functionTypes: new Set(["method_declaration", "constructor_declaration"]),
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
  return parseFunctionsForConfig(source, label, JAVA_CONFIG);
}

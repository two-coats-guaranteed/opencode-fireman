/**
 * C language adapter.
 *
 * Thin variant of the C++ adapter — C has the same function_definition
 * structure but no try/catch, lambdas, or range-for loops.
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import type { NormFunction, NormKind } from "./normalized-ast.ts";
import { parseFunctionsForConfig, wasmPath, type LangConfig } from "./tree-sitter-base.ts";

// ---------------------------------------------------------------------------
// NormKind map (C subset of C++)
// ---------------------------------------------------------------------------

const KIND_MAP: ReadonlyMap<string, NormKind | "COLLAPSE" | "SKIP"> = new Map([
  // Function-like
  ["function_definition", "FUNCTION"],
  // Params
  ["parameter_list", "SKIP"],
  ["parameter_declaration", "PARAM"],
  // Block
  ["compound_statement", "BLOCK"],
  // Calls
  ["call_expression", "CALL"],
  // Control flow
  ["if_statement", "BRANCH"],
  ["conditional_expression", "BRANCH"],
  ["switch_statement", "BRANCH"],
  ["for_statement", "LOOP"],
  ["while_statement", "LOOP"],
  ["do_statement", "LOOP"],
  ["return_statement", "RETURN"],
  // Declarations
  ["declaration", "DECL"],
  ["init_declarator", "DECL"],
  // Assignments
  ["assignment_expression", "ASSIGN"],
  ["update_expression", "UNARY"],
  // Expressions
  ["binary_expression", "BINARY"],
  ["unary_expression", "UNARY"],
  ["subscript_expression", "MEMBER"],
  ["pointer_expression", "UNARY"],
  // Literals
  ["string_literal", "LITERAL_STR"],
  ["char_literal", "LITERAL_STR"],
  ["number_literal", "LITERAL_NUM"],
  ["true", "LITERAL_BOOL"],
  ["false", "LITERAL_BOOL"],
  ["null", "LITERAL_OTHER"],
  // Transparent wrappers
  ["expression_statement", "COLLAPSE"],
  ["parenthesized_expression", "COLLAPSE"],
  // Skip type noise
  ["primitive_type", "SKIP"],
  ["type_identifier", "SKIP"],
  ["type_qualifier", "SKIP"],
]);

// ---------------------------------------------------------------------------
// Config — reuses C++ name/param/body extraction logic (same grammar shape)
// ---------------------------------------------------------------------------

function extractLeafName(node: SyntaxNode): string | null {
  if (node.type === "identifier") return node.text;
  const inner = node.childForFieldName("declarator");
  if (inner) return extractLeafName(inner);
  return null;
}

function extractName(fn: SyntaxNode): string | null {
  const decl = fn.childForFieldName("declarator");
  if (!decl) return null;
  if (decl.type === "function_declarator") {
    const inner = decl.childForFieldName("declarator");
    return inner ? extractLeafName(inner) : null;
  }
  return extractLeafName(decl);
}

function extractParams(fn: SyntaxNode): SyntaxNode[] {
  const decl = fn.childForFieldName("declarator");
  const funcDecl = decl?.type === "function_declarator" ? decl : null;
  const params = funcDecl?.childForFieldName("parameters");
  return params?.namedChildren.filter((n: any) => n.type === "parameter_declaration") ?? [];
}

function extractBody(fn: SyntaxNode): SyntaxNode | null {
  return fn.childForFieldName("body");
}

const C_CONFIG: LangConfig = {
  wasmPath: wasmPath("tree-sitter-c", "tree-sitter-c.wasm"),
  functionTypes: new Set(["function_definition"]),
  extractName,
  extractParams,
  extractBody,
  kindOf: (t) => KIND_MAP.get(t),
  identifierTypes: new Set(["identifier", "field_identifier"]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFunctions(
  source: string,
  label: string,
): Promise<NormFunction[]> {
  return parseFunctionsForConfig(source, label, C_CONFIG);
}

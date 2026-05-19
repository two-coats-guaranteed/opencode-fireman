/**
 * C++ language adapter.
 *
 * Wraps tree-sitter-cpp via web-tree-sitter.
 * Handles function_definition (including class methods) and lambda_expression.
 *
 * C++ function names live inside the declarator chain:
 *   function_definition.declarator → function_declarator.declarator → identifier
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
  ["lambda_expression", "FUNCTION"],
  // Params
  ["parameter_list", "SKIP"],
  ["parameter_declaration", "PARAM"],
  // Block
  ["compound_statement", "BLOCK"],
  // Calls
  ["call_expression", "CALL"],
  ["new_expression", "CALL"],
  // Control flow
  ["if_statement", "BRANCH"],
  ["conditional_expression", "BRANCH"],
  ["switch_statement", "BRANCH"],
  ["for_statement", "LOOP"],
  ["for_range_loop", "LOOP"],
  ["while_statement", "LOOP"],
  ["do_statement", "LOOP"],
  ["try_statement", "TRY"],
  ["catch_clause", "TRY"],
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
  ["field_expression", "MEMBER"],
  ["subscript_expression", "MEMBER"],
  ["pointer_expression", "UNARY"],
  // Collections
  ["initializer_list", "ARRAY"],
  // Literals
  ["string_literal", "LITERAL_STR"],
  ["char_literal", "LITERAL_STR"],
  ["number_literal", "LITERAL_NUM"],
  ["true", "LITERAL_BOOL"],
  ["false", "LITERAL_BOOL"],
  ["null", "LITERAL_OTHER"],
  ["nullptr", "LITERAL_OTHER"],
  // Transparent wrappers
  ["expression_statement", "COLLAPSE"],
  ["parenthesized_expression", "COLLAPSE"],
  // Skip type noise
  ["type_identifier", "SKIP"],
  ["primitive_type", "SKIP"],
  ["qualified_identifier", "SKIP"],
  ["template_argument_list", "SKIP"],
  ["type_qualifier", "SKIP"],
]);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Walk into function_declarator to find the base name identifier. */
function extractCppName(fn: SyntaxNode): string | null {
  if (fn.type === "lambda_expression") return "<lambda>";
  const decl = fn.childForFieldName("declarator");
  if (!decl) return null;
  // function_declarator: declarator field is the name
  if (decl.type === "function_declarator") {
    const inner = decl.childForFieldName("declarator");
    if (!inner) return null;
    // Could be identifier, qualified_identifier, destructor_name, etc.
    // Walk down to find the last identifier
    return extractLeafName(inner);
  }
  return extractLeafName(decl);
}

function extractLeafName(node: SyntaxNode): string | null {
  if (node.type === "identifier") return node.text;
  if (node.type === "qualified_identifier") {
    // Rightmost scope name
    const name = node.childForFieldName("name");
    return name?.text ?? null;
  }
  if (node.type === "destructor_name") return node.text;
  if (node.type === "operator_name") return node.text;
  // Reference/pointer declarators wrap the inner declarator
  const inner = node.childForFieldName("declarator");
  if (inner) return extractLeafName(inner);
  return null;
}

function extractParams(fn: SyntaxNode): SyntaxNode[] {
  if (fn.type === "lambda_expression") {
    const decl = fn.childForFieldName("declarator");
    const params = decl?.childForFieldName("parameters") ?? fn.childForFieldName("declarator");
    return params?.namedChildren.filter((n: any) => n.type === "parameter_declaration") ?? [];
  }
  const decl = fn.childForFieldName("declarator");
  const funcDecl = decl?.type === "function_declarator" ? decl : null;
  const params = funcDecl?.childForFieldName("parameters");
  return params?.namedChildren.filter((n: any) => n.type === "parameter_declaration") ?? [];
}

function extractBody(fn: SyntaxNode): SyntaxNode | null {
  if (fn.type === "lambda_expression") {
    return fn.childForFieldName("body");
  }
  return fn.childForFieldName("body");
}

const CPP_CONFIG: LangConfig = {
  wasmPath: wasmPath("tree-sitter-cpp", "tree-sitter-cpp.wasm"),
  functionTypes: new Set(["function_definition", "lambda_expression"]),
  extractName: extractCppName,
  extractParams,
  extractBody,
  kindOf: (t) => KIND_MAP.get(t),
  // C++ uses field_identifier for member names (e.g. obj.method → field_identifier)
  identifierTypes: new Set(["identifier", "field_identifier"]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFunctions(
  source: string,
  label: string,
): Promise<NormFunction[]> {
  return parseFunctionsForConfig(source, label, CPP_CONFIG);
}

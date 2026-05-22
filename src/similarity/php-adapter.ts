/**
 * PHP language adapter.
 *
 * Wraps tree-sitter-php via web-tree-sitter to produce NormFunction[]
 * from PHP source. Handles function_definition and method_declaration.
 *
 * Key PHP-vs-generic differences:
 *   - Function calls: function_call_expression / member_call_expression
 *     (NOT "call_expression" — that's C/C++/Java)
 *   - Parameters:    simple_parameter (NOT "parameter")
 *   - Variables:     variable_name ($foo) — identifier types include both
 *     "name" (bare identifiers, property names, callee names) and
 *     "variable_name" ($-prefixed variables)
 *   - Member access: member_access_expression for $obj->prop (property
 *     reads), subscript_expression for $arr[0]
 *   - No block-scoped declarations — assignment_expression is the only
 *     way to introduce a variable; DECL is not mapped (use ASSIGN)
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import type { NormFunction, NormKind } from "./normalized-ast.ts";
import { parseFunctionsForConfig, wasmPath, type LangConfig } from "./tree-sitter-base.ts";

// ---------------------------------------------------------------------------
// NormKind map
// ---------------------------------------------------------------------------

const KIND_MAP: ReadonlyMap<string, NormKind | "COLLAPSE" | "SKIP"> = new Map([
  // Function-like
  ["function_definition",            "FUNCTION"],
  ["method_declaration",             "FUNCTION"],
  ["arrow_function",                 "FUNCTION"],
  // Params
  ["formal_parameters",              "SKIP"],
  ["simple_parameter",               "PARAM"],
  ["variadic_parameter",             "PARAM"],
  ["property_promotion_parameter",   "PARAM"],
  // Block
  ["compound_statement",             "BLOCK"],
  // Calls — PHP has three distinct call node types
  ["function_call_expression",       "CALL"],  // foo(), sort($x)
  ["member_call_expression",         "CALL"],  // $obj->method()
  ["nullsafe_member_call_expression","CALL"],  // $obj?->method()
  ["static_method_call_expression",  "CALL"],  // Foo::bar()
  ["object_creation_expression",     "CALL"],  // new Foo()
  // Control flow
  ["if_statement",                   "BRANCH"],
  ["conditional_expression",         "BRANCH"],  // ternary
  ["match_expression",               "BRANCH"],
  ["switch_statement",               "BRANCH"],
  ["for_statement",                  "LOOP"],
  ["foreach_statement",              "LOOP"],
  ["while_statement",                "LOOP"],
  ["do_statement",                   "LOOP"],
  ["try_statement",                  "TRY"],
  ["catch_clause",                   "TRY"],
  ["finally_clause",                 "TRY"],
  ["return_statement",               "RETURN"],
  // No typed declaration in PHP — variable introduction is via assignment
  ["assignment_expression",          "ASSIGN"],
  // Expressions
  ["binary_expression",              "BINARY"],
  ["unary_expression",               "UNARY"],
  ["cast_expression",                "UNARY"],
  ["member_access_expression",       "MEMBER"],  // $obj->prop
  ["nullsafe_member_access_expression","MEMBER"],// $obj?->prop
  ["subscript_expression",           "MEMBER"],  // $arr[0] / $arr["key"]
  // Collections
  ["array_creation_expression",      "ARRAY"],
  ["array_element_initializer",      "COLLAPSE"],
  // Literals
  ["string",                         "LITERAL_STR"],
  ["encapsed_string",                "LITERAL_STR"],  // "hello $world"
  ["heredoc",                        "LITERAL_STR"],
  ["nowdoc",                         "LITERAL_STR"],
  ["integer",                        "LITERAL_NUM"],
  ["float",                          "LITERAL_NUM"],
  ["true",                           "LITERAL_BOOL"],
  ["false",                          "LITERAL_BOOL"],
  ["null",                           "LITERAL_OTHER"],
  // Transparent wrappers
  ["expression_statement",           "COLLAPSE"],
  ["parenthesized_expression",       "COLLAPSE"],
  ["argument",                       "COLLAPSE"],
  ["arguments",                      "SKIP"],
  // Noise to suppress
  ["primitive_type",                 "SKIP"],
  ["named_type",                     "SKIP"],
  ["optional_type",                  "SKIP"],
  ["union_type",                     "SKIP"],
  ["php_tag",                        "SKIP"],
  ["comment",                        "SKIP"],
  ["ERROR",                          "SKIP"],
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

const PHP_CONFIG: LangConfig = {
  wasmPath: wasmPath("tree-sitter-php", "tree-sitter-php.wasm"),
  functionTypes: new Set(["function_definition", "method_declaration", "arrow_function"]),
  extractName,
  extractParams,
  extractBody,
  kindOf: (t) => KIND_MAP.get(t),
  // "name"          — bare identifiers: function callee, property, class name
  // "variable_name" — $-prefixed variables
  identifierTypes: new Set(["name", "variable_name"]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFunctions(
  source: string,
  label: string,
): Promise<NormFunction[]> {
  return parseFunctionsForConfig(source, label, PHP_CONFIG);
}

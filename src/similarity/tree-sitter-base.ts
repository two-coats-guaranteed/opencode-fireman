/**
 * Generic tree-sitter adapter.
 *
 * Each language adapter provides a `LangConfig` that describes how to:
 *   - find function-like nodes in the tree,
 *   - map tree-sitter node types to NormKinds, and
 *   - determine identifier roles.
 *
 * This module does the rest: lazy wasm init, grammar caching, the
 * recursive normalisation walk, and function extraction.
 *
 * Transparent wrapper nodes (expression_statement, parenthesised_expression,
 * etc.) are collapsed by returning "COLLAPSE" from `kindOf`. Unknown node
 * types return undefined and map to OTHER, which is benign — they may add
 * some noise but do not break structural similarity.
 */

import { Language, Parser, type Node as SyntaxNode } from "web-tree-sitter";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeNode, type NormFunction, type NormKind, type NormNode } from "./normalized-ast.ts";

// ---------------------------------------------------------------------------
// Wasm path helper
// ---------------------------------------------------------------------------

// This file lives at src/similarity/tree-sitter-base.ts; project root is 3 up.
const _HERE = fileURLToPath(new URL(import.meta.url));
const _ROOT = resolve(_HERE, "..", "..", "..");

export function wasmPath(...parts: string[]): string {
  return resolve(_ROOT, "node_modules", ...parts);
}

// ---------------------------------------------------------------------------
// LangConfig
// ---------------------------------------------------------------------------

export interface LangConfig {
  /** Absolute path to the grammar .wasm file. */
  wasmPath: string;

  /** Node types that are function-like definitions to extract. */
  functionTypes: ReadonlySet<string>;

  /** Extract the function's name from its syntax node. */
  extractName(fn: SyntaxNode): string | null;

  /**
   * Extract formal parameter nodes. These are used to build the paramNames
   * set for identifier-role detection.
   */
  extractParams(fn: SyntaxNode): SyntaxNode[];

  /** Extract the body syntax node from a function node. */
  extractBody(fn: SyntaxNode): SyntaxNode | null;

  /**
   * Map a tree-sitter node type to a NormKind.
   *   undefined → OTHER (emit a NormNode of kind OTHER)
   *   "COLLAPSE" → transparent wrapper; recurse into children, emit nothing
   *   "SKIP"    → drop entirely (type annotations, imports, etc.)
   */
  kindOf(nodeType: string): NormKind | "COLLAPSE" | "SKIP" | undefined;

  /**
   * Node type(s) that represent identifiers. Usually ["identifier"] but
   * some grammars (e.g. C/C++) also have "field_identifier".
   */
  identifierTypes: ReadonlySet<string>;

  /**
   * Determine an identifier node's role. If omitted, all identifiers map
   * to IDENT_VAR (acceptable for renaming invariance; role adds fine signal
   * but is not required for correctness).
   */
  identRole?(node: SyntaxNode, paramNames: ReadonlySet<string>): NormKind;
}

// ---------------------------------------------------------------------------
// Parser pool — lazy init + language cache
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;
const _langCache = new Map<string, Language>();

async function ensureInit(): Promise<void> {
  if (!_initPromise) _initPromise = Parser.init();
  return _initPromise;
}

async function loadLang(path: string): Promise<Language> {
  await ensureInit();
  const cached = _langCache.get(path);
  if (cached) return cached;
  const lang = await Language.load(path);
  _langCache.set(path, lang);
  return lang;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function normalizeNode(
  node: SyntaxNode,
  paramNames: ReadonlySet<string>,
  config: LangConfig,
): NormNode[] {
  const k = config.kindOf(node.type);

  // Transparent wrappers: recurse, emit no node.
  if (k === "COLLAPSE") {
    return node.namedChildren.flatMap((c: SyntaxNode) =>
      normalizeNode(c, paramNames, config),
    );
  }

  // Skip entirely: type annotations, imports, modifiers, etc.
  if (k === "SKIP") return [];

  // Identifiers: map to a role-labelled kind, carry name as label.
  if (config.identifierTypes.has(node.type)) {
    const role: NormKind = config.identRole
      ? config.identRole(node, paramNames)
      : "IDENT_VAR";
    return [makeNode(role, [], node.text)];
  }

  const normKind: NormKind = k ?? "OTHER";

  // Literals carry their text as label so the residual analyser can
  // inspect values (the similarity engine ignores labels, but they are
  // preserved for the future characterisation step).
  const label =
    normKind === "LITERAL_STR" ||
    normKind === "LITERAL_NUM" ||
    normKind === "LITERAL_OTHER" ||
    normKind === "LITERAL_BOOL"
      ? node.text
      : undefined;

  const children = node.namedChildren.flatMap((c: SyntaxNode) =>
    normalizeNode(c, paramNames, config),
  );

  return [makeNode(normKind, children, label)];
}

// ---------------------------------------------------------------------------
// Function extraction
// ---------------------------------------------------------------------------

function collectFunctions(node: SyntaxNode, config: LangConfig, out: SyntaxNode[]): void {
  if (config.functionTypes.has(node.type)) {
    out.push(node);
    // Still recurse — we want nested functions too.
  }
  for (const c of node.namedChildren) collectFunctions(c, config, out);
}

function buildFunctionTree(fn: SyntaxNode, config: LangConfig): NormNode {
  const params = config.extractParams(fn);
  const paramNames = new Set<string>(
    params
      .flatMap((p) => p.namedChildren.concat(p.type === "identifier" ? [p] : []))
      .filter((n) => config.identifierTypes.has(n.type))
      .map((n) => n.text),
  );

  const body = config.extractBody(fn);
  const children: NormNode[] = [];

  // Params
  for (const p of params) {
    children.push(...normalizeNode(p, paramNames, config));
  }
  // Body
  if (body) {
    children.push(...normalizeNode(body, paramNames, config));
  }

  return makeNode("FUNCTION", children);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseFunctionsForConfig(
  source: string,
  label: string,
  config: LangConfig,
): Promise<NormFunction[]> {
  const lang = await loadLang(config.wasmPath);
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  if (!tree) return [];

  const fnNodes: SyntaxNode[] = [];
  collectFunctions(tree.rootNode, config, fnNodes);

  const results: NormFunction[] = [];
  for (const fn of fnNodes) {
    const name = config.extractName(fn);
    if (!name) continue;
    results.push({
      id: `${label}::${name}`,
      name,
      source: label,
      tree: buildFunctionTree(fn, config),
      sourceText: fn.text,
      startLine: fn.startPosition.row + 1,
      endLine: fn.endPosition.row + 1,
    });
  }
  return results;
}

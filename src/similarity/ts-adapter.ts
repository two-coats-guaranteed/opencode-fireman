/**
 * TypeScript language adapter.
 *
 * Lowers TypeScript / TSX source into the language-agnostic NormNode
 * tree (see normalized-ast.ts) using the TypeScript compiler API — a
 * real parser, not a regex.
 *
 * This is the ONLY file in src/similarity that imports `typescript`.
 * Supporting another language means writing a sibling of this file (a
 * tree-sitter grammar adapter, say); nothing downstream changes.
 *
 * Two normalisation choices worth knowing:
 *  - Type annotations are dropped entirely — we model behavioural
 *    structure, not the type layer.
 *  - Pure pass-through wrappers (expression statements, parentheses,
 *    `as`/`!` expressions, variable-statement scaffolding) are collapsed
 *    so they do not dilute the structural signal.
 */

import ts from "typescript";
import {
  makeNode,
  type NormFunction,
  type NormKind,
  type NormNode,
} from "./normalized-ast.ts";

/** Extract every named function-like declaration from a source string. */
export function parseFunctions(
  sourceLabel: string,
  sourceText: string,
): NormFunction[] {
  const sf = ts.createSourceFile(
    `${sourceLabel}.tsx`,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const out: NormFunction[] = [];
  const visit = (node: ts.Node): void => {
    const fn = asFunctionLike(node);
    if (fn) {
      out.push({
        id: `${sourceLabel}::${fn.name}`,
        name: fn.name,
        source: sourceLabel,
        tree: buildFunctionTree(fn.node),
        sourceText: fn.node.getText(sf),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

interface FunctionLike {
  name: string;
  node: ts.FunctionLikeDeclarationBase;
}

/** Recognise the function forms we model: declarations, methods, arrows. */
function asFunctionLike(node: ts.Node): FunctionLike | null {
  if (ts.isFunctionDeclaration(node) && node.body && node.name) {
    return { name: node.name.text, node };
  }
  if (
    ts.isMethodDeclaration(node) &&
    node.body &&
    ts.isIdentifier(node.name)
  ) {
    return { name: node.name.text, node };
  }
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer)) &&
    ts.isIdentifier(node.name)
  ) {
    return { name: node.name.text, node: node.initializer };
  }
  return null;
}

/** Build the FUNCTION node: parameters + body, with the name excluded. */
function buildFunctionTree(fn: ts.FunctionLikeDeclarationBase): NormNode {
  const paramNames = new Set<string>();
  for (const p of fn.parameters) {
    if (ts.isIdentifier(p.name)) paramNames.add(p.name.text);
  }
  const children: NormNode[] = [];
  for (const p of fn.parameters) {
    children.push(...normalize(p, paramNames));
  }
  if (fn.body) {
    children.push(...normalize(fn.body, paramNames));
  }
  return makeNode("FUNCTION", children);
}

/** Lower one TS node into zero or more NormNodes. */
function normalize(node: ts.Node, paramNames: Set<string>): NormNode[] {
  // Type layer is not modelled.
  if (ts.isTypeNode(node)) return [];

  // Transparent wrappers: recurse, emit no node of their own.
  if (
    ts.isExpressionStatement(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isVariableStatement(node) ||
    ts.isVariableDeclarationList(node)
  ) {
    return childrenOf(node, paramNames);
  }

  const kind = mapKind(node, paramNames);
  return [makeNode(kind, childrenOf(node, paramNames), labelOf(node))];
}

function childrenOf(node: ts.Node, paramNames: Set<string>): NormNode[] {
  const out: NormNode[] = [];
  ts.forEachChild(node, (c) => {
    out.push(...normalize(c, paramNames));
  });
  return out;
}

function mapKind(node: ts.Node, paramNames: Set<string>): NormKind {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    return "FUNCTION";
  }
  if (ts.isParameter(node)) return "PARAM";
  if (ts.isTryStatement(node)) return "TRY";
  if (ts.isBlock(node)) return "BLOCK";
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return "CALL";
  if (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isSwitchStatement(node)
  ) {
    return "BRANCH";
  }
  if (
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    return "LOOP";
  }
  if (ts.isReturnStatement(node)) return "RETURN";
  if (ts.isVariableDeclaration(node)) return "DECL";
  if (ts.isBinaryExpression(node)) {
    return isAssignmentOp(node.operatorToken.kind) ? "ASSIGN" : "BINARY";
  }
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return "UNARY";
  }
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return "MEMBER";
  }
  if (ts.isObjectLiteralExpression(node)) return "OBJECT";
  if (ts.isArrayLiteralExpression(node)) return "ARRAY";
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  ) {
    return "LITERAL_STR";
  }
  if (ts.isNumericLiteral(node)) return "LITERAL_NUM";
  if (ts.isRegularExpressionLiteral(node)) return "LITERAL_OTHER";
  if (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return "LITERAL_BOOL";
  }
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return "LITERAL_OTHER";
  }
  if (ts.isIdentifier(node)) return identRole(node, paramNames);
  return "OTHER";
}

/**
 * Classify an identifier by syntactic ROLE — never by name. Roles are
 * what shingles see; the name is dropped. Determinable without a full
 * scope resolver.
 */
function identRole(node: ts.Identifier, paramNames: Set<string>): NormKind {
  const p = node.parent;
  if (p && ts.isPropertyAccessExpression(p) && p.name === node) {
    const pp = p.parent;
    if (pp && ts.isCallExpression(pp) && pp.expression === p) {
      return "IDENT_CALLEE";
    }
    return "IDENT_PROP";
  }
  if (p && ts.isCallExpression(p) && p.expression === node) {
    return "IDENT_CALLEE";
  }
  if (paramNames.has(node.text)) return "IDENT_PARAM";
  return "IDENT_VAR";
}

function isAssignmentOp(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment
  );
}

/** Raw text for identifiers / literals — retained for future call-graph use. */
function labelOf(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isRegularExpressionLiteral(node)
  ) {
    return node.text;
  }
  return undefined;
}

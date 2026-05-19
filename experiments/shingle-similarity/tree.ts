/**
 * GenericNode — a minimal, language-agnostic tree.
 *
 * The shingle / similarity code below operates ONLY on GenericNode. It
 * never imports a parser. This file provides one *adapter* — TypeScript,
 * via the TS compiler API — that produces GenericNode trees. A
 * tree-sitter adapter for Java / C / C++ / Python / SQL would be a
 * drop-in sibling: same output type, same downstream code.
 *
 * `text` is retained on identifier / literal nodes but is NEVER read by
 * the shingle layer (similarity is name-blind). It is kept so a future
 * divergence-characterisation step — and a future call-graph pass — has
 * something to work with. That is the planned extension point.
 */

import * as ts from "typescript";

export interface GenericNode {
  /** Normalised structural token, or an identifier/literal role. */
  type: string;
  /** Original text of an identifier/literal. Not used for similarity. */
  text?: string;
  children: GenericNode[];
}

export interface FunctionUnit {
  name: string;
  /** 1-based source line span, used to match findings in truth.json. */
  startLine: number;
  endLine: number;
  node: GenericNode;
}

type Role = "callee" | "prop" | null;

/**
 * Identifiers are collapsed to a role by *syntactic position* — no scope
 * analysis, no name matching. `arr.sort()` and `arr.filter()` therefore
 * produce identical structure; telling them apart is the (separate)
 * divergence step's job, via `text`.
 */
function childRole(parent: ts.Node, child: ts.Node): Role {
  if (
    ts.isCallExpression(parent) &&
    child === parent.expression &&
    ts.isIdentifier(child)
  ) {
    return "callee";
  }
  if (ts.isPropertyAccessExpression(parent) && child === parent.name) {
    return "prop";
  }
  return null;
}

function convert(node: ts.Node, role: Role): GenericNode {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    const type =
      role === "callee" ? "CALLEE" : role === "prop" ? "PROP" : "VAR";
    return { type, text: node.text, children: [] };
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { type: "STR", text: node.text, children: [] };
  }
  if (ts.isNumericLiteral(node)) {
    return { type: "NUM", text: node.text, children: [] };
  }
  if (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return { type: "BOOL", children: [] };
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return { type: "NULL", children: [] };
  }

  const children: GenericNode[] = [];
  ts.forEachChild(node, (child) => {
    children.push(convert(child, childRole(node, child)));
  });
  return { type: ts.SyntaxKind[node.kind] ?? "Unknown", children };
}

/** Parse a TypeScript source file into one GenericNode tree per function. */
export function parseFunctions(
  source: string,
  fileName: string,
): FunctionUnit[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
  const out: FunctionUnit[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      out.push({
        name: node.name.text,
        startLine:
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        endLine: sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        node: convert(node, null),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

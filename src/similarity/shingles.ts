/**
 * Structural shingles.
 *
 * A function's shingle-set is its name-independent structural
 * vocabulary. Two shingle kinds are unioned:
 *
 *   subtree  `s:KIND(child1,child2,...)` — every node with its ordered
 *            child kinds. Captures local tree shape.
 *
 *   trigram  `t:k1>k2>k3` — 3-grams over the pre-order kind sequence.
 *            Captures sequential structure and degrades gracefully when
 *            a single statement is inserted: most trigrams survive, so
 *            an inserted statement produces a SMALL residual rather than
 *            a wholesale mismatch. That small-residual property is what
 *            the divergence step (next milestone) will key off.
 *
 * Identifiers contribute only their ROLE (IDENT_PARAM / IDENT_CALLEE /
 * ...), never their name. Literals contribute only their TYPE, never
 * their value. So a function and a copy with every identifier renamed
 * produce byte-identical shingle-sets — the whole point.
 *
 * (Consequence, by design: two functions differing only in a literal
 * *value* — e.g. "base64" vs "base64url" — are shingle-identical here.
 * Value-level divergence is the residual-characterisation step's job,
 * not the similarity engine's.)
 */

import { type NormNode } from "./normalized-ast.ts";

export function shingleSet(tree: NormNode): Set<string> {
  const out = new Set<string>();
  collectSubtrees(tree, out);
  collectTrigrams(tree, out);
  return out;
}

function collectSubtrees(node: NormNode, out: Set<string>): void {
  const childKinds = node.children.map((c) => c.kind).join(",");
  out.add(`s:${node.kind}(${childKinds})`);
  for (const c of node.children) {
    collectSubtrees(c, out);
  }
}

function collectTrigrams(tree: NormNode, out: Set<string>): void {
  const seq: string[] = [];
  const walk = (n: NormNode): void => {
    seq.push(n.kind);
    for (const c of n.children) walk(c);
  };
  walk(tree);
  for (let i = 0; i + 2 < seq.length; i++) {
    out.add(`t:${seq[i]!}>${seq[i + 1]!}>${seq[i + 2]!}`);
  }
}

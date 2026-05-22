/**
 * Alternative similarity metrics for empirical comparison with the
 * MinHash/Jaccard pipeline currently used in family detection.
 *
 * All metrics operate over the same shingle sets that shingles.ts
 * produces; only the way "how similar" is computed changes. Use
 * `metric-comparison.ts` to evaluate them against the bench corpus.
 *
 * Implemented metrics:
 *   - jaccardExact         (reference; identical to index.ts jaccard)
 *   - cosineBinary         (binary-vector cosine; SimHash approximates this)
 *   - asymmetricOverlap    (Szymkiewicz–Simpson; |A∩B| / min(|A|,|B|))
 *   - simhash64 + simhashSimilarity (fixed-length fingerprint)
 *   - dice                 (|2 A∩B| / (|A|+|B|), bonus for completeness)
 *
 * Threshold semantics differ per metric. Family-formation thresholds
 * tuned in metric-comparison.ts; do not hard-code here.
 */

// ─────────────────────────────────────────────────────────────────────────
// Hash function — 64-bit FNV-1a, matches MinHash style
// ─────────────────────────────────────────────────────────────────────────

/** 64-bit FNV-1a hash of a string, returned as two 32-bit halves. */
function fnv1a64(str: string): { hi: number; lo: number } {
  // 64-bit FNV offset basis: 0xcbf29ce484222325
  let hi = 0xcbf29ce4 >>> 0;
  let lo = 0x84222325 >>> 0;
  // 64-bit FNV prime: 0x100000001b3
  const PRIME_LO = 0x000001b3 >>> 0;
  const PRIME_HI = 0x00000100 >>> 0;
  for (let i = 0; i < str.length; i++) {
    // XOR byte (we hash UTF-16 code units; sufficient for ASCII shingles)
    lo = (lo ^ str.charCodeAt(i)) >>> 0;
    // 64-bit multiply by prime; school-method using 32-bit halves
    const aL = lo & 0xffff;
    const aH = lo >>> 16;
    const bL = PRIME_LO & 0xffff;
    const bH = PRIME_LO >>> 16;
    const aLbL = aL * bL;
    const aLbH = aL * bH;
    const aHbL = aH * bL;
    const aHbH = aH * bH;
    let newLo = (aLbL + ((aLbH & 0xffff) << 16) + ((aHbL & 0xffff) << 16)) >>> 0;
    const overflow1 = (aLbL + ((aLbH & 0xffff) << 16) >>> 0) < aLbL ? 1 : 0;
    const overflow2 = (newLo < ((aHbL & 0xffff) << 16)) ? 1 : 0;
    const carry = overflow1 + overflow2;
    const newHi = (aHbH + (aLbH >>> 16) + (aHbL >>> 16) + carry + hi * PRIME_LO + lo * PRIME_HI) >>> 0;
    hi = newHi;
    lo = newLo;
  }
  return { hi, lo };
}

// ─────────────────────────────────────────────────────────────────────────
// Set-overlap metrics — operate directly on Set<string>
// ─────────────────────────────────────────────────────────────────────────

function intersectionSize(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (large.has(x)) n++;
  return n;
}

/** Reference Jaccard. Identical to index.ts:jaccard. */
export function jaccardExact(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const inter = intersectionSize(a, b);
  return inter / (a.size + b.size - inter);
}

/**
 * Cosine similarity treating each shingle as a unit-weight feature.
 *
 *   cos(A, B) = |A ∩ B| / sqrt(|A| · |B|)
 *
 * For A ⊆ B, cosine = sqrt(|A|/|B|) — strictly more forgiving than
 * Jaccard, which reads |A|/|B|. This is SimHash's underlying metric.
 */
export function cosineBinary(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return a.size === 0 && b.size === 0 ? 1 : 0;
  return intersectionSize(a, b) / Math.sqrt(a.size * b.size);
}

/**
 * Szymkiewicz–Simpson overlap (asymmetric):
 *
 *   overlap(A, B) = |A ∩ B| / min(|A|, |B|)
 *
 * If A ⊆ B (the divergent is a strict superset of the consensus —
 * the canonical "Jaccard floor" pattern in our bench), this is 1.0.
 * Threshold needs to sit higher (≈0.85+) to avoid spurious matches.
 */
export function asymmetricOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return a.size === 0 && b.size === 0 ? 1 : 0;
  return intersectionSize(a, b) / Math.min(a.size, b.size);
}

/** Dice / Sørensen coefficient. Included for completeness. */
export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  return (2 * intersectionSize(a, b)) / (a.size + b.size);
}

// ─────────────────────────────────────────────────────────────────────────
// SimHash — 64-bit fingerprint approximating cosine over binary features
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute a 64-bit SimHash fingerprint of a shingle set. The fingerprint
 * is stored as two Number cells (hi32, lo32) since JS lacks 64-bit ints.
 *
 * Algorithm:
 *   1. Initialise a 64-element signed counter array to zero.
 *   2. For each shingle:
 *      - Compute its 64-bit hash h.
 *      - For each bit position b: counters[b] += (bit_b(h) ? +1 : -1).
 *   3. Output bit b is 1 iff counters[b] > 0.
 *
 * With binary (unweighted) features and a sufficiently random hash,
 * Hamming(simhash(A), simhash(B)) is monotone with cosine angle.
 */
export function simhash64(shingles: Set<string>): { hi: number; lo: number } {
  const counters = new Int32Array(64);
  for (const sh of shingles) {
    const { hi, lo } = fnv1a64(sh);
    for (let b = 0; b < 32; b++) {
      counters[b]      = counters[b]!      + (((lo >>> b) & 1) ? 1 : -1);
      counters[b + 32] = counters[b + 32]! + (((hi >>> b) & 1) ? 1 : -1);
    }
  }
  let outLo = 0 >>> 0;
  let outHi = 0 >>> 0;
  for (let b = 0; b < 32; b++) {
    if (counters[b]! > 0) outLo |= (1 << b);
    if (counters[b + 32]! > 0) outHi |= (1 << b);
  }
  return { hi: outHi >>> 0, lo: outLo >>> 0 };
}

const POPCOUNT_TABLE = (() => {
  const t = new Uint8Array(65536);
  for (let i = 0; i < 65536; i++) {
    let n = i, c = 0;
    while (n) { c += n & 1; n >>>= 1; }
    t[i] = c;
  }
  return t;
})();

function popcount32(x: number): number {
  const lo = POPCOUNT_TABLE[x & 0xffff] ?? 0;
  const hi = POPCOUNT_TABLE[(x >>> 16) & 0xffff] ?? 0;
  return lo + hi;
}

/** Hamming distance between two 64-bit fingerprints (0–64). */
export function simhashHamming(
  a: { hi: number; lo: number },
  b: { hi: number; lo: number },
): number {
  return popcount32(a.lo ^ b.lo) + popcount32(a.hi ^ b.hi);
}

/**
 * Similarity ∈ [0, 1] derived from SimHash fingerprints.
 *   sim = 1 − hamming / 64
 * Two random 64-bit strings have expected hamming = 32, so random pairs
 * sit around 0.5. Real twins typically score > 0.85.
 */
export function simhashSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const fa = simhash64(a);
  const fb = simhash64(b);
  return 1 - simhashHamming(fa, fb) / 64;
}

// ─────────────────────────────────────────────────────────────────────────
// Metric registry
// ─────────────────────────────────────────────────────────────────────────

export type MetricName =
  | "jaccard"
  | "cosine"
  | "asymmetric"
  | "dice"
  | "simhash";

export const METRICS: Record<MetricName, (a: Set<string>, b: Set<string>) => number> = {
  jaccard: jaccardExact,
  cosine: cosineBinary,
  asymmetric: asymmetricOverlap,
  dice,
  simhash: simhashSimilarity,
};

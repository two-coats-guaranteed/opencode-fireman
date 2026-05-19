/**
 * MinHash signatures + banded LSH.
 *
 * MinHash gives each shingle-set a fixed-length signature whose
 * agreement rate estimates Jaccard similarity. Banded LSH then turns
 * "compare all pairs" (O(n^2)) into "compare only pairs that collide in
 * some band" (≈linear) — a blocking index.
 *
 * LSH here is ONLY a blocking step: it proposes candidate pairs cheaply.
 * The real similarity verdict is exact Jaccard over the shingle-sets
 * (see index.ts). Band parameters are tuned LOOSE on purpose — a few
 * extra candidates cost nothing; a missed twin is a real failure.
 * With 128 hashes in bands of 4, the collision S-curve sits around
 * (1/32)^(1/4) ≈ 0.42 similarity.
 *
 * Hashing is seeded and fully deterministic: identical input always
 * yields identical signatures and buckets, so benchmark runs and tests
 * are reproducible.
 */

const SIGNATURE_SIZE = 128;
const BAND_ROWS = 4; // -> 32 bands
const HASH_SEED = 0x1f2e3d4c;

/** FNV-1a, 32-bit. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 32-bit PRNG (mulberry32) for the hash-function family. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

interface Coeff {
  a: number;
  b: number;
}

/** A fixed, seeded family of `h_i(x) = a_i*x + b_i` hash functions. */
const COEFFS: Coeff[] = (() => {
  const rng = mulberry32(HASH_SEED);
  const out: Coeff[] = [];
  for (let i = 0; i < SIGNATURE_SIZE; i++) {
    out.push({ a: (rng() | 1) >>> 0, b: rng() >>> 0 });
  }
  return out;
})();

/** MinHash signature of a shingle-set. */
export function signature(set: Set<string>): Uint32Array {
  const sig = new Uint32Array(SIGNATURE_SIZE).fill(0xffffffff);
  for (const shingle of set) {
    const h = fnv1a(shingle);
    for (let i = 0; i < SIGNATURE_SIZE; i++) {
      const c = COEFFS[i]!;
      const v = (Math.imul(c.a, h) + c.b) >>> 0;
      if (v < sig[i]!) sig[i] = v;
    }
  }
  return sig;
}

/** Estimate Jaccard from two signatures (agreement rate). */
export function estimateJaccard(x: Uint32Array, y: Uint32Array): number {
  let agree = 0;
  for (let i = 0; i < SIGNATURE_SIZE; i++) {
    if (x[i] === y[i]) agree++;
  }
  return agree / SIGNATURE_SIZE;
}

/**
 * Banded LSH index. Add signed items, then read off the candidate pairs
 * — every pair that lands in the same bucket of at least one band.
 */
export class LshIndex {
  private readonly rows: number;
  private readonly bands: number;
  private readonly buckets: Array<Map<number, string[]>> = [];

  constructor(rows: number = BAND_ROWS) {
    this.rows = rows;
    this.bands = SIGNATURE_SIZE / rows;
    for (let b = 0; b < this.bands; b++) {
      this.buckets.push(new Map());
    }
  }

  add(id: string, sig: Uint32Array): void {
    for (let b = 0; b < this.bands; b++) {
      const key = this.bandKey(sig, b);
      const bucket = this.buckets[b]!;
      const arr = bucket.get(key);
      if (arr) arr.push(id);
      else bucket.set(key, [id]);
    }
  }

  /** Unordered, de-duplicated candidate pairs sharing a band bucket. */
  candidatePairs(): Array<[string, string]> {
    const seen = new Set<string>();
    const pairs: Array<[string, string]> = [];
    for (const bucket of this.buckets) {
      for (const arr of bucket.values()) {
        if (arr.length < 2) continue;
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const x = arr[i]!;
            const y = arr[j]!;
            const lo = x < y ? x : y;
            const hi = x < y ? y : x;
            const key = `${lo}\u0000${hi}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push([lo, hi]);
          }
        }
      }
    }
    return pairs;
  }

  private bandKey(sig: Uint32Array, band: number): number {
    let h = 0x811c9dc5;
    const start = band * this.rows;
    for (let r = 0; r < this.rows; r++) {
      const v = sig[start + r]!;
      for (let s = 0; s < 32; s += 8) {
        h ^= (v >>> s) & 0xff;
        h = Math.imul(h, 0x01000193);
      }
    }
    return h >>> 0;
  }
}

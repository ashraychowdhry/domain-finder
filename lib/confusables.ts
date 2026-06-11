/**
 * Brand-confusability screen.
 *
 * The name generator deliberately produces modified spellings, which
 * systematically creates lookalikes of famous brands ("stryp" vs stripe,
 * "notino" vs notion). Exact-match collision lookups miss these; this
 * module screens candidates against the second-level labels of the Tranco
 * top-10k domains (see scripts/build-brands.mjs) using banded
 * Damerau-Levenshtein distance and containment checks.
 */

import brandData from "./data/top-brands.json";

export interface ConfusableHit {
  /** The brand label it collides with, e.g. "stripe". */
  brand: string;
  /** Tranco rank of that brand's domain (lower = bigger). */
  rank: number;
  /** "exact" | "edit1" | "edit2" | "contains" */
  kind: string;
}

/**
 * Minimum candidate-name length for the distance-2 check.
 * Note: the original spec gated this at 7, but required collisions like
 * "stryp" -> "stripe" are distance 2 on a 5-char name; the rank gate below
 * keeps the check restricted to big brands, which controls the noise.
 */
const EDIT2_MIN_NAME_LEN = 5;
/** Distance-2 hits only count against big brands (rank < 2000). */
const EDIT2_MAX_RANK = 2000;
/** Containment hits only count against brands with rank < 5000. */
const CONTAINS_MAX_RANK = 5000;
/** A list label must be at least this long to count when contained in a name. */
const CONTAINS_MIN_LABEL_LEN = 5;

type Entry = [label: string, rank: number];

const entries = brandData as Entry[];

/** label -> rank, for O(1) exact lookups. */
const rankByLabel = new Map<string, number>(entries);

/** Labels pre-bucketed by length, each bucket sorted by rank ascending. */
const byLength = new Map<number, Entry[]>();
for (const entry of entries) {
  const len = entry[0].length;
  let bucket = byLength.get(len);
  if (!bucket) {
    bucket = [];
    byLength.set(len, bucket);
  }
  bucket.push(entry);
}
for (const bucket of byLength.values()) {
  bucket.sort((a, b) => a[1] - b[1]);
}

/** All entries sorted by rank ascending, for the containment scan. */
const byRank = [...entries].sort((a, b) => a[1] - b[1]);

const EMPTY: Entry[] = [];

/**
 * True when the optimal-string-alignment Damerau-Levenshtein distance
 * between `a` and `b` is <= maxDist. Banded: only cells within `maxDist`
 * of the diagonal are computed, and the scan exits early as soon as every
 * cell in a row exceeds the bound.
 */
function withinDistance(a: string, b: string, maxDist: number): boolean {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return false;
  if (la === 0 || lb === 0) return Math.max(la, lb) <= maxDist;

  const INF = maxDist + 1;
  // Three rolling rows; prevPrev is needed for the transposition case.
  let prevPrev: number[] = new Array(lb + 1).fill(INF);
  let prev: number[] = new Array(lb + 1);
  let curr: number[] = new Array(lb + 1).fill(INF);
  for (let j = 0; j <= lb; j++) prev[j] = j <= maxDist ? j : INF;

  for (let i = 1; i <= la; i++) {
    const jLo = Math.max(1, i - maxDist);
    const jHi = Math.min(lb, i + maxDist);
    curr.fill(INF);
    if (jLo === 1) curr[0] = i <= maxDist ? i : INF;
    let rowMin = INF;
    const ca = a.charCodeAt(i - 1);

    for (let j = jLo; j <= jHi; j++) {
      const cb = b.charCodeAt(j - 1);
      let v = prev[j - 1] + (ca === cb ? 0 : 1); // match / substitute
      const del = prev[j] + 1; // delete from a
      if (del < v) v = del;
      const ins = curr[j - 1] + 1; // insert into a
      if (ins < v) v = ins;
      if (
        i > 1 &&
        j > 1 &&
        ca === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === cb
      ) {
        const tr = prevPrev[j - 2] + 1; // adjacent transposition
        if (tr < v) v = tr;
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }

    if (rowMin > maxDist) return false; // whole band over budget: bail out
    const recycled = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = recycled;
  }

  return prev[lb] <= maxDist;
}

function bucketsNear(length: number, spread: number): Entry[][] {
  const buckets: Entry[][] = [];
  for (let len = length - spread; len <= length + spread; len++) {
    buckets.push(byLength.get(len) ?? EMPTY);
  }
  return buckets;
}

/**
 * Screens a candidate name against the top-10k brand labels. Returns the
 * lowest-rank (biggest) brand it could be confused with, or null.
 *
 * Checks, strongest first (so the early `rank >= best.rank` cutoffs never
 * discard a stronger kind at equal rank):
 *  - exact:    name is itself a top-10k label
 *  - edit1:    Damerau-Levenshtein distance 1, labels of length +/-1
 *  - edit2:    distance 2, labels of length +/-2, big brands only
 *  - contains: a label of >=5 chars inside the name, or the name inside
 *              a label, rank < 5000
 */
export function confusableWith(name: string): ConfusableHit | null {
  const n = name.trim().toLowerCase();
  if (n.length === 0) return null;

  let best: ConfusableHit | null = null;

  // exact
  const exactRank = rankByLabel.get(n);
  if (exactRank !== undefined) {
    best = { brand: n, rank: exactRank, kind: "exact" };
  }

  // edit1: distance 1 against labels of length +/-1
  for (const bucket of bucketsNear(n.length, 1)) {
    for (const [label, rank] of bucket) {
      if (best !== null && rank >= best.rank) break; // bucket is rank-sorted
      if (label === n) continue; // already reported as exact
      if (withinDistance(n, label, 1)) {
        best = { brand: label, rank, kind: "edit1" };
        break;
      }
    }
  }

  // edit2: distance 2 against labels of length +/-2, big brands only
  if (n.length >= EDIT2_MIN_NAME_LEN) {
    for (const bucket of bucketsNear(n.length, 2)) {
      for (const [label, rank] of bucket) {
        if (rank >= EDIT2_MAX_RANK) break; // bucket is rank-sorted
        if (best !== null && rank >= best.rank) break;
        if (label === n) continue;
        if (withinDistance(n, label, 2)) {
          best = { brand: label, rank, kind: "edit2" };
          break;
        }
      }
    }
  }

  // contains: label inside the name (label >= 5 chars) or name inside a label
  for (const [label, rank] of byRank) {
    if (rank >= CONTAINS_MAX_RANK) break; // byRank is rank-sorted
    if (best !== null && rank >= best.rank) break;
    if (label === n) continue;
    const labelInName =
      label.length >= CONTAINS_MIN_LABEL_LEN &&
      label.length < n.length &&
      n.includes(label);
    const nameInLabel = n.length < label.length && label.includes(n);
    if (labelInName || nameInLabel) {
      best = { brand: label, rank, kind: "contains" };
      break;
    }
  }

  return best;
}

// Candidate vocabulary: real English words with Zipf frequency, built by
// scripts/build-words.mjs from Norvig's count_1w + the ENABLE dictionary.

import data from "../data/words.json";

export interface Word {
  w: string;
  /** Zipf score: log10 occurrences per billion tokens (7 = "the", 3 = rare). */
  z: number;
  /** 1 = in the ENABLE dictionary; 0 = frequent non-dictionary token. */
  dict: 0 | 1;
}

export interface WordQuery {
  minLen?: number;
  maxLen?: number;
  minZipf?: number;
  maxZipf?: number;
  /** JavaScript regex source tested against the whole word. */
  pattern?: string;
  startsWith?: string;
  endsWith?: string;
  /** "english" (default) = dictionary words only; "any" = also frequent tokens. */
  dict?: "english" | "any";
  limit?: number;
}

let cache: Word[] | null = null;

/** All words, most common first. */
export function allWords(): Word[] {
  if (!cache) {
    cache = (data as unknown as { words: [string, number, 0 | 1][] }).words.map(
      ([w, z, dict]) => ({ w, z, dict }),
    );
  }
  return cache;
}

/** Human labels for the rarity picker — thresholds in Zipf. */
export const RARITY_LEVELS: { label: string; minZipf: number; hint: string }[] = [
  { label: "Very common", minZipf: 5, hint: "store, apple, switch" },
  { label: "Common", minZipf: 4, hint: "plasma, upgrade, consent" },
  { label: "Everyday", minZipf: 3.5, hint: "glitch, bouquet, scarce" },
  { label: "Known", minZipf: 3, hint: "solace, morph, nuance" },
  { label: "Any real word", minZipf: 2.5, hint: "rare but in the dictionary" },
];

export function selectWords(q: WordQuery = {}): Word[] {
  const minLen = q.minLen ?? 3;
  const maxLen = q.maxLen ?? 12;
  const minZipf = q.minZipf ?? 3;
  const maxZipf = q.maxZipf ?? Infinity;
  const dictOnly = (q.dict ?? "english") === "english";
  const re = q.pattern ? new RegExp(`^(?:${q.pattern})$`) : null;
  const out: Word[] = [];
  for (const word of allWords()) {
    if (dictOnly && word.dict !== 1) continue;
    if (word.w.length < minLen || word.w.length > maxLen) continue;
    if (word.z < minZipf || word.z > maxZipf) continue;
    if (q.startsWith && !word.w.startsWith(q.startsWith)) continue;
    if (q.endsWith && !word.w.endsWith(q.endsWith)) continue;
    if (re && !re.test(word.w)) continue;
    out.push(word);
    if (q.limit && out.length >= q.limit) break;
  }
  return out;
}

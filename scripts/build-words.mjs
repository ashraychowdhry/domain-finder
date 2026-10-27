#!/usr/bin/env node
/**
 * build-words.mjs
 *
 * Builds lib/data/words.json — the candidate vocabulary for the word scanner
 * (scripts/scan-domains.ts): real English words with a frequency score, so a
 * scan can ask for "readable single words" at any rarity.
 *
 * Sources (both free, public, static):
 *   - Peter Norvig's count_1w.txt: 333k tokens with counts from the Google
 *     Web Trillion Word Corpus (https://norvig.com/ngrams/). Gives frequency.
 *   - ENABLE word list (public domain Scrabble dictionary, 172k words), via
 *     https://github.com/dolph/dictionary. Gives "is a real English word".
 *
 * Frequency is stored as a Zipf score (log10 of occurrences per billion
 * tokens): ~7 = "the", 5 = "store", 4 = "plasma", 3.5 = "glitch", 3 =
 * "solace", 2.5 = rare-but-real. Each entry is [word, zipf, dict] where
 * dict=1 means the word is in ENABLE; dict=0 is a frequent non-dictionary
 * token (names, places, brands — "miami", "intel") kept for `--dict any`.
 *
 * Usage: node scripts/build-words.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const NORVIG_URL = "https://norvig.com/ngrams/count_1w.txt";
const ENABLE_URL =
  "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt";

const MIN_LEN = 3;
const MAX_LEN = 12;
const MIN_ZIPF_DICT = 2.5; // real words down to "rare but real"
const MIN_ZIPF_TOKEN = 4.0; // non-dictionary tokens only when very common

const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "data",
  "words.json",
);

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const [norvig, enable] = await Promise.all([text(NORVIG_URL), text(ENABLE_URL)]);

const dict = new Set(enable.split("\n").map((w) => w.trim()).filter(Boolean));

const counts = new Map();
let total = 0;
for (const line of norvig.split("\n")) {
  const [w, c] = line.trim().split(/\s+/);
  if (!w || !c) continue;
  const n = Number(c);
  counts.set(w, n);
  total += n;
}

const zipf = (n) => Math.log10((n / total) * 1e9);

const words = [];
for (const [w, n] of counts) {
  if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
  if (!/^[a-z]+$/.test(w)) continue;
  const z = zipf(n);
  const inDict = dict.has(w);
  if (inDict ? z < MIN_ZIPF_DICT : z < MIN_ZIPF_TOKEN) continue;
  words.push([w, Math.round(z * 100) / 100, inDict ? 1 : 0]);
}
words.sort((a, b) => b[1] - a[1]);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify({
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    sources: ["norvig/count_1w", "ENABLE"],
    words,
  }),
);
const dictCount = words.filter((w) => w[2] === 1).length;
console.log(
  `wrote ${OUT_PATH}: ${words.length} entries (${dictCount} dictionary words, ${words.length - dictCount} frequent tokens)`,
);

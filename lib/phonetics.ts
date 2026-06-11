// Phonetic / orthographic quality heuristics for AI-generated brand names.
//
// Live generations show two recurring failure modes:
//   1. Keyword-mash compounds ("splitsync", "harmvote", "pathfed") — the
//      user's input keywords smashed together verbatim. Lazy, unownable.
//   2. Harsh consonant junctions at the seam of the mash ("pathfed" → "thf",
//      "harmvote" → "rmv") that no English reader can sound out smoothly.
//
// This module scores those (plus syllable bloat and spelling ambiguity) so
// bad candidates can be down-ranked BEFORE we spend availability checks on
// them. Pure functions, no IO. Caller guarantees names are lowercase a-z.

export interface PhoneticReport {
  /** Human-readable flags, e.g. "contains keyword \"harm\" verbatim", "harsh junction \"thf\"". Empty = clean. */
  flags: string[];
  /** 0–30 penalty subtracted from the idea's ranking score. Negative never. */
  penalty: number;
}

// ---------------------------------------------------------------------------
// Weights. Tuned so a worst case (2 keyword hits + 2 harsh junctions +
// syllable bloat + ambiguity = 52 raw) clamps to the 30-point cap, while a
// single signal stays survivable.
// ---------------------------------------------------------------------------

const KEYWORD_HIT_POINTS = 12;
const KEYWORD_HIT_CAP = 2;
const JUNCTION_POINTS = 8;
const JUNCTION_CAP = 2;
const SYLLABLE_POINTS = 6;
const MAX_SYLLABLES = 3;
const AMBIGUITY_POINTS = 3;
const AMBIGUITY_CAP = 6;
const EUPHONY_BONUS = 3;
const MAX_PENALTY = 30;

// ---------------------------------------------------------------------------
// Legal consonant clusters.
//
// A run of 3+ consonants is acceptable only when EVERY 3-letter window of it
// appears in this set. That makes legality compositional: "nstr" (instrument)
// passes because both "nst" and "str" are smooth, while mash seams like "thf"
// (path|fed) or "rmv" (harm|vote) fail even though each half is a fine coda
// or onset on its own — a brand name should read smoothly, not merely be
// technically syllabifiable. Clusters from the spec that contain a vowel
// ("squ", "dge") never form a 3-consonant run, so they need no entry.
// ---------------------------------------------------------------------------

const LEGAL_CLUSTERS = new Set<string>([
  // Word onsets: street, sprint, splice, scrub, shrine, throne, chrome,
  // school, phrase, sphere, sclera.
  "str", "spr", "spl", "scr", "shr", "thr", "chr", "sch", "phr", "sph", "scl",
  // -ght family: light, heights, brightly, strength.
  "ght", "hts", "htl", "gth", "ngt",
  // th/ch codas: match, lunch, march, mulch, synth, month, months, health, width.
  "tch", "nch", "rch", "lch", "nth", "lth", "ths", "dth",
  // r + coda: first, north, parts, works, forms, barns, curls, world, words,
  // herbs, harps, worship.
  "rst", "rth", "rts", "rks", "rms", "rns", "rls", "rld", "rds", "rbs",
  "rps", "rsh",
  // n/m + coda: instant, plants, hands, thanks, things, distinct, prompt,
  // camps, camphor.
  "nst", "nts", "nds", "nks", "ngs", "nct", "mpt", "mps", "mph",
  // l + coda: salts, folds, silks, films, helps, whilst, dolphin.
  "lts", "lds", "lks", "lms", "lps", "lst", "lph",
  // s/t/k stacks: rocks, facts, scripts, gifts, lists, tasks, wasps, midstream.
  "cks", "cts", "pts", "fts", "sts", "sks", "sps", "dst",
  // consonant + le / -ly family: tussle, castle, kindle, gently, turtle,
  // little, middle, buckle, bubble, apple, waffle, giggle, puzzle, tumble,
  // simple, single, twinkle, sparkle, softly.
  "ssl", "stl", "ndl", "ntl", "rtl", "ttl", "ddl", "ckl", "bbl", "ppl",
  "ffl", "ggl", "zzl", "mbl", "mpl", "ngl", "nkl", "rkl", "ftl",
  // nasal + onset: hundred, central, increase, include, inflate, confront,
  // inspire, translate, transfer, transcend, answer, hungry, embrace,
  // imprint, bandwidth.
  "ndr", "ntr", "ncr", "ncl", "nfl", "nfr", "nsp", "nsl", "nsf", "nsc",
  "nsw", "ngr", "mbr", "mpr", "ndw",
  // liquid + onset: portray, surprise, airplane, circle, overflow,
  // perspective, boardroom, morphing, children, filtrate, northwest.
  "rtr", "rpr", "rpl", "rcl", "rfl", "rsp", "rdr", "rgr", "rph", "ldr",
  "ltr", "thw",
  // x compounds: extra, explore, express.
  "xtr", "xpl", "xpr",
]);

/** Doubled consonants common enough in English to read naturally. */
const COMMON_DOUBLES = new Set<string>([
  "ll", "ss", "tt", "ff", "pp", "dd", "gg", "zz", "rr", "cc",
]);

const VOWELS = new Set<string>(["a", "e", "i", "o", "u"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Is the letter at `i` acting as a vowel? 'y' counts as a vowel when it is
 * not adjacent to a true vowel ("sync", "sky") — next to one it is a glide
 * ("yard", "raycast") and stays consonantal.
 */
function isVowelAt(name: string, i: number): boolean {
  const ch = name[i];
  if (VOWELS.has(ch)) return true;
  if (ch !== "y") return false;
  const prevIsVowel = i > 0 && VOWELS.has(name[i - 1]);
  const nextIsVowel = i + 1 < name.length && VOWELS.has(name[i + 1]);
  return !prevIsVowel && !nextIsVowel;
}

/** Maximal runs of consecutive consonants, in order of appearance. */
function consonantRuns(name: string): string[] {
  const runs: string[] = [];
  let current = "";
  for (let i = 0; i < name.length; i++) {
    if (isVowelAt(name, i)) {
      if (current) runs.push(current);
      current = "";
    } else {
      current += name[i];
    }
  }
  if (current) runs.push(current);
  return runs;
}

/**
 * Rough syllable count: groups of [aeiouy], minus a trailing silent 'e'
 * ("aurelionate" → au·re·lio·nate = 4, not 5). A final "-le" stays syllabic
 * ("kindle").
 */
function countSyllables(name: string): number {
  let count = 0;
  let inGroup = false;
  for (const ch of name) {
    const isVowel = VOWELS.has(ch) || ch === "y";
    if (isVowel && !inGroup) count++;
    inGroup = isVowel;
  }
  if (
    count > 1 &&
    name.endsWith("e") &&
    !name.endsWith("le") &&
    !VOWELS.has(name[name.length - 2]) &&
    name[name.length - 2] !== "y"
  ) {
    count--;
  }
  return Math.max(1, count);
}

/** Simple stem: strip a trailing plural -s, -ing, or -ed. */
function stemOf(word: string): string {
  if (word.length >= 7 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length >= 6 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length >= 5 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Finds an uncommon doubled consonant sitting between two pronounceable
 * chunks (a vowel on each side) — the "teammeet" / "skunnel" junction shape.
 * Doubles that are everyday English spelling (ll, ss, tt, …) pass.
 */
function junctionDouble(name: string): string | null {
  for (let i = 0; i + 1 < name.length; i++) {
    const ch = name[i];
    if (ch !== name[i + 1] || VOWELS.has(ch)) continue;
    const pair = ch + ch;
    if (COMMON_DOUBLES.has(pair)) continue;
    if (/[aeiouy]/.test(name.slice(0, i)) && /[aeiouy]/.test(name.slice(i + 2))) {
      return pair;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Score a candidate name against phonetic and keyword-mash heuristics. */
export function phoneticReport(name: string, keywords: string[]): PhoneticReport {
  const flags: string[] = [];
  if (!name) return { flags, penalty: 0 };

  let penalty = 0;

  // 1. Keyword-verbatim: the name contains a user keyword (or its simple
  //    stem) as a contiguous substring. Strongest mash signal.
  let keywordHits = 0;
  const seen = new Set<string>();
  for (const raw of keywords) {
    const kw = raw.toLowerCase().trim();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    if (kw.length >= 4 && name.includes(kw)) {
      flags.push(`contains keyword "${kw}" verbatim`);
      keywordHits++;
      continue;
    }
    const stem = stemOf(kw);
    if (stem !== kw && stem.length >= 4 && name.includes(stem)) {
      flags.push(`contains stem "${stem}" of keyword "${kw}"`);
      keywordHits++;
    }
  }
  penalty += Math.min(keywordHits, KEYWORD_HIT_CAP) * KEYWORD_HIT_POINTS;

  // 2. Harsh consonant junctions: any 3+ consonant run whose 3-letter
  //    windows are not all whitelisted clusters.
  let badJunctions = 0;
  for (const run of consonantRuns(name)) {
    if (run.length < 3) continue;
    for (let i = 0; i + 3 <= run.length; i++) {
      const window = run.slice(i, i + 3);
      if (!LEGAL_CLUSTERS.has(window)) {
        flags.push(`harsh junction "${window}"`);
        badJunctions++;
        break; // one flag per run
      }
    }
  }
  penalty += Math.min(badJunctions, JUNCTION_CAP) * JUNCTION_POINTS;

  // 3. Syllable bloat: more than 3 estimated syllables is a mouthful.
  const syllables = countSyllables(name);
  if (syllables > MAX_SYLLABLES) {
    flags.push(`${syllables} syllables (want ${MAX_SYLLABLES} or fewer)`);
    penalty += SYLLABLE_POINTS;
  }

  // 4. Spelling ambiguity: traits that make the name hard to spell after
  //    hearing it (the radio test). 3 points each, capped at 6.
  let ambiguity = 0;
  if (name.includes("ph")) {
    flags.push(`spelling ambiguity: "ph" (heard as "f")`);
    ambiguity += AMBIGUITY_POINTS;
  }
  const doubled = junctionDouble(name);
  if (doubled) {
    flags.push(`spelling ambiguity: doubled "${doubled}" at a junction`);
    ambiguity += AMBIGUITY_POINTS;
  }
  for (let i = 0; i < name.length; i++) {
    if (name[i] === "q" && name[i + 1] !== "u") {
      flags.push(`spelling ambiguity: "q" not followed by "u"`);
      ambiguity += AMBIGUITY_POINTS;
      break;
    }
  }
  if (name.endsWith("ough")) {
    flags.push(`spelling ambiguity: ends in "-ough"`);
    ambiguity += AMBIGUITY_POINTS;
  }
  penalty += Math.min(ambiguity, AMBIGUITY_CAP);

  // 5. Euphony bonus: short name ending on a vowel or liquid/nasal — the
  //    vercel / granola / lumora shape. Never takes the total below zero.
  const last = name[name.length - 1];
  if (syllables <= MAX_SYLLABLES && "aeiouylrnm".includes(last)) {
    penalty -= EUPHONY_BONUS;
  }

  return { flags, penalty: Math.max(0, Math.min(MAX_PENALTY, penalty)) };
}

// NSFW screen for the Word scan. A whole-word lexicon over the scanner's
// vocabulary (lib/data/nsfw.json), so real words are matched exactly:
// "breasts" is caught, "cucumber" and "documented" are not. That's the
// difference from lib/brandsafety.ts, which substring-scans AI-coined names.
//
// Applied at query time, so a lexicon update takes effect on the existing
// index without a rescan.

import data from "../data/nsfw.json";
import type { NsfwCategory } from "./types";

const LEXICON = new Map(Object.entries(data.words) as [string, NsfwCategory][]);

/** Categories hidden even when the user opts into NSFW results. */
export const ALWAYS_HIDDEN: ReadonlySet<NsfwCategory> = new Set<NsfwCategory>(["slur"]);

/** The word's NSFW category, or undefined when it's safe. */
export function nsfwCategory(word: string): NsfwCategory | undefined {
  return LEXICON.get(word.toLowerCase());
}

/** Vocabulary build the lexicon was reviewed against (see words.json `built`). */
export const NSFW_VOCAB_BUILT: string = data.vocabBuilt;

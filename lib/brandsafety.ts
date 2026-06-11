/**
 * Brand-safety screen for AI-coined names.
 *
 * Portmanteaus and root+affix constructions can embed slurs or crude words
 * across morpheme boundaries — including in languages the developer doesn't
 * speak (the classic "Experts Exchange" problem). This module does a plain
 * substring scan against a heavily curated multilingual profanity list
 * (en/es/fr/de/it, derived from LDNOOBW — see scripts/build-profanity.mjs
 * for the curation rules and documented exclusions).
 *
 * Policy: FLAG, never block. A hit only surfaces a UI warning so a human
 * can eyeball the name; false positives are tolerable, silent embarrassing
 * launches are not. The list is curated aggressively against Scunthorpe
 * false positives ("analyse", "classify", "debugger", "specialist", ... all
 * pass clean), with two documented hand-kept tradeoffs: "cum" (matches
 * Latin doCUMent-class roots) and "shit" (matches the obscure "mishit"),
 * both judged worth the noise for severity.
 */

import words from "./data/profanity.json";

/**
 * Lowercase, fold diacritics so "Pútaín"-style spellings still hit the
 * ASCII-only list, and strip anything that isn't a letter so separators
 * don't hide an embedded word ("merda-hub" still contains "merda").
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

/** Returns the embedded objectionable word if found (for a UI warning), else null. */
export function brandSafetyFlag(name: string): string | null {
  const normalized = normalize(name);
  if (normalized.length === 0) return null;
  // Linear scan is fine: ~16 candidate names x ~300 words per search.
  for (const word of words as string[]) {
    if (normalized.includes(word)) return word;
  }
  return null;
}

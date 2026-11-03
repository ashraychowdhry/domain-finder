/**
 * Tests for the word scanner's pure parts: vocabulary selection, index
 * queries, first-checkout cost and the premium heuristic.
 *
 * Run: npx tsx scripts/test-scan.ts
 */

import { selectWords } from "../lib/scan/words";
import { queryIndex, mergeTld, emptyIndex } from "../lib/scan/index";
import { firstCost, premiumRisk } from "../lib/scan/pricing";
import { minYears, rdapBase, hostPolicy } from "../lib/scan/registries";
import { ALWAYS_HIDDEN, NSFW_VOCAB_BUILT, nsfwCategory } from "../lib/scan/nsfw";
import type { NsfwCategory, ScanEntry } from "../lib/scan/types";
import vocabData from "../lib/data/words.json";
import nsfwData from "../lib/data/nsfw.json";

let passed = 0;
let failed = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else failed++;
  (ok ? console.log : console.error)(
    `${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
  );
}

// ── vocabulary ──
const common5 = selectWords({ minLen: 5, maxLen: 5, minZipf: 5 });
check("very common 5-letter words exist", common5.length > 100, true);
check("all are 5 letters", common5.every((w) => w.w.length === 5), true);
check("all dictionary by default", common5.every((w) => w.dict === 1), true);
check("sorted most common first", common5[0].z >= common5[common5.length - 1].z, true);
check("'store' is a very common word", common5.some((w) => w.w === "store"), true);
const ly = selectWords({ pattern: "[a-z]+ly", maxLen: 6, minZipf: 4, limit: 5 });
check("pattern is anchored to whole word", ly.every((w) => /^[a-z]+ly$/.test(w.w)), true);
check("limit honoured", ly.length, 5);
check("startsWith/endsWith", selectWords({ startsWith: "un", endsWith: "ed", minZipf: 4 }).every((w) => w.w.startsWith("un") && w.w.endsWith("ed")), true);
check("dict=any includes tokens", selectWords({ dict: "any", minZipf: 4 }).some((w) => w.dict === 0), true);

// ── registries ──
check(".ai minimum term is 2 years", minYears("ai"), 2);
check(".com minimum term is 1 year", minYears("com"), 1);
check("RDAP base for .ai", rdapBase("ai"), "https://rdap.identitydigital.services/rdap/domain/");
check("unknown TLD has no base", rdapBase("zzzz"), undefined);
check("Identity Digital policy is conservative", hostPolicy("rdap.identitydigital.services").rps <= 1, true);

// ── cost + premium heuristic ──
const mk = (p: Partial<ScanEntry>): ScanEntry => ({
  d: "solace.ai", w: "solace", tld: "ai", z: 3.2, dict: 1, status: "available", src: "rdap", at: 1, ...p,
});
check("first checkout for .ai = list × 2", firstCost(mk({}), 82.7), 165.4);
check("first checkout for .com = list", firstCost(mk({ d: "solace.com", tld: "com" }), 11.08), 11.08);
check("verified price wins", firstCost(mk({ priceClass: "premium", price: 2500 }), 82.7), 2500);
check("no list price → NaN", Number.isNaN(firstCost(mk({}), undefined)), true);
check("short word in premium-capable TLD → high risk", premiumRisk(mk({ w: "home", d: "home.app", tld: "app", z: 5.5 })), "high");
check("longer rarer word → low risk", premiumRisk(mk({ w: "solace", z: 3.2 })), "low");
check("legacy gTLD never premium", premiumRisk(mk({ w: "home", d: "home.com", tld: "com", z: 5.5 })), "low");
check("verified premium reported", premiumRisk(mk({ priceClass: "premium", price: 999 })), "verified-premium");

// ── index query ──
let idx = emptyIndex();
idx = mergeTld(idx, "ai", [
  mk({ d: "solace.ai", w: "solace", z: 3.2 }),
  mk({ d: "home.ai", w: "home", z: 5.5 }),
  mk({ d: "glitch.ai", w: "glitch", z: 3.6, status: "likely", src: "dns" }),
  mk({ d: "openai.ai", w: "openai", z: 3.0, status: "taken" }),
  mk({ d: "miami.ai", w: "miami", z: 4.2, dict: 0 }),
  mk({ d: "costly.ai", w: "costly", z: 3.4, priceClass: "premium", price: 3000 }),
]);
idx.tlds.ai = { scannedAt: 1, words: 6, nx: 6, confirmed: 5, available: 4, likely: 1, reg: 82.7, renew: 82.7, minYears: 2 };
const all = queryIndex(idx, { tlds: ["ai"] });
check("taken excluded, premium/high-risk excluded, tokens excluded by default", all.rows.map((r) => r.d), ["glitch.ai", "solace.ai"]);
check("rows carry first-checkout cost", all.rows[1].cost, 165.4);
check("total counts rows", all.total, 2);
check("maxCost filters", queryIndex(idx, { tlds: ["ai"], maxCost: 100 }).total, 0);
check("premiumOk includes home + costly", queryIndex(idx, { tlds: ["ai"], premiumOk: true }).rows.map((r) => r.d), ["home.ai", "glitch.ai", "costly.ai", "solace.ai"]);
check("includeLikely=false drops DNS-only", queryIndex(idx, { tlds: ["ai"], includeLikely: false }).rows.map((r) => r.d), ["solace.ai"]);
check("dict=any includes miami", queryIndex(idx, { tlds: ["ai"], dict: "any" }).rows.some((r) => r.d === "miami.ai"), true);
check("sort=rare", queryIndex(idx, { tlds: ["ai"], sort: "rare" }).rows[0].d, "solace.ai");
check("sort=short", queryIndex(idx, { tlds: ["ai"], sort: "short", premiumOk: true }).rows[0].d, "home.ai");
check("pattern + limit + offset", queryIndex(idx, { tlds: ["ai"], pattern: ".*[eh]", limit: 1, offset: 1 }).rows.map((r) => r.d), ["solace.ai"]);
check("bad regex is ignored", queryIndex(idx, { tlds: ["ai"], pattern: "(" }).total, 2);
check("mergeTld replaces a TLD's entries", mergeTld(idx, "ai", []).entries.length, 0);
check("unknown TLD → empty", queryIndex(idx, { tlds: ["zz"] }).total, 0);

// ── NSFW lexicon ──
const vocab = new Set((vocabData as unknown as { words: [string, number, 0 | 1][] }).words.map((w) => w[0]));
const lexicon = Object.entries(nsfwData.words) as [string, NsfwCategory][];
const CATEGORIES: NsfwCategory[] = ["sexual", "profanity", "slur", "violence", "drugs"];
check("lexicon reviewed against the current vocabulary build", NSFW_VOCAB_BUILT, (vocabData as { built: string }).built);
check("every lexicon word is in the vocabulary", lexicon.filter(([w]) => !vocab.has(w)).map(([w]) => w), []);
check("every lexicon category is known", lexicon.filter(([, c]) => !CATEGORIES.includes(c)).map(([w]) => w), []);
check("whole-word match: breasts is sexual", nsfwCategory("breasts"), "sexual");
check("case-insensitive lookup", nsfwCategory("Breasts"), "sexual");
for (const safe of ["cucumber", "documented", "analysis", "cocktail", "assess", "classic", "therapist", "solace"]) {
  check(`substring-only word '${safe}' is safe`, nsfwCategory(safe), undefined);
}
check("slurs are always hidden", ALWAYS_HIDDEN.has("slur"), true);
// Pick a slur from the data rather than spelling one out in source.
const slur = lexicon.find(([, c]) => c === "slur")?.[0];
check("lexicon has at least one slur entry", typeof slur, "string");

let nidx = emptyIndex();
nidx = mergeTld(nidx, "ai", [
  mk({ d: "solace.ai", w: "solace", z: 3.2 }),
  mk({ d: "breasts.ai", w: "breasts", z: 3.3 }),
  mk({ d: `${slur}.ai`, w: slur ?? "", z: 3.1 }),
]);
nidx.tlds.ai = idx.tlds.ai;
const safeOnly = queryIndex(nidx, { tlds: ["ai"] });
check("NSFW hidden by default", safeOnly.rows.map((r) => r.d), ["solace.ai"]);
check("hidden count excludes always-hidden slurs", safeOnly.nsfwHidden, 1);
const withNsfw = queryIndex(nidx, { tlds: ["ai"], nsfw: true });
check("nsfw=true reveals NSFW words but never slurs", withNsfw.rows.map((r) => r.d), ["breasts.ai", "solace.ai"]);
check("revealed rows carry their category", withNsfw.rows[0].nsfw, "sexual");
check("safe rows carry no category", "nsfw" in withNsfw.rows[1], false);
check("nothing counted as hidden when opted in", withNsfw.nsfwHidden, 0);
check("hidden count respects other filters", queryIndex(nidx, { tlds: ["ai"], maxLen: 6 }).nsfwHidden, 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

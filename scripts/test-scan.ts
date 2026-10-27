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
import type { ScanEntry } from "../lib/scan/types";

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

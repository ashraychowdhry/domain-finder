/**
 * scan-domains.ts — find real English words still unregistered under a TLD,
 * and what they cost. Builds/refreshes lib/data/scan/index.json, which
 * /api/browse and the "Word scan" section of the home page read.
 *
 * Pipeline per TLD (cheapest signal first, so the expensive ones see few names):
 *   1. vocabulary   lib/data/words.json filtered by length / rarity / pattern
 *   2. DNS          the TLD's own nameservers (NXDOMAIN vs referral, no
 *                   recursion; DoH fallback) — NXDOMAIN survivors continue
 *   3. RDAP         the registry's own endpoint, paced per host — 404 = available
 *   4. price        Porkbun list price (keyless) × minimum term; if a registrar
 *                   key is set, each available name is checked for PREMIUM pricing
 *
 * Usage (all flags optional):
 *   npx tsx scripts/scan-domains.ts --tlds ai,io,app --max-len 8 --min-zipf 3.5
 *   npx tsx scripts/scan-domains.ts --tlds com --min-len 4 --max-len 5 --min-zipf 3
 *   npx tsx scripts/scan-domains.ts --tlds dev --pattern '[a-z]*ly' --max-cost 20
 *
 *   --tlds a,b,c      TLDs to scan (default: ai,io,app,dev,xyz,co,me,so,com,net,org)
 *   --min-len/--max-len  word length bounds (default 3..10)
 *   --min-zipf N      rarity floor: 5 very common, 4 common, 3.5 everyday,
 *                     3 known, 2.5 any real word (default 3)
 *   --dict english|any   dictionary words only (default) or also frequent tokens
 *   --pattern RE      regex the whole word must match
 *   --starts/--ends   prefix / suffix
 *   --rdap-budget N   max RDAP requests per registry host this run (default: host policy)
 *   --no-rdap         DNS only (everything stays "likely")
 *   --no-prices       skip registrar price verification even if keys are set
 *   --max-cost N      only PRINT rows whose first checkout is ≤ N USD
 *   --print N         rows to print per TLD (default 40)
 *   --dry             don't write the index
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { selectWords } from "../lib/scan/words";
import { authBatch } from "../lib/scan/dns-auth";
import { RdapClient } from "../lib/scan/rdap";
import { minYears, rdapBase } from "../lib/scan/registries";
import {
  configuredVerifier,
  firstCost,
  premiumRisk,
  verifyPrices,
} from "../lib/scan/pricing";
import { emptyIndex, INDEX_PATH, mergeTld } from "../lib/scan/index";
import { getTldPricing } from "../lib/pricing";
import { brandSafetyFlag } from "../lib/brandsafety";
import type { ScanEntry, ScanIndex, TldScanMeta } from "../lib/scan/types";

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
const num = (name: string, d: number) => {
  const v = flag(name);
  return v === undefined ? d : Number(v);
};

const DEFAULT_TLDS = ["ai", "io", "app", "dev", "xyz", "co", "me", "so", "com", "net", "org"];
const tlds = (flag("tlds") ?? DEFAULT_TLDS.join(","))
  .split(",")
  .map((t) => t.trim().toLowerCase().replace(/^\./, ""))
  .filter(Boolean);
const wordQuery = {
  minLen: num("min-len", 3),
  maxLen: num("max-len", 10),
  minZipf: num("min-zipf", 3),
  dict: (flag("dict") === "any" ? "any" : "english") as "any" | "english",
  pattern: flag("pattern"),
  startsWith: flag("starts"),
  endsWith: flag("ends"),
};
const rdapBudget = flag("rdap-budget") ? Number(flag("rdap-budget")) : Infinity;
const useRdap = !has("no-rdap");
const usePrices = !has("no-prices");
const maxCost = flag("max-cost") ? Number(flag("max-cost")) : undefined;
const printN = num("print", 40);
const dry = has("dry");

const log = (s: string) => console.error(s);

async function main() {
  // ── index ───────────────────────────────────────────────────────────────
  let index: ScanIndex;
  try {
    index = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as ScanIndex;
  } catch {
    index = emptyIndex();
  }
  const prior = new Map(index.entries.map((e) => [e.d, e]));

  const words = selectWords(wordQuery);
  log(`vocabulary: ${words.length} words (len ${wordQuery.minLen}-${wordQuery.maxLen}, zipf ≥ ${wordQuery.minZipf}, ${wordQuery.dict})`);

  const listPrices = (await getTldPricing(tlds)) ?? {};
  const verifier = usePrices ? configuredVerifier() : null;
  log(
    verifier
      ? `price verification: ${verifier.name} (${verifier.batchSize}/call)`
      : "price verification: none (set SPACESHIP_API_KEY/SECRET, NAMECOM_USERNAME/TOKEN or PORKBUN_API_KEY/SECRET_API_KEY to detect premium names)",
  );

  const rdap = new RdapClient(rdapBudget);

  for (const tld of tlds) {
    const t0 = Date.now();
    const domains = words.map((w) => `${w.w}.${tld}`);
    log(`\n.${tld}: DNS ${domains.length} names…`);
    const dns = await authBatch(tld, domains, {
      onProgress: (n) => log(`  dns ${n}/${domains.length}`),
    });

    const survivors = words.filter((_, i) => dns[i].status === "nx");
    const unknownDns = dns.filter((d) => d.status === "unknown").length;
    log(
      `  dns done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${survivors.length} NXDOMAIN, ${unknownDns} unresolved`,
    );

    const now = Date.now();
    const entries: ScanEntry[] = [];
    // Most common words first: they're the most valuable finds, so they get
    // confirmed within the RDAP budget before rarer ones.
    survivors.sort((a, b) => b.z - a.z);
    let confirmed = 0;
    let blockedAt: number | null = null;
    const base = rdapBase(tld);
    if (useRdap && !base) log(`  no RDAP endpoint known for .${tld} — results stay "likely"`);

    for (const w of survivors) {
      const d = `${w.w}.${tld}`;
      const old = prior.get(d);
      const entry: ScanEntry = {
        d,
        w: w.w,
        tld,
        z: w.z,
        dict: w.dict,
        status: "likely",
        src: "dns",
        at: now,
      };
      const bad = brandSafetyFlag(w.w);
      if (bad) entry.flags = ["profanity"];
      // RDAP-confirmed "taken" names (registered without NS) stay taken.
      if (old?.src === "rdap" && old.status === "taken") {
        entries.push({ ...old, at: now });
        continue;
      }
      if (useRdap && base && rdap.canCheck(tld)) {
        const v = await rdap.check(d);
        if (v === "available" || v === "taken") {
          entry.status = v;
          entry.src = "rdap";
          confirmed++;
          if (confirmed % 50 === 0) log(`  rdap ${confirmed}/${survivors.length}`);
        } else if (v === "blocked" && blockedAt === null) {
          blockedAt = entries.length;
          log(`  rdap: host quota reached for .${tld} after ${confirmed} confirmations — rest stay "likely"`);
        }
      }
      // Keep a prior price verification if the name is still unregistered.
      if (old?.priceClass && entry.status !== "taken") {
        entry.priceClass = old.priceClass;
        entry.price = old.price;
        entry.priceSrc = old.priceSrc;
        entry.priceAt = old.priceAt;
      }
      entries.push(entry);
    }

    if (verifier) {
      const toVerify = entries
        .filter((e) => e.status !== "taken" && !e.priceAt)
        .map((e) => e.d);
      if (toVerify.length) {
        log(`  prices: verifying ${toVerify.length} names via ${verifier.name}…`);
        const prices = await verifyPrices(verifier, toVerify, (n, t) => {
          if (n % 200 === 0 || n === t) log(`  prices ${n}/${t}`);
        });
        for (const e of entries) {
          const p = prices.get(e.d);
          if (!p) continue;
          e.priceClass = p.priceClass;
          e.price = p.price;
          e.priceSrc = p.src;
          e.priceAt = Date.now();
        }
      }
    }

    const available = entries.filter((e) => e.status === "available").length;
    const likely = entries.filter((e) => e.status === "likely").length;
    const meta: TldScanMeta = {
      scannedAt: now,
      words: words.length,
      nx: survivors.length,
      confirmed: entries.filter((e) => e.src === "rdap").length,
      available,
      likely,
      reg: listPrices[tld]?.reg,
      renew: listPrices[tld]?.renew,
      minYears: minYears(tld),
    };
    index = mergeTld(index, tld, entries);
    index.tlds[tld] = meta;

    // ── report ──
    const reg = meta.reg;
    const rows = entries
      .filter((e) => e.status !== "taken" && e.priceClass !== "unavailable")
      .map((e) => ({ e, cost: firstCost(e, reg), risk: premiumRisk(e) }))
      .filter((r) => maxCost === undefined || !(r.cost > maxCost))
      .sort((a, b) => b.e.z - a.e.z);
    const costNote = reg
      ? `list $${reg}/yr${meta.minYears > 1 ? ` × ${meta.minYears}-yr minimum = $${(reg * meta.minYears).toFixed(2)} first checkout` : ""}`
      : "no list price";
    console.log(
      `\n.${tld} — ${available} available (registry-confirmed), ${likely} likely (DNS-only), of ${words.length} words · ${costNote} · ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
    for (const { e, cost, risk } of rows.slice(0, printN)) {
      const status = e.status === "available" ? "AVAIL " : "likely";
      const price = Number.isFinite(cost) ? `$${cost.toFixed(2).padStart(8)}` : "   ?    ";
      const riskTxt =
        risk === "verified-premium"
          ? "PREMIUM"
          : risk === "verified-standard"
            ? "standard"
            : risk === "high"
              ? "premium?"
              : "";
      console.log(
        `  ${e.d.padEnd(18)} ${status}  zipf ${e.z.toFixed(2)}  ${price}  ${riskTxt}${e.flags ? "  ⚠ " + e.flags.join(",") : ""}`,
      );
    }
    if (rows.length > printN) console.log(`  … ${rows.length - printN} more (see ${INDEX_PATH})`);
  }

  log(`\nrdap usage: ${JSON.stringify(rdap.stats())}`);
  if (!dry) {
    mkdirSync(dirname(INDEX_PATH), { recursive: true });
    writeFileSync(INDEX_PATH, JSON.stringify(index));
    log(`wrote ${INDEX_PATH}: ${index.entries.length} entries across ${Object.keys(index.tlds).length} TLDs`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Stage 3 of the scan: what does it actually cost?
//
// List price per TLD is keyless (Porkbun's public catalog, lib/pricing.ts).
// What no keyless source reveals is whether a specific UNREGISTERED name is a
// registry PREMIUM (home.app, car.xyz — RDAP says 404, the registrar wants
// $2,000). Only a registrar's availability API returns that, so this module
// verifies prices through whichever registrar key is configured:
//
//   SPACESHIP_API_KEY + SPACESHIP_API_SECRET   docs.spaceship.dev — POST
//     /v1/domains/available, 20 names/call, 30 calls per 30s, returns
//     `premiumPricing` for premium names. Free account; the registrar Vocari
//     already links to.
//   NAMECOM_USERNAME + NAMECOM_TOKEN           docs.name.com — POST
//     /core/v1/domains:checkAvailability, 50 names/call, 20 req/s. Returns
//     `premium` + `purchasePrice`. The most scalable option.
//   PORKBUN_API_KEY + PORKBUN_SECRET_API_KEY   porkbun.com/api/json/v3 — POST
//     /domain/checkDomain, 25 names/call, 200 names/min, and "sustained bulk
//     checking" drops an account to 50 names / 5 min for 24h. Fine for a page
//     of results, poor for scanning.
//
// Without any key, entries carry no priceClass and the UI shows a heuristic
// premium risk instead (short or very common words in premium-capable TLDs).

import type { PriceClass, PriceSource, PremiumRisk, ScanEntry } from "./types";
import { minYears, registryHasPremiums } from "./registries";

export interface VerifiedPrice {
  priceClass: PriceClass;
  /** First-term registration price in USD when purchasable. */
  price?: number;
  src: PriceSource;
}

export interface PriceVerifier {
  name: PriceSource;
  batchSize: number;
  /** Minimum ms between calls (derived from the registrar's rate limit). */
  intervalMs: number;
  check(domains: string[]): Promise<Map<string, VerifiedPrice>>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function spaceship(key: string, secret: string): PriceVerifier {
  return {
    name: "spaceship",
    batchSize: 20,
    intervalMs: 1100, // 30 per 30s
    async check(domains) {
      const out = new Map<string, VerifiedPrice>();
      const res = await fetch("https://spaceship.dev/api/v1/domains/available", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": key,
          "X-API-Secret": secret,
        },
        body: JSON.stringify({ domains }),
      });
      if (!res.ok) throw new Error(`spaceship HTTP ${res.status}`);
      const data = (await res.json()) as {
        domains?: {
          domain: string;
          result: string;
          premiumPricing?: { operation: string; price: number; currency: string }[];
        }[];
      };
      for (const d of data.domains ?? []) {
        const reg = d.premiumPricing?.find((p) => p.operation === "register");
        if (d.result !== "available") {
          out.set(d.domain, { priceClass: "unavailable", src: "spaceship" });
        } else if (reg) {
          out.set(d.domain, { priceClass: "premium", price: reg.price, src: "spaceship" });
        } else {
          out.set(d.domain, { priceClass: "standard", src: "spaceship" });
        }
      }
      return out;
    },
  };
}

function namecom(username: string, token: string): PriceVerifier {
  const auth = "Basic " + Buffer.from(`${username}:${token}`).toString("base64");
  return {
    name: "namecom",
    batchSize: 50,
    intervalMs: 250, // well under 20 req/s
    async check(domains) {
      const out = new Map<string, VerifiedPrice>();
      const res = await fetch("https://api.name.com/core/v1/domains:checkAvailability", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ domainNames: domains }),
      });
      if (!res.ok) throw new Error(`name.com HTTP ${res.status}`);
      const data = (await res.json()) as {
        results?: {
          domainName: string;
          purchasable: boolean;
          premium?: boolean;
          purchasePrice?: number;
          purchaseType?: string;
        }[];
      };
      for (const r of data.results ?? []) {
        const d = r.domainName.toLowerCase();
        if (!r.purchasable || r.purchaseType !== "registration") {
          out.set(d, { priceClass: "unavailable", src: "namecom" });
        } else {
          out.set(d, {
            priceClass: r.premium ? "premium" : "standard",
            price: r.purchasePrice,
            src: "namecom",
          });
        }
      }
      return out;
    },
  };
}

function porkbun(apikey: string, secretapikey: string): PriceVerifier {
  return {
    name: "porkbun",
    batchSize: 25,
    intervalMs: 8000, // 200 names / 60s
    async check(domains) {
      const out = new Map<string, VerifiedPrice>();
      const res = await fetch("https://api.porkbun.com/api/json/v3/domain/checkDomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey, secretapikey, domains }),
      });
      if (!res.ok) throw new Error(`porkbun HTTP ${res.status}`);
      const data = (await res.json()) as {
        status?: string;
        message?: string;
        domains?: unknown;
      };
      if (data.status !== "SUCCESS") throw new Error(`porkbun: ${data.message ?? "error"}`);
      type Item = { domain?: string; avail?: string; premium?: string | boolean; price?: string };
      const items: [string, Item][] = Array.isArray(data.domains)
        ? (data.domains as Item[]).map((i) => [String(i.domain ?? "").toLowerCase(), i])
        : Object.entries((data.domains ?? {}) as Record<string, Item>);
      for (const [d, i] of items) {
        if (!d) continue;
        const premium = i.premium === true || i.premium === "yes" || i.premium === "1";
        if (i.avail !== "yes") out.set(d, { priceClass: "unavailable", src: "porkbun" });
        else
          out.set(d, {
            priceClass: premium ? "premium" : "standard",
            price: i.price ? Number(i.price) : undefined,
            src: "porkbun",
          });
      }
      return out;
    },
  };
}

/** The verifier configured by environment, preferring the most scalable. */
export function configuredVerifier(env: NodeJS.ProcessEnv = process.env): PriceVerifier | null {
  if (env.NAMECOM_USERNAME && env.NAMECOM_TOKEN) return namecom(env.NAMECOM_USERNAME, env.NAMECOM_TOKEN);
  if (env.SPACESHIP_API_KEY && env.SPACESHIP_API_SECRET)
    return spaceship(env.SPACESHIP_API_KEY, env.SPACESHIP_API_SECRET);
  if (env.PORKBUN_API_KEY && env.PORKBUN_SECRET_API_KEY)
    return porkbun(env.PORKBUN_API_KEY, env.PORKBUN_SECRET_API_KEY);
  return null;
}

/** Verify many domains in paced batches; failures leave entries unverified. */
export async function verifyPrices(
  verifier: PriceVerifier,
  domains: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, VerifiedPrice>> {
  const out = new Map<string, VerifiedPrice>();
  for (let i = 0; i < domains.length; i += verifier.batchSize) {
    const batch = domains.slice(i, i + verifier.batchSize);
    try {
      for (const [d, v] of await verifier.check(batch)) out.set(d, v);
    } catch (e) {
      console.error(`  price check failed (${verifier.name}): ${(e as Error).message}`);
      if (/HTTP 4(01|03)/.test((e as Error).message)) break; // bad credentials — stop
    }
    onProgress?.(Math.min(i + batch.length, domains.length), domains.length);
    if (i + verifier.batchSize < domains.length) await sleep(verifier.intervalMs);
  }
  return out;
}

/**
 * Premium risk without a registrar check: registries price short and very
 * common words as premium. Legacy gTLDs have no premium tier at all.
 */
export function premiumRisk(e: ScanEntry): PremiumRisk {
  if (e.priceClass === "premium") return "verified-premium";
  if (e.priceClass === "standard") return "verified-standard";
  if (!registryHasPremiums(e.tld)) return "low";
  return e.w.length <= 4 || e.z >= 4.5 ? "high" : "low";
}

/** First-checkout cost: verified price, else list price × minimum term. */
export function firstCost(e: ScanEntry, listReg: number | undefined): number {
  if (e.price !== undefined && e.priceClass !== "unavailable") return e.price;
  const years = minYears(e.tld);
  return listReg !== undefined ? Math.round(listReg * years * 100) / 100 : NaN;
}

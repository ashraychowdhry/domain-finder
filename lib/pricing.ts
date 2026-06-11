// Registrar list prices per TLD via Porkbun's keyless pricing API.
//
// The endpoint is slow (~15-20s, returns all ~900 TLDs), so it is fetched in
// parallel with the model round and cached module-level for 24h — warm Fluid
// Compute instances answer instantly. Always fail-soft: pricing is garnish.
// Note: .so is absent from Porkbun's catalog (no price shown for it).

import type { TldPrice } from "./types";

const TTL_MS = 24 * 60 * 60 * 1000;

let cache: { at: number; prices: Record<string, TldPrice> } | null = null;
let inflight: Promise<Record<string, TldPrice> | null> | null = null;

async function fetchAll(): Promise<Record<string, TldPrice> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      pricing?: Record<string, { registration?: string; renewal?: string }>;
    };
    if (data.status !== "SUCCESS" || !data.pricing) return null;
    const prices: Record<string, TldPrice> = {};
    for (const [tld, p] of Object.entries(data.pricing)) {
      const reg = Number(p.registration);
      const renew = Number(p.renewal);
      if (Number.isFinite(reg) && Number.isFinite(renew)) {
        prices[tld] = { reg, renew };
      }
    }
    cache = { at: Date.now(), prices };
    return prices;
  } catch {
    return null;
  }
}

/**
 * Prices for the given TLDs, or null when the catalog isn't available yet.
 * Dedupes concurrent fetches; never throws.
 */
export async function getTldPricing(
  tlds: string[],
): Promise<Record<string, TldPrice> | null> {
  let prices = cache && Date.now() - cache.at < TTL_MS ? cache.prices : null;
  if (!prices) {
    inflight ??= fetchAll().finally(() => {
      inflight = null;
    });
    prices = await inflight;
  }
  if (!prices) return null;
  const out: Record<string, TldPrice> = {};
  for (const tld of tlds) {
    if (prices[tld]) out[tld] = prices[tld];
  }
  return out;
}

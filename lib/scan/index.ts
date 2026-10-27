// The scan index: a committed JSON file of every word×TLD the scanner found
// unregistered (plus RDAP-confirmed taken ones, so quota isn't re-spent on
// them). Small — only survivors are stored — and queried by /api/browse.

import type {
  BrowseQuery,
  BrowseResponse,
  BrowseRow,
  ScanEntry,
  ScanIndex,
} from "./types";
import { firstCost, premiumRisk } from "./pricing";

export const INDEX_PATH = "lib/data/scan/index.json";

export function emptyIndex(): ScanIndex {
  return { v: 1, updatedAt: 0, tlds: {}, entries: [] };
}

/** Replace a TLD's entries with a fresh scan's results. */
export function mergeTld(index: ScanIndex, tld: string, entries: ScanEntry[]): ScanIndex {
  const others = index.entries.filter((e) => e.tld !== tld);
  const next = [...others, ...entries].sort((a, b) => b.z - a.z || a.d.localeCompare(b.d));
  return { ...index, updatedAt: Date.now(), entries: next };
}

export function queryIndex(index: ScanIndex, q: BrowseQuery): BrowseResponse {
  const tlds = new Set(q.tlds);
  const minLen = q.minLen ?? 1;
  const maxLen = q.maxLen ?? 64;
  const minZipf = q.minZipf ?? 0;
  const maxZipf = q.maxZipf ?? Infinity;
  const dictOnly = (q.dict ?? "english") === "english";
  const includeLikely = q.includeLikely ?? true;
  const premiumOk = q.premiumOk ?? false;
  let re: RegExp | null = null;
  if (q.pattern) {
    try {
      re = new RegExp(`^(?:${q.pattern})$`, "i");
    } catch {
      re = null;
    }
  }

  const rows: BrowseRow[] = [];
  for (const e of index.entries) {
    if (!tlds.has(e.tld)) continue;
    if (e.status === "taken") continue;
    if (e.status === "likely" && !includeLikely) continue;
    if (e.priceClass === "unavailable") continue;
    if (dictOnly && e.dict !== 1) continue;
    if (e.w.length < minLen || e.w.length > maxLen) continue;
    if (e.z < minZipf || e.z > maxZipf) continue;
    if (q.startsWith && !e.w.startsWith(q.startsWith)) continue;
    if (q.endsWith && !e.w.endsWith(q.endsWith)) continue;
    if (re && !re.test(e.w)) continue;
    const risk = premiumRisk(e);
    if (!premiumOk && (risk === "verified-premium" || risk === "high")) continue;
    const meta = index.tlds[e.tld];
    const cost = firstCost(e, meta?.reg);
    if (q.maxCost !== undefined && Number.isFinite(cost) && cost > q.maxCost) continue;
    rows.push({ ...e, cost, minYears: meta?.minYears ?? 1, renew: meta?.renew, premiumRisk: risk });
  }

  const sort = q.sort ?? "common";
  rows.sort((a, b) => {
    switch (sort) {
      case "rare":
        return a.z - b.z || a.d.localeCompare(b.d);
      case "short":
        return a.w.length - b.w.length || b.z - a.z;
      case "alpha":
        return a.w.localeCompare(b.w) || a.tld.localeCompare(b.tld);
      case "price":
        return (a.cost || 0) - (b.cost || 0) || b.z - a.z;
      default:
        return b.z - a.z || a.d.localeCompare(b.d);
    }
  });

  const offset = q.offset ?? 0;
  const limit = q.limit ?? 100;
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    tlds: index.tlds,
    updatedAt: index.updatedAt,
  };
}

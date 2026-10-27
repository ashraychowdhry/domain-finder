// Shared types for the word scanner: the offline index that scripts/scan-domains.ts
// builds and that /api/browse + the Word scan UI query.

/**
 * available = the registry's RDAP said 404 (unregistered) — authoritative.
 * likely    = DNS says NXDOMAIN but RDAP has not confirmed yet (names registered
 *             without nameservers, e.g. openai.ai, also NXDOMAIN — so this is a
 *             strong-but-not-certain signal; the UI re-verifies live).
 * taken     = delegated in DNS, or RDAP 200.
 */
export type ScanStatus = "available" | "likely" | "taken";

/** Verified at a registrar: standard list price, registry premium, or not purchasable. */
export type PriceClass = "standard" | "premium" | "unavailable";

export type PriceSource = "spaceship" | "namecom" | "porkbun";

export interface ScanEntry {
  /** Full domain, e.g. "solace.ai". */
  d: string;
  /** The word, e.g. "solace". */
  w: string;
  tld: string;
  /** Zipf frequency score (log10 per-billion); higher = more common. */
  z: number;
  /** 1 = ENABLE dictionary word, 0 = frequent non-dictionary token (name/brand). */
  dict: 0 | 1;
  status: ScanStatus;
  /** Where the status came from. */
  src: "rdap" | "dns";
  /** Epoch ms of the last DNS/RDAP check. */
  at: number;
  /** Registrar-verified price class (only when a registrar key was configured). */
  priceClass?: PriceClass;
  /** Registrar-verified first-term registration price in USD (premium or standard). */
  price?: number;
  priceSrc?: PriceSource;
  priceAt?: number;
  /** Soft warnings, e.g. "profanity". */
  flags?: string[];
}

export interface TldScanMeta {
  scannedAt: number;
  /** Candidate words scanned in the last run. */
  words: number;
  /** DNS NXDOMAIN hits in the last run. */
  nx: number;
  /** RDAP-confirmed entries (available or taken) in the index. */
  confirmed: number;
  available: number;
  likely: number;
  /** Porkbun list price per year at scan time (USD). */
  reg?: number;
  renew?: number;
  /** Registry-mandated minimum registration term in years (.ai = 2). */
  minYears: number;
}

export interface ScanIndex {
  v: 1;
  updatedAt: number;
  tlds: Record<string, TldScanMeta>;
  entries: ScanEntry[];
}

export type BrowseSort = "common" | "rare" | "short" | "alpha" | "price";

export interface BrowseQuery {
  tlds: string[];
  minLen?: number;
  maxLen?: number;
  minZipf?: number;
  maxZipf?: number;
  /** Max FIRST-CHECKOUT cost in USD (price × minimum years). */
  maxCost?: number;
  /** Regex on the word (anchored by the caller if desired). */
  pattern?: string;
  startsWith?: string;
  endsWith?: string;
  /** "english" = dictionary words only (default); "any" = also frequent tokens. */
  dict?: "english" | "any";
  /** Include DNS-only "likely" entries (default true). */
  includeLikely?: boolean;
  /** Include entries verified or suspected premium (default false). */
  premiumOk?: boolean;
  sort?: BrowseSort;
  limit?: number;
  offset?: number;
}

/** Heuristic premium risk when no registrar verification exists. */
export type PremiumRisk = "verified-standard" | "verified-premium" | "high" | "low";

export interface BrowseRow extends ScanEntry {
  /** Estimated first-checkout cost in USD (verified price, else list × minYears). */
  cost: number;
  minYears: number;
  /** Porkbun renewal price per year at scan time (renewal-trap warning). */
  renew?: number;
  premiumRisk: PremiumRisk;
}

export interface BrowseResponse {
  rows: BrowseRow[];
  total: number;
  tlds: Record<string, TldScanMeta>;
  updatedAt: number;
}

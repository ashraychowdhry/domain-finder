// Registry RDAP endpoints and the request rate each one tolerates.
//
// Bases come from the IANA RDAP bootstrap (https://data.iana.org/rdap/dns.json)
// plus registries that run RDAP but aren't listed there (io/me/so/co/us…),
// each verified live: 404 = unregistered, 200 = registered. The shared
// rdap.org redirector is deliberately NOT used — it only forwards to these
// same hosts (so shares their quota) and 404s for TLDs it can't route, which
// is indistinguishable from "unregistered".
//
// Rate policies were measured on 2026-10-26 by sustained probes:
//   verisign (com/net)           40 rps for 15s   → all 404, no throttle
//   PIR (org), CentralNic (xyz)  15 rps for 15s   → no throttle
//   registry.co, nic.tv          5 rps            → no throttle
//   nic.so                       2 rps ok; 20-concurrency burst → 503s
//   Google (app/dev/…)           1 rps ok; 3 rps  → 429 after ~15 requests
//   Identity Digital (ai/io/me…) ~300 requests in a few minutes → 429 with
//                                Retry-After 85572s (a 24h per-IP lockout).
// Treat those as ceilings for one IP; the scanner stays well under them.

export const RDAP_BASES: Record<string, string> = {
  // Verisign
  com: "https://rdap.verisign.com/com/v1/domain/",
  net: "https://rdap.verisign.com/net/v1/domain/",
  cc: "https://tld-rdap.verisign.com/cc/v1/domain/",
  tv: "https://rdap.nic.tv/domain/",
  // PIR
  org: "https://rdap.publicinterestregistry.org/rdap/domain/",
  // Identity Digital (strict quota — see policy below)
  io: "https://rdap.identitydigital.services/rdap/domain/",
  ai: "https://rdap.identitydigital.services/rdap/domain/",
  me: "https://rdap.identitydigital.services/rdap/domain/",
  info: "https://rdap.identitydigital.services/rdap/domain/",
  wtf: "https://rdap.identitydigital.services/rdap/domain/",
  run: "https://rdap.identitydigital.services/rdap/domain/",
  life: "https://rdap.identitydigital.services/rdap/domain/",
  world: "https://rdap.identitydigital.services/rdap/domain/",
  zone: "https://rdap.identitydigital.services/rdap/domain/",
  games: "https://rdap.identitydigital.services/rdap/domain/",
  ventures: "https://rdap.identitydigital.services/rdap/domain/",
  systems: "https://rdap.identitydigital.services/rdap/domain/",
  // Google Registry
  app: "https://pubapi.registry.google/rdap/domain/",
  dev: "https://pubapi.registry.google/rdap/domain/",
  new: "https://pubapi.registry.google/rdap/domain/",
  how: "https://pubapi.registry.google/rdap/domain/",
  day: "https://pubapi.registry.google/rdap/domain/",
  page: "https://pubapi.registry.google/rdap/domain/",
  ing: "https://pubapi.registry.google/rdap/domain/",
  mov: "https://pubapi.registry.google/rdap/domain/",
  meme: "https://pubapi.registry.google/rdap/domain/",
  // CentralNic / Team Internet
  xyz: "https://rdap.centralnic.com/xyz/domain/",
  fm: "https://rdap.centralnic.com/fm/domain/",
  lol: "https://rdap.centralnic.com/lol/domain/",
  ooo: "https://rdap.centralnic.com/ooo/domain/",
  icu: "https://rdap.centralnic.com/icu/domain/",
  // Radix
  site: "https://rdap.radix.host/rdap/domain/",
  online: "https://rdap.radix.host/rdap/domain/",
  tech: "https://rdap.radix.host/rdap/domain/",
  store: "https://rdap.radix.host/rdap/domain/",
  fun: "https://rdap.radix.host/rdap/domain/",
  pw: "https://rdap.radix.host/rdap/domain/",
  // Others
  so: "https://rdap.nic.so/domain/",
  co: "https://rdap.registry.co/co/domain/",
  to: "https://rdap.tonicregistry.to/rdap/domain/",
  ly: "https://rdap.nic.ly/domain/",
  bot: "https://rdap.nominet.uk/bot/domain/",
  now: "https://rdap.nominet.uk/now/domain/",
  uk: "https://rdap.nominet.uk/uk/domain/",
  ink: "https://rdap.nic.ink/domain/",
  design: "https://rdap.nic.design/domain/",
  ms: "https://rdap.nic.ms/domain/",
  one: "https://rdap.nic.one/domain/",
  cloud: "https://rdap.registry.cloud/rdap/domain/",
  work: "https://rdap.nic.work/domain/",
  cx: "https://rdap.nic.cx/domain/",
  ca: "https://rdap.ca.fury.ca/rdap/domain/",
  fr: "https://rdap.nic.fr/domain/",
  is: "https://rdap.isnic.is/rdap/domain/",
  in: "https://rdap.nixiregistry.in/rdap/domain/",
  nl: "https://rdap.sidn.nl/domain/",
};

export interface HostPolicy {
  /** Sustained requests per second this scanner will send to the host. */
  rps: number;
  /** Hard cap on requests per scan run (protects daily quotas). */
  maxPerRun: number;
}

const DEFAULT_POLICY: HostPolicy = { rps: 2, maxPerRun: 600 };

const HOST_POLICIES: Record<string, HostPolicy> = {
  "rdap.verisign.com": { rps: 25, maxPerRun: 20_000 },
  "tld-rdap.verisign.com": { rps: 8, maxPerRun: 5_000 },
  "rdap.publicinterestregistry.org": { rps: 5, maxPerRun: 3_000 }, // 429s appeared after ~300 at 10 rps
  "rdap.centralnic.com": { rps: 10, maxPerRun: 8_000 },
  "rdap.radix.host": { rps: 4, maxPerRun: 2_000 },
  "pubapi.registry.google": { rps: 1, maxPerRun: 1_500 },
  // Measured 24h lockout after a few hundred requests: stay tiny and slow.
  "rdap.identitydigital.services": { rps: 0.5, maxPerRun: 120 },
  "rdap.nic.so": { rps: 1.5, maxPerRun: 800 },
  "rdap.registry.co": { rps: 4, maxPerRun: 2_000 },
  "rdap.nic.tv": { rps: 4, maxPerRun: 2_000 },
};

export function rdapBase(tld: string): string | undefined {
  return RDAP_BASES[tld];
}

export function hostPolicy(host: string): HostPolicy {
  return HOST_POLICIES[host] ?? DEFAULT_POLICY;
}

/**
 * Registry-mandated minimum registration term. The first checkout is
 * price × minYears — the number that actually matters for a budget.
 * (.ai: Identity Digital / Government of Anguilla require 2 years.)
 */
export const MIN_YEARS: Record<string, number> = { ai: 2 };

export function minYears(tld: string): number {
  return MIN_YEARS[tld] ?? 1;
}

/**
 * TLDs whose registries sell "premium" names at non-standard prices even
 * though RDAP reports them unregistered. Legacy gTLDs (com/net/org) have no
 * registry premium tier, so an unregistered name there is standard price.
 */
export function registryHasPremiums(tld: string): boolean {
  return !["com", "net", "org"].includes(tld);
}

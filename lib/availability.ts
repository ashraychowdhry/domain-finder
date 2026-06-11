// Real domain availability checking — no API key required.
//
// Strategy (designed around rate limits and TLD coverage):
//   1. DNS-over-HTTPS first for every domain (Google DoH handles volume):
//      NS delegation => registered => TAKEN. This cheaply filters most names,
//      and the NS records themselves reveal parked/for-sale domains.
//   2. Names that look free are confirmed against the registry's own RDAP
//      endpoint (authoritative; per-registry hosts have generous limits,
//      unlike the shared rdap.org redirector at 10 req/10s — which also
//      404s for TLDs it can't route, indistinguishable from "unregistered"):
//      404 => unregistered => AVAILABLE. 200 => registered => TAKEN.
//   3. Results are cached in-memory for 10 minutes (re-checks, refine calls,
//      and the shortlist re-check stay free of duplicate requests).
//
// The registrar at checkout is always the source of truth; this is a
// fast, free signal good enough to filter candidates.

import type { AvailabilityStatus, DomainResult } from "./types";

const DOH_BASE = "https://dns.google/resolve";
const UA = "NameForge/1.0 (domain availability checker)";

// Registry RDAP bases per TLD, verified live (200 for registered,
// 404 for unregistered).
const RDAP_BASES: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/domain/",
  net: "https://rdap.verisign.com/net/v1/domain/",
  io: "https://rdap.identitydigital.services/rdap/domain/",
  ai: "https://rdap.identitydigital.services/rdap/domain/",
  me: "https://rdap.identitydigital.services/rdap/domain/",
  app: "https://pubapi.registry.google/rdap/domain/",
  dev: "https://pubapi.registry.google/rdap/domain/",
  xyz: "https://rdap.centralnic.com/xyz/domain/",
  so: "https://rdap.nic.so/domain/",
  co: "https://rdap.registry.co/co/domain/",
};

// Nameservers used by parking/aftermarket services — a "taken" domain on
// these is parked and very likely listed for sale at a premium.
const PARKING_NS = [
  "sedoparking",
  "bodis",
  "parkingcrew",
  "afternic",
  "dan.com",
  "undeveloped",
  "uniregistry",
  "namebrightdns",
  "hugedomains",
  "above.com",
  "parklogic",
  "smartname",
  "domaincontrol-parking",
  "sav.com",
  "squadhelp",
  "atom.com",
  "brandbucket",
  "efty",
];

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkRdap(
  base: string,
  domain: string,
): Promise<AvailabilityStatus> {
  const attempt = async (): Promise<number> => {
    const res = await fetchWithTimeout(base + domain, {
      headers: { Accept: "application/rdap+json", "User-Agent": UA },
      redirect: "follow",
    });
    return res.status;
  };
  try {
    let status = await attempt();
    if (status === 429 || status >= 500) {
      // One polite retry — registries occasionally throttle bursts.
      await new Promise((r) => setTimeout(r, 700));
      status = await attempt();
    }
    if (status === 404) return "available";
    if (status === 200) return "taken";
    return "unknown";
  } catch {
    return "unknown";
  }
}

interface DnsResult {
  status: AvailabilityStatus;
  ns: string[];
}

async function checkDns(domain: string): Promise<DnsResult> {
  try {
    const res = await fetchWithTimeout(
      `${DOH_BASE}?name=${encodeURIComponent(domain)}&type=NS`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!res.ok) return { status: "unknown", ns: [] };
    const data = (await res.json()) as {
      Status: number;
      Answer?: { type: number; data: string }[];
    };
    const ns = (data.Answer ?? [])
      .filter((a) => a.type === 2)
      .map((a) => a.data.toLowerCase());
    // Status 3 = NXDOMAIN = not in the TLD zone => probably available
    // (registered-but-on-hold and registry-reserved names also NXDOMAIN,
    // which is why available-looking names get RDAP confirmation).
    if (data.Status === 3) return { status: "available", ns };
    // Has NS delegation => registered.
    if (ns.length > 0) return { status: "taken", ns };
    // NOERROR but no NS at this exact name — exists in the zone => taken.
    if (data.Status === 0) return { status: "taken", ns };
    return { status: "unknown", ns };
  } catch {
    return { status: "unknown", ns: [] };
  }
}

function isParkedNs(ns: string[]): boolean {
  return ns.some((n) => PARKING_NS.some((p) => n.includes(p)));
}

// In-memory result cache (warm Fluid Compute instances share it).
const cache = new Map<string, { at: number; result: DomainResult }>();
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 4000;

/** Check a single fully-qualified domain. */
export async function checkDomain(domain: string): Promise<DomainResult> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  const tld = domain.slice(domain.lastIndexOf(".") + 1);

  // Cheap first pass: NS delegation means registered, full stop.
  const dns = await checkDns(domain);
  let result: DomainResult;

  if (dns.status === "taken") {
    result = {
      domain,
      tld,
      status: "taken",
      source: "dns",
      ...(isParkedNs(dns.ns) ? { parked: true } : {}),
    };
  } else {
    // Looks free (or DNS failed) — confirm with the registry where possible.
    const base = RDAP_BASES[tld];
    const rdap = base ? await checkRdap(base, domain) : "unknown";
    result =
      rdap !== "unknown"
        ? { domain, tld, status: rdap, source: "rdap" }
        : {
            domain,
            tld,
            status: dns.status,
            source: dns.status === "unknown" ? "error" : "dns",
          };
  }

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(domain, { at: Date.now(), result });
  return result;
}

/** Check many domains concurrently (bounded). */
export async function checkDomains(domains: string[]): Promise<DomainResult[]> {
  const CONCURRENCY = 10;
  const out: DomainResult[] = [];
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    out.push(...(await Promise.all(batch.map(checkDomain))));
  }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "");

/** Build "name.tld" from a base name and a TLD. */
export function toDomain(name: string, tld: string): string {
  return `${slug(name)}.${tld.replace(/^\./, "").toLowerCase()}`;
}

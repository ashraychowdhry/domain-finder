// Stage 1, fast path: ask the TLD's own authoritative nameservers.
//
// A recursive resolver answering "NS for word.com" must contact word.com's
// nameservers — slow for registered names and SERVFAIL for lame ones. The
// TLD servers answer from the zone itself with no recursion: NXDOMAIN (not
// in the zone) or a referral (delegated). Measured: a.gtld-servers.net took
// 1,000 queries in 180 ms; .ai/.io servers rate-limit UDP bursts (29 %
// timeouts at 100 concurrent), so concurrency is per TLD and timeouts fall
// back to DoH (lib/scan/dns.ts). Node-only (node:dns) — scripts, not routes.

import { Resolver, resolveNs, resolve4 } from "node:dns/promises";
import { dnsLookup, type DnsSignal } from "./dns";

const CONCURRENCY: Record<string, number> = { com: 100, net: 100, app: 50, dev: 50, org: 40 };
const DEFAULT_CONCURRENCY = 12;

/** IPv4 addresses of up to four of the TLD's authoritative servers. */
export async function tldServers(tld: string): Promise<string[]> {
  try {
    const names = (await resolveNs(tld)).slice(0, 4);
    const ips = await Promise.all(
      names.map((n) => resolve4(n).then((a) => a[0]).catch(() => null)),
    );
    return ips.filter((ip): ip is string => Boolean(ip));
  } catch {
    return [];
  }
}

function classify(code: string | undefined): DnsSignal | null {
  switch (code) {
    case "ENOTFOUND":
      return { status: "nx", ns: [] }; // NXDOMAIN: not in the zone
    case "ENODATA":
      return { status: "exists", ns: [] }; // referral: delegated
    default:
      return null; // ETIMEOUT / ESERVFAIL / EREFUSED → retry or fall back
  }
}

/**
 * Bulk authoritative lookup for one TLD. Results align with `domains`.
 * Falls back to DoH per name when the TLD servers won't answer.
 */
export async function authBatch(
  tld: string,
  domains: string[],
  opts: { servers?: string[]; concurrency?: number; onProgress?: (done: number) => void } = {},
): Promise<DnsSignal[]> {
  const servers = opts.servers ?? (await tldServers(tld));
  if (!servers.length) {
    // No authoritative path — plain DoH for everything.
    const out: DnsSignal[] = [];
    for (const d of domains) out.push(await dnsLookup(d));
    return out;
  }
  const resolvers = servers.map((ip) => {
    const r = new Resolver({ timeout: 2500, tries: 1 });
    r.setServers([ip]);
    return r;
  });
  const concurrency = opts.concurrency ?? CONCURRENCY[tld] ?? DEFAULT_CONCURRENCY;
  const out: DnsSignal[] = new Array(domains.length);
  let next = 0;
  let done = 0;
  let fallbacks = 0;

  const one = async (domain: string, i: number): Promise<DnsSignal> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = resolvers[(i + attempt) % resolvers.length];
      try {
        const ns = await r.resolveNs(domain);
        return { status: "exists", ns: ns.map((n) => n.toLowerCase()) };
      } catch (e) {
        const sig = classify((e as NodeJS.ErrnoException).code);
        if (sig) return sig;
        await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
      }
    }
    fallbacks++;
    return dnsLookup(domain);
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, domains.length) }, async () => {
      while (next < domains.length) {
        const i = next++;
        out[i] = await one(domains[i], i);
        done++;
        if (opts.onProgress && done % 1000 === 0) opts.onProgress(done);
      }
    }),
  );
  if (fallbacks) console.error(`  (${fallbacks} names fell back to DoH after authoritative timeouts)`);
  return out;
}

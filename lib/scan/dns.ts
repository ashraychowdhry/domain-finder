// Stage 1 of the scan: DNS-over-HTTPS in bulk.
//
// Measured 2026-10-26: Cloudflare answered 2,000 NS lookups in 0.7s at 100
// concurrency with zero errors; Google 2,000 in 1.4s. Neither throttled.
// NXDOMAIN at the TLD means "not delegated" — nearly always unregistered,
// but names registered without nameservers (openai.ai) and registry-reserved
// names also NXDOMAIN, so stage 2 (RDAP) confirms the survivors.

export type DnsStatus = "nx" | "exists" | "unknown";

export interface DnsSignal {
  status: DnsStatus;
  ns: string[];
}

const PROVIDERS = [
  "https://cloudflare-dns.com/dns-query?type=NS&name=",
  "https://dns.google/resolve?type=NS&name=",
];

async function queryOnce(url: string): Promise<DnsSignal | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Status: number;
      Answer?: { type: number; data: string }[];
    };
    const ns = (data.Answer ?? [])
      .filter((a) => a.type === 2)
      .map((a) => a.data.toLowerCase());
    if (data.Status === 3) return { status: "nx", ns };
    if (data.Status === 0) return { status: "exists", ns };
    // SERVFAIL = the TLD delegated it but its nameservers are broken — the
    // name is registered (a lame delegation), which is all the scan needs.
    if (data.Status === 2) return { status: "exists", ns };
    return null; // REFUSED / other → retry on the other provider
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One domain: Cloudflare first, Google as fallback, three attempts total. */
export async function dnsLookup(domain: string): Promise<DnsSignal> {
  const name = encodeURIComponent(domain);
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = PROVIDERS[attempt % PROVIDERS.length];
    const r = await queryOnce(base + name);
    if (r) return r;
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }
  return { status: "unknown", ns: [] };
}

/**
 * Bulk lookup with a bounded worker pool. Order of results matches input.
 * `onProgress` fires every ~250 completions (for CLI progress lines).
 */
export async function dnsBatch(
  domains: string[],
  opts: { concurrency?: number; onProgress?: (done: number) => void } = {},
): Promise<DnsSignal[]> {
  const concurrency = opts.concurrency ?? 80;
  const out: DnsSignal[] = new Array(domains.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, domains.length) }, async () => {
      while (next < domains.length) {
        const i = next++;
        out[i] = await dnsLookup(domains[i]);
        done++;
        if (opts.onProgress && done % 250 === 0) opts.onProgress(done);
      }
    }),
  );
  return out;
}

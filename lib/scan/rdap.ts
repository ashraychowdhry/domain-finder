// Stage 2 of the scan: confirm DNS-NXDOMAIN survivors against each
// registry's own RDAP endpoint, at a rate the registry tolerates.
//
// Every host gets its own pacing (lib/scan/registries.ts) and a per-run cap.
// A 429 with a long Retry-After (Identity Digital answers 85,572s — a 24h
// per-IP lockout) marks the host blocked for the rest of the run so we never
// dig the hole deeper; those names stay "likely" and get re-verified live in
// the UI from a different IP (Vercel).

import { hostPolicy, rdapBase } from "./registries";

export type RdapVerdict = "available" | "taken" | "unknown" | "blocked";

const UA = "Vocari/1.0 (domain availability checker; vocari.dev)";

interface HostState {
  nextAt: number;
  sent: number;
  blocked: boolean;
  consecutive429: number;
}

export class RdapClient {
  private hosts = new Map<string, HostState>();
  /** Optional cap applied on top of each host's policy (CLI --rdap-budget). */
  constructor(private budgetPerHost = Infinity) {}

  private state(host: string): HostState {
    let s = this.hosts.get(host);
    if (!s) {
      s = { nextAt: 0, sent: 0, blocked: false, consecutive429: 0 };
      this.hosts.set(host, s);
    }
    return s;
  }

  /** True when the host can still take requests this run. */
  canCheck(tld: string): boolean {
    const base = rdapBase(tld);
    if (!base) return false;
    const host = new URL(base).host;
    const s = this.state(host);
    const cap = Math.min(hostPolicy(host).maxPerRun, this.budgetPerHost);
    return !s.blocked && s.sent < cap;
  }

  /** Per-host stats for the run summary. */
  stats(): Record<string, { sent: number; blocked: boolean }> {
    const out: Record<string, { sent: number; blocked: boolean }> = {};
    for (const [h, s] of this.hosts) out[h] = { sent: s.sent, blocked: s.blocked };
    return out;
  }

  async check(domain: string): Promise<RdapVerdict> {
    const tld = domain.slice(domain.lastIndexOf(".") + 1);
    const base = rdapBase(tld);
    if (!base) return "unknown";
    const host = new URL(base).host;
    const s = this.state(host);
    const policy = hostPolicy(host);
    const cap = Math.min(policy.maxPerRun, this.budgetPerHost);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (s.blocked || s.sent >= cap) return "blocked";
      // Pace: reserve the next slot for this host, then wait for it.
      const now = Date.now();
      const slot = Math.max(now, s.nextAt);
      s.nextAt = slot + 1000 / policy.rps;
      if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
      s.sent++;

      let status: number;
      let retryAfter = 0;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(base + domain, {
          headers: { Accept: "application/rdap+json", "User-Agent": UA },
          redirect: "follow",
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        status = res.status;
        retryAfter = Number(res.headers.get("retry-after") ?? 0) || 0;
      } catch {
        status = 0;
      }

      if (status === 404) {
        s.consecutive429 = 0;
        return "available";
      }
      if (status === 200) {
        s.consecutive429 = 0;
        return "taken";
      }
      if (status === 429) {
        s.consecutive429++;
        // A long Retry-After or repeated 429s = quota exhausted for this IP.
        if (retryAfter > 120 || s.consecutive429 >= 3) {
          s.blocked = true;
          return "blocked";
        }
        await new Promise((r) => setTimeout(r, Math.max(2000, retryAfter * 1000)));
        continue;
      }
      if (status >= 500 || status === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return "unknown";
    }
    return "unknown";
  }
}

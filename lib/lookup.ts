// Shared plumbing for the free, keyless lookup services (iTunes, npm, PyPI,
// Wikipedia, DuckDuckGo). Three jobs:
//
//   1. Cache successful answers in memory so repeat names (re-checks, the
//      analyze panel after a generate run, popular names across users) don't
//      spend the services' small rate budgets again. Warm Fluid Compute
//      instances share the cache; cold starts begin empty.
//   2. Throttle each source per instance (token bucket) and back off after
//      it rate-limits us, failing fast instead of waiting out a timeout.
//   3. Report failure as `null` — never as an empty result — so callers can
//      tell "no collisions found" apart from "couldn't check".
//
// Failures are never cached: the next request retries once the source's
// cooldown has passed.

export type Source =
  | "appstore"
  | "npm"
  | "pypi"
  | "wikipedia"
  | "ddg-answers"
  | "ddg-web";

/** Human-readable source names, for prompts and the UI. */
export const SOURCE_LABELS: Record<Source, string> = {
  appstore: "App Store",
  npm: "npm",
  pypi: "PyPI",
  wikipedia: "Wikipedia",
  "ddg-answers": "DuckDuckGo meanings",
  "ddg-web": "web search",
};

interface SourcePolicy {
  /** Requests allowed per minute from one instance (token bucket). */
  perMinute: number;
  /** How long to stop calling after the source rate-limits or challenges us. */
  cooldownMs: number;
}

// iTunes documents ~20 calls/minute; the others are more generous but still
// shared, unauthenticated endpoints, so stay polite.
const POLICIES: Record<Source, SourcePolicy> = {
  appstore: { perMinute: 20, cooldownMs: 60_000 },
  npm: { perMinute: 120, cooldownMs: 30_000 },
  pypi: { perMinute: 120, cooldownMs: 30_000 },
  wikipedia: { perMinute: 60, cooldownMs: 30_000 },
  "ddg-answers": { perMinute: 60, cooldownMs: 60_000 },
  "ddg-web": { perMinute: 20, cooldownMs: 120_000 },
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

/** Thrown by fetchers when the source answered but refused or broke. */
export class LookupError extends Error {
  constructor(
    readonly status: number,
    message = `HTTP ${status}`,
  ) {
    super(message);
  }
}

/** Status codes that mean "you're being throttled or bot-challenged". */
const THROTTLED = new Set([202, 403, 429, 503]);

const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const buckets = new Map<Source, { tokens: number; at: number }>();
const cooldownUntil = new Map<Source, number>();

function takeToken(source: Source): boolean {
  const { perMinute } = POLICIES[source];
  const now = Date.now();
  const b = buckets.get(source) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  buckets.set(source, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function warn(source: Source, key: string, reason: string) {
  console.warn(JSON.stringify({ t: "lookup_failed", source, key, reason }));
}

/**
 * Run `fetcher` for (source, key) through the cache, throttle and cooldown.
 * Resolves to the value, or null when the source couldn't be checked.
 * Never throws.
 */
export async function lookup<T>(
  source: Source,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  const id = `${source}:${key.toLowerCase()}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  const pending = inflight.get(id);
  if (pending) return pending as Promise<T | null>;

  if ((cooldownUntil.get(source) ?? 0) > Date.now()) return null;
  if (!takeToken(source)) {
    warn(source, key, "local throttle");
    return null;
  }

  const run = (async () => {
    try {
      const value = await fetcher();
      if (cache.size >= CACHE_MAX) cache.clear();
      cache.set(id, { at: Date.now(), value });
      return value;
    } catch (err) {
      if (err instanceof LookupError && THROTTLED.has(err.status)) {
        cooldownUntil.set(source, Date.now() + POLICIES[source].cooldownMs);
        warn(source, key, `throttled (${err.status}); cooling down`);
      } else {
        warn(source, key, err instanceof Error ? err.message : String(err));
      }
      return null;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, run);
  return run;
}

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 6000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook: forget all cached answers, throttle state and cooldowns. */
export function resetLookupState() {
  cache.clear();
  inflight.clear();
  buckets.clear();
  cooldownUntil.clear();
}

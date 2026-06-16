// Per-IP rate limiting for the paid model routes — abuse protection so a
// single spammer can't drain the AI Gateway credits.
//
// This is in-memory: on Vercel Fluid Compute, function instances are reused
// across requests, so a burst from one IP hitting a warm instance is throttled.
// It is DEFENSE IN DEPTH, layered with (1) BotID, which blocks scripted/bot
// traffic outright, (2) the Vercel WAF rate-limit rule at the edge, and
// (3) the prepaid gateway balance, which is a hard spend ceiling. It is
// per-IP, so 100 legitimate users on different IPs are never affected — only
// one IP firing far more requests than any human would.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

/** Best-effort client IP from Vercel's forwarding headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** True if allowed; false once `key` has hit `max` requests within `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) {
      const live = v.filter((t) => now - t < windowMs);
      if (live.length === 0) buckets.delete(k);
      else buckets.set(k, live);
    }
  }
  return true;
}

const TEN_MIN = 10 * 60 * 1000;

/**
 * Guard a spend route. Generous enough that no real user is ever blocked
 * (a heavy session is a handful of runs), tight enough to stop spam.
 * Returns a 429 Response when over the limit, or null to proceed.
 */
export function spendGuard(
  req: Request,
  prefix: string,
  max: number,
): Response | null {
  if (rateLimit(`${prefix}:${clientIp(req)}`, max, TEN_MIN)) return null;
  return Response.json(
    { error: "Too many requests — please wait a couple of minutes and try again." },
    { status: 429 },
  );
}

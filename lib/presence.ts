// "Can I own this name everywhere?" — social/developer handles plus a US
// trademark screen, the two checks users praise most in rival naming tools.
//
// Handles are checked against keyless public endpoints (a 404 means the
// handle is unclaimed). Networks with no public lookup (X, Instagram, TikTok,
// LinkedIn…) get a direct link instead of a guess. Everything fails soft to
// "unknown", so a rate-limited or blocked lookup never reads as "free".
//
// Trademark: USPTO live marks via Marker API (markerapi.com) when
// MARKER_API_USERNAME + MARKER_API_PASSWORD are set; otherwise we return the
// official search links only. Optional GITHUB_TOKEN lifts GitHub's 60/hour
// unauthenticated limit. None of this is legal clearance.

export type HandleStatus = "free" | "taken" | "unknown" | "invalid";

export interface HandleResult {
  id: string;
  label: string;
  handle: string;
  status: HandleStatus;
  /** Profile / claim page, so the user can verify or grab it. */
  url: string;
}

export interface ManualLink {
  label: string;
  url: string;
}

export interface TrademarkHit {
  mark: string;
  serial: string;
  /** Goods & services description (truncated). */
  description: string;
  /** International class code(s), e.g. "009". */
  classCode: string;
  /** Wordmark matches the name exactly (after normalizing case/spacing). */
  exact: boolean;
  url: string;
}

export interface TrademarkResult {
  /** "marker" = live USPTO marks were searched; "links" = no key configured. */
  source: "marker" | "links";
  /** False when a configured lookup failed — treat as unknown, not clear. */
  ok: boolean;
  /** Live (registered or pending) USPTO marks for the name. */
  hits: TrademarkHit[];
  /** Official registers to verify in, always present. */
  links: ManualLink[];
}

export interface PresenceResponse {
  name: string;
  handles: HandleResult[];
  manual: ManualLink[];
  trademark: TrademarkResult;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const UA = "Vocari/1.0 (+https://vocari.dev; name availability research)";

function withTimeout(fetcher: Fetcher, ms = 5000): Fetcher {
  return async (url, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetcher(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Lowercase a-z0-9 and hyphens — the handle every checker starts from. */
export function normalizeHandle(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** Map a lookup's HTTP status to a handle status (404 = unclaimed). */
export function statusFromHttp(code: number): HandleStatus {
  if (code === 200) return "taken";
  if (code === 404) return "free";
  return "unknown";
}

interface HandleCheck {
  id: string;
  label: string;
  /** Per-platform username rules; failing them = "invalid" (can't be claimed). */
  valid: (h: string) => boolean;
  url: (h: string) => string;
  check: (h: string, f: Fetcher) => Promise<HandleStatus>;
}

const probe = async (f: Fetcher, url: string, headers: Record<string, string> = {}) => {
  const res = await f(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
  return res;
};

export const HANDLE_CHECKS: HandleCheck[] = [
  {
    id: "github",
    label: "GitHub",
    valid: (h) => /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(h),
    url: (h) => `https://github.com/${h}`,
    check: async (h, f) => {
      const token = process.env.GITHUB_TOKEN;
      const res = await probe(
        f,
        `https://api.github.com/users/${h}`,
        token ? { Authorization: `Bearer ${token}` } : {},
      );
      return statusFromHttp(res.status); // 403/429 (rate limit) → unknown
    },
  },
  {
    id: "npm",
    label: "npm scope",
    valid: (h) => /^[a-z0-9][a-z0-9-]{0,213}$/.test(h),
    url: (h) => `https://www.npmjs.com/~${h}`,
    // Users and orgs share one namespace; both answer here, 404 when unclaimed.
    check: async (h, f) =>
      statusFromHttp((await probe(f, `https://registry.npmjs.org/-/org/${h}/package`)).status),
  },
  {
    id: "docker",
    label: "Docker Hub",
    // Docker Hub namespaces: 4-30 lowercase letters/digits, no hyphens.
    valid: (h) => /^[a-z0-9]{4,30}$/.test(h),
    url: (h) => `https://hub.docker.com/u/${h}`,
    // /v2/users/ resolves orgs too; the trailing slash avoids a 308.
    check: async (h, f) =>
      statusFromHttp((await probe(f, `https://hub.docker.com/v2/users/${h}/`)).status),
  },
  {
    id: "gitlab",
    label: "GitLab",
    valid: (h) => /^[a-z0-9](?:[a-z0-9-]{0,253}[a-z0-9])?$/.test(h),
    url: (h) => `https://gitlab.com/${h}`,
    // Users and groups share the namespace: taken if either exists.
    check: async (h, f) => {
      const [users, group] = await Promise.all([
        probe(f, `https://gitlab.com/api/v4/users?username=${h}`),
        probe(f, `https://gitlab.com/api/v4/groups/${h}`),
      ]);
      if (group.status === 200) return "taken";
      if (!users.ok || (group.status !== 404 && group.status !== 401)) return "unknown";
      const list = (await users.json().catch(() => null)) as unknown[] | null;
      if (!Array.isArray(list)) return "unknown";
      return list.length ? "taken" : "free";
    },
  },
  {
    id: "bluesky",
    label: "Bluesky",
    valid: (h) => /^[a-z0-9](?:[a-z0-9-]{1,16}[a-z0-9])$/.test(h),
    url: (h) => `https://bsky.app/profile/${h}.bsky.social`,
    // resolveHandle answers 200 + a DID when taken, 400 "Unable to resolve" when free.
    check: async (h, f) => {
      const res = await probe(
        f,
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${h}.bsky.social`,
      );
      if (res.status === 200) return "taken";
      if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        return /unable to resolve/i.test(body?.message ?? "") ? "free" : "unknown";
      }
      return "unknown";
    },
  },
  {
    id: "hn",
    label: "Hacker News",
    valid: (h) => /^[a-z0-9_-]{2,15}$/.test(h),
    url: (h) => `https://news.ycombinator.com/user?id=${h}`,
    // Firebase returns the literal JSON `null` for an unknown user.
    check: async (h, f) => {
      const res = await probe(f, `https://hacker-news.firebaseio.com/v0/user/${h}.json`);
      if (!res.ok) return "unknown";
      const body = await res.json().catch(() => undefined);
      if (body === undefined) return "unknown";
      return body === null ? "free" : "taken";
    },
  },
  {
    id: "crates",
    label: "crates.io",
    valid: (h) => /^[a-z][a-z0-9_-]{0,63}$/.test(h),
    url: (h) => `https://crates.io/crates/${h}`,
    // crates.io requires a descriptive User-Agent (probe sends one).
    check: async (h, f) =>
      statusFromHttp((await probe(f, `https://crates.io/api/v1/crates/${h}`)).status),
  },
];

/** Networks with no public lookup: link straight to the handle to eyeball it. */
export function manualLinks(h: string): ManualLink[] {
  return [
    { label: "X", url: `https://x.com/${h}` },
    { label: "Instagram", url: `https://www.instagram.com/${h}/` },
    { label: "TikTok", url: `https://www.tiktok.com/@${h}` },
    { label: "YouTube", url: `https://www.youtube.com/@${h}` },
    { label: "LinkedIn", url: `https://www.linkedin.com/company/${h}` },
    { label: "Reddit", url: `https://www.reddit.com/r/${h}` },
  ];
}

export async function checkHandles(
  name: string,
  fetcher: Fetcher = fetch,
): Promise<HandleResult[]> {
  const h = normalizeHandle(name);
  const f = withTimeout(fetcher);
  return Promise.all(
    HANDLE_CHECKS.map(async (c): Promise<HandleResult> => {
      const base = { id: c.id, label: c.label, handle: h, url: c.url(h) };
      if (!c.valid(h)) return { ...base, status: "invalid" };
      try {
        return { ...base, status: await c.check(h, f) };
      } catch {
        return { ...base, status: "unknown" };
      }
    }),
  );
}

// ── Trademark ───────────────────────────────────────────────────────────

export function trademarkLinks(name: string): ManualLink[] {
  const q = encodeURIComponent(name);
  return [
    { label: "USPTO", url: `https://tmsearch.uspto.gov/search/search-results/${q}` },
    {
      label: "EU / TMview",
      url: `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${q}`,
    },
    { label: "WIPO", url: "https://branddb.wipo.int/" },
  ];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface MarkerRecord {
  serialnumber?: string | number;
  wordmark?: string;
  description?: string;
  code?: string | number;
}

/** Turn a Marker API v2 response into hits, exact matches first. */
export function parseMarker(name: string, body: unknown): TrademarkHit[] {
  const list = (body as { trademarks?: MarkerRecord[] } | null)?.trademarks;
  if (!Array.isArray(list)) return [];
  const target = squash(name);
  return list
    .filter((r) => r?.wordmark && r?.serialnumber)
    .map((r) => {
      const serial = String(r.serialnumber);
      return {
        mark: String(r.wordmark),
        serial,
        description: String(r.description ?? "").slice(0, 180),
        classCode: String(r.code ?? ""),
        exact: squash(String(r.wordmark)) === target,
        url: `https://tsdr.uspto.gov/#caseNumber=${serial}&caseType=SERIAL_NO&searchType=statusSearch`,
      };
    })
    .sort((a, b) => Number(b.exact) - Number(a.exact))
    .slice(0, 8);
}

export async function checkTrademark(
  name: string,
  fetcher: Fetcher = fetch,
): Promise<TrademarkResult> {
  const links = trademarkLinks(name);
  const user = process.env.MARKER_API_USERNAME;
  const pass = process.env.MARKER_API_PASSWORD;
  if (!user || !pass) return { source: "links", ok: true, hits: [], links };

  try {
    const url =
      `https://markerapi.com/api/v2/trademarks/trademark/${encodeURIComponent(name)}` +
      `/status/active/start/1/username/${encodeURIComponent(user)}/password/${encodeURIComponent(pass)}`;
    const res = await withTimeout(fetcher, 7000)(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) return { source: "marker", ok: false, hits: [], links };
    const body = await res.json();
    return { source: "marker", ok: true, hits: parseMarker(name, body), links };
  } catch {
    return { source: "marker", ok: false, hits: [], links };
  }
}

// ── Combined, with a small cache ────────────────────────────────────────
// Handles change slowly and GitHub's keyless quota is tiny, so an hour of
// per-instance memory saves repeat lookups when a name is re-opened.

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map<string, { at: number; value: PresenceResponse }>();

export async function checkPresence(
  name: string,
  fetcher: Fetcher = fetch,
): Promise<PresenceResponse> {
  const h = normalizeHandle(name);
  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  const [handles, trademark] = await Promise.all([
    checkHandles(h, fetcher),
    checkTrademark(h, fetcher),
  ]);
  const value: PresenceResponse = { name: h, handles, manual: manualLinks(h), trademark };

  // Don't pin a result that's mostly unknown (likely a transient block).
  const unknown = handles.filter((r) => r.status === "unknown").length;
  if (unknown <= 2 && trademark.ok) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(h, { at: Date.now(), value });
  }
  return value;
}

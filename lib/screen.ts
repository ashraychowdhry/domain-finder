// Generate-time collision screening for a batch of candidate names — all
// keyless and free: iTunes App Store, npm, PyPI, one batched Wikipedia
// lookup, and DuckDuckGo Instant Answers. Every source fails soft.

export interface NameSignals {
  name: string;
  /** Top App Store hits (strongest "you will be buried" signal for apps). */
  appStore: { name: string; seller: string }[];
  /** Exact npm package exists. */
  npm: boolean;
  /** Exact PyPI package exists. */
  pypi: boolean;
  /** Exact-title Wikipedia article exists (notability signal). */
  wikipedia: boolean;
  /** Known meanings/entities (DuckDuckGo Instant Answers). */
  meanings: string[];
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function appStoreHits(
  name: string,
): Promise<{ name: string; seller: string }[]> {
  try {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?media=software&limit=5&term=${encodeURIComponent(name)}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { trackName?: string; sellerName?: string }[];
    };
    return (data.results ?? [])
      .filter((r) => r.trackName)
      .slice(0, 3)
      .map((r) => ({ name: r.trackName!, seller: r.sellerName ?? "" }));
  } catch {
    return [];
  }
}

/** npm: use /latest, NOT the bare packument (react's packument is ~6.7MB). */
async function npmExists(name: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

async function pypiExists(name: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

/** DDG IA sometimes 202s or returns an empty 200 body — parse inside try. */
async function ddgMeanings(name: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_html=1`,
    );
    const data = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      RelatedTopics?: { Text?: string }[];
    };
    const out: string[] = [];
    if (data.AbstractText)
      out.push(`${data.Heading}: ${data.AbstractText.slice(0, 120)}`);
    for (const t of data.RelatedTopics ?? []) {
      if (t?.Text) out.push(t.Text.slice(0, 120));
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** ONE batched call for every name (up to 50 titles per request). */
async function wikipediaExact(names: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  try {
    const titles = names
      .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
      .join("|");
    const res = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(titles)}`,
      {
        headers: {
          "User-Agent": "Vocari/1.0 (domain name research tool)",
        },
      },
    );
    if (!res.ok) return found;
    const data = (await res.json()) as {
      query?: {
        normalized?: { from: string; to: string }[];
        pages?: Record<string, { pageid?: number; title?: string }>;
      };
    };
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (page.pageid && page.title) found.add(page.title.toLowerCase());
    }
  } catch {
    // fail soft
  }
  return found;
}

/** Screen a batch of names against every keyless source in parallel. */
export async function screenNames(
  names: string[],
): Promise<Map<string, NameSignals>> {
  const wikiPromise = wikipediaExact(names);
  const perName = await Promise.all(
    names.map(async (name) => {
      const [appStore, npm, pypi, meanings] = await Promise.all([
        appStoreHits(name),
        npmExists(name),
        pypiExists(name),
        ddgMeanings(name),
      ]);
      return { name, appStore, npm, pypi, meanings };
    }),
  );
  const wiki = await wikiPromise;

  const out = new Map<string, NameSignals>();
  for (const s of perName) {
    out.set(s.name, { ...s, wikipedia: wiki.has(s.name.toLowerCase()) });
  }
  return out;
}

/** Compact one-line evidence summary for the judge prompt. */
export function signalSummary(s: NameSignals | undefined): string {
  if (!s) return "no signals";
  const parts: string[] = [];
  if (s.appStore.length)
    parts.push(
      `App Store: ${s.appStore.map((a) => `"${a.name}" by ${a.seller}`).join("; ")}`,
    );
  if (s.npm) parts.push("npm pkg");
  if (s.pypi) parts.push("PyPI pkg");
  if (s.wikipedia) parts.push("Wikipedia article");
  if (s.meanings.length) parts.push(`known as: ${s.meanings.join(" | ")}`);
  // "clean" carries the same verdict-relevant information as a sentence.
  return parts.length ? parts.join(" · ") : "clean";
}

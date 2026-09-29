// The keyless lookup services, shared by generate-time screening
// (lib/screen.ts) and the per-name deep analysis (lib/collisions.ts). Each
// fetcher resolves to its answer, or null when the source couldn't be
// checked (see lib/lookup.ts) — callers must not read null as "no hits".

import { fetchWithTimeout, lookup, LookupError } from "./lookup";
import type { SearchHit } from "./search";
import type { AppHit } from "./types";

const WIKI_UA = "Vocari/1.0 (domain name research tool)";

async function okJson<T>(res: Response): Promise<T> {
  if (res.status !== 200) throw new LookupError(res.status);
  return (await res.json()) as T;
}

/** iTunes Search API: top App Store hits for the name. */
export function appStoreHits(name: string): Promise<AppHit[] | null> {
  return lookup("appstore", name, async () => {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?media=software&limit=6&term=${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await okJson<{
      results?: { trackName?: string; sellerName?: string; trackViewUrl?: string }[];
    }>(res);
    return (data.results ?? [])
      .filter((r) => r.trackName)
      .map((r) => ({
        name: r.trackName!,
        seller: r.sellerName ?? "",
        url: r.trackViewUrl ?? "",
      }));
  });
}

/** 200 → exists, 404 → free, anything else → couldn't check. */
async function exists(url: string): Promise<boolean> {
  const res = await fetchWithTimeout(url);
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new LookupError(res.status);
}

/** npm: use /latest, NOT the bare packument (react's packument is ~6.7MB). */
export function npmExists(name: string): Promise<boolean | null> {
  return lookup("npm", name, () =>
    exists(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`),
  );
}

export function pypiExists(name: string): Promise<boolean | null> {
  return lookup("pypi", name, () =>
    exists(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`),
  );
}

/**
 * DuckDuckGo Instant Answers (keyless): known meanings/entities for a term,
 * e.g. "Notion (productivity software)". DDG sometimes answers 202 or an
 * empty 200 body; both count as unchecked.
 */
export function ddgMeanings(name: string): Promise<string[] | null> {
  return lookup("ddg-answers", name, async () => {
    const res = await fetchWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_html=1`,
      { headers: { Accept: "application/json" } },
    );
    const data = await okJson<{
      Heading?: string;
      AbstractText?: string;
      RelatedTopics?: { Text?: string }[];
    }>(res);
    const out: string[] = [];
    if (data.AbstractText) {
      out.push(`${data.Heading}: ${data.AbstractText.slice(0, 160)}`);
    }
    for (const t of data.RelatedTopics ?? []) {
      if (t?.Text) out.push(t.Text.slice(0, 160));
      if (out.length >= 6) break;
    }
    return out;
  });
}

/** Wikipedia opensearch: article titles matching the name. */
export function wikipediaTitles(name: string): Promise<string[] | null> {
  return lookup("wikipedia", `search:${name}`, async () => {
    const res = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&search=${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json", "User-Agent": WIKI_UA } },
    );
    const data = await okJson<[string, string[], string[], string[]]>(res);
    return Array.isArray(data?.[1]) ? data[1] : [];
  });
}

/**
 * Which names have an exact-title Wikipedia article. ONE batched request
 * (up to 50 titles), cached as a batch. Returns null when unchecked.
 */
export function wikipediaExact(names: string[]): Promise<Set<string> | null> {
  const titles = names.map((n) => n.charAt(0).toUpperCase() + n.slice(1));
  return lookup("wikipedia", `exact:${[...titles].sort().join("|")}`, async () => {
    const res = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(titles.join("|"))}`,
      { headers: { "User-Agent": WIKI_UA } },
    );
    const data = await okJson<{
      query?: { pages?: Record<string, { pageid?: number; title?: string }> };
    }>(res);
    const found = new Set<string>();
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (page.pageid && page.title) found.add(page.title.toLowerCase());
    }
    return found;
  });
}

const decodeEntities = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

/** DDG result links are redirects: //duckduckgo.com/l/?uddg=<encoded-url>. */
function decodeDdgLink(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (!m) return href;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return href;
  }
}

/**
 * DuckDuckGo's HTML endpoint (keyless web SERP). Often bot-challenged from
 * datacenter IPs — it answers 202 then — which counts as unchecked.
 */
export function duckDuckGoSearch(query: string): Promise<SearchHit[] | null> {
  return lookup("ddg-web", query, async () => {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html",
        },
      },
    );
    // DDG answers bot challenges with 202 — only a real 200 carries results.
    if (res.status !== 200) throw new LookupError(res.status);
    const html = await res.text();

    const hits: SearchHit[] = [];
    const linkRe =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets: string[] = [];
    for (let m = snippetRe.exec(html); m; m = snippetRe.exec(html)) {
      snippets.push(decodeEntities(m[1]));
    }
    let i = 0;
    for (let m = linkRe.exec(html); m && hits.length < 8; m = linkRe.exec(html)) {
      const href = m[1].replace(/&amp;/g, "&");
      const snippet = snippets[i++] ?? "";
      // DDG ads link through duckduckgo.com/y.js — not organic results.
      if (href.includes("duckduckgo.com/y.js")) continue;
      hits.push({ title: decodeEntities(m[2]), link: decodeDdgLink(href), snippet });
    }
    return hits;
  });
}

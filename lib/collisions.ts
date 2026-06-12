// "Search the internet like a user would" — collision signals for a name,
// with zero required API keys so the free deploy works out of the box.
//
// Sources, all gathered in parallel:
//   - Web SERP: serper.dev when SERPER_API_KEY is set (most reliable),
//     otherwise DuckDuckGo's HTML endpoint (keyless; can be rate-limited
//     from datacenter IPs, so it fails soft).
//   - Wikipedia opensearch (keyless, reliable) — catches notable companies
//     and products with the same name.
//   - iTunes Search API (keyless, reliable) — App Store name collisions.

import { webSearch, type SearchHit } from "./search";
import type { AppHit } from "./types";

export interface CollisionSignals {
  web: SearchHit[];
  apps: AppHit[];
  /** Wikipedia article titles matching the name. */
  wiki: string[];
  /** Known meanings/entities for the term (DuckDuckGo Instant Answers). */
  meanings: string[];
  /** Exact npm / PyPI package exists (developer-ecosystem collisions). */
  npm: boolean;
  pypi: boolean;
  /** True when a real web SERP (serper or DuckDuckGo) returned results. */
  usedLiveWeb: boolean;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  try {
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
    if (res.status !== 200) return [];
    const html = await res.text();

    const hits: SearchHit[] = [];
    const linkRe =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe =
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
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
      hits.push({
        title: decodeEntities(m[2]),
        link: decodeDdgLink(href),
        snippet,
      });
    }
    return hits;
  } catch {
    return [];
  }
}

async function searchWikipedia(name: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&search=${encodeURIComponent(name)}`,
      {
        headers: {
          Accept: "application/json",
          // Wikimedia API etiquette asks for a descriptive UA.
          "User-Agent": "Vocari/1.0 (domain name research tool)",
        },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[], string[], string[]];
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

/**
 * DuckDuckGo Instant Answers (keyless, not bot-challenged): returns known
 * meanings/entities for a term — e.g. "Notion (productivity software)".
 */
async function searchMeanings(name: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_html=1`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      RelatedTopics?: { Text?: string }[];
    };
    const out: string[] = [];
    if (data.AbstractText) {
      out.push(`${data.Heading}: ${data.AbstractText.slice(0, 160)}`);
    }
    for (const t of data.RelatedTopics ?? []) {
      if (t?.Text) out.push(t.Text.slice(0, 160));
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function searchAppStore(name: string): Promise<AppHit[]> {
  try {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?media=software&limit=6&term=${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { trackName?: string; sellerName?: string; trackViewUrl?: string }[];
    };
    return (data.results ?? [])
      .filter((r) => r.trackName)
      .map((r) => ({
        name: r.trackName!,
        seller: r.sellerName ?? "",
        url: r.trackViewUrl ?? "",
      }));
  } catch {
    return [];
  }
}

/** Gather every collision signal for a candidate name, in parallel. */
export async function gatherCollisionSignals(
  name: string,
): Promise<CollisionSignals> {
  const query = `"${name}" app OR company OR startup`;
  const [serper, wiki, apps, meanings, npm, pypi] = await Promise.all([
    webSearch(query), // null unless SERPER_API_KEY is set
    searchWikipedia(name),
    searchAppStore(name),
    searchMeanings(name),
    packageExists(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`),
    packageExists(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`),
  ]);

  const web = serper && serper.length ? serper : await searchDuckDuckGo(query);

  return { web, apps, wiki, meanings, npm, pypi, usedLiveWeb: web.length > 0 };
}

/** Exact-package existence probe (npm uses /latest — packuments are huge). */
async function packageExists(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

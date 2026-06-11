// Optional live web search — "search-ready".
//
// If SERPER_API_KEY is set, we run real web searches (serper.dev, a Google
// SERP API) so competitor analysis reflects what actually shows up online and
// in app stores. If the key is absent, callers fall back to model knowledge.
//
// To enable: set SERPER_API_KEY in your environment. Get a key at
// https://serper.dev (free tier available).

export interface SearchHit {
  title: string;
  link: string;
  snippet: string;
}

export function isLiveSearchEnabled(): boolean {
  return Boolean(process.env.SERPER_API_KEY);
}

export async function webSearch(
  query: string,
  num = 8,
): Promise<SearchHit[] | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      organic?: { title: string; link: string; snippet?: string }[];
    };
    return (data.organic ?? []).slice(0, num).map((h) => ({
      title: h.title,
      link: h.link,
      snippet: h.snippet ?? "",
    }));
  } catch {
    return null;
  }
}

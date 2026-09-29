// "Search the internet like a user would" — collision signals for a name,
// with zero required API keys so the free deploy works out of the box.
//
// Sources, all gathered in parallel (keyless ones live in lib/sources.ts):
//   - Web SERP: serper.dev when SERPER_API_KEY is set (most reliable),
//     otherwise DuckDuckGo's HTML endpoint (keyless; often bot-challenged
//     from datacenter IPs).
//   - Wikipedia opensearch — catches notable companies and products with
//     the same name.
//   - iTunes Search API — App Store name collisions.
//   - DuckDuckGo Instant Answers, npm and PyPI.
//
// A source that fails is listed in `unchecked`, so the analysis can say what
// it couldn't see instead of treating silence as a clear field.

import type { Source } from "./lookup";
import { webSearch, type SearchHit } from "./search";
import {
  appStoreHits,
  ddgMeanings,
  duckDuckGoSearch,
  npmExists,
  pypiExists,
  wikipediaTitles,
} from "./sources";
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
  /** Sources that failed or were rate-limited; their fields are blank, not clean. */
  unchecked: Source[];
}

/** Gather every collision signal for a candidate name, in parallel. */
export async function gatherCollisionSignals(
  name: string,
): Promise<CollisionSignals> {
  const query = `"${name}" app OR company OR startup`;
  const [serper, wiki, apps, meanings, npm, pypi] = await Promise.all([
    webSearch(query), // null unless SERPER_API_KEY is set (or it failed)
    wikipediaTitles(name),
    appStoreHits(name),
    ddgMeanings(name),
    npmExists(name),
    pypiExists(name),
  ]);

  const web = serper?.length ? serper : await duckDuckGoSearch(query);

  const unchecked: Source[] = [];
  if (web === null) unchecked.push("ddg-web");
  if (wiki === null) unchecked.push("wikipedia");
  if (apps === null) unchecked.push("appstore");
  if (meanings === null) unchecked.push("ddg-answers");
  if (npm === null) unchecked.push("npm");
  if (pypi === null) unchecked.push("pypi");

  return {
    web: web ?? [],
    apps: apps ?? [],
    wiki: wiki ?? [],
    meanings: meanings ?? [],
    npm: npm ?? false,
    pypi: pypi ?? false,
    usedLiveWeb: Boolean(web?.length),
    unchecked,
  };
}

// Generate-time collision screening for a batch of candidate names — all
// keyless and free: iTunes App Store, npm, PyPI, one batched Wikipedia
// lookup, and DuckDuckGo Instant Answers. Every source fails soft, and
// failures are reported in `unchecked` rather than passed off as "no hits".

import { SOURCE_LABELS, type Source } from "./lookup";
import {
  appStoreHits,
  ddgMeanings,
  npmExists,
  pypiExists,
  wikipediaExact,
} from "./sources";

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
  /** Sources that failed or were rate-limited — their fields above are blank, not clean. */
  unchecked: Source[];
}

/** Screen a batch of names against every keyless source in parallel. */
export async function screenNames(
  names: string[],
): Promise<Map<string, NameSignals>> {
  const wikiPromise = wikipediaExact(names);
  const perName = await Promise.all(
    names.map(async (name) => {
      const [apps, npm, pypi, meanings] = await Promise.all([
        appStoreHits(name),
        npmExists(name),
        pypiExists(name),
        ddgMeanings(name),
      ]);
      return { name, apps, npm, pypi, meanings };
    }),
  );
  const wiki = await wikiPromise;

  const out = new Map<string, NameSignals>();
  for (const s of perName) {
    const unchecked: Source[] = [];
    if (s.apps === null) unchecked.push("appstore");
    if (s.npm === null) unchecked.push("npm");
    if (s.pypi === null) unchecked.push("pypi");
    if (wiki === null) unchecked.push("wikipedia");
    if (s.meanings === null) unchecked.push("ddg-answers");
    out.set(s.name, {
      name: s.name,
      appStore: (s.apps ?? [])
        .slice(0, 3)
        .map((a) => ({ name: a.name, seller: a.seller })),
      npm: s.npm ?? false,
      pypi: s.pypi ?? false,
      wikipedia: wiki?.has(s.name.toLowerCase()) ?? false,
      meanings: (s.meanings ?? []).slice(0, 3).map((m) => m.slice(0, 120)),
      unchecked,
    });
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
  if (s.unchecked.length) {
    // Say so explicitly, or the judge reads missing evidence as a clear field.
    parts.push(
      `NOT CHECKED (lookup failed, treat as unknown): ${s.unchecked.map((u) => SOURCE_LABELS[u]).join(", ")}`,
    );
  }
  // "clean" carries the same verdict-relevant information as a sentence.
  return parts.length ? parts.join(" · ") : "clean";
}

"use client";

import { useState } from "react";
import type { CheckResponse } from "@/lib/types";
import { StatusBadge } from "./idea-card";

export interface ShortlistEntry {
  name: string;
  domain: string;
  backstory: string;
  ts: number;
  status?: string;
  source?: string;
  checkedAt?: number;
}

export const SHORTLIST_KEY = "nf.shortlist";

export function loadShortlist(): ShortlistEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveShortlist(list: ShortlistEntry[]) {
  try {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    // storage full / disabled — shortlist is best-effort
  }
}

/** Names go stale in hours — the shortlist re-check is the return trigger. */
export function ShortlistPanel({
  list,
  onUpdate,
  onRemove,
}: {
  list: ShortlistEntry[];
  onUpdate: (list: ShortlistEntry[]) => void;
  onRemove: (domain: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!list.length) return null;

  const recheck = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: list.map((e) => e.domain) }),
      });
      const json = (await res.json().catch(() => null)) as CheckResponse | null;
      if (res.ok && json) {
        const byDomain = new Map(json.results.map((r) => [r.domain, r]));
        onUpdate(
          list.map((e) => {
            const r = byDomain.get(e.domain);
            return r
              ? { ...e, status: r.status, source: r.source, checkedAt: Date.now() }
              : e;
          }),
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const copyMarkdown = async () => {
    const md = list
      .map(
        (e) =>
          `- **${e.domain}** — ${e.backstory}${e.status ? ` _(${e.status}${e.checkedAt ? ` as of ${new Date(e.checkedAt).toLocaleTimeString()}` : ""})_` : ""}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(`## Name shortlist\n\n${md}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <section
      id="shortlist"
      className="mt-8 scroll-mt-20 rounded-[4px] border border-warn/30 bg-panel p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warn">
          ★ Shortlist ({list.length})
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={recheck}
            disabled={checking}
            className="rounded-[3px] border border-edge bg-well px-3 py-1 text-xs uppercase tracking-[0.12em] text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-50"
          >
            {checking ? "Re-checking…" : "Re-check availability"}
          </button>
          <button
            type="button"
            onClick={copyMarkdown}
            className="rounded-[3px] border border-edge bg-well px-3 py-1 text-xs uppercase tracking-[0.12em] text-ink-dim transition hover:border-ink-faint hover:text-ink"
          >
            {copied ? "Copied ✓" : "Copy as Markdown"}
          </button>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {list.map((e) => (
          <li key={e.domain} className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge
              status={e.status ?? "unknown"}
              domain={e.domain}
              source={e.source}
            />
            <span className="text-ink-dim">{e.backstory}</span>
            {e.checkedAt && (
              <span className="text-xs text-ink-faint">
                checked {new Date(e.checkedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(e.domain)}
              aria-label={`Remove ${e.domain} from shortlist`}
              className="text-ink-faint transition hover:text-ink"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

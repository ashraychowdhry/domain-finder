"use client";

import { useState } from "react";
import type { CheckResponse, DomainResult } from "@/lib/types";
import { StatusBadge } from "./idea-card";
import { capture } from "./capture";

/**
 * The highest-intent entry point in the category: "is the name in my head
 * available?" — instant, keyless, no model call.
 */
export function CheckName({ tlds }: { tlds: string[] }) {
  const [name, setName] = useState("");
  const [results, setResults] = useState<DomainResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (clean.length < 2) return;
    setLoading(true);
    setErr(null);
    capture("name_checked", { len: clean.length });
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, tlds }),
      });
      const json = (await res.json().catch(() => null)) as
        | (CheckResponse & { error?: string })
        | null;
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setResults(json.results);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-6 w-full max-w-xl rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          placeholder="Already have a name? Check it instantly…"
          aria-label="Check a name's domain availability"
          className="flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5"
        />
        <button
          type="button"
          onClick={run}
          disabled={loading || name.trim().length < 2}
          className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {loading ? "Checking…" : "Check"}
        </button>
      </div>
      {err && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {err}
        </p>
      )}
      {results && (
        <div role="status" className="mt-2 flex flex-wrap gap-1.5">
          {results.map((r) =>
            r.status === "available" ? (
              <a
                key={r.domain}
                href={`https://porkbun.com/checkout/search?q=${r.domain}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <StatusBadge
                  status={r.status}
                  domain={r.domain}
                  source={r.source}
                />
              </a>
            ) : (
              <StatusBadge
                key={r.domain}
                status={r.status}
                domain={r.domain}
                source={r.source}
                parked={r.parked}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

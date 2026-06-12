"use client";

import { useState } from "react";
import type { CheckResponse, DomainResult } from "@/lib/types";
import { primaryCheckout } from "@/lib/registrars";
import { StatusBadge } from "./idea-card";
import { capture } from "./capture";

/**
 * The highest-intent entry point in the category: "is the name in my head
 * available?" — instant, keyless, no model call. Lives in the top bar;
 * results drop down as a workbench panel.
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
    <div className="relative flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (results) setResults(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            run();
          }
          if (e.key === "Escape") setResults(null);
        }}
        placeholder="Check domain…"
        aria-label="Check a name's domain availability"
        className="w-40 rounded-[3px] border border-edge bg-well px-3 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent sm:w-56"
      />
      <button
        type="button"
        onClick={run}
        disabled={loading || name.trim().length < 2}
        className="rounded-[3px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-white transition hover:bg-accent-hi disabled:opacity-40"
      >
        {loading ? "…" : "Check"}
      </button>

      {(results || err) && (
        <div
          role="status"
          className="absolute right-0 top-full z-20 mt-2 w-max max-w-[88vw] rounded-[4px] border border-edge bg-panel p-3 shadow-xl shadow-black/40"
        >
          {err && (
            <p role="alert" className="text-sm text-bad">
              {err}
            </p>
          )}
          {results && (
            <div className="flex max-w-md flex-wrap gap-1.5">
              {results.map((r) =>
                r.status === "available" ? (
                  <a
                    key={r.domain}
                    href={primaryCheckout(r.domain).href}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
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
      )}
    </div>
  );
}

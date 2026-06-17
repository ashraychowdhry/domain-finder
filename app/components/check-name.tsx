"use client";

import { useState } from "react";
import type { CheckResponse, DomainResult } from "@/lib/types";
import { emailCheckout, primaryCheckout } from "@/lib/registrars";
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

  const clear = () => {
    setName("");
    setResults(null);
    setErr(null);
  };

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative">
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
            if (e.key === "Escape") clear();
          }}
          placeholder="Already have a name? Check it…"
          aria-label="Check a domain you already have across .com .io .ai .app"
          className="w-44 rounded-[3px] border border-edge bg-well py-1.5 pl-3 pr-7 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent sm:w-64"
        />
        {(name || results || err) && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-[2px] text-ink-faint transition hover:bg-chip hover:text-ink"
          >
            ×
          </button>
        )}
      </div>
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
                    onClick={() =>
                      capture("idea_registrar_click", {
                        domain: r.domain,
                        style: "check",
                        rank: 0,
                      })
                    }
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
          {results?.some((r) => r.status === "available") && (
            <a
              href={emailCheckout().href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => capture("email_cta_click", { placement: "check" })}
              className="mt-2 block text-xs text-ink-faint transition hover:text-accent-ink"
            >
              ✉ Get professional email at your new domain →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

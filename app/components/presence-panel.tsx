"use client";

import { useState } from "react";
import type { HandleResult, PresenceResponse } from "@/lib/presence";
import { nextSteps } from "@/lib/registrars";
import { capture } from "./capture";

const HANDLE_STYLE: Record<HandleResult["status"], [string, string]> = {
  free: ["text-ok border-ok/40", "free"],
  taken: ["text-ink-faint border-edge-soft line-through", "taken"],
  unknown: ["text-warn border-warn/40", "couldn't check"],
  invalid: ["text-ink-faint border-edge-soft opacity-60", "not allowed there"],
};

/**
 * "Can I own this name everywhere?" — developer/social handles and a US
 * trademark screen, loaded on demand (keyless lookups, no model call).
 */
export function PresencePanel({
  name,
  placement,
}: {
  name: string;
  placement: "card" | "check";
}) {
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json().catch(() => null)) as
        | (PresenceResponse & { error?: string })
        | null;
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setData(json);
      capture("presence_checked", {
        placement,
        free: json.handles.filter((h) => h.status === "free").length,
        tm_hits: json.trademark.hits.length,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink transition hover:text-accent-hi disabled:opacity-50"
        >
          {loading ? "Checking handles & trademarks…" : "▸ Handles & trademarks"}
        </button>
        {err && (
          <p role="alert" className="mt-1 text-sm text-bad">
            {err}
          </p>
        )}
      </div>
    );
  }

  const tm = data.trademark;
  const exact = tm.hits.filter((h) => h.exact);
  const tmFiling = nextSteps().find((s) => s.label === "File a trademark");

  return (
    <div className="mt-3 rounded-[3px] border border-edge-soft bg-well p-3 text-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        Handles for @{data.name}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {data.handles.map((h) => {
          const [cls, label] = HANDLE_STYLE[h.status];
          return (
            <a
              key={h.id}
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${h.label}: ${label}`}
              className={`inline-flex items-center gap-1 rounded-[3px] border bg-panel px-2 py-0.5 text-xs ${cls}`}
            >
              {h.label}
              <span className="text-[10px] no-underline opacity-70">{label}</span>
            </a>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">
        Check by hand:{" "}
        {data.manual.map((m, i) => (
          <span key={m.label}>
            {i > 0 && " · "}
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-edge hover:text-ink-dim"
            >
              {m.label}
            </a>
          </span>
        ))}
      </p>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        US trademarks
      </p>
      {tm.source === "marker" && tm.ok && tm.hits.length === 0 && (
        <p className="mt-1 text-ok">No live USPTO marks for “{data.name}”.</p>
      )}
      {tm.source === "marker" && !tm.ok && (
        <p className="mt-1 text-warn">The USPTO lookup failed. Check the registers below.</p>
      )}
      {tm.hits.length > 0 && (
        <>
          <p className={`mt-1 ${exact.length ? "text-warn" : "text-ink-dim"}`}>
            {exact.length
              ? `${exact.length} live mark${exact.length > 1 ? "s" : ""} for this exact word. It's only a conflict if the goods overlap with yours.`
              : "Similar live marks. Check whether any cover what you're building."}
          </p>
          <ul className="mt-1 space-y-1">
            {tm.hits.map((h) => (
              <li key={h.serial} className="text-xs text-ink-dim">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline decoration-edge hover:text-accent-ink"
                >
                  {h.mark}
                </a>
                {h.classCode && <span className="text-ink-faint"> · class {h.classCode}</span>}
                {h.description && <span> · {h.description}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-1.5 text-xs text-ink-faint">
        {tm.source === "links" ? "Search the registers: " : "Verify in: "}
        {tm.links.map((l, i) => (
          <span key={l.label}>
            {i > 0 && " · "}
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-ink underline decoration-accent/40 hover:text-accent-hi"
            >
              {l.label}
            </a>
          </span>
        ))}
        . Not legal clearance.
        {tmFiling && (
          <>
            {" "}
            <a
              href={tmFiling.href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => capture("next_step_click", { step: tmFiling.name, placement })}
              className="underline decoration-edge hover:text-ink-dim"
            >
              File a trademark →
            </a>
          </>
        )}
      </p>
    </div>
  );
}

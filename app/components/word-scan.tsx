"use client";

import { useEffect, useRef, useState } from "react";
import type { BrowseResponse, BrowseRow, BrowseSort } from "@/lib/scan/types";
import type { CheckResponse, DomainResult } from "@/lib/types";
import { compareLinks, primaryCheckout } from "@/lib/registrars";
import { capture } from "./capture";

/**
 * Word scan — browse real English words that are still unregistered under
 * a TLD, filtered by length, rarity, pattern and first-checkout budget.
 *
 * Reads the committed scan index via /api/browse (instant, keyless); the
 * "Verify live" button re-checks the visible rows through /api/check (DNS +
 * registry RDAP) because the index is refreshed on a schedule, not per view.
 */

// Mirrors RARITY_LEVELS in lib/scan/words.ts (kept out of the client bundle —
// that module imports the 600KB vocabulary).
const RARITY: { label: string; z: number; hint: string }[] = [
  { label: "Very common", z: 5, hint: "store · apple · switch" },
  { label: "Common", z: 4, hint: "plasma · upgrade · consent" },
  { label: "Everyday", z: 3.5, hint: "glitch · bouquet · scarce" },
  { label: "Known", z: 3, hint: "solace · morph · nuance" },
  { label: "Any real word", z: 2.5, hint: "rare, but in the dictionary" },
];

const SORTS: { value: BrowseSort; label: string }[] = [
  { value: "common", label: "Most common" },
  { value: "rare", label: "Rarest" },
  { value: "short", label: "Shortest" },
  { value: "alpha", label: "A → Z" },
  { value: "price", label: "Cheapest" },
];

const PAGE = 100;

function rarityLabel(z: number): string {
  for (const r of RARITY) if (z >= r.z) return r.label.toLowerCase();
  return "rare";
}

function money(n: number): string {
  return Number.isFinite(n) ? `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}` : "—";
}

const inputCls =
  "rounded-[3px] border border-edge bg-well px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent";

export function WordScan() {
  const [tlds, setTlds] = useState<string[]>(["ai"]);
  const [minLen, setMinLen] = useState(3);
  const [maxLen, setMaxLen] = useState(8);
  const [minZipf, setMinZipf] = useState(3.5);
  const [maxCost, setMaxCost] = useState<string>("");
  const [pattern, setPattern] = useState("");
  const [includeLikely, setIncludeLikely] = useState(true);
  const [premiumOk, setPremiumOk] = useState(false);
  const [sort, setSort] = useState<BrowseSort>("common");
  const [limit, setLimit] = useState(PAGE);

  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, DomainResult>>({});
  const [verifying, setVerifying] = useState(false);
  const seq = useRef(0);

  // Debounced fetch on any control change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({
        tlds: tlds.join(","),
        minLen: String(minLen),
        maxLen: String(maxLen),
        minZipf: String(minZipf),
        includeLikely: includeLikely ? "1" : "0",
        premiumOk: premiumOk ? "1" : "0",
        sort,
        limit: String(limit),
      });
      if (maxCost.trim()) qs.set("maxCost", maxCost.trim());
      if (pattern.trim()) qs.set("pattern", pattern.trim());
      try {
        const res = await fetch(`/api/browse?${qs}`);
        const json = (await res.json().catch(() => null)) as
          | (BrowseResponse & { error?: string })
          | null;
        if (id !== seq.current) return;
        if (!res.ok || !json) throw new Error(json?.error ?? `Request failed (${res.status})`);
        setData(json);
        setErr(null);
        // If the chosen TLD was never scanned, jump to the scanned one
        // with the most unregistered words.
        const scanned = Object.entries(json.tlds);
        if (scanned.length && !tlds.some((t) => t in json.tlds)) {
          scanned.sort((a, b) => b[1].available + b[1].likely - (a[1].available + a[1].likely));
          setTlds([scanned[0][0]]);
        }
      } catch (e) {
        if (id === seq.current) setErr(e instanceof Error ? e.message : "Scan lookup failed");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [tlds, minLen, maxLen, minZipf, maxCost, pattern, includeLikely, premiumOk, sort, limit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const scannedTlds = Object.keys(data?.tlds ?? {}).sort();
  const rows = data?.rows ?? [];

  const toggleTld = (t: string) =>
    setTlds((cur) => {
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      return next.length ? next : cur;
    });

  // Re-check visible rows that haven't been verified live yet (30 per call —
  // the /api/check cap). Taken ones get struck through in place.
  const verify = async () => {
    const pending = rows.map((r) => r.d).filter((d) => !live[d]).slice(0, 30);
    if (!pending.length) return;
    setVerifying(true);
    capture("word_scan_verify", { n: pending.length });
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: pending }),
      });
      const json = (await res.json().catch(() => null)) as CheckResponse | null;
      if (res.ok && json?.results) {
        setLive((cur) => {
          const next = { ...cur };
          for (const r of json.results) next[r.domain] = r;
          return next;
        });
      }
    } finally {
      setVerifying(false);
    }
  };

  const unverified = rows.filter((r) => !live[r.d]).length;
  const meta = tlds.map((t) => data?.tlds[t]).filter(Boolean);
  const scannedAt = meta.length ? Math.min(...meta.map((m) => m!.scannedAt)) : 0;

  return (
    <section id="word-scan" className="mt-10 scroll-mt-20">
      <div className="rounded-[4px] border border-edge bg-panel p-5 sm:p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
          Word scan
        </h2>
        <p className="mt-1 text-sm text-ink">
          Real English words still unregistered — pick an extension, a length,
          a rarity and a budget.
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          Built from a scheduled scan of the dictionary against DNS and each
          registry&apos;s RDAP, priced from the live registrar catalog.
          Verify before you buy: the index is a snapshot, and registries price
          some unregistered names as premium.
        </p>

        {/* ── controls ── */}
        <div className="mt-4 space-y-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
              Extension
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(scannedTlds.length ? scannedTlds : tlds).map((t) => {
                const m = data?.tlds[t];
                const selected = tlds.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleTld(t)}
                    title={
                      m?.reg
                        ? `$${m.reg}/yr${m.minYears > 1 ? ` · ${m.minYears}-year minimum` : ""} · ${m.available} confirmed free`
                        : undefined
                    }
                    className={`rounded-[3px] border px-2.5 py-1 text-sm transition ${
                      selected
                        ? "border-accent bg-accent/10 text-ink"
                        : "border-edge bg-well text-ink-dim hover:border-ink-faint hover:text-ink"
                    }`}
                  >
                    .{t}
                    {m?.reg !== undefined && (
                      <span className="ml-1.5 text-[10px] text-ink-faint">
                        ${Math.round(m.reg * m.minYears)}
                        {m.minYears > 1 ? `/${m.minYears}yr` : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.15em] text-ink-dim">
                Length
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={minLen}
                  onChange={(e) => setMinLen(Math.max(2, Math.min(12, Number(e.target.value) || 2)))}
                  aria-label="Minimum letters"
                  className={`${inputCls} w-16`}
                />
                <span className="text-ink-faint">–</span>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={maxLen}
                  onChange={(e) => setMaxLen(Math.max(2, Math.min(12, Number(e.target.value) || 12)))}
                  aria-label="Maximum letters"
                  className={`${inputCls} w-16`}
                />
                <span className="text-xs text-ink-faint">letters</span>
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.15em] text-ink-dim">
                Rarity
              </span>
              <select
                value={minZipf}
                onChange={(e) => setMinZipf(Number(e.target.value))}
                className={`${inputCls} mt-1 w-full`}
              >
                {RARITY.map((r) => (
                  <option key={r.z} value={r.z}>
                    {r.label} — {r.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.15em] text-ink-dim">
                Max first checkout
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-ink-faint">$</span>
                <input
                  type="number"
                  min={0}
                  placeholder="any"
                  value={maxCost}
                  onChange={(e) => setMaxCost(e.target.value)}
                  className={`${inputCls} w-full`}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.15em] text-ink-dim">
                Pattern (regex)
              </span>
              <input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder=".*ly   [aeiou].*   s.*e"
                spellCheck={false}
                className={`${inputCls} mt-1 w-full`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-dim">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeLikely}
                onChange={(e) => setIncludeLikely(e.target.checked)}
                className="accent-accent"
              />
              include DNS-only (not yet registry-confirmed)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={premiumOk}
                onChange={(e) => setPremiumOk(e.target.checked)}
                className="accent-accent"
              />
              show likely-premium names
            </label>
            <label className="ml-auto flex items-center gap-1.5">
              sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as BrowseSort)}
                className={`${inputCls} py-1`}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* ── results ── */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
            {loading && !data
              ? "Loading…"
              : `${data?.total ?? 0} words${loading ? " — updating…" : ""}`}
            {scannedAt > 0 && (
              <span className="ml-2 font-normal normal-case tracking-normal text-ink-faint">
                index scanned {new Date(scannedAt).toLocaleDateString()}
              </span>
            )}
          </p>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={verify}
              disabled={verifying || unverified === 0}
              className="rounded-[3px] border border-accent/50 bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent-ink transition hover:border-accent hover:bg-accent/25 disabled:opacity-40"
            >
              {verifying
                ? "Verifying…"
                : unverified === 0
                  ? "All visible rows verified"
                  : `Verify ${Math.min(30, unverified)} live`}
            </button>
          )}
        </div>

        {err && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {err}
          </p>
        )}

        {data && scannedTlds.length === 0 && (
          <p className="mt-3 rounded-[3px] border border-edge bg-well px-3 py-2 text-xs text-ink-dim">
            The scan index is empty. Build it with{" "}
            <code className="text-ink">npm run scan -- --tlds ai,io,app</code> and
            redeploy.
          </p>
        )}

        {rows.length > 0 && (
          <ul className="mt-3 divide-y divide-edge-soft border-y border-edge-soft">
            {rows.map((r) => (
              <Row key={r.d} row={r} live={live[r.d]} />
            ))}
          </ul>
        )}

        {data && data.total > rows.length && (
          <button
            type="button"
            onClick={() => setLimit((l) => Math.min(500, l + PAGE))}
            disabled={limit >= 500}
            className="mt-3 w-full rounded-[3px] border border-edge bg-well px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-ink-dim transition hover:border-ink-faint hover:text-ink disabled:opacity-40"
          >
            {limit >= 500
              ? "Narrow the filters to see more"
              : `Show more (${data.total - rows.length} left)`}
          </button>
        )}

        <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
          &ldquo;Confirmed&rdquo; = the registry&apos;s RDAP reported the name
          unregistered at scan time; &ldquo;DNS-only&rdquo; = not delegated in DNS
          but not yet registry-confirmed. Cost = list price × the registry&apos;s
          minimum term (.ai requires 2 years). &ldquo;premium?&rdquo; marks short
          or very common words in extensions whose registry sells premium names —
          the registrar shows the real price. Registrar links may be affiliate
          links; your price never changes.
        </p>
      </div>
    </section>
  );
}

function Row({ row, live }: { row: BrowseRow; live?: DomainResult }) {
  const liveTaken = live?.status === "taken";
  const liveFree = live?.status === "available" && live.source === "rdap";
  const liveDns = live?.status === "available" && live.source !== "rdap";
  const confirmed = row.status === "available";
  const checkout = primaryCheckout(row.d);
  const compare = compareLinks(row.d);

  const statusCls = liveTaken
    ? "text-ink-faint border-edge-soft"
    : liveFree || confirmed
      ? "text-ok border-ok/40"
      : "text-warn border-warn/40";
  const statusText = liveTaken
    ? "taken now"
    : liveFree
      ? "live ✓"
      : liveDns
        ? "live · DNS-only"
        : confirmed
          ? "confirmed"
          : "DNS-only";

  const risk = row.premiumRisk;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className={`min-w-[9rem] font-semibold ${liveTaken ? "text-ink-faint line-through" : "text-ink"}`}>
        {row.d}
      </span>
      <span className="w-20 text-[11px] text-ink-faint">{rarityLabel(row.z)}</span>
      <span
        className={`rounded-[3px] border bg-well px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusCls}`}
        title={
          liveTaken
            ? "Registered since the scan"
            : liveFree
              ? "Registry RDAP confirmed unregistered just now"
              : liveDns
                ? "Not delegated in DNS right now; the registry's RDAP didn't answer"
                : confirmed
              ? "Registry RDAP said unregistered at scan time"
              : "Not delegated in DNS; not yet confirmed with the registry"
        }
      >
        {statusText}
      </span>
      <span className="text-xs text-ink-dim">
        {money(row.cost)}
        {row.minYears > 1 && row.priceClass !== "premium" && (
          <span className="text-ink-faint"> / {row.minYears} yr</span>
        )}
        {row.renew !== undefined &&
          row.priceClass !== "premium" &&
          row.renew > row.cost / row.minYears * 1.5 && (
            <span
              className="ml-1 text-warn/80"
              title="First-year promo — renewal is much higher"
            >
              renews {money(row.renew)}
            </span>
          )}
      </span>
      {risk === "verified-premium" && (
        <span className="rounded-[3px] border border-warn/40 bg-well px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-warn">
          premium
        </span>
      )}
      {risk === "high" && (
        <span
          className="rounded-[3px] border border-warn/40 bg-well px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-warn"
          title="Short or very common word in an extension whose registry sells premium names — the registrar shows the real price"
        >
          premium?
        </span>
      )}
      {risk === "verified-standard" && (
        <span className="text-[10px] uppercase tracking-[0.12em] text-ok/80">standard ✓</span>
      )}
      {row.flags?.includes("profanity") && (
        <span className="text-[10px] uppercase tracking-[0.12em] text-bad/80">⚠ embedded word</span>
      )}
      {!liveTaken && (
        <span className="ml-auto flex items-center gap-2 text-xs">
          <a
            href={checkout.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() =>
              capture("idea_registrar_click", { domain: row.d, style: "scan", rank: 0 })
            }
            className="rounded-[3px] border border-accent/50 bg-accent/15 px-2 py-0.5 font-semibold text-accent-ink transition hover:border-accent hover:bg-accent/25"
          >
            {checkout.name} ▸
          </a>
          {compare.slice(0, 1).map((c) => (
            <a
              key={c.name}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="text-ink-faint transition hover:text-ink"
            >
              {c.name}
            </a>
          ))}
        </span>
      )}
    </li>
  );
}

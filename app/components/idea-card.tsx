"use client";

import { useState } from "react";
import { Fraunces, Quicksand, Space_Grotesk } from "next/font/google";
import type {
  AnalyzeResponse,
  AppType,
  Platform,
  RankedIdea,
  TldPrice,
} from "@/lib/types";
import { compareLinks, primaryCheckout } from "@/lib/registrars";
import { capture } from "./capture";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: "500" });
const fraunces = Fraunces({ subsets: ["latin"], weight: "500" });
const quicksand = Quicksand({ subsets: ["latin"], weight: "600" });

export interface ProductContext {
  description: string;
  appType: AppType;
  platforms: Platform[];
}

export function StatusBadge({
  status,
  domain,
  source,
  parked,
  price,
}: {
  status: string;
  domain: string;
  source?: string;
  parked?: boolean;
  price?: TldPrice;
}) {
  const styles =
    status === "available"
      ? "text-ok border-ok/40 bg-well"
      : status === "taken"
        ? "text-ink-faint border-edge-soft bg-well"
        : "text-warn border-warn/40 bg-well";
  const statusText =
    status === "available"
      ? source === "rdap"
        ? "available (registry-confirmed) — verify at a registrar"
        : "likely available (DNS signal) — confirm at a registrar"
      : status === "taken"
        ? parked
          ? "registered & parked — likely listed for sale at a premium"
          : "registered — may be parked or for sale at an aftermarket premium"
        : "couldn't verify";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-xs ${styles}`}
      title={statusText}
      aria-label={`${domain} — ${statusText}`}
    >
      <span className={status === "taken" ? "line-through" : ""}>{domain}</span>
      {status === "available" && price && (
        <span className="text-[10px] opacity-70">${Math.round(price.reg)}/yr</span>
      )}
      {status === "taken" && parked && (
        <span className="text-[10px] text-warn no-underline">for sale</span>
      )}
    </span>
  );
}

function RiskChip({ idea }: { idea: RankedIdea }) {
  if (idea.collisionRisk === undefined) return null;
  const r = idea.collisionRisk;
  const [cls, label] =
    r <= 25
      ? ["text-ok border-ok/40", "clear field"]
      : r <= 55
        ? ["text-warn border-warn/40", "some noise"]
        : [
            "text-bad border-bad/40",
            idea.topCollision ? `collides: ${idea.topCollision}` : "crowded",
          ];
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border bg-well px-2 py-0.5 text-xs ${cls}`}
      title={`Collision risk ${r}/100${idea.topCollision ? ` — worst: ${idea.topCollision}` : ""} (screened against App Store, npm, PyPI, Wikipedia)`}
    >
      {label}
    </span>
  );
}

function AnalyzePanel({
  idea,
  product,
}: {
  idea: RankedIdea;
  product: ProductContext;
}) {
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const target = idea.bestAvailable ?? idea.domains[0]?.domain;

  const run = async () => {
    if (!target) return;
    setLoading(true);
    setErr(null);
    capture("idea_analyzed", { name: idea.name, style: idea.style });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: target,
          name: idea.name,
          description: product.description,
          appType: product.appType,
          platforms: product.platforms,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="mt-3">
        <button
          onClick={run}
          disabled={loading || !target}
          className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-ink transition hover:text-accent-hi disabled:opacity-50"
        >
          {loading ? "Analyzing competition…" : "▸ Deep-dive SEO & competitors"}
        </button>
        {err && (
          <p role="alert" className="mt-1 text-sm text-bad">
            {err}
          </p>
        )}
      </div>
    );
  }

  const scoreColor =
    data.seoScore >= 70 ? "text-ok" : data.seoScore >= 40 ? "text-warn" : "text-bad";

  return (
    <div className="mt-3 rounded-[3px] border border-edge-soft bg-well p-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-dim">
          SEO / field clarity:{" "}
          <span className={scoreColor}>{data.seoScore}/100</span>
        </span>
        {!data.usedLiveSearch && (
          <span className="text-[10px] uppercase tracking-wide text-ink-faint">
            model estimate
          </span>
        )}
      </div>
      <p className="mt-1 text-ink-dim">{data.verdict}</p>

      {data.collisions.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            Name collisions
          </p>
          <ul className="mt-1 space-y-1">
            {data.collisions.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                    c.severity === "high"
                      ? "bg-bad"
                      : c.severity === "medium"
                        ? "bg-warn"
                        : "bg-ink-faint"
                  }`}
                />
                <span className="text-ink-dim">
                  <strong className="text-ink">{c.name}</strong>{" "}
                  <span className="text-ink-faint">({c.kind})</span> — {c.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.pros.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ok">
              Pros
            </p>
            <ul className="mt-1 space-y-0.5 text-ink-dim">
              {data.pros.map((p, i) => (
                <li key={i}>+ {p}</li>
              ))}
            </ul>
          </div>
        )}
        {data.cons.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bad">
              Cons
            </p>
            <ul className="mt-1 space-y-0.5 text-ink-dim">
              {data.cons.map((c, i) => (
                <li key={i}>- {c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {data.trademarkNote && (
        <p className="mt-2 text-xs text-warn">™ {data.trademarkNote}</p>
      )}
      <p className="mt-2 text-xs text-ink-faint">
        Not trademark clearance —{" "}
        <a
          href={`https://tmsearch.uspto.gov/search/search-results/${encodeURIComponent(idea.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-ink underline decoration-accent/40 hover:text-accent-hi"
        >
          check USPTO
        </a>{" "}
        before committing.
      </p>
    </div>
  );
}

export function IdeaCard({
  idea,
  product,
  tldPricing,
  starred,
  onStar,
  onMoreLikeThis,
  via,
  rank,
}: {
  idea: RankedIdea;
  product: ProductContext;
  tldPricing: Record<string, TldPrice> | null;
  starred: boolean;
  onStar: () => void;
  onMoreLikeThis: () => void;
  via?: string;
  rank: number;
}) {
  const available = idea.domains.filter((d) => d.status === "available");
  const others = idea.domains.filter((d) => d.status !== "available");
  const hasCom = available.some((d) => d.tld === "com");

  const whyParts = [
    hasCom ? ".com available" : available.length ? `${available.length} TLDs available` : null,
    `${idea.name.length} letters`,
    idea.judgeRank ? `judged #${idea.judgeRank}` : null,
    idea.collisionRisk !== undefined ? `field ${100 - idea.collisionRisk}/100` : null,
  ].filter(Boolean);

  return (
    <li className="rounded-[4px] border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {rank === 1 && (
            <span className="rounded-[3px] bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white">
              Top pick
            </span>
          )}
          <h3 className="text-lg font-bold tracking-tight text-ink">
            {idea.name}
          </h3>
          <span className="rounded-[3px] border border-edge bg-chip px-2 py-0.5 text-xs text-ink-dim">
            {idea.style}
          </span>
          <RiskChip idea={idea} />
        </div>
        <button
          type="button"
          onClick={() => {
            onStar();
            capture("idea_starred", { name: idea.name, style: idea.style });
          }}
          aria-pressed={starred}
          aria-label={starred ? `Remove ${idea.name} from shortlist` : `Shortlist ${idea.name}`}
          className={`text-lg leading-none transition ${starred ? "text-warn" : "text-ink-faint hover:text-warn"}`}
        >
          ★
        </button>
      </div>

      {/* Wordmark previews — evaluating a brand, not a string. */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-[3px] border border-edge-soft bg-well px-3 py-2 text-ink">
        <span className={`${spaceGrotesk.className} text-xl tracking-tight`}>
          {idea.name}
        </span>
        <span className={`${fraunces.className} text-xl`}>{idea.name}</span>
        <span className={`${quicksand.className} text-xl`}>{idea.name}</span>
      </div>

      <p className="mt-3 text-sm text-ink-dim">{idea.backstory}</p>
      {idea.critique && (
        <p className="mt-1 text-sm text-ink-faint">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">
            judge:
          </span>{" "}
          {idea.critique}
        </p>
      )}
      {via && <p className="mt-1 text-xs text-accent-ink">{via}</p>}

      {idea.flags.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {idea.flags.map((f, i) => (
            <li key={i} className="text-xs text-warn">
              ⚠ {f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {available.map((d) => (
          <a
            key={d.domain}
            href={primaryCheckout(d.domain).href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() =>
              capture("idea_registrar_click", {
                domain: d.domain,
                style: idea.style,
                rank,
              })
            }
          >
            <StatusBadge
              status={d.status}
              domain={d.domain}
              source={d.source}
              price={tldPricing?.[d.tld]}
            />
          </a>
        ))}
        {others.map((d) => (
          <StatusBadge
            key={d.domain}
            status={d.status}
            domain={d.domain}
            source={d.source}
            parked={d.parked}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
        <span>{whyParts.join(" · ")}</span>
        <span className="opacity-70">mined from: {idea.sourceNodes.join(", ")}</span>
        <button
          type="button"
          onClick={onMoreLikeThis}
          className="font-semibold uppercase tracking-[0.12em] text-accent-ink transition hover:text-accent-hi"
        >
          More like this ▸
        </button>
        {idea.bestAvailable && (
          <span>
            compare:{" "}
            {compareLinks(idea.bestAvailable).map((l, i) => (
              <span key={l.name}>
                {i > 0 && " · "}
                <a
                  className="underline decoration-edge hover:text-ink-dim"
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  href={l.href}
                >
                  {l.name}
                </a>
              </span>
            ))}
            {" · "}
            <a
              className="underline decoration-edge hover:text-ink-dim"
              target="_blank"
              rel="noopener noreferrer"
              href="https://domains.cloudflare.com/"
            >
              Cloudflare (at-cost)
            </a>
          </span>
        )}
      </div>

      <AnalyzePanel idea={idea} product={product} />
    </li>
  );
}

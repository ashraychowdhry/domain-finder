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
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30"
      : status === "taken"
        ? "bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/35 ring-transparent"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30";
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
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs ring-1 ring-inset ${styles}`}
      title={statusText}
      aria-label={`${domain} — ${statusText}`}
    >
      <span className={status === "taken" ? "line-through" : ""}>{domain}</span>
      {status === "available" && price && (
        <span className="text-[10px] opacity-70">${Math.round(price.reg)}/yr</span>
      )}
      {status === "taken" && parked && (
        <span className="text-[10px] text-amber-600 no-underline dark:text-amber-400">
          for sale
        </span>
      )}
    </span>
  );
}

function RiskChip({ idea }: { idea: RankedIdea }) {
  if (idea.collisionRisk === undefined) return null;
  const r = idea.collisionRisk;
  const [cls, label] =
    r <= 25
      ? [
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30",
          "clear field",
        ]
      : r <= 55
        ? [
            "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30",
            "some noise",
          ]
        : [
            "bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/30",
            idea.topCollision ? `collides: ${idea.topCollision}` : "crowded",
          ];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${cls}`}
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
          className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
        >
          {loading ? "Analyzing competition…" : "Deep-dive SEO & competitors →"}
        </button>
        {err && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {err}
          </p>
        )}
      </div>
    );
  }

  const scoreColor =
    data.seoScore >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : data.seoScore >= 40
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">
          SEO / field clarity:{" "}
          <span className={scoreColor}>{data.seoScore}/100</span>
        </span>
        {!data.usedLiveSearch && (
          <span className="text-xs text-black/40 dark:text-white/40">
            model estimate
          </span>
        )}
      </div>
      <p className="mt-1 text-black/70 dark:text-white/70">{data.verdict}</p>

      {data.collisions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
            Name collisions
          </p>
          <ul className="mt-1 space-y-1">
            {data.collisions.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    c.severity === "high"
                      ? "bg-red-500"
                      : c.severity === "medium"
                        ? "bg-amber-500"
                        : "bg-black/20 dark:bg-white/25"
                  }`}
                />
                <span>
                  <strong>{c.name}</strong>{" "}
                  <span className="text-black/45 dark:text-white/45">
                    ({c.kind})
                  </span>{" "}
                  — {c.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.pros.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Pros
            </p>
            <ul className="mt-1 list-disc pl-4 text-black/70 dark:text-white/70">
              {data.pros.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {data.cons.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
              Cons
            </p>
            <ul className="mt-1 list-disc pl-4 text-black/70 dark:text-white/70">
              {data.cons.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {data.trademarkNote && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          ™ {data.trademarkNote}
        </p>
      )}
      <p className="mt-2 text-xs text-black/40 dark:text-white/40">
        Not trademark clearance —{" "}
        <a
          href={`https://tmsearch.uspto.gov/search/search-results/${encodeURIComponent(idea.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
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
    idea.collisionRisk !== undefined ? `field clarity ${100 - idea.collisionRisk}/100` : null,
  ].filter(Boolean);

  return (
    <li className="rounded-xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {rank === 1 && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Top pick
            </span>
          )}
          <h3 className="text-lg font-semibold">{idea.name}</h3>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/55 dark:bg-white/10 dark:text-white/55">
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
          className={`text-lg leading-none transition ${starred ? "text-amber-500" : "text-black/25 hover:text-amber-500 dark:text-white/25"}`}
        >
          ★
        </button>
      </div>

      {/* Wordmark previews — evaluating a brand, not a string. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-4 text-black/80 dark:text-white/85">
        <span className={`${spaceGrotesk.className} text-xl tracking-tight`}>
          {idea.name}
        </span>
        <span className={`${fraunces.className} text-xl`}>{idea.name}</span>
        <span className={`${quicksand.className} text-xl`}>{idea.name}</span>
      </div>

      <p className="mt-2 text-sm text-black/65 dark:text-white/65">
        {idea.backstory}
      </p>
      {idea.critique && (
        <p className="mt-1 text-sm italic text-black/50 dark:text-white/50">
          Judge: {idea.critique}
        </p>
      )}
      {via && (
        <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">{via}</p>
      )}

      {idea.flags.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {idea.flags.map((f, i) => (
            <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
              ⚠ {f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {available.map((d) => (
          <a
            key={d.domain}
            href={`https://porkbun.com/checkout/search?q=${d.domain}`}
            target="_blank"
            rel="noopener noreferrer"
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/45 dark:text-white/45">
        <span>{whyParts.join(" · ")}</span>
        <span className="text-black/30 dark:text-white/30">
          mined from: {idea.sourceNodes.join(", ")}
        </span>
        <button
          type="button"
          onClick={onMoreLikeThis}
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          More like this →
        </button>
        {idea.bestAvailable && (
          <span>
            compare:{" "}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.namecheap.com/domains/registration/results/?domain=${idea.bestAvailable}`}
            >
              Namecheap
            </a>{" "}
            ·{" "}
            <a
              className="underline"
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

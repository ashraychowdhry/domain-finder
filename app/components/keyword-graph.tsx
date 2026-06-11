"use client";

import { useState } from "react";
import type { KeywordGraph, KeywordKind } from "@/lib/types";

const KIND_LABELS: Record<KeywordKind, string> = {
  core: "Core concepts",
  benefit: "Benefits",
  vibe: "Vibes",
  metaphor: "Metaphors",
  root: "Roots & etymology",
};

const KIND_STYLES: Record<KeywordKind, string> = {
  core: "text-indigo-700 ring-indigo-500/25 dark:text-indigo-300",
  benefit: "text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  vibe: "text-pink-700 ring-pink-500/25 dark:text-pink-300",
  metaphor: "text-amber-700 ring-amber-500/25 dark:text-amber-300",
  root: "text-sky-700 ring-sky-500/25 dark:text-sky-300",
};

/**
 * The keyword graph as the product's control surface: tap nodes to select
 * them, add your own, and forge a fresh batch from exactly those terms.
 */
export function KeywordGraphView({
  graph,
  selected,
  onToggle,
  onAddTerm,
  onForge,
  forging,
}: {
  graph: KeywordGraph;
  selected: Set<string>;
  onToggle: (term: string) => void;
  onAddTerm: (term: string) => void;
  onForge: () => void;
  forging: boolean;
}) {
  const [draft, setDraft] = useState("");
  const kinds = (Object.keys(KIND_LABELS) as KeywordKind[]).filter((k) =>
    graph.nodes.some((n) => n.kind === k),
  );
  if (!kinds.length) return null;

  return (
    <section className="mt-8 rounded-2xl border border-black/10 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Keyword graph · tap nodes to steer, then forge from your selection
        </h2>
        <button
          type="button"
          onClick={onForge}
          disabled={selected.size === 0 || forging}
          className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {forging ? "Forging…" : `Forge from selected (${selected.size})`}
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {kinds.map((kind) => (
          <div key={kind} className="flex flex-wrap items-baseline gap-1.5">
            <span className="w-36 shrink-0 text-xs text-black/45 dark:text-white/45">
              {KIND_LABELS[kind]}
            </span>
            {graph.nodes
              .filter((n) => n.kind === kind)
              .map((n) => {
                const isSel = selected.has(n.term);
                return (
                  <button
                    key={n.term}
                    type="button"
                    onClick={() => onToggle(n.term)}
                    aria-pressed={isSel}
                    title={
                      n.note +
                      (n.connects.length
                        ? ` · connects: ${n.connects.join(", ")}`
                        : "")
                    }
                    aria-label={`${n.term}: ${n.note}`}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm ring-1 ring-inset transition ${KIND_STYLES[kind]} ${
                      isSel
                        ? "bg-black/10 font-medium dark:bg-white/15"
                        : "bg-transparent opacity-75 hover:opacity-100"
                    }`}
                  >
                    {n.term}
                  </button>
                );
              })}
          </div>
        ))}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="w-36 shrink-0 text-xs text-black/45 dark:text-white/45">
            Your own term
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                e.preventDefault();
                onAddTerm(draft.trim().toLowerCase());
                setDraft("");
              }
            }}
            placeholder="add a word + Enter"
            className="w-44 rounded-md border border-black/10 bg-white/60 px-2 py-0.5 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5"
          />
        </div>
      </div>
    </section>
  );
}

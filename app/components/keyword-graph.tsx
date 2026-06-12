"use client";

import { useState } from "react";
import type { KeywordGraph, KeywordKind } from "@/lib/types";

const KIND_LABELS: Record<KeywordKind, string> = {
  core: "Core concepts",
  benefit: "Benefits",
  vibe: "Vibes",
  metaphor: "Metaphors",
  root: "Roots",
};

/** Signal-colored outline chips per node kind (workbench palette). */
const KIND_STYLES: Record<KeywordKind, string> = {
  core: "text-ink border-edge",
  benefit: "text-ok border-ok/40",
  vibe: "text-bad border-bad/40",
  metaphor: "text-warn border-warn/40",
  root: "text-info border-info/40",
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
    <section
      id="graph"
      className="mt-8 rounded-[4px] border border-edge bg-panel p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
          ❋ Keyword graph — tap nodes to steer
        </h2>
        <button
          type="button"
          onClick={onForge}
          disabled={selected.size === 0 || forging}
          className="rounded-[3px] bg-accent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-accent-hi disabled:opacity-40"
        >
          {forging ? "Forging…" : `Forge from selected (${selected.size})`}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {kinds.map((kind) => (
          <div key={kind}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              {KIND_LABELS[kind]}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
                      className={`inline-flex items-center rounded-[3px] border px-2 py-1 text-sm transition ${
                        isSel
                          ? "border-accent bg-accent/15 text-ink"
                          : `bg-well hover:bg-chip ${KIND_STYLES[kind]}`
                      }`}
                    >
                      {isSel ? "▸ " : ""}
                      {n.term}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-edge-soft pt-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
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
          className="w-44 rounded-[3px] border border-edge bg-well px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
      </div>
    </section>
  );
}

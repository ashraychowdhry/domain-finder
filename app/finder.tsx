"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TLDS, TLD_NOTES } from "@/lib/tlds";
import type {
  AppType,
  GenerateEvent,
  GenerateResponse,
  KeywordGraph,
  NamingStyle,
  Platform,
  RankedIdea,
  RefineResponse,
  TldPrice,
} from "@/lib/types";
import { IdeaCard } from "./components/idea-card";
import { KeywordGraphView } from "./components/keyword-graph";
import {
  loadShortlist,
  saveShortlist,
  ShortlistPanel,
  type ShortlistEntry,
} from "./components/shortlist";
import { CheckName } from "./components/check-name";
import { capture } from "./components/capture";

const APP_TYPES: { value: AppType; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
  { value: "both", label: "Both" },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "web", label: "Web" },
];

const STYLE_OPTIONS: { value: NamingStyle; label: string }[] = [
  { value: "real-word", label: "Real word" },
  { value: "coined", label: "Coined" },
  { value: "compound", label: "Compound" },
  { value: "roots", label: "Latin/Greek roots" },
  { value: "misspelling", label: "Playful respelling" },
  { value: "metaphor", label: "Metaphor" },
];

type DisplayIdea = RankedIdea & { via?: string };

/** Lightweight tag input: type + Enter (or comma) to add chips. */
function TagInput({
  label,
  placeholder,
  tags,
  setTags,
}: {
  label: string;
  placeholder: string;
  tags: string[];
  setTags: (t: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) setTags([...new Set([...tags, ...parts])]);
    setDraft("");
  };
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-lg border border-black/10 bg-white/60 p-2 focus-within:border-black/30 dark:border-white/15 dark:bg-white/5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-0.5 text-sm dark:bg-white/10"
          >
            {t}
            <button
              type="button"
              onClick={() => setTags(tags.filter((x) => x !== t))}
              className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={() => draft && commit(draft)}
          placeholder={tags.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </label>
  );
}

interface Brief {
  d: string;
  k: string[];
  v: string[];
  a: AppType;
  p: Platform[];
  t: string[];
  av: string;
  s: NamingStyle[];
}

function encodeBrief(b: Brief): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(b))));
}
function decodeBrief(s: string): Brief | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s)))) as Brief;
  } catch {
    return null;
  }
}

export default function Finder() {
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [appType, setAppType] = useState<AppType>("web");
  const [platforms, setPlatforms] = useState<Platform[]>(["web"]);
  const [tlds, setTlds] = useState<string[]>([...DEFAULT_TLDS]);
  const [avoid, setAvoid] = useState("");
  const [stylePrefs, setStylePrefs] = useState<NamingStyle[]>([]);

  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<KeywordGraph | null>(null);
  const [ideas, setIdeas] = useState<DisplayIdea[]>([]);
  const [takenNames, setTakenNames] = useState<string[]>([]);
  const [tldPricing, setTldPricing] = useState<Record<string, TldPrice> | null>(
    null,
  );
  const [done, setDone] = useState(false);

  const [graphSelected, setGraphSelected] = useState<Set<string>>(new Set());
  const [refining, setRefining] = useState(false);
  const [styleFilter, setStyleFilter] = useState<Set<NamingStyle>>(new Set());
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [formPricing, setFormPricing] = useState<Record<string, TldPrice>>({});

  // The form state at the moment of the last run (refine must match it).
  const runBrief = useRef<Brief | null>(null);

  // One-time hydration from client-only sources (URL brief, localStorage).
  // Lazy useState initializers would SSR-mismatch, so this must be an effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setShortlist(loadShortlist());
    // Prefill from a shared brief URL.
    const b = new URLSearchParams(window.location.search).get("b");
    const brief = b ? decodeBrief(b) : null;
    if (brief) {
      setDescription(brief.d ?? "");
      setKeywords(brief.k ?? []);
      setVibes(brief.v ?? []);
      setAppType(brief.a ?? "web");
      setPlatforms(brief.p ?? ["web"]);
      setTlds(brief.t?.length ? brief.t : [...DEFAULT_TLDS]);
      setAvoid(brief.av ?? "");
      setStylePrefs(brief.s ?? []);
    }
    // TLD price garnish for the picker (slow on cold start; fine if late).
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.tldPricing && setFormPricing(j.tldPricing))
      .catch(() => {});
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateShortlist = (list: ShortlistEntry[]) => {
    setShortlist(list);
    saveShortlist(list);
  };

  const togglePlatform = (p: Platform) =>
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  const toggleTld = (t: string) =>
    setTlds((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  const toggleStyle = (s: NamingStyle) =>
    setStylePrefs((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  const handleEvent = (e: GenerateEvent) => {
    switch (e.type) {
      case "status":
        setTimeline((t) => [...t, e.msg]);
        break;
      case "graph":
        setGraph(e.graph);
        setGraphSelected(new Set());
        break;
      case "round":
        setTakenNames((cur) => cur); // counts arrive via status lines
        break;
      case "ideas":
        setIdeas(e.ideas);
        break;
      case "pricing":
        setTldPricing(e.tldPricing);
        break;
      case "done": {
        const r: GenerateResponse = e.response;
        setIdeas(r.ideas);
        setTakenNames(r.takenNames);
        if (r.tldPricing) setTldPricing(r.tldPricing);
        setDone(true);
        capture("generate_completed", { ideas: r.ideas.length });
        if (!r.ideas.some((i) => i.bestAvailable)) capture("zero_results");
        break;
      }
      case "error":
        setError(e.error);
        break;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 8) {
      setError("Describe your product in a bit more detail.");
      return;
    }
    if (tlds.length === 0) {
      setError("Pick at least one domain extension.");
      return;
    }
    setLoading(true);
    setError(null);
    setIdeas([]);
    setGraph(null);
    setTimeline([]);
    setDone(false);
    setTakenNames([]);
    setStyleFilter(new Set());

    const brief: Brief = {
      d: description,
      k: keywords,
      v: vibes,
      a: appType,
      p: platforms,
      t: tlds,
      av: avoid,
      s: stylePrefs,
    };
    runBrief.current = brief;
    window.history.replaceState(null, "", `?b=${encodeBrief(brief)}`);
    capture("generate_submitted", {
      tlds: tlds.join(","),
      styles: stylePrefs.join(",") || "auto",
    });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          keywords,
          vibes,
          appType,
          platforms,
          tlds,
          avoid,
          stylePrefs: stylePrefs.length ? stylePrefs : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line) handleEvent(JSON.parse(line) as GenerateEvent);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const refine = async (opts: {
    focusTerms?: string[];
    seedIdea?: { name: string; style: string; backstory: string };
    via: string;
  }) => {
    if (!graph || refining) return;
    const brief = runBrief.current;
    setRefining(true);
    setError(null);
    capture("refine_clicked", { mode: opts.seedIdea ? "similar" : "steer" });
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: brief?.d ?? description,
          keywords: brief?.k ?? keywords,
          vibes: brief?.v ?? vibes,
          appType: brief?.a ?? appType,
          tlds: brief?.t ?? tlds,
          avoid: brief?.av || undefined,
          stylePrefs: brief?.s.length ? brief.s : undefined,
          graph,
          excludeNames: [...ideas.map((i) => i.name), ...takenNames],
          focusTerms: opts.focusTerms,
          seedIdea: opts.seedIdea,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (RefineResponse & { error?: string })
        | null;
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      const existing = new Set(ideas.map((i) => i.name));
      const fresh: DisplayIdea[] = json.ideas
        .filter((i) => !existing.has(i.name))
        .map((i) => ({ ...i, via: opts.via }));
      setIdeas((cur) => [...fresh, ...cur]);
      setTakenNames((cur) => [...new Set([...cur, ...json.takenNames])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed.");
    } finally {
      setRefining(false);
    }
  };

  const toggleStar = (idea: DisplayIdea) => {
    const domain = idea.bestAvailable ?? idea.domains[0]?.domain;
    if (!domain) return;
    const exists = shortlist.some((e) => e.domain === domain);
    updateShortlist(
      exists
        ? shortlist.filter((e) => e.domain !== domain)
        : [
            {
              name: idea.name,
              domain,
              backstory: idea.backstory,
              ts: Date.now(),
            },
            ...shortlist,
          ],
    );
  };

  const visibleIdeas = styleFilter.size
    ? ideas.filter((i) => styleFilter.has(i.style))
    : ideas;
  const usedStyles = [...new Set(ideas.map((i) => i.style))];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          NameForge
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-black/60 dark:text-white/60">
          Describe your idea. Get clean, available domains — each with a clever
          backstory — vetted live against registries, the App Store, npm &
          the open web.
        </p>
      </header>

      <CheckName tlds={tlds} />

      <ShortlistPanel
        list={shortlist}
        onUpdate={updateShortlist}
        onRemove={(domain) =>
          updateShortlist(shortlist.filter((e) => e.domain !== domain))
        }
      />

      <form
        onSubmit={submit}
        className="mt-8 space-y-4 rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.04] sm:p-6"
      >
        <label className="block">
          <span className="text-sm font-medium">
            What are you building?{" "}
            <span aria-hidden="true" className="text-red-500">
              *
            </span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            aria-required="true"
            rows={3}
            placeholder="A calm, AI-powered journaling app that turns your daily notes into gentle weekly reflections."
            className="mt-1.5 w-full resize-y rounded-lg border border-black/10 bg-white/60 p-3 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <TagInput
            label="Keywords"
            placeholder="journal, calm, reflect"
            tags={keywords}
            setTags={setKeywords}
          />
          <TagInput
            label="Vibes / aesthetic"
            placeholder="minimal, warm, premium"
            tags={vibes}
            setTags={setVibes}
          />
        </div>

        <div>
          <span id="styles-label" className="text-sm font-medium">
            Naming style{" "}
            <span className="text-black/40 dark:text-white/40">
              (optional — empty = surprise me)
            </span>
          </span>
          <div
            role="group"
            aria-labelledby="styles-label"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {STYLE_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleStyle(s.value)}
                aria-pressed={stylePrefs.includes(s.value)}
                className={`rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition ${
                  stylePrefs.includes(s.value)
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-transparent ring-black/10 hover:bg-black/5 dark:ring-white/15 dark:hover:bg-white/5"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span id="app-type-label" className="text-sm font-medium">
              App type
            </span>
            <div
              role="group"
              aria-labelledby="app-type-label"
              className="mt-1.5 flex gap-1.5"
            >
              {APP_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setAppType(t.value)}
                  aria-pressed={appType === t.value}
                  className={`rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition ${
                    appType === t.value
                      ? "bg-indigo-600 text-white ring-indigo-600"
                      : "bg-transparent ring-black/10 hover:bg-black/5 dark:ring-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span id="platforms-label" className="text-sm font-medium">
              Platforms
            </span>
            <div
              role="group"
              aria-labelledby="platforms-label"
              className="mt-1.5 flex gap-1.5"
            >
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  aria-pressed={platforms.includes(p.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition ${
                    platforms.includes(p.value)
                      ? "bg-indigo-600 text-white ring-indigo-600"
                      : "bg-transparent ring-black/10 hover:bg-black/5 dark:ring-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span id="tlds-label" className="text-sm font-medium">
            Domain extensions
          </span>
          <div
            role="group"
            aria-labelledby="tlds-label"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {DEFAULT_TLDS.map((t) => {
              const price = formPricing[t];
              const priceNote = price
                ? ` · ~$${Math.round(price.reg)}/yr${price.renew > price.reg * 1.8 ? ` (renews $${Math.round(price.renew)})` : ""}`
                : "";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTld(t)}
                  title={`${TLD_NOTES[t] ?? ""}${priceNote}`}
                  aria-pressed={tlds.includes(t)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-sm ring-1 ring-inset transition ${
                    tlds.includes(t)
                      ? "bg-black text-white ring-black dark:bg-white dark:text-black dark:ring-white"
                      : "bg-transparent ring-black/10 hover:bg-black/5 dark:ring-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  .{t}
                  {price && (
                    <span className="ml-1 text-[10px] opacity-60">
                      ${Math.round(price.reg)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium">
            Anything to avoid{" "}
            <span className="text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <input
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            placeholder="no -ly / -ify names, nothing that sounds corporate"
            className="mt-1.5 w-full rounded-lg border border-black/10 bg-white/60 p-2.5 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "Forging names…" : "Find my domain"}
        </button>
      </form>

      {(loading || (timeline.length > 0 && !done)) && (
        <div
          role="status"
          className="mt-8 space-y-1 rounded-xl border border-black/10 bg-white/50 p-4 text-sm dark:border-white/10 dark:bg-white/[0.03]"
        >
          {timeline.map((msg, i) => (
            <p
              key={i}
              className={
                i === timeline.length - 1 && loading
                  ? "animate-pulse text-black/70 dark:text-white/70"
                  : "text-black/40 dark:text-white/40"
              }
            >
              {i === timeline.length - 1 && loading ? "● " : "✓ "}
              {msg}
            </p>
          ))}
        </div>
      )}

      {graph && (
        <KeywordGraphView
          graph={graph}
          selected={graphSelected}
          onToggle={(term) =>
            setGraphSelected((cur) => {
              const next = new Set(cur);
              if (next.has(term)) next.delete(term);
              else next.add(term);
              return next;
            })
          }
          onAddTerm={(term) => {
            setGraph((g) =>
              g && !g.nodes.some((n) => n.term === term)
                ? {
                    nodes: [
                      ...g.nodes,
                      { term, kind: "core", note: "added by you", connects: [] },
                    ],
                  }
                : g,
            );
            setGraphSelected((cur) => new Set([...cur, term]));
          }}
          onForge={() =>
            refine({
              focusTerms: [...graphSelected],
              via: `forged from: ${[...graphSelected].join(" + ")}`,
            })
          }
          forging={refining}
        />
      )}

      {ideas.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              {visibleIdeas.length} ideas
              {ideas.some((i) => i.bestAvailable)
                ? " · each has an available domain"
                : " · none came back available — try more extensions"}
              {!done && loading ? " · still working…" : ""}
            </h2>
            {usedStyles.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {usedStyles.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={styleFilter.has(s)}
                    onClick={() =>
                      setStyleFilter((cur) => {
                        const next = new Set(cur);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        return next;
                      })
                    }
                    className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset transition ${
                      styleFilter.has(s)
                        ? "bg-black text-white ring-black dark:bg-white dark:text-black"
                        : "ring-black/15 text-black/50 dark:ring-white/20 dark:text-white/50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="mt-3 space-y-3">
            {visibleIdeas.map((idea, i) => (
              <IdeaCard
                key={idea.name}
                idea={idea}
                rank={i + 1}
                product={{ description, appType, platforms }}
                tldPricing={tldPricing}
                via={idea.via}
                starred={shortlist.some(
                  (e) =>
                    e.domain === (idea.bestAvailable ?? idea.domains[0]?.domain),
                )}
                onStar={() => toggleStar(idea)}
                onMoreLikeThis={() =>
                  refine({
                    seedIdea: {
                      name: idea.name,
                      style: idea.style,
                      backstory: idea.backstory,
                    },
                    via: `in the spirit of: ${idea.name}`,
                  })
                }
              />
            ))}
          </ul>
          <p className="mt-6 text-center text-xs text-black/40 dark:text-white/40">
            &ldquo;Available&rdquo; means registerable at standard price —
            &ldquo;taken&rdquo; domains may still be parked and listed for sale
            at a premium. Always confirm at a registrar before buying. Share
            this brief: the URL now encodes it.
          </p>
        </section>
      )}
    </div>
  );
}

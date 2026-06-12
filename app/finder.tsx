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

/** Workbench toggle button — shared look for all selectable controls. */
function toggleCls(selected: boolean): string {
  return `rounded-[3px] border px-3 py-1.5 text-sm transition ${
    selected
      ? "border-accent bg-accent/10 text-ink"
      : "border-edge bg-well text-ink-dim hover:border-ink-faint hover:text-ink"
  }`;
}

/** Uppercase section label with the workbench's violet required marker. */
function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
      {required && (
        <span aria-hidden="true" className="mr-1 text-accent-ink">
          *
        </span>
      )}
      {children}
      {hint && (
        <span className="ml-2 normal-case tracking-normal text-ink-faint">
          — {hint}
        </span>
      )}
    </span>
  );
}

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
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-[3px] border border-edge bg-well p-2 focus-within:border-accent">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-edge bg-chip px-2 py-0.5 text-sm text-ink"
          >
            {t}
            <button
              type="button"
              onClick={() => setTags(tags.filter((x) => x !== t))}
              className="text-ink-faint transition hover:text-ink"
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
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
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
  const [linkCopied, setLinkCopied] = useState(false);

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

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const visibleIdeas = styleFilter.size
    ? ideas.filter((i) => styleFilter.has(i.style))
    : ideas;
  const usedStyles = [...new Set(ideas.map((i) => i.style))];
  const status = loading
    ? ["FORGING", "text-accent-ink"]
    : error
      ? ["ERROR", "text-bad"]
      : ["READY", "text-ok"];
  const descLines = description.split("\n").length;

  const navItems: { label: string; href: string; active: boolean }[] = [
    { label: "Brief", href: "#brief", active: true },
    { label: "Keyword graph", href: "#graph", active: Boolean(graph) },
    { label: "Results", href: "#results", active: ideas.length > 0 },
    { label: "Shortlist", href: "#shortlist", active: shortlist.length > 0 },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-edge bg-panel/90 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <a href="#brief" className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight">
              voc<span className="text-accent-ink">ari</span>
            </span>
            <span className="hidden rounded-[3px] border border-edge bg-chip px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ink-faint sm:inline">
              v2.0-stable
            </span>
          </a>
          <span
            className={`hidden items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] sm:flex ${status[1]}`}
          >
            ● {status[0]}
          </span>
          <div className="ml-auto">
            <CheckName tlds={tlds} />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-edge bg-panel/50 p-4 lg:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">
            Workbench
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-ink-faint">
            naming engine
          </p>
          <nav className="mt-5 space-y-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.active ? item.href : undefined}
                aria-disabled={!item.active}
                className={`block rounded-[3px] px-2 py-1.5 text-sm transition ${
                  item.active
                    ? "text-ink-dim hover:bg-chip hover:text-ink"
                    : "cursor-default text-ink-faint/60"
                }`}
              >
                <span className="mr-2 text-accent-ink">›</span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={copyShareLink}
              className="w-full rounded-[3px] border border-edge bg-well px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-ink-dim transition hover:border-ink-faint hover:text-ink"
            >
              {linkCopied ? "Copied ✓" : "Copy share link"}
            </button>
            <p className="text-[10px] leading-relaxed text-ink-faint">
              The URL encodes your brief — share it with a cofounder.
            </p>
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
            <header>
              <h1 className="text-2xl font-bold tracking-tight">
                Find a name worth building on
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-ink-dim">
                Clean, available domains with clever backstories — vetted live
                against registries, the App Store, npm & the open web.
              </p>
            </header>

            <ShortlistPanel
              list={shortlist}
              onUpdate={updateShortlist}
              onRemove={(domain) =>
                updateShortlist(shortlist.filter((e) => e.domain !== domain))
              }
            />

            <form
              id="brief"
              onSubmit={submit}
              className="mt-8 scroll-mt-20 space-y-5 rounded-[4px] border border-edge bg-panel p-5 sm:p-6"
            >
              <label className="block">
                <FieldLabel required>What are you building?</FieldLabel>
                <div className="relative mt-1.5">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    aria-required="true"
                    rows={4}
                    placeholder="A calm, AI-powered journaling app that turns your daily notes into gentle weekly reflections."
                    className="w-full resize-y rounded-[3px] border border-edge bg-well p-3 pb-7 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                  />
                  <div className="pointer-events-none absolute bottom-2.5 right-2 flex gap-1">
                    <span className="rounded-[2px] border border-edge-soft bg-chip px-1.5 py-px text-[9px] uppercase tracking-wider text-ink-faint">
                      ln: {descLines}
                    </span>
                    <span className="rounded-[2px] border border-edge-soft bg-chip px-1.5 py-px text-[9px] uppercase tracking-wider text-ink-faint">
                      utf-8
                    </span>
                  </div>
                </div>
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

              <div className="rounded-[3px] border border-edge-soft bg-well/50 p-4">
                <span id="styles-label">
                  <FieldLabel hint="optional, empty = surprise me">
                    Naming style
                  </FieldLabel>
                </span>
                <div
                  role="group"
                  aria-labelledby="styles-label"
                  className="mt-2 flex flex-wrap gap-1.5"
                >
                  {STYLE_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleStyle(s.value)}
                      aria-pressed={stylePrefs.includes(s.value)}
                      className={toggleCls(stylePrefs.includes(s.value))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span id="app-type-label">
                    <FieldLabel>App type</FieldLabel>
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
                        className={toggleCls(appType === t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span id="platforms-label">
                    <FieldLabel>Platforms</FieldLabel>
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
                        className={toggleCls(platforms.includes(p.value))}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span id="tlds-label">
                  <FieldLabel>Domain extensions</FieldLabel>
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
                        className={toggleCls(tlds.includes(t))}
                      >
                        .{t}
                        {price && (
                          <span className="ml-1.5 text-[10px] text-ink-faint">
                            ${Math.round(price.reg)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <FieldLabel hint="optional">Anything to avoid</FieldLabel>
                <input
                  value={avoid}
                  onChange={(e) => setAvoid(e.target.value)}
                  placeholder="no -ly / -ify names, nothing that sounds corporate"
                  className="mt-1.5 w-full rounded-[3px] border border-edge bg-well p-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-bad">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[3px] bg-accent py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:bg-accent-hi disabled:opacity-60"
              >
                {loading ? "Forging…" : "Forge names"}
              </button>
            </form>

            {(loading || (timeline.length > 0 && !done)) && (
              <div
                role="status"
                className="mt-8 space-y-1 rounded-[4px] border border-edge bg-well p-4 text-sm"
              >
                {timeline.map((msg, i) => {
                  const active = i === timeline.length - 1 && loading;
                  return (
                    <p
                      key={i}
                      className={active ? "text-ink" : "text-ink-faint"}
                    >
                      <span className={active ? "text-accent-ink" : "text-ok"}>
                        {active ? "›" : "✓"}
                      </span>{" "}
                      {msg}
                      {active && <span className="animate-pulse">▮</span>}
                    </p>
                  );
                })}
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
                            {
                              term,
                              kind: "core",
                              note: "added by you",
                              connects: [],
                            },
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
              <section id="results" className="mt-8 scroll-mt-20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
                    {visibleIdeas.length} ideas
                    {ideas.some((i) => i.bestAvailable)
                      ? " — each has an available domain"
                      : " — none came back available, try more extensions"}
                    {!done && loading ? " — still working…" : ""}
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
                          className={`rounded-[3px] border px-2 py-0.5 text-xs transition ${
                            styleFilter.has(s)
                              ? "border-accent bg-accent/10 text-ink"
                              : "border-edge text-ink-faint hover:text-ink-dim"
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
                          e.domain ===
                          (idea.bestAvailable ?? idea.domains[0]?.domain),
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
                <p className="mt-6 text-center text-xs text-ink-faint">
                  &ldquo;Available&rdquo; means registerable at standard price
                  — &ldquo;taken&rdquo; domains may still be parked and listed
                  for sale at a premium. Always confirm at a registrar before
                  buying.
                </p>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

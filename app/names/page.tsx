import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_PAGES, NAME_PAGES } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: { absolute: "Naming guides for developers · Vocari" },
  description:
    "How to name a CLI tool, npm or Python package, open source project, SaaS, AI startup or app, with available domains and handles checked live.",
  alternates: { canonical: "/names" },
};

export default function NamesIndex() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
        <Link href="/" className="text-xs text-ink-faint transition hover:text-ink-dim">
          ← vocari.dev
        </Link>
        <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Naming guides for developers
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-dim">
          What makes a good name for each kind of project, real examples that got it
          right, and a generator that only shows names you can actually register.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {NAME_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/names/${p.slug}`}
                className="block h-full rounded-[4px] border border-edge bg-panel p-4 transition hover:border-accent/60"
              >
                <span className="text-sm font-semibold text-ink">{p.h1}</span>
                <span className="mt-1 block text-xs text-ink-faint">{p.keyword}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-12 text-xl font-bold tracking-tight">Comparisons</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {COMPARE_PAGES.map((c) => (
            <li key={c.slug}>
              <Link href={`/compare/${c.slug}`} className="text-accent-ink hover:text-accent-hi">
                {c.h1}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

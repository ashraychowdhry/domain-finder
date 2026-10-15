import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPARE_PAGES, REVIEWED, comparePage } from "@/lib/seo-pages";

// "Vocari vs X" pages for high-intent "X alternative" searches. Keep them
// fair: say where the other tool is the better pick.

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const page = comparePage((await params).slug);
  if (!page) return {};
  const title = `${page.h1}: which name generator fits a developer product?`;
  return {
    title: { absolute: `${title} · Vocari` },
    description: page.description,
    alternates: { canonical: `/compare/${page.slug}` },
    openGraph: {
      type: "article",
      url: `https://vocari.dev/compare/${page.slug}`,
      siteName: "Vocari",
      title,
      description: page.description,
    },
  };
}

export default async function ComparePageView({ params }: Props) {
  const page = comparePage((await params).slug);
  if (!page) notFound();
  const others = COMPARE_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
        <nav className="text-xs text-ink-faint">
          <Link href="/" className="transition hover:text-ink-dim">
            vocari.dev
          </Link>{" "}
          /{" "}
          <Link href="/names" className="transition hover:text-ink-dim">
            guides
          </Link>
        </nav>

        <header className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-ink">
            {page.rival} alternative
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {page.h1}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">{page.summary}</p>
        </header>

        <div className="mt-8 overflow-x-auto rounded-[4px] border border-edge">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              <tr>
                <th className="p-3 font-semibold" />
                <th className="p-3 font-semibold text-accent-ink">Vocari</th>
                <th className="p-3 font-semibold">{page.rival}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-soft">
              {page.rows.map((r) => (
                <tr key={r.label}>
                  <td className="p-3 text-ink">{r.label}</td>
                  <td className="p-3 text-ink-dim">{r.vocari}</td>
                  <td className="p-3 text-ink-dim">{r.rival}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Based on what each tool advertises as of {REVIEWED}. Spotted something out of
          date? Tell us and we&apos;ll fix it.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <section className="rounded-[4px] border border-accent/30 bg-accent/5 p-4">
            <h2 className="text-sm font-semibold text-ink">Pick Vocari if</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-dim">
              {page.chooseVocari.map((c) => (
                <li key={c}>+ {c}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-[4px] border border-edge bg-panel p-4">
            <h2 className="text-sm font-semibold text-ink">
              Pick{" "}
              <a href={page.rivalUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-edge">
                {page.rival}
              </a>{" "}
              if
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-dim">
              {page.chooseRival.map((c) => (
                <li key={c}>+ {c}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-10 text-center">
          <Link
            href="/"
            className="inline-block rounded-[3px] bg-accent px-5 py-2.5 text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:bg-accent-hi"
          >
            Try Vocari free →
          </Link>
          <p className="mt-2 text-xs text-ink-faint">No signup. Names with available domains in about 20 seconds.</p>
        </section>

        <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-edge pt-6 text-xs text-ink-faint">
          {others.map((c) => (
            <Link key={c.slug} href={`/compare/${c.slug}`} className="underline decoration-edge hover:text-ink-dim">
              {c.h1}
            </Link>
          ))}
          <Link href="/names" className="underline decoration-edge hover:text-ink-dim">
            Naming guides
          </Link>
        </footer>
      </div>
    </main>
  );
}

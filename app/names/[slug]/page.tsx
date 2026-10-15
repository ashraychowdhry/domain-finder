import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPARE_PAGES, NAME_PAGES, briefLink, namePage } from "@/lib/seo-pages";

// Developer long-tail landing pages ("CLI tool name generator", "npm package
// name checker", …). Static and indexable; the CTA prefills the live tool.

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return NAME_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const page = namePage((await params).slug);
  if (!page) return {};
  const title = `${page.keyword.replace(/^./, (c) => c.toUpperCase())}: available names, checked live`;
  return {
    title: { absolute: `${title} · Vocari` },
    description: page.description,
    alternates: { canonical: `/names/${page.slug}` },
    openGraph: {
      type: "article",
      url: `https://vocari.dev/names/${page.slug}`,
      siteName: "Vocari",
      title,
      description: page.description,
    },
  };
}

export default async function NamePageView({ params }: Props) {
  const page = namePage((await params).slug);
  if (!page) notFound();

  const tryHref = briefLink(page.brief, page.keywords, page.appType);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const related = NAME_PAGES.filter((p) => p.slug !== page.slug).slice(0, 6);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
        <nav className="text-xs text-ink-faint">
          <Link href="/" className="transition hover:text-ink-dim">
            vocari.dev
          </Link>{" "}
          /{" "}
          <Link href="/names" className="transition hover:text-ink-dim">
            names
          </Link>
        </nav>

        <header className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-ink">
            {page.keyword}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {page.h1}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">{page.intro}</p>
          <Link
            href={tryHref}
            className="mt-5 inline-block rounded-[3px] bg-accent px-5 py-2.5 text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:bg-accent-hi"
          >
            Generate names free →
          </Link>
          <p className="mt-2 text-xs text-ink-faint">
            Opens the generator with a starter brief. Finish the sentence and hit go.
          </p>
        </header>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight">What makes a good name here</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {page.tips.map((t) => (
              <li key={t.title} className="rounded-[4px] border border-edge bg-panel p-4">
                <h3 className="text-sm font-semibold text-ink">{t.title}</h3>
                <p className="mt-1 text-sm text-ink-dim">{t.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight">Names that got it right</h2>
          <ul className="mt-4 divide-y divide-edge-soft rounded-[4px] border border-edge bg-panel">
            {page.examples.map((e) => (
              <li key={e.name} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
                <span className="w-32 shrink-0 font-bold text-ink">{e.name}</span>
                <span className="text-sm text-ink-dim">{e.why}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-[4px] border border-accent/30 bg-accent/5 p-6">
          <h2 className="text-lg font-bold tracking-tight">What Vocari checks for you</h2>
          <p className="mt-1 text-sm text-ink-dim">
            Every suggestion already has a domain you can register. Open the handles &amp;
            trademarks panel on any name to check the rest:
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {page.checks.map((c) => (
              <li
                key={c}
                className="rounded-[3px] border border-edge bg-well px-2 py-0.5 text-xs text-ink-dim"
              >
                {c}
              </li>
            ))}
          </ul>
          <Link
            href={tryHref}
            className="mt-4 inline-block text-sm font-semibold text-accent-ink transition hover:text-accent-hi"
          >
            Try it on your idea →
          </Link>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight">Questions</h2>
          <dl className="mt-4 divide-y divide-edge-soft">
            {page.faq.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="text-sm font-semibold text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-sm text-ink-dim">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-12 border-t border-edge pt-6 text-xs text-ink-faint">
          <p>More naming guides</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {related.map((p) => (
              <Link key={p.slug} href={`/names/${p.slug}`} className="underline decoration-edge hover:text-ink-dim">
                {p.h1}
              </Link>
            ))}
          </p>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            {COMPARE_PAGES.map((c) => (
              <Link key={c.slug} href={`/compare/${c.slug}`} className="underline decoration-edge hover:text-ink-dim">
                {c.h1}
              </Link>
            ))}
            <Link href="/graveyard" className="underline decoration-edge hover:text-ink-dim">
              The Startup Graveyard
            </Link>
          </p>
        </footer>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </main>
  );
}

// Server-rendered SEO content below the tool: an indexable "How it works"
// section + FAQ targeting real search queries, plus FAQPage structured data
// for rich results. No "use client" — stays out of the client bundle and is
// always present in the server HTML.

import { emailCheckout } from "@/lib/registrars";

const STEPS: {
  n: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}[] = [
  {
    n: "01",
    title: "Describe what you're building",
    body: "A sentence about your product, plus optional keywords, vibe, and the domain extensions you'd consider (.com, .io, .ai, .dev, and more).",
  },
  {
    n: "02",
    title: "Get brandable, available names",
    body: "An AI naming engine proposes short, memorable names — each with a backstory — and the closed availability loop checks every name against the domain registries in real time, so you only ever see domains you can actually register.",
  },
  {
    n: "03",
    title: "See the SEO & collision risk",
    body: "Every name is screened against the App Store, npm, PyPI, Wikipedia and the open web, then ranked by a judge model, so you don't pick a name a bigger product already owns and outranks.",
  },
  {
    n: "04",
    title: "Register it — then get email to match",
    body: "Click any available domain to register it at your chosen registrar, compare prices, or shortlist it and re-check later. Then set up professional email at your new domain (you@yourname.com) so your brand looks the part from day one.",
    cta: { label: "Get professional email →", href: emailCheckout().href },
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I find an available domain name?",
    a: "Describe your product in Vocari. It generates brandable name ideas and checks each one's availability live against the domain registries (via DNS and each registry's authoritative RDAP endpoint), so it only shows you domains that are actually registerable right now.",
  },
  {
    q: "Is Vocari free to use?",
    a: "Yes. Vocari is free — describe your idea and get available domain name ideas with live availability and SEO screening at no cost.",
  },
  {
    q: "What makes a good domain name for a startup or app?",
    a: "A good domain name is short, easy to say and spell, memorable, and distinctive enough that a larger company isn't already ranking for it. Vocari screens generated names for pronounceability, brand confusables, and search-engine and app-store collisions so the names it surfaces score well on all of these.",
  },
  {
    q: "How does Vocari check if a domain is available?",
    a: "It queries DNS-over-HTTPS first, then confirms against each registry's official RDAP endpoint (Verisign for .com, Identity Digital for .io/.ai, Google Registry for .app/.dev, and others). Results reflect what is genuinely registerable, and parked or for-sale domains are flagged.",
  },
  {
    q: "Which domain extensions does it support?",
    a: "Vocari checks .com, .io, .ai, .app, .dev, .co, .xyz, .so, .me and net, and shows live registrar pricing including renewal-trap warnings so you know the real cost.",
  },
  {
    q: "Can I check a domain name I already have in mind?",
    a: "Yes. Use the “Check domain” box at the top to instantly check any name across all supported extensions, with no AI generation needed.",
  },
  {
    q: "Can I get professional email at my own domain?",
    a: "Yes. Once you register a domain you can add professional email (you@yourname.com) at your registrar. Vocari links each available name straight to Spaceship's Spacemail, which adds custom-domain email with encryption, a calendar, and one-tap DNS setup from $0.59/mo — so your brand has a matching inbox from day one.",
  },
  {
    q: "Does Vocari check for trademark or brand conflicts?",
    a: "It screens each name against the iTunes App Store, npm, PyPI, Wikipedia and the open web, flags collisions by severity, and links to a prefilled USPTO trademark search. It is a strong first-pass signal, not legal clearance.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function SeoContent() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-edge bg-bg">
      <div className="mx-auto w-full max-w-3xl px-4 py-14">
        <h2 className="text-xl font-bold tracking-tight text-ink">
          How Vocari finds available domain names
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-dim">
          Vocari is an AI domain name generator built for developers and
          founders. Instead of suggesting names that turn out to be taken, it
          checks availability live and only shows domains you can register.
        </p>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-[4px] border border-edge bg-panel p-4"
            >
              <div className="font-mono text-xs text-accent-ink">{s.n}</div>
              <h3 className="mt-1 text-sm font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-dim">{s.body}</p>
              {s.cta && (
                <a
                  href={s.cta.href}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-2 inline-block text-xs font-semibold text-accent-ink transition hover:text-accent-hi"
                >
                  {s.cta.label}
                </a>
              )}
            </li>
          ))}
        </ol>

        <h2 className="mt-12 text-xl font-bold tracking-tight text-ink">
          Frequently asked questions
        </h2>
        <dl className="mt-4 divide-y divide-edge-soft">
          {FAQ.map((f) => (
            <div key={f.q} className="py-4">
              <dt className="text-sm font-semibold text-ink">{f.q}</dt>
              <dd className="mt-1.5 text-sm text-ink-dim">{f.a}</dd>
            </div>
          ))}
        </dl>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-6 text-xs text-ink-faint">
          <span>
            voc<span className="text-accent-ink">ari</span> — free AI domain
            name generator
          </span>
          <span>Available domains, checked live. No paywall.</span>
        </footer>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </section>
  );
}

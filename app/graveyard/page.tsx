import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_TLDS } from "@/lib/tlds";

// "Rename the Graveyard" — a launch/earned-media page. Every dead startup gets a
// craft roast of its ORIGINAL name plus a brandable replacement whose domain we
// verified is actually registrable (DNS/RDAP, same signal the tool uses). Each
// card's CTA prefills the live tool with that company's brief (?b=), so a visitor
// can watch Vocari name it for real. Static + indexable for the SEO tail.

interface Grave {
  company: string;
  era: string;
  wasA: string;
  roast: string;
  domain: string; // verified available
  brief: string; // prefills the tool
}

const GRAVES: Grave[] = [
  {
    company: "Quibi",
    era: "flamed out 2020, six months in",
    wasA: "short-form mobile video streaming app",
    roast:
      "A “quick bites” portmanteau that keeps the awkwardness of both words and the meaning of neither — it reads like a typo, rhymes with nothing, and dies in the mouth like the yawn it sounds like.",
    domain: "vireo.tv",
    brief:
      "A mobile app streaming premium, professionally-made shows in ten-minute vertical chapters.",
  },
  {
    company: "Theranos",
    era: "dissolved 2018",
    wasA: "finger-prick consumer blood-testing startup",
    roast:
      "A weld of “therapy” and “diagnosis” so clinical it lands like a Greek Titan — four syllables nobody spells right the first try, and a name that now collides head-on with a Marvel villain.",
    domain: "veyra.so",
    brief:
      "Consumer blood diagnostics promising a full lab panel from a single finger-prick.",
  },
  {
    company: "MoviePass",
    era: "shut down 2019, bankrupt 2020",
    wasA: "unlimited movie-theater subscription",
    roast:
      "Two dictionary words bolted into a category label instead of a brand — so literal it doubles as its own tagline, and “pass” turned out to be exactly what the market did.",
    domain: "cinea.club",
    brief:
      "A monthly membership that lets subscribers see unlimited movies in theaters.",
  },
  {
    company: "Juicero",
    era: "shut down 2017",
    wasA: "$700 Wi-Fi cold-press juicer",
    roast:
      "Bolts a telenovela “-ero” onto the word “juice” to sell artisanal machismo — it sounds like a luchador or a taco truck, not a $700 countertop appliance, and the spare syllable adds cost without ever adding flavor.",
    domain: "pressly.so",
    brief:
      "A Wi-Fi-connected cold-press juicer that squeezes single-serve produce packs into juice.",
  },
  {
    company: "Pets.com",
    era: "shut down 2000",
    wasA: "online pet-supply store",
    roast:
      "A generic plural noun bolted straight onto its own TLD — a URL where a brand should be, so when the .com went dark there was nothing left to say.",
    domain: "nuzzle.so",
    brief: "Doorstep delivery of pet food and supplies.",
  },
  {
    company: "Vine",
    era: "shut down 2017",
    wasA: "six-second looping video app",
    roast:
      "A single common noun nobody can own in search — it evokes fast, tangled growth and, just as readily, the thing that withers on the trellis the moment no one waters it.",
    domain: "loopa.tv",
    brief: "An app for recording and sharing six-second looping videos.",
  },
  {
    company: "Webvan",
    era: "flamed out 2001",
    wasA: "online grocery delivery",
    roast:
      "Welds the most disposable prefix of the dot-com era onto a delivery “van” — a name that timestamps itself to 1999 and marries a futuristic promise to the least glamorous vehicle on the road.",
    domain: "larder.so",
    brief:
      "On-demand home delivery of groceries within a customer-chosen time window.",
  },
  {
    company: "Boo.com",
    era: "collapsed 2000",
    wasA: "online luxury fashion retailer",
    roast:
      "A luxury fashion label named after the noise a crowd makes when it wants you off the stage — two-thirds vowel and one hundred percent jeer.",
    domain: "aurel.so",
    brief: "An online store for curated designer fashion.",
  },
  {
    company: "Jawbone",
    era: "liquidated 2017",
    wasA: "fitness trackers & Bluetooth speakers",
    roast:
      "Names a fitness wearable after a skull bone — it conjures a skeleton or a caveman’s club long before it suggests a single step, and that morbid anatomy had to stretch across earpieces, speakers, and wristbands alike.",
    domain: "strida.fit",
    brief:
      "Wearable fitness bands and portable Bluetooth speakers for everyday health and audio.",
  },
  {
    company: "Yik Yak",
    era: "shut down 2017",
    wasA: "anonymous, location-based message board",
    roast:
      "A reduplicated onomatopoeia for idle chatter — the name literally evokes “meaningless noise,” and doubling the syllable only doubles the promise of nothing worth reading.",
    domain: "vicina.app",
    brief:
      "An anonymous, location-based feed where you post and vote on messages from people within a few miles.",
  },
  {
    company: "Rdio",
    era: "shut down 2015",
    wasA: "on-demand music streaming, a Spotify rival",
    roast:
      "“Radio” with the vowels surgically removed, leaving a word no one can pronounce on sight — fatal for a music service you’re supposed to recommend out loud.",
    domain: "audra.so",
    brief:
      "An on-demand music streaming service with a full catalog you can play, save, and share on any device.",
  },
  {
    company: "Quirky",
    era: "bankrupt 2015",
    wasA: "crowdsourced invention platform",
    roast:
      "An adjective meaning “oddly unreliable,” so the brand promised eccentric products of uncertain quality right on the tin — a rare name that delivered exactly, and only, what it warned you about.",
    domain: "inventa.so",
    brief:
      "A crowdsourced invention platform that designs, manufactures, and sells product ideas submitted by its community.",
  },
];

// Prefill the tool with a company's brief (mirrors finder.tsx encodeBrief, but
// URL-encoded so base64 "+" survives the query string).
function tryLink(brief: string): string {
  const b = { d: brief, k: [], v: [], a: "web", p: ["web"], t: [...DEFAULT_TLDS], av: "", s: [] };
  const b64 = Buffer.from(JSON.stringify(b), "utf8").toString("base64");
  return `/?b=${encodeURIComponent(b64)}`;
}

const TOP3 = GRAVES.slice(0, 3).map((g) => g.domain).join("|");

export const metadata: Metadata = {
  title: { absolute: "The Startup Graveyard — renamed by Vocari" },
  description:
    "Twelve famous startups that died with the wrong name. We ran each through Vocari — here's the brandable replacement whose domain is still available.",
  alternates: { canonical: "/graveyard" },
  openGraph: {
    type: "article",
    url: "https://vocari.dev/graveyard",
    siteName: "Vocari",
    title: "The Startup Graveyard — renamed by Vocari",
    description:
      "12 dead startups, re-named. Each replacement's domain is actually available.",
    images: [{ url: `/og?s=${encodeURIComponent(TOP3)}&n=12`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Startup Graveyard — renamed by Vocari",
    description:
      "12 dead startups, re-named. Each replacement's domain is actually available.",
    images: [`/og?s=${encodeURIComponent(TOP3)}&n=12`],
  },
};

function Tombstone({ g }: { g: Grave }) {
  const [name, tld] = [g.domain.slice(0, g.domain.lastIndexOf(".")), g.domain.slice(g.domain.lastIndexOf("."))];
  return (
    <li className="rounded-[4px] border border-edge bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold tracking-tight text-ink-dim line-through decoration-bad/60">
          {g.company}
        </h2>
        <span className="rounded-[3px] border border-edge bg-chip px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ink-faint">
          † {g.era}
        </span>
        <span className="text-xs text-ink-faint">{g.wasA}</span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-accent-ink">
          judge:
        </span>
        {g.roast}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-edge-soft bg-well px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.15em] text-ink-faint">
            Vocari would call it
          </span>
          <span className="mt-0.5 text-2xl font-bold tracking-tight">
            <span className="text-ink">{name}</span>
            <span className="text-ink-faint">{tld}</span>
            <span className="ml-2 align-middle text-xs font-normal text-ok">● available</span>
          </span>
        </div>
        <Link
          href={tryLink(g.brief)}
          className="rounded-[3px] border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:border-accent hover:bg-accent/20"
        >
          name it yourself →
        </Link>
      </div>
    </li>
  );
}

export default function Graveyard() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
        <Link href="/" className="text-xs text-ink-faint transition hover:text-ink-dim">
          ← vocari.dev
        </Link>

        <header className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-ink">
            The Startup Graveyard
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Twelve startups that died with the wrong name.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-dim">
            We fed each one to Vocari&apos;s naming engine. Here&apos;s the
            brandable replacement it would suggest — and, because that&apos;s the
            whole point, every one of these domains is{" "}
            <span className="text-ok">actually still available</span>.
          </p>
        </header>

        <ol className="mt-8 space-y-3">
          {GRAVES.map((g) => (
            <Tombstone key={g.company} g={g} />
          ))}
        </ol>

        <section className="mt-10 rounded-[4px] border border-accent/30 bg-accent/5 p-6 text-center">
          <p className="text-lg font-bold tracking-tight text-ink">
            Naming yours? Don&apos;t end up here.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
            Describe your idea and get brandable names whose domains are actually
            free — checked live, in ~20 seconds. No signup.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-[3px] bg-accent px-5 py-2.5 text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:bg-accent-hi"
          >
            Name yours free →
          </Link>
          <p className="mt-4 text-xs text-ink-faint">
            Think we missed one? Reply on the thread with a dead startup and
            we&apos;ll name its ghost.
          </p>
        </section>
      </div>
    </main>
  );
}

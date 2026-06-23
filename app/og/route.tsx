import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import type { NextRequest } from "next/server";

// Dynamic social-share card. The home page's generateMetadata points og:image
// here with ?s=<top-3 "name.tld" joined by "|">&n=<total available>, so a
// shared link unfurls as the recipient's ACTUAL generated names (the #r=
// fragment that carries full results is client-only and never reaches a
// crawler). No params → the default "what is vocari" card.
export const runtime = "nodejs";

const SIZE = { width: 1200, height: 630 };

// Technical Workbench palette (mirrors globals.css).
const C = {
  bg: "#0b0b0e",
  panel: "#121217",
  well: "#0e0e12",
  edge: "#2a2a33",
  ink: "#e8e8ec",
  dim: "#9a9aa3",
  faint: "#62626d",
  accentHi: "#8d70ff",
  accentInk: "#a78bfa",
  ok: "#34d399",
};

// Parse + sanitize the top-3 domains (a crafted ?s= can't inject markup).
function parseDomains(s: string | null): { name: string; tld: string }[] {
  if (!s) return [];
  return s
    .split("|")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9-]{1,40}\.[a-z]{2,24}$/.test(d))
    .slice(0, 3)
    .map((d) => {
      const i = d.lastIndexOf(".");
      return { name: d.slice(0, i), tld: d.slice(i) };
    });
}

async function loadFonts() {
  try {
    const dir = join(process.cwd(), "app/og/fonts");
    const [r, b] = await Promise.all([
      readFile(join(dir, "GeistMono-400.ttf")),
      readFile(join(dir, "GeistMono-700.ttf")),
    ]);
    return [
      { name: "Geist Mono", data: r, weight: 400 as const, style: "normal" as const },
      { name: "Geist Mono", data: b, weight: 700 as const, style: "normal" as const },
    ];
  } catch {
    return undefined; // built-in font fallback — the design is glyph-safe
  }
}

// A CSS-drawn dot (no glyph dependency, so it survives a font subset miss).
function Dot({ color, size = 16 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: size, background: color, display: "flex" }} />;
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: C.panel,
          border: `2px solid ${C.edge}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.accentHi,
          fontSize: 38,
          fontWeight: 700,
        }}
      >
        V
      </div>
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
        <span style={{ color: C.ink }}>voc</span>
        <span style={{ color: C.accentInk }}>ari</span>
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: C.bg,
        color: C.ink,
        fontFamily: "Geist Mono, monospace",
      }}
    >
      {children}
    </div>
  );
}

function NamesCard({ domains, more }: { domains: { name: string; tld: string }[]; more: number }) {
  // Shrink the type for longer domains so a long name never overflows the card.
  const longest = Math.max(...domains.map((d) => d.name.length + d.tld.length));
  const fs = longest > 20 ? 50 : longest > 15 ? 58 : 64;
  return (
    <Frame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 18px",
            borderRadius: 8,
            border: `1px solid ${C.edge}`,
            background: C.well,
          }}
        >
          <Dot color={C.ok} size={13} />
          <span style={{ fontSize: 22, color: C.ok, letterSpacing: 1 }}>AVAILABLE NOW</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {domains.map((d) => (
          <div key={d.name + d.tld} style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <Dot color={C.ok} />
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: fs, fontWeight: 700, color: C.ink, letterSpacing: -2 }}>{d.name}</span>
              <span style={{ fontSize: fs, fontWeight: 700, color: C.faint, letterSpacing: -2 }}>{d.tld}</span>
            </div>
          </div>
        ))}
        {more > 0 && <span style={{ fontSize: 26, color: C.dim, marginLeft: 42 }}>+{more} more available</span>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: C.ink }}>name yours free</span>
        <span style={{ fontSize: 30, fontWeight: 700, color: C.accentInk }}>vocari.dev</span>
      </div>
    </Frame>
  );
}

function DefaultCard() {
  return (
    <Frame>
      <Wordmark />
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.2, letterSpacing: -1, maxWidth: 1000 }}>
          The AI domain name generator that only shows you available domains.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Dot color={C.ok} />
          <span style={{ fontSize: 28, color: C.ok }}>Brandable names · live availability · brand-collision checks</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 26, color: C.dim }}>Free · no signup · results in ~20s</span>
        <span style={{ fontSize: 28, color: C.accentInk, fontWeight: 700 }}>vocari.dev</span>
      </div>
    </Frame>
  );
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const domains = parseDomains(sp.get("s"));
    const nRaw = Number.parseInt(sp.get("n") ?? "", 10);
    const total = Number.isFinite(nRaw) ? Math.max(nRaw, domains.length) : domains.length;
    const fonts = await loadFonts();
    return new ImageResponse(
      domains.length ? (
        <NamesCard domains={domains} more={Math.max(0, total - domains.length)} />
      ) : (
        <DefaultCard />
      ),
      {
        ...SIZE,
        fonts,
        headers: {
          "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return new Response("failed to render image", { status: 500 });
  }
}

import type { Metadata } from "next";
import Finder from "./finder";
import { SeoContent } from "./components/seo-content";

// A shared link carries ?s=<top-3 "name.tld" joined by "|">&n=<total available>
// so its OG card (app/og/route.tsx) unfurls as the recipient's ACTUAL names.
// With no params the page inherits the layout's default OG card.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const s = typeof sp.s === "string" ? sp.s : undefined;
  if (!s) return {};

  const n = typeof sp.n === "string" ? sp.n : undefined;
  const names = s
    .split("|")
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 3);
  const ogUrl = `/og?s=${encodeURIComponent(s)}${n ? `&n=${encodeURIComponent(n)}` : ""}`;
  const title = names.length ? `${names.join(" · ")} — all available` : "Vocari";
  const description =
    "Brandable startup names with domains that are actually available, generated free by Vocari. Make your own in ~20s.";

  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      url: "https://vocari.dev",
      siteName: "Vocari",
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogUrl] },
  };
}

export default function Home() {
  return (
    <>
      <Finder />
      <SeoContent />
    </>
  );
}

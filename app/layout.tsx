import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "https://vocari.dev";
// Kept under ~155 chars so Google shows the full snippet without truncating.
const DESCRIPTION =
  "Free AI domain name generator for developers and founders — describe your idea and get brandable, available domains, checked live against the registries.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Vocari — AI Domain Name Generator & Availability Finder",
    template: "%s · Vocari",
  },
  description: DESCRIPTION,
  applicationName: "Vocari",
  keywords: [
    "domain name generator",
    "AI domain name generator",
    "available domain names",
    "domain name ideas",
    "startup name generator",
    "business name generator",
    "domain availability checker",
    "brandable domain names",
    "available .com domains",
    "app name generator",
  ],
  authors: [{ name: "Vocari" }],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Vocari",
    title: "Vocari — AI Domain Name Generator for Developers",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Vocari — AI Domain Name Generator for Developers",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Vocari",
  url: SITE,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Impact partner tag (account 7412606) — verifies the site for
            affiliate programs and transformLinks rewrites any stray raw
            approved-merchant links (e.g. spaceship.com) into tracked clicks.
            Our explicit spaceship.sjv.io links are already tracked, so the tag
            skips them (no double-count) — it's just the backstop. */}
        <Script id="impact-utt" strategy="beforeInteractive">
          {`(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7412606-1ab8-4471-84ca-d0ed8f79db7b1.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');`}
        </Script>
      </body>
    </html>
  );
}

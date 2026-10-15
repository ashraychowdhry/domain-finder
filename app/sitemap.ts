import type { MetadataRoute } from "next";
import { COMPARE_PAGES, NAME_PAGES } from "@/lib/seo-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://vocari.dev",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://vocari.dev/graveyard",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://vocari.dev/names",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...NAME_PAGES.map((p) => ({
      url: `https://vocari.dev/names/${p.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...COMPARE_PAGES.map((p) => ({
      url: `https://vocari.dev/compare/${p.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}

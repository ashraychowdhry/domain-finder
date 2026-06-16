import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // API routes are POST-only app endpoints, not content to index.
      disallow: "/api/",
    },
    sitemap: "https://vocari.dev/sitemap.xml",
    host: "https://vocari.dev",
  };
}

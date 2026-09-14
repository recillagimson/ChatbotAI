import type { MetadataRoute } from "next";

// sitemap.xml, emitted by Next's metadata route. Lists ONLY the public,
// indexable URLs: the landing page and the six legal pages. NEVER add an
// (auth)/(dashboard)/(admin)/api path here - those are private tenant surfaces
// and must not be advertised to search engines.
const BASE = "https://www.speedsettr.com";

const PUBLIC_PATHS = [
  "/",
  "/accessibility",
  "/advertising-disclosure",
  "/disclaimer",
  "/privacy",
  "/refund-policy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "yearly",
    priority: path === "/" ? 1 : 0.4,
  }));
}

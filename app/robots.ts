import type { MetadataRoute } from "next";

// robots.txt, emitted by Next's metadata route. The public marketing + legal
// pages are crawlable; the authenticated app surface and the API only ever
// redirect anonymous requests to /login, so we Disallow their roots to keep
// crawl budget on the pages that matter. Disallow here is crawl-budget hygiene,
// NOT the de-index guard - the (auth)/(dashboard)/(admin) route-group layouts
// each carry `robots: { index: false }`, which is what actually keeps those
// pages out of the index (a Disallowed URL can still be indexed from a backlink;
// a noindex one cannot). Do NOT add /login or /signup here - Disallowing them
// would stop Google from ever seeing their noindex tag.
const BASE = "https://www.speedsettr.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/conversations",
        "/knowledge-base",
        "/settings",
        "/billing",
        "/onboarding",
        "/chatbots",
        "/follow-ups",
        "/statistics",
        "/requests",
        "/feedback",
        "/learn",
        "/api",
      ],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}

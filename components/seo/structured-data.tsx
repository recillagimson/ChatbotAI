import { COMPANY } from "@/lib/company";
import { PRICING, PLAN_NAME, PLAN_FEATURES, PLAN_TAGLINE } from "@/lib/pricing";
import { FAQS } from "@/components/landing/faq";

/**
 * JSON-LD structured data for the public landing page.
 *
 * Every value is pulled from the existing single-source-of-truth modules
 * (lib/company, lib/pricing, components/landing/faq) so the markup can never
 * drift from what the page actually renders. Deliberately emits NO
 * aggregateRating/review: there is no structured review data on the site, and
 * fabricating a rating is a Google structured-data policy violation.
 */
const BASE = "https://www.speedsettr.com";

// The office address is a single display string in lib/company (kept as-is for
// the footer); its parsed parts live here for the PostalAddress node. 10003 is
// Manhattan, so the region is NY.
const ADDRESS = {
  streetAddress: "231 East 5th St",
  addressLocality: "New York",
  addressRegion: "NY",
  postalCode: "10003",
  addressCountry: "US",
} as const;

function buildGraph() {
  const organization = {
    "@type": "Organization",
    "@id": `${BASE}/#org`,
    name: COMPANY.name,
    alternateName: "SpeedSettr",
    url: BASE,
    logo: `${BASE}/icon.svg`,
    email: COMPANY.email,
    telephone: COMPANY.phones.map((p) => p.tel),
    address: { "@type": "PostalAddress", ...ADDRESS },
    contactPoint: COMPANY.phones.map((p) => ({
      "@type": "ContactPoint",
      telephone: p.tel,
      contactType: "customer service",
      email: COMPANY.email,
      areaServed: "US",
      availableLanguage: "en",
    })),
    // sameAs intentionally omitted until the owner supplies public social
    // profile URLs - listing none is better than guessing wrong ones.
  };

  const website = {
    "@type": "WebSite",
    "@id": `${BASE}/#website`,
    url: BASE,
    name: "SpeedSettr",
    publisher: { "@id": `${BASE}/#org` },
  };

  const application = {
    "@type": "SoftwareApplication",
    "@id": `${BASE}/#app`,
    name: "SpeedSettr",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: PLAN_TAGLINE,
    featureList: PLAN_FEATURES,
    provider: { "@id": `${BASE}/#org` },
    offers: [
      {
        "@type": "Offer",
        name: `${PLAN_NAME} (monthly)`,
        price: PRICING.monthly.toFixed(2),
        priceCurrency: "USD",
        url: `${BASE}/#pricing`,
      },
      {
        "@type": "Offer",
        name: `${PLAN_NAME} (annual)`,
        price: PRICING.annualTotal.toFixed(2),
        priceCurrency: "USD",
        url: `${BASE}/#pricing`,
      },
    ],
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${BASE}/#faq`,
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a.join("\n\n") },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, application, faqPage],
  };
}

/**
 * Renders the landing-page JSON-LD as a single <script type="application/ld+json">.
 * Server component - safe to render inside app/page.tsx (a server component).
 */
export function HomeJsonLd() {
  return (
    <script
      type="application/ld+json"
      // The graph is built only from static in-repo config (no user input).
      // Escaping "<" -> < is defense-in-depth against the JSON-LD
      // "</script>" breakout in case any source string ever contains one.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildGraph()).replace(/</g, "\\u003c"),
      }}
    />
  );
}

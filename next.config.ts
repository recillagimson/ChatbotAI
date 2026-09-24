import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// `npm run analyze` sets npm_lifecycle_event=analyze in EVERY shell, including
// PowerShell and cmd. The recipe the analyzer's own README gives,
// `ANALYZE=true next build`, is bash-only syntax: on PowerShell it fails with
// "The term 'ANALYZE=true' is not recognized as the name of a cmdlet". ANALYZE
// is still honoured as an escape hatch for bash and CI.
//
// The script must be `next build`, NOT `npm run build`: nesting npm scripts
// resets npm_lifecycle_event to the inner script's name.
const analyzing =
  process.env.npm_lifecycle_event === "analyze" || process.env.ANALYZE === "true";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Required for unstable_after() on Next 15.0.x (the manychat webhook acks
    // ManyChat fast, then finishes AI generation + push in the background).
    // No longer needed once on Next 15.1+ where after() is stable.
    after: true,
  },
  // Baseline security headers on every response. Safe for the ManyChat webhook
  // (a server-to-server POST to /api/webhooks neither renders frames nor reads a
  // Referrer-Policy) and for the app (SAMEORIGIN preserves same-origin framing).
  // A strict Content-Security-Policy is intentionally NOT set here: the landing
  // uses inline styles (animation delays), data: SVG backgrounds and next/font
  // inline styles, so a CSP without nonces/'unsafe-inline' would break rendering
  // - treat CSP as a separate, carefully-tested change.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

// Wrapped CONDITIONALLY rather than with the documented
// `withBundleAnalyzer({ enabled: analyzing })(nextConfig)`.
//
// That form is NOT inert when disabled. The wrapper always attaches a `webpack`
// key to the config, and next/dist/build/index.js computes:
//
//   useBuildWorker = config.experimental.webpackBuildWorker
//     || (config.experimental.webpackBuildWorker === undefined && !config.webpack)
//
// with webpackBuildWorker defaulting to undefined (server/config-shared.js).
// So merely wrapping the config, even with enabled:false, turns the webpack
// build worker OFF for every production build - including every Vercel deploy,
// which is a real change to how production compiles, not a no-op.
//
// This form exports the identical object when not analyzing, so `config.webpack`
// stays undefined and nothing about the normal build path changes.
export default analyzing
  ? withBundleAnalyzer({ enabled: true })(nextConfig)
  : nextConfig;

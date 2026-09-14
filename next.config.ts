import type { NextConfig } from "next";

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

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Required for unstable_after() on Next 15.0.x (the manychat webhook acks
    // ManyChat fast, then finishes AI generation + push in the background).
    // No longer needed once on Next 15.1+ where after() is stable.
    after: true,
  },
};

export default nextConfig;

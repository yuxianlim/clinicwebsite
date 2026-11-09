import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/api/system-status/revision": ["./next.config.ts"],
  },
};

export default nextConfig;

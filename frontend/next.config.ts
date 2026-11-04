import type { NextConfig } from "next";

// This local prototype does not use framework telemetry or a global telemetry config.
process.env.NEXT_TELEMETRY_DISABLED = "1";

const config: NextConfig = {
  transpilePackages: ["@expose/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:4000/api/:path*" }];
  },
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
};
export default config;

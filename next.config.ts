import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prefer this app's directory when another package-lock exists higher up (e.g. in $HOME).
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.splicesail.com" }],
        destination: "https://splicesail.com/:path*",
        permanent: true,
      },
    ];
  },
  // GPX/FIT uploads (HD GPS) — align with race-tracks Supabase bucket (50 MB).
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;

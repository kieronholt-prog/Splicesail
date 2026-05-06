import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prefer this app's directory when another package-lock exists higher up (e.g. in $HOME).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

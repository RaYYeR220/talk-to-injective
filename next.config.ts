import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in the home dir
  // otherwise makes Turbopack infer the wrong root and print a warning).
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;

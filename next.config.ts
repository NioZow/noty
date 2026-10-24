import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep the production build inside a small (4 GiB) builder. The default
    // is four static-generation workers, and Turbopack has no memory bound,
    // so the build gets OOM-killed before it finishes.
    cpus: 1,
    turbopackMemoryLimit: 1024 * 1024 * 1024,
  },
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ["nixos-1", "localhost", "192.168.90.177"],
};

export default nextConfig;

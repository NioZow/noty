import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // @ts-expect-error – Next.js 15.5 dev-server cross-origin origin allowlist
  allowedDevOrigins: ["nixos-1", "localhost", "192.168.90.177"],
};

export default nextConfig;

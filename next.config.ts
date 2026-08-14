import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ["nixos-1", "localhost", "192.168.90.177"],
};

export default nextConfig;

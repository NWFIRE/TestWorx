import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  transpilePackages: ["@testworx/db", "@testworx/lib", "@testworx/types", "@testworx/ui"]
};

export default nextConfig;


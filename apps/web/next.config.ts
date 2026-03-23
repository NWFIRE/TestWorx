import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@testworx/db", "@testworx/lib", "@testworx/types", "@testworx/ui"]
};

export default nextConfig;


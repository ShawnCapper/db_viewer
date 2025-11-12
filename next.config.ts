import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  // Configure for static export (fully client-side)
  output: 'export',
  
  // Force Next to treat this folder as the root for file tracing in a multi-lockfile workspace
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config: any) => {
    // Copy sql.js WebAssembly files to public directory
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  webpack: (config) => {
    // Handle babylon-mmd WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    })
    // Ensure proper module resolution for .js extensions
    config.resolve.extensions = [...(config.resolve.extensions || []), ".js", ".mjs"]

    return config
  },
  async headers() {
    return [
      {
        source: "/:path*", // Apply to all routes
        headers: [
          // Required headers for WebAssembly
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          // Optional: For serving .wasm files correctly
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
    ];
  }
};

export default nextConfig;

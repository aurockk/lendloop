import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is client-rendered against Convex's realtime queries; Cache
  // Components would only add Suspense boundaries around Clerk for no gain.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

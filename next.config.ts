import type { NextConfig } from "next";

/**
 * 3D assets are content-hashed by name in production pipelines (e.g. car.v3.glb),
 * so they can be cached "forever" on the CDN (CloudFront / Vercel Edge).
 */
const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
  async headers() {
    return [
      { source: "/models/:path*", headers: immutable },
      { source: "/draco/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;

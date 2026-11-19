import type { NextConfig } from "next";

/**
 * 3D assets carry a version in the name (car.v1.glb, draco/r187/), so they can be
 * cached "forever". Changed a file? Bump the name AND its constant, or visitors keep the old one.
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

"use client";

import { useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import type { Tier } from "@/lib/device";
import { PerfProbe } from "./Perf";

/**
 * Shared <Canvas> setup:
 * - DPR capped per device tier (a 3x phone screen would otherwise render 9x the pixels)
 * - PerformanceMonitor lowers DPR at runtime if FPS drops, raises it when there is headroom
 * - frameloop "demand" = render only when something changes (battery friendly)
 */
export function Stage({
  tier,
  frameloop = "always",
  label,
  children,
  className,
}: {
  tier: Tier;
  frameloop?: "always" | "demand";
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const maxDpr = tier === "high" ? 2 : 1.5;
  const [dpr, setDpr] = useState(maxDpr);

  return (
    <Canvas
      className={className}
      frameloop={frameloop}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 32, near: 0.05, far: 60, position: [4.6, 1.5, -4.9] }}
      aria-label={label}
      role="img"
    >
      <PerformanceMonitor
        onIncline={() => setDpr(maxDpr)}
        onDecline={() => setDpr(1)}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <PerfProbe />
      {children}
    </Canvas>
  );
}

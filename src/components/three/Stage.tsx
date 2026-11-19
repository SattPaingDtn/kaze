"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import type { Tier } from "@/lib/device";
import { PerfProbe } from "./Perf";

/**
 * Shared <Canvas> setup:
 * - DPR capped per device tier (a 3x phone screen would otherwise render 9x the pixels)
 * - PerformanceMonitor lowers DPR step by step if FPS drops, raises it when there is headroom
 * - frameloop "demand" = render only when something changes (battery friendly). No monitor
 *   then: idle gaps between frames read as "low FPS" and would drop DPR to 1 (blurry).
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
  // Back to on-demand rendering → nothing to monitor, so return to full sharpness.
  useEffect(() => {
    if (frameloop === "demand") setDpr(maxDpr);
  }, [frameloop, maxDpr]);

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
      {frameloop === "always" && (
        <PerformanceMonitor
          factor={1} // start sharp; factor 0..1 maps to DPR 1..maxDpr in 0.25 steps
          onChange={({ factor }) => setDpr(Math.round((1 + (maxDpr - 1) * factor) * 4) / 4)}
          onFallback={() => setDpr(1)} // kept flip-flopping: settle on 1 for this visit
        />
      )}
      <PerfProbe />
      {children}
    </Canvas>
  );
}

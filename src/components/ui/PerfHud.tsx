"use client";

import { useEffect, useRef } from "react";
import { perfState } from "@/lib/store";

/** DOM overlay; updates text directly every 500 ms. */
export function PerfHud({ tier }: { tier: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let lastFrames = perfState.frames;
    const id = window.setInterval(() => {
      if (!ref.current) return;
      const idle = perfState.frames === lastFrames; // render-on-demand is sleeping
      lastFrames = perfState.frames;
      ref.current.textContent =
        `FPS        ${idle ? "idle (0 GPU work)" : perfState.fps}\n` +
        `Draw calls ${perfState.calls}\n` +
        `Triangles  ${(perfState.triangles / 1000).toFixed(0)}k\n` +
        `Geometries ${perfState.geometries}  Textures ${perfState.textures}\n` +
        `DPR        ${perfState.dpr.toFixed(2)}  Tier ${tier}`;
    }, 500);
    return () => window.clearInterval(id);
  }, [tier]);
  return (
    <pre
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 50,
        margin: 0,
        padding: "10px 12px",
        font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#9ff0c0",
        background: "rgba(0,0,0,.72)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 8,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    />
  );
}

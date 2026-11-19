"use client";
import { useEffect, useState } from "react";

export type Tier = "high" | "low";

/**
 * Cheap, synchronous device-tier guess. Used to pick DPR caps, environment
 * resolution and effect quality *before* the first frame is drawn.
 * PerformanceMonitor then refines it at runtime from real FPS.
 */
export function detectTier(): Tier {
  if (typeof window === "undefined") return "high";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return coarse || small || cores <= 4 || mem <= 4 ? "low" : "high";
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

"use client";

import { useRef } from "react";
import { perfState } from "@/lib/store";
import { useFrame, useThree } from "@react-three/fiber";

/** Lives inside <Canvas>: samples renderer stats without React re-renders. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ t: 0, n: 0 });
  useFrame((_, dt) => {
    acc.current.t += dt;
    acc.current.n += 1;
    perfState.frames += 1;
    perfState.calls = gl.info.render.calls;
    perfState.triangles = gl.info.render.triangles;
    perfState.geometries = gl.info.memory.geometries;
    perfState.textures = gl.info.memory.textures;
    perfState.dpr = gl.getPixelRatio();
    if (acc.current.t > 0.5) {
      perfState.fps = Math.round(acc.current.n / acc.current.t);
      acc.current = { t: 0, n: 0 };
    }
  });
  return null;
}

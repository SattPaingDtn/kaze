"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import type { CarTargets } from "./Car";
import { createFloorMaterial } from "./shaders";
import type { Tier } from "@/lib/device";

export const BG = "#0b0c0e";

/**
 * Studio lighting with ZERO network requests and ZERO real-time shadows:
 * - Lightformers (emissive planes) are rendered ONCE (frames={1}) into a cube
 *   map that lights every PBR material through reflections.
 * - Contact shadow is a baked AO texture (see Car → BakedShadow).
 */
export function Studio({ tier, targets, reducedMotion = false }: { tier: Tier; targets: RefObject<CarTargets>; reducedMotion?: boolean }) {
  return (
    <>
      <color attach="background" args={[BG]} />
      <Environment resolution={tier === "high" ? 256 : 128} frames={1}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <Lightformer intensity={3} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
          {[2, 0, 2, 0, 2, 0, 2, 0].map((x, i) => (
            <Lightformer key={i} form="circle" intensity={3} rotation={[Math.PI / 2, 0, 0]} position={[x, 4, i * 4]} scale={[4, 1, 1]} />
          ))}
          <Lightformer intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[50, 2, 1]} />
          <Lightformer intensity={2} rotation-y={Math.PI / 2} position={[-5, -1, -1]} scale={[50, 2, 1]} />
          <Lightformer intensity={2} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[50, 1, 1]} />
          <Lightformer form="ring" color="#c8261c" intensity={6} scale={2} position={[-15, 4, -18]} />
        </group>
      </Environment>
      <Floor targets={targets} reducedMotion={reducedMotion} />
    </>
  );
}

function Floor({ targets, reducedMotion }: { targets: RefObject<CarTargets>; reducedMotion: boolean }) {
  const mat = useMemo(() => createFloorMaterial(BG), []);
  const travel = useRef(0);
  const speed = useRef(0);
  const xray = useRef(0);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    speed.current += ((reducedMotion ? 0 : targets.current.spin) - speed.current) * (1 - Math.exp(-2 * d)); // grid stays still with reduced motion, like the wheels
    xray.current += (targets.current.xray - xray.current) * (1 - Math.exp(-4 * d));
    travel.current += speed.current * d * 2.6;
    mat.uniforms.uTravel.value = travel.current;
    mat.uniforms.uXray.value = xray.current;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} material={mat}>
      <circleGeometry args={[14, 64]} />
    </mesh>
  );
}

"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Color, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { CarLive } from "./Car";
import { DRACO_PATH } from "./Car";

export const ENGINE_URL = "/models/engine.glb";

/** Where the engine bay is in car space (behind the cabin, mid-engine layout). */
const BAY_CENTER = new Vector3(0, 0.58, 1.0);
const BAY_SIZE = 1.2; // longest side in metres

/**
 * Real CAD engine (Khronos "2CylinderEngine"). The source file is in
 * millimetres with flat CAD colours, so we normalise its size at runtime and
 * re-skin it with PBR metals that match the studio lighting.
 */
export function Engine({ live }: { live: RefObject<CarLive> }) {
  const { scene } = useGLTF(ENGINE_URL, DRACO_PATH);
  const group = useRef<Group>(null);

  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const aluminium = new MeshStandardMaterial({ color: "#c9ccd1", metalness: 1, roughness: 0.32 });
    const steel = new MeshStandardMaterial({ color: "#2a2c30", metalness: 1, roughness: 0.45 });
    const titanium = new MeshStandardMaterial({ color: "#6f7680", metalness: 1, roughness: 0.25 });
    const accent = new MeshStandardMaterial({ color: "#c8261c", metalness: 0.6, roughness: 0.3 });
    const c = new Color();
    model.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const src = o.material as MeshStandardMaterial;
      c.copy(src.color);
      const { r, g, b } = c;
      if (r > 0.5 && g < 0.1) o.material = accent; // red parts
      else if (r > 0.5 && g > 0.2 && b < 0.1) o.material = accent; // orange → brand red
      else if (r < 0.05 && g < 0.05 && b < 0.05) o.material = steel; // black
      else if (b > r) o.material = titanium; // blue / teal CAD colours
      else o.material = aluminium;
    });

    // Normalise: centre on origin and scale to fit the bay.
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const s = BAY_SIZE / Math.max(size.x, size.y, size.z);
    model.position.copy(center).multiplyScalar(-s);
    model.scale.setScalar(s);
    return { model, materials: [aluminium, steel, titanium, accent] };
  }, [scene]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const x = live.current.xray;
    g.visible = x > 0.02;
    if (!g.visible) return;
    // rises into place as the body turns to x-ray, with a subtle idle shake
    const idle = Math.sin(state.clock.elapsedTime * 40) * 0.0012;
    g.position.set(BAY_CENTER.x, BAY_CENTER.y - (1 - x) * 0.35 + idle, BAY_CENTER.z);
    g.scale.setScalar(0.6 + 0.4 * x);
  });

  return (
    <group ref={group} visible={false}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive object={model} />
      </group>
    </group>
  );
}

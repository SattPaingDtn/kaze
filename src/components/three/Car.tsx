"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import {
  Color,
  Material,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  Object3D,
} from "three";
import { RIMS, type RimFinish } from "@/content/car";
import { createXrayMaterial } from "./shaders";
import { Engine } from "./Engine";
import { installLoadingBridge } from "./loadingBridge";

installLoadingBridge(); // before useGLTF.preload (bottom of file) starts fetching

export const CAR_URL = "/models/car.v1.glb"; // versioned: cached immutable (next.config.ts)
/** Draco decoder is self-hosted (public/draco) — no third-party CDN at runtime. */
export const DRACO_PATH = "/draco/r187/"; // decoder copied from three r187

/** "Targets" are written by UI / scroll; the car eases toward them every frame. */
export type CarTargets = {
  paint: string;
  rim: RimFinish["id"];
  leather: string;
  xray: number; // 0 = solid, 1 = full x-ray
  spin: number; // wheel speed 0..1
};

/** Live (damped) values other components can read, e.g. the engine reveal. */
export type CarLive = { xray: number };

const WHEELS = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];

export function Car({
  targets,
  reducedMotion = false,
  onReady,
}: {
  targets: RefObject<CarTargets>;
  reducedMotion?: boolean;
  onReady?: () => void;
}) {
  const { scene } = useGLTF(CAR_URL, DRACO_PATH);
  const invalidate = useThree((s) => s.invalidate);
  const live = useRef<CarLive>({ xray: 0 });

  const rig = useMemo(() => {
    // Clone so the cached GLTF stays pristine (both routes share the cache).
    // Object3D.clone() shares geometry → no extra GPU memory.
    const solid = scene.clone(true);

    const paint = new MeshPhysicalMaterial({
      color: targets.current.paint,
      metalness: 0.55,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
    const rim = new MeshStandardMaterial({ color: "#ffffff", metalness: 1, roughness: 0.12 });
    const leather = new MeshStandardMaterial({ color: targets.current.leather, metalness: 0, roughness: 0.62 });
    // Opacity glass instead of `transmission`: transmission renders the scene a
    // second time into a texture — too expensive on phones.
    const glass = new MeshPhysicalMaterial({
      color: "#ffffff",
      metalness: 0.2,
      roughness: 0,
      transparent: true,
      opacity: 0.22,
      envMapIntensity: 1.5,
    });
    const badge = new MeshStandardMaterial({ color: "#1b1c1f", metalness: 1, roughness: 0.25 });

    const owned = new Set<Material>([paint, rim, leather, glass, badge]);
    const cloned = new Map<Material, Material>();

    solid.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const n = o.name;
      if (n === "body") o.material = paint;
      else if (n.startsWith("rim_")) o.material = rim;
      else if (n === "leather" || n === "steering_leather") o.material = leather;
      else if (n === "glass") o.material = glass;
      else if (n === "yellow_trim" || n === "centre" || n === "steering_centre") o.material = badge;
      else {
        const src = o.material as Material;
        if (!cloned.has(src)) cloned.set(src, src.clone());
        o.material = cloned.get(src)!;
      }
    });
    cloned.forEach((m) => owned.add(m));
    owned.forEach((m) => (m.userData.baseOpacity = m.transparent ? m.opacity : 1));
    owned.forEach((m) => (m.userData.baseTransparent = m.transparent));

    // X-ray "ghost": same geometry, one shared shader material.
    const xray = createXrayMaterial();
    const ghost = solid.clone(true);
    ghost.traverse((o) => {
      if (o instanceof Mesh) o.material = xray;
    });
    ghost.visible = false;

    const wheels = [...WHEELS.map((w) => solid.getObjectByName(w)), ...WHEELS.map((w) => ghost.getObjectByName(w))].filter(
      Boolean,
    ) as Object3D[];

    return { solid, ghost, wheels, paint, rim, leather, xray, owned };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual disposal: R3F only auto-disposes objects it created declaratively.
  useEffect(() => {
    onReady?.();
    invalidate(); // demand mode: draw the first frame once the model has arrived
    return () => rig.owned.forEach((m) => m.dispose());
  }, [rig]); // eslint-disable-line react-hooks/exhaustive-deps

  const tmp = useMemo(() => ({ paint: new Color(), leather: new Color(), rim: new Color() }), []);
  const spinSpeed = useRef(0);
  const wasTransparent = useRef(false);

  useFrame((state, dt) => {
    const t = targets.current;
    const d = Math.min(dt, 1 / 20); // avoid jumps after a tab switch
    let animating = false;

    // Colours ease toward their target (smooth swatch transitions)
    const k = 1 - Math.exp(-6 * d);
    for (const [mat, hex, c] of [
      [rig.paint, t.paint, tmp.paint],
      [rig.leather, t.leather, tmp.leather],
    ] as const) {
      c.set(hex);
      mat.color.lerp(c, k);
      if (Math.abs(mat.color.r - c.r) + Math.abs(mat.color.g - c.g) + Math.abs(mat.color.b - c.b) > 0.002) animating = true;
    }
    const rimDef = RIMS.find((r) => r.id === t.rim) ?? RIMS[0];
    tmp.rim.set(rimDef.hex);
    rig.rim.color.lerp(tmp.rim, k);
    rig.rim.roughness = MathUtils.lerp(rig.rim.roughness, rimDef.roughness, k);
    if (Math.abs(rig.rim.color.r - tmp.rim.r) > 0.002) animating = true;

    // X-ray cross-fade: solid fades out while the ghost fades in.
    const x = MathUtils.damp(live.current.xray, t.xray, 4, d);
    live.current.xray = Math.abs(x - t.xray) < 0.001 ? t.xray : x;
    const xv = live.current.xray;
    if (xv !== t.xray) animating = true;

    rig.ghost.visible = xv > 0.002;
    rig.solid.visible = xv < 0.998;
    const fading = xv > 0.002;
    if (fading !== wasTransparent.current) {
      // Toggling `transparent` switches shader programs, so only do it on change.
      rig.owned.forEach((m) => {
        m.transparent = fading || m.userData.baseTransparent;
        m.depthWrite = !fading || !m.userData.baseTransparent;
        m.needsUpdate = true;
      });
      wasTransparent.current = fading;
    }
    if (fading) rig.owned.forEach((m) => (m.opacity = m.userData.baseOpacity * (1 - xv)));
    rig.xray.uniforms.uOpacity.value = xv;
    if (xv > 0.002) {
      rig.xray.uniforms.uTime.value = state.clock.elapsedTime;
      rig.xray.uniforms.uSweep.value = reducedMotion ? 99 : ((state.clock.elapsedTime * 0.45) % 1) * 6 - 3;
      animating = true;
    }

    // Wheels
    spinSpeed.current = MathUtils.damp(spinSpeed.current, reducedMotion ? 0 : t.spin, 2, d);
    if (spinSpeed.current > 0.001) {
      rig.wheels.forEach((w) => w.rotateX(spinSpeed.current * d * 14));
      animating = true;
    }

    // Render-on-demand: keep asking for frames only while something moves.
    if (animating) invalidate();
  });

  return (
    <group>
      <primitive object={rig.solid} />
      <primitive object={rig.ghost} />
      <BakedShadow />
      <DeferredEngine live={live} reducedMotion={reducedMotion} />
    </group>
  );
}

/** Pre-baked ambient-occlusion texture: zero runtime shadow cost. */
function BakedShadow() {
  const map = useTexture("/models/car_ao.v1.png");
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={2}>
      <planeGeometry args={[0.655 * 4, 1.3 * 4]} />
      <meshBasicMaterial map={map} blending={MultiplyBlending} toneMapped={false} transparent premultipliedAlpha />
    </mesh>
  );
}

/**
 * Progressive loading: the engine GLB is only requested once the car is on
 * screen and the main thread is idle, so it never competes with the hero.
 */
function DeferredEngine({ live, reducedMotion }: { live: RefObject<CarLive>; reducedMotion: boolean }) {
  const [mount, setMount] = useState(false);
  useEffect(() => {
    // `timeout` guarantees it still loads on a busy main thread / background tab
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
    const id = ric(() => setMount(true), { timeout: 2500 });
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
  }, []);
  if (!mount) return null;
  return (
    <Suspense fallback={null}>
      <Engine live={live} reducedMotion={reducedMotion} />
    </Suspense>
  );
}

useGLTF.preload(CAR_URL, DRACO_PATH);

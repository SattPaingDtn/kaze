"use client";

import { Suspense, useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PerspectiveCamera, Spherical, Vector3 } from "three";
import gsap from "gsap";
import { HOTSPOTS, VIEWS, type Hotspot, type ViewId } from "@/content/car";
import type { Tier } from "@/lib/device";
import { Car, type CarTargets } from "../three/Car";
import { Studio } from "../three/Studio";
import { Stage } from "../three/Stage";

export type RigApi = { orbit: (dAzimuth: number, dPolar: number) => void; zoom: (factor: number) => void };

export type SceneProps = {
  tier: Tier;
  reducedMotion: boolean;
  paint: string;
  rim: CarTargets["rim"];
  leather: string;
  view: ViewId;
  xray: boolean;
  autoRotate: boolean;
  activeHotspot: string | null;
  onHotspot: (h: Hotspot) => void;
  rigRef: Ref<RigApi>;
  /** localised strings: canvas label + one aria-label per hotspot */
  sceneLabel: string;
  hotspotLabels: Record<Hotspot["id"], string>;
};

export default function ConfiguratorScene(p: SceneProps) {
  const targets = useRef<CarTargets>({ paint: p.paint, rim: p.rim, leather: p.leather, xray: 0, spin: 0 });
  const xrayOn = p.xray || !!VIEWS[p.view].xray;

  // Continuous rendering only while auto-rotating or showing the animated x-ray.
  const frameloop = p.autoRotate || xrayOn ? "always" : "demand";

  return (
    <Stage tier={p.tier} frameloop={frameloop} label={p.sceneLabel}>
      <Studio tier={p.tier} targets={targets} reducedMotion={p.reducedMotion} />
      <Suspense fallback={null}>
        <Car targets={targets} reducedMotion={p.reducedMotion} />
        {!VIEWS[p.view].inside && <Hotspots active={p.activeHotspot} onSelect={p.onHotspot} labels={p.hotspotLabels} />}
      </Suspense>
      <Sync targets={targets} paint={p.paint} rim={p.rim} leather={p.leather} xray={xrayOn} />
      <Rig view={p.view} autoRotate={p.autoRotate && !p.reducedMotion} reducedMotion={p.reducedMotion} rigRef={p.rigRef} />
    </Stage>
  );
}

/** React props → mutable targets, then wake the demand-driven render loop. */
function Sync({ targets, paint, rim, leather, xray }: { targets: RefObject<CarTargets>; paint: string; rim: CarTargets["rim"]; leather: string; xray: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    Object.assign(targets.current, { paint, rim, leather, xray: xray ? 1 : 0 });
    invalidate();
  }, [targets, paint, rim, leather, xray, invalidate]);
  return null;
}

function Rig({ view, autoRotate, reducedMotion, rigRef }: { view: ViewId; autoRotate: boolean; reducedMotion: boolean; rigRef: Ref<RigApi> }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = size.width / size.height;
  const portrait = aspect < 0.9;
  // Shots are authored for ~16:9; narrower stages pull the camera back so the car still fits.
  const fit = Math.min(Math.max(1.6 / aspect, 1), 2.1);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const shot = VIEWS[view];
    const target = new Vector3(...shot.target);
    const pos = new Vector3(...shot.position);
    if (!shot.inside) pos.sub(target).multiplyScalar(fit).add(target);

    // Relax limits during the fly-to, then lock them for the new view.
    c.minDistance = 0;
    c.maxDistance = Infinity;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.enabled = false;
    gsap.killTweensOf([camera.position, c.target, camera]);

    const duration = reducedMotion ? 0 : 1.5;
    const ease = "power3.inOut";
    const onUpdate = () => {
      camera.updateProjectionMatrix();
      c.update();
      invalidate();
    };
    const onComplete = () => {
      const dist = pos.distanceTo(target);
      if (shot.inside) {
        // Look-around: orbit a target just in front of the eye.
        c.minDistance = c.maxDistance = dist;
        c.minPolarAngle = 0.9;
        c.maxPolarAngle = 2.1;
        c.enableZoom = false;
        c.rotateSpeed = -0.35; // feels like turning your head
      } else {
        c.minDistance = 2.4;
        c.maxDistance = 10 * fit;
        c.minPolarAngle = 0.25;
        c.maxPolarAngle = Math.PI / 2 - 0.04; // never below the floor
        c.enableZoom = true;
        c.rotateSpeed = 0.6;
      }
      c.enabled = true;
      c.update();
      invalidate();
    };
    gsap.to(c.target, { x: target.x, y: target.y, z: target.z, duration, ease });
    gsap.to(camera, { fov: shot.inside ? (portrait ? 80 : 65) : portrait ? 42 : 32, duration, ease });
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease, onUpdate, onComplete }); // last: with duration 0 these finish instantly, in order
    return () => {
      gsap.killTweensOf([camera.position, c.target, camera]);
    };
  }, [view, portrait, fit, reducedMotion, camera, invalidate]);

  // Keyboard orbit/zoom (OrbitControls only supports keyboard *panning*).
  useImperativeHandle(rigRef, () => {
    const sph = new Spherical();
    const off = new Vector3();
    const apply = (fn: (s: Spherical) => void) => {
      const c = controls.current;
      if (!c) return;
      off.copy(camera.position).sub(c.target);
      sph.setFromVector3(off);
      fn(sph);
      sph.phi = Math.min(Math.max(sph.phi, c.minPolarAngle), c.maxPolarAngle);
      sph.radius = Math.min(Math.max(sph.radius, c.minDistance), c.maxDistance);
      off.setFromSpherical(sph);
      camera.position.copy(c.target).add(off);
      c.update();
      invalidate();
    };
    return {
      orbit: (dAz, dPol) => apply((s) => ((s.theta += dAz), (s.phi += dPol))),
      zoom: (f) => apply((s) => (s.radius *= f)),
    };
  }, [camera, invalidate]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
      target={VIEWS.exterior.target}
    />
  );
}

/**
 * Hotspots are real <button>s (keyboard + screen-reader friendly).
 * Instead of drei's `occlude` (a raycast against a 350k-triangle car every
 * frame) we hide a hotspot when it faces away from the camera — one dot product.
 */
function Hotspots({
  active,
  onSelect,
  labels,
}: {
  active: string | null;
  onSelect: (h: Hotspot) => void;
  labels: Record<Hotspot["id"], string>;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tmp = useRef({ n: new Vector3(), v: new Vector3(), center: new Vector3(0, 0.5, 0) });
  useFrame(({ camera }) => {
    HOTSPOTS.forEach((h, i) => {
      const el = refs.current[i];
      if (!el) return;
      const { n, v, center } = tmp.current;
      n.set(...h.position).sub(center).normalize();
      v.copy(camera.position).sub(center).normalize();
      const facing = n.dot(v) > -0.05;
      el.dataset.hidden = facing ? "false" : "true";
      el.tabIndex = facing ? 0 : -1;
    });
  });
  return (
    <>
      {HOTSPOTS.map((h, i) => (
        <Html key={h.id} position={h.position} center zIndexRange={[20, 0]}>
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="hotspot"
            aria-label={labels[h.id]}
            aria-pressed={active === h.id}
            onClick={() => onSelect(h)}
          >
            <span aria-hidden="true">+</span>
          </button>
        </Html>
      ))}
    </>
  );
}

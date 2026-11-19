"use client";

import { Suspense, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { CHAPTERS, LEATHERS, PAINTS, type Chapter } from "@/content/car";
import { campaignStore, scrollState } from "@/lib/store";
import type { Tier } from "@/lib/device";
import { Car, type CarTargets } from "../three/Car";
import { Studio } from "../three/Studio";
import { Stage } from "../three/Stage";

export default function CampaignScene({ tier, reducedMotion, label }: { tier: Tier; reducedMotion: boolean; label: string }) {
  const targets = useRef<CarTargets>({
    paint: PAINTS[0].hex,
    rim: "chrome",
    leather: LEATHERS[0].hex,
    xray: 0,
    spin: 1,
  });

  return (
    <Stage tier={tier} label={label}>
      <Studio tier={tier} targets={targets} reducedMotion={reducedMotion} />
      <Suspense fallback={null}>
        <Car targets={targets} reducedMotion={reducedMotion} />
      </Suspense>
      <ScrollRig targets={targets} reducedMotion={reducedMotion} />
    </Stage>
  );
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Resolves a chapter's camera for the current aspect ratio. */
function shotFor(ch: Chapter, portrait: boolean, outPos: Vector3, outTarget: Vector3) {
  outTarget.set(...ch.shot.target);
  outPos.set(...ch.shot.position);
  if (portrait && !ch.shot.inside) {
    // Phones: pull the camera back so the whole car fits a tall screen,
    // and aim below the car so it sits in the upper half (copy goes below).
    outPos.sub(outTarget).multiplyScalar(1.75).add(outTarget);
    outTarget.y -= 0.55;
  }
}

/**
 * Scroll → camera. The DOM writes a float "chapter" (e.g. 2.4 = 40% between
 * chapter 2 and 3); here we blend the two camera shots and *damp* toward the
 * result, so trackpads, wheels and touch flicks all feel equally smooth.
 */
function ScrollRig({ targets, reducedMotion }: { targets: React.RefObject<CarTargets>; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const v = useRef({
    aPos: new Vector3(),
    aT: new Vector3(),
    bPos: new Vector3(),
    bT: new Vector3(),
    pos: new Vector3(),
    target: new Vector3(),
    look: new Vector3(0, 0.5, 0),
    init: false,
  });

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    const s = v.current;
    const portrait = size.width / size.height < 0.9;
    const c = MathUtils.clamp(scrollState.chapter, 0, CHAPTERS.length - 1);
    const i = Math.min(Math.floor(c), CHAPTERS.length - 2);
    const t = smooth(MathUtils.clamp(c - i, 0, 1));
    const A = CHAPTERS[i];
    const B = CHAPTERS[i + 1];

    shotFor(A, portrait, s.aPos, s.aT);
    shotFor(B, portrait, s.bPos, s.bT);
    s.pos.lerpVectors(s.aPos, s.bPos, t);
    s.target.lerpVectors(s.aT, s.bT, t);

    const lambda = reducedMotion ? 20 : 3.2;
    if (!s.init) {
      camera.position.copy(s.pos);
      s.look.copy(s.target);
      s.init = true;
    }
    camera.position.x = MathUtils.damp(camera.position.x, s.pos.x, lambda, d);
    camera.position.y = MathUtils.damp(camera.position.y, s.pos.y, lambda, d);
    camera.position.z = MathUtils.damp(camera.position.z, s.pos.z, lambda, d);
    s.look.x = MathUtils.damp(s.look.x, s.target.x, lambda, d);
    s.look.y = MathUtils.damp(s.look.y, s.target.y, lambda, d);
    s.look.z = MathUtils.damp(s.look.z, s.target.z, lambda, d);
    camera.lookAt(s.look);

    // Cinematic lens: wider inside the cabin, wider on portrait phones.
    const inside = (A.shot.inside ? 1 - t : 0) + (B.shot.inside ? t : 0);
    const fov = MathUtils.lerp(portrait ? 42 : 32, portrait ? 75 : 62, inside);
    const offset = portrait ? 0 : MathUtils.lerp(A.offset ?? 0, B.offset ?? 0, t);
    camera.fov = MathUtils.damp(camera.fov, fov, lambda, d);
    camera.filmOffset = MathUtils.damp(camera.filmOffset, offset, lambda, d);
    camera.updateProjectionMatrix();

    // Drive the car
    const tg = targets.current;
    tg.xray = MathUtils.lerp(A.xray ?? 0, B.xray ?? 0, t);
    tg.spin = MathUtils.lerp(A.spin ?? 0, B.spin ?? 0, t);
    const paintId = campaignStore.get().paint;
    tg.paint = (PAINTS.find((p) => p.id === paintId) ?? PAINTS[0]).hex;
  });

  return null;
}

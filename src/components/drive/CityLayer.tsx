"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  SRGBColorSpace,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
} from "three";
import type { CityData, Label, Ribbon } from "./city";

/**
 * The street-level city around the car, drawn by three.js on top of the map:
 * OSM buildings with lit windows and neon shopfronts, asphalt, paving, white
 * edge lines, lane dashes, lamp light and the car's own headlight pool.
 *
 * Every "texture" is a few lines of GLSL in world space (metres), so it is sharp at any
 * distance, never tiles visibly, costs no downloads, and fades out where it would shimmer.
 */

export type CityBox = { data: CityData | null; version: number };
export type CityPose = { lng: number; lat: number; bearing: number; heading: number; dist: number };

const FOG = "#11141b"; // matches the map's far buildings, so the detailed city melts into them

const COMMON = /* glsl */ `
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  uniform vec2 uCar;
  uniform vec2 uFwd;
  uniform float uCamDist;
  float h11(float n) { return fract(sin(n) * 43758.5453); }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  // the car's low beams: a soft cone on the road ahead of it
  vec3 headlights(vec2 p) {
    vec2 d = p - uCar;
    float t = dot(d, uFwd);
    float s = dot(d, vec2(-uFwd.y, uFwd.x));
    float w = 0.9 + 0.3 * t;
    return vec3(0.85, 0.9, 1.0) * smoothstep(2.0, 6.0, t) * exp(-t / 26.0) * exp(-(s * s) / (w * w)) * 0.32;
  }
  vec3 fog(vec3 c, float depth) { return mix(c, uFog, smoothstep(uFogRange.x, uFogRange.y, depth)); }
`;

/* ── buildings ── */
const BUILDING_VS = /* glsl */ `
  attribute vec2 facade;
  attribute float seed;
  attribute float roof;
  varying vec2 vF;
  varying float vSeed;
  varying float vRoof;
  varying vec3 vN;
  varying float vDepth;
  void main() {
    vF = facade; vSeed = seed; vRoof = roof; vN = normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BUILDING_FS = /* glsl */ `
  ${COMMON}
  varying vec2 vF;
  varying float vSeed;
  varying float vRoof;
  varying vec3 vN;
  varying float vDepth;

  vec3 neon(float t) {
    if (t < 0.2) return vec3(1.0, 0.25, 0.55);   // pink
    if (t < 0.4) return vec3(0.2, 0.85, 1.0);    // cyan
    if (t < 0.6) return vec3(1.0, 0.68, 0.22);   // amber
    if (t < 0.8) return vec3(0.95, 0.95, 1.0);   // white
    return vec3(1.0, 0.22, 0.2);                 // red
  }

  void main() {
    // anything between the camera and the car dissolves (screen-door dither), so walls never hide the car
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (smoothstep(uCamDist - 7.0, uCamDist - 2.5, vDepth) < dither) discard;

    float s = vSeed;
    vec3 col;
    if (vRoof > 0.5) {
      float n = vnoise(vF * 0.4) * 0.6 + vnoise(vF * 3.0) * 0.4;
      col = vec3(0.095, 0.1, 0.12) * (0.75 + 0.5 * n);
    } else {
      float u = vF.x, v = vF.y;
      // concrete / tile / painted render, one tint per building, lit by a cool sky from one side
      vec3 wall = mix(vec3(0.16, 0.17, 0.2), vec3(0.24, 0.22, 0.2), h11(s * 7.13)) * (0.75 + 0.5 * h11(s * 3.31));
      wall *= 0.85 + 0.3 * vnoise(vec2(u, v) * 1.3);
      vec2 n = normalize(vN.xz + 1e-5);
      wall *= 0.62 + 0.38 * abs(dot(n, normalize(vec2(-0.6, 0.8))));
      col = wall;

      float bay = 2.2 + 1.3 * h11(s * 5.71);   // window spacing (m)
      float fl = 3.2 + 0.7 * h11(s * 9.17);    // floor height (m)
      float glassy = step(0.72, h11(s * 2.93)); // some towers are curtain-wall glass
      float ground = 4.2;

      if (v < ground) {
        // street-level shopfronts: one shop every 5–9 m, each with its own light and neon fascia
        float segW = 5.0 + 4.0 * h11(s * 4.1);
        float seg = floor(u / segW) + s * 31.0;
        float shop = smoothstep(0.3, 0.4, v) * (1.0 - smoothstep(3.0, 3.1, v));
        float mull = smoothstep(0.02, 0.05, fract(u / 1.8)) * smoothstep(0.0, 0.08, fract(u / segW));
        vec3 tone = mix(vec3(1.0, 0.82, 0.6), vec3(0.85, 0.92, 1.0), step(0.65, h11(seg * 1.3)));
        float lit = step(0.25, h11(seg));
        vec3 inside = tone * (0.45 + 0.4 * h11(seg * 2.7)) * (0.75 + 0.35 * vnoise(vec2(u * 1.2, v * 2.0))); // shelves, people, stuff
        vec3 glass = mix(vec3(0.04, 0.05, 0.07), inside, lit);
        col = mix(col, glass * mull, shop);
        float sign = smoothstep(3.25, 3.32, v) * (1.0 - smoothstep(3.95, 4.02, v)) * step(0.35, h11(seg * 5.9))
                   * smoothstep(0.2, 0.5, fract(u / segW) * segW) * smoothstep(0.2, 0.5, (1.0 - fract(u / segW)) * segW);
        col = mix(col, neon(h11(seg * 7.7)) * 1.1, sign);
      } else {
        vec2 g = vec2(u / bay, (v - ground) / fl);
        vec2 c = floor(g), f = fract(g);
        vec2 fw = fwidth(g);
        float wx = mix(0.16, 0.04, glassy), wy = mix(0.24, 0.07, glassy);
        float win = smoothstep(wx, wx + fw.x, f.x) * (1.0 - smoothstep(1.0 - wx - fw.x, 1.0 - wx, f.x))
                  * smoothstep(wy, wy + fw.y, f.y) * (1.0 - smoothstep(0.88 - fw.y, 0.88, f.y));
        float on = step(0.62 - 0.12 * glassy, h21(c + s * 91.7));
        vec3 warm = vec3(1.0, 0.8, 0.55), cool = vec3(0.72, 0.85, 1.0);
        vec3 light = mix(warm, cool, step(0.6, h21(c * 1.7 + s * 13.0))) * (0.32 + 0.45 * h21(c + 3.1)) * (0.8 + 0.3 * f.y);
        vec3 dark = vec3(0.035, 0.045, 0.065) + vec3(0.03, 0.04, 0.06) * f.y; // glass reflecting the night sky
        col *= 1.0 + 0.18 * (1.0 - smoothstep(0.0, 0.1 + fw.y, f.y)); // floor slab line
        vec3 detail = mix(col, mix(dark, light, on), win);
        // far away a window is less than a pixel: blend to the facade's average instead of shimmering
        vec3 avg = mix(col, mix(dark, (warm + cool) * 0.3, 0.38), mix(0.45, 0.8, glassy));
        col = mix(detail, avg, clamp(max(fw.x, fw.y) * 2.5 - 0.4, 0.0, 1.0));
      }
    }
    gl_FragColor = vec4(fog(col, vDepth), 1.0);
  }
`;

/* ── ground: pavement, edge line, asphalt, lane dashes ── */
const GROUND_VS = /* glsl */ `
  attribute float along;
  attribute float across;
  varying vec2 vP;
  varying float vAlong;
  varying float vAcross;
  varying float vDepth;
  void main() {
    vP = position.xz; vAlong = along; vAcross = across;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const groundFS = (body: string) => /* glsl */ `
  ${COMMON}
  varying vec2 vP;
  varying float vAlong;
  varying float vAcross;
  varying float vDepth;
  // street lamps every 30 m, alternating sides: warm pools of light
  float lamps() {
    float k = mod(vAlong, 30.0) - 15.0;
    return exp(-k * k / 45.0);
  }
  void main() {
    vec3 col;
    ${body}
    col += headlights(vP);
    gl_FragColor = vec4(fog(col, vDepth), 1.0);
  }
`;

const PAVEMENT_FS = groundFS(/* glsl */ `
  vec2 g = vP / 0.6;                       // 60 cm paving slabs
  vec2 c = floor(g), f = fract(g), fw = fwidth(g);
  float e = min(min(f.x, 1.0 - f.x) / max(fw.x, 1e-4), min(f.y, 1.0 - f.y) / max(fw.y, 1e-4));
  float joint = 1.0 - smoothstep(0.5, 1.5, e);
  float far = clamp(max(fw.x, fw.y) * 3.0 - 0.6, 0.0, 1.0);
  col = vec3(0.2, 0.205, 0.22) * (0.82 + 0.3 * h21(c)) * (0.9 + 0.2 * vnoise(vP * 0.3));
  col = mix(col, col * 0.55, joint * (1.0 - far));
  col += vec3(1.0, 0.8, 0.55) * lamps() * 0.09;
`);

// open ground between roads (plazas, car parks, Shibuya's scramble): darker, coarser asphalt
const LOT_FS = groundFS(/* glsl */ `
  float n = vnoise(vP * 5.0) * 0.3 + vnoise(vP * 0.6) * 0.45 + vnoise(vP * 0.05) * 0.25;
  col = vec3(0.1, 0.105, 0.12) * (0.7 + 0.6 * n);
`);

const EDGE_FS = groundFS(/* glsl */ `
  col = vec3(0.72, 0.73, 0.75) * (0.75 + 0.25 * vnoise(vP * 5.0));
`);

const ASPHALT_FS = groundFS(/* glsl */ `
  float n = vnoise(vP * 7.0) * 0.35 + vnoise(vP * 0.9) * 0.4 + vnoise(vP * 0.07) * 0.25;
  col = vec3(0.115, 0.12, 0.135) * (0.7 + 0.6 * n);
  col *= 0.92 + 0.08 * step(0.5, vnoise(vP * 0.5)); // patched resurfacing
  col += vec3(1.0, 0.78, 0.5) * lamps() * (0.5 + 0.5 * abs(vAcross)) * 0.08;
`);

const LANE_FS = groundFS(/* glsl */ `
  if (fract(vAlong / 10.0) > 0.5) discard; // 5 m dash, 5 m gap
  col = vec3(0.78, 0.79, 0.8) * (0.8 + 0.2 * vnoise(vP * 6.0));
`);

export function CityLayer({ city, pose, labelFont }: { city: RefObject<CityBox>; pose: RefObject<CityPose>; labelFont: string }) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const signs = useRef<Group>(null);
  const shown = useRef(-1);
  const textures = useRef(new Map<string, { tex: CanvasTexture; aspect: number }>());

  const uniforms = useMemo(
    () => ({
      uFog: { value: new Color(FOG) },
      uFogRange: { value: new Vector2(150, 420) },
      uCar: { value: new Vector2() },
      uFwd: { value: new Vector2(0, -1) },
      uCamDist: { value: 10 },
    }),
    [],
  );

  // order on the ground: pavement → edge line → asphalt → dashes. No depth writes, so
  // coplanar layers never z-fight; buildings and the car (drawn after) still cover them.
  const meshes = useMemo(() => {
    const mat = (fs: string, vs = GROUND_VS, ground = true) =>
      new ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, depthWrite: !ground, side: DoubleSide });
    const mk = (m: ShaderMaterial, order: number) => {
      const mesh = new Mesh(new BufferGeometry(), m);
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      return mesh;
    };
    return {
      lot: mk(mat(LOT_FS), -7),
      pavement: mk(mat(PAVEMENT_FS), -6),
      edge: mk(mat(EDGE_FS), -5),
      asphalt: mk(mat(ASPHALT_FS), -4),
      lanes: mk(mat(LANE_FS), -3),
      buildings: mk(mat(BUILDING_FS, BUILDING_VS, false), 0),
    };
  }, [uniforms]);

  useEffect(
    () => () => {
      for (const m of Object.values(meshes)) {
        m.geometry.dispose();
        (m.material as ShaderMaterial).dispose();
      }
      for (const { tex } of textures.current.values()) tex.dispose();
      textures.current.clear();
    },
    [meshes],
  );

  useFrame(() => {
    const box = city.current;
    const d = box.data;
    if (!outer.current || !inner.current || !signs.current) return;
    outer.current.visible = !!d;
    if (!d) return;

    // new data from the map → swap geometry (the old buffers are freed on the GPU)
    if (box.version !== shown.current) {
      shown.current = box.version;
      swap(meshes.buildings, {
        position: [d.buildings.pos, 3],
        normal: [d.buildings.normal, 3],
        facade: [d.buildings.facade, 2],
        seed: [d.buildings.seed, 1],
        roof: [d.buildings.roof, 1],
      });
      swap(meshes.lot, ribbon(d.lot));
      swap(meshes.pavement, ribbon(d.pavement));
      swap(meshes.edge, ribbon(d.edge));
      swap(meshes.asphalt, ribbon(d.asphalt));
      swap(meshes.lanes, ribbon(d.lanes));
      placeSigns(signs.current, d.labels, textures.current, labelFont);
    }

    // the car sits at the origin: move the city under it, turned to the map's bearing
    const p = pose.current;
    const x = (d.lng0 - p.lng) * d.kx;
    const z = (p.lat - d.lat0) * d.ky;
    outer.current.rotation.y = p.bearing;
    inner.current.position.set(x, 0, z);
    uniforms.uCar.value.set(-x, -z);
    uniforms.uFwd.value.set(Math.sin(p.heading), -Math.cos(p.heading));
    uniforms.uCamDist.value = p.dist;
  });

  return (
    <group ref={outer} visible={false}>
      <group ref={inner}>
        <primitive object={meshes.lot} />
        <primitive object={meshes.pavement} />
        <primitive object={meshes.edge} />
        <primitive object={meshes.asphalt} />
        <primitive object={meshes.lanes} />
        <primitive object={meshes.buildings} />
        <group ref={signs} />
      </group>
    </group>
  );
}

function ribbon(r: Ribbon): Record<string, [Float32Array, number]> {
  return { position: [r.pos, 3], along: [r.along, 1], across: [r.across, 1] };
}

function swap(mesh: Mesh, attrs: Record<string, [Float32Array, number]>) {
  mesh.geometry.dispose();
  const g = new BufferGeometry();
  for (const [name, [arr, size]] of Object.entries(attrs)) g.setAttribute(name, new BufferAttribute(arr, size));
  mesh.geometry = g;
}

/**
 * Street names as upright signs (Japanese road-sign blue), landmarks as white plaques.
 * Drawn with the system font into a canvas, so kanji and kana render without a web font.
 */
function placeSigns(group: Group, labels: Label[], cache: Map<string, { tex: CanvasTexture; aspect: number }>, font: string) {
  for (const s of [...group.children] as Sprite[]) {
    s.material.dispose();
    group.remove(s);
  }
  const used = new Set<string>();
  for (const l of labels) {
    const key = `${l.kind}:${l.text}`;
    used.add(key);
    let entry = cache.get(key);
    if (!entry) {
      entry = signTexture(l, font);
      cache.set(key, entry);
    }
    const h = l.kind === "place" ? 3.2 : 2.2;
    const sprite = new Sprite(new SpriteMaterial({ map: entry.tex, transparent: true, toneMapped: false, depthWrite: false }));
    sprite.center.set(0.5, 0);
    sprite.position.set(l.x, l.kind === "place" ? 16 : 4.6, l.z);
    sprite.scale.set(h * entry.aspect, h, 1);
    group.add(sprite);
  }
  for (const [key, { tex }] of cache) {
    if (used.has(key)) continue;
    tex.dispose(); // signs for streets far behind us
    cache.delete(key);
  }
}

function signTexture(l: Label, font: string) {
  const H = 96;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const css = `600 ${H * 0.46}px ${font}`;
  ctx.font = css;
  const w = Math.ceil(ctx.measureText(l.text).width + H * 0.7);
  canvas.width = w;
  canvas.height = H;
  const street = l.kind === "street";
  ctx.fillStyle = street ? "#1f4fa3" : "rgba(245,245,247,0.94)";
  ctx.strokeStyle = street ? "#ffffff" : "#c8102e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, H - 8, 12);
  ctx.fill();
  ctx.stroke();
  ctx.font = css;
  ctx.fillStyle = street ? "#ffffff" : "#111317";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(l.text, w / 2, H / 2 + 2);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / H };
}

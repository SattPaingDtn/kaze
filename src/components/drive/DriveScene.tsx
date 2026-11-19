"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { Map as MapLibre, type ExpressionSpecification, type FilterSpecification, type StyleSpecification } from "maplibre-gl";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Group, ShaderMaterial } from "three";
import { Car, type CarTargets } from "../three/Car";
import { StudioLights } from "../three/Studio";
import { driveSound, play } from "@/lib/audio";
import type { Locale } from "@/i18n/config";
import type { Tier } from "@/lib/device";
import { START, angleDelta, blocked, newCar, step, toFootprint, type Car as CarState, type Footprint, type Input } from "./physics";
import { RADIUS, buildCity } from "./city";
import { CityLayer, type CityBox } from "./CityLayer";

/**
 * Test drive on a REAL map.
 *
 *   ┌ MapLibre (WebGL #1) ─ OpenStreetMap vector tiles from OpenFreeMap: roads drawn
 *   │                       to real width, buildings extruded to real height
 *   └ R3F canvas (WebGL #2, transparent, on top) ─ the same GLB car as the configurator
 *
 * The car never moves in three.js: it sits at the origin and the MAP moves under it.
 * Each frame the three.js camera copies the map camera exactly (same field of view,
 * same pitch, same metres-per-pixel), so 1 three.js unit = 1 real metre on the map.
 */

const FOV = 50; // degrees, vertical — wider than MapLibre's default for a chase-cam feel
const PITCH = 72; // degrees from straight down
const PAD = 0.3; // top padding (share of height): puts the car in the lower part of the screen
const CHASE = 10.5; // metres from camera to car at rest; pulls back with speed
const D2R = Math.PI / 180;
const EARTH = 40075016.686; // m, Web Mercator circumference

/** What the page and the scene share: live input in, telemetry/events out. Plain mutable object = no re-renders. */
export type DriveBus = {
  input: Input;
  reset: boolean;
  onTelemetry?: (car: CarState) => void;
  onBump?: () => void;
  onStatus?: (s: "ready" | "error") => void;
  /** Re-reads held keys / touch pedals into `input` (set by the page). */
  sync?: () => void;
};

/** Where the car is drawn relative to the camera — written by the physics loop, read when three.js renders. */
type Pose = { rel: number; dist: number; roll: number; pitch: number; padTop: number; lng: number; lat: number; bearing: number; heading: number };

const SIGN_FONT = `system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;

export default function DriveScene({
  tier,
  reducedMotion,
  locale,
  targets,
  bus,
  label,
}: {
  tier: Tier;
  reducedMotion: boolean;
  locale: Locale;
  targets: RefObject<CarTargets>;
  bus: RefObject<DriveBus>;
  label: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const pose = useRef<Pose>({ rel: 0, dist: CHASE, roll: 0, pitch: 0, padTop: 0, lng: START.lng, lat: START.lat, bearing: START.heading, heading: START.heading });
  const city = useRef<CityBox>({ data: null, version: 0 });
  const render3d = useRef<(() => void) | null>(null);
  const dpr = tier === "high" ? 2 : 1.5;

  useEffect(() => {
    const el = mapEl.current!;
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: el,
        style: driveStyle(),
        center: [START.lng, START.lat],
        bearing: START.heading / D2R,
        pitch: PITCH,
        zoom: 20,
        maxZoom: 24,
        maxPitch: 85,
        interactive: false, // the car drives the camera, not the mouse
        pixelRatio: Math.min(window.devicePixelRatio, dpr),
        fadeDuration: 0,
        attributionControl: { compact: true },
      });
    } catch {
      bus.current.onStatus?.("error"); // no WebGL
      return;
    }
    map.setVerticalFieldOfView(FOV);

    let loaded = false;
    map.once("load", () => {
      loaded = true;
      bus.current.onStatus?.("ready");
    });
    map.on("error", () => {
      if (!loaded) bus.current.onStatus?.("error"); // style/tiles unreachable before first load
    });
    // three.js draws right after the map, in the same animation frame → no wobble between them
    map.on("render", () => render3d.current?.());
    // new vector tiles arrived → rebuild the detailed city (throttled in the loop below)
    let tilesChanged = true;
    map.on("sourcedata", (e) => {
      if (e.sourceId === "openmaptiles" && e.tile) tilesChanged = true;
    });
    const nameKeys = locale === "ja" ? ["name:ja", "name"] : ["name:en", "name:latin", "name"];
    let lastBuild = -1e9;
    let job: ReturnType<typeof buildCity> | null = null;

    let car = newCar();
    let camBearing = car.heading;
    let dist = CHASE;
    let roll = 0;
    let pitch = 0;
    let fps: Footprint[] = [];
    let lastScan = 0;
    let touching = false; // one bump per contact, not one per frame
    let last = performance.now();
    let raf = 0;
    if (process.env.NODE_ENV === "development") {
      // devtools only: inspect the map, jump the car somewhere else
      Object.assign(window, { __driveMap: map, __driveTeleport: (lng: number, lat: number, heading = car.heading) => (car = { ...newCar(), lng, lat, heading }) });
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const b = bus.current;
      if (b.reset) {
        b.reset = false;
        car = newCar();
        camBearing = car.heading;
      }

      // 1. physics, then "is any corner of the car inside a building footprint?"
      let next = step(car, b.input, dt);
      let hit = false;
      if (fps.length && blocked(fps, next) && !blocked(fps, car)) {
        hit = true;
        // glancing blow: scrape along the wall (keep one axis of the move); head-on: bounce back
        const slide = [{ ...next, lat: car.lat }, { ...next, lng: car.lng }].find((c) => !blocked(fps, c));
        next = slide
          ? { ...slide, speed: slide.speed * 0.9 }
          : { ...car, speed: -car.speed * 0.25, steer: next.steer, yawRate: 0, accel: -car.speed * 8 };
        if (!touching && Math.abs(car.speed) > 1.5) {
          play("bump");
          b.onBump?.();
        }
      }
      touching = hit;
      car = next;
      if (now - lastScan > 350 && loaded) {
        lastScan = now;
        fps = nearbyFootprints(map, car);
      }
      // the three.js city covers RADIUS m around its anchor: re-anchor well before the car nears the edge,
      // building the new one a few ms per frame so the drive never stutters
      if (job) {
        const t = performance.now();
        let r = job.next();
        while (!r.done && performance.now() - t < 4) r = job.next();
        if (r.done) {
          city.current = { data: r.value, version: city.current.version + 1 };
          job = null;
        }
      } else if (loaded && now - lastBuild > 1200) {
        const d = city.current.data;
        const moved = d ? Math.hypot((car.lng - d.lng0) * d.kx, (car.lat - d.lat0) * d.ky) : Infinity;
        if (moved > RADIUS * 0.3 || tilesChanged) {
          lastBuild = now;
          tilesChanged = false;
          const q = (sourceLayer: string, filter?: FilterSpecification) => map.querySourceFeatures("openmaptiles", { sourceLayer, filter });
          job = buildCity(
            car.lng,
            car.lat,
            { buildings: q("building"), roads: q("transportation"), names: q("transportation_name"), places: q("poi", ["<=", ["get", "rank"], 12]) },
            nameKeys,
          );
        }
      }

      // 2. chase camera: swings round behind the car, pulls back as speed builds
      const follow = 1 - Math.exp(-(reducedMotion ? 2.5 : 4) * dt);
      camBearing += angleDelta(camBearing, car.heading) * follow;
      const h = el.clientHeight || 1;
      const portrait = Math.max(1, Math.sqrt((0.9 * h) / (el.clientWidth || 1))); // narrow phone: step back so the car fits
      dist += (CHASE * portrait + Math.abs(car.speed) * 0.09 - dist) * (1 - Math.exp(-2 * dt));
      const body = reducedMotion ? 0 : 1;
      roll += (clamp(car.yawRate * car.speed * 0.006, 0.06) * body - roll) * (1 - Math.exp(-6 * dt));
      pitch += (clamp(car.accel * 0.0035, 0.035) * body - pitch) * (1 - Math.exp(-5 * dt));

      // 3. metres → map zoom: choose the zoom where the camera sits `dist` metres from the car
      const camPx = (0.5 * h) / Math.tan((FOV * D2R) / 2); // MapLibre's camera-to-centre distance (px)
      const mpp = dist / camPx;
      const zoom = Math.log2((EARTH * Math.cos(car.lat * D2R)) / (512 * mpp));
      const padTop = h * PAD;
      map.jumpTo({ center: [car.lng, car.lat], bearing: camBearing / D2R, zoom, pitch: PITCH, padding: { top: padTop, bottom: 0, left: 0, right: 0 } });
      map.triggerRepaint(); // keep drawing even when parked (paint swaps, wheel easing)
      pose.current = { rel: car.heading - camBearing, dist, roll, pitch, padTop, lng: car.lng, lat: car.lat, bearing: camBearing, heading: car.heading };

      targets.current.spin = reducedMotion ? 0 : car.speed / 4.9; // ≈ wheel radius × Car's spin factor
      driveSound(car.speed, b.input.throttle);
      b.onTelemetry?.(car);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      driveSound(null);
      map.remove();
      city.current = { data: null, version: city.current.version + 1 };
    };
  }, [locale, dpr, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={mapEl} className="drive-map" aria-hidden="true" />
      <Canvas
        className="drive-car"
        frameloop="never" // rendered from the map's "render" event instead
        dpr={dpr}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance", stencil: false }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        aria-label={label}
        role="img"
      >
        <Overlay pose={pose} render3d={render3d} />
        <StudioLights tier={tier} />
        <CityLayer city={city} pose={pose} labelFont={SIGN_FONT} />
        <Suspense fallback={null}>
          <CarBody pose={pose} targets={targets} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </>
  );
}

/** Copies the map camera into three.js and renders one frame on demand. */
function Overlay({ pose, render3d }: { pose: RefObject<Pose>; render3d: RefObject<(() => void) | null> }) {
  const camera = useThree((s) => s.camera) as import("three").PerspectiveCamera;
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);

  useEffect(() => {
    render3d.current = () => {
      const { dist, padTop } = pose.current;
      const p = PITCH * D2R;
      camera.fov = FOV;
      camera.near = 0.5;
      camera.far = 2000; // the detailed city reaches ~500 m
      camera.position.set(0, dist * Math.cos(p), dist * Math.sin(p)); // behind (+z) and above the car
      camera.lookAt(0, 0, 0);
      // MapLibre's padding shifts the centre of perspective down by padTop/2 px — do the same
      camera.setViewOffset(size.width, size.height, 0, -padTop / 2, size.width, size.height);
      camera.updateProjectionMatrix();
      advance(performance.now());
    };
    return () => {
      render3d.current = null;
    };
  }, [camera, advance, size, pose, render3d]);
  return null;
}

function CarBody({ pose, targets, reducedMotion }: { pose: RefObject<Pose>; targets: RefObject<CarTargets>; reducedMotion: boolean }) {
  const yaw = useRef<Group>(null);
  const body = useRef<Group>(null);
  // Runs inside advance(), before the draw — so pose and camera always belong to the same frame.
  useFrame(() => {
    const p = pose.current;
    yaw.current?.rotation.set(0, -p.rel, 0); // map bearing is clockwise, three.js yaw is counter-clockwise
    body.current?.rotation.set(p.pitch, 0, p.roll);
  });
  return (
    <group ref={yaw}>
      <group ref={body}>
        <Car targets={targets} reducedMotion={reducedMotion} shadow={false} engine={false} />
      </group>
      <Shadow />
    </group>
  );
}

/**
 * The configurator's baked contact shadow uses MULTIPLY blending, which needs an
 * opaque canvas. Over a transparent canvas we draw the same texture as black with
 * alpha instead: the map underneath shows through the soft edge.
 */
function Shadow() {
  const map = useTexture("/models/car_ao.v1.png");
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { map: { value: map } },
        transparent: true,
        depthWrite: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - texture2D(map, vUv).r) * 0.92); }",
      }),
    [map],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.01} renderOrder={-1} material={mat}>
      <planeGeometry args={[0.655 * 4, 1.3 * 4]} />
    </mesh>
  );
}

const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));

/** Building footprints within ~150 m of the car, from the vector tiles already loaded. */
function nearbyFootprints(map: MapLibre, car: CarState): Footprint[] {
  const out: Footprint[] = [];
  const dLat = 0.0014;
  const dLng = dLat / Math.cos(car.lat * D2R);
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
    if (Number(f.properties.render_min_height ?? 0) > 3) continue; // bridges / overhangs: drive under them
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const rings of polys) {
      const fp = toFootprint(rings);
      const [a, b, c, d] = fp.box;
      if (c < car.lng - dLng || a > car.lng + dLng || d < car.lat - dLat || b > car.lat + dLat) continue;
      out.push(fp);
    }
  }
  return out;
}

/* ───────────── map style: Tokyo at night, roads at their real width ───────────── */

/** Width in metres → line-width in px at every zoom (doubles per zoom level, like the world does). */
function metres(m: ExpressionSpecification | number): ExpressionSpecification {
  const px = (z: number) => (512 * 2 ** z) / (EARTH * Math.cos(START.lat * D2R));
  return ["interpolate", ["exponential", 2], ["zoom"], 12, ["*", m, px(12)], 24, ["*", m, px(24)]];
}

/** The far city (beyond the three.js layer) and everything under it. */
function driveStyle(): StyleSpecification {
  const roads: ExpressionSpecification = ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track", "path"], true, false];
  const notTunnel: ExpressionSpecification = ["!=", ["get", "brunnel"], "tunnel"];
  // carriageway width per OSM road class; one half of a dual carriageway is drawn narrower
  const width: ExpressionSpecification = [
    "*",
    ["match", ["get", "class"], "motorway", 21, "trunk", 18, "primary", 16, "secondary", 13, "tertiary", 10, "minor", 6.5, "service", 4.5, 2.5],
    ["case", ["==", ["get", "oneway"], 1], 0.6, 1],
  ];

  return {
    version: 8,
    sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    sky: { "sky-color": "#0a0c12", "horizon-color": "#1a2030", "fog-color": "#11141b", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.5 },
    light: { anchor: "viewport", color: "#cdd5ff", intensity: 0.32 },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": "#11141b" } }, // = the city's fog colour
      { id: "green", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#10150f" } },
      { id: "park", type: "fill", source: "openmaptiles", "source-layer": "park", paint: { "fill-color": "#10150f" } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#0c1520" } },
      {
        id: "rail",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", ["match", ["get", "class"], ["rail", "transit"], true, false], notTunnel],
        paint: { "line-color": "#26282e", "line-width": metres(3) },
      },
      {
        id: "kerb", // pavement either side of the carriageway
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", roads, notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#33353c", "line-width": metres(["+", width, 3.5]) },
      },
      {
        id: "edge-line", // white edge lines: the carriageway is drawn 0.4 m narrower on top of this
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", roads, notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#7d828c", "line-width": metres(width) },
      },
      {
        id: "road",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", roads, notTunnel],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1f2126", "line-width": metres(["-", width, 0.4]) },
      },
      {
        id: "centre-line",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        // centre line on two-way roads, lane divider on each half of a dual carriageway
        filter: ["all", ["match", ["get", "class"], ["trunk", "primary", "secondary", "tertiary"], true, false], notTunnel],
        paint: { "line-color": "#d5d8de", "line-opacity": 0.7, "line-width": metres(0.15), "line-dasharray": [20, 26] },
      },
      {
        id: "buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        filter: ["!", ["has", "hide_3d"]],
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#14171e", 60, "#1a1e27", 150, "#252b38"],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-vertical-gradient": true,
        },
      },
    ],
  };
}

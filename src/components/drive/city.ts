import { ShapeUtils, Vector2 } from "three";
import type { GeoJSONFeature } from "maplibre-gl";

/**
 * Turns OpenStreetMap vector-tile features (already downloaded by MapLibre) into
 * plain vertex arrays for three.js, in METRES around an anchor point:
 * x = east, z = south (three.js: −z is "north"), y = up.
 *
 * Pure data in → typed arrays out: no three.js scene objects here, so it is easy
 * to test and could move to a Web Worker later.
 */

const M_PER_DEG = 111319.49; // metres per degree of latitude (spherical Web Mercator)
export const RADIUS = 420; // metres of detailed city around the anchor; MapLibre draws the rest

export type Ribbon = { pos: Float32Array; along: Float32Array; across: Float32Array };
export type Label = { text: string; x: number; z: number; kind: "street" | "place" };

export type CityData = {
  lng0: number;
  lat0: number;
  kx: number; // metres per degree of longitude at the anchor
  ky: number; // metres per degree of latitude
  buildings: { pos: Float32Array; normal: Float32Array; facade: Float32Array; seed: Float32Array; roof: Float32Array };
  lot: Ribbon; // a disc of ground under everything, so gaps between roads aren't black
  pavement: Ribbon;
  edge: Ribbon;
  asphalt: Ribbon;
  lanes: Ribbon;
  labels: Label[];
};

// carriageway width (m) per OSM road class — the same table the map style uses
const ROAD_WIDTH: Record<string, number> = { trunk: 18, primary: 16, secondary: 13, tertiary: 10, minor: 6.5, service: 4.5 };
const LANES = new Set(["trunk", "primary", "secondary", "tertiary"]);

type Features = { buildings: GeoJSONFeature[]; roads: GeoJSONFeature[]; names: GeoJSONFeature[]; places: GeoJSONFeature[] };

/**
 * A generator so the caller can spread the work over several frames (`yield` = "good
 * place to pause"): one big rebuild would otherwise freeze the drive for ~100 ms.
 */
export function* buildCity(lng0: number, lat0: number, f: Features, nameKeys: string[]): Generator<void, CityData> {
  const ky = M_PER_DEG;
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const local = ([lng, lat]: number[]): [number, number] => [(lng - lng0) * kx, -(lat - lat0) * ky];
  // buildings reach a little further than roads, so a road never draws over a far building it should hide behind
  const R2 = (RADIUS + 120) ** 2;
  const nameOf = (p: Record<string, unknown>) => nameKeys.map((k) => p[k]).find((v) => typeof v === "string" && v) as string | undefined;

  /* ── buildings: walls + roofs, merged into one geometry (one draw call) ── */
  const b = { pos: [] as number[], normal: [] as number[], facade: [] as number[], seed: [] as number[], roof: [] as number[] };
  const seen = new Set<string>();

  let work = 0;
  for (const feat of f.buildings) {
    if (++work % 40 === 0) yield;
    const p = feat.properties;
    if (p.hide_3d) continue;
    const top = Number(p.render_height ?? 8) || 8;
    const base = Number(p.render_min_height ?? 0) || 0;
    if (top <= base) continue;
    const g = feat.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const rings of polys) {
      const key = `${rings[0][0][0].toFixed(7)},${rings[0][0][1].toFixed(7)},${top}`;
      if (seen.has(key)) continue; // the same building arrives once per tile it touches
      seen.add(key);
      const lrings = rings.map((r) => r.map(local));
      if (!lrings[0].some(([x, z]) => x * x + z * z < R2)) continue;
      // same building → same look on every rebuild
      const seed = hash(Number(feat.id ?? 0) || rings[0][0][0] * 1e5 + rings[0][0][1] * 1e3);

      for (const ring of lrings) {
        let u = 0; // metres along the facade, continuous round the corner so windows line up
        for (let i = 0; i < ring.length - 1; i++) {
          const [ax, az] = ring[i];
          const [bx, bz] = ring[i + 1];
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 0.05) continue;
          const nx = (bz - az) / len; // outward or inward depends on ring winding: the shader is double-sided
          const nz = -(bx - ax) / len;
          const quad = [
            [ax, base, az, u],
            [bx, base, bz, u + len],
            [bx, top, bz, u + len],
            [ax, base, az, u],
            [bx, top, bz, u + len],
            [ax, top, az, u],
          ];
          for (const [x, y, z, fu] of quad) {
            b.pos.push(x, y, z);
            b.normal.push(nx, 0, nz);
            b.facade.push(fu, y);
            b.seed.push(seed);
            b.roof.push(0);
          }
          u += len;
        }
      }

      // roof: triangulate the outline with its courtyards cut out
      const contour = lrings[0].slice(0, -1).map(([x, z]) => new Vector2(x, z));
      const holes = lrings.slice(1).map((r) => r.slice(0, -1).map(([x, z]) => new Vector2(x, z)));
      if (contour.length < 3) continue;
      const tris = ShapeUtils.triangulateShape(contour, holes);
      const all = [...contour, ...holes.flat()];
      for (const tri of tris) {
        for (const k of tri) {
          b.pos.push(all[k].x, top, all[k].y);
          b.normal.push(0, 1, 0);
          b.facade.push(all[k].x, all[k].y);
          b.seed.push(seed);
          b.roof.push(1);
        }
      }
    }
  }

  /* ── roads: pavement, white edge line, asphalt, lane dashes (drawn in that order) ── */
  const pavement = ribbonBuilder();
  const edge = ribbonBuilder();
  const asphalt = ribbonBuilder();
  const lanes = ribbonBuilder();

  for (const feat of f.roads) {
    if (++work % 150 === 0) yield;
    const p = feat.properties;
    if (p.brunnel === "tunnel" || p.brunnel === "bridge" || p.class === "motorway") continue; // expressways fly overhead
    const g = feat.geometry;
    const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const line of lines) {
      const pts = line.map(local);
      if (p.class === "path" || p.class === "track") {
        pavement.add(pts, 1.25);
        continue;
      }
      const w = (ROAD_WIDTH[p.class as string] ?? 4.5) * (p.oneway === 1 ? 0.6 : 1);
      pavement.add(pts, w / 2 + 1.8);
      edge.add(pts, w / 2);
      asphalt.add(pts, w / 2 - 0.2);
      if (LANES.has(p.class as string)) lanes.add(pts, 0.075, false);
    }
  }

  /* ── signs: one per street name per neighbourhood, plus big landmarks ── */
  const labels: Label[] = [];
  const add = (text: string | undefined, [x, z]: [number, number], kind: Label["kind"], gap: number) => {
    if (!text || x * x + z * z > 320 * 320) return;
    if (labels.some((l) => l.text === text && Math.hypot(l.x - x, l.z - z) < gap)) return;
    labels.push({ text, x, z, kind });
  };
  for (const feat of f.names) {
    const g = feat.geometry;
    if (g.type !== "LineString" || g.coordinates.length < 2) continue;
    add(nameOf(feat.properties), local(g.coordinates[Math.floor(g.coordinates.length / 2)]), "street", 160);
  }
  yield;
  for (const feat of f.places) {
    const g = feat.geometry;
    if (g.type !== "Point") continue;
    add(nameOf(feat.properties), local(g.coordinates), "place", 400);
  }

  return {
    lng0,
    lat0,
    kx,
    ky,
    buildings: {
      pos: new Float32Array(b.pos),
      normal: new Float32Array(b.normal),
      facade: new Float32Array(b.facade),
      seed: new Float32Array(b.seed),
      roof: new Float32Array(b.roof),
    },
    lot: disc(RADIUS + 120),
    pavement: pavement.done(),
    edge: edge.done(),
    asphalt: asphalt.done(),
    lanes: lanes.done(),
    labels: labels.slice(0, 48),
  };
}

/**
 * A polyline → a flat strip of triangles `half` metres either side, with round
 * joins and caps (a small fan at each vertex) so corners have no gaps.
 * `along` = metres along the line (lane dashes, lamp spacing), `across` = −1..1 (0 = centre).
 * Segments outside RADIUS are dropped: long roads stop where the detailed city stops.
 */
function ribbonBuilder() {
  const pos: number[] = [];
  const along: number[] = [];
  const across: number[] = [];
  const R2 = RADIUS * RADIUS;
  const v = (x: number, z: number, a: number, c: number) => {
    pos.push(x, 0, z);
    along.push(a);
    across.push(c);
  };
  const fan = (x: number, z: number, a: number, r: number) => {
    const N = 10;
    for (let k = 0; k < N; k++) {
      const t0 = (k / N) * Math.PI * 2;
      const t1 = ((k + 1) / N) * Math.PI * 2;
      v(x, z, a, 0);
      v(x + Math.cos(t0) * r, z + Math.sin(t0) * r, a, 1);
      v(x + Math.cos(t1) * r, z + Math.sin(t1) * r, a, 1);
    }
  };
  return {
    add(pts: [number, number][], half: number, joins = true) {
      let d = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i];
        const aIn = ax * ax + az * az < R2;
        if (joins && aIn) fan(ax, az, d, half);
        if (i === pts.length - 1) break;
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len > 0.01 && (aIn || bx * bx + bz * bz < R2)) {
          const nx = (-(bz - az) / len) * half;
          const nz = ((bx - ax) / len) * half;
          v(ax + nx, az + nz, d, 1);
          v(ax - nx, az - nz, d, -1);
          v(bx + nx, bz + nz, d + len, 1);
          v(bx + nx, bz + nz, d + len, 1);
          v(ax - nx, az - nz, d, -1);
          v(bx - nx, bz - nz, d + len, -1);
        }
        d += len;
      }
    },
    done(): Ribbon {
      return { pos: new Float32Array(pos), along: new Float32Array(along), across: new Float32Array(across) };
    },
  };
}

function disc(r: number): Ribbon {
  const N = 64;
  const pos: number[] = [];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2;
    const a1 = ((k + 1) / N) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
  }
  return { pos: new Float32Array(pos), along: new Float32Array(N * 3), across: new Float32Array(N * 3) };
}

/** Deterministic 0..1 from a number. */
function hash(n: number) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

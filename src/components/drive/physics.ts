/**
 * Arcade driving model in real-world units (metres, seconds, radians) on a
 * real map position (longitude / latitude). Pure functions, no three.js and
 * no MapLibre, so the maths can be read and tested on its own.
 */

/** Shibuya Scramble Crossing, heading up Dogenzaka-side towards the station. */
export const START = { lng: 139.70056, lat: 35.65948, heading: (-35 * Math.PI) / 180 };

export type Input = { throttle: number; brake: number; steer: number }; // 0..1, 0..1, -1 (left)..1 (right)

export type Car = {
  lng: number;
  lat: number;
  heading: number; // radians, clockwise from north (same convention as a map bearing)
  speed: number; // m/s, negative = reversing
  steer: number; // current front-wheel angle (smoothed)
  yawRate: number; // rad/s, for body roll
  accel: number; // m/s², for body pitch
};

export const newCar = (): Car => ({ ...START, speed: 0, steer: 0, yawRate: 0, accel: 0 });

const WHEELBASE = 2.65; // m (a mid-engine GT)
const TOP_SPEED = 50; // m/s = 180 km/h — a city, after all
const REVERSE_MAX = 7; // m/s
const R = 6378137; // Earth radius used by web maps (m)

/** One physics step. Returns the proposed next car; the caller checks collisions. */
export function step(c: Car, input: Input, dt: number): Car {
  const v = c.speed;
  // Steering lock shrinks with speed so the car stays drivable at 150 km/h.
  const maxSteer = 0.6 / (1 + Math.abs(v) / 10);
  const steer = c.steer + (input.steer * maxSteer - c.steer) * (1 - Math.exp(-10 * dt));

  let a = 0;
  if (input.throttle > 0) a += v >= 0 ? 8.5 * input.throttle * (1 - v / TOP_SPEED) : 16 * input.throttle; // throttle while rolling back = brake
  if (input.brake > 0) a -= v > 0.3 ? 16 * input.brake : 4.5 * input.brake; // brake, then reverse when stopped
  a -= v * 0.12 + Math.sign(v) * 0.4; // air drag + rolling resistance

  let speed = v + a * dt;
  if (!input.throttle && !input.brake && Math.abs(speed) < 0.25) speed = 0; // come to rest, no creeping
  if (Math.sign(speed) !== Math.sign(v) && v !== 0 && !(input.brake && v <= 0.3)) speed = 0; // drag never reverses you
  speed = Math.min(TOP_SPEED, Math.max(-REVERSE_MAX, speed));

  // Bicycle model: how fast the car turns depends on speed and wheel angle.
  const yawRate = (speed / WHEELBASE) * Math.tan(steer);
  const heading = c.heading + yawRate * dt;
  const [lng, lat] = offset(c.lng, c.lat, Math.sin(heading) * speed * dt, Math.cos(heading) * speed * dt);
  return { lng, lat, heading, speed, steer, yawRate, accel: (speed - v) / Math.max(dt, 1e-3) };
}

/** Move a lng/lat by metres east (dx) and north (dy). Exact enough for a few km. */
export function offset(lng: number, lat: number, dx: number, dy: number): [number, number] {
  const dLat = dy / R;
  const dLng = dx / (R * Math.cos((lat * Math.PI) / 180));
  return [lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI];
}

/** The car's four corners (lng/lat) — what we test against building footprints. */
export function corners(c: Pick<Car, "lng" | "lat" | "heading">): [number, number][] {
  const s = Math.sin(c.heading);
  const k = Math.cos(c.heading);
  return [
    [0.95, 2.2],
    [-0.95, 2.2],
    [0.95, -2.2],
    [-0.95, -2.2],
  ].map(([side, fwd]) => offset(c.lng, c.lat, fwd * s + side * k, fwd * k - side * s));
}

/** Metres per screen pixel at a zoom level (MapLibre's 512 px world tiles). */
export const metersPerPixel = (lat: number, zoom: number) => (2 * Math.PI * R * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/** Shortest signed angle from a to b. */
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/* ───────────── building footprints: "can I drive here?" ───────────── */

export type Footprint = { box: [number, number, number, number]; rings: number[][][] }; // [minLng, minLat, maxLng, maxLat]

export function toFootprint(rings: number[][][]): Footprint {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; // prettier-ignore
  for (const [x, y] of rings[0]) {
    a = Math.min(a, x);
    b = Math.min(b, y);
    c = Math.max(c, x);
    d = Math.max(d, y);
  }
  return { box: [a, b, c, d], rings };
}

/** Even-odd ray cast; holes (courtyards) count as outside. */
export function inside(f: Footprint, x: number, y: number) {
  const [a, b, c, d] = f.box;
  if (x < a || x > c || y < b || y > d) return false;
  let hit = false;
  for (const ring of f.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

export const blocked = (fps: Footprint[], c: Pick<Car, "lng" | "lat" | "heading">) =>
  corners(c).some(([x, y]) => fps.some((f) => inside(f, x, y)));

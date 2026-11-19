/**
 * Campaign + configurator DATA (locale-independent): ids, colours, prices,
 * camera shots. All human-readable copy lives in src/i18n/dictionaries/*,
 * keyed by these ids.
 *
 * In a real agency project this would come from a headless CMS (fetched in a
 * Server Component and revalidated with ISR): "global" fields like hex/price
 * here, "localised" fields in the dictionaries.
 */
import type { Dictionary } from "@/i18n/dictionaries/en";

export type Vec3 = [number, number, number];

export type PaintId = keyof Dictionary["paints"];
export type RimId = keyof Dictionary["rims"];
export type LeatherId = keyof Dictionary["leathers"];
export type HotspotId = keyof Dictionary["hotspots"];

export type Paint = { id: PaintId; kanji: string; hex: string; price: number };
export type RimFinish = { id: RimId; hex: string; metalness: number; roughness: number; price: number };
export type Leather = { id: LeatherId; hex: string; price: number };

export const MODEL = {
  name: "KAZE GT-01",
  basePrice: 28_400_000, // JPY
};

export const PAINTS: Paint[] = [
  { id: "shu", kanji: "朱", hex: "#c8261c", price: 0 },
  { id: "sumi", kanji: "墨", hex: "#0d0e10", price: 0 },
  { id: "yuki", kanji: "雪", hex: "#e9ebee", price: 380_000 },
  { id: "ai", kanji: "藍", hex: "#1d3a8a", price: 380_000 },
  { id: "matcha", kanji: "抹茶", hex: "#56703a", price: 520_000 },
  { id: "kin", kanji: "金", hex: "#b08d57", price: 520_000 },
];

export const RIMS: RimFinish[] = [
  { id: "chrome", hex: "#ffffff", metalness: 1, roughness: 0.12, price: 0 },
  { id: "gunmetal", hex: "#3a3d42", metalness: 1, roughness: 0.35, price: 240_000 },
  { id: "bronze", hex: "#8a6a3b", metalness: 1, roughness: 0.3, price: 240_000 },
];

export const LEATHERS: Leather[] = [
  { id: "black", hex: "#151515", price: 0 },
  { id: "tan", hex: "#8b5a2b", price: 310_000 },
  { id: "red", hex: "#7a1712", price: 310_000 },
  { id: "white", hex: "#d9d3c7", price: 420_000 },
];

/** Camera shots used by the configurator. The car faces -Z, sits on y=0, ~4.5m long. */
export type ViewId = "exterior" | "front" | "side" | "rear" | "wheel" | "interior" | "engine";
export type CameraShot = { position: Vec3; target: Vec3; inside?: boolean; xray?: boolean };

export const VIEWS: Record<ViewId, CameraShot> = {
  exterior: { position: [4.6, 1.5, -4.9], target: [0, 0.5, 0] },
  front: { position: [1.6, 0.85, -4.6], target: [0.2, 0.55, -1.6] },
  side: { position: [6.4, 0.9, 0], target: [0, 0.5, 0] },
  rear: { position: [-3.6, 1.6, 4.9], target: [0, 0.55, 0] },
  wheel: { position: [2.6, 0.55, -2.2], target: [0.85, 0.36, -1.15] },
  interior: { position: [0.34, 1.0, 0.18], target: [-0.18, 0.86, -0.42], inside: true },
  engine: { position: [-2.4, 2.7, 3.6], target: [0, 0.6, 0.9], xray: true },
};

export const VIEW_BUTTONS: ViewId[] = ["exterior", "side", "rear", "interior", "engine"];

export type Hotspot = { id: HotspotId; position: Vec3; view: ViewId };

export const HOTSPOTS: Hotspot[] = [
  { id: "lights", position: [0.6, 0.66, -2.02], view: "front" },
  { id: "brakes", position: [1.0, 0.42, -1.15], view: "wheel" },
  { id: "cockpit", position: [-0.32, 1.08, -0.15], view: "interior" },
  { id: "engine", position: [0, 1.12, 1.05], view: "engine" },
];

/** Campaign scroll chapters. Camera "shots" are blended as you scroll. */
export type ChapterId = "hero" | keyof Dictionary["chapters"];
export type Chapter = {
  id: ChapterId;
  align: "left" | "right" | "center";
  shot: { position: Vec3; target: Vec3; inside?: boolean };
  xray?: number;
  spin?: number;
  /** horizontal film offset to push the car away from the copy (desktop only) */
  offset?: number;
};

export const CHAPTERS: Chapter[] = [
  {
    id: "hero",
    align: "center",
    shot: { position: [4.2, 1.15, -5.2], target: [0, 0.45, -0.2] },
    spin: 1,
  },
  {
    id: "design",
    align: "left",
    shot: { position: [8.2, 0.9, 0], target: [0, 0.5, 0] },
    offset: -5,
  },
  {
    id: "performance",
    align: "right",
    shot: { position: [-2.9, 2.4, 3.9], target: [0, 0.55, 0.7] },
    xray: 1,
    offset: 6,
  },
  {
    id: "interior",
    align: "left",
    shot: { position: [0.34, 1.0, 0.2], target: [-0.18, 0.86, -0.42], inside: true },
  },
  {
    id: "colors",
    align: "right",
    shot: { position: [-6.0, 1.1, -5.6], target: [0, 0.45, 0] },
    offset: 5,
  },
  {
    id: "build",
    align: "center",
    shot: { position: [-1.6, 1.5, -9.6], target: [0, -0.75, 0] },
    spin: 0.4,
  },
];

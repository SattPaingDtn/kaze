/**
 * English copy. This file defines the `Dictionary` shape; ja.ts must match it
 * exactly (TypeScript fails the build if a key is missing — no silent
 * untranslated strings).
 *
 * Keys under paints / rims / leathers / views / hotspots / chapters are the
 * ids from src/content/car.ts, so data (colours, prices, camera shots) and
 * copy can be edited independently — like separate CMS fields.
 */
export const en = {
  meta: {
    title: "KAZE GT-01 — Wear the wind",
    description: "Interactive 3D campaign microsite and configurator for the fictional KAZE GT-01 grand tourer.",
    configuratorTitle: "Configure your KAZE GT-01",
    configuratorDescription: "Real-time 3D configurator: paint, wheels, leather, interior and x-ray engine views.",
  },
  nav: {
    skip: "Skip to content",
    home: "KAZE home",
    chapters: "Chapters",
    design: "Design",
    performance: "Performance",
    interior: "Interior",
    colors: "Colour",
    configure: "Configure",
    language: "Language",
  },
  hero: {
    eyebrow: "World premiere · Tokyo 2026",
    accent: "風を、まとう。",
    accentLang: "ja",
    tagline: "Wear the wind.",
    scroll: "Scroll",
  },
  chapters: {
    design: {
      eyebrow: "01 — Design",
      title: "Sculpted by the wind",
      body: "One continuous line from nose to tail. A drag coefficient of 0.29 and active aero that hides until 120 km/h.",
    },
    performance: {
      eyebrow: "02 — Performance",
      title: "Electric thrust, endless range",
      body: "A compact twin-cylinder generator sits behind the cabin, feeding two e-axles. 0–100 km/h in 2.9 s.",
    },
    interior: {
      eyebrow: "03 — Interior",
      title: "Made for the driver",
      body: "Physical switches, hand-stitched leather and a steering wheel that tells you everything about the road.",
    },
    colors: {
      eyebrow: "04 — Colour",
      title: "Six colours of Japan",
      body: "From Shu vermilion to Ai indigo — each finish is a seven-layer paint with a clear-coat you can see into.",
    },
    build: {
      eyebrow: "05 — Make it yours",
      title: "Build your GT-01",
      body: "Spin it, open it up, look under the skin. Configure every finish in real-time 3D.",
    },
  },
  campaign: {
    srIntro:
      "This page shows a 3D model of the KAZE GT-01. As you scroll, the camera moves around the car: a side profile, an x-ray view of the engine behind the cabin, the driver's seat, and the colour range.",
    sceneLabel: "3D model of the KAZE GT-01 that moves as you scroll through the story",
    stats: [
      { label: "System output", value: "610", unit: "PS" },
      { label: "0–100 km/h", value: "2.9", unit: "s" },
      { label: "Range", value: "820", unit: "km" },
    ],
    paintLegend: "Choose a paint colour for the 3D car",
    finishesNote: "{count} finishes · try them on the car",
    openConfigurator: "Open the 3D configurator",
  },
  specs: [
    { label: "System output", value: "610 PS" },
    { label: "0–100 km/h", value: "2.9 s" },
    { label: "Top speed", value: "318 km/h" },
    { label: "Range (WLTP)", value: "820 km" },
    { label: "Drag coefficient", value: "0.29 Cd" },
    { label: "Weight", value: "1,640 kg" },
  ],
  paints: {
    shu: "Shu Vermilion",
    sumi: "Sumi Black",
    yuki: "Yuki Pearl",
    ai: "Ai Indigo",
    matcha: "Matcha Green",
    kin: "Kin Champagne",
  },
  rims: { chrome: "Polished", gunmetal: "Gunmetal", bronze: "Satin Bronze" },
  leathers: { black: "Nero", tan: "Cuoio Tan", red: "Shu Red", white: "Washi White" },
  views: {
    exterior: "Exterior",
    front: "Front",
    side: "Profile",
    rear: "Rear",
    wheel: "Wheel",
    interior: "Interior",
    engine: "Engine",
  },
  hotspots: {
    lights: { title: "Kiri LED Matrix", body: "84-segment adaptive headlights that shade oncoming traffic." },
    brakes: { title: "Carbon-ceramic brakes", body: "398 mm discs, 6-piston calipers. 100→0 km/h in 31 m." },
    cockpit: { title: "Driver-first cockpit", body: "Hand-stitched leather, flat-bottom wheel, zero touch-screens." },
    engine: { title: "Twin-cylinder range extender", body: "1.2 L generator + dual e-axles. 610 PS system output." },
  },
  configurator: {
    title: "{model} Configurator",
    back: "Back to the KAZE campaign",
    stats: "Stats",
    stageLabel: "3D view. Arrow keys rotate, plus and minus zoom, Escape returns to the exterior view.",
    sceneLabel: "Interactive 3D configurator. Use arrow keys to rotate, plus and minus to zoom.",
    viewsLabel: "Camera views",
    xray: "X-ray",
    spin: "360° spin",
    closeDetail: "Close detail and return to exterior view",
    lookAround: "Drag to look around the cabin",
    options: "Configuration options",
    paint: "Paint",
    wheels: "Wheels",
    leather: "Leather",
    included: "Included",
    highlights: "Highlights",
    hotspotLabel: "{title}: show detail",
    price: "Estimated price",
    reserve: "Reserve",
    reserveNotice: "This is a portfolio demo — no order was placed.",
    summary: "{model} in {paint}, {rim} wheels, {leather} leather. Total {total}. Current view: {view}.",
  },
  loader: { loading: "Loading 3D model {progress}%", ready: "3D model ready" },
  credits:
    "3D car: “Ferrari 458 Italia” by vicent091036 (CC BY 4.0), via three.js examples. Engine: “2 Cylinder Engine” Khronos glTF Sample Models (CC BY 4.0), conversion by Okino. KAZE is a fictional brand for a portfolio demo.",
};

export type Dictionary = typeof en;

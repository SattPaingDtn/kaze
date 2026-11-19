# KAZE GT-01 — 3D car campaign microsite

This is a practice project for the Omnicom Content Experiences interview, for the **Lead Frontend Developer** role. It is a car-launch microsite with two routes:

| Route | What it shows |
|---|---|
| `/en` · `/ja` **Campaign** | Server-rendered story chapters. Scrolling drives one shared 3D camera through six chapters: hero, side profile, X-ray with the real engine, interior, colour swatches, and build. |
| `/en/configurator` · `/ja/configurator` **Configurator** | Orbit and 360° spin; preset cameras (exterior, profile, rear, wheel, interior look-around, engine); paint, wheel and leather options with a live price; 3D hotspots; X-ray mode; keyboard control. |

Fully bilingual **English / 日本語**. The EN | JP switch keeps your place: the same chapter, and the same build in the configurator.

Stack: **Next.js 16 (App Router) · React 19 · TypeScript · SCSS modules · three.js r187 · @react-three/fiber 9 · drei 10 · GSAP 3 + ScrollTrigger**. The same stack as the job description, with no CMS backend yet; the content is typed data in `src/content/car.ts`.

---

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000 (Next picks 3001 if 3000 is busy). `/` redirects to `/ja` or `/en` based on your browser language.

- Add `?perf` to either URL, or press **Stats** in the configurator, to show the live HUD: FPS, draw calls, triangles, DPR, geometries and textures. When nothing moves it says **"idle (0 GPU work)"**. That is render-on-demand at work.
- To test the production build:

  ```bash
  npm run build && npm start
  ```

  Both routes prerender as static pages.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run optimize:models` re-compresses `assets-src/engine.glb` → `public/models/engine.v1.glb` (Draco). Re-exporting? Bump to `.v2` in the file name and in `ENGINE_URL`, because `/models` is cached as immutable.

---

## Architecture

```
src/
  proxy.ts                  "/" → /en or /ja (cookie → Accept-Language → default)
  app/                      Server Components (HTML + SEO copy, no three.js)
    [lang]/layout.tsx       root layout: <html lang>, fonts (Inter, Michroma, Noto Sans JP), skip link
    [lang]/page.tsx         campaign chapters, sr-only scene description, credits
    [lang]/configurator/page.tsx
    globals.scss            tokens, layout, Japanese typography, reduced-motion, focus-visible
  i18n/
    config.ts               LOCALES, cookie name, path helpers (shared by proxy, server, client)
    dictionaries/en.ts      all English copy; defines the Dictionary type
    dictionaries/ja.ts      日本語 copy, typed as Dictionary (missing key = build error)
    format.ts               fmt("{x}") + formatPrice (¥28,400,000 / 2,840万円)
    metadata.ts             canonical + hreflang alternates
  content/car.ts            typed data only (ids, colours, prices, camera shots); no copy
  lib/
    store.ts                tiny external stores (useSyncExternalStore) shared by DOM ↔ WebGL
    device.ts               detectTier() + useReducedMotion()
  components/
    campaign/               CampaignStage (client, dynamic import) → CampaignScene (R3F)
                            CampaignScroll (GSAP: scroll → chapter float), ColorPicker
    configurator/           Configurator (DOM UI) → ConfiguratorScene (R3F, camera rig, hotspots)
    three/                  shared 3D: Stage (Canvas), Car, Engine, Studio, shaders, Perf probe
    ui/                     Loader, PerfHud, LanguageSwitcher: DOM only, never import R3F/drei
```

**The rule:** DOM components never import `@react-three/*` or `three`. They talk to the 3D layer through `lib/store.ts`: `scrollState`, `campaignStore`, `loadingStore` and `perfState`. That keeps three.js out of the first-load bundle (see the numbers below).

**How the scroll story works.**
1. `CampaignScroll` turns the scroll position into a single float, `scrollState.chapter` (for example `2.4` means 40% of the way from chapter 2 to chapter 3).
2. `ScrollRig` (inside the Canvas) reads that float every frame and blends the two neighbouring camera shots from `CHAPTERS`. Each shot sets `pos`, `target`, `offset`, `xray` and `spin`.
3. It eases toward the blend with `MathUtils.damp`, so wheel and trackpad jitter is smoothed.
4. `camera.filmOffset` shifts the car sideways so it never sits under the copy. In portrait, the camera pulls back 1.75×.

**Targets vs live values.** The UI writes *targets* (paint hex, xray 0/1, wheel spin). `Car` eases its *live* values toward them in `useFrame`. Colour swaps and the X-ray cross-fade are therefore always animated, and React never re-renders during an animation.

---

## Performance: what we did and why (with numbers)

| Technique | Where | Effect |
|---|---|---|
| **Draco geometry compression** | `public/models/*.glb`, decoder self-hosted in `public/draco/` | Engine: **1.84 MB → 218 KB (−88%)**. The car GLB was already Draco (1.6 MB). Self-hosting the decoder means no third-party CDN at runtime. |
| **`next/dynamic(..., { ssr: false })`** | `CampaignStage`, `Configurator` | three.js and R3F load in a lazy chunk (~287 KB gz). The copy paints before any WebGL code downloads, which helps LCP. |
| **Keep R3F out of DOM components** | `ui/Loader`, `ui/PerfHud`, `lib/store` | Campaign first-load JS dropped from **~468 KB → ~223 KB gz**. The Loader originally used drei's `useProgress`, which pulled all of three into the main bundle. |
| **Render on demand** | `frameloop="demand"` + `invalidate()` while something animates | When idle the GPU draws **0 frames**: no battery drain and no fan noise. The configurator switches to `"always"` only for auto-spin or X-ray. |
| **DPR cap per device tier** | `Stage.tsx`, `lib/device.ts` | A 3× phone would render 9× the pixels. We cap at 2 (high tier) or 1.5 (low tier). Fill-rate is the #1 mobile GPU cost. |
| **PerformanceMonitor** | `Stage.tsx` | If FPS drops, DPR goes to 1. It recovers when there's headroom. After 3 flip-flops it stays at 1. |
| **Baked shadow (AO texture)** | `car_ao.png` (39 KB), MultiplyBlending | No shadow maps and no extra depth pass. Real-time shadows would re-render the car from the light every frame. |
| **Lightformer environment, `frames={1}`** | `Studio.tsx` | Studio reflections are generated once on the GPU instead of downloading a 1–6 MB HDR. Resolution is 256 (high tier) or 128 (low tier). |
| **Opacity glass instead of `transmission`** | `Car.tsx` | `transmission` renders the scene a second time into a texture. Too expensive for phones. |
| **Hotspot dot-product test instead of `occlude`** | `ConfiguratorScene.tsx` | drei's `occlude` raycasts against ~360k triangles every frame. A `dot(normal, toCamera)` check costs almost nothing. |
| **Progressive loading** | `DeferredEngine` in `Car.tsx` | The engine GLB is requested in `requestIdleCallback` (2.5 s timeout) after the car is on screen, so it never competes with the hero. |
| **Shared geometry for the X-ray ghost** | `Car.tsx` | `Object3D.clone()` shares BufferGeometry, so the X-ray copy costs no extra GPU memory. |
| **Toggle `material.transparent` only on change** | `Car.tsx` | Changing it recompiles the shader program. Doing it every frame would stutter. |
| **Manual `dispose()`** | `Car.tsx`, `Engine.tsx` | R3F only disposes what it created declaratively. Materials we build by hand must be disposed on unmount, or route changes leak GPU memory. |
| **Immutable cache headers** | `next.config.ts` for `/models/*`, `/draco/*` | Repeat visits never re-download models. Safe because every file name carries a version (`car.v1.glb`, `draco/r187/`). |

Baseline in the HUD (desktop, campaign): **~53 draw calls, ~359k triangles**, 0 frames when idle.

### What I would add next (good interview answers)
- **KTX2 / Basis textures**: GPU-compressed textures stay compressed in VRAM; PNG/JPG decode to full RGBA. Run `gltf-transform uastc` or `etc1s` and add `KTX2Loader`.
- **LOD**: `<Detailed distances={[0, 15, 30]}>` with a simplified mesh (`gltf-transform simplify`). This car didn't need it: simplifying saved only ~12%.
- **Instancing** for repeated parts (bolts, lights): `InstancedMesh` makes one draw call per material.
- **Merge static meshes by material** to cut draw calls.
- **Lenis smooth scroll** + `ScrollTrigger.scrollerProxy`.
- **Post-processing** (bloom on the X-ray) with `@react-three/postprocessing`. Only on the high tier: every pass is a full-screen fill.
- **Headless CMS** (Contentful/Sanity/microCMS): `src/content/car.ts` already has the shape. Fetch it in the Server Component with ISR.
- **Deploy**: Vercel, or S3 + CloudFront with long-cache headers for `/models` and `/draco`. Set `NEXT_PUBLIC_SITE_URL` before building (Vercel fills it in from the production domain; under CI the build fails without it, see `src/lib/site.ts`).

---

## Bilingual EN / JA: how it works

**Why locale URLs (`/en`, `/ja`) and not a client-side toggle?**
- Each language is its own **prerendered static HTML** page with the right `<html lang>`. Google indexes both, and the `hreflang` tags tell it they are translations of each other.
- Screen readers pick the correct voice from `lang`. JIS X 8341 requires the page language to be set correctly (WCAG 3.1.1), and `lang="ja"` also switches the browser to Japanese line-breaking rules.
- No flash of the wrong language and no layout shift. A client toggle would render EN first and then swap the text.

**Request flow:**
1. `proxy.ts` runs only for un-prefixed URLs. It picks `NEXT_LOCALE` cookie → `Accept-Language` (honouring `q=` values) → `en`, then redirects with a 307.
2. `app/[lang]/layout.tsx` uses `generateStaticParams` with `dynamicParams = false`, so both locales build at compile time and anything else is a 404.
3. Server Components call `getDictionary(lang)`. Each locale is a separate dynamic import, and the dictionaries never reach the client bundle.
4. Client components (Configurator, ColorPicker, Loader, 3D labels) receive **only the strings they need as props**. The other language is never downloaded.

**Data vs copy.** `content/car.ts` holds the locale-independent data: hex colours, prices, camera shots. The dictionaries hold the words, keyed by the same ids. A headless CMS models it the same way, with "global" fields and "localised" fields. `ja.ts` is typed as `Dictionary`, so a missing translation fails `tsc`.

**The switcher keeps context.** It renders real `<a hreflang>` links, so it works without JS and is crawlable. On click it:
- saves the cookie,
- keeps the **current chapter** (`/ja#interior` → `/en#interior`),
- keeps the **configurator build**, which lives in the query string: `?paint=ai&rim=bronze&leather=tan&view=interior`. That also makes every build a shareable link.

It is a soft navigation, and the GLB cache survives it, so the 3D scene doesn't download again.

**Localisation, not just translation:**
| | EN | JA |
|---|---|---|
| Price | ¥29,330,000 | 2,933万円 (how Japanese car brochures write it) |
| Range test cycle | WLTP | WLTC (the Japanese standard) |
| Units | 2.9 s | 2.9秒 |
| Tagline accent | 風を、まとう。 (in `lang="ja"`) | Wear the wind. (in `lang="en"`) |

**Japanese typography** (`globals.scss`, `html:lang(ja)` block):
- **Noto Sans JP via `next/font`** with `preload: false`. A full JP font is several MB, but Google splits it into ~100 `unicode-range` slices and the browser fetches only the slices for glyphs on the page. Hiragino / Yu Gothic show until it loads, so it never blocks paint.
- Headings switch from Michroma (a wide Latin display face) to Noto Sans JP 700, with `font-feature-settings: "palt"` for proportional kana spacing.
- `line-height: 1.95` for body text, because CJK needs more leading than Latin.
- `word-break: auto-phrase` (Chrome 119+) wraps between phrases (文節) instead of mid-word. `line-break: strict` applies 禁則処理, so no line starts with 。、ー.
- Uppercase letter-spacing is reduced and `text-transform` is turned off on labels. Wide tracking looks broken on kana, and "km/h" must not become "KM/H".

**On a static host** (S3 + CloudFront) there is no Next server: the proxy logic becomes a CloudFront Function on viewer-request, and the four pages are plain HTML files.

---

## GLSL in 2 minutes (using our X-ray shader)

File: `src/components/three/shaders.ts`.

```
JS (every frame) ──uniforms──▶ vertex shader ──varyings──▶ fragment shader ──▶ pixel
                               ▲
                     attributes (per vertex, from the GLB): position, normal
```

- **Attributes:** per-vertex data stored in the geometry: `position`, `normal`, `uv`. They differ for every vertex.
- **Uniforms:** values sent from JavaScript, the same for the whole draw call. Examples: `uTime`, `uOpacity`, `uSweep`, `uColor`. Update `material.uniforms.uTime.value = t`. Never create a new material for this.
- **Varyings:** outputs of the vertex shader. The GPU *interpolates* them across each triangle and the fragment shader reads them per pixel. Ours are `vNormal`, `vViewDir` and `vWorldPos`.
- **Fresnel:** `pow(1 - |dot(normal, viewDir)|, 2.2)`. It is 0 where a surface faces you and 1 at silhouettes. That is why the car looks like glowing edges.
- **Scan band:** `smoothstep(0.12, 0.0, abs(vWorldPos.z - uSweep))` is a bright stripe where the world-Z equals the uniform that JS animates.
- **Additive blending + `depthWrite: false`:** overlapping layers add light instead of hiding each other. That gives the hologram look, but it also stacks up fast. That's why the alpha per layer is tiny.

The floor shader shows two more ideas: a grid that scrolls with a `uTravel` uniform (the car looks like it's driving while nothing moves), and `#include <colorspace_fragment>` so a custom shader matches three's colour management.

---

## Accessibility (JIS X 8341-3 / WCAG 2.1 AA): what is implemented

- [x] **Real HTML for all content.** The copy is server-rendered; the canvas is decoration plus an interactive extra. The `<canvas>` has `role="img"`, an `aria-label` and an sr-only description.
- [x] **Skip link and landmarks** (`header`, `main`, `nav`, `aside`, `footer`).
- [x] **Keyboard (2.1.1).** The configurator stage is focusable: arrows orbit, Shift+arrows take bigger steps, +/− zoom, Esc returns to exterior. Hotspots are real `<button>`s inside drei `<Html>`.
- [x] **Native controls.** Swatches are `<input type="radio">` inside `<fieldset>`/`<legend>`. Toggles are buttons with `aria-pressed`.
- [x] **Status announcements.** An `aria-live="polite"` summary reads the configuration and price. The loader is `role="status"`.
- [x] **`prefers-reduced-motion`.** No wheel spin, no scan sweep, no auto-rotate, and instant camera moves. The CSS turns off reveal animations.
- [x] **Contrast ≥ 4.5:1.** Gradient scrims sit behind copy that overlaps the 3D scene.
- [x] **Focus visible** on everything. Touch targets are ≥ 24 px (hotspots are 28 px on mobile).
- [x] **`lang`** on the document, per locale (`<html lang="ja">` on `/ja`). Mixed-language phrases get their own `lang` span. The switcher links have `hreflang` and `lang`, and each language name is written in its own language ("日本語").

---

## Mobile checklist (what we tested)

- Device tier: coarse pointer, width < 768, ≤ 4 cores or ≤ 4 GB RAM → "low". Low tier gets DPR ≤ 1.5 and a 128 px environment map.
- Portrait framing: the camera pulls back and the target drops so the whole car fits above the copy. The configurator's `fit = clamp(1.6 / aspect, 1, 2.1)` keeps the profile view uncropped.
- `touch-action` is left alone on the campaign: the stage has `pointer-events: none`, so the page always scrolls and the canvas never steals the gesture. The configurator stage is a fixed box with its own controls.
- Big tap targets; the options panel stacks under the stage.

---

## Interview demo script (~5 minutes)

1. **Open `/ja?perf`, then press EN.** "Each language is a static page with correct `lang` and hreflang. The switch keeps the chapter and the 3D scene isn't re-downloaded."
2. **Scroll from the top with `?perf`.** "Copy is server-rendered: view source, it's all there. three.js arrives in a lazy chunk."
   Scroll slowly. "One camera, six shots blended from a single scroll float. `filmOffset` keeps the car off the text." Point out the HUD: the frame count stops when you stop scrolling.
3. **Performance chapter.** "X-ray is a custom Fresnel shader that reuses the car's geometry. The engine GLB was 1.8 MB. Draco brought it to 218 KB, and it loads at idle time."
4. **Open `/ja/configurator?paint=ai&rim=bronze&leather=tan`.** The build loads from the URL, priced 2,933万円. Change paint (smooth colour lerp), wheels (camera flies to the wheel), leather (camera goes inside). Then a hotspot, X-ray, and the 360° spin.
5. **Keyboard only.** Tab to the stage, orbit with the arrows, press Esc. Mention JIS X 8341 and the aria-live price.
6. **Mobile emulation.** Show DPR capped, the HUD numbers, and the layout.
7. **Questions to expect:** "How would you make this faster?" (see *What I would add next*). "Why R3F instead of vanilla three?" (declarative scene, React state, same three objects underneath; drop to `useFrame`/refs for hot paths). "How do you avoid memory leaks?" (`dispose`, shared geometry, one Canvas per route).

---

## Credits and licences

- **Car:** "Ferrari 458 Italia" glTF by vicent091036, from the three.js examples (`examples/models/gltf/ferrari.glb`). **CC BY 4.0.** Baked AO shadow from the same example. The campaign rebrands it as the fictional "KAZE GT-01" for practice only.
- **Engine:** "2 Cylinder Engine" from KhronosGroup glTF-Sample-Models, **CC BY 4.0**, donated and converted by Okino Computer Graphics. Reskinned with PBR metals and Draco-compressed.
- **Draco decoder:** Google, Apache-2.0 (copied from `three/examples/jsm/libs/draco/gltf`, the glTF-only build).
- **Fonts:** Inter and Michroma via `next/font` (SIL OFL).

The KAZE brand, copy and prices are invented. This is a non-commercial portfolio demo.
# kaze

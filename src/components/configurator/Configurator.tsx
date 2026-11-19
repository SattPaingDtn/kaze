"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HOTSPOTS, LEATHERS, MODEL, PAINTS, RIMS, VIEWS, VIEW_BUTTONS, type Hotspot, type ViewId } from "@/content/car";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localePath, type Locale } from "@/i18n/config";
import { fmt, formatPrice } from "@/i18n/format";
import { detectTier, useReducedMotion, type Tier } from "@/lib/device";
import { Loader } from "../ui/Loader";
import { PerfHud } from "../ui/PerfHud";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { SoundToggle, useCue } from "../ui/SoundToggle";
import { play } from "@/lib/audio";
import type { RigApi } from "./ConfiguratorScene";
import styles from "./Configurator.module.scss";

const ConfiguratorScene = dynamic(() => import("./ConfiguratorScene"), { ssr: false });

/** The slice of the dictionary this client component needs (sent as props, not bundled). */
export type ConfiguratorText = {
  ui: Dictionary["configurator"];
  nav: Dictionary["nav"];
  loader: Dictionary["loader"];
  paints: Dictionary["paints"];
  rims: Dictionary["rims"];
  leathers: Dictionary["leathers"];
  views: Dictionary["views"];
  hotspots: Dictionary["hotspots"];
};

type RimId = (typeof RIMS)[number]["id"];

const DEFAULTS = { paint: PAINTS[0].id, rim: RIMS[0].id, leather: LEATHERS[0].id, view: "exterior" as ViewId };

export function Configurator({ locale, t }: { locale: Locale; t: ConfiguratorText }) {
  const [tier, setTier] = useState<Tier | null>(null);
  const reduced = useReducedMotion();
  const [paint, setPaint] = useState(DEFAULTS.paint);
  const [rim, setRim] = useState<RimId>(DEFAULTS.rim);
  const [leather, setLeather] = useState(DEFAULTS.leather);
  const [view, setView] = useState<ViewId>(DEFAULTS.view);
  const [xray, setXray] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [stats, setStats] = useState(false);
  const [hotspot, setHotspot] = useState<Hotspot | null>(null);
  const [notice, setNotice] = useState("");
  const rig = useRef<RigApi>(null);
  const fromUrl = useRef(false);

  // Sound design: every state change has a voice (silent until the visitor turns sound on)
  useCue(paint, "paint");
  useCue(rim, "tick");
  useCue(leather, "tick");
  useCue(view, (v) => (v === "engine" ? "launch" : "view"));
  useCue(xray, (x) => (x ? "xray" : "tick"));
  useCue(autoRotate, (a) => (a ? "view" : "tick"));
  useCue(hotspot?.id ?? null, (h) => (h ? "ping" : null));

  // Restore a build from the URL (?paint=ai&rim=bronze&leather=tan&view=interior):
  // shareable links, and the language switcher keeps your build.
  useEffect(() => {
    setTier(detectTier());
    const q = new URLSearchParams(window.location.search);
    setStats(q.has("perf"));
    const p = PAINTS.find((x) => x.id === q.get("paint"));
    const r = RIMS.find((x) => x.id === q.get("rim"));
    const l = LEATHERS.find((x) => x.id === q.get("leather"));
    const v = q.get("view");
    if (p) setPaint(p.id);
    if (r) setRim(r.id);
    if (l) setLeather(l.id);
    if (v && Object.hasOwn(VIEWS, v)) setView(v as ViewId); // not `in`: "constructor" in VIEWS is true
    fromUrl.current = true;
  }, []);

  // ...and write it back (replaceState: no history entry per click; Next keeps its router in sync).
  useEffect(() => {
    if (!fromUrl.current) return;
    const q = new URLSearchParams(window.location.search);
    const set = (k: string, v: string, def: string) => (v === def ? q.delete(k) : q.set(k, v));
    set("paint", paint, DEFAULTS.paint);
    set("rim", rim, DEFAULTS.rim);
    set("leather", leather, DEFAULTS.leather);
    set("view", view, DEFAULTS.view);
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [paint, rim, leather, view]);

  const p = PAINTS.find((x) => x.id === paint)!;
  const r = RIMS.find((x) => x.id === rim)!;
  const l = LEATHERS.find((x) => x.id === leather)!;
  const total = MODEL.basePrice + p.price + r.price + l.price;
  const price = (n: number) => formatPrice(n, locale);
  const option = (name: string, n: number) => `${name} · ${n ? `+${price(n)}` : t.ui.included}`;

  const onHotspot = useCallback((h: Hotspot) => {
    setHotspot(h);
    setView(h.view);
  }, []);

  // Keyboard controls on the 3D stage (JIS X 8341 / WCAG 2.1.1: everything works without a mouse)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // don't hijack keys from buttons inside the stage
    const api = rig.current;
    if (!api) return;
    const step = e.shiftKey ? 0.35 : 0.12;
    const map: Record<string, () => void> = {
      ArrowLeft: () => api.orbit(-step, 0),
      ArrowRight: () => api.orbit(step, 0),
      ArrowUp: () => api.orbit(0, -step / 2),
      ArrowDown: () => api.orbit(0, step / 2),
      "+": () => api.zoom(0.9),
      "=": () => api.zoom(0.9),
      "-": () => api.zoom(1.1),
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  };

  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && (hotspot || view !== "exterior")) {
        setHotspot(null);
        setView("exterior");
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [hotspot, view]);

  const hotspotLabels = Object.fromEntries(
    HOTSPOTS.map((h) => [h.id, fmt(t.ui.hotspotLabel, { title: t.hotspots[h.id].title })]),
  ) as Record<Hotspot["id"], string>;

  const summary = fmt(t.ui.summary, {
    model: MODEL.name,
    paint: t.paints[paint],
    rim: t.rims[rim],
    leather: t.leathers[leather],
    total: price(total),
    view: t.views[view],
  });

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href={localePath(locale)} className={styles.back} aria-label={t.ui.back}>
          <span aria-hidden="true">←</span> KAZE<span className={styles.kanji} aria-hidden="true">風</span>
        </Link>
        <h1 className={styles.title}>{fmt(t.ui.title, { model: MODEL.name })}</h1>
        <LanguageSwitcher locale={locale} label={t.nav.language} />
        <SoundToggle label={t.nav.sound} />
        <button type="button" className={styles.ghostBtn} aria-pressed={stats} onClick={() => setStats((s) => !s)}>
          {t.ui.stats}
        </button>
      </header>

      <main id="main" className={styles.main}>
        <div className={styles.stage} tabIndex={0} onKeyDown={onKeyDown} aria-label={t.ui.stageLabel} aria-describedby="cfg-summary">
          {tier && (
            <ConfiguratorScene
              tier={tier}
              reducedMotion={reduced}
              paint={p.hex}
              rim={rim}
              leather={l.hex}
              view={view}
              xray={xray}
              autoRotate={autoRotate}
              activeHotspot={hotspot?.id ?? null}
              onHotspot={onHotspot}
              rigRef={rig}
              sceneLabel={t.ui.sceneLabel}
              hotspotLabels={hotspotLabels}
            />
          )}

          <div className={styles.views} role="toolbar" aria-label={t.ui.viewsLabel}>
            {VIEW_BUTTONS.map((v) => (
              <button
                key={v}
                type="button"
                className={styles.chip}
                aria-pressed={view === v}
                onClick={() => {
                  setHotspot(null);
                  setView(v);
                }}
              >
                {t.views[v]}
              </button>
            ))}
          </div>

          <div className={styles.toggles}>
            <button type="button" className={styles.chip} aria-pressed={xray || !!VIEWS[view].xray} onClick={() => setXray((x) => !x)}>
              {t.ui.xray}
            </button>
            <button type="button" className={styles.chip} aria-pressed={autoRotate} onClick={() => setAutoRotate((a) => !a)} disabled={reduced}>
              {t.ui.spin}
            </button>
          </div>

          {hotspot && (
            <div className={styles.info} role="dialog" aria-modal="false" aria-labelledby="hs-title">
              <h2 id="hs-title">{t.hotspots[hotspot.id].title}</h2>
              <p>{t.hotspots[hotspot.id].body}</p>
              <button
                type="button"
                className={styles.close}
                onClick={() => {
                  setHotspot(null);
                  setView("exterior");
                }}
                aria-label={t.ui.closeDetail}
              >
                ×
              </button>
            </div>
          )}

          {VIEWS[view].inside && <p className={styles.hint}>{t.ui.lookAround}</p>}
        </div>

        <aside className={styles.panel} aria-label={t.ui.options}>
          <Group legend={t.ui.paint} value={option(t.paints[paint], p.price)}>
            {PAINTS.map((x) => (
              <Swatch key={x.id} name="paint" label={t.paints[x.id]} hex={x.hex} checked={paint === x.id} onChange={() => {
                setPaint(x.id);
                if (VIEWS[view].inside || view === "engine") setView("exterior");
              }} />
            ))}
          </Group>

          <Group legend={t.ui.wheels} value={option(t.rims[rim], r.price)}>
            {RIMS.map((x) => (
              <Swatch key={x.id} name="rim" label={t.rims[x.id]} hex={x.hex} metallic checked={rim === x.id} onChange={() => {
                setRim(x.id);
                setView("wheel");
              }} />
            ))}
          </Group>

          <Group legend={t.ui.leather} value={option(t.leathers[leather], l.price)}>
            {LEATHERS.map((x) => (
              <Swatch key={x.id} name="leather" label={t.leathers[x.id]} hex={x.hex} checked={leather === x.id} onChange={() => {
                setLeather(x.id);
                setView("interior");
              }} />
            ))}
          </Group>

          <div className={styles.hotspotList}>
            <h2 className={styles.legend}>{t.ui.highlights}</h2>
            <ul>
              {HOTSPOTS.map((h) => (
                <li key={h.id}>
                  <button type="button" className={styles.linkBtn} onClick={() => onHotspot(h)}>
                    {t.hotspots[h.id].title}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.total}>
            <div>
              <span className={styles.legend}>{t.ui.price}</span>
              <strong>{price(total)}</strong>
            </div>
            <button type="button" className="btn" onClick={() => {
              setNotice(t.ui.reserveNotice);
              play("confirm");
            }}>
              {t.ui.reserve}
            </button>
          </div>
          <p className={styles.notice} role="status">{notice}</p>
        </aside>
      </main>

      <p id="cfg-summary" className="sr-only" aria-live="polite">{summary}</p>
      {tier && <Loader text={t.loader} />}
      {stats && tier && <PerfHud tier={tier} />}
    </div>
  );
}

function Group({ legend, value, children }: { legend: string; value: string; children: React.ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <p className={styles.value}>{value}</p>
      <div className={styles.swatches}>{children}</div>
    </fieldset>
  );
}

function Swatch({ name, label, hex, checked, onChange, metallic }: { name: string; label: string; hex: string; checked: boolean; onChange: () => void; metallic?: boolean }) {
  return (
    <label className={styles.swatch} data-metallic={metallic} style={{ "--swatch": hex } as React.CSSProperties} title={label}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span className="sr-only">{label}</span>
    </label>
  );
}

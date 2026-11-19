"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LEATHERS, PAINTS, RIMS } from "@/content/car";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localePath, type Locale } from "@/i18n/config";
import { detectTier, useReducedMotion, type Tier } from "@/lib/device";
import type { CarTargets } from "../three/Car";
import { Loader } from "../ui/Loader";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { SoundToggle, useCue } from "../ui/SoundToggle";
import type { DriveBus } from "./DriveScene";
import styles from "./TestDrive.module.scss";

// MapLibre + three.js only load on this route, and only in the browser.
const DriveScene = dynamic(() => import("./DriveScene"), { ssr: false });

export type DriveText = {
  ui: Dictionary["testDrive"];
  nav: Dictionary["nav"];
  loader: Dictionary["loader"];
  paints: Dictionary["paints"];
};

type Pedal = "left" | "right" | "brake" | "throttle";

const KEYS: Record<string, Pedal> = {
  ArrowUp: "throttle",
  KeyW: "throttle",
  ArrowDown: "brake",
  KeyS: "brake",
  Space: "brake",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

export function TestDrive({ locale, t }: { locale: Locale; t: DriveText }) {
  const [tier, setTier] = useState<Tier | null>(null);
  const reduced = useReducedMotion();
  const [paint, setPaint] = useState(PAINTS[0].id);
  const [build, setBuild] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bump, setBump] = useState(0);
  const targets = useRef<CarTargets>({ paint: PAINTS[0].hex, rim: RIMS[0].id, leather: LEATHERS[0].hex, xray: 0, spin: 0 });
  const bus = useRef<DriveBus>({ input: { throttle: 0, brake: 0, steer: 0 }, reset: false });
  const held = useRef({ keys: new Set<Pedal>(), touch: new Set<Pedal>() });
  const speedEl = useRef<HTMLSpanElement>(null);
  const gearEl = useRef<HTMLSpanElement>(null);
  const srSpeed = useRef<HTMLParagraphElement>(null);

  useCue(paint, "paint");

  // Same build as the configurator link that brought you here (?paint=ai&rim=bronze&leather=tan)
  useEffect(() => {
    setTier(detectTier());
    const q = new URLSearchParams(window.location.search);
    const p = PAINTS.find((x) => x.id === q.get("paint"));
    const r = RIMS.find((x) => x.id === q.get("rim"));
    const l = LEATHERS.find((x) => x.id === q.get("leather"));
    if (p) setPaint(p.id);
    if (r) targets.current.rim = r.id;
    if (l) targets.current.leather = l.hex;
    setBuild(window.location.search);
  }, []);

  useEffect(() => {
    targets.current.paint = PAINTS.find((x) => x.id === paint)!.hex;
    const q = new URLSearchParams(window.location.search);
    if (paint === PAINTS[0].id) q.delete("paint");
    else q.set("paint", paint);
    const qs = q.toString() ? `?${q}` : "";
    window.history.replaceState(window.history.state, "", window.location.pathname + qs);
    setBuild(qs);
  }, [paint]);

  // Pedals: keyboard and touch buttons feed one input object the physics loop reads every frame.
  useEffect(() => {
    const sync = () => {
      const on = (p: Pedal) => held.current.keys.has(p) || held.current.touch.has(p);
      const input = bus.current.input;
      input.throttle = on("throttle") ? 1 : 0;
      input.brake = on("brake") ? 1 : 0;
      input.steer = (on("right") ? 1 : 0) - (on("left") ? 1 : 0);
    };
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "KeyR" && !e.repeat) {
        bus.current.reset = true;
        return;
      }
      const pedal = KEYS[e.code];
      if (!pedal) return;
      e.preventDefault(); // no page scroll, no Space-click on a focused button
      held.current.keys.add(pedal);
      sync();
    };
    const up = (e: KeyboardEvent) => {
      const pedal = KEYS[e.code];
      if (!pedal) return;
      held.current.keys.delete(pedal);
      sync();
    };
    const release = () => {
      held.current.keys.clear();
      held.current.touch.clear();
      sync();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release); // alt-tab with a key down must not leave the throttle stuck
    bus.current.sync = sync;
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, []);

  // Telemetry goes straight into the DOM: 60 updates a second without 60 React renders.
  useEffect(() => {
    let lastSr = 0;
    const b = bus.current;
    b.onTelemetry = (car) => {
      const kmh = Math.round(Math.abs(car.speed) * 3.6);
      if (speedEl.current) speedEl.current.textContent = String(kmh);
      if (gearEl.current) gearEl.current.textContent = car.speed < -0.3 ? "R" : car.speed > 0.3 ? "D" : "N";
      const now = performance.now();
      if (srSpeed.current && now - lastSr > 4000) {
        lastSr = now; // screen readers: a calm update every few seconds, not 60 a second
        srSpeed.current.textContent = `${kmh} ${t.ui.speedUnit}`;
      }
    };
    b.onBump = () => setBump((n) => n + 1);
    b.onStatus = setStatus;
  }, [t.ui.speedUnit]);

  useEffect(() => {
    if (!bump) return;
    const id = window.setTimeout(() => setBump(0), 1800);
    return () => window.clearTimeout(id);
  }, [bump]);

  const pedal = (p: Pedal) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep the pedal pressed if the thumb slides off
      } catch {}
      held.current.touch.add(p);
      bus.current.sync?.();
    },
    onPointerUp: () => {
      held.current.touch.delete(p);
      bus.current.sync?.();
    },
    onPointerCancel: () => {
      held.current.touch.delete(p);
      bus.current.sync?.();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // long-press on phones
  });

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href={localePath(locale)} className={styles.back} aria-label={t.ui.back}>
          <span aria-hidden="true">←</span> KAZE<span className={styles.kanji} aria-hidden="true">風</span>
        </Link>
        <h1 className={styles.title}>{t.ui.title}</h1>
        <LanguageSwitcher locale={locale} label={t.nav.language} />
        <SoundToggle label={t.nav.sound} />
        <Link href={localePath(locale, "/configurator") + build} className="btn btn--small">
          {t.nav.configure}
        </Link>
      </header>

      <main id="main" className={styles.stage} aria-label={t.ui.stageLabel}>
        {tier && (
          <DriveScene tier={tier} reducedMotion={reduced} locale={locale} targets={targets} bus={bus} label={t.ui.sceneLabel} />
        )}

        <div className={styles.dash} aria-hidden="true">
          <span className={styles.speed}>
            <span ref={speedEl}>0</span>
            <small>{t.ui.speedUnit}</small>
          </span>
          <span className={styles.gear} title={t.ui.gear}>
            <span ref={gearEl}>N</span>
          </span>
        </div>
        <p ref={srSpeed} className="sr-only" aria-live="polite" />

        <div className={styles.tools}>
          <fieldset className={styles.paints}>
            <legend className="sr-only">{t.ui.paint}</legend>
            {PAINTS.map((x) => (
              <label key={x.id} className={styles.swatch} style={{ "--swatch": x.hex } as React.CSSProperties} title={t.paints[x.id]}>
                <input type="radio" name="paint" checked={paint === x.id} onChange={() => setPaint(x.id)} />
                <span className="sr-only">{t.paints[x.id]}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className={styles.chip} onClick={() => (bus.current.reset = true)}>
            {t.ui.reset}
          </button>
        </div>

        <p className={styles.hint}>
          <span className={styles.keysHint}>{t.ui.hint}</span>
          <span className={styles.touchHint}>{t.ui.touchHint}</span>
        </p>

        <div className={styles.pedals}>
          <div className={styles.steer}>
            <button type="button" className={styles.pad} aria-label={t.ui.left} {...pedal("left")}>
              <span aria-hidden="true">◀</span>
            </button>
            <button type="button" className={styles.pad} aria-label={t.ui.right} {...pedal("right")}>
              <span aria-hidden="true">▶</span>
            </button>
          </div>
          <div className={styles.steer}>
            <button type="button" className={styles.pad} data-kind="brake" aria-label={t.ui.brake} {...pedal("brake")}>
              <span aria-hidden="true">▼</span>
            </button>
            <button type="button" className={styles.pad} data-kind="throttle" aria-label={t.ui.throttle} {...pedal("throttle")}>
              <span aria-hidden="true">▲</span>
            </button>
          </div>
        </div>

        <p className={styles.toast} role="status" data-show={bump > 0}>
          {bump > 0 ? t.ui.bump : ""}
        </p>

        {status !== "ready" && (
          <div className={styles.cover} role="status">
            <p>{status === "error" ? t.ui.error : t.ui.mapLoading}</p>
          </div>
        )}
      </main>

      {tier && <Loader text={t.loader} />}
    </div>
  );
}

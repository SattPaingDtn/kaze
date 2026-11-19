"use client";

import { useEffect, useRef } from "react";
import { initSound, play, setSound, soundStore, type Cue } from "@/lib/audio";
import { campaignStore, useStore } from "@/lib/store";

/**
 * Header sound switch (WCAG 1.4.2 audio control). A real <button> with
 * aria-pressed, so screen readers announce "Sound, toggle button, pressed".
 * The bars animate while sound is on (reduced-motion users get static bars).
 */
export function SoundToggle({ label }: { label: string }) {
  const on = useStore(soundStore, (s) => s.on);
  useEffect(initSound, []);
  return (
    <button type="button" className="sound-toggle" aria-pressed={on} aria-label={label} title={label} onClick={() => setSound(!on)}>
      <span className="sound-toggle__bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

/** Plays a cue when `value` changes — never on the first render (page load / URL restore). */
export function useCue<T>(value: T, cue: Cue | ((v: T) => Cue | null)) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const c = typeof cue === "function" ? cue(value) : cue;
    if (c) play(c);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Campaign page cues: paint swatches + a gust of wind on every chapter (a launch on Performance). */
export function CampaignSounds() {
  const paint = useStore(campaignStore, (s) => s.paint);
  useCue(paint, "paint");

  useEffect(() => {
    const seen = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!seen.has(e.target)) {
            seen.add(e.target);
            if (seen.size === 1) continue; // the chapter on screen at load: no sound
          }
          play(e.target.id === "performance" ? "launch" : "wind");
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }, // fires when a chapter crosses the middle of the screen
    );
    document.querySelectorAll("[data-chapter]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

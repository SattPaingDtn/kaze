"use client";

import { PAINTS, type PaintId } from "@/content/car";
import { campaignStore, useStore } from "@/lib/store";

/** Native radio group: arrow-key navigation and screen-reader semantics for free. */
export function ColorPicker({ names, legend }: { names: Record<PaintId, string>; legend: string }) {
  const paint = useStore(campaignStore, (s) => s.paint);
  const current = PAINTS.find((p) => p.id === paint) ?? PAINTS[0];
  return (
    <fieldset className="swatches">
      <legend className="sr-only">{legend}</legend>
      <div className="swatches__row">
        {PAINTS.map((p) => (
          <label key={p.id} className="swatch" style={{ "--swatch": p.hex } as React.CSSProperties}>
            <input
              type="radio"
              name="campaign-paint"
              value={p.id}
              checked={paint === p.id}
              onChange={() => campaignStore.set({ paint: p.id })}
            />
            <span className="sr-only">{names[p.id]}</span>
          </label>
        ))}
      </div>
      <p className="swatches__name" aria-live="polite">
        <span lang="ja">{current.kanji}</span> {names[current.id]}
      </p>
    </fieldset>
  );
}

"use client";

import { loadingStore, useStore } from "@/lib/store";
import { fmt } from "@/i18n/format";
import styles from "./Loader.module.scss";

/**
 * Non-blocking loading pill: the page copy is already readable while the 3D
 * streams in. Reads a tiny store (not drei's useProgress) so this component
 * does not drag three.js into the first-load bundle.
 */
export function Loader({ text }: { text: { loading: string; ready: string } }) {
  const active = useStore(loadingStore, (s) => s.active);
  const progress = useStore(loadingStore, (s) => s.progress);
  const done = !active && progress >= 100;
  return (
    <div className={styles.loader} data-done={done} role="status" aria-live="polite">
      <span className={styles.bar} style={{ transform: `scaleX(${progress / 100})` }} />
      <span className={styles.label}>{done ? text.ready : fmt(text.loading, { progress: Math.round(progress) })}</span>
    </div>
  );
}

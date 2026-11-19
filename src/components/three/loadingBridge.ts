import { DefaultLoadingManager } from "three";
import { loadingStore } from "@/lib/store";

/**
 * Forwards three.js loading progress to the DOM loader.
 *
 * Installed at module scope in Car.tsx, before useGLTF.preload() starts fetching. Updates are deferred with queueMicrotask
 * because loaders fire these callbacks synchronously while React is rendering
 * a suspending component — setting state there triggers React warnings.
 */
const push = (active: boolean, loaded: number, total: number) =>
  queueMicrotask(() => loadingStore.set({ active, progress: total ? (loaded / total) * 100 : 100 }));

/** Call at module scope *after* all imports (drei also assigns these handlers on import). */
export function installLoadingBridge() {
  DefaultLoadingManager.onStart = (_url, loaded, total) => push(true, loaded, total);
  DefaultLoadingManager.onProgress = (_url, loaded, total) => push(loaded < total, loaded, total);
  DefaultLoadingManager.onLoad = () => queueMicrotask(() => loadingStore.set({ active: false, progress: 100 }));
  DefaultLoadingManager.onError = (url) => console.warn("[3D] failed to load", url);
}

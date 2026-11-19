import { useSyncExternalStore } from "react";

/**
 * A ~20 line store (zustand-style) so the DOM UI and the R3F scene can share
 * state without prop drilling and without re-rendering the whole canvas tree.
 */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch: Partial<T>) => {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T extends object, S>(store: ReturnType<typeof createStore<T>>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}

/**
 * Hot values that change every scroll frame live in a plain mutable object.
 * useFrame() reads it directly — no React render per scroll event.
 */
export const scrollState = { chapter: 0 };

export const campaignStore = createStore({ paint: "shu" });

/**
 * Loading progress bridge. The 3D chunk writes it (drei useProgress lives
 * inside the lazy chunk); the DOM loader reads it. Importing drei/R3F from a
 * DOM component would pull all of three.js into the first-load bundle.
 */
export const loadingStore = createStore({ active: true, progress: 0 });

/** Renderer stats — written in the render loop, read by the DOM HUD. */
export const perfState = { fps: 0, calls: 0, triangles: 0, dpr: 1, geometries: 0, textures: 0, frames: 0 };

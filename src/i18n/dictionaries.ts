import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

/**
 * Server-side loader. Dynamic imports = each locale is its own chunk, and
 * because only Server Components call this, dictionaries never ship in the
 * client bundle — clients receive just the slice of strings passed as props.
 */
const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en").then((m) => m.en),
  ja: () => import("./dictionaries/ja").then((m) => m.ja),
};

export const getDictionary = (locale: Locale) => loaders[locale]();
export type { Dictionary };

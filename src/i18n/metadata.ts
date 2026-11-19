import type { Metadata } from "next";
import { LOCALES, localePath, type Locale } from "./config";

/**
 * canonical + hreflang alternates for one route, e.g.
 *   <link rel="alternate" hreflang="ja" href="https://…/ja/configurator">
 * Tells Google the EN and JA pages are translations of each other (no
 * duplicate-content penalty, and Japanese users get the /ja result).
 */
export function alternatesFor(locale: Locale, path = "/"): Metadata["alternates"] {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])),
      "x-default": path, // the proxy picks a language for visitors with no prefix
    },
  };
}

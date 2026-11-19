/**
 * Locale config. Shared by proxy.ts (edge of the request), Server Components
 * and the client language switcher, so it must stay dependency-free.
 */
export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie the switcher writes so the proxy remembers an explicit choice over Accept-Language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = (v: string | undefined): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);

/** Short label shown in the switcher + full name for screen readers (in its own language). */
export const LOCALE_LABEL: Record<Locale, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  ja: { short: "JP", name: "日本語" },
};

/** "/ja/configurator" → "/configurator", "/en" → "/" */
export function stripLocale(pathname: string) {
  const [, first, ...rest] = pathname.split("/");
  return isLocale(first) ? `/${rest.join("/")}` : pathname;
}

export const localePath = (locale: Locale, path = "/") => `/${locale}${path === "/" ? "" : path}`;

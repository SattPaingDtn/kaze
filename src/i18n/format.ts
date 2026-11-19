import type { Locale } from "./config";

/** Tiny "{name}" interpolation — dictionaries stay plain JSON-able data (safe to pass to client components). */
export const fmt = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

/**
 * Prices are localised, not just translated:
 *   en → ¥28,400,000
 *   ja → 2,840万円   (how Japanese car brochures write prices)
 */
export function formatPrice(yen: number, locale: Locale) {
  if (locale === "ja") {
    return yen % 10_000 === 0 ? `${(yen / 10_000).toLocaleString("ja-JP")}万円` : `${yen.toLocaleString("ja-JP")}円`;
  }
  return `¥${yen.toLocaleString("en-US")}`;
}

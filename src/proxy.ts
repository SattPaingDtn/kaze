import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";

/**
 * Next 16 "proxy" (formerly middleware). Runs only for URLs without a locale
 * prefix — e.g. "/" or "/configurator" — and redirects to /en/… or /ja/…:
 *   1. explicit choice made with the language switcher (cookie)
 *   2. browser preference (Accept-Language, honouring q-values)
 *   3. default (en)
 * Prefixed URLs return immediately and are served as prerendered static pages.
 *
 * On a static host (S3 + CloudFront) the same logic would be a small
 * CloudFront Function on the viewer-request event.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1];
  if (isLocale(first)) return;

  const locale = pickLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  const res = NextResponse.redirect(url);
  res.headers.set("Vary", "Accept-Language, Cookie");
  return res;
}

function pickLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  // "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7" → ["ja", "ja", "en", "en"] sorted by q
  const ranked = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .filter((x) => x.lang && x.q > 0) // q=0 means "not acceptable"; NaN fails too
    .sort((a, b) => b.q - a.q);

  const hit = ranked.find((x) => isLocale(x.lang));
  return hit ? (hit.lang as Locale) : DEFAULT_LOCALE;
}

export const config = {
  // Skip Next internals, static assets (anything with a dot: .glb, .wasm, .png…) and API routes.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};

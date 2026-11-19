import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";

const PAGES = ["/", "/configurator"];

/**
 * /sitemap.xml — every page in every language, each listing its translations
 * (the same pairs as alternatesFor() puts in the <head>).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(LOCALES.map((l) => [l, SITE_URL + localePath(l, path)])),
      "x-default": SITE_URL + path,
    };
    return LOCALES.map((locale) => ({ url: SITE_URL + localePath(locale, path), alternates: { languages } }));
  });
}

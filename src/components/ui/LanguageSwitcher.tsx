"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABEL, localePath, stripLocale, type Locale } from "@/i18n/config";

/**
 * EN / JP switch. Real links (work without JS, crawlable, hreflang), enhanced
 * on click so the visitor stays where they were:
 *  - campaign: jumps back to the chapter currently on screen (#interior …)
 *  - configurator: keeps the build, which lives in the query string (?paint=ai …)
 * Also stores the choice in a cookie so proxy.ts uses it next time.
 */
export function LanguageSwitcher({ locale, label, className = "lang-switch" }: { locale: Locale; label: string; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const rest = stripLocale(pathname);

  const go = (e: MouseEvent<HTMLAnchorElement>, target: Locale) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
    e.preventDefault();
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;
    router.push(localePath(target, rest) + window.location.search + currentChapterHash());
  };

  return (
    <nav className={className} aria-label={label}>
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={localePath(l, rest)}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          onClick={(e) => (l === locale ? e.preventDefault() : go(e, l))}
        >
          <span aria-hidden="true">{LOCALE_LABEL[l].short}</span>
          <span className="sr-only">{LOCALE_LABEL[l].name}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The last [data-chapter] section whose top is above the middle of the screen. */
function currentChapterHash() {
  let id = "";
  document.querySelectorAll<HTMLElement>("[data-chapter]").forEach((el, i) => {
    if (el.getBoundingClientRect().top <= window.innerHeight / 2) id = i === 0 ? "" : el.id;
  });
  return id ? `#${id}` : "";
}

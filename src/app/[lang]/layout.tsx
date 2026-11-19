import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter, Michroma, Noto_Sans_JP } from "next/font/google";
import { LOCALES, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import "../globals.scss";
import { SITE_URL } from "@/lib/site";
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const michroma = Michroma({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
/**
 * Japanese webfont. A full JP font is several MB, so:
 * - preload: false → never blocks first paint (system Hiragino / Yu Gothic shows first)
 * - Google splits it into ~100 unicode-range slices; the browser downloads only
 *   the slices containing glyphs actually on the page (typically 100–300 KB).
 */
const notoJp = Noto_Sans_JP({ variable: "--font-jp", display: "swap", preload: false });

type Props = { children: React.ReactNode; params: Promise<{ lang: string }> };

/** Both locales are prerendered at build time; anything else is a 404. */
export const dynamicParams = false;
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return {
    metadataBase: new URL(SITE_URL), // never localhost in a deploy: see lib/site.ts
    title: t.meta.title,
    description: t.meta.description,
    openGraph: { locale: lang === "ja" ? "ja_JP" : "en_US", alternateLocale: lang === "ja" ? "en_US" : "ja_JP" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

/** Root layout lives under [lang] so <html lang> is correct in the server HTML (screen readers, fonts, line breaking). */
export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = await getDictionary(lang);

  return (
    // data-scroll-behavior: Next 16 turns CSS smooth-scroll off during route changes (instant jumps, smooth in-page anchors)
    <html lang={lang} data-scroll-behavior="smooth" className={`${inter.variable} ${michroma.variable} ${notoJp.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          {t.nav.skip}
        </a>
        {children}
      </body>
    </html>
  );
}

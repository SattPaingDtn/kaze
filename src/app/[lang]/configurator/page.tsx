import type { Metadata } from "next";
import { Configurator, type ConfiguratorText } from "@/components/configurator/Configurator";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { alternatesFor } from "@/i18n/metadata";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return {
    title: t.meta.configuratorTitle,
    description: t.meta.configuratorDescription,
    alternates: alternatesFor(lang, "/configurator"),
  };
}

export default async function ConfiguratorPage({ params }: Props) {
  const lang = (await params).lang as Locale; // validated by the layout
  const t = await getDictionary(lang);

  // Only the strings this client component needs are serialised into the page —
  // not the whole dictionary, and never the other language.
  const text: ConfiguratorText = {
    ui: t.configurator,
    nav: t.nav,
    loader: t.loader,
    paints: t.paints,
    rims: t.rims,
    leathers: t.leathers,
    views: t.views,
    hotspots: t.hotspots,
  };

  return <Configurator locale={lang} t={text} />;
}

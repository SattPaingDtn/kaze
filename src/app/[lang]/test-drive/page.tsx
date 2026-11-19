import type { Metadata } from "next";
import { TestDrive, type DriveText } from "@/components/drive/TestDrive";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { alternatesFor } from "@/i18n/metadata";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  return {
    title: t.meta.testDriveTitle,
    description: t.meta.testDriveDescription,
    alternates: alternatesFor(lang, "/test-drive"),
  };
}

export default async function TestDrivePage({ params }: Props) {
  const lang = (await params).lang as Locale; // validated by the layout
  const t = await getDictionary(lang);
  const text: DriveText = { ui: t.testDrive, nav: t.nav, loader: t.loader, paints: t.paints };
  return <TestDrive locale={lang} t={text} />;
}

import type { Metadata } from "next";
import Link from "next/link";
import { CHAPTERS, MODEL, PAINTS } from "@/content/car";
import { CampaignStage } from "@/components/campaign/CampaignStage";
import { CampaignScroll } from "@/components/campaign/CampaignScroll";
import { ColorPicker } from "@/components/campaign/ColorPicker";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { CampaignSounds, SoundToggle } from "@/components/ui/SoundToggle";
import { isLocale, localePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import { alternatesFor } from "@/i18n/metadata";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { alternates: alternatesFor(lang) } : {};
}

/**
 * Server Component: all copy is in the HTML response (SEO + screen readers +
 * instant text paint), in the requested language. Only the 3D stage and
 * scroll logic are client JS.
 */
export default async function CampaignPage({ params }: Props) {
  const lang = (await params).lang as Locale; // validated by the layout
  const t = await getDictionary(lang);
  const [hero, design, performance, interior, colors, build] = CHAPTERS;
  const ch = t.chapters;

  return (
    <>
      <CampaignStage label={t.campaign.sceneLabel} loader={t.loader} />

      <header className="site-header">
        <Link href={localePath(lang)} className="logo" aria-label={t.nav.home}>
          KAZE<span aria-hidden="true">風</span>
        </Link>
        <nav aria-label={t.nav.chapters}>
          <ul>
            <li><a href="#design">{t.nav.design}</a></li>
            <li><a href="#performance">{t.nav.performance}</a></li>
            <li><a href="#interior">{t.nav.interior}</a></li>
            <li><a href="#colors">{t.nav.colors}</a></li>
          </ul>
        </nav>
        <LanguageSwitcher locale={lang} label={t.nav.language} />
        <SoundToggle label={t.nav.sound} />
        <Link href={localePath(lang, "/configurator")} className="btn btn--small">{t.nav.configure}</Link>
      </header>

      <CampaignSounds />
      <CampaignScroll>
        <main id="main">
          <p className="sr-only">{t.campaign.srIntro}</p>

          <section id={hero.id} data-chapter className="chapter chapter--hero" aria-labelledby="t-hero">
            <div className="copy copy--center" data-reveal>
              <p className="eyebrow">{t.hero.eyebrow}</p>
              <h1 id="t-hero" className="hero-title">{MODEL.name}</h1>
              <p className="tagline">
                <span lang={t.hero.accentLang}>{t.hero.accent}</span> {t.hero.tagline}
              </p>
            </div>
            <p className="scroll-cue" aria-hidden="true">{t.hero.scroll}</p>
          </section>

          <section id={design.id} data-chapter className="chapter" data-align={design.align} aria-labelledby="t-design">
            <div className="copy" data-reveal>
              <p className="eyebrow">{ch.design.eyebrow}</p>
              <h2 id="t-design">{ch.design.title}</h2>
              <p>{ch.design.body}</p>
            </div>
          </section>

          <section id={performance.id} data-chapter className="chapter" data-align={performance.align} aria-labelledby="t-perf">
            <div className="copy" data-reveal>
              <p className="eyebrow">{ch.performance.eyebrow}</p>
              <h2 id="t-perf">{ch.performance.title}</h2>
              <p>{ch.performance.body}</p>
              <dl className="stats">
                {t.campaign.stats.map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd><span data-count={s.value}>{s.value}</span> {s.unit}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section id={interior.id} data-chapter className="chapter" data-align={interior.align} aria-labelledby="t-int">
            <div className="copy" data-reveal>
              <p className="eyebrow">{ch.interior.eyebrow}</p>
              <h2 id="t-int">{ch.interior.title}</h2>
              <p>{ch.interior.body}</p>
            </div>
          </section>

          <section id={colors.id} data-chapter className="chapter" data-align={colors.align} aria-labelledby="t-col">
            <div className="copy" data-reveal>
              <p className="eyebrow">{ch.colors.eyebrow}</p>
              <h2 id="t-col">{ch.colors.title}</h2>
              <p>{ch.colors.body}</p>
              <ColorPicker names={t.paints} legend={t.campaign.paintLegend} />
              <p className="fineprint">{fmt(t.campaign.finishesNote, { count: PAINTS.length })}</p>
            </div>
          </section>

          <section id={build.id} data-chapter className="chapter chapter--build" data-align={build.align} aria-labelledby="t-build">
            <div className="copy copy--center" data-reveal>
              <p className="eyebrow">{ch.build.eyebrow}</p>
              <h2 id="t-build">{ch.build.title}</h2>
              <p>{ch.build.body}</p>
              <dl className="specs">
                {t.specs.map((s) => (
                  <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>
                ))}
              </dl>
              <Link href={localePath(lang, "/configurator")} className="btn">{t.campaign.openConfigurator}</Link>
            </div>
          </section>
        </main>
      </CampaignScroll>

      <footer className="site-footer">
        <p>{t.credits}</p>
      </footer>
    </>
  );
}

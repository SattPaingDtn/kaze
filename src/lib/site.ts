/**
 * Absolute origin used for canonical, hreflang, Open Graph, sitemap.xml and robots.txt.
 * The pages are static, so this is read at BUILD time and must be known before `next build`:
 *   1. NEXT_PUBLIC_SITE_URL — set it in the CI that builds for S3 + CloudFront
 *   2. Vercel's production domain — set automatically by Vercel
 *   3. localhost — local builds only. Under CI it throws instead, so a deploy
 *      can never ship canonical links that point at localhost.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  if (process.env.CI) throw new Error("Set NEXT_PUBLIC_SITE_URL (e.g. https://kaze.example) before building for deploy.");
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

import { DEFAULT_LOCALE, isLocale, type Locale } from "./i18n.ts";

export const LOCALE_COOKIE = "rh-lang";

/**
 * Pick the interface language for a visitor without one in the URL: a language they chose
 * before (cookie), else the first supported language in Accept-Language, else English.
 */
export function negotiate(acceptLanguage: string | null, cookie?: string): Locale {
  if (cookie && isLocale(cookie)) return cookie;
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const prefs = acceptLanguage
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((p) => p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) if (isLocale(p.lang)) return p.lang;
  return DEFAULT_LOCALE;
}

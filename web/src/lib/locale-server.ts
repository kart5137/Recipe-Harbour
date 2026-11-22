import { lang } from "next/root-params";

import { DEFAULT_LOCALE, isLocale, type Locale } from "./i18n.ts";

/** The interface language of the current request, from the /en or /de path segment. */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  return isLocale(l) ? l : DEFAULT_LOCALE;
}

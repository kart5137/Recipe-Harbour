"use client";

import { createContext, useContext } from "react";

import { DEFAULT_LOCALE, dict, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** The interface language for client components (set once by the root layout). */
export function LocaleProvider({ lang, children }: { lang: Locale; children: React.ReactNode }) {
  return <LocaleContext value={lang}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useDict() {
  return dict(useContext(LocaleContext));
}

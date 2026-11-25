"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDict, useLocale } from "@/components/locale";
import { PendingDim } from "@/components/search-links";
import { LOCALE_COOKIE } from "@/lib/negotiate";

const CLASS =
  "press inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-1.5 sm:px-3 text-sm font-medium text-muted transition hover:border-brand hover:text-ink";

const remember = (lang: string) => {
  document.cookie = `${LOCALE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
};

/** Same page and search in the other interface language; remembers the choice for the next visit to "/". */
export function LanguageSwitch() {
  const lang = useLocale();
  const t = useDict();
  const pathname = usePathname();
  const sp = useSearchParams();
  const other = t.nav.otherLanguageCode;
  const rest = pathname.replace(new RegExp(`^/${lang}(?=/|$)`), "");
  const qs = sp.toString();
  const router = useRouter();
  const href = `/${other}${rest}${qs ? `?${qs}` : ""}`;
  // Fetch the whole other-language page the moment a finger or pointer lands on the button.
  const warm = () => router.prefetch(href);
  return (
    <Link
      href={href}
      onPointerEnter={warm}
      onPointerDown={warm}
      onFocus={warm}
      hrefLang={other}
      lang={other}
      aria-label={t.nav.switchLabel}
      onClick={() => remember(other)}
      className={CLASS}
    >
      <Languages className="size-4" aria-hidden />
      <span className="max-sm:hidden">{t.nav.otherLanguage}</span>
      <span className="uppercase sm:hidden">{other}</span>
      <PendingDim />
    </Link>
  );
}

/** Shown until the URL is known (prerendered shell): a link to the other language's home page. */
export function LanguageSwitchFallback() {
  const t = useDict();
  const other = t.nav.otherLanguageCode;
  return (
    <Link href={`/${other}`} hrefLang={other} lang={other} aria-label={t.nav.switchLabel} onClick={() => remember(other)} className={CLASS}>
      <Languages className="size-4" aria-hidden />
      <span className="max-sm:hidden">{t.nav.otherLanguage}</span>
      <span className="uppercase sm:hidden">{other}</span>
    </Link>
  );
}

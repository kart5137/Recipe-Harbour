import { Heart, Info } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { LanguageSwitch, LanguageSwitchFallback } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { dict, type Locale } from "@/lib/i18n";

export function SiteHeader({ lang }: { lang: Locale }) {
  const t = dict(lang);
  return (
    <header className="glass-bar border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={`/${lang}`} className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
          <Logo className="size-9 shrink-0 drop-shadow-sm sm:size-10" />
          <span className="truncate font-display text-lg font-bold tracking-tight min-[380px]:text-xl">
            Recipe <span className="text-brand">Harbour</span>
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href={`/${lang}/favourites`}
            className="press inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted sm:px-3 transition hover:bg-surface-2 hover:text-ink"
          >
            <Heart className="size-4" aria-hidden />
            <span className="max-sm:sr-only">{t.nav.favourites}</span>
          </Link>
          <Link
            href={`/${lang}/credits`}
            className="press inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted sm:px-3 transition hover:bg-surface-2 hover:text-ink"
          >
            <Info className="size-4" aria-hidden />
            <span className="max-sm:sr-only">{t.nav.credits}</span>
          </Link>
          {/* The switch keeps the current page and search, which it reads from the URL. */}
          <Suspense fallback={<LanguageSwitchFallback />}>
            <LanguageSwitch />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

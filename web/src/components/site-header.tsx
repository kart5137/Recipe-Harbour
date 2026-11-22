import { Anchor, Heart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { LanguageSwitch, LanguageSwitchFallback } from "@/components/language-switch";
import { dict, type Locale } from "@/lib/i18n";

export function SiteHeader({ lang }: { lang: Locale }) {
  const t = dict(lang);
  return (
    <header className="border-b border-line/70 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={`/${lang}`} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink shadow-sm">
            <Anchor className="size-5" aria-hidden />
          </span>
          <span className="truncate font-display text-xl font-bold tracking-tight">Recipe Harbour</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-2">
          <Link
            href={`/${lang}/favourites`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <Heart className="size-4" aria-hidden />
            <span className="max-sm:sr-only">{t.nav.favourites}</span>
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

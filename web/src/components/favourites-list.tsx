"use client";

import { Clock, Heart, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { useDict, useLocale } from "@/components/locale";
import { getServerSnapshot, getSnapshot, subscribe, toggleFavourite } from "@/lib/favourites";
import { family } from "@/lib/families";
import { formatMinutes } from "@/lib/format";

/** The saved recipes from this browser, newest first. */
export function FavouritesList() {
  const lang = useLocale();
  const t = useDict();
  const favs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (favs.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line bg-surface p-6">
        <Heart className="size-6 text-muted" aria-hidden />
        <p className="max-w-prose text-muted">{t.favourites.empty}</p>
        <Link href={`/${lang}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
          {t.favourites.browse}
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {favs.map((f) => {
        const fam = family(f.family);
        const Icon = fam.icon;
        const time = formatMinutes(f.min, lang);
        return (
          <li key={f.id} className="relative flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm transition hover:shadow-md">
            <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${fam.tint} ${fam.ink}`}>
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/${lang}/recipe/${f.id}`}
                lang={f.lang}
                className="line-clamp-2 font-display leading-snug font-semibold after:absolute after:inset-0 focus-visible:outline-none"
              >
                {f.title}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{fam.label[lang]}</span>
                <span className="font-bold tracking-wider">{f.lang.toUpperCase()}</span>
                {time && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" aria-hidden />
                    {time}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleFavourite(f)}
              aria-label={t.favourites.remove(f.title)}
              className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

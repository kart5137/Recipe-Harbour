import { Suspense } from "react";

import { PantrySearch } from "@/components/pantry-search";
import { Results } from "@/components/results";
import { getStats, getSuggestEntries } from "@/lib/data";
import { dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import { parseState } from "@/lib/params";

export default async function Home(props: PageProps<"/[lang]">) {
  const lang = await getLocale();
  const t = dict(lang);
  const stats = getStats();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
          {t.hero.before}
          <span className="relative whitespace-nowrap text-brand">
            <span aria-hidden className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded-full bg-lemon/50 dark:bg-lemon/20 sm:bottom-1.5 sm:h-4" />
            {t.hero.accent}
          </span>
          {t.hero.after}
        </h1>
        <p className="mt-4 text-lg text-muted">{t.hero.sub}</p>
        <ul className="mt-5 flex flex-wrap gap-2 text-sm font-medium">
          {t.hero.stats(stats.total).map((s) => (
            <li key={s} className="rounded-full border border-line bg-surface/80 px-3 py-1 text-ink shadow-sm">
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <Suspense fallback={<SearchSkeleton label={t.recipe.loading} />}>
          <SearchArea searchParams={props.searchParams} lang={lang} />
        </Suspense>
      </div>
    </main>
  );
}

async function SearchArea({ searchParams, lang }: Pick<PageProps<"/[lang]">, "searchParams"> & { lang: Locale }) {
  const state = parseState(await searchParams);
  return (
    <>
      <PantrySearch state={state} entries={getSuggestEntries()} />
      <Results state={state} lang={lang} />
    </>
  );
}

function SearchSkeleton({ label }: { label: string }) {
  return <div className="h-72 animate-pulse rounded-3xl border border-line bg-surface" aria-label={label} />;
}

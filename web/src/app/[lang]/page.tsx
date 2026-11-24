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
    <main data-photo-hero className="mx-auto max-w-6xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12">
      {/* A short dark-glass strip on the photo: white text stays readable on any part of it. */}
      <div className="inline-block max-w-2xl glass-dark rounded-3xl px-5 py-4 text-white sm:px-6">
        <h1 className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
          {t.hero.before}
          <span className="text-lemon">{t.hero.accent}</span>
          {t.hero.after}
        </h1>
        <p className="mt-1.5 text-sm text-white sm:text-base">{t.hero.sub}</p>
        <p className="mt-2.5 text-xs font-medium text-white/90">{t.hero.stats(stats.total).join(" · ")}</p>
      </div>

      <div className="mt-5 sm:mt-6">
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

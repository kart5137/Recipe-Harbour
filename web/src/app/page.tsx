import { Suspense } from "react";

import { PantrySearch } from "@/components/pantry-search";
import { Results } from "@/components/results";
import { getStats, getSuggestEntries } from "@/lib/data";
import { parseState } from "@/lib/params";

export default function Home(props: PageProps<"/">) {
  const stats = getStats();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
          Cook with what you <span className="text-brand">already have</span>.
        </h1>
        <p className="mt-4 text-lg text-muted">
          Add the ingredients in your kitchen, in English or German, and find matching recipes from{" "}
          {stats.total.toLocaleString("en")} open cookbook recipes ({stats.en.toLocaleString("en")} English,{" "}
          {stats.de.toLocaleString("en")} German).
        </p>
      </div>

      <div className="mt-8">
        <Suspense fallback={<SearchSkeleton />}>
          <SearchArea searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SearchArea({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const state = parseState(await searchParams);
  return (
    <>
      <PantrySearch state={state} entries={getSuggestEntries()} />
      <Results state={state} />
    </>
  );
}

function SearchSkeleton() {
  return <div className="h-56 animate-pulse rounded-3xl border border-line bg-surface" aria-label="Loading search" />;
}

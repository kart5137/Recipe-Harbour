import Link from "next/link";

import { RecipeCard } from "@/components/recipe-card";
import { getModel } from "@/lib/data";
import { dict, type Locale } from "@/lib/i18n";
import { label } from "@/lib/labels";
import { hasFilters, PAGE, type SearchState, toQuery } from "@/lib/params";
import { search } from "@/lib/search";

/** Ingredients for the example searches, in the same order as the dictionary's example titles. */
const EXAMPLES: string[][] = [
  ["onion", "tomato", "egg"],
  ["potato", "egg", "bacon"],
  ["pasta", "garlic", "olive_oil"],
  ["rice", "chicken", "bell_pepper"],
  ["apple", "flour", "butter"],
];

export function Results({ state, lang }: { state: SearchState; lang: Locale }) {
  const t = dict(lang).results;
  const m = getModel();
  const pantry = state.have.length > 0;
  const named = state.q.trim() !== "";
  const browse = !pantry && !named && hasFilters(state);

  if (!pantry && !named && !browse) {
    return (
      <section aria-labelledby="try" className="mt-10">
        <h2 id="try" className="text-sm font-semibold text-muted">
          {t.tryHeading}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((have, i) => (
            <li key={have.join()}>
              <Link
                href={`/${lang}${toQuery({ ...state, have })}`}
                scroll={false}
                className="inline-flex rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium shadow-sm transition hover:border-brand hover:text-brand"
              >
                {t.examples[i]}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">{t.browseHint}</p>
      </section>
    );
  }

  const res = search(m, {
    have: state.have,
    q: state.q,
    lang: state.lang,
    staples: state.staples,
    type: state.type,
    time: state.time,
    diet: state.diet,
    ready: state.ready,
    browse,
  });
  const shown = res.hits.slice(0, state.n);
  const { ingredients } = m.data;
  const query = toQuery({ ...state, n: undefined }); // carried to the recipe page for "Back to results"

  const order = pantry ? (res.canMakeNow > 0 && !state.ready ? null : t.bestFirst) : named ? null : t.browseOrder;

  return (
    <section aria-labelledby="results" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results" className="font-display text-2xl font-semibold">
          {res.total === 0 ? t.none : t.count(res.total)}
        </h2>
        {res.total > 0 && pantry && res.canMakeNow > 0 && !state.ready && (
          <p className="text-sm text-muted">
            <span className="font-semibold text-have">{t.canMake(res.canMakeNow)[0]}</span>
            {t.canMake(res.canMakeNow)[1]}
          </p>
        )}
        {res.total > 0 && order && <p className="text-sm text-muted">{order}</p>}
      </div>

      {res.unknown.length > 0 && <p className="mt-2 text-sm text-miss">{t.ignored(res.unknown.join(", "))}</p>}

      {res.total === 0 ? (
        <p className="mt-4 max-w-prose text-muted">
          {pantry
            ? `${t.noneWithPantry} (${state.have.map((id) => label(id, lang)).join(", ")})`
            : named
              ? t.noneWithName(state.q)
              : t.noneWithFilters}
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((hit) => (
            <li key={hit.recipe.id} className="flex">
              <RecipeCard hit={hit} ingredients={ingredients} pantry={pantry} query={query} lang={lang} />
            </li>
          ))}
        </ul>
      )}

      {res.total > shown.length && (
        <div className="mt-8 flex justify-center">
          <Link
            href={`/${lang}${toQuery({ ...state, n: state.n + PAGE })}`}
            scroll={false}
            className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold shadow-sm transition hover:border-brand hover:text-brand"
          >
            {t.more(res.total - shown.length)}
          </Link>
        </div>
      )}
    </section>
  );
}

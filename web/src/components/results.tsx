import Link from "next/link";

import { RecipeCard } from "@/components/recipe-card";
import { getModel } from "@/lib/data";
import { label } from "@/lib/labels";
import { PAGE, type SearchState, toQuery } from "@/lib/params";
import { search } from "@/lib/search";

const EXAMPLES: { title: string; have: string[] }[] = [
  { title: "Onion · tomato · egg", have: ["onion", "tomato", "egg"] },
  { title: "Kartoffeln · Eier · Speck", have: ["potato", "egg", "bacon"] },
  { title: "Pasta · garlic · olive oil", have: ["pasta", "garlic", "olive_oil"] },
  { title: "Rice · chicken · bell pepper", have: ["rice", "chicken", "bell_pepper"] },
  { title: "Äpfel · Mehl · Butter", have: ["apple", "flour", "butter"] },
];

export function Results({ state }: { state: SearchState }) {
  const m = getModel();
  const pantry = state.have.length > 0;

  if (!pantry && !state.q.trim()) {
    return (
      <section aria-labelledby="try" className="mt-10">
        <h2 id="try" className="text-sm font-semibold text-muted">
          Not sure where to start? Try one of these
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex.title}>
              <Link
                href={`/${toQuery({ ...state, have: ex.have })}`}
                scroll={false}
                className="inline-flex rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium shadow-sm transition hover:border-brand hover:text-brand"
              >
                {ex.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const res = search(m, { have: state.have, q: state.q, lang: state.lang, staples: state.staples });
  const shown = res.hits.slice(0, state.n);
  const { ingredients } = m.data;

  return (
    <section aria-labelledby="results" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results" className="font-display text-2xl font-semibold">
          {res.total === 0
            ? "No recipes found"
            : `${res.total.toLocaleString("en")} recipe${res.total === 1 ? "" : "s"}`}
        </h2>
        {pantry && res.total > 0 && (
          <p className="text-sm text-muted">
            {res.canMakeNow > 0 ? (
              <>
                <span className="font-semibold text-have">{res.canMakeNow}</span> you can make with what you have
              </>
            ) : (
              "Best matches first: most of the recipe covered, using most of your ingredients"
            )}
          </p>
        )}
      </div>

      {res.unknown.length > 0 && (
        <p className="mt-2 text-sm text-miss">Ignored unknown ingredient{res.unknown.length > 1 ? "s" : ""}: {res.unknown.join(", ")}</p>
      )}

      {res.total === 0 ? (
        <p className="mt-4 max-w-prose text-muted">
          {pantry
            ? `No recipe uses ${state.have.map(label).join(", ")}${state.q ? ` and matches “${state.q}”` : ""}${state.lang !== "all" ? " in this language" : ""}. Try removing an ingredient${state.lang !== "all" ? " or showing all languages" : ""}.`
            : `No recipe name matches “${state.q}”.`}
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((hit) => (
            <li key={hit.recipe.id} className="flex">
              <RecipeCard hit={hit} ingredients={ingredients} pantry={pantry} />
            </li>
          ))}
        </ul>
      )}

      {res.total > shown.length && (
        <div className="mt-8 flex justify-center">
          <Link
            href={`/${toQuery({ ...state, n: state.n + PAGE })}`}
            scroll={false}
            className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold shadow-sm transition hover:border-brand hover:text-brand"
          >
            Show more ({(res.total - shown.length).toLocaleString("en")} left)
          </Link>
        </div>
      )}
    </section>
  );
}

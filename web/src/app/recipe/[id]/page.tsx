import { Clock, ExternalLink, Gauge, Globe2, Leaf, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { IngredientsPanel } from "@/components/ingredients-panel";
import { getIngredientsLite, getRecipe, sampleRecipeIds } from "@/lib/data";
import { family } from "@/lib/families";
import { formatMinutes } from "@/lib/format";
import type { RecipeDetail } from "@/lib/recipe";

export function generateStaticParams() {
  // A sample is prerendered at build time; every other recipe renders on first visit and is then cached.
  return sampleRecipeIds().map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<"/recipe/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const r = getRecipe(id);
  return r
    ? { title: `${r.title} · Recipe Harbour`, description: r.description.slice(0, 160) || undefined }
    : { title: "Recipe not found · Recipe Harbour" };
}

export default function RecipePage(props: PageProps<"/recipe/[id]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <BackLink />
      </Suspense>
      <Suspense fallback={<RecipeSkeleton />}>
        <Recipe params={props.params} />
      </Suspense>
    </main>
  );
}

const DIET: Record<string, string> = { vegan: "Vegan", vegetarian: "Vegetarian", none: "Contains meat or fish" };

async function Recipe({ params }: Pick<PageProps<"/recipe/[id]">, "params">) {
  const { id } = await params;
  const r = getRecipe(id);
  if (!r) notFound();
  const fam = family(r.family);
  const Icon = fam.icon;
  const time = formatMinutes(r.minutes);
  const updated = r.revision_timestamp ? r.revision_timestamp.slice(0, 10) : "";
  const source = r.lang === "de" ? "Wikibooks Kochbuch" : "Wikibooks Cookbook";

  return (
    <article className="mt-4">
      <header className={`overflow-hidden rounded-3xl ${fam.tint}`}>
        <div className="px-5 py-7 sm:px-8 sm:py-10">
          <p className={`inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${fam.ink}`}>
            <Icon className="size-5" aria-hidden />
            {fam.label}
            <span className="rounded-md bg-surface/80 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-muted">
              {r.lang === "de" ? "Deutsch" : "English"}
            </span>
          </p>
          <h1 lang={r.lang} className="mt-3 max-w-3xl font-display text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            {r.title}
          </h1>
          {r.description && (
            <p lang={r.lang} className="mt-4 max-w-3xl text-base leading-relaxed text-ink/80 sm:text-lg">
              {r.description}
            </p>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {time && <Fact icon={<Clock className="size-4" />} term="Time" value={time} />}
            {r.servings_text && (
              <Fact icon={<Users className="size-4" />} term="Serves" value={r.servings_text} lang={r.lang} />
            )}
            {r.difficulty && <Fact icon={<Gauge className="size-4" />} term="Difficulty" value={`${r.difficulty} of 5`} />}
            {(r.cuisine || r.category) && (
              <Fact icon={<Globe2 className="size-4" />} term="Type" value={[r.cuisine, r.category].filter(Boolean).join(" · ")} lang={r.lang} />
            )}
            {DIET[r.diet] && (
              <Fact
                icon={<Leaf className="size-4" />}
                term="Diet"
                value={`${DIET[r.diet]}${r.diet_source === "inferred" ? " (from the ingredients)" : ""}`}
              />
            )}
          </dl>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          {/* The panel reads the URL (useSearchParams), so in a prerendered page the browser renders
              everything up to the nearest Suspense boundary. Its own boundary keeps that to the panel;
              the fallback is the plain ingredient list. */}
          <Suspense fallback={<StaticIngredients groups={r.groups} lang={r.lang} />}>
            <IngredientsPanel
              recipe={{ title: r.title, groups: r.groups, lang: r.lang }}
              ingredients={getIngredientsLite()}
            />
          </Suspense>
        </div>

        <div className="space-y-8">
          <section aria-labelledby="method">
            <h2 id="method" className="font-display text-2xl font-semibold">
              Method
            </h2>
            <ol className="mt-4 space-y-4" lang={r.lang}>
              {r.steps.map((s, i) => (
                <li key={i} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brand-ink">
                    {i + 1}
                  </span>
                  <p className="pt-1 leading-relaxed">{s}</p>
                </li>
              ))}
            </ol>
          </section>

          {r.equipment.length > 0 && (
            <section aria-labelledby="equipment">
              <h2 id="equipment" className="font-display text-xl font-semibold">
                Equipment
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2" lang={r.lang}>
                {r.equipment.map((e, i) => (
                  <li key={i} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
                    {e}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.notes.length > 0 && (
            <section aria-labelledby="notes">
              <h2 id="notes" className="font-display text-xl font-semibold">
                Notes and variations
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted" lang={r.lang}>
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          {r.diet_source === "inferred" && (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
              The diet label is worked out from the ingredient list, not stated by the recipe. If you have an allergy
              or a strict diet, check every ingredient yourself.
            </p>
          )}

          <footer className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">
            <p>
              This recipe comes from the{" "}
              <a href={r.url} className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand">
                {source}
              </a>{" "}
              and was written by{" "}
              <a href={r.history_url} className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand">
                its contributors
              </a>
              . It is shared under{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand"
              >
                CC BY-SA 4.0
              </a>{" "}
              and has been reformatted for this site{updated ? ` (version of ${updated})` : ""}.
            </p>
            <a href={r.url} className="mt-3 inline-flex items-center gap-1 font-medium text-brand hover:underline">
              Read the original on Wikibooks <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </footer>
        </div>
      </div>
    </article>
  );
}

function Fact({ icon, term, value, lang }: { icon: React.ReactNode; term: string; value: string; lang?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted" aria-hidden>
        {icon}
      </span>
      <dt className="sr-only">{term}</dt>
      <dd className="font-medium" lang={lang}>
        {value}
      </dd>
    </div>
  );
}

function StaticIngredients({ groups, lang }: { groups: RecipeDetail["groups"]; lang: string }) {
  return (
    <section aria-labelledby="ingredients" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 id="ingredients" className="font-display text-xl font-semibold">
        Ingredients
      </h2>
      <div className="mt-4 space-y-5" lang={lang}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.name && <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{g.name}</h3>}
            <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
              {g.items.map((it, ii) => (
                <li key={ii}>{it.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecipeSkeleton() {
  return (
    <div className="mt-4 space-y-6" aria-label="Loading recipe">
      <div className="h-64 animate-pulse rounded-3xl bg-surface" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="h-96 animate-pulse rounded-2xl bg-surface" />
        <div className="h-96 animate-pulse rounded-2xl bg-surface" />
      </div>
    </div>
  );
}

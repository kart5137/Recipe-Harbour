import { Clock, ExternalLink, Gauge, Globe2, Leaf, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { FavouriteButton } from "@/components/favourite-button";
import { IngredientsPanel } from "@/components/ingredients-panel";
import { getIngredientsLite, getRecipe, sampleRecipeIds } from "@/lib/data";
import { family } from "@/lib/families";
import { formatMinutes } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import type { RecipeDetail } from "@/lib/recipe";

export function generateStaticParams() {
  // A sample is prerendered at build time; every other recipe renders on first visit and is then cached.
  return sampleRecipeIds().map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<"/[lang]/recipe/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = dict(await getLocale());
  const r = getRecipe(id);
  return r
    ? {
        title: `${r.title} · Recipe Harbour`,
        description: r.description.slice(0, 160) || undefined,
        alternates: { languages: { en: `/en/recipe/${id}`, de: `/de/recipe/${id}` } },
      }
    : { title: `${t.recipe.notFoundTitle} · Recipe Harbour` };
}

export default async function RecipePage(props: PageProps<"/[lang]/recipe/[id]">) {
  const lang = await getLocale();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6">
      <Suspense fallback={<p className="text-sm text-muted">{dict(lang).recipe.loading}</p>}>
        <BackLink />
      </Suspense>
      <Suspense fallback={<RecipeSkeleton />}>
        <Recipe params={props.params} lang={lang} />
      </Suspense>
    </main>
  );
}

async function Recipe({ params, lang }: Pick<PageProps<"/[lang]/recipe/[id]">, "params"> & { lang: Locale }) {
  const { id } = await params;
  const r = getRecipe(id);
  if (!r) notFound();
  const t = dict(lang);
  const diet = r.diet === "vegan" || r.diet === "vegetarian" || r.diet === "none" ? t.diet[r.diet] : null;
  const fam = family(r.family);
  const Icon = fam.icon;
  const time = formatMinutes(r.minutes, lang);
  const updated = r.revision_timestamp
    ? new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(r.revision_timestamp))
    : "";
  const source = t.recipe.source[r.lang];

  return (
    <article className="mt-4">
      <header className={`overflow-hidden rounded-3xl ${fam.tint}`}>
        <div className="px-5 py-7 sm:px-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${fam.ink}`}>
              <Icon className="size-5" aria-hidden />
              {fam.label[lang]}
              <span className="rounded-md bg-surface/80 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-muted">
                {t.recipe.languageName[r.lang]}
              </span>
            </p>
            <FavouriteButton fav={{ id: r.id, title: r.title, lang: r.lang, family: r.family, min: r.minutes }} />
          </div>
          <h1 lang={r.lang} className="mt-3 max-w-3xl font-display text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            {r.title}
          </h1>
          {r.description && (
            <p lang={r.lang} className="mt-4 max-w-3xl text-base leading-relaxed text-ink/80 sm:text-lg">
              {r.description}
            </p>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {time && <Fact icon={<Clock className="size-4" />} term={t.recipe.time} value={time} />}
            {r.servings_text && (
              <Fact icon={<Users className="size-4" />} term={t.recipe.serves} value={r.servings_text} lang={r.lang} />
            )}
            {r.difficulty && <Fact icon={<Gauge className="size-4" />} term={t.recipe.difficulty} value={t.recipe.difficultyValue(r.difficulty)} />}
            {(r.cuisine || r.category) && (
              <Fact icon={<Globe2 className="size-4" />} term={t.recipe.type} value={[r.cuisine, r.category].filter(Boolean).join(" · ")} lang={r.lang} />
            )}
            {diet && (
              <Fact
                icon={<Leaf className="size-4" />}
                term={t.recipe.diet}
                value={`${diet}${r.diet_source === "inferred" ? t.diet.fromIngredients : ""}`}
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
          <Suspense fallback={<StaticIngredients groups={r.groups} lang={r.lang} heading={t.recipe.ingredients} />}>
            <IngredientsPanel
              recipe={{ title: r.title, groups: r.groups, lang: r.lang }}
              ingredients={getIngredientsLite()}
            />
          </Suspense>
        </div>

        <div className="space-y-8">
          <section aria-labelledby="method">
            <h2 id="method" className="font-display text-2xl font-semibold">
              {t.recipe.method}
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
                {t.recipe.equipment}
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
                {t.recipe.notes}
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted" lang={r.lang}>
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          {r.diet_source === "inferred" && (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">{t.recipe.dietNote}</p>
          )}

          <footer className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">
            <p>
              {t.recipe.comesFrom}{" "}
              <a href={r.url} className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand">
                {source}
              </a>{" "}
              {t.recipe.writtenBy}{" "}
              <a href={r.history_url} className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand">
                {t.recipe.contributors}
              </a>
              {t.recipe.sharedUnder}{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand"
              >
                CC BY-SA 4.0
              </a>{" "}
              {t.recipe.reformatted(updated).replace(/^ /, "")}
            </p>
            <a href={r.url} className="mt-3 inline-flex items-center gap-1 font-medium text-brand hover:underline">
              {t.recipe.readOriginal} <ExternalLink className="size-3.5" aria-hidden />
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

function StaticIngredients({ groups, lang, heading }: { groups: RecipeDetail["groups"]; lang: string; heading: string }) {
  return (
    <section aria-labelledby="ingredients" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 id="ingredients" className="font-display text-xl font-semibold">
        {heading}
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

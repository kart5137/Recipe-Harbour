import { Clock, Drumstick, Flame, Gauge, Globe2, Languages, Leaf, Slice, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { CookingMode, StartCookingButton } from "@/components/cooking-mode";
import { CuePill } from "@/components/cue-pill";
import { FavouriteButton } from "@/components/favourite-button";
import { IngredientsPanel } from "@/components/ingredients-panel";
import { getIngredientsLite, getRecipe, ingredientGroup, sampleRecipeIds } from "@/lib/data";
import { family } from "@/lib/families";
import { formatMinutes } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import { type Method, type PrepLine, splitMethod } from "@/lib/method";
import { localize, type RecipeDetail } from "@/lib/recipe";

export function generateStaticParams() {
  // A sample is prerendered at build time; every other recipe renders on first visit and is then cached.
  return sampleRecipeIds().map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<"/[lang]/recipe/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const lang = await getLocale();
  const t = dict(lang);
  const raw = getRecipe(id);
  const r = raw && localize(raw, lang);
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
  const raw = getRecipe(id);
  if (!raw) notFound();
  const r = localize(raw, lang);
  const t = dict(lang);
  const diet = r.diet === "vegan" || r.diet === "vegetarian" || r.diet === "none" ? t.diet[r.diet] : null;
  const fam = family(r.family);
  const Icon = fam.icon;
  const time = formatMinutes(r.minutes, lang);
  const source = t.recipe.source[r.lang];
  const method = splitMethod(r.groups, r.steps, r.textLang, ingredientGroup);

  return (
    <article className="rise mt-4">
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
          <h1 lang={r.textLang} className="mt-3 max-w-3xl font-display text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            {r.title}
          </h1>
          {r.translated && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-muted">
              <Languages className="size-3.5" aria-hidden />
              {t.recipe.machineTranslated[r.lang]} ·{" "}
              <a href={r.url} hrefLang={r.lang} className="underline decoration-line underline-offset-2 hover:text-ink">
                {t.recipe.original}
              </a>
            </p>
          )}
          {r.steps.length > 0 && (
            <div className="mt-5">
              {/* Cooking mode opens from the address (?cook=1), so Back closes it; reading the
                  address needs its own Suspense boundary in a prerendered page. */}
              <Suspense fallback={<StartCookingButton />}>
                <CookingMode method={method} title={r.title} textLang={r.textLang} />
              </Suspense>
            </div>
          )}
          {r.description && (
            <p lang={r.textLang} className="mt-4 max-w-3xl text-base leading-relaxed text-ink/80 sm:text-lg">
              {r.description}
            </p>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {time && <Fact icon={<Clock className="size-4" />} term={t.recipe.time} value={time} />}
            {r.servings_text && (
              <Fact icon={<Users className="size-4" />} term={t.recipe.serves} value={r.servings_text} lang={r.textLang} />
            )}
            {r.difficulty && <Fact icon={<Gauge className="size-4" />} term={t.recipe.difficulty} value={t.recipe.difficultyValue(r.difficulty)} />}
            {(r.cuisine || r.category) && (
              <Fact icon={<Globe2 className="size-4" />} term={t.recipe.type} value={[r.cuisine, r.category].filter(Boolean).join(" · ")} lang={r.textLang} />
            )}
            {diet && (
              <Fact
                icon={r.diet === "none" ? <Drumstick className="size-4" /> : <Leaf className="size-4" />}
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
          <Suspense fallback={<StaticIngredients groups={r.groups} lang={r.textLang} heading={t.recipe.ingredients} />}>
            <IngredientsPanel
              recipe={{ title: r.title, groups: r.groups, lang: r.textLang }}
              ingredients={getIngredientsLite()}
            />
          </Suspense>
        </div>

        <div className="space-y-8">
          <MethodSections method={method} lang={lang} textLang={r.textLang} />

          {r.equipment.length > 0 && (
            <section aria-labelledby="equipment">
              <h2 id="equipment" className="font-display text-xl font-semibold">
                {t.recipe.equipment}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2" lang={r.textLang}>
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
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted" lang={r.textLang}>
                {r.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          {r.diet_source === "inferred" && (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">{t.recipe.dietNote}</p>
          )}

          <p className="text-xs text-muted">
            {t.recipe.sourceLabel}{" "}
            <a href={r.url} className="underline decoration-line underline-offset-2 hover:text-ink">
              {source}
            </a>{" "}
            ·{" "}
            <a href={r.history_url} className="underline decoration-line underline-offset-2 hover:text-ink">
              {t.recipe.authors}
            </a>{" "}
            ·{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline decoration-line underline-offset-2 hover:text-ink">
              CC BY-SA 4.0
            </a>{" "}
            · {t.recipe.adapted}
          </p>
        </div>
      </div>
    </article>
  );
}

/**
 * The method in two parts: getting ready (what to cut and how, the spices and their amounts, the
 * steps before anything is heated) and cooking (the rest, with the time and heat each step names).
 * Step numbers run on across both parts, so they still match the original recipe.
 */
function MethodSections({ method: m, lang, textLang }: { method: Method; lang: Locale; textLang: string }) {
  const t = dict(lang).recipe;
  const split = m.cook.length > 0;
  const hasPrep = m.cut.length > 0 || m.season.length > 0 || m.prep.length > 0;
  return (
    <>
      {hasPrep && (
        <section aria-labelledby="preparation">
          <h2 id="preparation" className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Slice className="size-6 text-brand" aria-hidden />
            {split ? t.preparation : t.method}
          </h2>
          {split && <p className="mt-1 text-xs text-muted">{t.splitNote}</p>}
          {(m.cut.length > 0 || m.season.length > 0) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2" lang={textLang}>
              {m.cut.length > 0 && <PrepList heading={t.cutHeading} lines={m.cut} />}
              {m.season.length > 0 && <PrepList heading={t.seasonHeading} lines={m.season} />}
            </div>
          )}
          {m.prep.length > 0 && (
            <>
              {(m.cut.length > 0 || m.season.length > 0) && (
                <h3 className="mt-6 text-sm font-semibold tracking-wide text-muted uppercase">{t.stepsHeading}</h3>
              )}
              <ol className="mt-3 space-y-4" lang={textLang}>
                {m.prep.map((s, i) => (
                  <Step key={i} n={i + 1} text={s} />
                ))}
              </ol>
            </>
          )}
        </section>
      )}
      {split && (
        <section aria-labelledby="cooking">
          <h2 id="cooking" className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Flame className="size-6 text-brand" aria-hidden />
            {t.cooking}
          </h2>
          <ol className="mt-4 space-y-4" lang={textLang}>
            {m.cook.map((s, i) => (
              <Step key={i} n={m.prep.length + i + 1} text={s.text}>
                {s.cues.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5" lang={lang}>
                    {s.cues.map((c, ci) => (
                      <CuePill key={ci} cue={c} lang={lang} />
                    ))}
                  </span>
                )}
              </Step>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function PrepList({ heading, lines }: { heading: string; lines: PrepLine[] }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{heading}</h3>
      <ul className="mt-3 divide-y divide-line/70">
        {lines.map((l, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-[15px] first:pt-0 last:pb-0">
            {l.amount && <span className="font-semibold tabular-nums">{l.amount}</span>}
            <span className="min-w-0 flex-1">{l.name}</span>
            {l.cut && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-ink">{l.cut}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({ n, text, children }: { n: number; text: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brand-ink">{n}</span>
      <div className="pt-1">
        <p className="leading-relaxed">{text}</p>
        {children}
      </div>
    </li>
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

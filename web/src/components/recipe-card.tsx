import { ArrowRight, Check, Clock, Leaf, ShoppingBasket } from "lucide-react";
import Link from "next/link";

import { FavouriteButton } from "@/components/favourite-button";
import { family } from "@/lib/families";
import { formatMinutes } from "@/lib/format";
import { dict, type Locale } from "@/lib/i18n";
import { label } from "@/lib/labels";
import { type Hit, type Ingredient, shown } from "@/lib/search";

type Props = { hit: Hit; ingredients: Ingredient[]; pantry: boolean; query: string; lang: Locale };

export function RecipeCard({ hit, ingredients, pantry, query, lang }: Props) {
  const t = dict(lang);
  const r = hit.recipe;
  const view = shown(r, lang);
  const fam = family(r.family);
  const Icon = fam.icon;
  const time = formatMinutes(r.min, lang);
  const diet = r.diet === "vegan" || r.diet === "vegetarian" ? t.diet[r.diet] : null;
  const missing = hit.missing.map((i) => label(ingredients[i].id, lang));
  const shownMissing = missing.slice(0, 3);
  const moreMissing = missing.length - shownMissing.length + hit.missingOther;
  const ready = pantry && !hit.missing.length && !hit.missingOther;

  return (
    <article className="press-card group relative flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`flex items-center justify-between gap-2 py-2 pr-2 pl-4 ${fam.tint}`}>
        <span className={`inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${fam.ink}`}>
          <Icon className="size-5" aria-hidden />
          {fam.label[lang]}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-md bg-surface/80 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-muted" title={t.card.recipeLang[r.lang]}>
            {r.lang.toUpperCase()}
          </span>
          <FavouriteButton fav={{ id: r.id, title: view.title, lang: r.lang, family: r.family, min: r.min }} compact />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-display text-lg leading-snug font-semibold">
          <Link href={`/${lang}/recipe/${r.id}${query}`} lang={view.lang} className="after:absolute after:inset-0 focus-visible:outline-none">
            {view.title}
          </Link>
        </h3>

        {(time || r.diff || diet) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {time}
              </span>
            )}
            {r.diff && (
              <span className="inline-flex items-center gap-1" title={t.card.difficulty(r.diff)}>
                <span className="sr-only">{t.card.difficulty(r.diff)}</span>
                {[1, 2, 3, 4, 5].map((d) => (
                  <span key={d} aria-hidden className={`size-1.5 rounded-full ${d <= r.diff! ? "bg-accent" : "bg-line"}`} />
                ))}
              </span>
            )}
            {diet && (
              <span className="inline-flex items-center gap-1 font-medium text-have">
                <Leaf className="size-3.5" aria-hidden />
                {diet}
              </span>
            )}
          </div>
        )}

        {view.desc && (
          <p lang={view.lang} className="line-clamp-2 text-sm text-muted">
            {view.desc}
          </p>
        )}

        {pantry && (
          <div className="mt-auto space-y-2 pt-1 text-sm">
            <p className="flex items-start gap-2 text-have">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">{t.card.youHave}</span>
                {hit.used.map((i) => label(ingredients[i].id, lang)).join(", ")}
              </span>
            </p>
            {ready ? (
              <p className="inline-flex rounded-full bg-have-soft px-2.5 py-0.5 text-xs font-semibold text-have">{t.card.everything}</p>
            ) : (
              <p className="flex items-start gap-2 text-miss">
                <ShoppingBasket className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="sr-only">{t.card.missing}</span>
                  {shownMissing.join(", ")}
                  {moreMissing > 0 && (shownMissing.length ? t.card.more(moreMissing) : t.card.others(moreMissing))}
                </span>
              </p>
            )}
          </div>
        )}

        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-muted group-hover:text-brand">
          {t.card.view}
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </article>
  );
}

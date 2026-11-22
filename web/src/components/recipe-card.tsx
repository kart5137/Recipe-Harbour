import { ArrowRight, Check, Clock, Leaf, ShoppingBasket } from "lucide-react";
import Link from "next/link";

import { family } from "@/lib/families";
import { formatMinutes } from "@/lib/format";
import { label } from "@/lib/labels";
import type { Hit, Ingredient } from "@/lib/search";

const DIET: Record<string, string> = { vegan: "Vegan", vegetarian: "Vegetarian" };

type Props = { hit: Hit; ingredients: Ingredient[]; pantry: boolean; query: string };

export function RecipeCard({ hit, ingredients, pantry, query }: Props) {
  const r = hit.recipe;
  const fam = family(r.family);
  const Icon = fam.icon;
  const time = formatMinutes(r.min);
  const missing = hit.missing.map((i) => label(ingredients[i].id));
  const shownMissing = missing.slice(0, 3);
  const moreMissing = missing.length - shownMissing.length + hit.missingOther;
  const ready = pantry && !hit.missing.length && !hit.missingOther;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`flex items-center justify-between px-4 py-3 ${fam.tint}`}>
        <span className={`inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase ${fam.ink}`}>
          <Icon className="size-5" aria-hidden />
          {fam.label}
        </span>
        <span className="rounded-md bg-surface/80 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-muted" title={r.lang === "de" ? "German recipe" : "English recipe"}>
          {r.lang.toUpperCase()}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-display text-lg leading-snug font-semibold">
          <Link href={`/recipe/${r.id}${query}`} lang={r.lang} className="after:absolute after:inset-0 focus-visible:outline-none">
            {r.title}
          </Link>
        </h3>

        {(time || r.diff || DIET[r.diet]) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {time}
              </span>
            )}
            {r.diff && (
              <span className="inline-flex items-center gap-1" title={`Difficulty ${r.diff} of 5`}>
                <span className="sr-only">Difficulty {r.diff} of 5</span>
                {[1, 2, 3, 4, 5].map((d) => (
                  <span key={d} aria-hidden className={`size-1.5 rounded-full ${d <= r.diff! ? "bg-accent" : "bg-line"}`} />
                ))}
              </span>
            )}
            {DIET[r.diet] && (
              <span className="inline-flex items-center gap-1 font-medium text-have">
                <Leaf className="size-3.5" aria-hidden />
                {DIET[r.diet]}
              </span>
            )}
          </div>
        )}

        {r.desc && <p className="line-clamp-2 text-sm text-muted">{r.desc}</p>}

        {pantry && (
          <div className="mt-auto space-y-2 pt-1 text-sm">
            <p className="flex items-start gap-2 text-have">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">You have: </span>
                {hit.used.map((i) => label(ingredients[i].id)).join(", ")}
              </span>
            </p>
            {ready ? (
              <p className="inline-flex rounded-full bg-have-soft px-2.5 py-0.5 text-xs font-semibold text-have">
                You have everything
              </p>
            ) : (
              <p className="flex items-start gap-2 text-miss">
                <ShoppingBasket className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="sr-only">Missing: </span>
                  {shownMissing.join(", ")}
                  {moreMissing > 0 && (shownMissing.length ? ` + ${moreMissing} more` : `${moreMissing} other ingredient${moreMissing > 1 ? "s" : ""}`)}
                </span>
              </p>
            )}
          </div>
        )}

        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-muted group-hover:text-brand">
          View recipe
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </article>
  );
}

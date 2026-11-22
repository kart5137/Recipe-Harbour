"use client";

import { Check, ClipboardCheck, Copy, ShoppingBasket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { parseState } from "@/lib/params";
import type { RecipeDetail } from "@/lib/recipe";
import { buildRelations, covers, type Ingredient } from "@/lib/search";

type Props = { recipe: Pick<RecipeDetail, "title" | "groups" | "lang">; ingredients: Ingredient[] };

const key = (g: number, i: number) => `${g}-${i}`;

/**
 * Ingredients you can tick off, and the shopping list of what is left. Ticks start from
 * your search (ingredients you entered, plus staples unless you switched them off);
 * without a search only the staples are ticked.
 */
export function IngredientsPanel({ recipe, ingredients }: Props) {
  const sp = useSearchParams();
  const rel = useMemo(() => buildRelations(ingredients), [ingredients]);
  const initial = useMemo(() => {
    const state = parseState(Object.fromEntries(sp.entries()));
    const set = new Set<string>();
    recipe.groups.forEach((g, gi) =>
      g.items.forEach((it, ii) => {
        if (it.ids.length && covers(rel, state.have, it.ids, state.staples)) set.add(key(gi, ii));
      }),
    );
    return set;
  }, [sp, recipe.groups, rel]);
  const [have, setHave] = useState<Set<string>>(initial);
  const [copied, setCopied] = useState(false);

  const toggle = (k: string) =>
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const lines = recipe.groups.flatMap((g, gi) => g.items.map((it, ii) => ({ ...it, k: key(gi, ii) })));
  const required = lines.filter((l) => !l.optional);
  const toBuy = required.filter((l) => !have.has(l.k));
  const haveCount = required.length - toBuy.length;

  const copy = async () => {
    const text = [`${recipe.title}: shopping list`, ...toBuy.map((l) => `- ${l.text}`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="ingredients" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="ingredients" className="font-display text-xl font-semibold">
            Ingredients
          </h2>
          <p className="text-sm text-muted" aria-live="polite">
            You have <span className="font-semibold text-have">{haveCount}</span> of {required.length}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted">Tick what you already have.</p>

        <div className="mt-4 space-y-5" lang={recipe.lang}>
          {recipe.groups.map((g, gi) => (
            <div key={gi}>
              {g.name && <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{g.name}</h3>}
              <ul className="space-y-1">
                {g.items.map((it, ii) => {
                  const k = key(gi, ii);
                  const on = have.has(k);
                  return (
                    <li key={k}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                        <input type="checkbox" checked={on} onChange={() => toggle(k)} className="peer sr-only" />
                        <span
                          aria-hidden
                          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand ${on ? "border-have bg-have text-white" : "border-line bg-surface"}`}
                        >
                          {on && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        <span className={`text-[15px] leading-snug ${on ? "text-muted line-through decoration-muted/40" : ""}`}>
                          {it.text}
                          {it.optional && (
                            <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted no-underline">
                              optional
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="shopping" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 id="shopping" className="flex items-center gap-2 font-display text-xl font-semibold">
            <ShoppingBasket className="size-5 text-miss" aria-hidden />
            Shopping list
          </h2>
          {toBuy.length > 0 && (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
            >
              {copied ? <ClipboardCheck className="size-4 text-have" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy list"}
            </button>
          )}
        </div>
        {toBuy.length === 0 ? (
          <p className="mt-3 rounded-xl bg-have-soft px-4 py-3 text-sm font-medium text-have">
            Nothing to buy: you have everything for this recipe.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-[15px]" lang={recipe.lang}>
            {toBuy.map((l) => (
              <li key={l.k} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-miss" />
                {l.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

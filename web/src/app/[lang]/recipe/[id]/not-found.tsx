import Link from "next/link";

import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";

export default async function RecipeNotFound() {
  const lang = await getLocale();
  const t = dict(lang).recipe;
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold">{t.notFoundTitle}</h1>
      <p className="mt-3 max-w-xl text-muted">{t.notFoundText}</p>
      <Link href={`/${lang}`} className="mt-6 inline-flex rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
        {t.searchRecipes}
      </Link>
    </main>
  );
}

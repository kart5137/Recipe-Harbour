import type { Metadata } from "next";

import { FavouritesList } from "@/components/favourites-list";
import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale());
  return { title: `${t.favourites.title} · Recipe Harbour` };
}

export default async function FavouritesPage() {
  const t = dict(await getLocale()).favourites;
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t.title}</h1>
      <p className="mt-3 max-w-xl text-muted">{t.intro}</p>
      <div className="mt-8">
        <FavouritesList />
      </div>
    </main>
  );
}

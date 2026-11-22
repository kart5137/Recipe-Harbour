"use client";

import { Heart } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useDict } from "@/components/locale";
import { type Favourite, getServerSnapshot, getSnapshot, subscribe, toggleFavourite } from "@/lib/favourites";

/** Heart toggle. `compact` is the icon-only version on recipe cards. */
export function FavouriteButton({ fav, compact }: { fav: Favourite; compact?: boolean }) {
  const t = useDict();
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).some((f) => f.id === fav.id);
  const text = saved ? t.recipe.saved : t.recipe.save;
  const heart = <Heart className={`size-4 ${saved ? "fill-current text-rose-600 dark:text-rose-400" : ""}`} aria-hidden />;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => toggleFavourite(fav)}
        aria-pressed={saved}
        aria-label={t.recipe.save}
        title={text}
        className="relative z-10 grid size-8 place-items-center rounded-full bg-surface/80 text-muted transition hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-brand"
      >
        {heart}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => toggleFavourite(fav)}
      aria-pressed={saved}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-sm transition hover:border-rose-400"
    >
      {heart}
      {text}
    </button>
  );
}

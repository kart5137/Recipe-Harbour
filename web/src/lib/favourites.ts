/**
 * Saved recipes, kept in this browser's localStorage only. A tiny external store for
 * useSyncExternalStore: the server (and the first client render) sees an empty list.
 */
export type Favourite = { id: string; title: string; lang: "en" | "de"; family: string; min: [number, number] | null };

const KEY = "rh:favourites";
const EMPTY: Favourite[] = [];
const listeners = new Set<() => void>();
let cache: Favourite[] | null = null;

function isFavourite(x: unknown): x is Favourite {
  const f = x as Favourite;
  return typeof f?.id === "string" && typeof f.title === "string" && (f.lang === "en" || f.lang === "de");
}

function read(): Favourite[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return EMPTY;
    return raw.filter(isFavourite).map((f) => ({ ...f, family: f.family ?? "main", min: f.min ?? null }));
  } catch {
    return EMPTY;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY && e.key !== null) return;
  cache = null; // changed in another tab
  emit();
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): Favourite[] {
  if (cache === null) cache = read();
  return cache;
}

export function getServerSnapshot(): Favourite[] {
  return EMPTY;
}

export function toggleFavourite(f: Favourite): void {
  const cur = getSnapshot();
  cache = cur.some((x) => x.id === f.id) ? cur.filter((x) => x.id !== f.id) : [f, ...cur];
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage blocked or full (private mode): the change lasts for this page view only.
  }
  emit();
}

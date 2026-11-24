import { suggestEntries, type SuggestEntry, type SuggestNames } from "./search.ts";

let entries: Promise<SuggestEntry[]> | null = null;

/** The autocomplete vocabulary, fetched once per visit (and kept by the browser cache). */
export function loadSuggestEntries(): Promise<SuggestEntry[]> {
  entries ??= fetch("/api/suggest")
    .then((r) => {
      if (!r.ok) throw new Error(`suggest ${r.status}`);
      return r.json() as Promise<SuggestNames>;
    })
    .then(suggestEntries)
    .catch((e) => {
      entries = null; // try again next time
      throw e;
    });
  return entries;
}

// Start as soon as this code arrives, so the list is there before the first keystroke.
if (typeof window !== "undefined") loadSuggestEntries().catch(() => {});

"use client";

import { LoaderCircle, Plus, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { label } from "@/lib/labels";
import { type SearchState, toQuery } from "@/lib/params";
import { suggest, type SuggestEntry } from "@/lib/search";

type Props = { state: SearchState; entries: SuggestEntry[] };

/**
 * The search panel: ingredient chips with autocomplete (English or German names), a
 * recipe-name box, recipe language and the "assume staples" switch. Everything lives in
 * the URL, so results are rendered on the server and every search can be shared.
 */
export function PantrySearch({ state, entries }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState(state.q);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const go = (next: Partial<SearchState>) => {
    const merged = { ...state, n: undefined, ...next };
    startTransition(() => router.replace(`${pathname}${toQuery(merged)}`, { scroll: false }));
  };

  // Debounced recipe-name search.
  useEffect(() => {
    if (q === state.q) return;
    const t = setTimeout(() => go({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const suggestions = useMemo(() => suggest(entries, text, state.have), [entries, text, state.have]);

  const add = (id: string) => {
    setText("");
    setOpen(false);
    setActive(0);
    go({ have: [...state.have, id] });
    inputRef.current?.focus();
  };
  const remove = (id: string) => go({ have: state.have.filter((h) => h !== id) });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[active]) add(suggestions[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !text && state.have.length) {
      remove(state.have[state.have.length - 1]);
    }
  };

  const showList = open && text.trim() !== "";

  return (
    <section aria-label="Search" className="rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-6">
      <label htmlFor={`${listId}-input`} className="text-sm font-semibold">
        What do you have?
      </label>
      <div className="relative mt-2">
        <div
          className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25"
          onClick={() => inputRef.current?.focus()}
        >
          {state.have.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-sm font-medium text-ink">
              {label(id)}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-brand/15 hover:text-ink"
                aria-label={`Remove ${label(id)}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={showList && suggestions[active] ? `${listId}-opt-${active}` : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder={state.have.length ? "Add more…" : "Type an ingredient: onion, Zwiebel, rice…"}
            className="min-w-40 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted/80"
            autoComplete="off"
          />
          {pending && <LoaderCircle className="size-5 animate-spin text-muted" aria-label="Updating results" />}
        </div>

        {showList && (
          <ul
            id={`${listId}-list`}
            role="listbox"
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lg"
          >
            {suggestions.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted">No ingredient called “{text.trim()}” in the vocabulary.</li>
            )}
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm ${i === active ? "bg-brand-soft" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <Plus className="size-4 text-brand" aria-hidden />
                  <span className="font-medium">{label(s.id)}</span>
                </span>
                {s.name.toLowerCase() !== label(s.id).toLowerCase() && (
                  <span className="truncate text-xs text-muted">
                    {s.lang === "de" ? "DE" : "EN"} · {s.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Or search recipe names (optional)"
            aria-label="Search recipe names"
            className="h-11 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
        </div>
        <div role="radiogroup" aria-label="Recipe language" className="inline-flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
          {(
            [
              ["all", "All recipes"],
              ["en", "English"],
              ["de", "Deutsch"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={state.lang === value}
              onClick={() => go({ lang: value })}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${state.lang === value ? "bg-brand text-brand-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-muted">
          <button
            type="button"
            role="switch"
            aria-checked={state.staples}
            onClick={() => go({ staples: !state.staples })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${state.staples ? "bg-brand" : "bg-line"}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${state.staples ? "left-5.5" : "left-0.5"}`} />
          </button>
          I have the basics: salt, pepper, oil, sugar and water
        </label>
        {(state.have.length > 0 || state.q) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              go({ have: [], q: "" });
            }}
            className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Clear search
          </button>
        )}
      </div>
    </section>
  );
}

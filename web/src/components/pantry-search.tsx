"use client";

import { Camera, LoaderCircle, Plus, ScanBarcode, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { useDict, useLocale } from "@/components/locale";
import { PhotoDialog } from "@/components/photo-dialog";
import { ScanDialog } from "@/components/scan-dialog";
import { FAMILIES } from "@/lib/families";
import { label } from "@/lib/labels";
import { type Diet, FAMILY_KEYS, type SearchState, TIME_OPTIONS, toQuery } from "@/lib/params";
import { suggest, type SuggestEntry } from "@/lib/search";

type Props = { state: SearchState; entries: SuggestEntry[] };

/**
 * The search panel: ingredient chips with autocomplete (English or German names), a
 * recipe-name box, recipe language and the "assume staples" switch. Everything lives in
 * the URL, so results are rendered on the server and every search can be shared.
 */
export function PantrySearch({ state, entries }: Props) {
  const lang = useLocale();
  const t = useDict();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState(state.q);
  const [scanOpen, setScanOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
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
    <section aria-label={t.search.label} className="rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${listId}-input`} className="shrink-0 text-sm font-semibold">
          {t.search.whatHave}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand"
          >
            <Camera className="size-4" aria-hidden />
            {t.search.photo}
          </button>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand"
          >
            <ScanBarcode className="size-4" aria-hidden />
            {t.search.barcode}
          </button>
        </div>
      </div>
      <PhotoDialog
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onAdd={(id) => go({ have: [...state.have.filter((h) => h !== id), id] })}
        have={state.have}
      />
      <ScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onAdd={(id) => go({ have: [...state.have.filter((h) => h !== id), id] })}
        have={state.have}
      />
      <div className="relative mt-2">
        <div
          className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25"
          onClick={() => inputRef.current?.focus()}
        >
          {state.have.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-sm font-medium text-ink">
              {label(id, lang)}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-brand/15 hover:text-ink"
                aria-label={t.search.remove(label(id, lang))}
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
            placeholder={state.have.length ? t.search.placeholderMore : t.search.placeholderFirst}
            className="min-w-40 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted/80"
            autoComplete="off"
          />
          {pending && <LoaderCircle className="size-5 animate-spin text-muted" aria-label={t.search.updating} />}
        </div>

        {showList && (
          <ul
            id={`${listId}-list`}
            role="listbox"
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lg"
          >
            {suggestions.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted">{t.search.noIngredient(text.trim())}</li>
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
                  <span className="font-medium">{label(s.id, lang)}</span>
                </span>
                {s.name.toLowerCase() !== label(s.id, lang).toLowerCase() && (
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
            placeholder={t.search.names}
            aria-label={t.search.namesAria}
            className="h-11 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
        </div>
        <div role="radiogroup" aria-label={t.search.recipeLanguage} className="inline-flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
          {(
            [
              ["all", t.search.langAll],
              ["en", t.search.langEn],
              ["de", t.search.langDe],
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
          {t.search.staples}
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
            {t.search.clear}
          </button>
        )}
      </div>

      <Filters state={state} go={go} />
    </section>
  );
}

const SELECT =
  "h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Dish type, time and diet, plus "only what I can make now" once there are ingredients. */
function Filters({ state, go }: { state: SearchState; go: (next: Partial<SearchState>) => void }) {
  const lang = useLocale();
  const t = useDict().filters;
  const active = Boolean(state.type || state.time || state.diet || state.ready);
  const families = [...FAMILY_KEYS].sort((a, b) => FAMILIES[a].label[lang].localeCompare(FAMILIES[b].label[lang], lang));
  return (
    <fieldset className="mt-4 border-t border-line pt-4">
      <legend className="sr-only">{t.label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-4 text-muted" aria-hidden />
        <select aria-label={t.type} value={state.type} onChange={(e) => go({ type: e.target.value })} className={SELECT}>
          <option value="">{t.anyType}</option>
          {families.map((k) => (
            <option key={k} value={k}>
              {FAMILIES[k].label[lang]}
            </option>
          ))}
        </select>
        <select aria-label={t.time} value={state.time} onChange={(e) => go({ time: Number(e.target.value) })} className={SELECT}>
          <option value={0}>{t.anyTime}</option>
          {TIME_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {t.upTo(m)}
            </option>
          ))}
        </select>
        <select aria-label={t.diet} value={state.diet} onChange={(e) => go({ diet: e.target.value as Diet })} className={SELECT}>
          <option value="">{t.anyDiet}</option>
          <option value="vegetarian">{t.vegetarian}</option>
          <option value="vegan">{t.vegan}</option>
        </select>
        {state.have.length > 0 && (
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium has-checked:border-have has-checked:bg-have-soft has-checked:text-have">
            <input type="checkbox" checked={state.ready} onChange={(e) => go({ ready: e.target.checked })} className="size-4 accent-[var(--color-have)]" />
            {t.ready}
          </label>
        )}
        {active && (
          <button
            type="button"
            onClick={() => go({ type: "", time: 0, diet: "", ready: false })}
            className="h-10 px-2 text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {t.reset}
          </button>
        )}
      </div>
      {state.time > 0 && <p className="mt-2 text-xs text-muted">{t.timeNote}</p>}
    </fieldset>
  );
}

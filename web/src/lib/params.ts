/**
 * Search state <-> URL, shared by server and client:
 * ?have=onion,garlic&q=soup&lang=de&staples=0&type=soup&time=30&diet=vegetarian&ready=1&n=48
 */
export type Diet = "" | "vegetarian" | "vegan";

export type SearchState = {
  have: string[];
  q: string;
  lang: "all" | "en" | "de";
  staples: boolean;
  type: string; // dish family, "" = any
  time: number; // maximum minutes, 0 = any
  diet: Diet;
  ready: boolean; // only recipes you can make now
  n: number;
};

export const PAGE = 24;
const MAX_N = 480;
export const TIME_OPTIONS = [15, 30, 60, 120] as const;
export const FAMILY_KEYS = [
  "soup", "salad", "pasta", "rice", "meat", "poultry", "fish", "vegetable", "snack", "bread", "baking",
  "dessert", "breakfast", "sauce", "drink", "main",
] as const;

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseState(sp: Raw): SearchState {
  const have = [...new Set(first(sp.have).split(",").map((s) => s.trim()).filter((s) => /^[a-z_]{1,40}$/.test(s)))];
  const lang = first(sp.lang);
  const n = Number.parseInt(first(sp.n), 10);
  const type = first(sp.type);
  const time = Number.parseInt(first(sp.time), 10);
  const diet = first(sp.diet);
  return {
    have: have.slice(0, 20),
    q: first(sp.q).slice(0, 80),
    lang: lang === "en" || lang === "de" ? lang : "all",
    staples: first(sp.staples) !== "0",
    type: (FAMILY_KEYS as readonly string[]).includes(type) ? type : "",
    time: (TIME_OPTIONS as readonly number[]).includes(time) ? time : 0,
    diet: diet === "vegetarian" || diet === "vegan" ? diet : "",
    ready: first(sp.ready) === "1",
    n: Number.isFinite(n) && n > 0 ? Math.min(n, MAX_N) : PAGE,
  };
}

export function toQuery(s: Partial<SearchState>): string {
  const p = new URLSearchParams();
  if (s.have?.length) p.set("have", s.have.join(","));
  if (s.q?.trim()) p.set("q", s.q.trim());
  if (s.lang && s.lang !== "all") p.set("lang", s.lang);
  if (s.staples === false) p.set("staples", "0");
  if (s.type) p.set("type", s.type);
  if (s.time) p.set("time", String(s.time));
  if (s.diet) p.set("diet", s.diet);
  if (s.ready) p.set("ready", "1");
  if (s.n && s.n !== PAGE) p.set("n", String(s.n));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** Any filter that narrows the list without ingredients or a name search. */
export function hasFilters(s: SearchState): boolean {
  return Boolean(s.type || s.time || s.diet || s.lang !== "all");
}

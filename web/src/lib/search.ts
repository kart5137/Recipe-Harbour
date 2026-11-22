/**
 * Pantry search over the exported index (pipeline `rh export`).
 *
 * A recipe line is satisfied when one of its ingredients is related to something you
 * have: the same ingredient, a more specific one (your olive oil covers "oil"), or a more
 * general one of the same kind (your "cheese" covers "parmesan"; your onion does not
 * cover onion powder, see `related`). Staples (salt, pepper, oil, sugar, water)
 * can be assumed. Recipes are ranked by how much of the recipe you can cover, weighted by
 * how many of your ingredients it uses.
 *
 * Pure functions only (no file access), so the same code runs in tests and on the server.
 */
import { norm, tokens } from "./norm.ts";

export type Ingredient = {
  id: string;
  group: string;
  staple: boolean;
  parents: number[];
  en: string[];
  de: string[];
};

export type Recipe = {
  id: string;
  lang: "en" | "de";
  title: string;
  family: string;
  desc: string;
  min: [number, number] | null;
  diff: number | null;
  diet: "" | "vegan" | "vegetarian" | "none";
  req: number[][];
  opt: number[];
  unk: number;
  url: string;
};

export type IndexData = {
  version: number;
  built_at: string;
  licence: string;
  ingredients: Ingredient[];
  recipes: Recipe[];
};

/** Ingredient hierarchy, usable without the recipes (the recipe page uses it in the browser). */
export type Relations = {
  ingredients: Ingredient[];
  byId: Map<string, number>;
  ancestors: Set<number>[];
};

export type Model = Relations & {
  data: IndexData;
  titleTokens: string[][];
};

export function buildRelations(ingredients: Ingredient[]): Relations {
  const byId = new Map(ingredients.map((ing, i) => [ing.id, i]));
  const ancestors = ingredients.map((_, i) => {
    const out = new Set<number>();
    const todo = [...ingredients[i].parents];
    while (todo.length) {
      const p = todo.pop()!;
      if (!out.has(p)) {
        out.add(p);
        todo.push(...ingredients[p].parents);
      }
    }
    return out;
  });
  return { ingredients, byId, ancestors };
}

export function buildModel(data: IndexData): Model {
  const titleTokens = data.recipes.map((r) => tokens(r.title));
  return { ...buildRelations(data.ingredients), data, titleTokens };
}

/**
 * Does having `user` satisfy a recipe that needs `need`?
 *
 * The hierarchy counts only between ingredients of the same food group: those are "kind
 * of" relations (parmesan is a cheese, olive oil is an oil, spaghetti is pasta). Across
 * groups it means "made from" (onion powder from onion, tomato paste from tomato, chicken
 * broth from chicken), and having one does not mean having the other.
 */
export function related(m: Relations, user: number, need: number): boolean {
  if (user === need) return true;
  const ing = m.ingredients;
  if (kind(ing[user].group) !== kind(ing[need].group)) return false;
  return m.ancestors[need].has(user) || m.ancestors[user].has(need);
}

/**
 * Is a recipe line (ingredient ids, any of which will do) covered by what you have?
 * Unknown ids are ignored; staples count when assumed.
 */
export function covers(m: Relations, have: string[], lineIds: string[], staples: boolean): boolean {
  const need = lineIds.filter((id) => m.byId.has(id)).map((id) => m.byId.get(id)!);
  const mine = have.filter((id) => m.byId.has(id)).map((id) => m.byId.get(id)!);
  if (need.some((n) => mine.some((u) => related(m, u, n)))) return true;
  return staples && need.some((n) => m.ingredients[n].staple);
}

// Poultry is a kind of meat and seafood a kind of fish ("500 g meat" is covered by chicken).
const KIND_OF: Record<string, string> = { poultry: "meat", seafood: "fish" };
function kind(group: string): string {
  return KIND_OF[group] ?? group;
}

export type Query = {
  have: string[]; // ingredient ids
  q: string; // recipe name search
  lang: "all" | "en" | "de";
  staples: boolean; // assume salt, pepper, oil, sugar, water
  type?: string; // dish family, "" = any
  time?: number; // maximum minutes (recipes without a stated time are excluded), 0 = any
  diet?: "" | "vegetarian" | "vegan"; // vegetarian includes vegan
  ready?: boolean; // only recipes with nothing missing (needs ingredients)
  browse?: boolean; // with no ingredients and no name: list every recipe that passes the filters
};

/** Does a recipe pass the dish-type, time and diet filters? */
export function passesFilters(r: Recipe, q: Pick<Query, "lang" | "type" | "time" | "diet">): boolean {
  if (q.lang !== "all" && r.lang !== q.lang) return false;
  if (q.type && r.family !== q.type) return false;
  if (q.time && !(r.min && r.min[0] <= q.time)) return false;
  if (q.diet === "vegan" && r.diet !== "vegan") return false;
  if (q.diet === "vegetarian" && r.diet !== "vegetarian" && r.diet !== "vegan") return false;
  return true;
}

export type Hit = {
  recipe: Recipe;
  used: number[]; // your ingredients this recipe uses
  missing: number[]; // first ingredient of each line you don't cover
  missingOther: number; // lines the data could not identify
  satisfied: number;
  total: number;
  score: number;
};

export type Result = {
  hits: Hit[];
  total: number;
  canMakeNow: number;
  unknown: string[]; // ids in the query that are not in the vocabulary
};

function titleMatch(m: Model, i: number, qTokens: string[]): number {
  if (!qTokens.length) return 1;
  const tt = m.titleTokens[i];
  if (!qTokens.every((q) => tt.some((t) => t.startsWith(q)))) return 0;
  const title = tt.join(" ");
  const q = qTokens.join(" ");
  if (title === q) return 3;
  if (title.startsWith(q)) return 2;
  return 1;
}

export function search(m: Model, query: Query): Result {
  const { recipes, ingredients } = m.data;
  const unknown = query.have.filter((id) => !m.byId.has(id));
  const have = [...new Set(query.have.filter((id) => m.byId.has(id)).map((id) => m.byId.get(id)!))];
  const qTokens = tokens(query.q);
  const hits: Hit[] = [];

  recipes.forEach((recipe, i) => {
    if (!passesFilters(recipe, query)) return;
    const tm = titleMatch(m, i, qTokens);
    if (tm === 0) return;
    if (!have.length) {
      if (!qTokens.length && !query.browse) return; // nothing asked
      hits.push({ recipe, used: [], missing: [], missingOther: 0, satisfied: 0, total: 0, score: qTokens.length ? tm : 0 });
      return;
    }
    const used = new Set<number>();
    const missing: number[] = [];
    let satisfied = 0;
    for (const line of recipe.req) {
      let ok = false;
      for (const need of line) {
        for (const u of have) {
          if (related(m, u, need)) {
            used.add(u);
            ok = true;
          }
        }
      }
      if (!ok && query.staples && line.some((n) => ingredients[n].staple)) ok = true;
      if (ok) satisfied++;
      else missing.push(line[0]);
    }
    if (!used.size) return;
    const total = recipe.req.length + recipe.unk;
    const coverage = total ? satisfied / total : 0;
    const usedFrac = used.size / have.length;
    const score = coverage * (0.5 + 0.5 * usedFrac) + (tm > 1 ? 0.05 * tm : 0);
    hits.push({ recipe, used: [...used], missing, missingOther: recipe.unk, satisfied, total, score });
  });

  if (query.ready && have.length) {
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].missing.length || hits[i].missingOther) hits.splice(i, 1);
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.missing.length + a.missingOther - (b.missing.length + b.missingOther) ||
      b.used.length - a.used.length ||
      a.recipe.title.localeCompare(b.recipe.title),
  );
  const canMakeNow = have.length ? hits.filter((h) => !h.missing.length && !h.missingOther).length : 0;
  return { hits, total: hits.length, canMakeNow, unknown };
}

// ------------------------------------------------------------------ suggestions
export type Suggestion = { id: string; name: string; lang: "en" | "de" };
export type SuggestEntry = { id: string; names: { n: string; name: string; lang: "en" | "de" }[] };

/** Flatten the vocabulary into what the ingredient box needs (sent to the browser). */
export function suggestEntries(data: IndexData): SuggestEntry[] {
  return data.ingredients.map((ing) => ({
    id: ing.id,
    names: [
      ...ing.en.map((name) => ({ n: norm(name), name, lang: "en" as const })),
      ...ing.de.map((name) => ({ n: norm(name), name, lang: "de" as const })),
    ],
  }));
}

/** Best matching ingredients for what was typed, in either language. */
export function suggest(entries: SuggestEntry[], typed: string, exclude: string[] = [], limit = 8): Suggestion[] {
  const q = norm(typed);
  if (!q) return [];
  const scored: { s: number; sug: Suggestion; len: number }[] = [];
  for (const e of entries) {
    if (exclude.includes(e.id)) continue;
    let best: { s: number; name: string; lang: "en" | "de"; len: number } | null = null;
    for (const nm of e.names) {
      let s = 0;
      if (nm.n === q) s = 3;
      else if (nm.n.startsWith(q)) s = 2;
      else if (nm.n.split(" ").some((t) => t.startsWith(q))) s = 1;
      if (s && (!best || s > best.s || (s === best.s && nm.n.length < best.len))) {
        best = { s, name: nm.name, lang: nm.lang, len: nm.n.length };
      }
    }
    if (best) scored.push({ s: best.s, len: best.len, sug: { id: e.id, name: best.name, lang: best.lang } });
  }
  scored.sort((a, b) => b.s - a.s || a.len - b.len || a.sug.name.localeCompare(b.sug.name));
  return scored.slice(0, limit).map((x) => x.sug);
}

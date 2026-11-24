import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { type RecipeDetail, shardOf } from "./recipe.ts";
import { buildModel, type IndexData, type Model, type SuggestNames } from "./search.ts";

/**
 * The search index exported by the pipeline (`rh export`). Read once per server
 * instance; next.config.ts traces src/data into the deployment.
 */
let model: Model | null = null;

export function getModel(): Model {
  if (!model) {
    const file = path.join(process.cwd(), "src", "data", "search-index.json");
    model = buildModel(JSON.parse(readFileSync(file, "utf-8")) as IndexData);
  }
  return model;
}

const shards = new Map<number, Record<string, RecipeDetail>>();

/** One recipe's page data, or null for an unknown id. Loads only that recipe's shard. */
export function getRecipe(id: string): RecipeDetail | null {
  if (!/^(en|de)-\d{1,9}$/.test(id)) return null;
  const k = shardOf(id);
  if (!shards.has(k)) {
    const file = path.join(process.cwd(), "src", "data", "recipes", `shard-${String(k).padStart(2, "0")}.json`);
    shards.set(k, JSON.parse(readFileSync(file, "utf-8")));
  }
  return shards.get(k)![id] ?? null;
}

/** A few recipe ids to prerender at build time (the rest render on first visit). */
export function sampleRecipeIds(n = 12): string[] {
  const rs = getModel().data.recipes;
  const step = Math.max(1, Math.floor(rs.length / n));
  return rs.filter((_, i) => i % step === 0).slice(0, n).map((r) => r.id);
}

/** The ingredient hierarchy without names, for "do you have this?" checks in the browser. */
export function getIngredientsLite() {
  return getModel().data.ingredients.map(({ id, group, staple, parents }) => ({
    id, group, staple, parents, en: [] as string[], de: [] as string[],
  }));
}

/** Every ingredient's English and German names, for the autocomplete (served by /api/suggest). */
export function getSuggestNames(): SuggestNames {
  return { ingredients: getModel().data.ingredients.map(({ id, en, de }) => ({ id, en, de })) };
}

export function getStats() {
  const { recipes, built_at } = getModel().data;
  return {
    total: recipes.length,
    en: recipes.filter((r) => r.lang === "en").length,
    de: recipes.filter((r) => r.lang === "de").length,
    builtAt: built_at,
  };
}

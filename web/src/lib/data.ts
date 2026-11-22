import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { buildModel, type IndexData, type Model, suggestEntries, type SuggestEntry } from "./search.ts";

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

export function getSuggestEntries(): SuggestEntry[] {
  return suggestEntries(getModel().data);
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

/** Full recipe as exported by the pipeline (web/src/data/recipes/shard-NN.json). */
export type RecipeLine = { text: string; ids: string[]; optional: boolean; alt: boolean };

export type RecipeDetail = {
  id: string;
  lang: "en" | "de";
  title: string;
  family: string;
  description: string;
  category: string;
  cuisine: string;
  servings_text: string;
  servings: [number, number] | null;
  time_text: string;
  minutes: [number, number] | null;
  difficulty: number | null;
  diet: "" | "vegan" | "vegetarian" | "none";
  diet_source: "" | "wiki" | "inferred";
  groups: { name: string | null; items: RecipeLine[] }[];
  steps: string[];
  equipment: string[];
  notes: string[];
  url: string;
  history_url: string;
  revision_id: number | null;
  revision_timestamp: string;
};

export const SHARDS = 32;

/** 32-bit FNV-1a over UTF-8 bytes; the pipeline's export.shard_of computes the same. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shardOf(id: string): number {
  return fnv1a(id) % SHARDS;
}

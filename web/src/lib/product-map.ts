/**
 * Map an Open Food Facts product to one of our ingredients.
 *
 * 1. The product name itself is an ingredient name ("Nutella").
 * 2. Categories, most specific first ("en:durum-wheat-spaghetti" before "en:dry-pastas"),
 *    matched on their head: the phrase that ends the tag ("whole-milk-yogurts" is a yogurt,
 *    not milk). German tags ("de:gehackte-tomaten") use the German names.
 * 3. Words in the product name ("Barilla Spaghetti N°5" -> spaghetti).
 * Returns no ingredient when nothing fits (a cola is not a recipe ingredient here).
 */
import { tokens } from "./norm.ts";
import type { Ingredient } from "./search.ts";

export type OffProduct = {
  code: string;
  product_name?: string;
  product_name_en?: string;
  product_name_de?: string;
  generic_name?: string;
  brands?: string;
  categories_tags?: string[];
};

type Lang = "en" | "de";
export type NameIndex = Record<Lang, Map<string, string>> & { maxLen: number };

export function buildNameIndex(ingredients: Ingredient[]): NameIndex {
  const idx: NameIndex = { en: new Map(), de: new Map(), maxLen: 1 };
  for (const ing of ingredients) {
    for (const lang of ["en", "de"] as const) {
      for (const name of ing[lang]) {
        const t = tokens(name);
        if (!t.length) continue;
        idx[lang].set(t.join(" "), ing.id);
        idx.maxLen = Math.max(idx.maxLen, t.length);
      }
    }
  }
  return idx;
}

function singulars(tok: string, lang: Lang): string[] {
  const out: string[] = [];
  if (lang === "en") {
    if (tok.endsWith("ies") && tok.length > 4) out.push(tok.slice(0, -3) + "y");
    if (tok.endsWith("es") && tok.length > 4) out.push(tok.slice(0, -2));
    if (tok.endsWith("s") && tok.length > 3) out.push(tok.slice(0, -1));
  } else {
    for (const suf of ["en", "n", "e", "s", "er"]) if (tok.endsWith(suf) && tok.length - suf.length >= 3) out.push(tok.slice(0, -suf.length));
  }
  return out;
}

/** Exact phrase, or the phrase with its last word made singular. */
function lookup(idx: NameIndex, lang: Lang, toks: string[]): string | undefined {
  const exact = idx[lang].get(toks.join(" "));
  if (exact) return exact;
  const last = toks[toks.length - 1];
  for (const s of singulars(last, lang)) {
    const hit = idx[lang].get([...toks.slice(0, -1), s].join(" "));
    if (hit) return hit;
  }
  return undefined;
}

/** The longest known phrase that ends the token list (the head of a compound). */
function head(idx: NameIndex, lang: Lang, toks: string[]): string | undefined {
  for (let start = Math.max(0, toks.length - idx.maxLen); start < toks.length; start++) {
    const hit = lookup(idx, lang, toks.slice(start));
    if (hit) return hit;
  }
  return undefined;
}

/** First known phrase anywhere, longest first at each position. */
function firstPhrase(idx: NameIndex, lang: Lang, toks: string[]): string | undefined {
  for (let i = 0; i < toks.length; i++) {
    for (let n = Math.min(idx.maxLen, toks.length - i); n > 0; n--) {
      const hit = lookup(idx, lang, toks.slice(i, i + n));
      if (hit) return hit;
    }
  }
  return undefined;
}

export type ProductMatch = { id: string | null; via: "name" | "category" | "name-words" | null; tag?: string };

export function mapProduct(p: OffProduct, idx: NameIndex): ProductMatch {
  const names: [string, Lang][] = [];
  if (p.product_name_en) names.push([p.product_name_en, "en"]);
  if (p.product_name) names.push([p.product_name, "en"], [p.product_name, "de"]);
  if (p.product_name_de) names.push([p.product_name_de, "de"]);
  if (p.generic_name) names.push([p.generic_name, "en"], [p.generic_name, "de"]);

  for (const [name, lang] of names) {
    const id = lookup(idx, lang, tokens(name));
    if (id) return { id, via: "name" };
  }
  const tags = [...(p.categories_tags ?? [])].reverse();
  for (const tag of tags) {
    const m = /^(en|de):(.+)$/.exec(tag);
    if (!m) continue;
    const toks = tokens(m[2].replace(/-/g, " "));
    const id = toks.length ? head(idx, m[1] as Lang, toks) : undefined;
    if (id) return { id, via: "category", tag };
  }
  for (const [name, lang] of names) {
    const id = firstPhrase(idx, lang, tokens(name));
    if (id) return { id, via: "name-words" };
  }
  return { id: null, via: null };
}

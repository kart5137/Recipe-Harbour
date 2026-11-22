import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { label } from "../src/lib/labels.ts";
import { norm } from "../src/lib/norm.ts";
import {
  buildModel,
  type IndexData,
  type Recipe,
  related,
  search,
  suggest,
  suggestEntries,
} from "../src/lib/search.ts";

// A tiny hand-built index: every expectation below can be checked by hand.
const ING = [
  { id: "oil", group: "fat", staple: true, parents: [], en: ["oil"], de: ["öl"] }, // 0
  { id: "olive_oil", group: "fat", staple: false, parents: [0], en: ["olive oil"], de: ["olivenöl"] }, // 1
  { id: "onion", group: "vegetable", staple: false, parents: [], en: ["onion", "onions"], de: ["zwiebel", "zwiebeln"] }, // 2
  { id: "tomato", group: "vegetable", staple: false, parents: [], en: ["tomato"], de: ["tomate", "tomaten"] }, // 3
  { id: "cheese", group: "dairy", staple: false, parents: [], en: ["cheese"], de: ["käse"] }, // 4
  { id: "parmesan", group: "dairy", staple: false, parents: [4], en: ["parmesan"], de: ["parmesan"] }, // 5
  { id: "salt", group: "spice", staple: true, parents: [], en: ["salt"], de: ["salz"] }, // 6
  { id: "pasta", group: "grain", staple: false, parents: [], en: ["pasta"], de: ["nudeln"] }, // 7
  { id: "butter", group: "dairy", staple: false, parents: [], en: ["butter"], de: ["butter"] }, // 8
  { id: "margarine", group: "fat", staple: false, parents: [], en: ["margarine"], de: ["margarine"] }, // 9
  { id: "onion_powder", group: "spice", staple: false, parents: [2], en: ["onion powder"], de: ["zwiebelpulver"] }, // 10
  { id: "meat", group: "meat", staple: false, parents: [], en: ["meat"], de: ["fleisch"] }, // 11
  { id: "chicken", group: "poultry", staple: false, parents: [11], en: ["chicken"], de: ["huhn"] }, // 12
];

function recipe(id: string, title: string, req: number[][], extra: Partial<Recipe> = {}): Recipe {
  return {
    id, lang: "en", title, family: "main", desc: "", min: null, diff: null, diet: "", req, opt: [], unk: 0,
    url: "https://example.org", ...extra,
  };
}

const DATA: IndexData = {
  version: 1,
  built_at: "2026-11-22T00:00:00Z",
  licence: "test",
  ingredients: ING,
  recipes: [
    recipe("en-1", "Tomato Pasta", [[7], [3], [1], [6]]), // pasta, tomato, olive oil, salt
    recipe("en-2", "Onion Soup", [[2], [8, 9], [6]]), // onion, butter-or-margarine, salt
    recipe("en-3", "Pasta with Parmesan", [[7], [5], [0]]), // pasta, parmesan, oil
    recipe("de-4", "Zwiebelkuchen", [[2], [4], [8]], { lang: "de" }),
    recipe("en-5", "Mystery Stew", [[2]], { unk: 3 }),
  ],
};
const m = buildModel(DATA);
const ids = (r: ReturnType<typeof search>) => r.hits.map((h) => h.recipe.id);

describe("related", () => {
  it("a more specific ingredient covers a general need", () => assert.ok(related(m, 1, 0))); // olive oil -> oil
  it("a general ingredient covers a specific need", () => assert.ok(related(m, 4, 5))); // cheese -> parmesan
  it("unrelated ingredients do not", () => assert.ok(!related(m, 2, 3)));
  it("poultry counts as meat", () => {
    assert.ok(related(m, 12, 11)); // chicken covers "meat"
    assert.ok(related(m, 11, 12)); // "meat" covers chicken
  });
  it("a product made from an ingredient is not that ingredient, either way", () => {
    assert.ok(!related(m, 2, 10)); // onion does not cover onion powder
    assert.ok(!related(m, 10, 2)); // onion powder does not cover a fresh onion
  });
});

describe("search", () => {
  const base = { q: "", lang: "all" as const, staples: true };

  it("ranks recipes you can fully cover first", () => {
    const r = search(m, { ...base, have: ["pasta", "tomato", "olive_oil"] });
    assert.equal(ids(r)[0], "en-1"); // everything covered (salt is a staple)
    assert.equal(r.hits[0].missing.length, 0);
    assert.equal(r.canMakeNow, 1); // Pasta with Parmesan still needs the parmesan
  });

  it("counts staples only when asked", () => {
    const withStaples = search(m, { ...base, have: ["pasta", "tomato", "olive_oil"] });
    const without = search(m, { ...base, staples: false, have: ["pasta", "tomato", "olive_oil"] });
    assert.equal(withStaples.hits.find((h) => h.recipe.id === "en-1")!.missing.length, 0);
    assert.deepEqual(without.hits.find((h) => h.recipe.id === "en-1")!.missing, [6]); // salt
  });

  it("uses ingredient hierarchy in both directions", () => {
    const r = search(m, { ...base, have: ["pasta", "cheese"] });
    const parm = r.hits.find((h) => h.recipe.id === "en-3")!;
    assert.deepEqual(parm.missing, []); // cheese covers parmesan, oil is a staple
  });

  it("an alternative line is covered by either option", () => {
    const r = search(m, { ...base, have: ["onion", "margarine"] });
    const soup = r.hits.find((h) => h.recipe.id === "en-2")!;
    assert.deepEqual(soup.missing, []);
  });

  it("unidentified lines count as missing 'other' ingredients", () => {
    const r = search(m, { ...base, have: ["onion"] });
    const stew = r.hits.find((h) => h.recipe.id === "en-5")!;
    assert.equal(stew.missingOther, 3);
    assert.ok(ids(r).indexOf("en-2") < ids(r).indexOf("en-5")); // fully coverable soup ranks above
  });

  it("only returns recipes that use at least one of your ingredients", () => {
    const r = search(m, { ...base, have: ["tomato"] });
    assert.deepEqual(ids(r), ["en-1"]);
  });

  it("filters by recipe language", () => {
    const r = search(m, { ...base, lang: "de", have: ["onion"] });
    assert.deepEqual(ids(r), ["de-4"]);
  });

  it("searches recipe names by word prefix", () => {
    // "Pasta with Parmesan" starts with the query, so it ranks above "Tomato Pasta".
    assert.deepEqual(ids(search(m, { ...base, have: [], q: "past" })), ["en-3", "en-1"]);
    const r = search(m, { ...base, have: [], q: "pasta parm" });
    assert.deepEqual(ids(r), ["en-3"]);
  });

  it("combines name search and pantry", () => {
    const r = search(m, { ...base, have: ["pasta"], q: "parmesan" });
    assert.deepEqual(ids(r), ["en-3"]);
  });

  it("reports unknown ingredient ids and returns nothing for an empty query", () => {
    const r = search(m, { ...base, have: ["unicorn"] });
    assert.deepEqual(r.unknown, ["unicorn"]);
    assert.equal(r.total, 0);
  });
});

describe("suggest", () => {
  const entries = suggestEntries(DATA);
  it("matches English and German names", () => {
    assert.equal(suggest(entries, "zwieb")[0].id, "onion");
    assert.equal(suggest(entries, "onio")[0].id, "onion");
  });
  it("handles umlauts typed either way", () => {
    assert.equal(suggest(entries, "Kase")[0]?.id, undefined); // 'kase' is not 'kaese'
    assert.equal(suggest(entries, "Käse")[0].id, "cheese");
    assert.equal(suggest(entries, "Kaese")[0].id, "cheese");
  });
  it("prefers exact and prefix matches, and skips chosen items", () => {
    assert.equal(suggest(entries, "oil")[0].id, "oil");
    assert.deepEqual(suggest(entries, "oil", ["oil"]).map((s) => s.id), ["olive_oil"]);
  });
});

describe("norm and labels", () => {
  it("normalises like the pipeline", () => {
    assert.equal(norm("Möhren"), "moehren");
    assert.equal(norm("Eßlöffel"), "essloeffel");
    assert.equal(norm("Jalapeño-Crème"), "jalapeno creme");
  });
  it("makes readable labels", () => {
    assert.equal(label("black_pepper"), "Pepper");
    assert.equal(label("olive_oil"), "Olive oil");
  });
});

describe("the real exported index", () => {
  const data = JSON.parse(readFileSync(new URL("../src/data/search-index.json", import.meta.url), "utf-8")) as IndexData;
  const real = buildModel(data);
  it("loads and finds onion-and-garlic recipes in both languages", () => {
    const r = search(real, { have: ["onion", "garlic", "tomato"], q: "", lang: "all", staples: true });
    assert.ok(r.total > 300);
    assert.ok(r.hits.slice(0, 200).some((h) => h.recipe.lang === "de"));
    assert.ok(r.hits[0].used.length >= 2);
  });
  it("every ingredient has a label and every parent index is valid", () => {
    for (const ing of data.ingredients) {
      assert.ok(label(ing.id).length > 0);
      for (const p of ing.parents) assert.ok(p >= 0 && p < data.ingredients.length);
    }
  });
});

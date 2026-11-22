import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FAMILIES } from "../src/lib/families.ts";
import { formatMinutes } from "../src/lib/format.ts";
import { dict, type Dict } from "../src/lib/i18n.ts";
import { label } from "../src/lib/labels.ts";
import { negotiate } from "../src/lib/negotiate.ts";
import { FAMILY_KEYS, hasFilters, parseState, toQuery } from "../src/lib/params.ts";
import { buildModel, type IndexData, passesFilters, type Recipe, search } from "../src/lib/search.ts";

const ING = [
  { id: "salt", group: "spice", staple: true, parents: [], en: ["salt"], de: ["salz"] }, // 0
  { id: "onion", group: "vegetable", staple: false, parents: [], en: ["onion"], de: ["zwiebel"] }, // 1
  { id: "tomato", group: "vegetable", staple: false, parents: [], en: ["tomato"], de: ["tomate"] }, // 2
  { id: "bacon", group: "meat", staple: false, parents: [], en: ["bacon"], de: ["speck"] }, // 3
];

function recipe(id: string, title: string, req: number[][], extra: Partial<Recipe> = {}): Recipe {
  return { id, lang: "en", title, family: "main", desc: "", min: null, diff: null, diet: "", req, opt: [], unk: 0, url: "", ...extra };
}

const DATA: IndexData = {
  version: 1,
  built_at: "2026-11-22T00:00:00Z",
  licence: "test",
  ingredients: ING,
  recipes: [
    recipe("a", "Tomato Soup", [[2], [1], [0]], { family: "soup", min: [20, 30], diet: "vegan" }),
    recipe("b", "Bacon Soup", [[3], [1]], { family: "soup", min: [90, 90], diet: "none" }),
    recipe("c", "Onion Tart", [[1], [3]], { family: "baking", min: null, diet: "" }),
    recipe("d", "Zwiebelsuppe", [[1], [0]], { family: "soup", min: [15, 15], diet: "vegetarian", lang: "de" }),
  ],
};
const m = buildModel(DATA);
const ids = (r: ReturnType<typeof search>) => r.hits.map((h) => h.recipe.id);
const base = { have: [] as string[], q: "", lang: "all" as const, staples: true };
const [a, b, c, d] = DATA.recipes;

describe("passesFilters", () => {
  const none = { lang: "all" as const, type: "", time: 0, diet: "" as const };
  it("lets everything through with no filters", () => assert.ok([a, b, c, d].every((r) => passesFilters(r, none))));
  it("filters by dish type", () => assert.deepEqual([a, b, c, d].filter((r) => passesFilters(r, { ...none, type: "soup" })).map((r) => r.id), ["a", "b", "d"]));
  it("time compares the shortest stated time, and drops recipes without one", () => {
    assert.deepEqual([a, b, c, d].filter((r) => passesFilters(r, { ...none, time: 30 })).map((r) => r.id), ["a", "d"]);
    assert.deepEqual([a, b, c, d].filter((r) => passesFilters(r, { ...none, time: 120 })).map((r) => r.id), ["a", "b", "d"]);
  });
  it("vegetarian includes vegan; vegan is vegan only; unknown diet never passes", () => {
    assert.deepEqual([a, b, c, d].filter((r) => passesFilters(r, { ...none, diet: "vegetarian" })).map((r) => r.id), ["a", "d"]);
    assert.deepEqual([a, b, c, d].filter((r) => passesFilters(r, { ...none, diet: "vegan" })).map((r) => r.id), ["a"]);
  });
  it("filters by recipe language", () => assert.deepEqual([a, b, c, d].filter((r) => passesFilters(r, { ...none, lang: "de" })).map((r) => r.id), ["d"]));
});

describe("search with filters", () => {
  it("returns nothing when nothing is asked", () => assert.equal(search(m, base).total, 0));
  it("browse lists every recipe passing the filters, by name", () => {
    assert.deepEqual(ids(search(m, { ...base, type: "soup", browse: true })), ["b", "a", "d"]);
  });
  it("filters apply to a pantry search too", () => {
    assert.deepEqual(ids(search(m, { ...base, have: ["onion"], diet: "vegetarian" })).sort(), ["a", "d"]);
  });
  it("ready keeps only what you can make now", () => {
    const all = search(m, { ...base, have: ["onion"] });
    const ready = search(m, { ...base, have: ["onion"], ready: true });
    assert.ok(all.total > ready.total);
    assert.deepEqual(ids(ready), ["d"]); // onion + salt (a staple)
    assert.ok(ready.hits.every((h) => h.missing.length === 0 && h.missingOther === 0));
  });
});

describe("URL state for filters", () => {
  it("round-trips", () => {
    const s = parseState({ have: "onion", type: "soup", time: "30", diet: "vegan", ready: "1" });
    assert.equal(toQuery(s), "?have=onion&type=soup&time=30&diet=vegan&ready=1");
  });
  it("drops values that are not offered", () => {
    const s = parseState({ type: "pizza", time: "45", diet: "keto", ready: "yes" });
    assert.deepEqual([s.type, s.time, s.diet, s.ready], ["", 0, "", false]);
    assert.ok(!hasFilters(s));
  });
  it("every filterable family has a label in both languages", () => {
    for (const k of FAMILY_KEYS) assert.ok(FAMILIES[k].label.en && FAMILIES[k].label.de, k);
  });
});

describe("language negotiation", () => {
  it("defaults to English", () => {
    assert.equal(negotiate(null), "en");
    assert.equal(negotiate("fr-FR,fr;q=0.9"), "en");
  });
  it("uses the first supported language by preference", () => {
    assert.equal(negotiate("de-DE,de;q=0.9,en;q=0.8"), "de");
    assert.equal(negotiate("fr;q=0.9,en;q=0.5,de;q=0.7"), "de");
    assert.equal(negotiate("en-US,de;q=0.5"), "en");
  });
  it("ignores q=0", () => assert.equal(negotiate("de;q=0,en;q=0.1"), "en"));
  it("a chosen language (cookie) wins", () => {
    assert.equal(negotiate("de-DE", "en"), "en");
    assert.equal(negotiate("en", "xx"), "en");
  });
});

/** Same keys, same kinds of value (and same function arity) all the way down. */
function shape(x: unknown): unknown {
  if (typeof x === "function") return `fn/${x.length}`;
  if (Array.isArray(x)) return x.map(shape);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v)]).sort());
  return typeof x;
}

describe("interface text", () => {
  it("German has exactly the English keys", () => assert.deepEqual(shape(dict("de")), shape(dict("en"))));
  it("has no empty strings", () => {
    const walk = (x: unknown, path: string) => {
      if (typeof x === "string") assert.ok(x.length > 0, path);
      else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, `${path}.${k}`);
    };
    for (const l of ["en", "de"] as const) walk(dict(l) as Dict, l);
  });
  it("formats numbers per language", () => {
    assert.equal(dict("en").results.count(4389), "4,389 recipes");
    assert.equal(dict("de").results.count(4389), "4.389 Rezepte");
    assert.equal(dict("de").results.count(1), "1 Rezept");
  });
});

describe("German labels and times", () => {
  it("uses the German vocabulary name", () => {
    assert.equal(label("onion", "de"), "Zwiebel");
    assert.equal(label("black_pepper", "de"), "Pfeffer");
  });
  it("uses German overrides for broad ids", () => assert.equal(label("spirits", "de"), "Spirituosen & Likör"));
  it("English is unchanged", () => assert.equal(label("onion"), "Onion"));
  it("formats minutes in German", () => {
    assert.equal(formatMinutes([20, 30], "de"), "20–30 Min.");
    assert.equal(formatMinutes([120, 120], "de"), "2 Std.");
    assert.equal(formatMinutes([45, 90], "de"), "45 Min.–1,5 Std.");
    assert.equal(formatMinutes([45, 90]), "45 min–1.5 h");
  });
});

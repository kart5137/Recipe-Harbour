import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localize, type RecipeDetail } from "../src/lib/recipe.ts";
import { buildModel, type IndexData, type Recipe, search, shown } from "../src/lib/search.ts";

const DETAIL: RecipeDetail = {
  id: "en-1",
  lang: "en",
  title: "Onion soup",
  family: "soup",
  description: "A soup.",
  category: "Soup recipes",
  cuisine: "French",
  servings_text: "4 servings",
  servings: [4, 4],
  time_text: "",
  minutes: null,
  difficulty: null,
  diet: "vegetarian",
  diet_source: "inferred",
  groups: [{ name: "Soup", items: [{ text: "2 onions", ids: ["onion"], optional: false, alt: false }] }],
  steps: ["Slice the onions."],
  equipment: [],
  notes: [],
  url: "https://en.wikibooks.org/wiki/Cookbook:Onion_Soup",
  history_url: "",
  revision_id: null,
  revision_timestamp: "",
  tr: {
    title: "Zwiebelsuppe",
    description: "Eine Suppe.",
    category: "Suppenrezepte",
    cuisine: "Französisch",
    servings_text: "4 Portionen",
    groups: [{ name: "Suppe", items: ["2 Zwiebeln"] }],
    steps: ["Die Zwiebeln in Scheiben schneiden."],
    equipment: [],
    notes: [],
  },
};

describe("localize (recipe page)", () => {
  it("shows the German translation to German readers, keeping ingredient ids", () => {
    const r = localize(DETAIL, "de");
    assert.equal(r.translated, true);
    assert.equal(r.textLang, "de");
    assert.equal(r.title, "Zwiebelsuppe");
    assert.equal(r.servings_text, "4 Portionen");
    assert.deepEqual(r.groups, [{ name: "Suppe", items: [{ text: "2 Zwiebeln", ids: ["onion"], optional: false, alt: false }] }]);
    assert.deepEqual(r.steps, ["Die Zwiebeln in Scheiben schneiden."]);
    assert.equal(r.lang, "en"); // still says where it comes from
  });

  it("shows the original to readers of its own language, or when there is no translation", () => {
    assert.equal(localize(DETAIL, "en").title, "Onion soup");
    assert.equal(localize(DETAIL, "en").translated, false);
    const untranslated = { ...DETAIL, tr: undefined };
    assert.equal(localize(untranslated, "de").title, "Onion soup");
    assert.equal(localize(untranslated, "de").textLang, "en");
  });
});

const ING = [{ id: "onion", group: "vegetable", staple: false, parents: [], en: ["onion"], de: ["zwiebel"] }];
const R = (extra: Partial<Recipe>): Recipe => ({
  id: "en-1", lang: "en", title: "Onion soup", family: "soup", desc: "A soup.", min: null, diff: null, diet: "",
  req: [[0]], opt: [], unk: 0, url: "", ...extra,
});

describe("translated titles in search and cards", () => {
  const data: IndexData = {
    version: 1, built_at: "", licence: "", ingredients: ING,
    recipes: [R({ tt: "Zwiebelsuppe", td: "Eine Suppe." }), R({ id: "de-2", lang: "de", title: "Kartoffelsalat", tt: "Potato salad" })],
  } as IndexData;
  const m = buildModel(data);
  const names = (q: string) => search(m, { have: [], q, lang: "all", staples: true }).hits.map((h) => h.recipe.id);

  it("finds a recipe by its own title or its translated title", () => {
    assert.deepEqual(names("onion soup"), ["en-1"]);
    assert.deepEqual(names("zwiebelsuppe"), ["en-1"]);
    assert.deepEqual(names("potato"), ["de-2"]);
  });

  it("cards use the reader's language when a translation exists", () => {
    assert.deepEqual(shown(data.recipes[0], "de"), { title: "Zwiebelsuppe", desc: "Eine Suppe.", lang: "de" });
    assert.deepEqual(shown(data.recipes[0], "en"), { title: "Onion soup", desc: "A soup.", lang: "en" });
    assert.deepEqual(shown(R({}), "de"), { title: "Onion soup", desc: "A soup.", lang: "en" });
  });
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { fnv1a, type RecipeDetail, SHARDS, shardOf } from "../src/lib/recipe.ts";
import { buildRelations, covers, type IndexData } from "../src/lib/search.ts";

const DATA = new URL("../src/data/", import.meta.url);

describe("sharding", () => {
  it("is FNV-1a (published test vectors)", () => {
    assert.equal(fnv1a("a"), 0xe40c292c);
    assert.equal(fnv1a("foobar"), 0xbf9cf968);
  });
  it("matches the pipeline (export.shard_of)", () => {
    assert.equal(fnv1a("en-1"), 0xcc932cbc); // same value asserted in pipeline/tests/test_export.py
    assert.equal(shardOf("en-1"), 0xcc932cbc % SHARDS);
  });
  it("every recipe in the index is in the shard its id points to", () => {
    const index = JSON.parse(readFileSync(new URL("search-index.json", DATA), "utf-8")) as IndexData;
    const files = readdirSync(new URL("recipes/", DATA)).filter((f) => f.startsWith("shard-"));
    assert.equal(files.length, SHARDS);
    const shards = files.map(
      (f) => JSON.parse(readFileSync(new URL(`recipes/${f}`, DATA), "utf-8")) as Record<string, RecipeDetail>,
    );
    const total = shards.reduce((n, s) => n + Object.keys(s).length, 0);
    assert.equal(total, index.recipes.length);
    for (const r of index.recipes) {
      const d = shards[shardOf(r.id)][r.id];
      assert.ok(d, `${r.id} not in shard ${shardOf(r.id)}`);
      assert.equal(d.title, r.title);
      assert.ok(d.steps.length > 0 && d.groups.length > 0);
    }
  });
});

describe("covers (recipe page ticks)", () => {
  const rel = buildRelations([
    { id: "oil", group: "fat", staple: true, parents: [], en: [], de: [] },
    { id: "olive_oil", group: "fat", staple: false, parents: [0], en: [], de: [] },
    { id: "onion", group: "vegetable", staple: false, parents: [], en: [], de: [] },
    { id: "onion_powder", group: "spice", staple: false, parents: [2], en: [], de: [] },
  ]);
  it("ticks what you have, via the hierarchy", () => {
    assert.ok(covers(rel, ["olive_oil"], ["oil"], false));
    assert.ok(covers(rel, ["onion"], ["onion"], false));
    assert.ok(!covers(rel, ["onion"], ["onion_powder"], false));
  });
  it("ticks staples only when assumed", () => {
    assert.ok(covers(rel, [], ["oil"], true));
    assert.ok(!covers(rel, [], ["oil"], false));
    assert.ok(!covers(rel, [], ["olive_oil"], true)); // olive oil is not a staple
  });
  it("ignores unknown ids", () => {
    assert.ok(!covers(rel, ["unicorn"], ["unicorn"], true));
  });
});

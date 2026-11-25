import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cookingStart, cues, cutInSteps, parseLine, splitMethod } from "../src/lib/method.ts";

const GROUPS: Record<string, string> = { onion: "vegetable", tomato: "vegetable", salt: "spice", turmeric: "spice", coriander: "herb", bay_leaf: "herb", ground_beef: "meat" };
const line = (text: string, ...ids: string[]) => ({ text, ids, optional: false, alt: false });

describe("method split", () => {
  it("cooking starts at the first step that heats something", () => {
    const steps = ["Soak the dal overnight.", "Chop the onion.", "Heat oil in a pan and fry the onion.", "Serve hot."];
    assert.equal(cookingStart(steps, "en"), 2);
    assert.equal(cookingStart(["Zwiebel fein hacken.", "Öl in einer Pfanne erhitzen."], "de"), 1);
  });

  it("preheating the oven is part of getting ready", () => {
    assert.equal(cookingStart(["Preheat the oven to 180 °C.", "Mix the flour.", "Bake for 20 minutes."], "en"), 2);
    assert.equal(cookingStart(["Backofen auf 200 Grad vorheizen.", "Mehl mischen.", "20 Minuten backen."], "de"), 2);
  });

  it("baking powder is not baking", () => {
    assert.equal(cookingStart(["Mix the flour and baking powder."], "en"), -1);
  });

  it("reads time, heat and temperature from a step", () => {
    assert.deepEqual(cues("Simmer over medium-low heat for 15–20 minutes."), [
      { kind: "heat", level: "medlow" },
      { kind: "time", from: 15, to: 20, unit: "min" },
    ]);
    assert.deepEqual(cues("Bake at 350°F for 1 hour."), [
      { kind: "temp", value: 350, scale: "F" },
      { kind: "time", from: 1, to: null, unit: "h" },
    ]);
    assert.deepEqual(cues("Bei mittlerer Hitze 5 Min. braten."), [
      { kind: "heat", level: "medium" },
      { kind: "time", from: 5, to: null, unit: "min" },
    ]);
    assert.deepEqual(cues("Serve hot."), []);
  });

  it("splits a line into amount, name and cut", () => {
    assert.deepEqual(parseLine("1 medium onion (optional), finely chopped", "en"), { amount: "1", name: "medium onion (optional)", cut: "finely chopped" });
    assert.deepEqual(parseLine("Salt, to taste", "en"), { amount: "to taste", name: "Salt", cut: "" });
    assert.deepEqual(parseLine("3 cloves", "en"), { amount: "3", name: "cloves", cut: "" });
    assert.deepEqual(parseLine("Chilipulver (je nach Geschmack)", "de"), { amount: "nach Geschmack", name: "Chilipulver", cut: "" });
    assert.deepEqual(parseLine("2 Zwiebeln, fein gehackt", "de"), { amount: "2", name: "Zwiebeln", cut: "fein gehackt" });
  });

  it("finds the cut in the steps when the line does not say", () => {
    assert.equal(cutInSteps("medium potatoes", ["Peel nothing yet.", "Finely grate the potatoes."], "en"), "finely grated");
    assert.equal(cutInSteps("Kartoffeln", ["Die Kartoffeln schälen."], "de"), "geschält");
    assert.equal(cutInSteps("courgette", ["Serve."], "en"), "");
  });

  it("sorts produce to cut and spices to measure", () => {
    const m = splitMethod(
      [{ items: [line("1 onion, chopped", "onion"), line("1 tsp turmeric", "turmeric"), line("2 tsp coriander powder", "coriander"), line("2 bay leaves", "bay_leaf"), line("500 g ground beef", "ground_beef"), line("Salt", "salt"), line("Salt, to taste", "salt")] }],
      ["Chop the onion.", "Fry the onion.", "Serve."],
      "en",
      (id) => GROUPS[id],
    );
    assert.deepEqual(m.cut.map((l) => l.name), ["onion", "ground beef"]);
    assert.deepEqual(m.season.map((l) => `${l.amount}|${l.name}`), ["1 tsp|turmeric", "2 tsp|coriander powder", "2|bay leaves", "to taste|Salt"]);
    assert.deepEqual(m.prep, ["Chop the onion."]);
    assert.deepEqual(m.cook.map((s) => s.text), ["Fry the onion.", "Serve."]);
  });

  it("keeps every step in one list when nothing is heated", () => {
    const m = splitMethod([], ["Mix.", "Chill."], "en", () => undefined);
    assert.deepEqual(m.prep, ["Mix.", "Chill."]);
    assert.deepEqual(m.cook, []);
  });
});

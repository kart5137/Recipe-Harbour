import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { interpret, type Labels, offeredIds } from "../src/lib/classify-result.ts";

const L: Labels = {
  version: "t",
  classes: [
    { id: "apple", offered: false, test_photos: 135, top1: 0.59, top3: 0.85 },
    { id: "broccoli", offered: true, test_photos: 97, top1: 0.96, top3: 1 },
    { id: "peach", offered: true, test_photos: 90, top1: 0.82, top3: 0.98 },
    { id: "tomato", offered: true, test_photos: 200, top1: 0.7, top3: 0.91 },
    { id: "zucchini", offered: false, test_photos: 138, top1: 0.41, top3: 0.9 },
  ],
};

describe("interpret", () => {
  it("confident when the top guess is offered and likely", () => {
    const r = interpret([0.05, 0.85, 0.05, 0.03, 0.02], L);
    assert.equal(r.status, "confident");
    assert.ok(r.status === "confident" && r.best.id === "broccoli");
    assert.deepEqual(r.status === "confident" && r.others, []); // peach is in the top 3 but at 5 %, not plausible
  });

  it("unsure when the top guess is offered but not likely enough", () => {
    const r = interpret([0.1, 0.45, 0.35, 0.05, 0.05], L);
    assert.equal(r.status, "unsure");
    assert.ok(r.status === "unsure" && r.options.map((g) => g.id).join() === "broccoli,peach");
  });

  it("never presents a non-offered top guess as an answer", () => {
    // The model leans to apple (not offered) but peach is plausible.
    const r = interpret([0.5, 0.02, 0.3, 0.1, 0.08], L);
    assert.equal(r.status, "unsure");
    assert.deepEqual(r.status === "unsure" && r.options.map((g) => g.id), ["peach"]);
  });

  it("unknown when the model is confident about something it cannot recognise reliably", () => {
    // A real case: an apple photo at 83 %; grapes at 8 % must not be suggested.
    const r = interpret([0.83, 0.01, 0.08, 0.05, 0.03], L);
    assert.equal(r.status, "unknown");
  });

  it("drops offered guesses that are not plausible", () => {
    const r = interpret([0.4, 0.3, 0.1, 0.12, 0.08], L);
    assert.deepEqual(r.status === "unsure" && r.options.map((g) => g.id), ["broccoli"]);
  });

  it("unknown when nothing in the top 3 is offered", () => {
    const L2: Labels = { version: "t", classes: L.classes.map((c) => ({ ...c, offered: c.id === "broccoli" })) };
    const r = interpret([0.5, 0.01, 0.2, 0.19, 0.1], L2);
    assert.equal(r.status, "unknown");
    assert.ok(r.status === "unknown" && r.topGuess.id === "apple");
  });
});

describe("the exported labels", () => {
  const labels = JSON.parse(readFileSync(new URL("../public/model/labels.json", import.meta.url), "utf-8")) as Labels & {
    thresholds: { top1: number; top3: number; min_test: number };
  };
  it("offers exactly the classes that pass the model card's bar", () => {
    const t = labels.thresholds;
    for (const c of labels.classes) {
      const passes = c.test_photos >= t.min_test && (c.top1 ?? 0) >= t.top1 && (c.top3 ?? 0) >= t.top3;
      assert.equal(c.offered, passes, c.id);
    }
    assert.equal(offeredIds(labels).length, 10);
  });
  it("model.json declares the 224x224x3 input and one output per class", () => {
    const m = JSON.parse(readFileSync(new URL("../public/model/model.json", import.meta.url), "utf-8"));
    const s = JSON.stringify(m.modelTopology);
    assert.ok(s.includes("[null,224,224,3]") || s.includes('"batch_input_shape":[null,224,224,3]'));
    assert.equal(labels.classes.length, 24);
  });
});

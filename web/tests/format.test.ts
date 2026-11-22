import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMinutes } from "../src/lib/format.ts";
import { parseState, toQuery } from "../src/lib/params.ts";

describe("formatMinutes", () => {
  const cases: [[number, number] | null, string | null][] = [
    [null, null],
    [[20, 20], "20 min"],
    [[60, 60], "60 min"],
    [[90, 90], "1 h 30 min"],
    [[120, 120], "2 h"],
    [[20, 30], "20–30 min"],
    [[60, 120], "1–2 h"],
    [[90, 120], "1.5–2 h"],
    [[45, 90], "45 min–1.5 h"],
  ];
  for (const [input, out] of cases) {
    it(`${JSON.stringify(input)} -> ${out}`, () => assert.equal(formatMinutes(input), out));
  }
});

describe("URL state", () => {
  it("round-trips", () => {
    const s = parseState({ have: "onion,garlic", q: "soup", lang: "de", staples: "0", n: "48" });
    assert.deepEqual(s, { have: ["onion", "garlic"], q: "soup", lang: "de", staples: false, n: 48 });
    assert.equal(toQuery(s), "?have=onion%2Cgarlic&q=soup&lang=de&staples=0&n=48");
  });
  it("uses defaults and rejects junk", () => {
    const s = parseState({ have: "onion,<script>,ONION,onion", lang: "fr", n: "-5" });
    assert.deepEqual(s, { have: ["onion"], q: "", lang: "all", staples: true, n: 24 });
    assert.equal(toQuery(s), "?have=onion");
  });
});

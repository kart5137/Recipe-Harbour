import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { normaliseBarcode, validCheckDigit } from "../src/lib/barcode.ts";
import { buildNameIndex, mapProduct, type OffProduct } from "../src/lib/product-map.ts";
import type { IndexData } from "../src/lib/search.ts";

const index = JSON.parse(readFileSync(new URL("../src/data/search-index.json", import.meta.url), "utf-8")) as IndexData;
const names = buildNameIndex(index.ingredients);

// Real Open Food Facts records (fetched 2026-11-22, fields as the app requests them).
function off(code: string): OffProduct {
  const raw = JSON.parse(readFileSync(new URL(`fixtures/off/${code}.json`, import.meta.url), "utf-8"));
  return { code, ...raw.product };
}

describe("barcodes", () => {
  it("accepts valid EAN-13 / EAN-8 codes", () => {
    assert.equal(normaliseBarcode("8076800195057"), "8076800195057");
    assert.equal(normaliseBarcode("4006 3810 0101 2"), null); // made-up digits: wrong check digit
    assert.equal(normaliseBarcode("20004132"), "20004132");
    assert.equal(normaliseBarcode("96385074"), "96385074"); // GS1 example EAN-8
  });
  it("rejects misreads and junk", () => {
    assert.equal(normaliseBarcode("8076800195058"), null); // last digit off by one
    assert.equal(normaliseBarcode("12345"), null);
    assert.equal(normaliseBarcode("abc"), null);
  });
  it("computes the GS1 check digit", () => {
    assert.ok(validCheckDigit("5449000000996"));
    assert.ok(validCheckDigit("3017620422003"));
    assert.ok(!validCheckDigit("3017620422004"));
  });
});

describe("Open Food Facts product -> ingredient", () => {
  const cases: [string, string, string | null, string | null][] = [
    // barcode, what it is, expected ingredient, matched via
    ["8076800195057", "Barilla Spaghetti (generic name: \"Spaghetti\")", "spaghetti", "name"],
    ["3017620422003", "Nutella", "hazelnuts", "name"],
    ["20004132", "Lidl chopped tomatoes (tin)", "canned_tomato", "category"],
    ["4056489150381", "whole-milk yogurt", "yogurt", "category"],
    ["4316268596299", "pains au chocolat", "bread", "category"],
    ["5449000000996", "Coca-Cola", null, null],
  ];
  for (const [code, what, id, via] of cases) {
    it(`${what} -> ${id ?? "no ingredient"}`, () => {
      const m = mapProduct(off(code), names);
      assert.equal(m.id, id);
      assert.equal(m.via, via);
    });
  }

  it("uses German category tags with German names", () => {
    const m = mapProduct({ code: "1", categories_tags: ["en:foods", "de:zwiebeln"] }, names);
    assert.equal(m.id, "onion");
  });
  it("falls back to words in the product name", () => {
    const m = mapProduct({ code: "1", product_name: "Bio Kidneybohnen in der Dose" }, names);
    assert.equal(m.id, "kidney_beans");
  });
  it("ignores other languages' category tags", () => {
    const m = mapProduct({ code: "1", categories_tags: ["fr:pates-a-tartiner"] }, names);
    assert.equal(m.id, null);
  });
});

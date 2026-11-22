import "server-only";

import { cacheLife } from "next/cache";

import { getModel } from "./data.ts";
import { buildNameIndex, mapProduct, type NameIndex, type OffProduct } from "./product-map.ts";

/**
 * Product lookup in Open Food Facts (open data, ODbL). Their API asks clients to send an
 * identifying user agent and to be gentle; results are cached for days, so each barcode
 * is fetched rarely. Network failures throw (and are not cached); "not found" is cached.
 */
const OFF_FIELDS = "code,product_name,product_name_en,product_name_de,generic_name,brands,categories_tags";
const USER_AGENT = "RecipeHarbour/0.1 (open-source recipe app)";

export type ProductResult =
  | { status: "found"; code: string; name: string; brand: string; ingredient: string | null; via: string | null }
  | { status: "not_found"; code: string };

export class ProductLookupError extends Error {}

let names: NameIndex | null = null;
function nameIndex(): NameIndex {
  names ??= buildNameIndex(getModel().data.ingredients);
  return names;
}

export async function lookupProduct(code: string): Promise<ProductResult> {
  "use cache";
  cacheLife("days");
  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new ProductLookupError(`Open Food Facts unreachable: ${(e as Error).message}`);
  }
  if (res.status === 404) return { status: "not_found", code };
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    // e.g. their "temporarily unavailable" HTML page under load
    throw new ProductLookupError(`Open Food Facts answered ${res.status}`);
  }
  const body = (await res.json()) as { status?: number; product?: Omit<OffProduct, "code"> };
  if (body.status !== 1 || !body.product) return { status: "not_found", code };
  const p: OffProduct = { code, ...body.product };
  const m = mapProduct(p, nameIndex());
  return {
    status: "found",
    code,
    name: p.product_name || p.product_name_en || p.product_name_de || p.generic_name || "Unnamed product",
    brand: (p.brands ?? "").split(",")[0].trim(),
    ingredient: m.id,
    via: m.via,
  };
}

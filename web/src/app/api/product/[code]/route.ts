import { normaliseBarcode } from "@/lib/barcode";
import { lookupProduct, ProductLookupError } from "@/lib/products";

/** GET /api/product/<barcode> -> the product and the ingredient it maps to. */
export async function GET(_req: Request, ctx: RouteContext<"/api/product/[code]">) {
  const { code: raw } = await ctx.params;
  const code = normaliseBarcode(raw);
  if (!code) {
    return Response.json({ status: "invalid", message: "Not a valid product barcode." }, { status: 400 });
  }
  try {
    const result = await lookupProduct(code);
    return Response.json(result, { status: result.status === "found" ? 200 : 404 });
  } catch (e) {
    if (e instanceof ProductLookupError) {
      return Response.json(
        { status: "unavailable", message: "The product database is not answering right now. Try again in a minute." },
        { status: 503 },
      );
    }
    throw e;
  }
}

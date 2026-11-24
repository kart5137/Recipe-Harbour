import { getSuggestNames } from "@/lib/data";

/** The ingredient names for the autocomplete. Prerendered at build time and served as a static file. */
export function GET() {
  return Response.json(getSuggestNames());
}

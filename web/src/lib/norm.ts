/**
 * Text normalisation, identical to the pipeline's `ingredients.norm()` so that
 * what people type matches the vocabulary the same way the recipe data did:
 * lower case, umlauts as ae/oe/ue, ß as ss, accents removed, punctuation as spaces.
 */
const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

export function norm(text: string): string {
  let t = text.toLowerCase().replace(/[äöüß]/g, (c) => UMLAUTS[c]);
  t = t.normalize("NFKD").replace(/\p{M}/gu, "");
  t = t.replace(/'s /g, "s ").replace(/’s /g, "s ");
  t = t.replace(/[^a-z0-9%½¼¾⅓⅔⅛]+/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

export function tokens(text: string): string[] {
  const n = norm(text);
  return n ? n.split(" ") : [];
}

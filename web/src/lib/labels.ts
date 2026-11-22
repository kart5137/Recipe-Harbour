/**
 * Display names for ingredient ids, in the interface language.
 * English: the id made readable ("black_pepper" -> "Black pepper"). German: the first German
 * name from the vocabulary (exported by the pipeline). Ids that cover a family of items get
 * a broader name in both languages.
 */
import namesDe from "../data/ingredient-names-de.json" with { type: "json" };
import type { Locale } from "./i18n.ts";

const OVERRIDES: Record<Locale, Record<string, string>> = {
  en: {
    berbere: "Spice blend",
    seasoning: "Seasoning mix",
    vegetables: "Mixed vegetables",
    crackers: "Biscuits & crackers",
    couscous: "Couscous & grains",
    tortilla: "Tortillas & flatbread",
    radish: "Radish & root veg",
    star_anise: "Anise & fennel seed",
    sesame: "Sesame & tahini",
    spirits: "Spirits & liqueur",
    msg: "MSG",
    pastry: "Pastry & dough",
    seeds: "Seeds",
    cod: "Cod & white fish",
    tilapia: "Freshwater fish",
    sardine: "Sardines & anchovies",
    mussels: "Mussels & shellfish",
    squid: "Squid & octopus",
    dried_fish: "Dried fish",
    liver: "Liver & offal",
    venison: "Game",
    emmental: "Emmental & Swiss cheese",
    gouda: "Gouda & Edam",
    monterey_jack: "Monterey Jack",
    ricotta: "Ricotta & cottage cheese",
    salsa: "Salsa & BBQ sauce",
    syrup: "Syrup & molasses",
    pudding_powder: "Pudding mix",
    thickener: "Thickener",
    creme_fraiche: "Crème fraîche",
    chili_pepper: "Chili pepper",
    coriander: "Coriander / cilantro",
    bell_pepper: "Bell pepper",
    black_pepper: "Pepper",
    ground_meat: "Ground meat",
    soybeans: "Soy & plant milk",
  },
  de: {
    berbere: "Gewürzmischung",
    seasoning: "Würzmischung",
    vegetables: "Gemischtes Gemüse",
    crackers: "Kekse & Cracker",
    couscous: "Couscous & Getreide",
    tortilla: "Tortillas & Fladenbrot",
    radish: "Radieschen & Wurzelgemüse",
    star_anise: "Anis & Fenchelsamen",
    sesame: "Sesam & Tahini",
    spirits: "Spirituosen & Likör",
    msg: "Glutamat",
    pastry: "Teig",
    seeds: "Samen & Kerne",
    cod: "Kabeljau & Weißfisch",
    tilapia: "Süßwasserfisch",
    sardine: "Sardinen & Sardellen",
    mussels: "Muscheln & Meeresfrüchte",
    squid: "Tintenfisch & Oktopus",
    dried_fish: "Trockenfisch",
    liver: "Leber & Innereien",
    venison: "Wild",
    emmental: "Emmentaler & Bergkäse",
    gouda: "Gouda & Edamer",
    monterey_jack: "Monterey Jack",
    ricotta: "Ricotta & Hüttenkäse",
    salsa: "Salsa & Grillsoße",
    syrup: "Sirup & Melasse",
    pudding_powder: "Puddingpulver",
    thickener: "Bindemittel",
    creme_fraiche: "Crème fraîche",
    soybeans: "Soja & Pflanzendrink",
    juice: "Saft",
    fruit: "Obst",
    meat: "Fleisch",
    fish: "Fisch",
    cheese: "Käse",
    broth: "Brühe",
    oil: "Öl",
  },
};

const NAMES: Record<string, string> = namesDe;

export function label(id: string, lang: Locale = "en"): string {
  const o = OVERRIDES[lang][id];
  if (o) return o;
  if (lang === "de" && NAMES[id]) return NAMES[id];
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

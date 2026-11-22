/**
 * Display names for ingredient ids. Most are the id made readable ("black_pepper" ->
 * "Black pepper"); a few ids cover a family of items and get a broader name.
 */
const OVERRIDES: Record<string, string> = {
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
};

export function label(id: string): string {
  if (OVERRIDES[id]) return OVERRIDES[id];
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

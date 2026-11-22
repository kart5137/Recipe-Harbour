import {
  Beef,
  Cake,
  Carrot,
  CookingPot,
  Croissant,
  CupSoda,
  Droplets,
  Drumstick,
  Egg,
  Fish,
  IceCreamCone,
  type LucideIcon,
  Popcorn,
  Salad,
  Soup,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";

/** Dish families from the pipeline export: a name, an icon and a colour for the card. */
export type Family = { label: Record<"en" | "de", string>; icon: LucideIcon; tint: string; ink: string };

// Full class names (not built from parts) so Tailwind keeps them.
export const FAMILIES: Record<string, Family> = {
  soup: { label: { en: "Soup & stew", de: "Suppen & Eintöpfe" }, icon: Soup, tint: "bg-orange-100 dark:bg-orange-950/60", ink: "text-orange-700 dark:text-orange-300" },
  salad: { label: { en: "Salad", de: "Salat" }, icon: Salad, tint: "bg-lime-100 dark:bg-lime-950/60", ink: "text-lime-700 dark:text-lime-300" },
  dessert: { label: { en: "Dessert", de: "Dessert" }, icon: IceCreamCone, tint: "bg-pink-100 dark:bg-pink-950/60", ink: "text-pink-700 dark:text-pink-300" },
  baking: { label: { en: "Cakes & baking", de: "Kuchen & Gebäck" }, icon: Cake, tint: "bg-amber-100 dark:bg-amber-950/60", ink: "text-amber-700 dark:text-amber-300" },
  bread: { label: { en: "Bread & dough", de: "Brot & Teig" }, icon: Croissant, tint: "bg-yellow-100 dark:bg-yellow-950/60", ink: "text-yellow-800 dark:text-yellow-300" },
  drink: { label: { en: "Drink", de: "Getränk" }, icon: CupSoda, tint: "bg-sky-100 dark:bg-sky-950/60", ink: "text-sky-700 dark:text-sky-300" },
  sauce: { label: { en: "Sauce & dip", de: "Soße & Dip" }, icon: Droplets, tint: "bg-red-100 dark:bg-red-950/60", ink: "text-red-700 dark:text-red-300" },
  breakfast: { label: { en: "Breakfast", de: "Frühstück" }, icon: Egg, tint: "bg-yellow-100 dark:bg-yellow-950/60", ink: "text-yellow-700 dark:text-yellow-300" },
  pasta: { label: { en: "Pasta & noodles", de: "Nudeln" }, icon: CookingPot, tint: "bg-orange-100 dark:bg-orange-950/60", ink: "text-orange-800 dark:text-orange-300" },
  rice: { label: { en: "Rice & grains", de: "Reis & Getreide" }, icon: Wheat, tint: "bg-stone-200 dark:bg-stone-800/70", ink: "text-stone-700 dark:text-stone-300" },
  fish: { label: { en: "Fish & seafood", de: "Fisch & Meeresfrüchte" }, icon: Fish, tint: "bg-cyan-100 dark:bg-cyan-950/60", ink: "text-cyan-700 dark:text-cyan-300" },
  poultry: { label: { en: "Poultry", de: "Geflügel" }, icon: Drumstick, tint: "bg-orange-100 dark:bg-orange-950/60", ink: "text-orange-700 dark:text-orange-300" },
  meat: { label: { en: "Meat", de: "Fleisch" }, icon: Beef, tint: "bg-rose-100 dark:bg-rose-950/60", ink: "text-rose-700 dark:text-rose-300" },
  vegetable: { label: { en: "Vegetables", de: "Gemüse" }, icon: Carrot, tint: "bg-emerald-100 dark:bg-emerald-950/60", ink: "text-emerald-700 dark:text-emerald-300" },
  snack: { label: { en: "Snack & starter", de: "Snack & Vorspeise" }, icon: Popcorn, tint: "bg-violet-100 dark:bg-violet-950/60", ink: "text-violet-700 dark:text-violet-300" },
  main: { label: { en: "Main dish", de: "Hauptgericht" }, icon: UtensilsCrossed, tint: "bg-slate-200 dark:bg-slate-800/70", ink: "text-slate-700 dark:text-slate-300" },
};

export function family(key: string): Family {
  return FAMILIES[key] ?? FAMILIES.main;
}

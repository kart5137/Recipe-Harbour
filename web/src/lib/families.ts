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
  soup: { label: { en: "Soup & stew", de: "Suppen & Eintöpfe" }, icon: Soup, tint: "bg-brand-soft", ink: "text-brand" },
  salad: { label: { en: "Salad", de: "Salat" }, icon: Salad, tint: "bg-brand-soft", ink: "text-brand" },
  dessert: { label: { en: "Dessert", de: "Dessert" }, icon: IceCreamCone, tint: "bg-brand-soft", ink: "text-brand" },
  baking: { label: { en: "Cakes & baking", de: "Kuchen & Gebäck" }, icon: Cake, tint: "bg-brand-soft", ink: "text-brand" },
  bread: { label: { en: "Bread & dough", de: "Brot & Teig" }, icon: Croissant, tint: "bg-brand-soft", ink: "text-brand" },
  drink: { label: { en: "Drink", de: "Getränk" }, icon: CupSoda, tint: "bg-brand-soft", ink: "text-brand" },
  sauce: { label: { en: "Sauce & dip", de: "Soße & Dip" }, icon: Droplets, tint: "bg-brand-soft", ink: "text-brand" },
  breakfast: { label: { en: "Breakfast", de: "Frühstück" }, icon: Egg, tint: "bg-brand-soft", ink: "text-brand" },
  pasta: { label: { en: "Pasta & noodles", de: "Nudeln" }, icon: CookingPot, tint: "bg-brand-soft", ink: "text-brand" },
  rice: { label: { en: "Rice & grains", de: "Reis & Getreide" }, icon: Wheat, tint: "bg-brand-soft", ink: "text-brand" },
  fish: { label: { en: "Fish & seafood", de: "Fisch & Meeresfrüchte" }, icon: Fish, tint: "bg-brand-soft", ink: "text-brand" },
  poultry: { label: { en: "Poultry", de: "Geflügel" }, icon: Drumstick, tint: "bg-brand-soft", ink: "text-brand" },
  meat: { label: { en: "Meat", de: "Fleisch" }, icon: Beef, tint: "bg-brand-soft", ink: "text-brand" },
  vegetable: { label: { en: "Vegetables", de: "Gemüse" }, icon: Carrot, tint: "bg-brand-soft", ink: "text-brand" },
  snack: { label: { en: "Snack & starter", de: "Snack & Vorspeise" }, icon: Popcorn, tint: "bg-brand-soft", ink: "text-brand" },
  main: { label: { en: "Main dish", de: "Hauptgericht" }, icon: UtensilsCrossed, tint: "bg-brand-soft", ink: "text-brand" },
};

export function family(key: string): Family {
  return FAMILIES[key] ?? FAMILIES.main;
}

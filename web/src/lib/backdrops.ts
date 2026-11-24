/**
 * The page background (components/backdrop.tsx): one photo, and food cut out of other photos that
 * floats over it and moves as you scroll. All from Wikimedia Commons; the cut-outs were made by
 * removing the plain background. Credits are listed in the README (linked from the footer).
 */

export const BACKGROUND = {
  name: "bread",
  author: "Tomascastelazo",
  licence: "CC BY-SA 4.0",
  url: "https://commons.wikimedia.org/wiki/File:Home_made_sour_dough_bread.jpg",
};

export type Floater = {
  name: string;
  /** Horizontal centre, % of the page width. */
  x: number;
  /** Starting height, % of the screen height (above 100 = further down the page). */
  y: number;
  /** Width in px on a large screen. */
  size: number;
  /** Starting tilt, degrees. */
  tilt: number;
  /** How fast it moves against the scroll: 1 = with the page, below 1 = slower, below 0 = falls. */
  speed: number;
  /** Degrees it turns per 100 px scrolled. */
  spin: number;
  /** Shown on phones too (the others would sit behind the text there). */
  phone: boolean;
  author: string;
  licence: string;
  url: string;
};

export const FLOATERS: Floater[] = [
  {
    name: "orange", x: 89, y: 16, size: 150, tilt: 8, speed: 0.55, spin: 2, phone: true,
    author: "Neutrality", licence: "public domain", url: "https://commons.wikimedia.org/wiki/File:Citrus_sinensis.jpg",
  },
  {
    name: "salt", x: 5, y: 30, size: 90, tilt: -28, speed: -0.35, spin: 4, phone: true,
    author: "Dubravko Sorić", licence: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Salt_shaker_on_white_background.jpg",
  },
  {
    name: "basil", x: 95, y: 70, size: 90, tilt: 32, speed: 0.95, spin: -5, phone: true,
    author: "BernaBotto", licence: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Ocimum_Basilicum_leaf_lighted_by_the_left.jpg",
  },
  {
    name: "tomato", x: 8, y: 88, size: 120, tilt: -6, speed: 0.45, spin: 1.5, phone: true,
    author: "Donovan Govan", licence: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:A_Tomato.jpg",
  },
  {
    name: "chili", x: 62, y: 8, size: 100, tilt: 40, speed: 1.15, spin: 3, phone: false,
    author: "Gannon anjo", licence: "public domain", url: "https://commons.wikimedia.org/wiki/File:Naga_Jolokia_Peppers.jpg",
  },
  {
    name: "garlic", x: 82, y: 112, size: 115, tilt: -10, speed: 0.7, spin: -2, phone: false,
    author: "Dubravko Sorić", licence: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Opened_garlic_bulb_with_garlic_clove.jpg",
  },
  {
    name: "orange-slice", x: 24, y: 62, size: 85, tilt: 20, speed: 0.8, spin: 6, phone: false,
    author: "Neutrality", licence: "public domain", url: "https://commons.wikimedia.org/wiki/File:Citrus_sinensis.jpg",
  },
  {
    name: "lemon", x: 46, y: 128, size: 120, tilt: -18, speed: 0.38, spin: -1.5, phone: false,
    author: "Bordercolliez", licence: "CC0", url: "https://commons.wikimedia.org/wiki/File:Lemon_with_white_background.jpg",
  },
];

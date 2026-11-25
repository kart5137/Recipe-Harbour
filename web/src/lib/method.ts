/**
 * Splits a recipe's method into preparation and cooking, the way you work in a kitchen:
 * first cut the produce and measure the spices, then cook. Everything here is read from the
 * recipe's own text (English or German) with simple patterns; nothing is invented. When the text
 * says nothing (no cut, no time, no heat), nothing is shown for it.
 *
 * Pure functions only, so the same code runs in tests and on the server.
 */
import type { RecipeLine } from "./recipe.ts";

type Lang = "en" | "de";

/** A pattern matched as whole words (JavaScript's \b does not know umlauts). */
const words = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}])`, "iu");

/* ---------- Steps: where the cooking starts ---------- */

const HEAT: Record<Lang, RegExp> = {
  en: words(
    "heat|heats|heated|heating|cook|cooks|cooking|fry|fries|frying|deep-fry|stir-fry|saut[eé]e?d?|saut[eé]ing|boil|boils|boiling|simmer|simmers|simmering|bake|bakes|baking(?! (?:powder|soda|sheet|tray|dish|pan|paper|tin))|roast|roasting|grill|grilling|broil|broiling|toast|toasting|sear|searing|braise|braising|stew|stewing|poach|poaching|steam|steaming|melt|melts|melted|melting|caramelize|caramelise|microwave|oven|skillet|griddle|wok|stove|flame|burner",
  ),
  de: words(
    "erhitzen|erhitzt|erhitze|erwärmen|erwärmt|kochen|kocht|koche|aufkochen|köcheln|köchelt|braten|brät|anbraten|anbräunen|backen|bäckt|backe|garen|gart|dünsten|dünstet|andünsten|rösten|röstet|anrösten|schmelzen|zerlassen|frittieren|grillen|dämpfen|schmoren|schmort|blanchieren|Ofen|Backofen|Herd|Pfanne|Topf erhitzen|Wok",
  ),
};

/** Heating the oven or a pan ahead of time belongs to getting ready, not to cooking. */
const PREHEAT: Record<Lang, RegExp> = {
  en: /\bpre-?heat|\bwhile (?:you )?(?:prepar|make|mix)/i,
  de: /vorheiz|vorgeheizt|währenddessen|während du/i,
};

/** The index of the step where cooking starts, or -1 when no step heats anything. */
export function cookingStart(steps: string[], lang: Lang): number {
  return steps.findIndex((s) => HEAT[lang].test(s) && !(PREHEAT[lang].test(s) && sentences(s) <= 2));
}

const sentences = (s: string) => s.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;

/* ---------- Steps: time and heat ---------- */

export type Cue =
  | { kind: "time"; from: number; to: number | null; unit: "s" | "min" | "h" }
  | { kind: "overnight" }
  | { kind: "heat"; level: "low" | "medlow" | "medium" | "medhigh" | "high" }
  | { kind: "temp"; value: number; scale: "C" | "F" };

const NUM = String.raw`\d+(?:[.,]\d+)?|½|¼|¾|an?|one|two|three|four|five|ten|ein(?:e|er)?|zwei|drei|vier|fünf|zehn`;
const NUMBERS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10,
  ein: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, zehn: 10,
};
const num = (s: string) => NUMBERS[s.toLowerCase()] ?? Number(s.replace(",", "."));

const TIME = new RegExp(
  String.raw`(?<![\p{L}\d])(${NUM})(?:\s*(?:–|-|to|bis|or|oder)\s*(${NUM}))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|Sekunden?|Sek\.|Minuten?|Min\.?|Stunden?|Std\.)(?![\p{L}])`,
  "giu",
);
const UNIT = (u: string): "s" | "min" | "h" => (/^(sec|sek)/i.test(u) ? "s" : /^(h|std|stu)/i.test(u) ? "h" : "min");

const HEAT_LEVEL: [RegExp, Cue & { kind: "heat" }][] = [
  [/medium[- ]low|low[- ]medium|mittlere?n?\s*bis\s*(?:schwache|niedrige|kleine)/i, { kind: "heat", level: "medlow" }],
  [/medium[- ]high|high[- ]medium|mittlere?n?\s*bis\s*(?:starke|hohe|große)/i, { kind: "heat", level: "medhigh" }],
  [/\b(?:low|gentle)\s+(?:heat|flame)|(?:schwache|niedrige|kleine|milde)[rn]?\s+(?:Hitze|Flamme|Stufe)/i, { kind: "heat", level: "low" }],
  [/\b(?:medium|moderate)\s+(?:heat|flame)|mittlere[rn]?\s+(?:Hitze|Flamme|Stufe)/i, { kind: "heat", level: "medium" }],
  [/\b(?:high|full|strong)\s+(?:heat|flame)|(?:starke|hohe|große|voller)[rn]?\s+(?:Hitze|Flamme|Stufe)/i, { kind: "heat", level: "high" }],
];

const TEMP = /(\d{2,3})\s*(?:°\s*|degrees?\s*|Grad\s*)(C|F|Celsius|Fahrenheit)?(?![\p{L}])/giu;

/** What a step says about time and heat, in reading order, without repeats. */
export function cues(step: string): Cue[] {
  const found: { at: number; cue: Cue }[] = [];
  for (const m of step.matchAll(TIME)) {
    const from = num(m[1]);
    const to = m[2] ? num(m[2]) : null;
    if (Number.isFinite(from) && (to === null || Number.isFinite(to))) {
      found.push({ at: m.index, cue: { kind: "time", from, to, unit: UNIT(m[3]) } });
    }
  }
  const night = /overnight|over night|über Nacht/i.exec(step);
  if (night) found.push({ at: night.index, cue: { kind: "overnight" } });
  for (const [re, cue] of HEAT_LEVEL) {
    const m = re.exec(step);
    // "medium-low" also contains "low heat"; the more specific level wins.
    if (m && !found.some((f) => f.cue.kind === "heat")) found.push({ at: m.index, cue });
  }
  for (const m of step.matchAll(TEMP)) {
    const value = Number(m[1]);
    const said = m[2]?.[0]?.toUpperCase();
    // Without a scale, 100–300 is an oven in Celsius; higher numbers are Fahrenheit.
    const scale: "C" | "F" = said === "F" || said === "C" ? said : value > 300 ? "F" : "C";
    if (value >= 30 && value <= 550) found.push({ at: m.index, cue: { kind: "temp", value, scale } });
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.cue)
    .filter((c) => {
      const k = JSON.stringify(c);
      return seen.has(k) ? false : (seen.add(k), true);
    });
}

/* ---------- Ingredients: what to cut, what to measure ---------- */

/** Ingredient groups (search index) that you cut or clean before cooking. */
const PRODUCE = new Set(["vegetable", "fruit", "herb", "meat", "poultry", "fish", "seafood"]);
const SEASONING = new Set(["spice"]);

const CUT: Record<Lang, RegExp> = {
  en: new RegExp(
    String.raw`(?:(?:very |extra )?(?:finely|coarsely|roughly|thinly|thickly|freshly|lightly)\s+)?(?:chopped|diced|sliced|minced|grated|shredded|crushed|peeled(?: and \w+)?|julienned|cubed|halved|quartered|mashed|pur[eé]ed|deseeded|seeded|trimmed|zested|juiced|torn|pounded|ground(?= ?$)|cut (?:into|in) [^,;()]+|cut up)`,
    "i",
  ),
  de: new RegExp(
    String.raw`(?:(?:sehr |ganz )?(?:fein|grob|klein|dünn|dick|frisch)\s*)?(?:gehackt|gewürfelt|geschnitten|gerieben|geraspelt|geschält|zerdrückt|gepresst|halbiert|geviertelt|püriert|entkernt|geputzt|zerkleinert|in (?:feine |dünne |kleine |grobe )?(?:Scheiben|Würfel|Streifen|Ringe|Stücke|Stückchen|Spalten)[^,;()]*)\w*`,
    "iu",
  ),
};

const AMOUNT = new RegExp(
  String.raw`^\s*((?:ca\.\s*|about\s*|approx\.\s*)?[\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:[.,/]\d+)?(?:\s*[¼½¾⅓⅔⅛])?(?:\s*(?:–|-|to|bis)\s*[\d¼½¾⅓⅔⅛]+(?:[.,/]\d+)?)?)\s*((?:heaped |level |large |small |generous |gestrichene?r? |gehäufte?r? |große?r? |kleine?r? )?(?:tsp|tbsp|teaspoons?|tablespoons?|cups?|c\.|oz|ounces?|lbs?|pounds?|g|grams?|kg|mg|ml|cl|dl|l|litres?|liters?|pinch(?:es)?|dash(?:es)?|cloves?|sticks?|bunch(?:es)?|sprigs?|handfuls?|cans?|pieces?|leaves|EL|TL|Esslöffel|Teelöffel|Tasse[n]?|Prisen?|Msp\.?|Messerspitzen?|Stück|Stk\.?|Bund|Zehen?|Pck\.?|Päckchen|Dosen?|Handvoll|Zweige?|Blätter|Becher)\b\.?(?:\s+of\b)?)?\s*`,
  "iu",
);
const TO_TASTE: Record<Lang, RegExp> = {
  en: /,?\s*\(?(?:to taste|as needed|as required|according to taste|a pinch|for seasoning)\)?/i,
  de: /,?\s*\(?(?:nach Geschmack|nach Belieben|nach Bedarf|zum Abschmecken|etwas|eine Prise)\)?/i,
};

/** Herbs that go in whole and dried, like a spice. */
const DRY_HERBS = new Set(["bay_leaf", "curry_leaves"]);
/** Ground or dried forms of produce (coriander powder, dried chillies) are measured, not cut. */
const SPICE_FORM: Record<Lang, RegExp> = {
  en: /\b(?:powder|ground|dried|seeds?|masala|flakes)\b/i,
  de: /pulver|gemahlen|getrocknet|samen|masala|flocken/i,
};

/** How the steps say to cut an ingredient whose line does not ("Finely slice the kale."). */
const CUT_VERB: Record<Lang, [RegExp, Record<string, string>]> = {
  en: [
    /(?<![\p{L}])((?:finely|coarsely|roughly|thinly|thickly)\s+)?(chop|dice|slice|mince|grate|shred|crush|peel|julienne|cube|halve|quarter|mash|deseed|trim|cut)(?![\p{L}])/iu,
    { chop: "chopped", dice: "diced", slice: "sliced", mince: "minced", grate: "grated", shred: "shredded", crush: "crushed",
      peel: "peeled", julienne: "julienned", cube: "cubed", halve: "halved", quarter: "quartered", mash: "mashed",
      deseed: "deseeded", trim: "trimmed", cut: "cut" },
  ],
  de: [
    /(?<![\p{L}])((?:fein|grob|klein|dünn)\s+)?(hacken|würfeln|schneiden|reiben|raspeln|schälen|halbieren|vierteln|zerdrücken|pressen|pürieren|entkernen|putzen|zerkleinern)(?![\p{L}])/iu,
    { hacken: "gehackt", würfeln: "gewürfelt", schneiden: "geschnitten", reiben: "gerieben", raspeln: "geraspelt",
      schälen: "geschält", halbieren: "halbiert", vierteln: "geviertelt", zerdrücken: "zerdrückt", pressen: "gepresst",
      pürieren: "püriert", entkernen: "entkernt", putzen: "geputzt", zerkleinern: "zerkleinert" },
  ],
};
const NOT_NAMES = /^(?:medium|large|small|fresh|ripe|optional|whole|about|frische?[rn]?|große?[rn]?|kleine?[rn]?|mittlere?[rn]?|reife?[rn]?)$/i;

export function cutInSteps(name: string, steps: string[], lang: Lang): string {
  const nouns = name
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && !NOT_NAMES.test(w));
  if (!nouns.length) return "";
  const [verb, participle] = CUT_VERB[lang];
  for (const step of steps) {
    for (const clause of step.split(/[.;!?]|,\s*(?:then|and then|dann)\b/i)) {
      const v = verb.exec(clause);
      if (!v) continue;
      const hit = nouns.some((n) => new RegExp(`(?<![\\p{L}])${n.slice(0, Math.max(4, n.length - 2))}`, "iu").test(clause));
      if (hit) return `${v[1] ? v[1].trim().toLowerCase() + " " : ""}${participle[v[2].toLowerCase()]}`;
    }
  }
  return "";
}

export type PrepLine = { amount: string; name: string; cut: string };

/** Splits "1 medium onion (optional), finely chopped" into amount, name and cut. */
export function parseLine(text: string, lang: Lang): PrepLine {
  let rest = text.trim();
  let amount = "";
  const a = AMOUNT.exec(rest);
  if (a && a[1]) {
    amount = (a[1] + (a[2] ? ` ${a[2].replace(/\s+of$/i, "")}` : "")).trim();
    rest = rest.slice(a[0].length);
    // "3 cloves": the "unit" was the ingredient itself.
    if (!rest.trim() && a[2]) {
      amount = a[1].trim();
      rest = a[2];
    }
  }
  let cut = "";
  const c = CUT[lang].exec(rest);
  if (c) {
    cut = c[0].trim();
    rest = rest.slice(0, c.index) + rest.slice(c.index + c[0].length);
  }
  const t = TO_TASTE[lang].exec(rest);
  if (t && !amount) {
    amount = t[0].replace(/^[,\s(]+|[)\s]+$/g, "");
    rest = rest.slice(0, t.index) + rest.slice(t.index + t[0].length);
  }
  let name = rest;
  // "(je nach Geschmack)" loses its end when "nach Geschmack" is taken out: drop the dangling part.
  while ((name.match(/\(/g)?.length ?? 0) > (name.match(/\)/g)?.length ?? 0)) name = name.replace(/\s*\([^()]*$/, "");
  name = name
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*(?:,\s*)*/g, ", ")
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "")
    .replace(/\s{2,}/g, " ");
  return { amount, name: name || text.trim(), cut };
}

export type Method = {
  /** Produce and meat, with how to cut it when the recipe says. */
  cut: PrepLine[];
  /** Spices and salt, with their amounts. */
  season: PrepLine[];
  /** Steps before anything is heated (all steps when none is). */
  prep: string[];
  /** Steps from the first one that heats something; empty when none does. */
  cook: { text: string; cues: Cue[] }[];
};

export function splitMethod(
  groups: { items: RecipeLine[] }[],
  steps: string[],
  lang: Lang,
  groupOf: (id: string) => string | undefined,
): Method {
  const cut: PrepLine[] = [];
  const season: PrepLine[] = [];
  for (const g of groups) {
    for (const it of g.items) {
      const kinds = it.ids.map(groupOf);
      const produce = kinds.some((k) => k && PRODUCE.has(k));
      if (it.ids.some((id, i) => SEASONING.has(kinds[i] ?? "") || DRY_HERBS.has(id)) || (kinds.some((k) => k === "vegetable" || k === "herb") && SPICE_FORM[lang].test(it.text))) {
        season.push(parseLine(it.text, lang));
      } else if (produce) {
        const line = parseLine(it.text, lang);
        cut.push(line.cut ? line : { ...line, cut: cutInSteps(line.name, steps, lang) });
      }
    }
  }
  // "Salt" and "Salt, to taste" in two groups of one recipe: shown once, with the amount if any.
  const seasonOnce = season.filter(
    (l, i) => !season.some((o, j) => j !== i && o.name.toLowerCase() === l.name.toLowerCase() && (o.amount ? !l.amount || j < i : !l.amount && j < i)),
  );
  const start = cookingStart(steps, lang);
  const prep = start < 0 ? steps : steps.slice(0, start);
  const cook = start < 0 ? [] : steps.slice(start).map((text) => ({ text, cues: cues(text) }));
  return { cut, season: seasonOnce, prep, cook };
}

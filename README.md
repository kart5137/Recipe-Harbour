# Recipe Harbour

**Cook with what you already have.** Type, scan or photograph the ingredients in your kitchen and get
recipes you can make, from 4,389 open cookbook recipes in English and German.

**Live:** https://recipe-harbour.vercel.app

The interface is in English and German (`/en`, `/de`), and ingredients can be typed in either
language: "Zwiebel" and "onion" are the same thing. Every recipe can be read in both languages:
English recipes are machine-translated into German and German ones into English (marked as such,
with a link to the original).

## What it does

- **Pantry search.** Add ingredients as chips (with autocomplete in both languages). Recipes you can
  make right now come first, then the ones missing the fewest things. Basics like salt, oil and water
  are assumed unless you switch that off.
- **Smart matching.** "Cheese" covers parmesan, "chicken" covers a recipe that just says "meat",
  "butter or margarine" needs only one of them. A fresh onion does not count as onion powder.
- **Barcode scan.** Scan a packaged food and it is looked up in Open Food Facts and turned into an
  ingredient. You can also type the number.
- **Photo of fruit or vegetables.** An image-text model recognises one item per photo, **on your
  device**; photos are never uploaded. It suggests the 29 ingredients it is reliable on (onion,
  garlic, potato, tomato, carrot, ...) and says so when unsure.
- **Filters and browsing.** Dish type, time, vegetarian or vegan, and "only what I can make now".
- **Recipe pages.** Tick off what you have and get a shopping list you can copy.
- **Favourites.** Saved in your browser; no account needed.

## How well it works

All numbers are measured, and each links to the document it comes from.

| | |
|---|---|
| Recipes | 3,786 English + 603 German, from 4,475 wiki pages ([data profile](docs/data/PROFILE.md)) |
| Ingredient vocabulary | 298 ingredients with English and German names ([vocabulary notes](docs/data/INGREDIENTS.md)) |
| Photo model, real photos it never saw | choosing among 74 ingredients: right first 76 %, in the top 3 91 % on 2,205 test crops; 78 % / 91 % on 1,142 whole photos ([model card](docs/model/MODEL_CARD.md)) |

The diet labels (vegetarian, vegan) are worked out from the ingredient lists, and the app says so on
every recipe where that is the case. If you have an allergy, check the ingredients yourself.

## How it is built

```
pipeline/   Python: fetch the Wikibooks pages, parse the wikitext, match ingredients, export
data/       the processed recipes (CC BY-SA 4.0)
model/      Python: compare image-text models, train the ingredient head, export to ONNX
web/        Next.js 16 app (React 19, Tailwind CSS 4); search runs on the server
docs/       spec, data profile, model card
```

- **Data pipeline:** the MediaWiki API, `mwparserfromhell`, and a hand-checked bilingual ingredient
  vocabulary. Each recipe keeps its source URL, revision and author history link.
- **Translation:** Facebook's WMT19 English-German models, run once over every sentence
  (`model/translate_recipes.py`, results in `data/translations.jsonl`); the export adds the
  translated texts to the recipe data.
- **Search:** a compact index (about 1.7 MB) loaded once per server. Recipe pages read from 32 shards.
- **Photo model:** the image half of Google SigLIP 2 (4-bit weights, 66.5 MB) plus an ingredient head
  tuned on real Open Images photos, run with ONNX Runtime Web. It is served from
  [Hugging Face](https://huggingface.co) and fetched in the background while you use the page, then
  cached by the browser (not on data-saver or slow connections; then it loads when you open Photo).

## Run it locally

You need Node.js 20 or newer.

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Rebuilding the data (optional, Python 3.12 or newer):

```bash
python -m venv .venv && .venv/Scripts/pip install -e "pipeline[dev]"   # bin/ instead of Scripts/ on macOS and Linux
.venv/Scripts/rh fetch && .venv/Scripts/rh build && .venv/Scripts/rh export
cd pipeline && ../.venv/Scripts/pytest -q
```

Rebuilding the photo model is described in [model/README.md](model/README.md). To use the local model
files instead of the Hugging Face copy, put `NEXT_PUBLIC_MODEL_BASE=/model/` in `web/.env.local` and copy
`vision.onnx` into `web/public/model/` (it is not in git).

## Credits

- **Made by Karthik Manoj.** A rebuild of my 2023 project *RecipeHarbor* with open data and new features.
- **Recipes:** the [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents) and
  the [Wikibooks Kochbuch](https://de.wikibooks.org/wiki/Kochbuch), written by their contributors and
  shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every recipe page
  links to its original and its authors. Details are in [data/LICENSE.md](data/LICENSE.md).
- **Product data:** [Open Food Facts](https://world.openfoodfacts.org) contributors, under the
  [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
- **Training photos:** [Open Images V7](https://storage.googleapis.com/openimages/web/index.html)
  (images CC BY 2.0, every photographer listed in [model/OPEN_IMAGES_CREDITS.csv](model/OPEN_IMAGES_CREDITS.csv))
  and [Fruits-360](https://github.com/fruits-360) by Mihai Oltean (CC BY-SA 4.0).
- **Translation models:** [WMT19 en-de and de-en](https://huggingface.co/facebook/wmt19-en-de) by
  Facebook AI (Apache 2.0).
- **Background photos** (Wikimedia Commons, resized for the web, in `web/public/backdrops/` and
  `web/public/floaters/`; the floating items were cut out of their photos by removing the plain background):
  [sourdough bread](https://commons.wikimedia.org/wiki/File:Home_made_sour_dough_bread.jpg) by Tomascastelazo (CC BY-SA 4.0),
  [salt shaker](https://commons.wikimedia.org/wiki/File:Salt_shaker_on_white_background.jpg) and
  [garlic](https://commons.wikimedia.org/wiki/File:Opened_garlic_bulb_with_garlic_clove.jpg) by Dubravko Sorić (CC BY 2.0),
  [basil leaf](https://commons.wikimedia.org/wiki/File:Ocimum_Basilicum_leaf_lighted_by_the_left.jpg) by BernaBotto (CC BY-SA 4.0),
  [tomato](https://commons.wikimedia.org/wiki/File:A_Tomato.jpg) by Donovan Govan (CC BY-SA 3.0),
  [orange](https://commons.wikimedia.org/wiki/File:Citrus_sinensis.jpg) by Neutrality (public domain),
  [chilli](https://commons.wikimedia.org/wiki/File:Naga_Jolokia_Peppers.jpg) by Gannon anjo (public domain),
  [lemon](https://commons.wikimedia.org/wiki/File:Lemon_with_white_background.jpg) by Bordercolliez (CC0).
  The edited versions of the CC BY-SA photos are shared under the same licence.
- **Image-text model:** [SigLIP 2](https://huggingface.co/google/siglip2-base-patch32-256) by Google
  (Apache 2.0), run with [ONNX Runtime Web](https://onnxruntime.ai) (MIT).

## Licences

- **Code:** MIT, see [LICENSE](LICENSE).
- **Recipe data** (`data/`, `web/src/data/`), including the machine translations: CC BY-SA 4.0.
- **Photo model** (`web/public/model/`, Hugging Face): image encoder Apache 2.0 (SigLIP 2, quantised), ingredient head CC BY-SA 4.0; see [its licence file](web/public/model/LICENSE.txt).

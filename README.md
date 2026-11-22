# Recipe Harbour

**Cook with what you already have.** Type, scan or photograph the ingredients in your kitchen and get
recipes you can make, from 4,389 open cookbook recipes in English and German.

**Live:** https://recipe-harbour.vercel.app

The interface is in English and German (`/en`, `/de`), and ingredients can be typed in either
language: "Zwiebel" and "onion" are the same thing.

## What it does

- **Pantry search.** Add ingredients as chips (with autocomplete in both languages). Recipes you can
  make right now come first, then the ones missing the fewest things. Basics like salt, oil and water
  are assumed unless you switch that off.
- **Smart matching.** "Cheese" covers parmesan, "chicken" covers a recipe that just says "meat",
  "butter or margarine" needs only one of them. A fresh onion does not count as onion powder.
- **Barcode scan.** Scan a packaged food and it is looked up in Open Food Facts and turned into an
  ingredient. You can also type the number.
- **Photo of fruit or vegetables.** A small model recognises one item per photo, **on your device**;
  photos are never uploaded. It only suggests the 10 classes it is reliable on, and says so when unsure.
- **Filters and browsing.** Dish type, time, vegetarian or vegan, and "only what I can make now".
- **Recipe pages.** Tick off what you have and get a shopping list you can copy.
- **Favourites.** Saved in your browser; no account needed.

## How well it works

All numbers are measured, and each links to the document it comes from.

| | |
|---|---|
| Recipes | 3,786 English + 603 German, from 4,475 wiki pages ([data profile](docs/data/PROFILE.md)) |
| Ingredient vocabulary | 298 ingredients with English and German names ([vocabulary notes](docs/data/INGREDIENTS.md)) |
| Photo model, real photos it never saw | top-1 74 %, top-3 90 % on 2,205 test photos ([model card](docs/model/MODEL_CARD.md)) |

The diet labels (vegetarian, vegan) are worked out from the ingredient lists, and the app says so on
every recipe where that is the case. If you have an allergy, check the ingredients yourself.

## How it is built

```
pipeline/   Python: fetch the Wikibooks pages, parse the wikitext, match ingredients, export
data/       the processed recipes (CC BY-SA 4.0)
model/      Python: train the produce classifier and export it to TensorFlow.js
web/        Next.js 16 app (React 19, Tailwind CSS 4); search runs on the server
docs/       spec, data profile, model card
```

- **Data pipeline:** the MediaWiki API, `mwparserfromhell`, and a hand-checked bilingual ingredient
  vocabulary. Each recipe keeps its source URL, revision and author history link.
- **Search:** a compact index (about 1.7 MB) loaded once per server. Recipe pages read from 32 shards.
- **Model:** MobileNetV2 fine-tuned on real photos from Open Images V7 plus Fruits-360, exported
  with 16-bit weights (about 4.7 MB). TensorFlow.js is only downloaded when you open the photo dialog.

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

Retraining the model is described in [model/README.md](model/README.md).

## Credits

- **The original RecipeHarbor (2023)** was a team project at VIT Bhopal by **Karthik Manoj, Yash Raj,
  Madhav Nawab and Kumar Prince**. This is a rebuild of that idea with open data and new features.
- **Recipes:** the [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents) and
  the [Wikibooks Kochbuch](https://de.wikibooks.org/wiki/Kochbuch), written by their contributors and
  shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every recipe page
  links to its original and its authors. Details are in [data/LICENSE.md](data/LICENSE.md).
- **Product data:** [Open Food Facts](https://world.openfoodfacts.org) contributors, under the
  [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
- **Training photos:** [Open Images V7](https://storage.googleapis.com/openimages/web/index.html)
  (images CC BY 2.0, every photographer listed in [model/OPEN_IMAGES_CREDITS.csv](model/OPEN_IMAGES_CREDITS.csv))
  and [Fruits-360](https://github.com/fruits-360) by Mihai Oltean (CC BY-SA 4.0).

## Licences

- **Code:** MIT, see [LICENSE](LICENSE).
- **Recipe data** (`data/`, `web/src/data/`): CC BY-SA 4.0.
- **Photo model** (`web/public/model/`): see [its licence file](web/public/model/LICENSE.txt).

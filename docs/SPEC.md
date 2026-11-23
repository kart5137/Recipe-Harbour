# Recipe Harbour: spec (rebuild)

A rebuild of Karthik Manoj's 2023 project *RecipeHarbor*. The original was a command-line script over the paid Spoonacular
API, written because no usable recipe dataset could be found. The rebuild uses open recipe data
it owns: a polished, bilingual (English/German) web app built on the Wikibooks cookbooks.

## Data
| Source | Recipes | Licence |
|---|---|---|
| English Wikibooks *Cookbook* (en.wikibooks.org, Category:Recipes) | ~3,835 | CC BY-SA 4.0 |
| German Wikibooks *Kochbuch* (de.wikibooks.org, Kategorie:Kochbuch/ Alle Rezepte) | ~640 (to verify) | CC BY-SA 4.0 |

- Fetched with the MediaWiki API (polite rate, generic user agent), not scraped HTML.
- Every recipe keeps its source URL and revision ID for attribution.
- **Licence obligations:** each recipe page links to the original page and its authors (history),
  names the licence (CC BY-SA 4.0) and states that it was reformatted. The processed recipe data
  is published under CC BY-SA 4.0. The app's code is under its own licence (MIT).
- Counts and quality are measured in R1 and written to a data profile; no numbers in the UI or
  README that weren't measured.

## What it does
1. **Find recipes from what you have.** Type ingredients as chips, in English or German.
   Matching uses a shared ingredient vocabulary, so *Zwiebel* and *onion* are the same thing
   and a German search also finds English recipes. Results are ranked by how much of your
   pantry they use, with "you have" and "you're missing" lists.
2. **Search by name** in either language.
3. **Recipe page.** Ingredients, steps, servings, time and difficulty (where the source has them),
   the recipe's language, and the attribution block.
4. **Shopping list.** Missing ingredients as a checklist you can copy.
5. **Filters.** Recipe language (English / Deutsch / both), category, time, difficulty, and
   vegetarian/vegan. Diet tags are inferred from ingredients and labelled as such.
6. **Favourites**, saved in the browser.
7. **English/German interface** toggle. Recipes stay in their original language.
8. **Camera input.** Instead of typing, scan ingredients:
   - **Barcode** on packaged food → product from Open Food Facts → ingredient chip.
   - **Photo of fresh produce** → our own image model, running in the browser → ingredient chip.
   Everything recognised appears as a chip with its confidence, and you confirm or remove it
   before searching. Photos never leave the device.

## Camera: how it works
**Barcode scanning (packaged food)**
- The camera reads EAN/UPC barcodes in the browser: the built-in BarcodeDetector where
  available, with an open-source fallback (ZXing) for browsers without it (e.g. iOS Safari).
- The product is looked up in **Open Food Facts** (open data, ODbL) through our server route,
  which sends the app's own user agent as their API asks and respects their rate limits.
- The product's name and categories are mapped to our bilingual ingredient vocabulary
  (e.g. category "pastas" → pasta). Unknown products are shown by name for the user to
  confirm or edit.
- Credit: "Product data © Open Food Facts contributors, ODbL" in the app.

**Produce recognition (our own model)**
- **Task:** classify one fruit or vegetable per photo (top-3 suggestions with confidence).
- **Training data:** chosen in R6 only after checking each dataset's licence and image
  provenance. Candidates: Fruits-360 (lab photos on white background; licence listed as
  CC BY-SA 4.0 on Mendeley but MIT on GitHub, to resolve) plus real-world photo sets whose
  sources are clean. Sets built from scraped web images are excluded.
- **Model:** transfer learning on a small mobile network (MobileNet/EfficientNet-Lite) in
  TensorFlow/Keras, with augmentation for lighting and background. Exported to
  **TensorFlow.js** and run on the device.
- **Evaluation:** accuracy on a held-out set *and* on a separate set of real kitchen photos,
  reported honestly in a model card (per-class results, confusion matrix, known failure cases).
  Only classes that reach an agreed accuracy are offered in the app.
- **Classes:** only ingredients that exist in the recipe vocabulary.
- If a training set is CC BY-SA, the model weights are published under CC BY-SA too.

**Camera UI**
- Live camera (HTTPS, permission prompt) with a "take photo" button, plus upload from gallery.
- Low-confidence results ask the user to pick from the top 3 or to type instead. No silent guesses.

## Ingredient understanding (the core of the data work)
- **Parser:** from lines like "2 cups finely chopped onions" or "500 g Zwiebeln, gewürfelt",
  extract quantity, unit, preparation and the ingredient itself.
- **Bilingual vocabulary:** canonical ingredients with English and German names, plurals,
  spelling variants (Möhre/Moehre) and synonyms (Hähnchen/Hühnchen/chicken).
- **Coverage report:** the share of ingredient lines that map to the vocabulary, per language,
  with the most common unmatched terms, so it can be improved deliberately.
- Unit tests for the parser and the vocabulary.

## Stack
- **Pipeline (Python):** fetch → parse → normalise → validate → write the dataset (JSON or
  SQLite) plus the data profile. Re-runnable; data is refreshed by re-running it.
- **App (Next.js + TypeScript + Tailwind):** search runs server-side over the bundled
  dataset (~4,500 recipes fits easily). No external database, no API keys.
- **Model (Python, TensorFlow/Keras → TensorFlow.js):** training scripts and model card in
  the repo; the exported model is served as static files and runs in the browser.
- **Deploy:** Vercel (free). **Tests:** pipeline unit tests, web unit tests and browser QA. **CI:** GitHub Actions.

## Design
- Recipe cards without photos: most Wikibooks recipes have none. Clean cards with a category
  icon and colour, the time and the match score. Photos are out of scope for v1, because
  Wikimedia Commons images each have their own licence and credit.

## Milestones
| # | Milestone | Delivers |
|---|---|---|
| R1 | Data | Fetch EN + DE recipes, parse sections and infoboxes, data profile (counts, missing fields) |
| R2 | Ingredients | Parser, bilingual vocabulary, coverage report, tests |
| R3 | Search | App skeleton, ingredient-chip search with ranking and have/missing lists, name search |
| R4 | Recipe page | Detail view, shopping list, attribution |
| R5 | Barcode scanning | Camera barcode reader, Open Food Facts lookup, product → ingredient mapping |
| R6 | Produce model | Dataset vetting, training, evaluation on real photos, model card, TF.js export |
| R7 | Camera in the app | Photo capture/upload, on-device recognition, confirm-as-chips flow |
| R8 | Filters and polish | Filters, favourites, EN/DE interface, responsive design |
| R9 | Launch | Vercel deploy, README (crediting the original team, Wikibooks and Open Food Facts), GitHub repo |

Each milestone ends with: what was built, files, how to run, how to test, limitations, and
waits for approval.

## Out of scope (v1)
Accounts, recipe photos, meal planning, nutrition data, machine translation of recipe text,
recognising several items in one photo (object detection), cloud vision APIs.

# Recipe data licence

`recipes.json` contains recipes from the English Wikibooks **Cookbook**
(https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents) and the German Wikibooks
**Kochbuch** (https://de.wikibooks.org/wiki/Kochbuch), written by Wikibooks contributors.

- **Licence:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0),
  https://creativecommons.org/licenses/by-sa/4.0/
- **Authors:** each recipe's `history_url` lists everyone who edited that page.
- **Source:** each recipe's `url` and `revision_id` identify the exact page version used.
- **Changes made:** the wiki pages were reformatted. Markup, navigation, references and
  images were removed; ingredients, steps and summary fields were extracted into a
  structured format. Recipe text was not otherwise edited.

`translations.jsonl` holds machine translations of the recipe texts into the other language
(English into German, German into English), one row per sentence, made with Facebook's WMT19
translation models (`facebook/wmt19-en-de`, `facebook/wmt19-de-en`, Apache 2.0) by
`model/translate_recipes.py`. They were not checked by a person; the app labels translated
recipes as machine-translated and links the original. Rows with `kept_original` keep the source
wording because the translation dropped a number.

This dataset (a derivative work), including the translations, is distributed under the same licence, CC BY-SA 4.0.
It is regenerated with the Recipe Harbour pipeline (`rh fetch` then `rh build`).
The application source code is licensed separately.

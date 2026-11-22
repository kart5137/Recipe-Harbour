"""Export compact files for the web app (`rh export`).

web/src/data/search-index.json   what search and the result cards need:
    ingredients  [{id, group, staple, parents: [index], en: [names], de: [names]}]
    recipes      [{id, lang, title, family, desc, min, diff, diet, req, opt, unk, lines}]
        req   required items, each a list of ingredient indexes; more than one only for
              alternatives ("margarine or butter"), where any one satisfies it
        opt   ingredients only used in optional lines
        unk   required lines that were not understood (shown as "other ingredients")

web/src/data/recipes/shard-NN.json   full recipe pages (description, ingredients, steps,
    attribution), split into 32 shards so a page loads ~300 KB instead of the whole set.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path

from .config import OUT_DIR, ROOT
from .ingredients import Vocabulary, norm, vocab

log = logging.getLogger(__name__)
WEB_DATA = ROOT / "web" / "src" / "data"

# Ordered: the first family whose keywords match wins ("salad dressing" is a sauce, not a salad).
FAMILIES: list[tuple[str, tuple[str, ...]]] = [
    ("drink", ("beverage", "drink", "cocktail", "smoothie", "getraenk", "bowle", "kaffee", "milchshake", "punch",
               "lemonade", "tea recipes", "coffee", "liqueur", "wine recipes")),
    ("sauce", ("sauce", "dressing", "dip ", "dip recipes", "marinade", "condiment", "chutney", "spice mix",
               "salsa", "relish", "saucen", "fuellung", "frosting", "icing", "jam", "pickle", "grundrezept",
               "seasoning", "spread", "gravy", "ketchup", "pesto", "mayonnaise")),
    ("dessert", ("dessert", "pudding", "custard", "confection", "candy", "suessigkeit", "ice cream", "sorbet",
                 "nachtisch", "nachspeise", "sweet")),
    ("baking", ("cake", "cookie", "pastr", "pie", "tart", "muffin", "gebaeck", "kuchen", "torte", "backen",
                "brownie", "plaetzchen", "biscotti", "scone", "doughnut", "donut", "strudel", "stollen")),
    ("bread", ("bread", "flatbread", "brot", "broetchen", "rolls", "dough", "pizza", "bun recipes", "bagel",
               "naan", "chapati", "tortilla")),
    ("breakfast", ("breakfast", "pancake", "porridge", "waffle", "fruehstueck", "eier und mehlspeisen", "crepe",
                   "omelet", "granola", "muesli", "oatmeal", "french toast")),
    ("soup", ("soup", "stew", "chowder", "suppe", "eintopf", "broth", "bisque", "gumbo", "consomme")),
    ("salad", ("salad", "salat", "slaw")),
    ("pasta", ("pasta", "noodle", "nudel", "spaghetti", "lasagn", "dumpling", "macaroni", "ravioli", "gnocchi",
               "spaetzle", "maultasche")),
    ("rice", ("rice", "reis", "risotto", "pilaf", "pilau", "biryani", "paella", "jollof", "getreide", "grain",
              "couscous", "porridge", "swallow", "fufu", "ugali", "polenta")),
    ("fish", ("fish", "seafood", "shrimp", "prawn", "salmon", "tuna", "fisch", "crab", "lobster", "mussel",
              "shellfish", "cod", "sushi")),
    ("poultry", ("chicken", "duck", "turkey", "poultry", "gefluegel", "huhn", "haehnchen", "goose")),
    ("meat", ("meat", "beef", "pork", "lamb", "sausage", "hamburger", "fleisch", "rind", "schwein", "braten",
              "goat", "veal", "steak", "bacon", "ham ", "mutton", "venison", "kebab")),
    ("vegetable", ("vegetable", "potato", "bean", "eggplant", "corn", "tofu", "gemuese", "kartoffel", "bohnen",
                   "linsen", "kuerbis", "brokkoli", "lentil", "spinach", "mushroom", "zucchini", "cabbage",
                   "side dish", "beilage", "casserole", "auflauf", "curry", "vegan", "vegetarian", "cheese",
                   "kaese", "egg recipes")),
    ("snack", ("snack", "appetizer", "fritter", "sandwich", "vorspeise", "finger food", "starter", "hors",
               "canape", "chips", "nuts recipes")),
]
_INGREDIENT_FAMILY = [
    ("fish", {"fish", "seafood"}),
    ("poultry", {"poultry"}),
    ("meat", {"meat"}),
]


def family_of(rec: dict, v: Vocabulary) -> str:
    for text in [rec["category"], *rec.get("wiki_categories", []), rec["title"]]:
        t = f" {norm(text)} "
        for fam, keys in FAMILIES:
            if any(k in t for k in keys):
                return fam
    groups = {v.items[i].group for i in rec["ingredient_ids"] if i in v.items}
    for fam, gs in _INGREDIENT_FAMILY:
        if groups & gs:
            return fam
    return "main"


def _short(text: str, n: int = 170) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    return cut[: cut.rfind(" ")].rstrip(",;:") + "…"


SHARDS = 32


def _fnv1a(text: str) -> int:
    """32-bit FNV-1a over UTF-8 bytes."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def shard_of(recipe_id: str) -> int:
    """Stable shard number for a recipe id; web/src/lib/shard.ts computes the same."""
    return _fnv1a(recipe_id) % SHARDS


def _detail(r: dict, family: str) -> dict:
    """Everything the recipe page shows. Quantities stay inside the line text."""
    return {
        "id": r["id"],
        "lang": r["lang"],
        "title": r["title"],
        "family": family,
        "description": r.get("description", ""),
        "category": r.get("category", ""),
        "cuisine": r.get("cuisine", ""),
        "servings_text": r.get("servings_text", ""),
        "servings": r.get("servings", None),
        "time_text": r.get("time_text", ""),
        "minutes": r.get("minutes", None),
        "difficulty": r.get("difficulty", None),
        "diet": r.get("diet", ""),
        "diet_source": r.get("diet_source", ""),
        "groups": [
            {
                "name": g["name"],
                "items": [
                    {"text": i["text"], "ids": i["ids"], "optional": i["optional"], "alt": i["alt"]}
                    for i in g["items"]
                ],
            }
            for g in r["ingredient_groups"]
        ],
        "steps": r.get("steps", []),
        "equipment": r.get("equipment", []),
        "notes": r.get("notes", []),
        "url": r["url"],
        "history_url": r.get("history_url", ""),
        "revision_id": r.get("revision_id", None),
        "revision_timestamp": r.get("revision_timestamp", ""),
    }


def export(recipes_path: Path = OUT_DIR / "recipes.json", out_dir: Path = WEB_DATA) -> dict:
    v = vocab()
    recipes = json.loads(recipes_path.read_text(encoding="utf-8"))
    ids = list(v.items)
    pos = {iid: k for k, iid in enumerate(ids)}
    non_food = {i for i in ids if "non_food" in v.flags(i)}

    ingredients = [
        {
            "id": it.id,
            "group": it.group,
            "staple": "staple" in it.flags,
            "parents": [pos[p] for p in it.parents],
            "en": list(it.en),
            "de": list(it.de),
        }
        for it in v.items.values()
        if it.id not in non_food
    ]
    # Re-index after dropping non-food entries.
    kept_ids = [x["id"] for x in ingredients]
    kpos = {iid: k for k, iid in enumerate(kept_ids)}
    for x in ingredients:
        x["parents"] = [kpos[ids[p]] for p in x["parents"] if ids[p] in kpos]

    out_recipes = []
    families: dict[str, int] = {}
    shards: list[dict] = [{} for _ in range(SHARDS)]
    for r in recipes:
        req, opt, unk = [], set(), 0
        for g in r["ingredient_groups"]:
            for it in g["items"]:
                line = [kpos[i] for i in it["ids"] if i in kpos]
                if it["optional"]:
                    opt.update(line)
                elif line and it["alt"]:
                    req.append(line)  # "margarine or butter": either one covers the line
                elif line:
                    # "beans, onion, garlic, salt" written on one line: each is needed
                    req.extend([i] for i in line)
                elif not any(i in non_food for i in it["ids"]):
                    unk += 1
        fam = family_of(r, v)
        families[fam] = families.get(fam, 0) + 1
        shards[shard_of(r["id"])][r["id"]] = _detail(r, fam)
        out_recipes.append({
            "id": r["id"],
            "lang": r["lang"],
            "title": r["title"],
            "family": fam,
            "desc": _short(r["description"]),
            "min": r["minutes"],
            "diff": r["difficulty"],
            "diet": r["diet"],
            "req": req,
            "opt": sorted(opt),
            "unk": unk,
            "url": r["url"],
        })

    index = {
        "version": 1,
        "built_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "licence": "Recipes: Wikibooks Cookbook and Kochbuch contributors, CC BY-SA 4.0",
        "ingredients": ingredients,
        "recipes": out_recipes,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    # German display names for the interface (first German name, each word capitalised).
    names_de = {x["id"]: " ".join(w[:1].upper() + w[1:] for w in x["de"][0].split()) for x in ingredients if x["de"]}
    (out_dir / "ingredient-names-de.json").write_text(
        json.dumps(names_de, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8"
    )
    path = out_dir / "search-index.json"
    path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info("search index: %d recipes, %d ingredients, %.1f MB -> %s", len(out_recipes), len(ingredients),
             path.stat().st_size / 1e6, path)
    log.info("families: %s", dict(sorted(families.items(), key=lambda kv: -kv[1])))
    detail_dir = out_dir / "recipes"
    detail_dir.mkdir(parents=True, exist_ok=True)
    for old in detail_dir.glob("shard-*.json"):
        old.unlink()
    for k, shard in enumerate(shards):
        (detail_dir / f"shard-{k:02d}.json").write_text(
            json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
    sizes = [(detail_dir / f"shard-{k:02d}.json").stat().st_size for k in range(SHARDS)]
    log.info("recipe details: %d shards, %.0f-%.0f KB each", SHARDS, min(sizes) / 1e3, max(sizes) / 1e3)
    return {"recipes": len(out_recipes), "ingredients": len(ingredients), "families": families}

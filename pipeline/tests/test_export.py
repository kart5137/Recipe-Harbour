import json

import pytest

from rh_pipeline.export import export, family_of
from rh_pipeline.ingredients import vocab


def rec(category="", title="X", wiki_categories=(), ingredient_ids=()):
    return {"category": category, "title": title, "wiki_categories": list(wiki_categories),
            "ingredient_ids": list(ingredient_ids)}


@pytest.mark.parametrize(
    "r, family",
    [
        (rec("Salad dressing recipes"), "sauce"),  # dressing wins over salad
        (rec("Salad recipes"), "salad"),
        (rec("Recipes for dessert"), "dessert"),
        (rec("Gebäck und Kuchen"), "baking"),
        (rec("Suppen und Eintöpfe"), "soup"),
        (rec("Beverage recipes"), "drink"),
        (rec("Chicken recipes"), "poultry"),
        (rec("Fischgerichte"), "fish"),
        # cuisine-only category: fall back to wiki categories, then the title, then ingredients
        (rec("Nigerian recipes", wiki_categories=["Soup recipes"]), "soup"),
        (rec("Nigerian recipes", title="Jollof Rice"), "rice"),
        (rec("Nigerian recipes", title="Asun", ingredient_ids=["goat", "onion"]), "meat"),
        (rec("", title="Something", ingredient_ids=["salmon"]), "fish"),
        (rec("", title="Something", ingredient_ids=["onion"]), "main"),
    ],
)
def test_family_of(r, family):
    assert family_of(r, vocab()) == family


def test_export_index(tmp_path):
    recipes = [{
        "id": "en-1", "lang": "en", "title": "Test Soup", "category": "Soup recipes", "wiki_categories": [],
        "description": "A soup. " * 40, "minutes": [20, 30], "difficulty": 2, "diet": "vegan",
        "url": "https://en.wikibooks.org/wiki/Cookbook:Test_Soup", "ingredient_ids": ["onion", "salt"],
        "ingredient_groups": [{"name": None, "items": [
            {"text": "1 onion", "ids": ["onion"], "qty": [1, 1], "unit": None, "optional": False, "alt": False},
            {"text": "margarine or butter", "ids": ["margarine", "butter"], "qty": None, "unit": None,
             "optional": False, "alt": True},
            {"text": "chili flakes (optional)", "ids": ["chili_flakes"], "qty": None, "unit": None,
             "optional": True, "alt": False},
            {"text": "a mystery item", "ids": [], "qty": None, "unit": None, "optional": False, "alt": False},
            {"text": "beans, garlic, salt", "ids": ["beans", "garlic", "salt"], "qty": None, "unit": None,
             "optional": False, "alt": False},
            {"text": "skewers", "ids": ["non_food"], "qty": None, "unit": None, "optional": False, "alt": False},
        ]}],
    }]
    src = tmp_path / "recipes.json"
    src.write_text(json.dumps(recipes), encoding="utf-8")
    export(src, tmp_path)
    index = json.loads((tmp_path / "search-index.json").read_text(encoding="utf-8"))
    ids = [i["id"] for i in index["ingredients"]]
    assert "non_food" not in ids
    r = index["recipes"][0]
    assert r["family"] == "soup" and r["min"] == [20, 30] and r["diet"] == "vegan"
    # alternatives stay one any-of item; a comma list on one line becomes separate required items
    assert [[ids[i] for i in line] for line in r["req"]] == [
        ["onion"], ["margarine", "butter"], ["beans"], ["garlic"], ["salt"],
    ]
    assert [ids[i] for i in r["opt"]] == ["chili_flakes"]
    assert r["unk"] == 1  # the mystery item; the skewers are not food
    assert len(r["desc"]) <= 171 and r["desc"].endswith("…")
    # parents are indexes into the same list
    olive = index["ingredients"][ids.index("olive_oil")]
    assert [ids[p] for p in olive["parents"]] == ["oil"]

from pathlib import Path

import pytest

from rh_pipeline.config import SOURCES
from rh_pipeline.parse import (
    Dropped,
    parse_difficulty,
    parse_minutes,
    parse_page,
    parse_servings,
)
from rh_pipeline.wikitext import to_text

FIX = Path(__file__).parent / "fixtures"


def plain(groups):
    """ingredient_groups with item texts only (links dropped) for compact assertions."""
    return [{"name": g["name"], "items": [i["text"] for i in g["items"]]} for g in groups]


def page(name: str, title: str, pageid: int = 1) -> dict:
    return {
        "pageid": pageid,
        "title": title,
        "revid": 99,
        "timestamp": "2026-01-01T00:00:00Z",
        "content": (FIX / name).read_text(encoding="utf-8"),
        "categories": ["Category:Beef recipes", "Category:Recipes using palm oil"],
    }


# --------------------------------------------------------------------- wikitext
@pytest.mark.parametrize(
    "src, expected",
    [
        ("[[Cookbook:Onion|onions]]", "onions"),
        ("[[Cookbook:Salt]]", "Salt"),
        ("{{convert|8|oz|g|abbr=on}} noodles", "8 oz noodles"),
        ("{{frac|1|2}} cup", "1/2 cup"),
        ("{{frac|1|1|2}} cups", "1 1/2 cups"),
        ("mix<ref>source</ref> well", "mix well"),
        ("a <!-- hidden --> b", "a b"),
        ("[[File:x.jpg|thumb|cap]]text", "text"),
        ("'''bold''' and ''it''", "bold and it"),
        ("&frac12; cup&nbsp;milk", "½ cup milk"),
        ("[[Category:Recipes]]", ""),
        ("__NOTOC__ Intro text", "Intro text"),
        ('<div style="x"> Boxed', "Boxed"),
        ("Fry it.{{Recipe summary", "Fry it."),
    ],
)
def test_to_text(src, expected):
    assert to_text(src) == expected


# --------------------------------------------------------------------- fields
@pytest.mark.parametrize(
    "text, expected",
    [
        ("20 minutes", (20, 20)),
        ("1 hour 30 minutes", (90, 90)),
        ("1½ hours", (90, 90)),
        ("20-30 Minuten", (20, 30)),
        ("40 min", (40, 40)),
        ("2 Stunden", (120, 120)),
        ("ca. 1 Std.", (60, 60)),
        ("1 day", (1440, 1440)),
        ("sofort nach Zubereitung servierbar", None),
        ("", None),
    ],
)
def test_parse_minutes(text, expected):
    assert parse_minutes(text) == expected


@pytest.mark.parametrize(
    "text, expected",
    [("4", (4, 4)), ("4-6", (4, 6)), ("für 4 Personen", (4, 4)), ("6 to 8", (6, 8)), ("many", None)],
)
def test_parse_servings(text, expected):
    assert parse_servings(text) == expected


def test_parse_difficulty():
    assert parse_difficulty("2") == 2
    assert parse_difficulty("Level 3 of 5") == 3
    assert parse_difficulty("") is None


# --------------------------------------------------------------------- pages
def test_english_recipe_summary_and_sections():
    r = parse_page(page("en_stroganoff.wiki", "Cookbook:20-Minute Beef Stroganoff"), SOURCES["en"])
    assert r.id == "en-1" and r.lang == "en"
    assert r.title == "20-Minute Beef Stroganoff"
    assert r.category == "Beef recipes"
    assert r.servings == (4, 4) and r.minutes == (20, 20) and r.difficulty == 2
    items = plain(r.ingredient_groups)[0]["items"]
    assert items[0] == "8 oz wide egg noodles (figures are for yolk-free noodles)"
    assert "coarsely-chopped onion" in items[3]
    assert items[-1] == "Salt to taste"
    assert len(r.steps) == 3 and r.steps[2].endswith("about 3 minutes.")  # <ref> removed
    assert r.url.startswith("https://en.wikibooks.org/wiki/Cookbook:20-Minute")
    assert r.history_url.endswith("&action=history")


def test_ingredient_links_are_kept():
    r = parse_page(page("en_stroganoff.wiki", "Cookbook:20-Minute Beef Stroganoff"), SOURCES["en"])
    items = r.ingredient_groups[0]["items"]
    assert items[1] == {"text": "1 teaspoon olive oil", "links": ["Teaspoon", "Olive Oil"]}
    assert items[3]["links"] == ["Cup", "Chopping", "Onion"]
    assert items[0]["links"] == ["Pasta"]  # {{convert}} has no links


def test_english_variant_infobox_equipment_and_description():
    r = parse_page(page("en_aadun.wiki", "Cookbook:Aadun"), SOURCES["en"])
    assert r.cuisine == "Nigerian" and r.difficulty == 2
    assert r.image == "Àádùn2.jpg"
    assert plain(r.ingredient_groups)[0]["items"] == [
        "1 cup corn flour",
        "1/4 cup palm oil",
        "½ teaspoon salt",
    ]
    assert r.equipment == ["Mixing bowl"]
    assert r.description.startswith("Aadun is a snack")
    assert "9jafoodie" not in r.description  # citation removed
    assert r.steps[1] == "Leave the mixture to sit for 2–3 hours."
    assert "Recipes using palm oil" in r.wiki_categories


def test_german_rezeptbox():
    r = parse_page(page("de_maispuffer.wiki", "Kochbuch/ Maispuffer"), SOURCES["de"])
    assert r.title == "Maispuffer" and r.lang == "de"
    assert r.servings == (4, 6) and r.minutes == (40, 40) and r.difficulty == 1
    assert r.diet == "vegetarian"
    assert r.category == ""  # only an HTML comment in the source
    assert r.equipment == ["1 große Rührschüssel", "1 große Pfanne"]
    assert plain(r.ingredient_groups)[0]["items"][1] == "2 Dosen Gemüsemais"
    assert len(r.steps) == 3  # German pages use * bullets for steps


def test_german_vegan_category_and_range():
    r = parse_page(page("de_aioli.wiki", "Kochbuch/ Aioli"), SOURCES["de"])
    assert r.category == "Saucen"
    assert r.diet == "vegan"
    assert r.minutes == (20, 30)
    assert r.servings == (4, 4)
    assert r.image == "Aioli mit Oliven.jpg"
    assert r.description.startswith("Aioli (auch Allioli)")


def test_ingredient_groups_from_subheadings():
    wiki = """{{recipesummary|time=1 hour}}
== Ingredients ==
=== Dough ===
* 500 g flour
* 1 egg
=== Filling ===
* 200 g cheese
== Procedure ==
# Mix.
# Bake.
"""
    r = parse_page({**page("en_aadun.wiki", "Cookbook:Pie"), "content": wiki}, SOURCES["en"])
    assert [g["name"] for g in r.ingredient_groups] == ["Dough", "Filling"]
    assert plain(r.ingredient_groups)[0]["items"] == ["500 g flour", "1 egg"]
    assert r.steps == ["Mix.", "Bake."]


def _en(content: str):
    return parse_page({**page("en_aadun.wiki", "Cookbook:T"), "content": content}, SOURCES["en"])


def test_ingredient_table_with_groups():
    wiki = """== Ingredients ==
{| class="wikitable"
!Ingredient
!Count
!Volume
!Weight
!Baker's % (optional)
|-
| colspan="5" style="text-align: center;" |'''Dough'''
|-
|Water
|
|1½ [[Cookbook:Cup|cups]]
|375 [[Cookbook:Gram|g]]
|68.2%
|-
|Dry [[Cookbook:yeast|yeast]]
|1 sachet
|
|7 g
|1.3%
|-
|[[Cookbook:Salt|Salt]] || || 1 tablespoon || 18 g || 3.3%
|}
== Procedure ==
# Mix.
"""
    r = _en(wiki)
    assert plain(r.ingredient_groups) == [
        {"name": "Dough", "items": ["1½ cups (375 g) Water", "1 sachet (7 g) Dry yeast", "1 tablespoon (18 g) Salt"]}
    ]


def test_indented_ingredient_table():
    wiki = """==Ingredients==
:{| class="wikitable"
!Ingredient
!Count
!Volume
!Weight
|-
|[[Cookbook:Salt|Salt]]
|
|¾ [[Cookbook:Teaspoon|tsp]] (3.5 ml)
|
|-
|[[Cookbook:Egg yolk|Egg yolks]]
|12 [[Cookbook:Each|ea]].
|
|
|}
==Procedure==
# Mix.
"""
    assert plain(_en(wiki).ingredient_groups) == [{"name": None, "items": ["¾ tsp (3.5 ml) Salt", "12 ea. Egg yolks"]}]


def test_gallery_captions_become_steps():
    wiki = """== Ingredients ==
* 2 tbsp butter
== Procedure ==
<gallery mode="packed">
File:a.jpg|1. Mix marsala wine and water in a bowl.
File:b.jpg|2. Melt [[Cookbook:Butter|butter]] in a pan.
</gallery>
"""
    assert _en(wiki).steps == ["Mix marsala wine and water in a bowl.", "Melt butter in a pan."]


def test_sections_found_after_an_unclosed_table():
    wiki = """{| width="300px"
!colspan="2"|Überblick
|-
||Rezeptmenge für:
||2 Personen
== Zutaten ==
* 1 Salatgurke
* Salz und Pfeffer
== Zubereitung ==
Die Gurke waschen und in Scheiben hobeln.
"""
    r = parse_page({**page("de_aioli.wiki", "Kochbuch/ Gurkensalat"), "content": wiki}, SOURCES["de"])
    assert plain(r.ingredient_groups)[0]["items"] == ["1 Salatgurke", "Salz und Pfeffer"]
    assert r.steps == ["Die Gurke waschen und in Scheiben hobeln."]


def test_prose_method_under_the_ingredient_list():
    wiki = """== Zutaten ==
*500 g Mehl
*2 Eier

Mehl mit dem Kümmel mischen, Zucker, Eier und geschmolzene Butter dazugeben, alles zu einem Knetteig verarbeiten.
"""
    r = parse_page({**page("de_aioli.wiki", "Kochbuch/ Moppen"), "content": wiki}, SOURCES["de"])
    assert plain(r.ingredient_groups)[0]["items"] == ["500 g Mehl", "2 Eier"]
    assert r.steps[0].startswith("Mehl mit dem Kümmel")


def test_unnamed_first_list_is_the_ingredients():
    wiki = """== Grundrezept ==
* 3 Eier
* 1 Prise Salz
== Zubereitung ==
Zutaten werden verrührt.
== Quellen ==
* Ein Buch
"""
    r = parse_page({**page("de_aioli.wiki", "Kochbuch/ Omelette"), "content": wiki}, SOURCES["de"])
    assert plain(r.ingredient_groups) == [{"name": "Grundrezept", "items": ["3 Eier", "1 Prise Salz"]}]
    assert r.steps == ["Zutaten werden verrührt."]


def test_legends_labels_and_filler_in_ingredient_lists():
    wiki = """== Zutaten ==
* Kuchen:
* 200 g Mehl
* Streusel:
* 100 g Butter
* …
* g = Gramm
* EL = Esslöffel
== Zubereitung ==
* Backen.
"""
    r = parse_page({**page("de_aioli.wiki", "Kochbuch/ Streuselkuchen"), "content": wiki}, SOURCES["de"])
    assert plain(r.ingredient_groups) == [
        {"name": "Kuchen", "items": ["200 g Mehl"]},
        {"name": "Streusel", "items": ["100 g Butter"]},
    ]


def test_old_german_overview_box():
    wiki = """{| width="300px" align="right" border="1"
!colspan="2"|Überblick
|-
|Rezeptmenge für:
|4 Personen
|-
|Energiegehalt:
|?? kcal/?? kJ
|-
|Zeitbedarf:
|35 Minuten
|-
|Schwierigkeitsgrad:
|[[Bild:2v5.gif|Problemlos]]
|}
'''Auberginensalat''' ist eine leckere mediterrane Salatvariante für Frühling und Sommer.

== Zutaten ==
* 4 Auberginen
== Zubereitung ==
# Die Auberginen putzen.
"""
    r = parse_page({**page("de_aioli.wiki", "Kochbuch/ Auberginensalat"), "content": wiki}, SOURCES["de"])
    assert r.servings == (4, 4) and r.minutes == (35, 35) and r.difficulty == 2
    assert r.description == "Auberginensalat ist eine leckere mediterrane Salatvariante für Frühling und Sommer."


def test_long_ingredient_lines_move_to_notes():
    note = "If cultured buttermilk is not available, similar results can be obtained by mixing lemon juice " \
           "with enough milk to make 1 cup, and letting it stand for ten minutes before using it in the dough."
    r = _en(f"== Ingredients ==\n* 2 cups flour\n* {note}\n== Procedure ==\n# Bake.\n")
    assert plain(r.ingredient_groups)[0]["items"] == ["2 cups flour"]
    assert r.notes == [note]


def test_user_drafts_are_not_in_the_cookbook():
    with pytest.raises(Dropped) as e:
        parse_page(page("en_stroganoff.wiki", "User:Someone/Banga stew"), SOURCES["en"])
    assert e.value.reason == "not_in_cookbook"


def test_policy_pages_are_not_recipes():
    with pytest.raises(Dropped) as e:
        parse_page({**page("en_stroganoff.wiki", "Cookbook:Policy/Recipe template")}, SOURCES["en"])
    assert e.value.reason == "not_a_recipe"


def test_german_category_and_cuisine_from_wiki_categories():
    p = {**page("de_maispuffer.wiki", "Kochbuch/ Maispuffer"),
         "categories": ["Kategorie:Kochbuch/ Alle Rezepte", "Kategorie:Kochbuch/ Deutsche Küche",
                        "Kategorie:Kochbuch/ Gebäck und Kuchen"]}
    r = parse_page(p, SOURCES["de"])
    assert r.category == "Gebäck und Kuchen"
    assert r.cuisine == "Deutsche Küche"


@pytest.mark.parametrize(
    "content, reason",
    [
        ("", "empty"),
        ("#REDIRECT [[Cookbook:Other]]", "redirect"),
        ("#WEITERLEITUNG [[Kochbuch/ X]]", "redirect"),
        ("Some text.\n== Procedure ==\n# Do it.", "no_ingredients"),
        ("== Ingredients ==\n* 1 egg\n", "no_steps"),
    ],
)
def test_dropped_with_reason(content, reason):
    with pytest.raises(Dropped) as e:
        parse_page({**page("en_aadun.wiki", "Cookbook:X"), "content": content}, SOURCES["en"])
    assert e.value.reason == reason

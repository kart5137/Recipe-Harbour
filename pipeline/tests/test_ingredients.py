import pytest

from rh_pipeline.ingredients import (
    Parsed,
    enrich_recipe,
    infer_diet,
    load_vocab,
    match_line,
    norm,
    parse_quantity,
    vocab,
)


def ids(text, lang="en", links=None):
    return match_line(text, lang, links).ids


# ------------------------------------------------------------------ vocabulary
def test_vocabulary_is_consistent():
    v = load_vocab()  # raises on duplicate ids, unknown parents, or a name shared by two ids
    assert len(v.items) > 250
    # every id has an English and a German name
    missing = [i.id for i in v.items.values() if not i.en or not i.de]
    assert missing == []


def test_vocabulary_flags_are_explicit():
    """Diet flags are not inherited, so a child must repeat a parent's animal flags."""
    v = vocab()
    animal = {"meat", "fish", "gelatin", "dairy", "egg", "honey"}
    for item in v.items.values():
        inherited = set().union(*(v.flags(a) for a in v.ancestors(item.id))) & animal
        assert inherited <= set(item.flags), f"{item.id} lacks {inherited - set(item.flags)}"


def test_ancestors():
    v = vocab()
    assert v.ancestors("olive_oil") == {"oil"}
    assert v.ancestors("ground_beef") >= {"beef", "ground_meat", "meat"}


def test_norm_handles_umlauts_and_accents():
    assert norm("Möhren") == norm("Moehren") == "moehren"
    assert norm("Eßlöffel") == "essloeffel"
    assert norm("Jalapeño-Crème") == "jalapeno creme"


# ------------------------------------------------------------------ matching (gold lines)
@pytest.mark.parametrize(
    "text, lang, expected",
    [
        # English
        ("2 cups finely chopped onions", "en", ["onion"]),
        ("1 teaspoon olive oil", "en", ["olive_oil"]),
        ("salt and pepper to taste", "en", ["salt", "black_pepper"]),
        ("2 tbsp margarine or butter", "en", ["margarine", "butter"]),
        ("2 cloves garlic, minced", "en", ["garlic"]),
        ("3 tablespoons peanut butter", "en", ["peanut_butter"]),
        ("1 cup sour cream", "en", ["sour_cream"]),
        ("½ cup crushed red pepper flakes", "en", ["chili_flakes"]),
        ("1 large green bell pepper, seeded, diced and with the white pith from the inside", "en", ["bell_pepper"]),
        ("1 teaspoon smoked paprika", "en", ["paprika"]),
        ("1000 g full-fat curd cheese (e.g. quark, pot cheese, or farmer cheese)", "en", ["quark"]),
        ("Wonton wrappers, or egg roll wrappers cut into quarters", "en", ["pastry"]),
        ("3 duck egg yolks (chicken egg yolks will work too)", "en", ["egg_yolk"]),
        ("Chopped tomatoes and cilantro", "en", ["tomato", "coriander"]),
        ("1 can diced tomatoes", "en", ["canned_tomato"]),
        ("2 tbsp apple cider vinegar", "en", ["cider_vinegar"]),
        ("1 cup ice cream", "en", ["ice_cream"]),
        ("4 cups chicken stock", "en", ["chicken_broth"]),
        ("1 pound 80/20 ground chuck", "en", ["ground_beef"]),
        ("2 tomatoes", "en", ["tomato"]),
        ("3 potatoes, peeled", "en", ["potato"]),
        ("1 cup blueberries", "en", ["blueberry"]),
        ("10 hickory chunks, soaked", "en", ["non_food"]),
        # German
        ("500 g Zwiebeln, gewürfelt", "de", ["onion"]),
        ("2 Dosen Gemüsemais", "de", ["corn"]),
        ("3 Knoblauchzehen", "de", ["garlic"]),
        ("1 TL Paprikapulver edelsüß", "de", ["paprika"]),
        ("2 rote Paprika", "de", ["bell_pepper"]),
        ("1 EL Kümmel", "de", ["caraway"]),
        ("1 TL Kreuzkümmel", "de", ["cumin"]),
        ("1 Tüte geriebener Emmentaler (ca. 200 g)", "de", ["emmental"]),
        ("200 g Möhren", "de", ["carrot"]),
        ("200 g Moehren", "de", ["carrot"]),
        ("1 Becher saure Sahne", "de", ["sour_cream"]),
        ("250 g Rinderhackfleisch", "de", ["ground_beef"]),
        ("Salz und Pfeffer", "de", ["salt", "black_pepper"]),
        ("1 Pck. Vanillezucker", "de", ["vanilla_sugar"]),
        ("Streusel:", "de", []),
        ("1 Glas Maiskölbchen (netto ca. 200 g)", "de", ["corn"]),
        ("700 g Huhn, Lamm oder anderes Fleisch in groben Würfeln", "de", ["chicken", "lamb"]),
        ("2 EL Weizenvollkornmehl", "de", ["whole_wheat_flour"]),
        ("1 Stange Lauch", "de", ["leek"]),
        # from the second (unseen) audit
        ("Juice of ½ lime", "en", ["lime"]),
        ("14 oz (400 g) can of tomatoes with juice", "en", ["tomato"]),
        ("Hot pepper sauce (optional)", "en", ["hot_sauce"]),
        ("Grated rind of 1 orange", "en", ["orange"]),
        ("12 wheat flour tortillas, each cut into 10 wedges", "en", ["tortilla"]),
        ("Fat, for deep frying", "en", ["oil"]),
        ("1 Kaffeelöffel Kartoffelmehl", "de", ["cornstarch"]),
        ("3-5 Suppenknochen (Sandknochen und Markknochen gemischt)", "de", ["beef"]),
        ("2 EL Wasser oder Kondensmilch", "de", ["water", "evaporated_milk"]),
    ],
)
def test_match(text, lang, expected):
    assert ids(text, lang) == expected


def test_links_are_only_a_fallback():
    # The text finds bell pepper; the link to "Pepper" must not add black pepper.
    assert ids("1 green bell pepper", links=["Bell Pepper", "Pepper"]) == ["bell_pepper"]
    # Nothing in the text: the link decides.
    assert ids("1 cup of the house mix", links=["Onion"]) == ["onion"]


def test_alternatives_and_optional():
    p = match_line("2 tbsp margarine or butter", "en")
    assert p.alternatives
    assert match_line("1 tsp chili flakes (optional)", "en").optional
    assert not match_line("salt and pepper", "en").alternatives


# ------------------------------------------------------------------ quantities
@pytest.mark.parametrize(
    "text, qty, unit",
    [
        ("2 cups flour", (2, 2), "cup"),
        ("1 ½ cups flour", (1.5, 1.5), "cup"),
        ("1 1/2 tsp vanilla", (1.5, 1.5), "tsp"),
        ("¾ cup sugar", (0.75, 0.75), "cup"),
        ("2-3 cloves garlic", (2, 3), None),
        ("1 to 2 tablespoons oil", (1, 2), "tbsp"),
        ("500 g Mehl", (500, 500), "g"),
        ("1.500 g saure Äpfel", (1500, 1500), "g"),
        ("0,5 l Milch", (0.5, 0.5), "l"),
        ("1–2 EL Butter", (1, 2), "tbsp"),
        ("3 Päck Backpulver", (3, 3), "packet"),
        ("1 pack of lasagne sheets", (1, 1), "packet"),
        ("ca. 8 Knoblauchzehen", (8, 8), None),
        ("eine Prise Salz", (1, 1), "pinch"),
        ("2 large eggs", (2, 2), None),
        ("1 gestrichener TL Zucker", (1, 1), "tsp"),
        ("Salt to taste", None, None),
    ],
)
def test_parse_quantity(text, qty, unit):
    q, u = parse_quantity(text)
    assert (tuple(round(x, 3) for x in q) if q else None) == qty
    assert u == unit


# ------------------------------------------------------------------ diet
def P(*ids_, optional=False, alt=False):
    return Parsed(text="x", ids=list(ids_), optional=optional, alternatives=alt)


@pytest.mark.parametrize(
    "lines, diet",
    [
        ([P("flour"), P("sugar"), P("oil")], "vegan"),
        ([P("flour"), P("butter"), P("egg")], "vegetarian"),
        ([P("pasta"), P("bacon")], "none"),
        ([P("salad"), P("worcestershire")] if False else [P("lettuce"), P("worcestershire")], "none"),
        ([P("rice"), P()], ""),  # an unknown line could be anything
        ([P("rice"), P(optional=True)], "vegan"),  # unknown but optional: ignored
        ([P("rice"), P("broth")], ""),  # generic broth: unknown
        ([P("rice"), P("vegetable_broth")], "vegan"),
        ([P("pasta"), P("margarine", "butter", alt=True)], "vegan"),  # either works: margarine is vegan
        ([P("marshmallow")], "none"),  # gelatin
        ([P("bread"), P("honey")], "vegetarian"),
        ([P("non_food"), P("potato")], "vegan"),
        # every alternative is meat or fish -> not vegetarian
        ([P("rice"), P("chicken", "beef", "fish", alt=True)], "none"),
        # a vegetable alternative is offered -> can be made vegan
        ([P("rice"), P("beef", "lamb", "vegetables", alt=True)], "vegan"),
        # optional meat does not make the recipe non-vegetarian
        ([P("cassava"), P("meat", "dried_fish", optional=True)], "vegan"),
        # "chicken broth or water"
        ([P("pasta"), P("chicken_broth", "water", alt=True), P("parmesan")], "vegetarian"),
    ],
)
def test_infer_diet(lines, diet):
    assert infer_diet(lines) == diet


# ------------------------------------------------------------------ recipe enrichment
def test_enrich_recipe_keeps_wiki_diet_and_excludes_non_food():
    rec = {
        "lang": "de",
        "diet": "vegetarian",
        "ingredient_groups": [
            {"name": None, "items": [{"text": "2 Eier", "links": []}, {"text": "Zahnstocher", "links": []}]}
        ],
    }
    out = enrich_recipe(rec)
    assert out["diet"] == "vegetarian" and out["diet_source"] == "wiki"
    assert out["ingredient_ids"] == ["egg"]  # non_food is understood but not searchable
    assert out["ingredient_groups"][0]["items"][0] == {
        "text": "2 Eier", "ids": ["egg"], "qty": [2.0, 2.0], "unit": None, "optional": False, "alt": False,
    }


def test_enrich_recipe_infers_diet():
    rec = {"lang": "en", "diet": "", "ingredient_groups": [
        {"name": None, "items": [{"text": "200 g pasta", "links": []}, {"text": "1 cup grated parmesan", "links": []}]}
    ]}
    out = enrich_recipe(rec)
    assert out["diet"] == "vegetarian" and out["diet_source"] == "inferred"

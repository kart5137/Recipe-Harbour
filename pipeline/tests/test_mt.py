import json

from rh_pipeline.mt import Translator, load, plain_fractions, sentences, suspect


def test_sentences_split_only_after_words():
    assert sentences("Zwiebeln z. B. rote verwenden. Dann ca. 5 Min. kochen. Fertig!") == [
        "Zwiebeln z. B. rote verwenden.",
        "Dann ca. 5 Min. kochen.",
        "Fertig!",
    ]
    assert sentences("1. Mix. 2. Bake.") == ["1. Mix. 2. Bake."]
    assert sentences("Add sugar, etc. Then serve.") == ["Add sugar, etc. Then serve."]
    assert sentences("  ") == []


def test_suspect_flags_empty_output_and_dropped_numbers():
    assert suspect("Salz", "")
    assert suspect("1 can (8 ounces) diced tomatoes", "1 Dose gewürfelte Tomaten")
    assert not suspect("½ tsp salt", "1/2 TL Salz")
    assert not suspect("Fry the onion.", "Die Zwiebel anbraten.")
    assert suspect("⅔ cup long-grain rice", "Tasse Langkornreis")
    assert suspect("a rope ½ inch thick", "ein Seil von 30 cm Dicke")  # a number the source lacks


def test_suspect_allows_dropping_the_imperial_half_of_a_metric_amount():
    assert not suspect("1 lb (500 g) egg whites", "500 g Eiweiß")
    assert not suspect("Preheat the oven to 350°F (175°C).", "Den Backofen auf 175 °C vorheizen.")
    assert not suspect("1½ cups (250 g/8.8 oz) flour", "1 ½ Tassen (250 g) Mehl")
    assert not suspect("Cut into .5 cm rounds.", "In 0,5 cm dicke Scheiben schneiden.")
    assert suspect("2 cans (30 oz) beans", "2 Dosen Bohnen")  # no metric amount left
    assert suspect("175 g (6 oz) butter", "Butter")


def test_plain_fractions():
    assert plain_fractions("1½ cups, ⅔ cup") == "1 1/2 cups, 2/3 cup"


def test_translator_rebuilds_texts_and_keeps_untranslated_sentences(tmp_path):
    path = tmp_path / "t.jsonl"
    rows = [
        {"lang": "en", "src": "Fry the onion.", "dst": "Die Zwiebel anbraten."},
        {"lang": "en", "src": "Serve hot.", "dst": "wrong"},
        {"lang": "en", "src": "Serve hot.", "dst": "Heiß servieren."},  # a later row replaces the first
        {"lang": "en", "src": "Onion soup", "dst": "Zwiebelsuppe"},
    ]
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    tr = Translator(load(path))
    assert tr.text("Fry the onion. Serve hot.", "en") == "Die Zwiebel anbraten. Heiß servieren."
    assert tr.text("Fry the onion. Stir well.", "en") == "Die Zwiebel anbraten. Stir well."
    assert tr.missing == 1
    page = tr.recipe({
        "lang": "en", "title": "Onion soup", "ingredient_groups": [{"name": None, "items": [{"text": "Serve hot."}]}],
        "steps": ["Fry the onion."],
    })
    assert page["title"] == "Zwiebelsuppe"
    assert page["groups"] == [{"name": None, "items": ["Heiß servieren."]}]
    assert page["steps"] == ["Die Zwiebel anbraten."]


def test_bullet_for_a_fraction_is_suspect_and_spaced_fractions_are_tidied(tmp_path):
    assert suspect("⅓ cup (160 ml) white wine", "• Tasse (160 ml) Weißwein")
    path = tmp_path / "t.jsonl"
    row = {"lang": "en", "src": "½ cup milk", "dst": "1 / 2 Tasse Milch"}
    path.write_text(json.dumps(row) + "\n", encoding="utf-8")
    assert Translator(load(path)).text("½ cup milk", "en") == "1/2 Tasse Milch"

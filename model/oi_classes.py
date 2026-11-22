"""Produce classes taken from Open Images V7, mapped to Recipe Harbour ingredient ids.

Only real photos are used (IsDepiction == 0), from images whose own metadata says
CC BY 2.0 (Google asks users to verify each image's licence).
"""

OI_CLASSES: dict[str, str] = {
    # Open Images LabelName: ingredient id
    "/m/07j87": "tomato",
    "/m/09qck": "banana",
    "/m/014j1m": "apple",
    "/m/0fj52s": "carrot",
    "/m/0hkxq": "broccoli",
    "/m/0cyhj_": "orange",
    "/m/05vtc": "potato",
    "/m/015x4r": "cucumber",
    "/m/0jg57": "bell_pepper",
    "/m/07fbm7": "strawberry",
    "/m/05zsy": "pumpkin",
    "/m/027pcv": "zucchini",
    "/m/052sf": "mushroom",
    "/m/0fbw6": "cabbage",
    "/m/0388q": "grapes",
    "/m/0fp6w": "pineapple",
    "/m/0dj6p": "peach",
    "/m/061_f": "pear",
    "/m/0fldg": "mango",
    "/m/0jwn_": "pomegranate",
    "/m/0kpqd": "melon",  # watermelon
    "/m/0kpt_": "melon",  # cantaloupe
    "/m/0djtd": "coconut",
    "/m/043nyj": "fig",
    "/m/015x5n": "radish",
}

CC_BY_2 = "https://creativecommons.org/licenses/by/2.0/"
MIN_BOX = 0.05  # box at least 5 % of the image in both directions

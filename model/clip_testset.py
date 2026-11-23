"""Second test set for the photo model: whole Open Images photos with a human-verified label.

The boxed crops (prepare_data.py) only exist for 24 produce classes. Open Images also has
image-level labels that people verified, for many more: onion, garlic, ginger, lettuce, ...
This takes test and validation photos (never used for training) where exactly one of our
produce ingredients is verified as present, CC BY 2.0 and not rotated, up to PER_CLASS per
ingredient, and stores them at 384 px on the short side.

These are whole photos, often with other things in them, so they are harder than a phone
photo of one item held up to the camera. Treat the numbers as a lower bound.

Run: .venv-clip/Scripts/python model/clip_testset.py
"""

from __future__ import annotations

import csv
import io
import random
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OI = ROOT / "data" / "oi"
OUT = ROOT / "data" / "whole"
PER_CLASS = 30
CC_BY_2 = "https://creativecommons.org/licenses/by/2.0/"
UA = "RecipeHarbour-model-eval/1.0"

# Open Images class name -> ingredient id (only produce the app might be shown).
OI_IMAGE_CLASSES: dict[str, str] = {
    "Apple": "apple", "Apricot": "apricot", "Artichoke": "artichoke", "Asparagus": "asparagus",
    "Garden Asparagus": "asparagus", "Avocado": "avocado", "Banana": "banana", "Basil": "basil",
    "Beet": "beet", "Beetroot": "beet", "Bell pepper": "bell_pepper", "Blueberry": "blueberry",
    "Broccoli": "broccoli", "Brussels sprout": "brussels_sprouts", "Butternut squash": "pumpkin",
    "Cabbage": "cabbage", "Cantaloupe": "melon", "Carrot": "carrot", "Cauliflower": "cauliflower",
    "Celeriac": "celeriac", "Celery": "celery", "Cherry": "cherry", "Cherry tomato": "tomato",
    "Chili pepper": "chili_pepper", "Jalapeño": "chili_pepper", "Coconut": "coconut",
    "Coriander": "coriander", "Corn": "corn", "Sweet corn": "corn", "Cucumber": "cucumber",
    "Eggplant": "eggplant", "Fennel": "fennel", "Fig": "fig", "Common fig": "fig",
    "Garlic": "garlic", "Ginger": "ginger", "Grape": "grapes", "Green bean": "green_beans",
    "Kale": "kale", "Chard": "kale", "Kiwifruit": "kiwi", "Kohlrabi": "kohlrabi", "Leek": "leek",
    "Lettuce": "lettuce", "Arugula": "lettuce", "Mandarin orange": "orange", "Tangerine": "orange",
    "Mango": "mango", "Melon": "melon", "Watermelon": "melon", "Mushroom": "mushroom",
    "Okra": "okra", "Onion": "onion", "Red onion": "red_onion", "Shallot": "shallot",
    "Scallion": "green_onion", "Papaya": "papaya", "Guava": "papaya", "Lychee": "papaya",
    "Passion fruit": "papaya", "Parsley": "parsley", "Pea": "peas", "Peach": "peach",
    "Pear": "pear", "Pineapple": "pineapple", "Pomegranate": "pomegranate", "Potato": "potato",
    "Pumpkin": "pumpkin", "Radish": "radish", "Daikon": "radish", "Turnip": "radish",
    "Parsnip": "radish", "Raspberry": "raspberry", "Red cabbage": "red_cabbage",
    "Rhubarb": "rhubarb", "Spinach": "spinach", "Strawberry": "strawberry",
    "Sweet potato": "sweet_potato", "Tomato": "tomato", "Zucchini": "zucchini",
    "Key lime": "lime", "Persian lime": "lime", "Cranberry": "berries", "Currant": "berries",
    "Gooseberry": "berries", "Dill": "dill", "Rosemary": "rosemary", "Thyme": "thyme",
    "Lemongrass": "lemongrass", "Taro": "yam", "Yam": "yam",
}
# Labels that also count as one ingredient when they appear together (a red onion is an onion).
SAME = {frozenset({"onion", "red_onion"}), frozenset({"onion", "shallot"})}


def rows(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


def main() -> None:
    names = {r["LabelName"]: r["DisplayName"] for r in rows(OI / "oidv7-class-descriptions.csv")}
    mid_to_id = {mid: OI_IMAGE_CLASSES[n] for mid, n in names.items() if n in OI_IMAGE_CLASSES}
    missing = set(OI_IMAGE_CLASSES) - set(names.values())
    if missing:
        sys.exit(f"class names not found: {sorted(missing)}")

    meta: dict[str, tuple[str, dict]] = {}
    for split, f in (("test", "test-images-with-rotation.csv"), ("validation", "validation-images-with-rotation.csv")):
        for r in rows(OI / f):
            if r["License"] == CC_BY_2 and r["Rotation"] in ("", "0.0", "0"):
                meta[r["ImageID"]] = (split, r)

    pos: dict[str, set[str]] = defaultdict(set)
    for f in ("oidv7-test-annotations-human-imagelabels.csv", "oidv7-val-annotations-human-imagelabels.csv"):
        for r in rows(OI / f):
            if r["Confidence"] == "1" and r["LabelName"] in mid_to_id:
                pos[r["ImageID"]].add(mid_to_id[r["LabelName"]])

    by_class: dict[str, list[str]] = defaultdict(list)
    for image_id, ids in pos.items():
        if image_id not in meta:
            continue
        if len(ids) == 2 and frozenset(ids) in SAME:
            ids = {"red_onion"} if "red_onion" in ids else {"shallot"}
        if len(ids) == 1:
            by_class[next(iter(ids))].append(image_id)

    rng = random.Random(7)
    chosen = []
    for cls, ids in sorted(by_class.items()):
        ids.sort()
        rng.shuffle(ids)
        chosen += [(cls, i) for i in ids[: PER_CLASS * 2]]  # spares for failed downloads

    def work(item: tuple[str, str]):
        cls, image_id = item
        dest = OUT / cls / f"{image_id}.jpg"
        if dest.exists():
            return cls, image_id, True
        split, _ = meta[image_id]
        try:
            req = urllib.request.Request(f"https://open-images-dataset.s3.amazonaws.com/{split}/{image_id}.jpg", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as resp:
                img = Image.open(io.BytesIO(resp.read())).convert("RGB")
        except (OSError, ValueError):  # network errors, missing or broken images
            return cls, image_id, False
        s = 384 / min(img.size)
        if s < 1:
            img = img.resize((round(img.width * s), round(img.height * s)), Image.Resampling.BICUBIC)
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, quality=90)
        return cls, image_id, True

    done: dict[str, list[str]] = defaultdict(list)
    # Download in class order, stopping a class once it has PER_CLASS photos.
    todo = [c for c in chosen]
    with ThreadPoolExecutor(16) as ex:
        while todo:
            batch = []
            for cls, i in todo:
                if len(done[cls]) + sum(1 for c, _ in batch if c == cls) < PER_CLASS:
                    batch.append((cls, i))
            if not batch:
                break
            todo = [t for t in todo if t not in batch]
            for cls, image_id, ok in ex.map(work, batch):
                if ok:
                    done[cls].append(image_id)
    # Remove spares that were downloaded beyond the cap (none expected) and write the credits.
    with (ROOT / "data" / "whole.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["path", "cls", "image", "author", "author_url", "title", "source_url", "license"])
        for cls in sorted(done):
            for image_id in sorted(done[cls])[:PER_CLASS]:
                m = meta[image_id][1]
                w.writerow([f"whole/{cls}/{image_id}.jpg", cls, image_id, m["Author"], m["AuthorProfileURL"], m["Title"], m["OriginalLandingURL"], m["License"]])
    for cls in sorted(by_class):
        print(f"{cls:18} available {len(by_class[cls]):5}  used {min(len(done[cls]), PER_CLASS)}")


if __name__ == "__main__":
    main()

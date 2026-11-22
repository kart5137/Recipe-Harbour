"""Build the training set for the produce classifier.

Sources (licences checked 2026-11-22, see docs/model/MODEL_CARD.md):
- Open Images V7 validation+test boxes, real photos, images CC BY 2.0 (verified per image),
  annotations CC BY 4.0. Cropped around each box. Split by IMAGE so no photo is in two splits.
- Fruits-360 (GitHub fruits-360/fruits-360-100x100), CC BY-SA 4.0, lab photos on white.
  Training split only: the test set is real photos only.

Writes model/data/crops/<split>/<class>/<name>.jpg, model/data/manifest.csv and
model/data/oi_attribution.csv (author and source of every Open Images photo used).

usage: python model/prepare_data.py [--max-train 500] [--max-test 200] [--f360-per-class 250]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import random
import subprocess
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from oi_classes import CC_BY_2, MIN_BOX, OI_CLASSES  # noqa: E402

DATA = HERE / "data"
OI = DATA / "oi"
CROPS = DATA / "crops"
SIZE = 224
UA = "RecipeHarbour-model/0.1 (open-source recipe app; dataset preparation)"

F360_REPO = "https://github.com/fruits-360/fruits-360-100x100.git"
F360_FOLDERS: dict[str, list[str]] = {
    "apple": ["Apple Braeburn 1", "Apple Crimson Snow 1", "Apple Golden 1", "Apple Granny Smith 1",
              "Apple Pink Lady 1", "Apple Red 1", "Apple Red Delicious 1", "Apple Red Yellow 1"],
    "banana": ["Banana 1", "Banana 2", "Banana Lady Finger 1", "Banana Red 1"],
    "cabbage": ["Cabbage red 1", "Cabbage white 1"],
    "carrot": ["Carrot 1"],
    "coconut": ["Cocos 1"],
    "cucumber": ["Cucumber 1", "Cucumber 3", "Cucumber 5", "Cucumber 9"],
    "fig": ["Fig 1"],
    "grapes": ["Grape Blue 1", "Grape Pink 1", "Grape White 1", "Grape White 3"],
    "mango": ["Mango 1", "Mango Red 1"],
    "melon": ["Melon Piel de Sapo 1", "Watermelon 1"],
    "mushroom": ["Mushroom champignon 1", "Mushroom champignon 3"],
    "orange": ["Orange 1", "Orange 2", "Orange peeled 1"],
    "peach": ["Peach 1", "Peach 2", "Peach Flat 1"],
    "pear": ["Pear 1", "Pear Abate 1", "Pear Forelle 1", "Pear Williams 1", "Pear Red 1"],
    "bell_pepper": ["Pepper Green 1", "Pepper Orange 1", "Pepper Red 1", "Pepper Yellow 1"],
    "pineapple": ["Pineapple 1", "Pineapple Mini 1"],
    "pomegranate": ["Pomegranate 1"],
    "potato": ["Potato Red 1", "Potato White 1"],
    "strawberry": ["Strawberry 1", "Strawberry 2", "Strawberry Wedge 1"],
    "tomato": ["Tomato 1", "Tomato 2", "Tomato 4", "Tomato Cherry Red 1", "Tomato Heart 1", "Tomato Yellow 1"],
    "zucchini": ["Zucchini 1", "Zucchini Green 1", "Zucchini dark 1"],
}


def split_of(image_id: str) -> str:
    """Deterministic split by image: 55 % train, 15 % val, 30 % test."""
    h = int(hashlib.md5(image_id.encode()).hexdigest(), 16) % 100
    return "train" if h < 55 else "val" if h < 70 else "test"


def select_boxes(max_per: dict[str, int]) -> tuple[list[dict], dict[str, dict]]:
    info: dict[str, dict] = {}
    for split in ("validation", "test"):
        with (OI / f"{split}-images-with-rotation.csv").open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                info[r["ImageID"]] = {**r, "oi_split": split}
    boxes = []
    for split in ("validation", "test"):
        with (OI / f"{split}-annotations-bbox.csv").open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                cls = OI_CLASSES.get(r["LabelName"])
                meta = info.get(r["ImageID"])
                if not cls or not meta or r["IsDepiction"] == "1" or meta["License"] != CC_BY_2:
                    continue
                if meta.get("Rotation") not in ("", "0", "0.0", None):
                    continue  # rotation semantics are ambiguous; skip rather than mis-crop
                x0, x1, y0, y1 = (float(r[k]) for k in ("XMin", "XMax", "YMin", "YMax"))
                if x1 - x0 < MIN_BOX or y1 - y0 < MIN_BOX:
                    continue
                boxes.append({"cls": cls, "image": r["ImageID"], "box": (x0, y0, x1, y1),
                              "split": split_of(r["ImageID"]), "group": r["IsGroupOf"] == "1"})
    rng = random.Random(7)
    rng.shuffle(boxes)
    picked, count = [], defaultdict(int)
    for b in boxes:
        k = (b["cls"], b["split"])
        if count[k] < max_per[b["split"]]:
            picked.append(b)
            count[k] += 1
    return picked, info


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def square_crop(img: Image.Image, box: tuple[float, float, float, float], margin: float = 0.1) -> Image.Image:
    w, h = img.size
    x0, y0, x1, y1 = box[0] * w, box[1] * h, box[2] * w, box[3] * h
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0) * (1 + 2 * margin)
    side = min(side, w, h)
    left = min(max(cx - side / 2, 0), w - side)
    top = min(max(cy - side / 2, 0), h - side)
    crop = img.crop((round(left), round(top), round(left + side), round(top + side)))
    return crop.resize((SIZE, SIZE), Image.BICUBIC)


def prepare_oi(max_train: int, max_val: int, max_test: int) -> tuple[list[dict], list[dict]]:
    boxes, info = select_boxes({"train": max_train, "val": max_val, "test": max_test})
    by_image: dict[str, list[dict]] = defaultdict(list)
    for b in boxes:
        by_image[b["image"]].append(b)
    print(f"Open Images: {len(boxes)} boxes from {len(by_image)} images", flush=True)

    rows, attribution, failed = [], [], 0

    def work(image_id: str) -> list[dict]:
        meta = info[image_id]
        out = []
        dest = [CROPS / b["split"] / b["cls"] / f"oi_{image_id}_{i}.jpg" for i, b in enumerate(by_image[image_id])]
        if not all(d.exists() for d in dest):
            raw = fetch(f"https://open-images-dataset.s3.amazonaws.com/{meta['oi_split']}/{image_id}.jpg")
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            for d, b in zip(dest, by_image[image_id], strict=True):
                d.parent.mkdir(parents=True, exist_ok=True)
                square_crop(img, b["box"]).save(d, quality=92)
        for d, b in zip(dest, by_image[image_id], strict=True):
            out.append({"path": d.relative_to(DATA).as_posix(), "cls": b["cls"], "split": b["split"],
                        "source": "openimages", "image": image_id, "group": int(b["group"])})
        return out

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(work, i): i for i in by_image}
        for n, fut in enumerate(as_completed(futures), 1):
            image_id = futures[fut]
            try:
                rows += fut.result()
                m = info[image_id]
                attribution.append({
                    "image": image_id, "author": m["Author"], "author_url": m["AuthorProfileURL"],
                    "title": m["Title"], "source_url": m["OriginalLandingURL"], "license": m["License"],
                })
            except Exception as e:  # noqa: BLE001 - one bad download must not stop the run
                failed += 1
                print(f"  skip {image_id}: {e}", flush=True)
            if n % 250 == 0:
                print(f"  {n}/{len(by_image)} images", flush=True)
    print(f"Open Images: {len(rows)} crops, {failed} images failed", flush=True)
    return rows, attribution


def prepare_f360(per_class: int) -> list[dict]:
    repo = DATA / "fruits-360"
    folders = sorted({f for fs in F360_FOLDERS.values() for f in fs})
    if not repo.exists():
        subprocess.run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", F360_REPO, str(repo)],
                       check=True)
    patterns = [f"Training/{f}/" for f in folders]
    subprocess.run(["git", "-C", str(repo), "sparse-checkout", "set", "--no-cone", *patterns], check=True)
    rows, rng = [], random.Random(11)
    for cls, fs in F360_FOLDERS.items():
        files = [p for f in fs for p in sorted((repo / "Training" / f).glob("*.jpg"))]
        rng.shuffle(files)
        for p in files[:per_class]:
            d = CROPS / "train" / cls / f"f360_{p.parent.name.replace(' ', '_')}_{p.name}"
            if not d.exists():
                d.parent.mkdir(parents=True, exist_ok=True)
                Image.open(p).convert("RGB").resize((SIZE, SIZE), Image.BICUBIC).save(d, quality=92)
            rows.append({"path": d.relative_to(DATA).as_posix(), "cls": cls, "split": "train",
                         "source": "fruits360", "image": p.parent.name + "/" + p.name, "group": 0})
    print(f"Fruits-360: {len(rows)} images", flush=True)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-train", type=int, default=500)
    ap.add_argument("--max-val", type=int, default=100)
    ap.add_argument("--max-test", type=int, default=200)
    ap.add_argument("--f360-per-class", type=int, default=250)
    a = ap.parse_args()
    oi_rows, attribution = prepare_oi(a.max_train, a.max_val, a.max_test)
    f360_rows = prepare_f360(a.f360_per_class)
    rows = sorted(oi_rows + f360_rows, key=lambda r: r["path"])
    with (DATA / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "cls", "split", "source", "image", "group"])
        w.writeheader()
        w.writerows(rows)
    with (DATA / "oi_attribution.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["image", "author", "author_url", "title", "source_url", "license"])
        w.writeheader()
        w.writerows(sorted(attribution, key=lambda r: r["image"]))
    counts = defaultdict(lambda: defaultdict(int))
    for r in rows:
        counts[r["cls"]][(r["split"], r["source"])] += 1
    print(f"{'class':12} {'train oi':>8} {'train f360':>10} {'val':>5} {'test':>5}")
    for cls in sorted(counts):
        c = counts[cls]
        print(f"{cls:12} {c[('train', 'openimages')]:8} {c[('train', 'fruits360')]:10} "
              f"{c[('val', 'openimages')]:5} {c[('test', 'openimages')]:5}")


if __name__ == "__main__":
    main()

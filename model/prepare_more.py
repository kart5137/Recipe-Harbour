"""Add real photos from the Open Images TRAIN split to the training set.

The validation and test sets are not touched, so results stay comparable with earlier runs.
Same rules as prepare_data.py: real photos only, CC BY 2.0 verified per image, no rotated
images; at most 2 boxes per photo for variety; boxes at least 10 % of the image.

usage: python model/prepare_more.py [--per-class 1200]
"""

from __future__ import annotations

import argparse
import csv
import io
import random
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from oi_classes import CC_BY_2, OI_CLASSES  # noqa: E402
from prepare_data import CROPS, DATA, OI, fetch, square_crop  # noqa: E402

MIN_BOX_TRAIN = 0.10
PER_IMAGE = 2


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=1200)
    a = ap.parse_args()

    print("reading image licences…", flush=True)
    info = {}
    with (OI / "train-images-boxable-with-rotation.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["License"] == CC_BY_2 and r.get("Rotation") in ("", "0", "0.0", None):
                info[r["ImageID"]] = r
    print(f"  {len(info)} CC BY 2.0 images without rotation", flush=True)

    print("scanning boxes…", flush=True)
    cand: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    with (OI / "oidv6-train-annotations-bbox.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            cls = OI_CLASSES.get(r["LabelName"])
            if not cls or r["IsDepiction"] == "1" or r["ImageID"] not in info:
                continue
            x0, x1, y0, y1 = (float(r[k]) for k in ("XMin", "XMax", "YMin", "YMax"))
            if x1 - x0 < MIN_BOX_TRAIN or y1 - y0 < MIN_BOX_TRAIN:
                continue
            cand[cls][r["ImageID"]].append(((x0, y0, x1, y1), r["IsGroupOf"] == "1"))

    rng = random.Random(23)
    picked: dict[str, list[tuple]] = defaultdict(list)  # image -> [(cls, box, group)]
    for cls, by_img in cand.items():
        imgs = list(by_img)
        rng.shuffle(imgs)
        n = 0
        for img in imgs:
            for box, group in by_img[img][:PER_IMAGE]:
                if n >= a.per_class:
                    break
                picked[img].append((cls, box, group))
                n += 1
        print(f"  {cls:12} {n:5} boxes (of {sum(len(v) for v in by_img.values())} available)", flush=True)
    print(f"downloading {len(picked)} images…", flush=True)

    rows, attribution, failed = [], [], 0

    def work(image_id: str) -> list[dict]:
        items = picked[image_id]
        dest = [CROPS / "train" / cls / f"oitr_{image_id}_{i}.jpg" for i, (cls, _, _) in enumerate(items)]
        if not all(d.exists() for d in dest):
            raw = fetch(f"https://open-images-dataset.s3.amazonaws.com/train/{image_id}.jpg")
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            for d, (_, box, _) in zip(dest, items, strict=True):
                d.parent.mkdir(parents=True, exist_ok=True)
                square_crop(img, box).save(d, quality=92)
        return [{"path": d.relative_to(DATA).as_posix(), "cls": cls, "split": "train", "source": "openimages",
                 "image": image_id, "group": int(group)} for d, (cls, _, group) in zip(dest, items, strict=True)]

    with ThreadPoolExecutor(max_workers=12) as ex:
        futures = {ex.submit(work, i): i for i in picked}
        for n, fut in enumerate(as_completed(futures), 1):
            image_id = futures[fut]
            try:
                rows += fut.result()
                m = info[image_id]
                attribution.append({
                    "image": image_id, "author": m["Author"], "author_url": m["AuthorProfileURL"],
                    "title": m["Title"], "source_url": m["OriginalLandingURL"], "license": m["License"],
                })
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  skip {image_id}: {e}", flush=True)
            if n % 1000 == 0:
                print(f"  {n}/{len(picked)} images", flush=True)
    print(f"added {len(rows)} crops from {len(picked) - failed} photos ({failed} failed)", flush=True)

    # Merge into the manifest and the attribution list (replacing earlier train-split rows).
    with (DATA / "manifest.csv").open(encoding="utf-8") as f:
        old = [r for r in csv.DictReader(f) if not r["path"].split("/")[-1].startswith("oitr_")]
    with (DATA / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "cls", "split", "source", "image", "group"])
        w.writeheader()
        w.writerows(sorted(old + rows, key=lambda r: r["path"]))
    with (DATA / "oi_attribution.csv").open(encoding="utf-8") as f:
        prev = {r["image"]: r for r in csv.DictReader(f)}
    prev.update({r["image"]: r for r in attribution})
    with (DATA / "oi_attribution.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["image", "author", "author_url", "title", "source_url", "license"])
        w.writeheader()
        w.writerows(sorted(prev.values(), key=lambda r: r["image"]))


if __name__ == "__main__":
    main()

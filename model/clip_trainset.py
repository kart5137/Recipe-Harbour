"""Training photos for the photo model's ingredient head (whole Open Images train photos).

Same rules as clip_testset.py: one human-verified produce ingredient per photo, CC BY 2.0
in the photo's own metadata, not rotated. Up to PER_CLASS per ingredient, stored at 256 px
on the short side. The train split never overlaps the test and validation photos.

Needs the filtered label files data/oi/train-produce-labels.csv and train-produce-meta.csv.
The full lists are 2.7 GB each, so they are streamed and only produce rows kept (Git Bash, in
model/data/oi/, with produce-mids.txt = the Open Images ids of OI_IMAGE_CLASSES, one per line):

  curl -s https://storage.googleapis.com/openimages/v7/oidv7-train-annotations-human-imagelabels.csv     | awk -F, 'NR==FNR{m[$1]=1;next} FNR==1 || (($3 in m) && $4==1)' produce-mids.txt - > train-produce-labels.csv
  cut -d, -f1 train-produce-labels.csv | sort -u > train-produce-ids.txt
  curl -s https://storage.googleapis.com/openimages/v6/oidv6-train-images-with-labels-with-rotation.csv     | awk -F, 'NR==FNR{m[$1]=1;next} FNR==1 || ($1 in m)' train-produce-ids.txt - > train-produce-meta.csv

Run: .venv-clip/Scripts/python model/clip_trainset.py
"""

from __future__ import annotations

import csv
import io
import random
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from clip_testset import CC_BY_2, OI_IMAGE_CLASSES, SAME, UA
from PIL import Image

ROOT = Path(__file__).resolve().parent
OI = ROOT / "data" / "oi"
OUT = ROOT / "data" / "wholetrain"
PER_CLASS = 400


def main() -> None:
    with (OI / "oidv7-class-descriptions.csv").open(encoding="utf-8") as f:
        names = {r["LabelName"]: r["DisplayName"] for r in csv.DictReader(f)}
    mid_to_id = {m: OI_IMAGE_CLASSES[n] for m, n in names.items() if n in OI_IMAGE_CLASSES}

    meta = {}
    with (OI / "train-produce-meta.csv").open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["License"] == CC_BY_2 and r["Rotation"] in ("", "0.0", "0"):
                meta[r["ImageID"]] = r

    pos: dict[str, set[str]] = defaultdict(set)
    with (OI / "train-produce-labels.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pos[r["ImageID"]].add(mid_to_id[r["LabelName"]])

    by_class: dict[str, list[str]] = defaultdict(list)
    for image_id, ids in pos.items():
        if image_id not in meta:
            continue
        if len(ids) == 2 and frozenset(ids) in SAME:
            ids = {"red_onion"} if "red_onion" in ids else {"shallot"}
        if len(ids) == 1:
            by_class[next(iter(ids))].append(image_id)

    rng = random.Random(11)
    todo = []
    for cls, ids in sorted(by_class.items()):
        ids.sort()
        rng.shuffle(ids)
        todo += [(cls, i) for i in ids[:PER_CLASS]]

    def work(item):
        cls, image_id = item
        dest = OUT / cls / f"{image_id}.jpg"
        if not dest.exists():
            try:
                req = urllib.request.Request(f"https://open-images-dataset.s3.amazonaws.com/train/{image_id}.jpg", headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    img = Image.open(io.BytesIO(resp.read())).convert("RGB")
            except (OSError, ValueError):  # network errors, missing or broken images
                return None
            s = 256 / min(img.size)
            if s < 1:
                img = img.resize((round(img.width * s), round(img.height * s)), Image.Resampling.BICUBIC)
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, quality=88)
        return cls, image_id

    with ThreadPoolExecutor(8) as ex:
        done = [r for r in ex.map(work, todo) if r]

    with (ROOT / "data" / "wholetrain.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["path", "cls", "image", "author", "author_url", "title", "source_url", "license"])
        for cls, image_id in sorted(done):
            m = meta[image_id]
            w.writerow([f"wholetrain/{cls}/{image_id}.jpg", cls, image_id, m["Author"], m["AuthorProfileURL"], m["Title"], m["OriginalLandingURL"], m["License"]])
    counts = defaultdict(int)
    for cls, _ in done:
        counts[cls] += 1
    for cls in sorted(by_class):
        print(f"{cls:18} available {len(by_class[cls]):6}  used {counts[cls]}")


if __name__ == "__main__":
    main()

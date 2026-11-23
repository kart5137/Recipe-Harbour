"""Compare zero-shot image-text models for the photo feature.

The model sees a photo and every produce ingredient in the vocabulary (as text) and picks the
closest. Nothing is trained, so it covers ingredients without training photos too.

Test sets (neither was ever used for training):
- crops: the 2,205 Open Images box crops from the R6 model card (24 classes)
- whole: whole Open Images photos with one human-verified produce label (clip_testset.py)

Each ingredient has a few visual names ("radish" also covers turnip and parsnip). Its score is
the best of its names; each name's text vector is the mean over PROMPTS.

Run: .venv-clip/Scripts/python model/clip_eval.py [model ...]
Writes model/runs/clip/<model>.json and caches image vectors in model/runs/clip/cache/.
"""

from __future__ import annotations

import csv
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RUNS = ROOT / "runs" / "clip"

# ingredient id -> names a photo of it might be described by (English, singular/plural as people say it)
PRODUCE: dict[str, list[str]] = {
    "onion": ["onion", "onions", "yellow onion", "white onion"],
    "red_onion": ["red onion", "red onions"],
    "green_onion": ["spring onions", "scallions"],
    "shallot": ["shallots"],
    "leek": ["leek", "leeks"],
    "garlic": ["garlic", "garlic bulb", "garlic cloves"],
    "ginger": ["ginger root", "fresh ginger"],
    "tomato": ["tomato", "tomatoes", "cherry tomatoes"],
    "potato": ["potato", "potatoes"],
    "sweet_potato": ["sweet potato", "sweet potatoes"],
    "carrot": ["carrot", "carrots"],
    "celery": ["celery", "celery stalks"],
    "celeriac": ["celeriac", "celery root"],
    "bell_pepper": ["bell pepper", "bell peppers", "red bell pepper", "green bell pepper"],
    "chili_pepper": ["chili peppers", "chilies", "jalapeño peppers"],
    "cucumber": ["cucumber", "cucumbers"],
    "zucchini": ["zucchini", "courgette"],
    "eggplant": ["eggplant", "aubergine"],
    "pumpkin": ["pumpkin", "butternut squash", "squash"],
    "cabbage": ["cabbage", "white cabbage", "savoy cabbage", "napa cabbage", "bok choy"],
    "red_cabbage": ["red cabbage"],
    "broccoli": ["broccoli"],
    "cauliflower": ["cauliflower"],
    "brussels_sprouts": ["brussels sprouts"],
    "kohlrabi": ["kohlrabi"],
    "spinach": ["spinach", "spinach leaves"],
    "kale": ["kale", "swiss chard"],
    "lettuce": ["lettuce", "a head of lettuce", "salad leaves", "arugula"],
    "mushroom": ["mushroom", "mushrooms"],
    "corn": ["corn on the cob", "sweet corn"],
    "peas": ["green peas", "pea pods"],
    "green_beans": ["green beans"],
    "asparagus": ["asparagus"],
    "beet": ["beetroot", "beets"],
    "radish": ["radish", "radishes", "turnip", "parsnip", "daikon"],
    "okra": ["okra"],
    "avocado": ["avocado", "avocados"],
    "plantain": ["plantains"],
    "cassava": ["cassava root"],
    "yam": ["yam", "taro root"],
    "fennel": ["fennel bulb"],
    "artichoke": ["artichoke", "artichokes"],
    "bean_sprouts": ["bean sprouts"],
    "apple": ["apple", "apples", "red apple", "green apple"],
    "banana": ["banana", "bananas"],
    "lemon": ["lemon", "lemons"],
    "lime": ["lime", "limes"],
    "orange": ["orange", "oranges", "mandarin", "tangerines"],
    "strawberry": ["strawberry", "strawberries"],
    "raspberry": ["raspberries"],
    "blueberry": ["blueberries"],
    "berries": ["blackberries", "redcurrants", "gooseberries", "cranberries"],
    "cherry": ["cherries"],
    "peach": ["peach", "peaches", "nectarine"],
    "apricot": ["apricot", "apricots"],
    "plum": ["plum", "plums"],
    "pear": ["pear", "pears"],
    "pineapple": ["pineapple"],
    "mango": ["mango", "mangoes"],
    "grapes": ["grapes", "a bunch of grapes"],
    "melon": ["melon", "watermelon", "cantaloupe"],
    "kiwi": ["kiwi fruit", "kiwis"],
    "papaya": ["papaya", "guava", "passion fruit", "lychees"],
    "pomegranate": ["pomegranate"],
    "rhubarb": ["rhubarb stalks"],
    "fig": ["fig", "figs"],
    "coconut": ["coconut"],
    "parsley": ["parsley"],
    "coriander": ["coriander leaves", "cilantro"],
    "basil": ["basil", "basil leaves"],
    "mint": ["mint leaves"],
    "dill": ["dill"],
    "rosemary": ["rosemary"],
    "thyme": ["thyme"],
    "chives": ["chives"],
    "lemongrass": ["lemongrass"],
}
PROMPTS = [
    "a photo of {}.",
    "a close-up photo of {}.",
    "a photo of {}, a type of food.",
    "{} on a kitchen counter.",
    "a photo of fresh {} from the market.",
]
# Answers that count as right (a red onion offered for "onion" is fine for cooking).
# Spring onions in the photos often have big bulbs, and onion photos often show some green.
ACCEPT = {
    "onion": {"red_onion", "shallot", "green_onion"},
    "red_onion": {"onion"},
    "shallot": {"onion"},
    "green_onion": {"onion"},
}

MODELS = {
    "tinyclip-8m": "wkcn/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M",
    "tinyclip-39m": "wkcn/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M",
    "tinyclip-40m": "wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M",
    "tinyclip-61m": "wkcn/TinyCLIP-ViT-61M-32-Text-29M-LAION400M",
    "openai-b32": "openai/clip-vit-base-patch32",
    "laion-b32": "laion/CLIP-ViT-B-32-laion2B-s34B-b79K",
    "siglip2-b16": "google/siglip2-base-patch16-224",
    "siglip2-b32": "google/siglip2-base-patch32-256",
}


def test_sets() -> dict[str, list[tuple[str, str]]]:
    with (DATA / "manifest.csv").open(encoding="utf-8") as f:
        crops = [(r["path"], r["cls"]) for r in csv.DictReader(f) if r["split"] == "test" and r["source"] == "openimages"]
    with (DATA / "whole.csv").open(encoding="utf-8") as f:
        whole = [(r["path"], r["cls"]) for r in csv.DictReader(f)]
    return {"crops": crops, "whole": whole}


def tensor(out) -> torch.Tensor:
    """transformers 5 returns an output object from get_*_features; older versions a tensor."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


def centre_square(img: Image.Image) -> Image.Image:
    """What the app does with a camera frame or a chosen photo."""
    s = min(img.size)
    left, top = (img.width - s) // 2, (img.height - s) // 2
    return img.crop((left, top, left + s, top + s))


@torch.no_grad()
def text_matrix(model, proc, is_siglip: bool) -> tuple[np.ndarray, list[str]]:
    """One row per (ingredient, name); returns rows and the ingredient id of each row."""
    vecs, owner = [], []
    for ing, names in PRODUCE.items():
        for n in names:
            texts = [p.format(n) for p in PROMPTS]
            kw = {"padding": "max_length", "max_length": 64} if is_siglip else {"padding": True}
            t = proc(text=texts, return_tensors="pt", **kw)
            e = tensor(model.get_text_features(**t))
            e = e / e.norm(dim=-1, keepdim=True)
            m = e.mean(0)
            vecs.append((m / m.norm()).numpy())
            owner.append(ing)
    return np.stack(vecs), owner


@torch.no_grad()
def image_matrix(model, proc, key: str, set_name: str, items: list[tuple[str, str]]) -> np.ndarray:
    cache = RUNS / "cache" / f"{key}-{set_name}.npy"
    if cache.exists():
        return np.load(cache)
    out = []
    for i in range(0, len(items), 64):
        imgs = [centre_square(Image.open(DATA / p).convert("RGB")) for p, _ in items[i : i + 64]]
        x = proc(images=imgs, return_tensors="pt")
        e = tensor(model.get_image_features(pixel_values=x["pixel_values"]))
        out.append((e / e.norm(dim=-1, keepdim=True)).numpy())
    arr = np.concatenate(out)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, arr)
    return arr


def scores(img: np.ndarray, txt: np.ndarray, owner: list[str]) -> tuple[np.ndarray, list[str]]:
    """Per-ingredient score = best of its names."""
    ids = list(PRODUCE)
    sim = img @ txt.T
    out = np.full((len(img), len(ids)), -np.inf, dtype=np.float32)
    for j, ing in enumerate(owner):
        k = ids.index(ing)
        out[:, k] = np.maximum(out[:, k], sim[:, j])
    return out, ids


def evaluate(s: np.ndarray, ids: list[str], items: list[tuple[str, str]]) -> dict:
    order = np.argsort(-s, axis=1)[:, :3]
    per = defaultdict(lambda: [0, 0, 0])
    confusions: Counter = Counter()
    for row, (_, cls) in zip(order, items):
        ok = {cls} | ACCEPT.get(cls, set())
        top = [ids[k] for k in row]
        p = per[cls]
        p[0] += 1
        p[1] += top[0] in ok
        p[2] += any(t in ok for t in top)
        if top[0] not in ok:
            confusions[(cls, top[0])] += 1
    n = sum(p[0] for p in per.values())
    return {
        "n": n,
        "top1": sum(p[1] for p in per.values()) / n,
        "top3": sum(p[2] for p in per.values()) / n,
        "macro_top1": float(np.mean([p[1] / p[0] for p in per.values()])),
        "per_class": {c: {"n": p[0], "top1": p[1] / p[0], "top3": p[2] / p[0]} for c, p in sorted(per.items())},
        "confusions": [[a, b, k] for (a, b), k in confusions.most_common(15)],
    }


def run(key: str) -> dict:
    name = MODELS[key]
    is_siglip = "siglip" in name
    t0 = time.time()
    model = AutoModel.from_pretrained(name).eval()
    proc = AutoProcessor.from_pretrained(name)
    vision_params = sum(p.numel() for p in model.vision_model.parameters())
    txt, owner = text_matrix(model, proc, is_siglip)
    res = {"model": name, "vision_params_m": round(vision_params / 1e6, 1), "ingredients": len(PRODUCE), "sets": {}}
    for set_name, items in test_sets().items():
        img = image_matrix(model, proc, key, set_name, items)
        s, ids = scores(img, txt, owner)
        res["sets"][set_name] = evaluate(s, ids, items)
    res["seconds"] = round(time.time() - t0)
    RUNS.mkdir(parents=True, exist_ok=True)
    (RUNS / f"{key}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    np.save(RUNS / "cache" / f"{key}-text.npy", txt)
    return res


def main() -> None:
    keys = sys.argv[1:] or list(MODELS)
    for k in keys:
        r = run(k)
        line = "  ".join(f"{n}: top1 {v['top1']:.0%} top3 {v['top3']:.0%} macro {v['macro_top1']:.0%} (n={v['n']})" for n, v in r["sets"].items())
        print(f"{k:13} vision {r['vision_params_m']:5}M  {line}  [{r['seconds']}s]", flush=True)


if __name__ == "__main__":
    main()

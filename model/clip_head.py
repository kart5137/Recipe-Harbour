"""Fit the ingredient head on top of a frozen image-text model, and measure it.

The head is one vector per ingredient name (clip_eval.PRODUCE), started from the model's own
text vectors. Training moves them towards real photos; a penalty keeps them close to the text
so ingredients without training photos still work zero-shot. An ingredient's score is the best
of its names, exactly as in the browser.

Training data: Open Images train box crops (R6) + whole train photos (clip_trainset.py) + the
Fruits-360 lab photos. Model selection: a held-out 15 % of the whole train photos (by photo).
Test sets (used once per setting, for reporting): the R6 crops and the whole photos.

Run: .venv-clip/Scripts/python model/clip_head.py siglip2-b32 [variant]
With a variant (e.g. q4h, made by clip_export.py), the image vectors come from that exported
ONNX file with the browser's preprocessing, so the head is fitted to the model that ships.
Writes model/runs/clip/head-<model>[-<variant>].json (metrics) and .npz (weights).
"""

from __future__ import annotations

import csv
import json
import random
import sys

import numpy as np
import torch
from clip_eval import (
    DATA,
    MODELS,
    PRODUCE,
    RUNS,
    evaluate,
    image_matrix,
    scores,
    test_sets,
)
from transformers import AutoModel, AutoProcessor

IDS = list(PRODUCE)
SCALE = 100.0  # CLIP's logit scale
CROPS_PER_CLASS = 150


def train_sets() -> dict[str, list[tuple[str, str]]]:
    with (DATA / "manifest.csv").open(encoding="utf-8") as f:
        crops = [(r["path"], r["cls"]) for r in csv.DictReader(f) if r["split"] == "train"]
    # At most CROPS_PER_CLASS box crops per ingredient (image vectors are slow to compute on a CPU).
    rng = random.Random(5)
    crops.sort()
    rng.shuffle(crops)
    seen: dict[str, int] = {}
    crops = [c for c in crops if (seen.__setitem__(c[1], seen.get(c[1], 0) + 1) or seen[c[1]]) <= CROPS_PER_CLASS]
    with (DATA / "wholetrain.csv").open(encoding="utf-8") as f:
        whole = [(r["path"], r["cls"]) for r in csv.DictReader(f)]
    rng = random.Random(3)
    whole.sort()
    rng.shuffle(whole)
    k = len(whole) * 15 // 100
    return {"traincrops": crops, "wholetrain": whole[k:], "wholeval": whole[:k]}


def ingredient_logits(img: torch.Tensor, W: torch.Tensor, owner_idx: torch.Tensor) -> torch.Tensor:
    sim = img @ W.T  # (n, names)
    out = torch.full((img.shape[0], len(IDS)), -1e4)
    return out.scatter_reduce(1, owner_idx.expand(img.shape[0], -1), sim, reduce="amax", include_self=True)


def fit(x: np.ndarray, y: np.ndarray, W0: np.ndarray, owner_idx: torch.Tensor, lam: float, epochs: int) -> torch.Tensor:
    torch.manual_seed(0)
    X, Y = torch.tensor(x), torch.tensor(y)
    W0t = torch.tensor(W0)
    W = torch.nn.Parameter(W0t.clone())
    opt = torch.optim.AdamW([W], lr=1e-3, weight_decay=0)
    # Balance classes: each ingredient counts the same, however many photos it has.
    counts = torch.bincount(Y, minlength=len(IDS)).float()
    weight = torch.where(counts > 0, counts.sum() / (counts.clamp(min=1) * (counts > 0).sum()), torch.zeros_like(counts))
    for _ in range(epochs):
        perm = torch.randperm(len(X))
        for i in range(0, len(X), 512):
            b = perm[i : i + 512]
            Wn = W / W.norm(dim=-1, keepdim=True)
            logits = SCALE * ingredient_logits(X[b], Wn, owner_idx)
            loss = torch.nn.functional.cross_entropy(logits, Y[b], weight=weight) + lam * ((Wn - W0t) ** 2).sum()
            opt.zero_grad()
            loss.backward()
            opt.step()
    with torch.no_grad():
        return (W / W.norm(dim=-1, keepdim=True)).detach()


def main() -> None:
    key = sys.argv[1]
    variant = sys.argv[2] if len(sys.argv) > 2 else None
    tag = f"{key}-{variant}" if variant else key
    name = MODELS[key]
    model = AutoModel.from_pretrained(name).eval()
    proc = AutoProcessor.from_pretrained(name)
    from clip_eval import text_matrix

    W0, owner = text_matrix(model, proc, "siglip" in name)
    owner_idx = torch.tensor([IDS.index(o) for o in owner])[None, :]

    tr = train_sets()
    tests = test_sets()
    if variant:
        from clip_export import embed, preprocess_cfg

        onnx_path = RUNS / "export" / key / f"vision_{variant}.onnx"
        cfg = preprocess_cfg(proc)

        def vectors(set_name: str, items: list[tuple[str, str]]) -> np.ndarray:
            cache = RUNS / "cache" / f"{tag}-{set_name}.npy"
            if not cache.exists():
                np.save(cache, embed(onnx_path, items, cfg))
            return np.load(cache)

        emb = {k: vectors(k, v) for k, v in tr.items()}
        temb = {k: vectors(k, v) for k, v in tests.items()}
    else:
        emb = {k: image_matrix(model, proc, key, k, v) for k, v in tr.items()}
        temb = {k: image_matrix(model, proc, key, k, v) for k, v in tests.items()}

    x = np.concatenate([emb["traincrops"], emb["wholetrain"]]).astype(np.float32)
    y = np.array([IDS.index(c) for _, c in tr["traincrops"] + tr["wholetrain"]])
    trained_on = sorted({c for _, c in tr["traincrops"] + tr["wholetrain"]})

    def val_score(W: np.ndarray) -> float:
        s, ids = scores(emb["wholeval"], W, owner)
        return evaluate(s, ids, tr["wholeval"])["macro_top1"]

    zs = val_score(W0)
    print(f"zero-shot  val macro top1 {zs:.1%}")
    best = (zs, 0.0, 0, W0)
    for lam in (0.3, 0.1, 0.03, 0.01):
        for epochs in (10, 30):
            W = fit(x, y, W0, owner_idx, lam, epochs).numpy()
            v = val_score(W)
            print(f"lam {lam:<5} epochs {epochs:3}  val macro top1 {v:.1%}", flush=True)
            if v > best[0]:
                best = (v, lam, epochs, W)
    v, lam, epochs, W = best
    res = {"model": name, "lam": lam, "epochs": epochs, "val_macro_top1": v, "zero_shot_val_macro_top1": zs,
           "trained_on": trained_on, "train_examples": len(x), "sets": {}}
    for set_name, items in tests.items():
        s, ids = scores(temb[set_name], W, owner)
        res["sets"][set_name] = evaluate(s, ids, items)
        z, _ = scores(temb[set_name], W0, owner)
        res["sets"][set_name]["zero_shot_top1"] = evaluate(z, ids, items)["top1"]
    (RUNS / f"head-{tag}.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    np.savez(RUNS / f"head-{tag}.npz", W=W.astype(np.float32), owner=np.array(owner))
    print(f"chosen lam {lam} epochs {epochs}")
    for n, r in res["sets"].items():
        print(f"{n}: top1 {r['top1']:.0%} top3 {r['top3']:.0%} macro {r['macro_top1']:.0%} (zero-shot top1 {r['zero_shot_top1']:.0%})")


if __name__ == "__main__":
    main()

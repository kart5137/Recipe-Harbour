"""Export the chosen image model + ingredient head for the browser (ONNX Runtime Web).

1. Export the image half of the model to ONNX (the text half is not needed in the browser:
   the ingredient vectors are already in the head).
2. Make smaller versions (8-bit, 4-bit weights) and measure every version on both test sets,
   with the same preprocessing the browser uses (centre square, resize, normalise).
3. Write web/public/model/: vision.onnx, head.bin (float16 vectors), labels.json.

An ingredient is "offered" (suggested by the app) if, on both test sets together:
- on at least MIN_PHOTOS photos of it, the right answer is in the top 3 at least TOP3 of the time, and
- when the app would say "Looks like X" (probability >= CONFIDENT), X is right at least PRECISION
  of the time, over at least MIN_PHOTOS such answers.
The second part is what a user sees; the first keeps ingredients the model rarely finds out.

Red onion and shallot are answered as onion (MERGE): the model cannot tell them apart reliably,
and the test counts them as right for onion photos anyway.

Run: .venv-clip/Scripts/python model/clip_export.py siglip2-b16 [variant]
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from clip_eval import (
    ACCEPT,
    DATA,
    MODELS,
    PRODUCE,
    RUNS,
    centre_square,
    evaluate,
    scores,
    tensor,
    test_sets,
)
from PIL import Image
from transformers import AutoModel, AutoProcessor

ROOT = Path(__file__).resolve().parent
OUT = RUNS / "export"
WEB = ROOT.parent / "web" / "public" / "model"
MIN_PHOTOS, TOP3, PRECISION = 15, 0.80, 0.80
CONFIDENT = 0.6  # same as web/src/lib/classify-result.ts
MERGE = {"red_onion": "onion", "shallot": "onion"}


class Vision(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, pixel_values):
        e = tensor(self.model.get_image_features(pixel_values=pixel_values))
        return e / e.norm(dim=-1, keepdim=True)


def preprocess_cfg(proc) -> dict:
    ip = proc.image_processor
    size = ip.size.get("height") or ip.size.get("shortest_edge")
    return {"size": int(size), "mean": [float(x) for x in ip.image_mean], "std": [float(x) for x in ip.image_std]}


def pixels(path: Path, cfg: dict) -> np.ndarray:
    """What the browser does: centre square, bilinear resize, scale to 0-1, normalise, NCHW."""
    img = centre_square(Image.open(path).convert("RGB")).resize((cfg["size"], cfg["size"]), Image.Resampling.BILINEAR)
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - np.array(cfg["mean"], dtype=np.float32)) / np.array(cfg["std"], dtype=np.float32)
    return x.transpose(2, 0, 1)


def embed(onnx_path: Path, items: list[tuple[str, str]], cfg: dict) -> np.ndarray:
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    out = []
    for i in range(0, len(items), 32):
        x = np.stack([pixels(DATA / p, cfg) for p, _ in items[i : i + 32]])
        out.append(sess.run(None, {"pixel_values": x})[0])
    return np.concatenate(out)


def half_initializers(src: Path, dst: Path, min_bytes: int = 1 << 20) -> None:
    """Store large float32 weights that 4-bit quantisation skipped as float16, cast back at load."""
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    m = onnx.load(str(src))
    casts = []
    for t in list(m.graph.initializer):
        if t.data_type != TensorProto.FLOAT:
            continue
        a = numpy_helper.to_array(t)
        if a.nbytes < min_bytes:
            continue
        h = numpy_helper.from_array(a.astype(np.float16), t.name + "_fp16")
        m.graph.initializer.remove(t)
        m.graph.initializer.append(h)
        casts.append(helper.make_node("Cast", [h.name], [t.name], to=TensorProto.FLOAT, name=t.name + "_cast"))
    for n in reversed(casts):
        m.graph.node.insert(0, n)
    onnx.save(m, str(dst))


def variants(fp32: Path) -> dict[str, Path]:
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

    out = {"fp32": fp32}
    q8 = OUT / "vision_int8.onnx"
    if not q8.exists():
        quantize_dynamic(str(fp32), str(q8), weight_type=QuantType.QInt8, per_channel=True)
    out["int8"] = q8
    q4 = OUT / "vision_q4.onnx"
    if not q4.exists():
        m = onnx.load(str(fp32))
        q = MatMulNBitsQuantizer(m, block_size=32, is_symmetric=True)
        q.process()
        q.model.save_model_to_file(str(q4), use_external_data_format=False)
    out["q4"] = q4
    q4h = OUT / "vision_q4h.onnx"
    if not q4h.exists():
        half_initializers(q4, q4h)
    out["q4h"] = q4h
    q4b = OUT / "vision_q4b128.onnx"
    if not q4b.exists():
        m = onnx.load(str(fp32))
        q = MatMulNBitsQuantizer(m, block_size=128, is_symmetric=True)
        q.process()
        tmp = OUT / "tmp_b128.onnx"
        q.model.save_model_to_file(str(tmp), use_external_data_format=False)
        half_initializers(tmp, q4b)
        tmp.unlink()
    out["q4b128h"] = q4b
    return out


def main() -> None:
    key = sys.argv[1]
    pick = sys.argv[2] if len(sys.argv) > 2 else None
    name = MODELS[key]
    global OUT
    OUT = RUNS / "export" / key
    OUT.mkdir(parents=True, exist_ok=True)
    model = AutoModel.from_pretrained(name).eval()
    proc = AutoProcessor.from_pretrained(name)
    cfg = preprocess_cfg(proc)

    fp32 = OUT / "vision_fp32.onnx"
    if not fp32.exists():
        x = torch.zeros(1, 3, cfg["size"], cfg["size"])
        torch.onnx.export(Vision(model), (x,), str(fp32), input_names=["pixel_values"], output_names=["embeds"],
                          dynamic_axes={"pixel_values": {0: "n"}, "embeds": {0: "n"}}, opset_version=17, dynamo=False)

    # The head fitted to the chosen variant's own outputs, if there is one (clip_head.py <key> <variant>).
    tuned = RUNS / f"head-{key}-{pick}.npz"
    head = np.load(tuned if pick and tuned.exists() else RUNS / f"head-{key}.npz")
    W, owner = head["W"], [MERGE.get(str(o), str(o)) for o in head["owner"]]
    tests = test_sets()
    report = {}
    ref = {}
    for vname, path in variants(fp32).items():
        r = {"mb": round(path.stat().st_size / 1e6, 1), "sets": {}}
        for set_name, items in tests.items():
            cache = OUT / f"{vname}-{set_name}.npy"
            e = np.load(cache) if cache.exists() else embed(path, items, cfg)
            np.save(cache, e)
            s, ids = scores(e, W, owner)
            ev = evaluate(s, ids, items)
            top = s.argmax(1)
            ref.setdefault(set_name, top)
            r["sets"][set_name] = {"top1": ev["top1"], "top3": ev["top3"], "macro_top1": ev["macro_top1"],
                                   "same_answer_as_fp32": float((top == ref[set_name]).mean()), "per_class": ev["per_class"]}
        report[vname] = r
        print(f"{vname:5} {r['mb']:6} MB  " + "  ".join(
            f"{k}: top1 {v['top1']:.0%} top3 {v['top3']:.0%} same {v['same_answer_as_fp32']:.1%}" for k, v in r["sets"].items()), flush=True)
    (OUT / "variants.json").write_text(json.dumps({k: {**v, "sets": {s: {kk: vv for kk, vv in d.items() if kk != "per_class"} for s, d in v["sets"].items()}} for k, v in report.items()}, indent=1), encoding="utf-8")
    if not pick:
        return

    # Per-ingredient results on both test sets together, for the chosen variant.
    per: dict[str, list[float]] = {}
    for d in report[pick]["sets"].values():
        for c, v in d["per_class"].items():
            n, a, b = per.get(c, [0, 0.0, 0.0])
            per[c] = [n + v["n"], a + v["top1"] * v["n"], b + v["top3"] * v["n"]]
    said: dict[str, list[int]] = {}  # ingredient -> [confident answers, right ones]
    for set_name, items in tests.items():
        s, ids = scores(np.load(OUT / f"{pick}-{set_name}.npy"), W, owner)
        z = np.exp(100.0 * (s - s.max(1, keepdims=True)))
        prob = z / z.sum(1, keepdims=True)
        for row, (_, cls) in zip(prob, items):
            t = int(row.argmax())
            if row[t] >= CONFIDENT:
                g = ids[t]
                k = said.setdefault(g, [0, 0])
                k[0] += 1
                k[1] += g in ({cls} | ACCEPT.get(cls, set()))
    classes = []
    for ing in PRODUCE:
        if ing in MERGE:
            continue
        n, a, b = per.get(ing, [0, 0, 0])
        t1, t3 = (a / n, b / n) if n else (None, None)
        cn, cr = said.get(ing, [0, 0])
        prec = cr / cn if cn else None
        offered = bool(n >= MIN_PHOTOS and t3 >= TOP3 and cn >= MIN_PHOTOS and prec >= PRECISION)
        classes.append({"id": ing, "offered": offered, "test_photos": int(n),
                        "top1": None if t1 is None else round(t1, 3), "top3": None if t3 is None else round(t3, 3),
                        "confident": int(cn), "confident_right": None if prec is None else round(prec, 3)})

    for f in WEB.glob("*"):
        if f.name != "LICENSE.txt":
            f.unlink()
    shutil.copy(report_path := variants(fp32)[pick], WEB / "vision.onnx")
    W.astype(np.float16).tofile(WEB / "head.bin")
    meta = {"version": f"{key}-{pick}", "model": name, "input": cfg, "dim": int(W.shape[1]), "names": owner,
            "scale": 100.0, "thresholds": {"top3": TOP3, "precision": PRECISION, "confident": CONFIDENT, "min_test": MIN_PHOTOS}, "classes": classes}
    (WEB / "labels.json").write_text(json.dumps(meta, ensure_ascii=False, indent=0), encoding="utf-8")
    print("wrote", WEB, "vision.onnx", round(report_path.stat().st_size / 1e6, 1), "MB; offered:",
          [c["id"] for c in classes if c["offered"]])


if __name__ == "__main__":
    main()

"""Train the produce classifier: MobileNetV2 (ImageNet) features + a softmax head.

    python model/train.py features   # cache backbone features (train: several augmented views)
    python model/train.py head       # train the head, evaluate on real photos, write metrics
    python model/train.py all

The test set is real photos only (Open Images), split by image, never seen in training.
Outputs go to model/runs/<run>/: head weights, metrics.json, and the full Keras model.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import numpy as np  # noqa: E402
import tensorflow as tf  # noqa: E402
import tf_keras as keras  # noqa: E402

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
RUNS = HERE / "runs"
SIZE = 224
VIEWS = 3  # augmented views per training image
SEED = 7


def read_manifest() -> list[dict]:
    with (DATA / "manifest.csv").open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def backbone() -> keras.Model:
    inp = keras.Input((SIZE, SIZE, 3), name="image")  # RGB, 0..255
    x = keras.layers.Rescaling(1 / 127.5, offset=-1, name="to_minus1_1")(inp)
    base = keras.applications.MobileNetV2(input_shape=(SIZE, SIZE, 3), include_top=False, weights="imagenet",
                                          pooling="avg")
    base.trainable = False
    return keras.Model(inp, base(x, training=False), name="features")


def load(path: str) -> tf.Tensor:
    img = tf.io.decode_jpeg(tf.io.read_file(str(DATA / path)), channels=3)
    return tf.image.resize(img, (SIZE, SIZE))


def augment(img: tf.Tensor, rng: tf.random.Generator) -> tf.Tensor:
    img = tf.image.stateless_random_flip_left_right(img, rng.make_seeds(2)[0])
    # random crop 80-100 % then back to full size
    frac = rng.uniform((), 0.8, 1.0)
    side = tf.cast(frac * SIZE, tf.int32)
    img = tf.image.stateless_random_crop(img, (side, side, 3), rng.make_seeds(2)[0])
    img = tf.image.resize(img, (SIZE, SIZE))
    img = tf.image.stateless_random_brightness(img, 25.0, rng.make_seeds(2)[0])
    img = tf.image.stateless_random_contrast(img, 0.8, 1.2, rng.make_seeds(2)[0])
    img = tf.image.stateless_random_saturation(img, 0.8, 1.2, rng.make_seeds(2)[0])
    return tf.clip_by_value(img, 0.0, 255.0)


def extract(model: keras.Model, paths: list[str], aug: bool, rng: tf.random.Generator | None) -> np.ndarray:
    out, batch = [], []
    for n, p in enumerate(paths, 1):
        img = load(p)
        if aug:
            img = augment(img, rng)
        batch.append(img)
        if len(batch) == 64 or n == len(paths):
            out.append(model(tf.stack(batch), training=False).numpy())
            batch = []
            print(f"\r  {n}/{len(paths)}", end="", flush=True)
    print()
    return np.concatenate(out).astype(np.float32)


def cmd_features(run: Path, views: int = VIEWS) -> None:
    rows = read_manifest()
    m = backbone()
    rng = tf.random.Generator.from_seed(SEED)
    views_train = views
    run.mkdir(parents=True, exist_ok=True)
    for split in ("train", "val", "test"):
        part = [r for r in rows if r["split"] == split]
        views = views_train if split == "train" else 1
        feats, meta = [], []
        for v in range(views):
            print(f"{split} view {v + 1}/{views}: {len(part)} images", flush=True)
            feats.append(extract(m, [r["path"] for r in part], aug=split == "train" and v > 0, rng=rng))
            meta += [{**r, "view": v} for r in part]
        np.save(run / f"feat_{split}.npy", np.concatenate(feats))
        with (run / f"meta_{split}.json").open("w", encoding="utf-8") as f:
            json.dump(meta, f)


def head_model(n_classes: int) -> keras.Model:
    inp = keras.Input((1280,), name="features")
    x = keras.layers.Dropout(0.3)(inp)
    out = keras.layers.Dense(n_classes, activation="softmax", name="classes",
                             kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    return keras.Model(inp, out, name="head")


def load_split(run: Path, split: str) -> tuple[np.ndarray, list[dict]]:
    return np.load(run / f"feat_{split}.npy"), json.loads((run / f"meta_{split}.json").read_text(encoding="utf-8"))


def train_head(xtr, ytr, xva, yva, n_classes: int, epochs: int = 60) -> keras.Model:
    keras.utils.set_random_seed(SEED)
    counts = Counter(ytr.tolist())
    weights = {c: len(ytr) / (n_classes * counts[c]) for c in counts}
    m = head_model(n_classes)
    m.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    stop = keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True)
    m.fit(xtr, ytr, validation_data=(xva, yva), epochs=epochs, batch_size=128, class_weight=weights,
          callbacks=[stop], verbose=0)
    return m


def evaluate(probs: np.ndarray, y: np.ndarray, classes: list[str]) -> dict:
    top3 = np.argsort(-probs, axis=1)[:, :3]
    pred = top3[:, 0]
    per = {}
    for k, c in enumerate(classes):
        idx = y == k
        n = int(idx.sum())
        per[c] = {
            "n": n,
            "top1": float((pred[idx] == k).mean()) if n else None,
            "top3": float((top3[idx] == k).any(axis=1).mean()) if n else None,
        }
    confusion = Counter((classes[t], classes[p]) for t, p in zip(y, pred, strict=True) if t != p)
    return {
        "n": int(len(y)),
        "top1": float((pred == y).mean()),
        "top3": float((top3 == y[:, None]).any(axis=1).mean()),
        "macro_top1": float(np.mean([v["top1"] for v in per.values() if v["top1"] is not None])),
        "per_class": per,
        "top_confusions": [{"true": t, "pred": p, "count": n} for (t, p), n in confusion.most_common(15)],
    }


def cmd_head(run: Path) -> None:
    xtr, mtr = load_split(run, "train")
    xva, mva = load_split(run, "val")
    xte, mte = load_split(run, "test")
    classes = sorted({r["cls"] for r in mtr})
    k = {c: i for i, c in enumerate(classes)}
    ytr = np.array([k[r["cls"]] for r in mtr])
    yva = np.array([k[r["cls"]] for r in mva])
    yte = np.array([k[r["cls"]] for r in mte])

    results = {}
    # Ablation: does adding the Fruits-360 lab photos help on real photos?
    real_only = np.array([r["source"] == "openimages" for r in mtr])
    for name, mask in (("real_photos_only", real_only), ("real_plus_fruits360", np.ones(len(mtr), bool))):
        m = train_head(xtr[mask], ytr[mask], xva, yva, len(classes))
        results[name] = {
            "train_images": int(mask.sum()),
            "val": evaluate(m.predict(xva, verbose=0), yva, classes),
            "test": evaluate(m.predict(xte, verbose=0), yte, classes),
        }
        print(f"{name:22} val top1 {results[name]['val']['top1']:.3f} | test top1 {results[name]['test']['top1']:.3f}"
              f" top3 {results[name]['test']['top3']:.3f}", flush=True)
        m.save_weights(run / f"head_{name}.h5")

    best = max(results, key=lambda n: results[n]["val"]["top1"])  # chosen on validation, not test
    out = {"classes": classes, "chosen": best, "results": results,
           "train_counts": {c: dict(Counter(r["source"] for r in mtr if r["cls"] == c and r["view"] == 0))
                            for c in classes},
           "test_counts": dict(Counter(r["cls"] for r in mte))}
    (run / "metrics.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"chosen on validation: {best}")

    # Full model for export: backbone + chosen head.
    head = head_model(len(classes))
    head.load_weights(run / f"head_{best}.h5")
    feats = backbone()
    full = keras.Model(feats.input, head(feats.output), name="produce_classifier")
    full.save(run / "produce_classifier.h5")
    (run / "classes.json").write_text(json.dumps(classes), encoding="utf-8")


def cmd_finetune(run: Path, unfreeze_from: int = 100, epochs: int = 10, lr: float = 3e-5) -> None:
    """Fine-tune the top of MobileNetV2 on real photos, starting from the chosen head.

    BatchNorm layers stay in inference mode (the backbone is called with training=False),
    which is the standard recipe for fine-tuning with small datasets.
    """
    metrics = json.loads((run / "metrics.json").read_text(encoding="utf-8"))
    classes = metrics["classes"]
    k = {c: i for i, c in enumerate(classes)}
    rows = read_manifest()
    use_f360 = metrics["chosen"] == "real_plus_fruits360"
    train = [r for r in rows if r["split"] == "train" and (use_f360 or r["source"] == "openimages")]
    val = [r for r in rows if r["split"] == "val"]
    test = [r for r in rows if r["split"] == "test"]

    keras.utils.set_random_seed(SEED)
    inp = keras.Input((SIZE, SIZE, 3), name="image")
    x = keras.layers.Rescaling(1 / 127.5, offset=-1, name="to_minus1_1")(inp)
    base = keras.applications.MobileNetV2(input_shape=(SIZE, SIZE, 3), include_top=False, weights="imagenet",
                                          pooling="avg")
    base.trainable = True
    for layer in base.layers[:unfreeze_from]:
        layer.trainable = False
    feats = base(x, training=False)
    head = head_model(len(classes))
    head.load_weights(run / f"head_{metrics['chosen']}.h5")
    model = keras.Model(inp, head(feats), name="produce_classifier")
    print(f"fine-tuning {sum(1 for lyr in base.layers if lyr.trainable)} of {len(base.layers)} backbone layers "
          f"on {len(train)} images", flush=True)

    rng = tf.random.Generator.from_seed(SEED)

    def ds(part: list[dict], aug: bool, shuffle: bool) -> tf.data.Dataset:
        paths = [str(DATA / r["path"]) for r in part]
        labels = [k[r["cls"]] for r in part]
        d = tf.data.Dataset.from_tensor_slices((paths, labels))
        if shuffle:
            d = d.shuffle(len(part), seed=SEED, reshuffle_each_iteration=True)

        def load_fn(p, y):
            img = tf.image.resize(tf.io.decode_jpeg(tf.io.read_file(p), channels=3), (SIZE, SIZE))
            return (augment(img, rng) if aug else img), y

        return d.map(load_fn, num_parallel_calls=4).batch(32).prefetch(2)

    counts = Counter(k[r["cls"]] for r in train)
    weights = {c: len(train) / (len(classes) * counts[c]) for c in counts}
    model.compile(optimizer=keras.optimizers.Adam(lr), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    stop = keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=3, restore_best_weights=True)
    hist = model.fit(ds(train, True, True), validation_data=ds(val, False, False), epochs=epochs,
                     class_weight=weights, callbacks=[stop], verbose=2)

    yva = np.array([k[r["cls"]] for r in val])
    yte = np.array([k[r["cls"]] for r in test])
    res = {
        "train_images": len(train),
        "unfreeze_from": unfreeze_from,
        "epochs_run": len(hist.history["loss"]),
        "val_history": [round(v, 4) for v in hist.history["val_accuracy"]],
        "val": evaluate(model.predict(ds(val, False, False), verbose=0), yva, classes),
        "test": evaluate(model.predict(ds(test, False, False), verbose=0), yte, classes),
    }
    print(f"finetuned              val top1 {res['val']['top1']:.3f} | test top1 {res['test']['top1']:.3f}"
          f" top3 {res['test']['top3']:.3f}", flush=True)
    metrics["results"]["finetuned"] = res
    if res["val"]["top1"] > metrics["results"][metrics["chosen"]]["val"]["top1"]:
        metrics["chosen"] = "finetuned"  # chosen on validation, not test
        model.save(run / "produce_classifier.h5")
    (run / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    print(f"chosen on validation: {metrics['chosen']}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["features", "head", "finetune", "all"])
    ap.add_argument("--run", default="v1")
    ap.add_argument("--views", type=int, default=VIEWS, help="augmented views per training image")
    a = ap.parse_args()
    run = RUNS / a.run
    if a.cmd in ("features", "all"):
        cmd_features(run, a.views)
    if a.cmd in ("head", "all"):
        cmd_head(run)
    if a.cmd in ("finetune", "all"):
        cmd_finetune(run)


if __name__ == "__main__":
    sys.exit(main())

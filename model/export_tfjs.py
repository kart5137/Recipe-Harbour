"""Export the trained classifier to TensorFlow.js for the web app.

    python model/export_tfjs.py --run v2

Writes web/public/model/ (model.json, weight shards, labels.json) after checking that
the converted model, with weights stored as 16-bit floats, gives the same answers as the
Keras model on real test photos. (8-bit quantisation was tried and rejected: it changed
the top answer on over half the test photos for the fine-tuned MobileNetV2.)
labels.json lists every class with its real-photo test results and whether the app
offers it (see THRESHOLDS).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "shims"))  # empty tensorflow_decision_forests (see shims/)

import numpy as np  # noqa: E402
import tensorflowjs as tfjs  # noqa: E402
import tf_keras as keras  # noqa: E402

ROOT = HERE.parent
OUT = ROOT / "web" / "public" / "model"

# A class is offered in the app only if, on real photos it never saw in training,
# the right answer is first at least TOP1 of the time and in the top 3 at least TOP3,
# measured on at least MIN_TEST photos.
THRESHOLDS = {"top1": 0.70, "top3": 0.90, "min_test": 15}


def offered(stats: dict) -> bool:
    return (
        stats["n"] >= THRESHOLDS["min_test"]
        and stats["top1"] is not None
        and stats["top1"] >= THRESHOLDS["top1"]
        and stats["top3"] >= THRESHOLDS["top3"]
    )


def strip_training_only(model: keras.Model) -> None:
    """Remove weight regularisers (training-only) from every layer, nested ones included.

    TF.js 4.22 cannot deserialise tf-keras's "L2" regulariser, and inference never uses it."""
    for layer in model.layers:
        if isinstance(layer, keras.Model):
            strip_training_only(layer)
        for attr in ("kernel_regularizer", "bias_regularizer", "activity_regularizer",
                     "depthwise_regularizer", "beta_regularizer", "gamma_regularizer"):
            if getattr(layer, attr, None) is not None:
                setattr(layer, attr, None)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="v1")
    a = ap.parse_args()
    run = HERE / "runs" / a.run
    metrics = json.loads((run / "metrics.json").read_text(encoding="utf-8"))
    classes: list[str] = metrics["classes"]
    test = metrics["results"][metrics["chosen"]]["test"]["per_class"]

    model = keras.models.load_model(run / "produce_classifier.h5")
    strip_training_only(model)
    tmp = run / "tfjs"
    if tmp.exists():
        shutil.rmtree(tmp)
    tfjs.converters.save_keras_model(model, str(tmp), quantization_dtype_map={"float16": "*"})

    # Parity check: the 16-bit weights loaded back into Keras vs the original model.
    q = tfjs.converters.load_keras_model(str(tmp / "model.json"))
    meta = json.loads((run / "meta_test.json").read_text(encoding="utf-8"))
    import tensorflow as tf  # noqa: PLC0415

    imgs = np.stack([tf.image.resize(tf.io.decode_jpeg(tf.io.read_file(str(HERE / "data" / r["path"])), 3), (224, 224))
                     for r in meta[:200]])
    a_pred = model.predict(imgs, verbose=0).argmax(1)
    b_pred = q.predict(imgs, verbose=0).argmax(1)
    agree = float((a_pred == b_pred).mean())
    print(f"16-bit vs original: same top answer on {agree:.1%} of 200 real test photos")
    if agree < 0.97:
        raise SystemExit("conversion changed too many answers; not exporting")

    labels = [
        {"id": c, "offered": offered(test[c]), "test_photos": test[c]["n"],
         "top1": round(test[c]["top1"], 3) if test[c]["top1"] is not None else None,
         "top3": round(test[c]["top3"], 3) if test[c]["top3"] is not None else None}
        for c in classes
    ]
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(tmp, OUT)
    (OUT / "labels.json").write_text(json.dumps({
        "version": a.run, "input": {"size": 224, "range": "0-255 RGB"},
        "thresholds": THRESHOLDS, "weights": "float16", "export_agreement": round(agree, 3), "classes": labels,
    }, indent=1), encoding="utf-8")
    size = sum(f.stat().st_size for f in OUT.iterdir()) / 1e6
    print(f"exported {len(classes)} classes ({sum(x['offered'] for x in labels)} offered), {size:.1f} MB -> {OUT}")


if __name__ == "__main__":
    main()

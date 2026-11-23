# Photo recogniser

Recognises one fruit, vegetable or herb per photo, in the browser. Results, data and licences:
[docs/model/MODEL_CARD.md](../docs/model/MODEL_CARD.md).

## Reproduce (current model: SigLIP 2 + ingredient head, ONNX)

```powershell
py -3.13 -m venv .venv-clip
.venv-clip\Scripts\python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0
.venv-clip\Scripts\python -m pip install -r model/requirements-clip.txt

# Test photos: needs the R6 data (below) plus, in model/data/oi/, oidv7-class-descriptions.csv,
# oidv7-test-annotations-human-imagelabels.csv and oidv7-val-annotations-human-imagelabels.csv
# from https://storage.googleapis.com/openimages/v7/
.venv-clip\Scripts\python model/clip_testset.py       # whole test photos (about 1,100)

# Training photos: stream the 2.7 GB train label lists and keep the produce rows only
#   (the curl | awk commands are at the top of clip_trainset.py)
.venv-clip\Scripts\python model/clip_trainset.py      # whole train photos (about 8,400)

.venv-clip\Scripts\python model/clip_eval.py          # zero-shot comparison of the candidates
.venv-clip\Scripts\python model/clip_head.py siglip2-b32
.venv-clip\Scripts\python model/clip_export.py siglip2-b32        # ONNX + smaller versions, measured
.venv-clip\Scripts\python model/clip_head.py siglip2-b32 q4h      # head fitted to the 4-bit model
.venv-clip\Scripts\python model/clip_export.py siglip2-b32 q4h    # -> web/public/model
.venv-clip\Scripts\python model/clip_model_card.py    # model card, licence, credits, model/hf/
.venv-clip\Scripts\hf auth login                      # once, with a write token
.venv-clip\Scripts\python model/upload_hf.py          # prints NEXT_PUBLIC_MODEL_BASE for the app
```

Image vectors are cached in `model/runs/clip/cache/`; on 4 CPU cores the whole run takes a few hours.

## R6 model (MobileNetV2, TensorFlow.js; replaced, kept for reference)

The app no longer loads this model; `export_tfjs.py` would overwrite `web/public/model/`.

```powershell
py -3.13 -m venv .venv-ml
.venv-ml\Scripts\python -m pip install -r model/requirements.txt
.venv-ml\Scripts\python -m pip install --no-deps tensorflowjs==4.22.0

.venv-ml\Scripts\python model/prepare_data.py            # Open Images val+test crops, Fruits-360 (~1 h)
.venv-ml\Scripts\python model/prepare_more.py            # + Open Images train-split photos (~1.5 h)
.venv-ml\Scripts\python model/train.py all --run v2 --views 2   # features, head, fine-tune (~1.5 h on 4 CPU cores)
.venv-ml\Scripts\python model/export_tfjs.py --run v2    # -> web/public/model (checks the export first)
.venv-ml\Scripts\python model/model_card.py --run v2     # -> docs/model/MODEL_CARD.md, credits, licence
```

The Open Images metadata (about 3 GB) and the images go to `model/data/` (not in git).
Download these into `model/data/oi/` first:

- https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv
- https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv
- https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv
- https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv
- https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv (2.3 GB, for `prepare_more.py`)
- https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv (640 MB)

## Files

- `clip_testset.py`, `clip_trainset.py` – whole Open Images photos with one human-verified produce label
- `clip_eval.py` – ingredient names and prompts, zero-shot comparison of image-text models
- `clip_head.py` – the ingredient head, tuned on real photos
- `clip_export.py` – ONNX export, 4-bit versions, per-ingredient results and the offer rule
- `clip_model_card.py` – model card, licence, Hugging Face page and photo credits
- `upload_hf.py` – upload to Hugging Face

- `oi_classes.py` – Open Images classes used and the licence/size rules
- `prepare_data.py`, `prepare_more.py` – build the crops, the manifest and the photo credits
- `train.py` – MobileNetV2 features, head, fine-tuning, evaluation on real photos
- `export_tfjs.py` – TF.js export with a parity check and the in-app thresholds
- `model_card.py` – model card, licence file and credits from the run's metrics
- `shims/` – empty `tensorflow_decision_forests` so tensorflowjs imports on Windows
- `OPEN_IMAGES_CREDITS.csv` – author and source of every Open Images photo used

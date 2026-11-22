# Produce classifier

Recognises one fruit or vegetable per photo, in the browser. Results, data and licences:
[docs/model/MODEL_CARD.md](../docs/model/MODEL_CARD.md).

## Reproduce

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

- `oi_classes.py` – Open Images classes used and the licence/size rules
- `prepare_data.py`, `prepare_more.py` – build the crops, the manifest and the photo credits
- `train.py` – MobileNetV2 features, head, fine-tuning, evaluation on real photos
- `export_tfjs.py` – TF.js export with a parity check and the in-app thresholds
- `model_card.py` – model card, licence file and credits from the run's metrics
- `shims/` – empty `tensorflow_decision_forests` so tensorflowjs imports on Windows
- `OPEN_IMAGES_CREDITS.csv` – author and source of every Open Images photo used

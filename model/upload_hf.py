"""Upload the photo model (model/hf/, written by clip_model_card.py) to a public Hugging Face
model repo, and print the address the app loads it from.

Needs a Hugging Face login with write access: .venv-clip/Scripts/hf auth login
Run: .venv-clip/Scripts/python model/upload_hf.py [repo name]
"""

from __future__ import annotations

import sys
from pathlib import Path

from huggingface_hub import HfApi

HF = Path(__file__).resolve().parent / "hf"
FILES = ["README.md", "LICENSE.txt", "labels.json", "head.bin", "vision.onnx"]


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "recipe-harbour-photo-model"
    missing = [f for f in FILES if not (HF / f).exists()]
    if missing:
        sys.exit(f"missing in {HF}: {missing} (run model/clip_model_card.py first)")
    api = HfApi()
    user = api.whoami()["name"]
    repo = f"{user}/{name}"
    api.create_repo(repo, repo_type="model", private=False, exist_ok=True)
    info = api.upload_folder(folder_path=str(HF), repo_id=repo, repo_type="model",
                             allow_patterns=FILES, commit_message="Recipe Harbour photo model")
    sha = info.oid
    print(f"uploaded: https://huggingface.co/{repo}")
    print(f"NEXT_PUBLIC_MODEL_BASE=https://huggingface.co/{repo}/resolve/{sha}/")


if __name__ == "__main__":
    main()

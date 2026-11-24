"""Machine-translate every recipe into the other language (English <-> German).

Uses Facebook's WMT19 news translation models (facebook/wmt19-en-de, facebook/wmt19-de-en,
Apache 2.0), which did best on a sample of recipe sentences among the free models tried
(Opus-MT en-de / de-en and tc-big-gmw-gmw). Recipes are split into sentences (rh_pipeline.mt), each
unique sentence is translated once, and the results are appended to data/translations.jsonl, so the
run can be stopped and resumed. int8 quantisation broke the output, so this runs in float32.

Run: .venv-clip/Scripts/python model/translate_recipes.py [en|de ...]
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import torch
from transformers import FSMTForConditionalGeneration, FSMTTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline" / "src"))
from rh_pipeline import mt
from rh_pipeline.mt import plain_fractions, sentences, suspect, texts

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / "data" / "recipes.json"
OUT = ROOT / "data" / "translations.jsonl"
MODELS = {"en": "facebook/wmt19-en-de", "de": "facebook/wmt19-de-en"}
BATCH, BEAMS = 32, 4


def load() -> dict[tuple[str, str], dict]:
    return mt.load(OUT)


def wanted(recipes: list[dict], lang: str) -> set[str]:
    """Every sentence of the recipes written in `lang`."""
    return {s for r in recipes if r["lang"] == lang for t in texts(r) for s in sentences(t)}


def main() -> None:
    langs = sys.argv[1:] or ["de", "en"]  # German first: smaller, done sooner
    recipes = json.loads(RECIPES.read_text(encoding="utf-8"))
    done = set(load())
    torch.set_num_threads(8)
    for lang in langs:
        todo = sorted(wanted(recipes, lang) - {s for src_lang, s in done if src_lang == lang}, key=len)
        print(f"{lang}: {len(todo)} sentences to translate", flush=True)
        if not todo:
            continue
        tok = FSMTTokenizer.from_pretrained(MODELS[lang])
        model = FSMTForConditionalGeneration.from_pretrained(MODELS[lang]).eval()
        t0, chars = time.time(), 0
        with OUT.open("a", encoding="utf-8") as f, torch.inference_mode():
            for k in range(0, len(todo), BATCH):
                batch = todo[k : k + BATCH]
                enc = tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=400)
                gen = model.generate(**enc, num_beams=BEAMS, max_new_tokens=512, max_length=None)
                for src, dst in zip(batch, tok.batch_decode(gen, skip_special_tokens=True), strict=True):
                    f.write(json.dumps({"lang": lang, "src": src, "dst": dst}, ensure_ascii=False) + "\n")
                f.flush()
                chars += sum(map(len, batch))
                if (k // BATCH) % 20 == 0:
                    rate = chars / (time.time() - t0)
                    left = sum(map(len, todo[k + BATCH :])) / max(rate, 1e-9)
                    done_n = k + len(batch)
                    print(f"{lang}: {done_n}/{len(todo)}  {rate:.0f} chars/s  ~{left / 3600:.1f} h left", flush=True)
    retry(recipes, langs)
    compact(recipes)


def retry(recipes: list[dict], langs: list[str]) -> None:
    """Second pass over suspect lines: fraction characters become "2/3" (the model drops them),
    short lines get a full stop (it returns nothing for a lone word), and the beam is wider. If the
    result is still suspect, the original is kept. Each line is retried at most twice."""
    rows = load()
    for lang in langs:
        want = wanted(recipes, lang)
        todo = sorted(
            s for (src_lang, s), row in rows.items()
            if src_lang == lang and s in want and int(row.get("retry", 0)) < 2
            and (row.get("kept_original") or suspect(s, row["dst"]))
        )
        print(f"{lang}: {len(todo)} lines to retry", flush=True)
        if not todo:
            continue
        tok = FSMTTokenizer.from_pretrained(MODELS[lang])
        model = FSMTForConditionalGeneration.from_pretrained(MODELS[lang]).eval()
        kept = 0
        with OUT.open("a", encoding="utf-8") as f, torch.inference_mode():
            for k in range(0, len(todo), BATCH):
                batch = todo[k : k + BATCH]
                inp = [plain_fractions(s) for s in batch]
                inp = [s if s.endswith((".", "!", "?", ":")) else s + "." for s in inp]
                enc = tok(inp, return_tensors="pt", padding=True, truncation=True, max_length=400)
                gen = model.generate(**enc, num_beams=6, length_penalty=1.4, max_new_tokens=512, max_length=None)
                for src, dst in zip(batch, tok.batch_decode(gen, skip_special_tokens=True), strict=True):
                    if dst.endswith(".") and not src.endswith((".", "!", "?", ":")):
                        dst = dst[:-1]
                    keep = suspect(src, dst)
                    kept += keep
                    tries = int(rows[(lang, src)].get("retry", 0)) + 1
                    row = {"lang": lang, "src": src, "dst": src if keep else dst, "retry": tries, "kept_original": keep}
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                f.flush()
        print(f"{lang}: retried {len(todo)}, kept the original for {kept}", flush=True)


def compact(recipes: list[dict]) -> None:
    """Rewrite the cache with one row per sentence (the latest) that a recipe still uses, sorted,
    so the file in git is stable and holds nothing stale."""
    used = {(lang, s) for lang in ("en", "de") for s in wanted(recipes, lang)}
    rows = {k: v for k, v in load().items() if k in used}
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        for key in sorted(rows):
            f.write(json.dumps(rows[key], ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()

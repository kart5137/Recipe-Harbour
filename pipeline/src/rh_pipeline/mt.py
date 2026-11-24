"""Machine translation of recipes into the other language (English <-> German).

model/translate_recipes.py runs the translation model and appends one row per sentence to
data/translations.jsonl ({"lang", "src", "dst", ...}; later rows replace earlier ones). This
module holds what both sides need: which texts of a recipe are translated, how they are split
into sentences, and how a recipe is put back together from the translated sentences.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

BOUNDARY = re.compile(r"(\w+)[.!?]\s+(?=[A-ZÄÖÜ])")
ABBREV = {
    "etc", "usw", "bzw", "ggf", "evtl", "inkl", "incl", "approx",
    "tbsp", "Tbsp", "min", "Min", "Std", "Pkg", "Pck", "Msp", "Stk",
}
NUM = re.compile(r"\d+")
FRACTIONS = {"½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8"}


def texts(r: dict) -> list[str]:
    """Every piece of visible recipe text that gets translated."""
    out = [r["title"]] + [r.get(k) or "" for k in ("description", "category", "cuisine", "servings_text")]
    for g in r["ingredient_groups"]:
        out.append(g.get("name") or "")
        out += [i["text"] for i in g["items"]]
    out += r.get("steps", []) + (r.get("notes") or []) + (r.get("equipment") or [])
    return [t for t in out if t.strip()]


def sentences(text: str) -> list[str]:
    """Split after a full lower-case word and . ! ? before a capital letter; never after "z. B.",
    "ca.", "1." or another abbreviation, which the model mistranslates when they stand alone."""
    text, out, start = text.strip(), [], 0
    for m in BOUNDARY.finditer(text):
        word = m.group(1)
        if len(word) >= 3 and word.isalpha() and word.lower() == word and word not in ABBREV:
            out.append(text[start : m.end()].strip())
            start = m.end()
    out.append(text[start:].strip())
    return [s for s in out if s]



_QTY = r"\d+(?:[.,/]\d+)?(?:\s+\d+/\d+)?(?:\s*[-–]\s*\d+(?:[.,/]\d+)?)?\s*-?\s*"
IMPERIAL = re.compile(
    _QTY + r"(?:fl\.?\s*oz|oz|ounces?|lbs?|pounds?|°\s*F|degrees\s+F|F\b|inch(?:es)?|in\b|cups?|c\b)",
    re.IGNORECASE,
)
METRIC = re.compile(_QTY + r"(?:g|grams?|kg|ml|l|litres?|liters?|cm|mm|°\s*C|degrees\s+C)\b", re.IGNORECASE)


def plain_fractions(text: str) -> str:
    """"1½ cups" -> "1 1/2 cups", "⅔ cup" -> "2/3 cup": the model drops the fraction characters."""
    for k, v in FRACTIONS.items():
        text = re.sub(rf"(\d?){k}", lambda m, v=v: f"{m.group(1)} {v}" if m.group(1) else v, text)
    return text


def _norm(text: str) -> str:
    return re.sub(r"(?<![\d.,])[.,](\d)", r"0.\1", plain_fractions(text))  # ".5 cm" -> "0.5 cm"


def numbers(text: str) -> list[str]:
    return sorted(NUM.findall(_norm(text)))


def suspect(src: str, dst: str) -> bool:
    """Empty output, a number from the source missing (a dropped quantity), or a number that is
    not in the source. Dropping the imperial half of "1 lb (500 g)" or "175°C (350°F)" is fine
    as long as the metric amount is there: that is what a German recipe would say."""
    if not dst.strip() or ("•" in dst and "•" not in src):  # "•": a fraction it could not read
        return True
    have, want = numbers(dst), numbers(src)
    if any(want.count(n) < have.count(n) for n in set(have)):
        return True  # a number the source does not have
    dropped = [n for n in set(want) for _ in range(want.count(n) - have.count(n))]
    if not dropped:
        return False
    s = _norm(src)
    if not METRIC.search(s):
        return True
    spare = [n for m in IMPERIAL.finditer(s) for n in NUM.findall(m.group(0))]
    return any(dropped.count(n) > spare.count(n) for n in set(dropped))


def load(path: Path) -> dict[tuple[str, str], dict]:
    """Cached translations keyed by (source language, sentence); later rows replace earlier ones."""
    rows: dict[tuple[str, str], dict] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            rows[(row["lang"], row["src"])] = row
    return rows


class Translator:
    """Puts recipe texts back together from translated sentences."""

    def __init__(self, rows: dict[tuple[str, str], dict]):
        self.table = {k: v["dst"] for k, v in rows.items()}
        self.missing = 0

    def text(self, text: str, lang: str) -> str:
        if not text.strip():
            return text
        parts = []
        for s in sentences(text):
            dst = self.table.get((lang, s))
            if dst is None or not dst.strip():
                self.missing += dst is None
                dst = s  # untranslated: keep the original wording rather than drop it
            parts.append(dst)
        return re.sub(r"(\d) / (\d)", r"\1/\2", " ".join(parts))  # the model writes "1 / 2"

    def recipe(self, r: dict) -> dict:
        """The recipe's visible texts in the other language, shaped like the page data."""
        lang = r["lang"]
        t = lambda s: self.text(s or "", lang)  # noqa: E731
        return {
            "title": t(r["title"]),
            "description": t(r.get("description")),
            "category": t(r.get("category")),
            "cuisine": t(r.get("cuisine")),
            "servings_text": t(r.get("servings_text")),
            "groups": [
                {"name": t(g.get("name")) or None, "items": [t(i["text"]) for i in g["items"]]}
                for g in r["ingredient_groups"]
            ],
            "steps": [t(s) for s in r.get("steps", [])],
            "equipment": [t(s) for s in r.get("equipment") or []],
            "notes": [t(s) for s in r.get("notes") or []],
        }

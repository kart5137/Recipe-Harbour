"""Ingredient understanding: map raw ingredient lines to canonical ingredients.

    "2 cups finely chopped onions"       -> qty 2, unit cup, ids [onion]
    "500 g Zwiebeln, gewürfelt"          -> qty 500, unit g, ids [onion]
    "1 Tüte geriebener Emmentaler"       -> qty 1, unit packet, ids [emmental]
    "salt and pepper to taste"           -> ids [salt, black_pepper]
    "2 tbsp margarine or butter"         -> ids [margarine, butter], alternatives

Matching: longest phrase first over normalised tokens, with the line's language names
preferred; then singular forms and German compound heads (Gemüsemais -> mais);
English Cookbook link targets add evidence. More general ids implied by a more specific
one in the same line are dropped (olive_oil implies oil).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

VOCAB_PATH = Path(__file__).resolve().parents[2] / "vocab" / "ingredients.tsv"

DIET_FLAGS_NON_VEG = {"meat", "fish", "gelatin"}
DIET_FLAGS_VEG_ONLY = {"dairy", "egg", "honey"}


# ------------------------------------------------------------------ normalisation
_UMLAUT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "ae", "Ö": "oe", "Ü": "ue"})


def norm(text: str) -> str:
    """Lower case; umlauts as ae/oe/ue, ß as ss; accents stripped; punctuation -> spaces."""
    t = text.lower().translate(_UMLAUT)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.replace("'s ", "s ").replace("’s ", "s ")
    t = re.sub(r"[^a-z0-9%½¼¾⅓⅔⅛]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def tokens(text: str) -> list[str]:
    return norm(text).split()


# ------------------------------------------------------------------ vocabulary
@dataclass(frozen=True)
class Ingredient:
    id: str
    parents: tuple[str, ...]
    group: str
    flags: frozenset[str]
    en: tuple[str, ...]
    de: tuple[str, ...]

    def name(self, lang: str) -> str:
        names = self.de if lang == "de" and self.de else self.en
        return names[0]


@dataclass
class Vocabulary:
    items: dict[str, Ingredient]
    index: dict[str, dict[tuple[str, ...], str]]  # lang -> phrase tokens -> id
    max_len: int
    single: dict[str, dict[str, str]]  # lang -> single-token name -> id (for compounds)

    def ancestors(self, iid: str) -> set[str]:
        out, todo = set(), list(self.items[iid].parents)
        while todo:
            p = todo.pop()
            if p not in out and p in self.items:
                out.add(p)
                todo.extend(self.items[p].parents)
        return out

    def flags(self, iid: str) -> set[str]:
        return set(self.items[iid].flags)


def load_vocab(path: Path = VOCAB_PATH) -> Vocabulary:
    items: dict[str, Ingredient] = {}
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")]
    header = lines[0].split("\t")
    if header != ["id", "parents", "group", "flags", "en", "de"]:
        raise ValueError(f"unexpected vocabulary header: {header}")
    for n, ln in enumerate(lines[1:], start=2):
        cols = ln.split("\t")
        if len(cols) != 6:
            raise ValueError(f"vocabulary row {n}: expected 6 columns, got {len(cols)}: {ln[:60]}")
        iid, parents, group, flags, en, de = cols
        if iid in items:
            raise ValueError(f"duplicate ingredient id: {iid}")
        items[iid] = Ingredient(
            id=iid,
            parents=tuple(p for p in parents.split("|") if p),
            group=group,
            flags=frozenset(f for f in flags.split(",") if f),
            en=tuple(x.strip() for x in en.split("|") if x.strip()),
            de=tuple(x.strip() for x in de.split("|") if x.strip()),
        )
    for it in items.values():
        for p in it.parents:
            if p not in items:
                raise ValueError(f"{it.id}: unknown parent {p}")

    index: dict[str, dict[tuple[str, ...], str]] = {"en": {}, "de": {}}
    single: dict[str, dict[str, str]] = {"en": {}, "de": {}}
    for lang in ("en", "de"):
        for it in items.values():
            for name in getattr(it, lang):
                key = tuple(tokens(name))
                if not key:
                    continue
                prev = index[lang].get(key)
                if prev and prev != it.id:
                    raise ValueError(f"'{name}' ({lang}) names both {prev} and {it.id}")
                index[lang][key] = it.id
                if len(key) == 1:
                    single[lang][key[0]] = it.id
    max_len = max(len(k) for idx in index.values() for k in idx)
    return Vocabulary(items, index, max_len, single)


@cache
def vocab() -> Vocabulary:
    return load_vocab()


# ------------------------------------------------------------------ quantities
_UNITS = {
    # canonical: forms (normalised tokens)
    "cup": "cup cups c",
    "tbsp": "tablespoon tablespoons tbsp tbs tbls tblsp el essloeffel essloeffeln essl",
    "tsp": "teaspoon teaspoons tsp tl teeloeffel teeloeffeln teel",
    "g": "g gram grams gramm gr grams",
    "kg": "kg kilogram kilograms kilogramm kilo",
    "oz": "oz ounce ounces",
    "fl oz": "floz",
    "lb": "lb lbs pound pounds",
    "ml": "ml milliliter milliliters millilitre millilitres",
    "l": "l liter liters litre litres",
    "dl": "dl deciliter deciliters",
    "cl": "cl",
    "quart": "quart quarts qt",
    "pint": "pint pints pt",
    "gallon": "gallon gallons",
    "pinch": "pinch pinches prise prisen",
    "dash": "dash dashes schuss spritzer",
    "knife tip": "msp messerspitze messerspitzen",
    "can": "can cans tin tins dose dosen",
    "packet": "package packages packet packets pack packs pkg pck pkt paeck paeckchen packung packungen tuete tueten "
              "sachet sachets envelope",
    "jar": "jar jars glas glaeser",
    "bottle": "bottle bottles flasche flaschen",
    "tasse": "tasse tassen",
    "becher": "becher",
    "bunch": "bunch bunches bund",
    "sprig": "sprig sprigs zweig zweige zweiglein",
    "stick": "stick sticks stange stangen",
    "slice": "slice slices scheibe scheiben",
    "piece": "piece pieces stueck stuecke stuecken",
    "handful": "handful handfuls handvoll",
    "head": "head heads kopf koepfe",
    "leaf": "leaf leaves blatt blaetter",
    "inch": "inch inches",
    "cm": "cm",
}
_UNIT_OF = {form: unit for unit, forms in _UNITS.items() for form in forms.split()}
_NUM_TOKEN = re.compile(r"^(\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛]|\d+[½¼¾⅓⅔⅛]|\d+/\d+)$")
_FRACS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125}
_WORD_NUM = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "half": 0.5,
    "ein": 1, "eine": 1, "einen": 1, "einer": 1, "zwei": 2, "drei": 3, "vier": 4, "fuenf": 5,
    "halbe": 0.5, "halber": 0.5,
}


def _to_float(tok: str) -> float | None:
    tok = tok.replace(",", ".")
    try:
        if "/" in tok:
            a, b = tok.split("/")
            return float(a) / float(b)
        total = 0.0
        for ch, v in _FRACS.items():
            if ch in tok:
                total += v
                tok = tok.replace(ch, "")
        return total + (float(tok) if tok else 0.0)
    except (ValueError, ZeroDivisionError):
        return None


def parse_quantity(text: str) -> tuple[tuple[float, float] | None, str | None]:
    """Leading quantity (with ranges and mixed fractions) and unit of an ingredient line."""
    raw = text.lower().replace("–", "-").replace("—", "-")
    raw = re.sub(r"\b(\d{1,3})\.(\d{3})\b(?![.,]\d)", r"\1\2", raw)  # German thousands: "1.500 g" -> 1500
    raw = re.sub(r"(\d)\s*([½¼¾⅓⅔⅛])", r"\1\2", raw)  # "1 ½" -> "1½"
    raw = re.sub(r"(\d)\s*-\s*(\d)", r"\1 - \2", raw)
    # Fractions before plain numbers, so "1/2" stays one token.
    toks = re.findall(r"\d+/\d+|\d+(?:[.,]\d+)?[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]|[a-zäöüß.]+|-", raw)
    toks = [t.strip(".") for t in toks if t.strip(".")]
    i, nums = 0, []
    while i < len(toks) and len(nums) < 3:
        t = toks[i]
        if _NUM_TOKEN.match(t):
            # "1 1/2": mixed number
            v = _to_float(t)
            if v is None:
                break
            if nums and nums[-1][1] == "num" and "/" in t:
                nums[-1] = (nums[-1][0] + v, "num")
            else:
                nums.append((v, "num"))
        elif t in {"-", "to", "bis", "or", "oder"} and nums:
            nums.append((0, "sep"))
        elif t in _WORD_NUM and not nums and i == 0:
            nums.append((float(_WORD_NUM[t]), "num"))
        elif t in {"ca", "etwa", "about", "approx", "approximately", "circa", "rund"} and not nums:
            pass
        else:
            break
        i += 1
    values = [v for v, kind in nums if kind == "num"]
    if not values:
        return None, None
    qty = (round(values[0], 3), round(values[-1], 3)) if len(values) > 1 else (round(values[0], 3),) * 2
    unit = None
    while i < len(toks):
        cand = norm(toks[i]).replace(" ", "")
        if cand in _UNIT_OF:
            unit = _UNIT_OF[cand]
            break
        if cand in {"large", "small", "medium", "heaping", "heaped", "level", "rounded", "scant", "generous",
                    "gestrichener", "gestrichene", "gehaeufter", "gehaeufte", "grosse", "grosser", "kleine", "kleiner"}:
            i += 1
            continue
        break
    return qty, unit


# ------------------------------------------------------------------ matching
@dataclass
class Parsed:
    text: str
    ids: list[str] = field(default_factory=list)
    qty: tuple[float, float] | None = None
    unit: str | None = None
    optional: bool = False
    alternatives: bool = False  # "x or y": either satisfies the line
    source: str = ""  # "text", "link", "text+link" or "" when nothing matched

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "ids": self.ids,
            "qty": list(self.qty) if self.qty else None,
            "unit": self.unit,
            "optional": self.optional,
            "alt": self.alternatives,
        }


_GENERIC = {"juice", "fruit"}
_OPTIONAL = re.compile(r"\b(optional|falls gewuenscht|wer mag|if desired|if you like|nach wunsch)\b")
_ALT = re.compile(r"\b(or|oder|bzw)\b")


def _singular_forms(tok: str, lang: str) -> list[str]:
    out = []
    if lang == "en":
        if tok.endswith("ies") and len(tok) > 4:
            out.append(tok[:-3] + "y")
        if tok.endswith("oes"):
            out.append(tok[:-2])
        if tok.endswith("es") and len(tok) > 4:
            out.append(tok[:-2])
        if tok.endswith("s") and len(tok) > 3:
            out.append(tok[:-1])
    else:
        for suf in ("en", "n", "e", "s", "er"):
            if tok.endswith(suf) and len(tok) - len(suf) >= 3:
                out.append(tok[: -len(suf)])
    return out


def _match_tokens(toks: list[str], lang: str, v: Vocabulary) -> list[tuple[int, str]]:
    """(position, id) for every phrase found, longest match first, in the line's own language.

    No cross-language matching: German "Rind" (beef) would turn "grated rind of 1 orange"
    into beef, and German "Sauce" turned "hot pepper sauce" into gravy."""
    found: list[tuple[int, str]] = []
    langs = (lang,)
    i = 0
    while i < len(toks):
        hit = None
        for n in range(min(v.max_len, len(toks) - i), 0, -1):
            key = tuple(toks[i : i + n])
            for lg in langs:
                if key in v.index[lg]:
                    hit = (n, v.index[lg][key])
                    break
            if hit:
                break
        if hit is None:
            tok = toks[i]
            for s in _singular_forms(tok, lang):
                if (s,) in v.index[lang]:
                    hit = (1, v.index[lang][(s,)])
                    break
            if hit is None and lang == "de" and len(tok) >= 6:
                # German compound: the head is the last part (Gemüsemais -> mais).
                best = None
                for name, iid in v.single["de"].items():
                    if len(name) >= 4 and tok.endswith(name) and tok != name:
                        if best is None or len(name) > len(best[0]):
                            best = (name, iid)
                if best:
                    hit = (1, best[1])
        if hit:
            found.append((i, hit[1]))
            i += hit[0]
        else:
            i += 1
    return found


def match_line(text: str, lang: str, links: list[str] | None = None, v: Vocabulary | None = None) -> Parsed:
    v = v or vocab()
    p = Parsed(text=text)
    p.qty, p.unit = parse_quantity(text)
    n = norm(text)
    p.optional = bool(_OPTIONAL.search(n))

    # Match on the text without parenthetical remarks first ("(240 ml)", "(see note)");
    # fall back to the full text if that finds nothing.
    bare = re.sub(r"\([^)]*\)", " ", text)
    hits = _match_tokens(tokens(bare), lang, v) or _match_tokens(tokens(text), lang, v)
    text_ids = [iid for _, iid in hits]

    link_ids = []
    for target in links or []:
        key = tuple(tokens(target))
        iid = v.index["en"].get(key)
        if iid is None and len(key) == 1:
            for s in _singular_forms(key[0], "en"):
                if (s,) in v.index["en"]:
                    iid = v.index["en"][(s,)]
                    break
        if iid:
            link_ids.append(iid)

    # Links are a fallback only: a line about "bell pepper" may also link to "Pepper",
    # and "cranberry juice" to "Cranberry". The text decides when it finds anything.
    ids: list[str] = []
    for iid in text_ids or link_ids:
        if iid not in ids:
            ids.append(iid)
    # Drop ids implied by a more specific id on the same line (olive_oil -> oil).
    implied = set().union(*(v.ancestors(i) for i in ids)) if ids else set()
    ids = [i for i in ids if i not in implied]
    # "Juice of ½ lime", "can of tomatoes with juice", "fruit syrup": the generic word is
    # a description of the specific fruit/vegetable, not a second ingredient.
    if any(v.items[i].group in {"fruit", "vegetable"} and i not in _GENERIC for i in ids):
        ids = [i for i in ids if i not in _GENERIC]
    p.ids = ids
    if len(ids) > 1 and _ALT.search(n):
        p.alternatives = True
    if text_ids:
        p.source = "text"
    elif link_ids:
        p.source = "link"
    return p


# ------------------------------------------------------------------ recipe level
def enrich_recipe(rec: dict, v: Vocabulary | None = None) -> dict:
    """Add parsed ingredients to a recipe dict from parse.Recipe.to_dict().

    Each item {"text", "links"} becomes {"text", "ids", "qty", "unit", "optional", "alt"};
    the recipe gains "ingredient_ids" and "diet" / "diet_source" (the wiki's own label wins)."""
    v = v or vocab()
    parsed: list[Parsed] = []
    for g in rec["ingredient_groups"]:
        items = []
        for it in g["items"]:
            p = match_line(it["text"], rec["lang"], it.get("links"), v)
            parsed.append(p)
            items.append(p.to_dict())
        g["items"] = items
    # Searchable ingredients: everything understood except kitchen items (skewers, wood chips).
    rec["ingredient_ids"] = sorted({i for p in parsed for i in p.ids if "non_food" not in v.flags(i)})
    if rec.get("diet"):
        rec["diet_source"] = "wiki"
    else:
        rec["diet"] = infer_diet(parsed, v)
        rec["diet_source"] = "inferred" if rec["diet"] else ""
    rec["_match_sources"] = [p.source for p in parsed]  # for the coverage report; removed on write
    return rec


def infer_diet(lines: list[Parsed], v: Vocabulary | None = None) -> str:
    """'none' (contains meat/fish/gelatin), 'vegetarian', 'vegan', or '' when unknown.

    Only claims vegetarian/vegan when every non-optional line was understood; a single
    unknown line could be the bacon."""
    v = v or vocab()
    worst = VEGAN
    unknown = False
    for ln in lines:
        if not ln.ids:
            if not ln.optional:
                unknown = True
            continue
        # Each entry states its own diet flags (vegetable_broth must not inherit broth's
        # "diet_unknown"); test_vocabulary_flags_are_explicit guards this.
        classes = [diet_class(v.flags(i)) for i in ln.ids]
        known = [c for c in classes if c != UNKNOWN]
        if ln.alternatives:
            # "margarine or butter": the most permissive known option decides, so the recipe
            # can be made that way. "chicken, beef, or fish": every option is meat -> NON_VEG.
            line = min(known) if known else UNKNOWN
        else:
            line = UNKNOWN if UNKNOWN in classes and (not known or max(known) < NON_VEG) else max(known)
        if line == UNKNOWN:
            if not ln.optional:
                unknown = True
        elif not ln.optional or line != NON_VEG:
            worst = max(worst, line)
    if worst == NON_VEG:
        return "none"
    if unknown:
        return ""
    return "vegetarian" if worst == VEGETARIAN else "vegan"


VEGAN, VEGETARIAN, NON_VEG, UNKNOWN = 0, 1, 2, -1


def diet_class(flags: set[str]) -> int:
    if flags & DIET_FLAGS_NON_VEG:
        return NON_VEG
    if "diet_unknown" in flags:
        return UNKNOWN
    if flags & DIET_FLAGS_VEG_ONLY:
        return VEGETARIAN
    return VEGAN

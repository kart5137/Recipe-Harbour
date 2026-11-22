"""Parse one Wikibooks recipe page (wikitext) into a structured recipe.

English pages use {{recipesummary}} / {{Recipe summary}} and sections such as
"Ingredients" and "Procedure"; German pages use {{Kochbuch/ Vorlage/ RezeptBox}} and
"Zutaten" / "Zubereitung". Sub-headings inside the ingredients become ingredient groups.
A page without ingredients or steps is dropped with a reason, never silently.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from urllib.parse import quote

import mwparserfromhell as mwp

from .config import Source
from .wikitext import template_name, to_text

# ---------------------------------------------------------------- section kinds
_KINDS = {
    "ingredients": ("ingredient", "zutat", "ingredienz"),
    "steps": (
        "procedure", "direction", "method", "instruction", "preparation", "steps", "process",
        "zubereitung", "anleitung", "arbeitsschritt", "herstellung",
    ),
    "equipment": ("equipment", "utensil", "tools", "benötigt", "werkzeug", "geräte", "kochgeschirr", "zubehör"),
    "notes": (
        "note", "tip", "variation", "hinweis", "tipp", "variante", "warning", "serving", "servier",
    ),
}
_NOT_RECIPE_TITLE = re.compile(r"(?i)(^|[:/])\s*(policy|template|vorlage)\b|/recipe template")
_MAX_INGREDIENT_CHARS = 160  # longer "ingredient" lines are notes ("If X is not available, ...")
_DE_GENERIC = {"alle rezepte", "rezepte", "vegetarische rezepte", "vegane rezepte", "rezepte nach art"}
# Headings that are never recipe content (references, navigation, sources).
_SKIP = ("reference", "external link", "see also", "quelle", "literatur", "weblink", "siehe auch", "einzelnachweis")
_HEADING_LINE = re.compile(r"^(={1,6})\s*(.+?)\s*\1\s*(?:<!--.*?-->\s*)?$", re.M)
_TABLE = re.compile(r"^:*\{\|.*?^\|\}", re.M | re.S)  # ":{|" is an indented table
_GALLERY = re.compile(r"<gallery[^>]*>(.*?)</gallery>", re.S | re.I)
_STEP_NUMBER = re.compile(r"^\s*\d+\s*[.)]\s*")


def _kind(heading: str) -> str | None:
    h = heading.lower()
    for kind, keys in _KINDS.items():
        if any(k in h for k in keys):
            return kind
    return None


# ---------------------------------------------------------------- field parsers
_NUM = r"(\d+(?:[.,]\d+)?|\d*\s*[½¼¾⅓⅔]|\d+\s*/\s*\d+)"
_FRAC = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3}


def _num(s: str) -> float:
    s = s.strip().replace(",", ".")
    total = 0.0
    for ch, v in _FRAC.items():
        if ch in s:
            total += v
            s = s.replace(ch, "").strip()
    if "/" in s:
        a, b = s.split("/", 1)
        return total + float(a) / float(b)
    return total + (float(s) if s else 0.0)


_H = r"(?:hours?|hrs?|h|stunden?|std\.?)"
_M = r"(?:minutes?|mins?|m|minuten?)"
_D = r"(?:days?|tage?n?)"


def parse_minutes(text: str) -> tuple[int, int] | None:
    """'20 minutes' -> (20, 20); '1 hour 30 min' -> (90, 90); '20-30 Minuten' -> (20, 30).

    Returns None when no duration is recognised (the raw text is kept elsewhere).
    """
    t = text.lower().replace("–", "-").replace("—", "-")
    t = re.sub(r"\b(ca\.?|etwa|about|approx\.?|approximately|circa|ungefähr|rund)\b", "", t)
    # Range with one unit: "20-30 minutes", "1-2 hours"
    m = re.search(rf"{_NUM}\s*(?:-|to|bis)\s*{_NUM}\s*({_D}|{_H}|{_M})\b", t)
    if m:
        unit = m.group(3)
        mult = 1440 if re.fullmatch(_D, unit) else 60 if re.fullmatch(_H, unit) else 1
        return round(_num(m.group(1)) * mult), round(_num(m.group(2)) * mult)
    total, found = 0.0, False
    for amount, unit in re.findall(rf"{_NUM}\s*({_D}|{_H}|{_M})\b", t):
        mult = 1440 if re.fullmatch(_D, unit) else 60 if re.fullmatch(_H, unit) else 1
        total += _num(amount) * mult
        found = True
    if found and total > 0:
        return round(total), round(total)
    return None


def parse_servings(text: str) -> tuple[int, int] | None:
    t = text.lower().replace("–", "-")
    m = re.search(r"(\d+)\s*(?:-|to|bis|or|oder)\s*(\d+)", t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return (a, b) if 0 < a <= b <= 500 else None
    m = re.search(r"\d+", t)
    if m and 0 < int(m.group()) <= 500:
        n = int(m.group())
        return n, n
    return None


def parse_difficulty(text: str) -> int | None:
    m = re.search(r"[1-5]", text)
    return int(m.group()) if m else None


# ---------------------------------------------------------------- the recipe
@dataclass
class Recipe:
    id: str
    lang: str
    title: str
    url: str
    history_url: str
    revision_id: int
    revision_timestamp: str
    description: str = ""
    category: str = ""
    cuisine: str = ""
    servings_text: str = ""
    servings: tuple[int, int] | None = None
    time_text: str = ""
    minutes: tuple[int, int] | None = None
    difficulty: int | None = None
    diet: str = ""  # from the source only (German "Vegetarisch" field): vegetarian|vegan|none
    image: str = ""
    wiki_categories: list[str] = field(default_factory=list)
    # [{"name": str | None, "items": [{"text": str, "links": [cookbook page titles]}]}]
    ingredient_groups: list[dict] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)
    equipment: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("servings", "minutes"):
            d[k] = list(d[k]) if d[k] else None
        return d


class Dropped(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


_LIST_LINE = re.compile(r"^\s*([*#:]+)\s*(.*)$")
_GROUP_LINE = re.compile(r"^\s*(?:;\s*(.+)|'''(.+?)'''\s*:?\s*)$")
_REDIRECT = re.compile(r"^\s*#\s*(redirect|weiterleitung)\b", re.I)


_LEGEND = re.compile(r"^\s*[^\W\d_]{1,4}\.?\s*=\s*[^\W\d_]")  # "g = Gramm", "EL = Esslöffel"
_LABEL = re.compile(r"^[^\W\d_][^\W\d_\s\-/&]*(?:\s[^\W\d_\-/&]+){0,3}\s*:$")  # "Kuchen:", "For the glaze:"
_LINK = re.compile(r"\[\[\s*([^|\]#]+)")
_LINK_NS = re.compile(r"^\s*:?\s*(cookbook|kochbuch)\s*:\s*", re.I)
_NON_TEXT_NS = re.compile(r"^\s*:?\s*(file|image|datei|bild|category|kategorie|w|wikipedia|wikt|wiktionary)\s*:", re.I)


def _links(fragment: str) -> list[str]:
    """Targets of the cookbook links in a fragment: '[[Cookbook:Olive Oil|oil]]' -> 'Olive Oil'.

    In the English Cookbook these point at ingredient (and unit/technique) pages, a strong
    hint for which canonical ingredient a line means."""
    out = []
    for target in _LINK.findall(fragment):
        if _NON_TEXT_NS.match(target):
            continue
        name = _LINK_NS.sub("", target).strip().replace("_", " ")
        name = re.sub(r"^kochbuch/\s*", "", name, flags=re.I)
        if name:
            out.append(name[0].upper() + name[1:])
    return out


Item = tuple[str | None, str, list[str]]  # (group, text, link targets)


def _list_items(body: str, ingredients: bool = False) -> tuple[list[Item], list[str]]:
    """(items as (group, text, links), plain paragraphs) from a section body.

    In ingredient lists, a short "Label:" item names a group and legends ("g = Gramm") are dropped."""
    items: list[Item] = []
    paras: list[str] = []
    group: str | None = None
    buf: list[str] = []
    for raw in body.splitlines():
        if (g := _GROUP_LINE.match(raw)) and not _LIST_LINE.match(raw):
            group = to_text(g.group(1) or g.group(2)).rstrip(":") or None
            continue
        m = _LIST_LINE.match(raw)
        if m:
            text = to_text(m.group(2))
            if not re.search(r"[^\W\d_]", text) or (ingredients and _LEGEND.match(text)):
                continue  # "g = Gramm" abbreviation legends, "…" filler
            if ingredients and _LABEL.match(text):
                group = text.rstrip(":").strip()  # "Streusel:" as a list item labels what follows
                continue
            if text:
                items.append((group, text, _links(m.group(2))))
            continue
        if raw.strip():
            buf.append(raw)
        elif buf:
            paras.append(to_text("\n".join(buf)))
            buf = []
    if buf:
        paras.append(to_text("\n".join(buf)))
    return items, [p for p in paras if p]


def _table_items(table: str) -> list[Item]:
    """Ingredients from a wikitable (e.g. the baking tables with Ingredient / Count /
    Volume / Weight / Baker's % columns). A full-width bold row names a group."""
    rows: list[list[tuple[str, str]]] = [[]]  # cells as (kind "!"|"|", raw)
    for line in table.splitlines()[1:]:
        s = line.strip()
        if s.startswith("|}"):
            break
        if s.startswith("|-"):
            rows.append([])
            continue
        if s.startswith("|+"):
            continue
        if s[:1] in "!|":
            kind = s[0]
            for cell in re.split(r"\|\||!!", s[1:]):
                # Drop cell attributes ('colspan="5" style=".." | text') but keep links.
                if "|" in cell and "[[" not in cell.split("|", 1)[0] and "=" in cell.split("|", 1)[0]:
                    cell = cell.split("|", 1)[1]
                rows[-1].append((kind, cell))
        elif rows[-1]:
            rows[-1][-1] = (rows[-1][-1][0], rows[-1][-1][1] + " " + s)
    header = [to_text(c).lower() for k, c in rows[0]] if rows and rows[0] and rows[0][0][0] == "!" else []
    for r in rows[1:]:
        if r and all(k == "!" for k, _ in r) and not header:
            header = [to_text(c).lower() for _, c in r]

    def col(*names: str) -> int | None:
        for i, h in enumerate(header):
            if any(n in h for n in names):
                return i
        return None

    i_ing = col("ingredient", "zutat")
    i_amt = [i for i in (col("count", "anzahl"), col("volume", "amount", "quantity", "menge")) if i is not None]
    i_wt = col("weight", "gewicht")
    items: list[Item] = []
    group: str | None = None
    for r in rows:
        raw_cells = [c for k, c in r if k == "|"]
        cells = [to_text(c) for c in raw_cells]
        if not cells or all(k == "!" for k, _ in r):
            continue
        if len(cells) == 1 and len(r) == 1:  # full-width row: a group label
            group = cells[0].strip(":") or None
            continue
        links = _links(" ".join(raw_cells))
        if i_ing is not None and i_ing < len(cells):
            name = cells[i_ing]
            if name.strip().lower().rstrip(":") in {"total", "totals", "gesamt", "summe", "sum"}:
                continue  # the table's sum row, not an ingredient
            links = _links(raw_cells[i_ing]) + [x for x in links if x not in _links(raw_cells[i_ing])]
            amount = " ".join(cells[i] for i in i_amt if i < len(cells) and cells[i])
            weight = cells[i_wt] if i_wt is not None and i_wt < len(cells) else ""
            if amount and weight:
                text = f"{amount} ({weight}) {name}"
            else:
                text = f"{amount or weight} {name}"
        else:
            text = " ".join(c for c in cells if c)
        text = re.sub(r"\s+", " ", text).strip()
        if text and name_like(text):
            items.append((group, text, links))
    return items


def name_like(text: str) -> bool:
    """A table cell row that contains some letters (not just numbers or a percentage)."""
    return bool(re.search(r"[^\W\d_]{2,}", text))


def _gallery_steps(body: str) -> list[str]:
    steps = []
    for block in _GALLERY.findall(body):
        for line in block.splitlines():
            if "|" in line:
                caption = to_text(line.split("|", 1)[1])
                caption = _STEP_NUMBER.sub("", caption)
                if caption:
                    steps.append(caption)
    return steps


def _sections(content: str) -> list[tuple[int, str, str]]:
    """(level, heading text, body) for every heading, split on heading lines.

    Splitting on lines (not on the parse tree) keeps working when a page has an
    unclosed table or tag above its sections."""
    out = []
    ms = list(_HEADING_LINE.finditer(content))
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(content)
        out.append((len(m.group(1)), to_text(m.group(2)), content[m.end():end]))
    return out


def _infobox(code) -> tuple[str, dict[str, str]]:
    for t in code.filter_templates(recursive=False):
        name = template_name(t)
        if name.replace(" ", "") == "recipesummary":
            kind = "en"
        elif "kochbuch/ vorlage/ rezeptbox" in name:
            kind = "de"
        else:
            continue
        params = {}
        for p in t.params:
            key = str(p.name).strip().lower()
            if key == "image" or key == "bild":
                params[key] = _image_name(str(p.value))
            else:
                params[key] = to_text(p.value)
        return kind, params
    return "", {}


def _image_name(raw: str) -> str:
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S).strip()
    m = re.search(r"\[\[\s*(?:file|image|datei|bild)\s*:\s*([^|\]]+)", raw, re.I)
    name = m.group(1) if m else raw.split("|")[0]
    return name.strip()


_FIRST_HEADING = re.compile(r"^=+[^=\n].*?=+\s*$", re.M)
_OPEN_TABLE = re.compile(r"^:*\{\|.*?(?:^\|\}|\Z)", re.M | re.S)


def _old_overview(content: str) -> dict[str, str]:
    """Label/value pairs from the older German "Überblick" box:
    |Rezeptmenge für: / |4 Personen / |Zeitbedarf: / |35 Minuten / |Schwierigkeitsgrad: / |[[Bild:2v5.gif|..]]
    Values are kept raw (the difficulty is only in the image name)."""
    m = _FIRST_HEADING.search(content)
    head = content[: m.start()] if m else content
    t = _OPEN_TABLE.search(head)
    if not t or not re.search(r"Überblick|Rezeptmenge|Zeitbedarf", t.group()):
        return {}
    cells = []
    for line in t.group().splitlines():
        s = line.strip()
        if s.startswith(("|-", "{|", "|}", "!")) or not s.startswith("|"):
            continue
        cells.append(s.lstrip("|").strip())
    out = {}
    for label, value in zip(cells, cells[1:], strict=False):
        if label.endswith(":"):
            out[label[:-1].strip().lower()] = value
    return out


def _lead_text(content: str) -> str:
    """The introduction: prose before the first heading (templates and links resolved)."""
    m = _FIRST_HEADING.search(content)
    lead = _OPEN_TABLE.sub("", content[: m.start()] if m else "")
    paras = [p for p in (to_text(x) for x in re.split(r"\n\s*\n", lead)) if len(p) > 40]
    text = " ".join(paras)
    if len(text) > 600:
        cut = text[:600]
        text = cut[: cut.rfind(". ") + 1] or cut + "…"
    return text


def parse_page(page: dict, source: Source) -> Recipe:
    content = page.get("content") or ""
    if not content.strip():
        raise Dropped("empty")
    if _REDIRECT.match(content):
        raise Dropped("redirect")
    if not page["title"].startswith(source.title_prefix):
        # e.g. "User:Name/Banga stew" drafts and sandboxes that sit in the recipe category
        raise Dropped("not_in_cookbook")
    if _NOT_RECIPE_TITLE.search(page["title"]):
        raise Dropped("not_a_recipe")

    code = mwp.parse(content)
    title = page["title"]
    display = title[len(source.title_prefix):].strip() if title.startswith(source.title_prefix) else title
    base = source.api.rsplit("/w/api.php", 1)[0]
    rec = Recipe(
        id=f"{source.lang}-{page['pageid']}",
        lang=source.lang,
        title=display,
        url=page.get("url") or f"{base}/wiki/{quote(title.replace(' ', '_'), safe=":/()',!")}",
        history_url=f"{base}/w/index.php?title={quote(title.replace(' ', '_'), safe=":/()',!")}&action=history",
        revision_id=page["revid"],
        revision_timestamp=page["timestamp"],
        wiki_categories=[c.split(":", 1)[1] for c in page.get("categories", []) if ":" in c],
    )

    kind, box = _infobox(code)
    if kind == "en":
        rec.category = box.get("category", "")
        rec.cuisine = box.get("cuisine", "")
        rec.servings_text = box.get("servings", "") or box.get("yield", "")
        rec.time_text = box.get("time", "")
        rec.difficulty = parse_difficulty(box.get("difficulty", ""))
        rec.image = box.get("image", "")
    elif kind == "de":
        rec.category = re.sub(r"^\s*kochbuch/\s*", "", box.get("kategorie", ""), flags=re.I)
        rec.servings_text = box.get("portionen", "")
        rec.time_text = box.get("zubereitungszeit", "") or box.get("zeit bis servierung", "")
        rec.difficulty = parse_difficulty(box.get("schwierigkeitsgrad", ""))
        veg = box.get("vegetarisch", "").strip().lower()
        rec.diet = {"ja": "vegetarian", "vegan": "vegan", "nein": "none"}.get(veg, "")
        rec.image = box.get("bild", "")
    if source.lang == "de" and kind != "de":
        old = _old_overview(content)
        rec.servings_text = to_text(old.get("rezeptmenge für", ""))
        rec.time_text = to_text(old.get("zeitbedarf", ""))
        if (d := re.search(r"(\d)\s*v\s*5", old.get("schwierigkeitsgrad", ""))) is not None:
            rec.difficulty = int(d.group(1))
    if source.lang == "de":
        # Most German pages record their type and cuisine only as wiki categories.
        kb = [c.split("/", 1)[1].strip() for c in rec.wiki_categories if c.lower().startswith("kochbuch/")]
        kb = [c for c in kb if c and c.lower() not in _DE_GENERIC]
        cuisines = [c for c in kb if c.lower().endswith("küche")]
        types = [c for c in kb if c not in cuisines]
        rec.category = rec.category or (types[0] if types else "")
        rec.cuisine = rec.cuisine or (cuisines[0] if cuisines else "")
    rec.servings = parse_servings(rec.servings_text) if rec.servings_text else None
    rec.minutes = parse_minutes(rec.time_text) if rec.time_text else None
    rec.description = _lead_text(content)

    # Walk headings: a heading of a known kind starts that kind; deeper unknown
    # headings inherit it (and name an ingredient group).
    ingredients: list[Item] = []
    ing_paras: list[str] = []
    steps: list[str] = []
    step_paras: list[str] = []
    # Lists under unrecognised top-level headings before the first steps section,
    # e.g. "Grundrezept" holding the ingredient list: used only if nothing else is found.
    early_lists: list[Item] = []
    seen_steps = False
    current: str | None = None
    level = 0
    for hlevel, htext, body in _sections(content):
        k = _kind(htext)
        group = None
        if any(s in htext.lower() for s in _SKIP):
            current, level = None, hlevel
            continue
        if k:
            current, level = k, hlevel
        elif current and hlevel > level:
            group = htext
        else:
            current, level = None, hlevel
            if not seen_steps:
                items, _ = _list_items(_TABLE.sub("", _GALLERY.sub("", body)), ingredients=True)
                early_lists += [(g or htext, t, ln) for g, t, ln in items]
            continue
        tables = _TABLE.findall(body)
        gallery = _gallery_steps(body)
        items, paras = _list_items(_TABLE.sub("", _GALLERY.sub("", body)), ingredients=current == "ingredients")
        if current == "ingredients":
            # A heading like "Ingredients for the sauce" is itself a group name.
            head_group = group or (htext if k and htext.lower().strip() not in {"ingredients", "zutaten"} else None)
            for t in tables:
                ingredients += [(g or head_group, x, ln) for g, x, ln in _table_items(t)]
            ingredients += [(g or head_group, t, ln) for g, t, ln in items]
            ing_paras += paras
        elif current == "steps":
            seen_steps = True
            steps += gallery + [t for _, t, _ in items]
            step_paras += paras
        elif current == "equipment":
            rec.equipment += [t for _, t, _ in items]
        elif current == "notes":
            rec.notes += [t for _, t, _ in items] + paras

    if not ingredients and ing_paras:
        ingredients = [(None, p, []) for p in ing_paras if len(p) < 200]
        ing_paras = [p for p in ing_paras if len(p) >= 200]
    if not ingredients and early_lists and (steps or step_paras):
        ingredients = early_lists
    if not steps and step_paras:
        steps = step_paras
    if not steps and ingredients and ing_paras:
        # Method written as prose under the ingredient list (no own heading).
        steps = ing_paras
    rec.notes += [t for _, t, _ in ingredients if len(t) > _MAX_INGREDIENT_CHARS]
    ingredients = [x for x in ingredients if len(x[1]) <= _MAX_INGREDIENT_CHARS]
    if not ingredients:
        raise Dropped("no_ingredients")
    if not steps:
        raise Dropped("no_steps")

    groups: list[dict] = []
    for g, t, ln in ingredients:
        if not groups or groups[-1]["name"] != g:
            groups.append({"name": g, "items": []})
        groups[-1]["items"].append({"text": t, "links": ln})
    rec.ingredient_groups = groups
    rec.steps = steps
    return rec

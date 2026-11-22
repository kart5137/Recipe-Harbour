"""Turn MediaWiki markup into clean plain text.

Handles what the cookbooks actually use: wiki links ([[Cookbook:Onion|onions]]),
unit templates ({{convert|8|oz|g}}, {{frac|1|2}}), references, comments, files,
categories, bold/italic quotes and HTML entities.
"""

from __future__ import annotations

import html
import re

import mwparserfromhell as mwp
from mwparserfromhell.nodes import (
    Comment,
    ExternalLink,
    HTMLEntity,
    Tag,
    Template,
    Text,
    Wikilink,
)

# Links to these namespaces are not text (images, categories, interlanguage).
_DROP_LINK_NS = re.compile(
    r"^\s*:?\s*(file|image|datei|bild|category|kategorie|media)\s*:", re.IGNORECASE
)
_NS_PREFIX = re.compile(r"^\s*:?\s*(cookbook|kochbuch|wikipedia|w|wiktionary|wikt)\s*:\s*", re.I)
_DROP_TAGS = {"ref", "references", "gallery", "math", "syntaxhighlight", "source", "timeline"}


def template_name(t: Template) -> str:
    """Normalised template name: lower case, '_' -> ' ', single spaces, no leading ':'."""
    name = str(t.name).strip().lstrip(":").replace("_", " ")
    return re.sub(r"\s+", " ", name).lower()


def _param(t: Template, key: str | int) -> str:
    key = str(key)
    return to_text(t.get(key).value) if t.has(key) else ""


def _template_text(t: Template) -> str:
    name = template_name(t)
    if name in {"convert", "cvt"}:
        # {{convert|8|oz|g}} -> "8 oz";  {{convert|1|-|2|cup|ml}} -> "1-2 cup"
        args = [_param(t, i) for i in range(1, 6)]
        if len(args) > 2 and args[1] in {"-", "–", "to", "and", "or"}:
            return f"{args[0]}{'-' if args[1] in {'-', '–'} else ' ' + args[1] + ' '}{args[2]} {args[3]}"
        return f"{args[0]} {args[1]}".strip()
    if name in {"frac", "fraction"}:
        a, b, c = (_param(t, i) for i in (1, 2, 3))
        if c:
            return f"{a} {b}/{c}"
        if b:
            return f"{a}/{b}"
        return f"1/{a}" if a else ""
    if name in {"nowrap", "nobr", "lang", "small"}:
        # Text wrappers: the content is the last positional parameter.
        positional = [p for p in t.params if not p.showkey]
        return to_text(positional[-1].value) if positional else ""
    if name in {"!"}:
        return "|"
    return ""  # navigation boxes, infoboxes, citations, maintenance tags


def _render(nodes) -> str:
    out: list[str] = []
    for node in nodes:
        if isinstance(node, Text):
            out.append(str(node.value))
        elif isinstance(node, Wikilink):
            title = str(node.title)
            if _DROP_LINK_NS.match(title):
                continue
            if node.text is not None:
                out.append(_render(node.text.nodes))
            else:
                out.append(_NS_PREFIX.sub("", title).split("#")[0])
        elif isinstance(node, Template):
            out.append(_template_text(node))
        elif isinstance(node, Tag):
            tag = str(node.tag).lower()
            if tag in _DROP_TAGS:
                continue
            if tag == "br":
                out.append(" ")
            elif node.contents is not None:
                out.append(_render(node.contents.nodes))
        elif isinstance(node, ExternalLink):
            if node.title is not None:
                out.append(_render(node.title.nodes))
        elif isinstance(node, HTMLEntity):
            out.append(node.normalize())
        elif isinstance(node, Comment):
            continue
        else:
            out.append(str(node))
    return "".join(out)


def to_text(wikicode) -> str:
    """Plain text for a wikicode fragment (str or parsed), whitespace collapsed."""
    if isinstance(wikicode, str):
        wikicode = mwp.parse(wikicode)
    text = _render(wikicode.nodes)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"__[A-Z]+__", "", text)  # behaviour switches: __NOTOC__, __TOC__ ...
    text = re.sub(r"</?[a-zA-Z][^<>]*>", "", text)  # stray or unclosed HTML tags
    text = re.sub(r"\{\{[^{}]*$", "", text)  # a template left open at the end of a fragment
    text = html.unescape(text).replace(" ", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text

"""Sources, paths and network settings."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Repo root: pipeline/src/rh_pipeline/config.py -> parents[3]
ROOT = Path(os.environ.get("RH_ROOT", Path(__file__).resolve().parents[3]))
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data"
DOCS_DIR = ROOT / "docs" / "data"

# Generic client name: no personal contact details are sent to the wikis.
USER_AGENT = "RecipeHarbourDataPipeline/0.1 (open-source recipe app; polite batch fetch)"
REQUEST_PAUSE_S = 1.0  # between API calls, sequential only
MAXLAG_S = 5  # back off when the wiki's replicas lag (MediaWiki API etiquette)


@dataclass(frozen=True)
class Source:
    lang: str
    api: str
    category: str
    title_prefix: str  # stripped from page titles for display
    licence: str = "CC BY-SA 4.0"
    licence_url: str = "https://creativecommons.org/licenses/by-sa/4.0/"


SOURCES: dict[str, Source] = {
    "en": Source(
        lang="en",
        api="https://en.wikibooks.org/w/api.php",
        category="Category:Recipes",
        title_prefix="Cookbook:",
    ),
    "de": Source(
        lang="de",
        api="https://de.wikibooks.org/w/api.php",
        category="Kategorie:Kochbuch/ Alle Rezepte",
        title_prefix="Kochbuch/",
    ),
}

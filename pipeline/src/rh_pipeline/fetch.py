"""Fetch every recipe page of a Wikibooks category through the MediaWiki API.

One request at a time, a pause between requests, `maxlag` honoured and retries with
backoff, per the MediaWiki API etiquette. Output: one JSON object per page in
data/raw/<lang>_pages.jsonl (wikitext, revision id and timestamp, categories, URL).
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterator
from pathlib import Path

import requests

from .config import MAXLAG_S, RAW_DIR, REQUEST_PAUSE_S, USER_AGENT, Source

log = logging.getLogger(__name__)


class ApiError(RuntimeError):
    pass


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
    return s


def _get(session: requests.Session, api: str, params: dict, retries: int = 5) -> dict:
    params = {**params, "format": "json", "formatversion": "2", "maxlag": MAXLAG_S}
    for attempt in range(retries):
        try:
            r = session.get(api, params=params, timeout=60)
        except requests.RequestException as e:
            wait = 2**attempt * 5
            log.warning("network error %s; retry in %ss", e, wait)
            time.sleep(wait)
            continue
        if r.status_code in (429, 503) or (r.ok and '"code":"maxlag"' in r.text):
            wait = int(r.headers.get("Retry-After", 2**attempt * 5))
            log.warning("server busy (%s); retry in %ss", r.status_code, wait)
            time.sleep(wait)
            continue
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise ApiError(data["error"])
        return data
    raise ApiError(f"gave up after {retries} attempts")


def iter_pages(source: Source, session: requests.Session | None = None) -> Iterator[dict]:
    """Yield one merged page record per category member (content pages only)."""
    session = session or _session()
    params = {
        "action": "query",
        "generator": "categorymembers",
        "gcmtitle": source.category,
        "gcmtype": "page",
        "gcmlimit": 50,  # page content is limited to 50 pages per request
        "prop": "revisions|categories|info",
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "cllimit": "max",
        "clshow": "!hidden",
        "inprop": "url",
    }
    pending: dict[int, dict] = {}
    cont: dict = {}
    while True:
        data = _get(session, source.api, {**params, **cont})
        for p in data.get("query", {}).get("pages", []):
            rec = pending.setdefault(p["pageid"], {"pageid": p["pageid"], "categories": []})
            rec["title"] = p["title"]
            rec["ns"] = p.get("ns")
            if "fullurl" in p:
                rec["url"] = p["fullurl"]
            if p.get("revisions"):
                rev = p["revisions"][0]
                rec["revid"] = rev["revid"]
                rec["timestamp"] = rev["timestamp"]
                rec["content"] = rev["slots"]["main"]["content"]
            rec["categories"].extend(c["title"] for c in p.get("categories", []))
        cont = data.get("continue", {})
        # A batch is complete when the API moves on to the next generator batch
        # (no sub-continuation such as clcontinue/rvcontinue left for these pages).
        batch_done = not cont or set(cont) <= {"gcmcontinue", "continue"}
        if batch_done:
            for rec in pending.values():
                rec["categories"] = sorted(set(rec["categories"]))
                yield rec
            pending = {}
        if not cont:
            return
        time.sleep(REQUEST_PAUSE_S)


def fetch_to_file(source: Source, out_dir: Path = RAW_DIR) -> tuple[Path, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{source.lang}_pages.jsonl"
    tmp = path.with_suffix(".jsonl.part")
    n = 0
    with tmp.open("w", encoding="utf-8") as f:
        for rec in iter_pages(source):
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
            if n % 250 == 0:
                log.info("%s: %d pages", source.lang, n)
    tmp.replace(path)  # only a complete fetch replaces the previous file
    return path, n


def read_pages(lang: str, raw_dir: Path = RAW_DIR) -> list[dict]:
    path = raw_dir / f"{lang}_pages.jsonl"
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

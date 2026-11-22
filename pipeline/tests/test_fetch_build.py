import json
from pathlib import Path

from rh_pipeline import fetch
from rh_pipeline.build import build
from rh_pipeline.config import SOURCES

FIX = Path(__file__).parent / "fixtures"


class FakeResp:
    def __init__(self, data):
        self._data = data
        self.status_code = 200
        self.ok = True
        self.headers = {}
        self.text = json.dumps(data)

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


class FakeSession:
    """Replays API responses in order and records the request parameters."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, params, timeout):
        self.calls.append(params)
        return FakeResp(self.responses.pop(0))


def _page(pid, title, content=None, cats=(), rev=True):
    p = {"pageid": pid, "ns": 102, "title": title, "fullurl": f"https://x/wiki/{pid}"}
    if rev:
        p["revisions"] = [
            {"revid": pid * 10, "timestamp": "2025-05-01T00:00:00Z", "slots": {"main": {"content": content or "x"}}}
        ]
    if cats:
        p["categories"] = [{"ns": 14, "title": c} for c in cats]
    return p


def test_iter_pages_merges_sub_continuations(monkeypatch):
    monkeypatch.setattr(fetch.time, "sleep", lambda s: None)
    responses = [
        # batch 1, part 1: categories continue (clcontinue) -> not complete yet
        {"continue": {"clcontinue": "1|B", "continue": "||"},
         "query": {"pages": [_page(1, "A", cats=["Category:One"]), _page(2, "B")]}},
        # batch 1, part 2: more categories for page 1; next generator batch follows
        {"continue": {"gcmcontinue": "page|C", "continue": "gcmcontinue||"},
         "query": {"pages": [_page(1, "A", cats=["Category:Two"], rev=False), _page(2, "B", rev=False)]}},
        # batch 2: last
        {"batchcomplete": True, "query": {"pages": [_page(3, "C")]}},
    ]
    s = FakeSession(responses)
    pages = list(fetch.iter_pages(SOURCES["en"], session=s))
    assert [p["pageid"] for p in pages] == [1, 2, 3]
    assert pages[0]["categories"] == ["Category:One", "Category:Two"]
    assert pages[0]["revid"] == 10 and pages[0]["content"] == "x"
    assert s.calls[1]["clcontinue"] == "1|B"
    assert all(c["maxlag"] == 5 and c["gcmtype"] == "page" for c in s.calls)


def test_build_writes_dataset_meta_and_profile(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    en = [
        {"pageid": 1, "title": "Cookbook:Stroganoff", "revid": 5, "timestamp": "2026-01-01T00:00:00Z",
         "content": (FIX / "en_stroganoff.wiki").read_text(encoding="utf-8"), "categories": []},
        {"pageid": 2, "title": "Cookbook:Old", "revid": 6, "timestamp": "2010-01-01T00:00:00Z",
         "content": "#REDIRECT [[Cookbook:New]]", "categories": []},
    ]
    de = [
        {"pageid": 7, "title": "Kochbuch/ Aioli", "revid": 8, "timestamp": "2021-05-24T00:00:00Z",
         "content": (FIX / "de_aioli.wiki").read_text(encoding="utf-8"), "categories": []},
    ]
    for lang, pages in (("en", en), ("de", de)):
        (raw / f"{lang}_pages.jsonl").write_text(
            "\n".join(json.dumps(p, ensure_ascii=False) for p in pages), encoding="utf-8"
        )
    meta = build(raw_dir=raw, out_dir=tmp_path, docs_dir=tmp_path / "docs")
    recipes = json.loads((tmp_path / "recipes.json").read_text(encoding="utf-8"))
    assert [r["id"] for r in recipes] == ["en-1", "de-7"]
    assert meta["sources"]["en"]["dropped"] == {"redirect": 1}
    assert meta["total_recipes"] == 2
    profile = (tmp_path / "docs" / "PROFILE.md").read_text(encoding="utf-8")
    assert "| **Recipes kept** | **1** | **1** |" in profile
    assert "Dropped: redirect | 1 | 0" in profile

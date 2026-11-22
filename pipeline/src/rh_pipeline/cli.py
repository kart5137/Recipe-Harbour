"""`rh` command line.

    rh fetch [en|de|all]     download recipe pages (MediaWiki API) to data/raw/
    rh build                 parse raw pages -> data/recipes.json + docs/data/PROFILE.md
    rh export                write the web app search index -> web/src/data/search-index.json
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import SOURCES


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="rh", description="Recipe Harbour data pipeline")
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download recipe pages to data/raw/")
    f.add_argument("lang", nargs="?", default="all", choices=[*SOURCES, "all"])
    sub.add_parser("build", help="parse raw pages into data/recipes.json and the profile")
    sub.add_parser("export", help="write the web app's search index (web/src/data/)")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stderr,
    )
    if args.cmd == "fetch":
        from .fetch import fetch_to_file

        langs = list(SOURCES) if args.lang == "all" else [args.lang]
        for lang in langs:
            path, n = fetch_to_file(SOURCES[lang])
            logging.info("%s: %d pages -> %s", lang, n, path)
    elif args.cmd == "build":
        from .build import build

        build()
    elif args.cmd == "export":
        from .export import export

        export()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

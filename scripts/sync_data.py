#!/usr/bin/env python3
"""Pull the portfolio data out of the Numbers sheet into src/data/portfolio.json,
and cache each piece's thumbnail in public/images/pieces/.

    npm run sync                 # default sheet: ~/Documents/portfolio-data.numbers
    npm run sync -- --refresh    # re-download every thumbnail
    PORTFOLIO_SHEET=/path/to/sheet.numbers npm run sync
"""
import datetime as dt
import html
import io
import json
import os
import re
import unicodedata
import sys
import urllib.request
import warnings
from pathlib import Path

from numbers_parser import Document
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = Path(os.environ.get("PORTFOLIO_SHEET", Path.home() / "Documents/portfolio-data.numbers"))
OUT = ROOT / "src/data/portfolio.json"
IMG_DIR = ROOT / "public/images/pieces"
SITE = json.loads((ROOT / "src/data/site.json").read_text())
PLACES = {k: v for k, v in json.loads((ROOT / "src/data/places.json").read_text()).items() if not k.startswith("_")}
REFRESH = "--refresh" in sys.argv
UA = {"User-Agent": "Mozilla/5.0 (portfolio sync)"}

# Column order on the Pieces tab
C_NO, C_TITLE, C_OUTLET, C_DATE, C_LINK, C_FEAT, C_METHOD = range(7)
C_THEMES, C_PLACES, C_ERA, C_LINE, C_IMG = slice(7, 10), slice(10, 14), 14, 15, 16

warnings.filterwarnings("ignore", message="unsupported version")
problems = []


def text(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^\w\s-]", "", s.lower().replace("’", "").replace("'", ""))
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:60].rsplit("-", 1)[0] if len(s) > 60 else s


def parse_date(v):
    """Return (ISO date, precision). The sheet holds full dates or a bare year."""
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d"), "day"
    s = text(v)
    if re.fullmatch(r"\d{4}", s):
        return f"{s}-03-01", "year"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s, "day"
    problems.append(f"Unreadable date: {s!r}")
    return s, "day"


def by_prefix(mapping, title):
    for key, val in mapping.items():
        if not key.startswith("_") and title.startswith(key.rstrip("?")):
            return val
    return None


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def og_image(page_url):
    try:
        page = fetch(page_url).decode("utf-8", "ignore")
    except Exception as e:
        problems.append(f"Could not open {page_url}: {e}")
        return None
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', page) or re.search(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image', page
    )
    return html.unescape(m.group(1)) if m else None


def cache_image(slug, url):
    dest = IMG_DIR / f"{slug}.jpg"
    if dest.exists() and not REFRESH:
        return f"images/pieces/{dest.name}"
    try:
        im = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    except Exception as e:
        problems.append(f"Could not download image for {slug}: {e}")
        return None
    im.thumbnail((1200, 1200))
    im.save(dest, "JPEG", quality=80, optimize=True, progressive=True)
    return f"images/pieces/{dest.name}"


def column(rows, idx, start=4):
    return [text(r[idx]) for r in rows[start:] if idx < len(r) and text(r[idx])]


def main():
    if not SHEET.exists():
        sys.exit(f"Sheet not found: {SHEET}")
    doc = Document(str(SHEET))
    tabs = {s.name: s.tables[0].rows(values_only=True) for s in doc.sheets}

    outlets = {o["sheet"]: o["id"] for o in SITE["outlets"]}
    copy = {text(r[0]): text(r[3]) for r in tabs["Site copy"][1:] if text(r[0])}
    lists = tabs["Lists"]
    methods, themes, eras = column(lists, 0), column(lists, 2), column(lists, 4)

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    pieces = []
    for row in tabs["Pieces"][1:]:
        no = text(row[C_NO])
        if not no or no.upper() == "EX":  # skip the example row
            continue
        title = text(row[C_TITLE])
        outlet_name = text(row[C_OUTLET])
        outlet = next((oid for name, oid in outlets.items() if outlet_name.startswith(name)), slugify(outlet_name))
        date, precision = parse_date(row[C_DATE])
        slug = slugify(title)

        places = []
        for name in (text(v) for v in row[C_PLACES]):
            if not name or name.lower() == "none":
                continue
            if name not in PLACES:
                problems.append(f"No coordinates for place {name!r} (add it to src/data/places.json)")
                continue
            places.append(name)

        media = by_prefix(SITE["media"], title) or {}
        image = None
        src = media["src"] if "src" in media else og_image(text(row[C_LINK]))
        if src:
            path = cache_image(slug, src)
            if path:
                image = {
                    "src": path,
                    "credit": media.get("credit") or f"via {next((o['name'] for o in SITE['outlets'] if o['id'] == outlet), outlet_name)}",
                    "fit": media.get("fit", "cover"),
                }

        card_line = by_prefix({k[len("Card line: "):]: v for k, v in copy.items() if k.startswith("Card line: ")}, title)
        pieces.append(
            {
                "id": slug,
                "title": title,
                "outlet": outlet,
                "date": date,
                "datePrecision": precision,
                "url": text(row[C_LINK]),
                "featured": text(row[C_FEAT]).lower().startswith("yes"),
                "method": text(row[C_METHOD]),
                "themes": [t for t in (text(v) for v in row[C_THEMES]) if t],
                "places": places,
                "era": text(row[C_ERA]),
                "line": card_line or text(row[C_LINE]),
                "image": image,
            }
        )

    pieces.sort(key=lambda p: p["date"])
    for i, p in enumerate(pieces, 1):
        p["n"] = f"{i:02d}"
        if not p["method"] or not p["themes"]:
            problems.append(f"No. {p['n']} {p['title'][:40]} is missing a method or theme")

    # Themes you typed on the Pieces tab but never added to Lists still count
    for t in (t for p in pieces for t in p["themes"]):
        if t not in themes:
            themes.append(t)

    projects = {}
    for pid, cfg in SITE["projects"].items():
        find = lambda prefix: next((p["id"] for p in pieces if p["title"].startswith(prefix)), None)
        projects[pid] = {
            "name": cfg["name"],
            "film": find(cfg["film"]),
            "essay": find(cfg["essay"]),
            "description": copy.get(cfg["descriptionFrom"], ""),
            "essayNote": copy.get(cfg["essayNoteFrom"], ""),
            "watchLabel": cfg["watchLabel"],
            "essayLabel": cfg["essayLabel"],
            "credit": cfg.get("credit", ""),
        }
        for key in ("film", "essay"):
            if projects[pid][key]:
                next(p for p in pieces if p["id"] == projects[pid][key])["project"] = pid

    data = {
        "pieces": pieces,
        "outlets": [{k: o[k] for k in ("id", "name", "short")} for o in SITE["outlets"]],
        "lists": {"methods": methods, "themes": themes, "eras": eras},
        "places": {k: PLACES[k] for k in sorted({pl for p in pieces for pl in p["places"]})},
        "projects": projects,
        "copy": {
            "bio": copy.get("Bio", ""),
            "leadPhoto": copy.get("Lead photo", ""),
            "exploreIntro": copy.get("Explore intro (optional)", ""),
            "aboutDataset": copy.get("About this dataset", ""),
            "email": copy.get("Contact email", "") or SITE["contact"]["email"],
            "links": [
                {"label": "Substack", "url": copy.get("Substack link", "")},
                {"label": "FilmFreeway", "url": copy.get("FilmFreeway link", "")},
            ]
            + ([{"label": u, "url": u} for u in copy.get("Other links (optional)", "").split() if u] or SITE["contact"]["links"]),
            "colophon": copy.get("Colophon (optional)", ""),
        },
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {len(pieces)} pieces to {OUT.relative_to(ROOT)}")
    for p in problems:
        print("  ! " + p)


if __name__ == "__main__":
    main()

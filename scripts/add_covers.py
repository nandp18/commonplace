#!/usr/bin/env python3
"""Build an import file of book covers. No AI involved, standard library only.

    python3 scripts/add_covers.py ~/Downloads/satsang.zip ~/Downloads/non-satsang.zip

Covers come from the Image column of Notion table exports. Books without one are
looked up on Open Library, and only an exact title match is accepted. To set or
change a cover, add it to import-work/corrections.json:

    {"covers": {"Book title": "https://example.com/cover.jpg"}}

Import the result with Settings > Import. Books that already have a cover keep it.
"""
import argparse
import csv
import io
import json
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

AGENT = {"User-Agent": "Commonplace-cover-lookup/1.0"}


def key(text):
    """
    >>> key("Flowers For Algernon") == key("flowers for algernon!")
    True
    """
    text = unicodedata.normalize("NFC", text).casefold()
    return "".join(c for c in text if unicodedata.category(c)[0] in "LMN")


def table_images(zips):
    """Map each table row's full and short title to its image link."""
    images = {}
    for path in zips:
        with zipfile.ZipFile(Path(path).expanduser()) as archive:
            for name in archive.namelist():
                if not name.endswith("_all.csv"):
                    continue
                text = archive.read(name).decode("utf-8-sig")
                for row in csv.DictReader(io.StringIO(text)):
                    image = (row.get("Image") or "").strip()
                    if image.startswith("https://"):
                        images[key(row["Name"])] = image
                        images[key(row["Name"].split(":")[0])] = image
    return images


def open_library(title, author):
    """Cover link for the first search result whose title matches exactly."""
    query = urllib.parse.urlencode({"title": title, "author": author, "fields": "title,cover_i", "limit": 10})
    request = urllib.request.Request(f"https://openlibrary.org/search.json?{query}", headers=AGENT)
    with urllib.request.urlopen(request, timeout=30) as response:
        docs = json.load(response).get("docs", [])
    for doc in docs:
        if doc.get("cover_i") and key(doc.get("title", "")) == key(title):
            return f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("zips", nargs="+", help="Notion table exports (.zip)")
    parser.add_argument("--books", default="import-work/clean.json")
    parser.add_argument("--out", default="import-work/covers.json")
    parser.add_argument("--corrections", default="import-work/corrections.json")
    args = parser.parse_args()

    path = Path(args.corrections)
    chosen = json.loads(path.read_text("utf-8")).get("covers", {}) if path.exists() else {}
    images = table_images(args.zips)
    books = json.loads(Path(args.books).read_text("utf-8"))["books"]

    found, missing, sources = [], [], {"corrections": 0, "Notion": 0, "Open Library": 0}
    for book in books:
        title, author = book["title"], book.get("author", "")
        source, cover = "corrections", chosen.get(title)
        if not cover:
            source, cover = "Notion", images.get(key(title))
        if not cover:
            source = "Open Library"
            try:
                cover = open_library(title, author)
            except OSError as error:
                print(f"Lookup failed for {title}: {error}")
        if cover:
            sources[source] += 1
            found.append({"title": title, "author": author, "cover": cover, "quotes": []})
        else:
            missing.append(title)

    out = Path(args.out)
    out.write_text(json.dumps({"version": 1, "books": found}, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"{len(found)} of {len(books)} books have covers: {sources}")
    if missing:
        print("No cover found, keeping the generated one:", ", ".join(missing))
    print(f"Wrote {out}.")


if __name__ == "__main__":
    main()

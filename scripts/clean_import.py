#!/usr/bin/env python3
"""Tidy reviewed import files into one clean file for Settings > Import.

Runs locally with the standard library only. Nothing leaves this machine.

    python3 scripts/clean_import.py
    python3 -m doctest scripts/clean_import.py

Reads import-work/review.json and import-work/notion.json and rewrites
import-work/clean.json on every run, so make lasting fixes in
import-work/corrections.json:

    {
      "titles": {"Old title": "New title"},
      "authors": {"Old name": "New name"},
      "text": {"exact text to find": "replacement"}
    }
"""
import argparse
import json
import re
import unicodedata
from pathlib import Path

FRAGMENT_WORDS = 2
LONG_WORDS = 120
CLOSERS = "”’\"')]"
SENTENCE_END = ".!?।…"
SUBTITLE = re.compile(r"^([^:]{3,}?):\s+\S")
# A footnote number stuck to the end of a sentence: "of life.12 Then"
FOOTNOTE = re.compile(r"(?<=[a-z][.,!?;:”’\"])\d{1,2}(?=\s|$)", re.M)


def key(text):
    """Letters and digits only, so punctuation and case can't hide a duplicate.

    >>> key("“Same, words!”") == key("same words")
    True
    """
    text = unicodedata.normalize("NFC", text).casefold()
    return "".join(c for c in text if unicodedata.category(c)[0] in "LMN")


def clean_title(title, fixes):
    """
    >>> clean_title("Quiet: The Power of Introverts", {})
    'Quiet'
    >>> clean_title("Old: Name", {"Old: Name": "New"})
    'New'
    """
    title = " ".join(title.split())
    if title in fixes:
        return fixes[title]
    match = SUBTITLE.match(title)
    return match.group(1).strip() if match else title


def clean_author(author, fixes):
    """Keep the writer and drop translators listed after a semicolon.

    >>> clean_author("Cal Newport;", {})
    'Cal Newport'
    >>> clean_author("Paulo Coelho;James Noel Smith", {})
    'Paulo Coelho'
    >>> clean_author("George Orwel", {"George Orwel": "George Orwell"})
    'George Orwell'
    """
    author = " ".join(author.split(";")[0].split())
    return fixes.get(author, author)


def balance_quotes(text):
    """Remove a quotation mark whose partner fell outside the highlight.

    >>> balance_quotes("“He left. Then she spoke.")
    'He left. Then she spoke.'
    >>> balance_quotes("He left,” she said.”")
    'He left,” she said.'
    >>> balance_quotes("“Whole line.”")
    '“Whole line.”'
    """
    opens, closes = text.count("“"), text.count("”")
    if text.startswith("“") and opens > closes:
        return text[1:].lstrip()
    if text.endswith("”") and closes > opens:
        return text[:-1].rstrip()
    return text


def mark_cut_offs(text):
    """Add the ellipsis the app uses for a quote cut off mid-sentence.

    >>> mark_cut_offs("and then it ended,")
    '…and then it ended…'
    >>> mark_cut_offs("“and so it goes”")
    '“…and so it goes…”'
    >>> mark_cut_offs("A whole sentence.")
    'A whole sentence.'
    >>> mark_cut_offs(mark_cut_offs("half of it"))
    '…half of it…'
    >>> mark_cut_offs("A claim. (Vachanamrut Gadhada I 65)")
    'A claim. (Vachanamrut Gadhada I 65)'
    """
    opening = text[0] if text[:1] in "“‘\"'" else ""
    rest = text[len(opening):]
    if rest[:1].islower():
        text = f"{opening}…{rest}"
    core = text.rstrip(CLOSERS)
    closing = text[len(core):]
    # A closing bracket is a citation, not a sentence that got cut off.
    if core and core[-1] not in SENTENCE_END and not closing.startswith((")", "]")):
        text = core.rstrip(" ,;:—–-") + "…" + closing
    return text


def clean_text(text, lang, replacements):
    """
    >>> clean_text("the\\u200b  end of life.12 Then more", "eng", {})
    '…the end of life. Then more…'
    >>> clean_text("કર્મ\\n\\nયોગ", "guj", {})
    'કર્મ\\n\\nયોગ'
    """
    text = unicodedata.normalize("NFC", text)
    for find, replace in replacements.items():
        text = text.replace(find, replace)
    text = re.sub("[​﻿­]", "", text)
    text = re.sub(r"[ \t ]+", " ", text).strip()
    if lang == "guj":
        return text
    return mark_cut_offs(balance_quotes(FOOTNOTE.sub("", text)))


def page_order(quote):
    """
    >>> page_order({"page": "83-84"}) < page_order({"page": "100"}) < page_order({})
    True
    """
    match = re.match(r"\d+", str(quote.get("page", "")))
    return int(match.group()) if match else 10 ** 9


def clean(files, corrections):
    """Merge import files and return (clean file, report lines)."""
    titles = corrections.get("titles", {})
    authors = corrections.get("authors", {})
    replacements = corrections.get("text", {})
    books, seen, fragments, long_quotes = {}, set(), [], []
    total = changed = duplicates = 0

    for data in files:
        for source in data["books"]:
            title = clean_title(source["title"], titles)
            book = books.setdefault(key(title), {"title": title, "author": "", "date": "", "quotes": []})
            book["author"] = book["author"] or clean_author(source.get("author", ""), authors)
            book["date"] = book["date"] or source.get("date", "")
            for quote in source["quotes"]:
                total += 1
                lang = quote.get("lang", "eng")
                text = clean_text(quote["text"], lang, replacements)
                changed += text != quote["text"]
                if lang != "guj" and len(text.split()) <= FRAGMENT_WORDS and not quote.get("note"):
                    fragments.append(f"{title} p.{quote.get('page', '?')}: {text}")
                    continue
                if key(text) in seen:
                    duplicates += 1
                    continue
                seen.add(key(text))
                if lang != "guj" and len(text.split()) > LONG_WORDS:
                    long_quotes.append(f"{title} p.{quote.get('page', '?')}: {len(text.split())} words")
                kept = {k: v for k, v in quote.items() if k != "flags" and v not in (None, "")}
                book["quotes"].append({**kept, "text": text})

    final = sorted((b for b in books.values() if b["quotes"]), key=lambda b: b["title"].casefold())
    for book in final:
        book["quotes"].sort(key=page_order)
    count = sum(len(b["quotes"]) for b in final)
    report = [
        f"{total} quotes read, {count} kept in {len(final)} books.",
        f"{changed} had their text tidied, {duplicates} duplicates merged, {len(fragments)} fragments removed.",
        "",
        "Removed as fragments:",
        *[f"  {line}" for line in fragments],
        "",
        f"Long passages kept in full ({len(long_quotes)}):",
        *[f"  {line}" for line in long_quotes],
        "",
        "Books:",
        *[f"  {len(b['quotes']):>4}  {b['title']} | {b['author']} | {b['date'] or 'dated by highlight or import day'}" for b in final],
    ]
    return {"version": 1, "books": final}, report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("inputs", nargs="*", default=["import-work/review.json", "import-work/notion.json"])
    parser.add_argument("--out", default="import-work/clean.json")
    parser.add_argument("--corrections", default="import-work/corrections.json")
    args = parser.parse_args()

    path = Path(args.corrections)
    corrections = json.loads(path.read_text("utf-8")) if path.exists() else {}
    files = [json.loads(Path(p).read_text("utf-8")) for p in args.inputs]
    result, report = clean(files, corrections)

    out = Path(args.out)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    log = out.with_name(out.stem + "-report.txt")
    log.write_text("\n".join(report) + "\n", "utf-8")
    print("\n".join(report[:2]))
    print(f"Wrote {out} and {log}.")


if __name__ == "__main__":
    main()

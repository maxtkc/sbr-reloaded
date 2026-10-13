# Extracts the Freshers' Guide PDF into rough markdown (headings, paragraphs, bold, links).
# The output is a draft; src/data/guide.md is the hand-cleaned version.
# Setup: python3 -m venv scripts/guide/.venv && scripts/guide/.venv/bin/pip install pymupdf
# Run: scripts/guide/.venv/bin/python -I scripts/guide/extract.py guide.pdf > draft.md
import re
import sys
from collections import Counter

import pymupdf

HEADER_COLOR = 3895735
SKIP_PAGES = {0, 3}  # cover, table of contents


def heading_level(size: float) -> int:
    if size > 19:
        return 2
    if size > 16:
        return 3
    if size > 13.5:
        return 4
    return 0


def link_for(rect: pymupdf.Rect, links: list) -> str | None:
    for ln in links:
        if ln.get("uri") and pymupdf.Rect(ln["from"]).intersects(rect):
            r = pymupdf.Rect(ln["from"]) & rect
            if r.get_area() > 0.4 * rect.get_area():
                return ln["uri"]
    return None


def render_spans(spans: list, links: list) -> str:
    # Joins spans, wrapping bold runs in ** and linked runs in [text](uri).
    out = []
    cur_uri = None
    buf = ""

    def flush():
        nonlocal buf, cur_uri
        if cur_uri and buf.strip():
            lead = buf[: len(buf) - len(buf.lstrip())]
            trail = buf[len(buf.rstrip()) :]
            out.append(f"{lead}[{buf.strip()}]({cur_uri}){trail}")
        else:
            out.append(buf)
        buf = ""

    for s in spans:
        text = s["text"]
        uri = link_for(pymupdf.Rect(s["bbox"]), links) if text.strip() else cur_uri
        if "Bold" in s["font"] and text.strip():
            core = text.strip()
            text = text[: len(text) - len(text.lstrip())] + f"**{core}**" + text[len(text.rstrip()) :]
        if uri != cur_uri:
            flush()
            cur_uri = uri
        buf += text
    flush()
    s = "".join(out)
    s = s.replace("** **", " ").replace("****", "")
    return s


def main(path: str) -> None:
    doc = pymupdf.open(path)
    md: list[str] = []
    para: list[str] = []
    kind = "p"

    def flush():
        nonlocal para, kind
        if para:
            text = " ".join(para)
            text = re.sub(r"(\w)- (\w)", r"\1-\2", text)
            md.append(("- " if kind == "li" else "") + text)
        para = []
        kind = "p"

    for pno, page in enumerate(doc):
        if pno in SKIP_PAGES:
            continue
        links = page.get_links()
        lines = [l for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])]
        xs = Counter(round(l["bbox"][0]) for l in lines if "".join(s["text"] for s in l["spans"]).strip())
        margin = xs.most_common(1)[0][0] if xs else 0
        for l in lines:
            spans = [s for s in l["spans"]]
            text = "".join(s["text"] for s in spans).strip()
            if not text:
                flush()
                continue
            if text in ("-", "–"):
                continue
            visible = [s for s in spans if s["text"].strip()]
            if all(s["color"] == HEADER_COLOR and "Italic" in s["font"] for s in visible):
                continue
            lvl = heading_level(max(s["size"] for s in visible))
            if lvl and all("Bold" in s["font"] for s in visible):
                flush()
                title = re.sub(r"\s+", " ", text)
                title = re.sub(r"^Chapter \d+\s*", "", title)
                if md and md[-1].startswith("#" * lvl + " ") and title.startswith(("Introduction", "Arriving", "College", "Cambridge", "Checklists", "About")) is False and not re.match(r"^[\d.]+ ", title):
                    md[-1] += " " + title
                else:
                    md.append("#" * lvl + " " + title)
                continue
            indented = round(l["bbox"][0]) > margin + 15
            marker = spans[0]["text"].strip() == "" and spans[0]["size"] < 11 or re.match(r"^\d+\.$", spans[0]["text"].strip())
            if indented and (marker or kind != "li"):
                flush()
                kind = "li"
                if re.match(r"^\d+\.$", spans[0]["text"].strip()):
                    spans = spans[1:]
            elif not indented and kind == "li":
                flush()
            t = render_spans(spans, links).strip()
            if t:
                para.append(t)
    flush()
    out = "\n\n".join(md)
    out = re.sub(r"[ \t]+", " ", out)
    print(out)


if __name__ == "__main__":
    main(sys.argv[1])

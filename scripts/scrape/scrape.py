# One-off scraper for the SBR Google Site. Run: python3 -I scripts/scrape/scrape.py
# Writes raw markdown per page and downloaded images into scripts/scrape/out/.
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

BASE = "https://sites.google.com/cam.ac.uk/sbr/"
PAGES = ["home", "events", "resources-facilities", "committee", "quick-links"]
OUT = Path(__file__).resolve().parent / "out"
UA = {"User-Agent": "Mozilla/5.0"}

# Maps Google Site page paths to the new site's paths.
INTERNAL = {
    "home": "/",
    "events": "/#events",
    "resources-facilities": "/#facilities",
    "committee": "/#committee",
    "quick-links": "/quick-links",
}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def clean_href(href: str) -> str:
    # Unwraps google.com/url?q= redirects and rewrites internal page links.
    if href.startswith("https://www.google.com/url?"):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("q")
        if q:
            href = q[0]
    m = re.match(r"^(?:https://sites\.google\.com)?/cam\.ac\.uk/sbr/([\w-]+)(#.*)?$", href)
    if m:
        return INTERNAL.get(m.group(1), "/")
    return href


def inline(node) -> str:
    # Renders inline content as markdown text with links.
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    if node.name == "a":
        text = "".join(inline(c) for c in node.children).strip()
        href = clean_href(node.get("href", ""))
        if not text or not href or href.startswith("#"):
            return text
        return f"[{text}]({href})"
    if node.name == "br":
        return "\n"
    inner = "".join(inline(c) for c in node.children)
    style = node.get("style", "") or ""
    if node.name in ("b", "strong") or "font-weight: 700" in style:
        s = inner.strip()
        if not s:
            return inner
        lead = inner[: len(inner) - len(inner.lstrip())]
        trail = inner[len(inner.rstrip()) :]
        return f"{lead}**{s}**{trail}"
    return inner


def norm(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = text.replace("****", "")
    return text.strip()


def block_md(sec: Tag, images: list) -> list[str]:
    # Walks a section in document order, emitting headings, paragraphs, list items, images, embeds.
    lines: list[str] = []
    for el in sec.descendants:
        if not isinstance(el, Tag):
            continue
        if el.name == "div" and el.get("data-tooltip") == "Copy heading link":
            continue
        if el.name == "div" and el.get("data-tooltip") and el.find(href=True):
            # Google Sites button: label in data-tooltip, link on a descendant.
            href = clean_href(el.find(href=True)["href"])
            lines.append(f"[{norm(el['data-tooltip'])}]({href})")
        elif el.name == "p" and el.find_parent(attrs={"data-tooltip": True}):
            continue
        elif el.name in ("h1", "h2", "h3", "h4"):
            lvl = int(el.name[1]) + 1 if el.name != "h1" else 1
            lines.append("#" * min(lvl, 4) + " " + norm(el.get_text("")))
        elif el.name == "p":
            if el.find_parent("li"):
                continue
            t = norm(inline(el))
            if t:
                lines.append(t)
        elif el.name == "li":
            if el.find_parent("nav"):
                continue
            t = norm("".join(inline(c) for c in el.children if not (isinstance(c, Tag) and c.name in ("ul", "ol"))))
            depth = len(el.find_parents(["ul", "ol"])) - 1
            if t:
                lines.append("  " * depth + "- " + t)
        elif el.name == "img":
            src = el.get("src", "")
            if "sitesv-images" in src or "googleusercontent" in src:
                images.append(src)
                lines.append(f"![image {len(images)}]({src})")
        elif el.name == "iframe":
            lines.append(f"<iframe src=\"{el.get('src') or el.get('data-src', '')}\"></iframe>")
        elif el.get("data-url") or el.get("data-embed-doc-id"):
            lines.append(f"EMBED {el.get('data-url') or el.get('data-embed-doc-id')}")
    return lines


def scrape_page(page: str) -> dict:
    html = fetch(BASE + page).decode("utf-8")
    (OUT / "html").mkdir(parents=True, exist_ok=True)
    (OUT / "html" / f"{page}.html").write_text(html)
    soup = BeautifulSoup(html, "lxml")
    for s in soup(["script", "style"]):
        s.decompose()
    images: list[str] = []
    md: list[str] = []
    # Skip the first section (page title banner) and keep the rest, including the footer.
    for sec in soup.find_all("section")[1:]:
        lines = block_md(sec, images)
        if lines:
            md.append("\n\n".join(lines))
    # Embedded Drive files and other iframes live in data attributes outside <iframe> tags.
    embeds = sorted(set(re.findall(r"https://drive\.google\.com/file/d/[\w-]+", html)))
    return {"page": page, "markdown": "\n\n---\n\n".join(md), "images": images, "drive": embeds}


def download_images(page: str, images: list[str]) -> list[str]:
    files = []
    d = OUT / "images" / page
    d.mkdir(parents=True, exist_ok=True)
    for i, src in enumerate(images, 1):
        url = re.sub(r"=w\d+(-h\d+)?$", "", src) + "=s0" if "=" in src else src + "=s0"
        data = fetch(url)
        ext = ".png" if data[:4] == b"\x89PNG" else ".jpg"
        f = d / f"{i:02d}{ext}"
        f.write_bytes(data)
        files.append(str(f.relative_to(OUT)))
    return files


def main() -> None:
    pages = sys.argv[1:] or PAGES
    index = {}
    for page in pages:
        res = scrape_page(page)
        res["files"] = download_images(page, res["images"])
        (OUT / f"{page}.md").write_text(res["markdown"] + "\n")
        index[page] = {k: res[k] for k in ("images", "files", "drive")}
        print(page, len(res["images"]), "images", len(res["drive"]), "drive links")
    (OUT / "index.json").write_text(json.dumps(index, indent=2) + "\n")


if __name__ == "__main__":
    main()

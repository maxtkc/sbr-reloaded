# Converts scraped committee and quick-links pages into content collection files.
# Run after scrape.py: python3 -I scripts/scrape/to_content.py
import json
import re
import shutil
import unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts" / "scrape" / "out"
CONTENT = ROOT / "src" / "content"
ASSETS = ROOT / "src" / "assets" / "committee"

# Labels shown on the landing page quick links strip.
FEATURED = {
    "St John's College Sharepoint",
    "Buttery/Bar/Café Hours",
    "Buttery/Bar/Café Menu",
    "Map of the College",
    "IT Support Request",
    "Welfare Resource Pack",
    "Anonymous welfare request form",
    "Upay setup instructions (for booking Formal Hall)",
}

# Internal links that point somewhere more specific than the scraper's page mapping.
LINK_OVERRIDES = {"Map of the College": "/#college-map"}


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def dump(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000))


def committee() -> None:
    md = (OUT / "committee.md").read_text()
    files = json.loads((OUT / "index.json").read_text())["committee"]["files"]
    blocks = md.split("\n\n---\n\n")
    order = 0
    for block in blocks:
        heads = re.findall(r"^### (.+)$", block, re.M)
        if len(heads) < 2 or "contact:" not in block:
            continue
        role, name = heads[0], heads[1]
        order += 1
        slug = slugify(name)
        email = re.search(r"contact: \[([^\]]+)\]", block).group(1)
        body = block.split(f"### {name}", 1)[1].split("contact:", 1)[0]
        bio = "\n\n".join(p.strip() for p in body.strip().split("\n\n") if p.strip())
        entry = {"name": name, "role": role, "email": email, "order": order}
        img = re.search(r"!\[image (\d+)\]", block)
        if img:
            src = OUT / files[int(img.group(1)) - 1]
            ASSETS.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, ASSETS / f"{slug}{src.suffix}")
            entry["photo"] = f"../../assets/committee/{slug}{src.suffix}"
        entry["inGames"] = bool(img)
        entry["bio"] = bio
        dump(CONTENT / "committee" / f"{slug}.yaml", entry)
    print("committee:", order)


def quicklinks() -> None:
    md = (OUT / "quick-links.md").read_text()
    body = md.split("\n\n---\n\n")[1:-1]
    group = "Quick Links"
    order = 0
    for block in body:
        for line in block.split("\n\n"):
            line = line.strip()
            h = re.match(r"^### (.+)$", line)
            bold = re.match(r"^\*\*(.+)\*\*$", line.replace("** **", ""))
            if h:
                group = h.group(1)
                continue
            if bold:
                group = bold.group(1).replace("CollegeServices", "College Services")
                continue
            m = re.match(r"^\[(?:\*\*)?(.+?)(?:\*\*)?\]\((.+)\)$", line)
            if not m:
                continue
            label, url = m.group(1), m.group(2)
            if label == "Accommodation & Bookings":
                group = "Accommodation"
            if group == "Moodle links":
                group = "Moodle"
            order += 1
            entry = {
                "label": label,
                "url": LINK_OVERRIDES.get(label, url),
                "group": group,
                "order": order,
                "featured": label in FEATURED,
            }
            dump(CONTENT / "quicklinks" / f"{order:02d}-{slugify(label)}.yaml", entry)
    print("quicklinks:", order)


if __name__ == "__main__":
    committee()
    quicklinks()

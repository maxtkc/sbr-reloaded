# Splits src/assets/arms/arms.svg into animatable parts and records their boxes and pivots.
# Needs inkscape on PATH (for visual bounding boxes) and npx svgo.
# Run: python3 -I scripts/arms/split.py
# Outputs: src/assets/arms/parts/<name>.svg, src/data/arms-parts.json
import copy
import json
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src/assets/arms/arms.svg"
OUT = ROOT / "src/assets/arms/parts"
JSON = ROOT / "src/data/arms-parts.json"
NS = "http://www.w3.org/2000/svg"
PAD = 2

# Parts in paint order (back to front). Each source is an element id, "<id>[a:b]" for a slice of an element's
# children, or "<id>#<n>" for the nth child. "minus" removes descendants by id from the copied elements.
# pivot is a fraction of the part's box.
PARTS = [
    {"name": "left-yale-legs", "src": ["g15744"], "pivot": [0.75, 0.05]},
    {"name": "right-yale-legs", "src": ["g15744-2"], "pivot": [0.25, 0.05]},
    {"name": "eagle-wing-l", "src": ["use5096"], "pivot": [0.9, 0.5]},
    {"name": "eagle-wing-r", "src": ["g3841[1:34]"], "pivot": [0.1, 0.5]},
    {"name": "eagle-body", "src": ["g6619", "g6566", "g4604", "g8390", "g7469"], "pivot": [0.5, 1.0]},
    {"name": "shield", "src": ["g9376#3", "g43544"], "pivot": [0.5, 0.5]},
    # The far ear sits behind the horns.
    {"name": "left-yale-ear", "src": ["g15753"], "pivot": [0.5, 1.0]},
    {"name": "left-yale-horn-back", "src": ["g15813"], "pivot": [0.9, 0.37]},
    {"name": "left-yale-horn-front", "src": ["g15783"], "pivot": [0.3, 0.79]},
    {"name": "left-yale-tongue", "src": ["g15849"], "pivot": [0.15, 0.5]},
    {"name": "left-yale-tail", "src": ["g16017"], "pivot": [0.8, 0.2]},
    {"name": "left-yale", "src": ["g16399"], "minus": ["g15753", "g15813", "g15783", "g15849", "g16017"], "pivot": [0.5, 0.95]},
    {"name": "right-yale-ear", "src": ["g15753-2"], "pivot": [0.5, 1.0]},
    {"name": "right-yale-horn-back", "src": ["g15813-2"], "pivot": [0.1, 0.37]},
    {"name": "right-yale-horn-front", "src": ["g15783-2"], "pivot": [0.7, 0.79]},
    {"name": "right-yale-tongue", "src": ["g15849-2"], "pivot": [0.85, 0.5]},
    {"name": "right-yale-tail", "src": ["g16017-2"], "pivot": [0.2, 0.2]},
    {
        "name": "right-yale",
        "src": ["g16399-2"],
        "minus": ["g15753-2", "g15813-2", "g15783-2", "g15849-2", "g16017-2"],
        "pivot": [0.5, 0.95],
    },
    {"name": "coronet", "src": ["g89305"], "pivot": [0.5, 1.0]},
]


def resolve(index: dict, spec: str) -> list[ET.Element]:
    if m := re.fullmatch(r"(.+)\[(\d+):(\d+)\]", spec):
        return list(index[m[1]])[int(m[2]) : int(m[3])]
    if m := re.fullmatch(r"(.+)#(\d+)", spec):
        return [list(index[m[1]])[int(m[2])]]
    return [index[spec]]


def drop(el: ET.Element, ids: set[str]) -> None:
    for child in list(el):
        if child.get("id") in ids:
            el.remove(child)
        else:
            drop(child, ids)


def bbox(svg: Path) -> list[float]:
    out = subprocess.run(
        ["inkscape", str(svg), "--query-id=part", "-X", "-Y", "-W", "-H"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    return [float(v) for v in out]


def main() -> None:
    ET.register_namespace("", NS)
    tree = ET.parse(SRC)
    root = tree.getroot()
    index = {e.get("id"): e for e in root.iter() if e.get("id")}
    defs = root.find(f"{{{NS}}}defs")
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"viewBox": root.get("viewBox"), "parts": []}

    with tempfile.TemporaryDirectory() as tmp:
        for part in PARTS:
            svg = ET.Element(f"{{{NS}}}svg", {"viewBox": root.get("viewBox")})
            svg.append(copy.deepcopy(defs))
            group = ET.SubElement(svg, f"{{{NS}}}g", {"id": "part"})
            for spec in part["src"]:
                for el in resolve(index, spec):
                    group.append(copy.deepcopy(el))
            drop(group, set(part.get("minus", [])))

            # Measure the part at full size, then crop the viewBox to it.
            raw = Path(tmp) / f"{part['name']}.svg"
            ET.ElementTree(svg).write(raw, encoding="unicode")
            x, y, w, h = bbox(raw)
            x, y, w, h = round(x - PAD, 2), round(y - PAD, 2), round(w + 2 * PAD, 2), round(h + 2 * PAD, 2)
            svg.set("viewBox", f"{x} {y} {w} {h}")
            svg.set("width", str(w))
            svg.set("height", str(h))
            ET.ElementTree(svg).write(raw, encoding="unicode")

            px, py = part["pivot"]
            manifest["parts"].append(
                {
                    "name": part["name"],
                    "file": f"{part['name']}.svg",
                    "x": x,
                    "y": y,
                    "width": w,
                    "height": h,
                    # Pivot in source (whole arms) coordinates.
                    "pivot": [round(x + px * w, 2), round(y + py * h, 2)],
                }
            )
            print(part["name"], x, y, w, h)

        subprocess.run(
            ["npx", "--yes", "svgo", "--quiet", "-f", tmp, "-o", str(OUT)],
            check=True,
        )

    JSON.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()

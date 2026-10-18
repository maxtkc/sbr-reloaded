# Crops each committee photo to the detected face and writes a circular-masked PNG and a background-removed cutout.
# Setup: uv venv --python 3.12 scripts/faces/.venv && VIRTUAL_ENV=scripts/faces/.venv uv pip install "rembg[cpu]" "opencv-python-headless<5" pillow numpy
# Run: scripts/faces/.venv/bin/python -I scripts/faces/faces.py
# Outputs: src/assets/faces/<slug>.png (circle) and <slug>.cutout.png (transparent background)
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
COMMITTEE = ROOT / "src/content/committee"
OUT = ROOT / "src/assets/faces"
SIZE = 512
# Crop side as a multiple of the detected face box side.
PAD = 1.9
# Shifts the crop centre up by this fraction of the face box, to keep the hair in.
LIFT = 0.12
# Manual face boxes (x, y, w, h in source pixels) for photos where detection fails.
OVERRIDES: dict[str, tuple[int, int, int, int]] = {
    "alexander-corbett": (290, 330, 230, 230),
    "matteo-poletto": (225, 355, 160, 160),
}


def photo_members() -> list[tuple[str, Path]]:
    # Members with a photo and inGames: true, as (slug, photo path).
    out = []
    for f in sorted(COMMITTEE.glob("*.yaml")):
        lines = f.read_text().splitlines()
        photo = next((l.split(":", 1)[1].strip() for l in lines if l.startswith("photo:")), None)
        if photo and "inGames: true" in lines:
            out.append((f.stem, (f.parent / photo).resolve()))
    return out


def detect(img: np.ndarray) -> tuple[int, int, int, int] | None:
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    min_side = min(img.shape[:2]) // 8
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=6, minSize=(min_side, min_side))
    if len(faces) == 0:
        return None
    # Largest face wins.
    return tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3]))


def square_crop(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = box
    side = max(w, h) * PAD
    cx, cy = x + w / 2, y + h / 2 - h * LIFT
    # Clamp the square inside the image, shrinking it if needed.
    side = min(side, img.width, img.height)
    left = min(max(cx - side / 2, 0), img.width - side)
    top = min(max(cy - side / 2, 0), img.height - side)
    return img.crop((round(left), round(top), round(left + side), round(top + side))).resize(
        (SIZE, SIZE), Image.LANCZOS
    )


def circle(img: Image.Image) -> Image.Image:
    mask = Image.new("L", (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask.resize((SIZE, SIZE), Image.LANCZOS))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    session = new_session("u2net_human_seg")
    boxes = {}
    for slug, path in photo_members():
        bgr = cv2.imread(str(path))
        box = OVERRIDES.get(slug) or detect(bgr)
        if box is None:
            print(f"{slug}: no face found, add an override", file=sys.stderr)
            continue
        boxes[slug] = box
        crop = square_crop(Image.open(path).convert("RGB"), box)
        circle(crop).save(OUT / f"{slug}.png", optimize=True)
        remove(crop, session=session).save(OUT / f"{slug}.cutout.png", optimize=True)
        print(f"{slug}: face {box}")
    (Path(__file__).parent / "boxes.json").write_text(json.dumps(boxes, indent=2) + "\n")


if __name__ == "__main__":
    main()

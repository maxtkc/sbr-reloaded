# Downloads non-scraped assets: arms SVG, Samuel Butler portrait, resized college map, footer arms PNG.
# Run after scrape.py: python3 -I scripts/scrape/assets.py
import io
import shutil
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts" / "scrape" / "out"
ASSETS = ROOT / "src" / "assets"
UA = {"User-Agent": "sbr-reloaded/0.1 (https://github.com/maxtkc/sbr-reloaded)"}

ARMS = "https://upload.wikimedia.org/wikipedia/commons/8/8a/Coat_of_arms_of_the_St_John%27s_College.svg"
BUTLER = "https://upload.wikimedia.org/wikipedia/commons/b/b8/Samuel_Butler_by_Charles_Gogin.jpg"


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main() -> None:
    (ASSETS / "arms").mkdir(parents=True, exist_ok=True)
    (ASSETS / "committee").mkdir(parents=True, exist_ok=True)
    (ASSETS / "arms" / "arms.svg").write_bytes(fetch(ARMS))

    butler = Image.open(io.BytesIO(fetch(BUTLER))).convert("RGB")
    butler.thumbnail((900, 1200))
    butler.save(ASSETS / "committee" / "samuel-butler.jpg", quality=85)

    # College map from the Resources page, scaled down from 3000x4333.
    college = Image.open(OUT / "images" / "resources-facilities" / "01.png").convert("RGB")
    college.thumbnail((2000, 2900))
    college.save(ASSETS / "college-map.jpg", quality=88)

    # Footer image used on every page of the old site (a raster of the arms).
    shutil.copy(OUT / "images" / "home" / "01.png", ASSETS / "arms" / "arms-footer.png")


if __name__ == "__main__":
    main()

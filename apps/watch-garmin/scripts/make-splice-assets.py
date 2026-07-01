#!/usr/bin/env python3
"""Generate Splice launcher + landing bitmaps from the Splice app icon set."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit("pip install pillow") from None

ROOT = Path(__file__).resolve().parents[1]
DRAW = ROOT / "resources" / "drawables"
SRC = Path("/Users/kieronholt/Projects/Splice/splice-icon-256.png")

img = Image.open(SRC).convert("RGBA")
img.resize((60, 60), Image.Resampling.LANCZOS).save(DRAW / "launcher_icon.png")
img.resize((160, 160), Image.Resampling.LANCZOS).save(DRAW / "splice_logo.png")
print("wrote launcher_icon.png (60x60) and splice_logo.png (160x160) from splice-icon-256.png")

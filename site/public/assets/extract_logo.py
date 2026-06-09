"""로고 누끼 — 고해상도 원본 단독 정밀 배경 제거."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from logo_matting import extract_rgba

ROOT = Path(__file__).parent
SRC = ROOT / "ai-judge-logo.source.png"
OUT = ROOT / "ai-judge-logo.png"


def extract_logo() -> None:
    rgba = extract_rgba(Image.open(SRC))
    Image.fromarray(rgba).save(OUT, optimize=True)
    print(
        f"saved {OUT.name} {rgba.shape[1]}x{rgba.shape[0]} "
        f"opaque={(rgba[:,:,3]>220).sum()} transparent={(rgba[:,:,3]<15).sum()}"
    )


if __name__ == "__main__":
    extract_logo()

"""로고 누끼 — 고해상도 원본 단독 정밀 배경 제거."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).parent
SRC = ROOT / "ai-judge-logo.source.png"
OUT = ROOT / "ai-judge-logo.png"


def _corner_bg_mask(rgb: np.ndarray, tolerance: int) -> np.ndarray:
    h, w = rgb.shape[:2]
    ref = np.median(
        [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]], axis=0
    ).astype(np.int16)

    def is_bg(y: int, x: int) -> bool:
        px = rgb[y, x].astype(np.int16)
        return int(np.abs(px - ref).max()) <= tolerance

    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if is_bg(y, x):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or bg[y, x]:
            continue
        if not is_bg(y, x):
            continue
        bg[y, x] = True
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return bg


def _drop_small(mask: np.ndarray, min_area: int) -> np.ndarray:
    h, w = mask.shape
    seen = np.zeros_like(mask)
    kept = np.zeros_like(mask)
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(x, y)])
            pts: list[tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                if cx < 0 or cy < 0 or cx >= w or cy >= h:
                    continue
                if seen[cy, cx] or not mask[cy, cx]:
                    continue
                seen[cy, cx] = True
                pts.append((cx, cy))
                q.extend([(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)])
            if len(pts) >= min_area:
                for cx, cy in pts:
                    kept[cy, cx] = True
    return kept


def _decontaminate(rgba: np.ndarray, bg: np.ndarray) -> np.ndarray:
    out = rgba.astype(np.float32).copy()
    rgb = out[:, :, :3]
    a = np.maximum(out[:, :, 3] / 255.0, 1e-3)[:, :, np.newaxis]
    out[:, :, :3] = np.clip((rgb - (1.0 - a) * bg) / a, 0, 255)
    return out.astype(np.uint8)


def extract_logo() -> None:
    src = np.array(Image.open(SRC).convert("RGBA"))
    rgb = src[:, :, :3]
    luma = rgb.max(axis=2).astype(np.float32)

    bg = _corner_bg_mask(rgb, tolerance=13)

    # 밝기 기반 알파 + 배경 마스크
    alpha = np.clip((luma - 24) * 7.5, 0, 255)
    alpha[bg] = 0

    fg = alpha > 36
    fg = _drop_small(fg, min_area=36)
    alpha = np.where(fg, alpha, 0)

    # 가장자리 부드럽게
    alpha_u8 = Image.fromarray(alpha.astype(np.uint8))
    alpha_u8 = alpha_u8.filter(ImageFilter.GaussianBlur(radius=0.35))
    alpha = np.array(alpha_u8, dtype=np.float32)
    alpha = np.where(fg, np.clip(alpha * 1.05, 0, 255), 0)

    bg_color = np.median(
        [rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]], axis=0
    ).astype(np.float32)

    out = src.copy()
    out[:, :, :3] = rgb
    out[:, :, 3] = alpha.astype(np.uint8)
    out = _decontaminate(out, bg_color)

    Image.fromarray(out).save(OUT, optimize=True)
    print(
        f"saved {OUT.name} {out.shape[1]}x{out.shape[0]} "
        f"opaque={(out[:,:,3]>220).sum()} transparent={(out[:,:,3]<15).sum()}"
    )


if __name__ == "__main__":
    extract_logo()

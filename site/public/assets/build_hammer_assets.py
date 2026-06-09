"""법봉 레이어·홈 레이어 — 원본 로고(732×398)에서 망치만 분리."""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
LOGO = ROOT / "ai-judge-logo.png"

# 616×338 기준 좌표 → 현재 로고 크기에 맞게 스케일
REF_W, REF_H = 616, 338

HEAD_POLY_REF = [
    (155, 95),
    (175, 58),
    (210, 52),
    (245, 62),
    (262, 88),
    (268, 118),
    (262, 148),
    (245, 172),
    (218, 188),
    (190, 195),
    (168, 188),
    (158, 168),
    (152, 140),
    (155, 95),
]

HANDLE_POINTS_REF = [
    (149, 195),
    (158, 182),
    (172, 168),
    (188, 152),
    (205, 138),
    (218, 125),
]

PIVOT_REF = (149, 195)
SEEDS_REF = [(200, 115), (149, 195), (220, 160)]
HANDLE_ELLIPSE_REF = [138, 186, 160, 204]
BASE_EXCLUDE_REF = (168, 200, 262, 272)
WAVE_X_REF = 155
WAVE_Y_REF = 235


def _scale_point(x: int, y: int, sx: float, sy: float) -> tuple[int, int]:
    return int(round(x * sx)), int(round(y * sy))


def _flood_keep_connected(
    mask: np.ndarray, seeds: list[tuple[int, int]], w: int, h: int
) -> np.ndarray:
    kept = np.zeros_like(mask)
    for sx, sy in seeds:
        if sy >= h or sx >= w or not mask[sy, sx]:
            continue
        q: deque[tuple[int, int]] = deque([(sx, sy)])
        while q:
            x, y = q.popleft()
            if x < 0 or y < 0 or x >= w or y >= h:
                continue
            if kept[y, x] or not mask[y, x]:
                continue
            kept[y, x] = True
            q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return kept


def build_mask(alpha: np.ndarray, w: int, h: int) -> np.ndarray:
    sx, sy = w / REF_W, h / REF_H
    head_poly = [_scale_point(x, y, sx, sy) for x, y in HEAD_POLY_REF]
    handle_pts = [_scale_point(x, y, sx, sy) for x, y in HANDLE_POINTS_REF]
    ellipse = [_scale_point(v, 0, sx, sy)[0] if i % 2 == 0 else _scale_point(0, v, sx, sy)[1]
               for i, v in enumerate(HANDLE_ELLIPSE_REF)]
    # fix ellipse - HANDLE_ELLIPSE is [x0,y0,x1,y1]
    ex0, ey0 = _scale_point(HANDLE_ELLIPSE_REF[0], HANDLE_ELLIPSE_REF[1], sx, sy)
    ex1, ey1 = _scale_point(HANDLE_ELLIPSE_REF[2], HANDLE_ELLIPSE_REF[3], sx, sy)
    bx0, by0 = _scale_point(BASE_EXCLUDE_REF[0], BASE_EXCLUDE_REF[1], sx, sy)
    bx1, by1 = _scale_point(BASE_EXCLUDE_REF[2], BASE_EXCLUDE_REF[3], sx, sy)
    wave_x = int(round(WAVE_X_REF * sx))
    wave_y = int(round(WAVE_Y_REF * sy))
    seeds = [_scale_point(x, y, sx, sy) for x, y in SEEDS_REF]

    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    draw.polygon(head_poly, fill=255)
    draw.line(handle_pts, fill=255, width=max(2, int(round(16 * sx))))
    draw.ellipse([ex0, ey0, ex1, ey1], fill=255)

    mask = np.array(img) > 128

    for y in range(by0, by1):
        for x in range(bx0, bx1):
            if 0 <= y < h and 0 <= x < w:
                mask[y, x] = False

    for y in range(h):
        for x in range(w):
            if x < wave_x and y < wave_y:
                mask[y, x] = False

    mask &= alpha >= 30
    mask = _flood_keep_connected(mask, seeds, w, h)
    return mask


def fill_gaps(full: np.ndarray, mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    alpha = full[:, :, 3]
    hammer = np.zeros_like(full)
    hammer[mask & (alpha >= 40)] = full[mask & (alpha >= 40)]

    gap = mask & (alpha < 40)
    for _ in range(48):
        for y in range(h):
            for x in range(w):
                if not gap[y, x] or hammer[y, x, 3] >= 250:
                    continue
                y0, y1 = max(0, y - 4), min(h, y + 5)
                x0, x1 = max(0, x - 4), min(w, x + 5)
                nb = hammer[y0:y1, x0:x1]
                sel = nb[:, :, 3] >= 80
                if not sel.any():
                    continue
                for c in range(3):
                    hammer[y, x, c] = int(nb[:, :, c][sel].mean())
                hammer[y, x, 3] = 255

    hammer[mask & (hammer[:, :, 3] > 0), 3] = 255
    hammer[~mask] = (0, 0, 0, 0)
    return hammer


def hit_area(mask: np.ndarray) -> dict[str, float]:
    ys, xs = np.where(mask)
    h, w = mask.shape
    if len(xs) == 0:
        return {"left": 8, "top": 18, "width": 36, "height": 48}
    pad_x, pad_y = w * 0.015, h * 0.015
    left = max(0, xs.min() - pad_x) / w * 100
    top = max(0, ys.min() - pad_y) / h * 100
    right = min(w, xs.max() + pad_x) / w * 100
    bottom = min(h, ys.max() + pad_y) / h * 100
    return {
        "left": round(float(left), 2),
        "top": round(float(top), 2),
        "width": round(float(right - left), 2),
        "height": round(float(bottom - top), 2),
    }


def main() -> None:
    full = np.array(Image.open(LOGO).convert("RGBA"))
    h, w = full.shape[:2]
    sx, sy = w / REF_W, h / REF_H
    alpha = full[:, :, 3]
    mask = build_mask(alpha, w, h)
    hammer = fill_gaps(full, mask)

    dilated = mask.copy()
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        dilated[ny, nx] = True

    hammer_layer = full.copy()
    hammer_layer[~mask] = (0, 0, 0, 0)
    for y in range(h):
        for x in range(w):
            if mask[y, x] and hammer_layer[y, x, 3] < 40:
                hammer_layer[y, x] = hammer[y, x]

    home = full.copy()
    home[dilated] = (0, 0, 0, 0)

    pivot_x, pivot_y = _scale_point(*PIVOT_REF, sx, sy)
    pivot_pct = (pivot_x / w * 100, pivot_y / h * 100)
    hit = hit_area(mask)

    Image.fromarray(hammer_layer).save(ROOT / "ai-judge-hammer-layer.png", optimize=True)
    Image.fromarray(home).save(ROOT / "ai-judge-logo-home.png", optimize=True)

    verify = Image.fromarray(home, "RGBA")
    verify.alpha_composite(Image.fromarray(hammer_layer, "RGBA"))
    verify.save(ROOT / "_verify_hammer_composite.png", optimize=True)

    meta = {
        "width": w,
        "height": h,
        "pivotX": round(pivot_pct[0], 2),
        "pivotY": round(pivot_pct[1], 2),
        "restRotate": 0,
        "strikeRotate": 28,
        "hitArea": hit,
    }
    (ROOT / "hammer-meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"canvas {w}x{h} pivot {pivot_pct} hit {hit}")
    print(f"hammer bbox {Image.fromarray(hammer_layer).getbbox()}")


if __name__ == "__main__":
    main()

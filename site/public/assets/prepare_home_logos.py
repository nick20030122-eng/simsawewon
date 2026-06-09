"""홈 전용 — 배포 로고 픽셀 + 사용자 망치 PNG 전체 + 마스크 정밀 보정."""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from logo_matting import dilate_mask, extract_rgba  # noqa: E402

HAMMER_SRC = ROOT / "ai-judge-hammer-src.png"
FULL_LOGO = ROOT / "ai-judge-logo.png"

OFFSET_X = 26
OFFSET_Y = -8


def mask_from_hammer_src(img: Image.Image, size: tuple[int, int]) -> np.ndarray:
    rgba = extract_rgba(
        img,
        tolerance=14,
        luma_offset=20,
        luma_scale=7.0,
    )
    alpha_u8 = Image.fromarray(rgba[:, :, 3], mode="L").resize(
        size, Image.Resampling.LANCZOS
    )
    return np.array(alpha_u8) >= 88


def shift_mask(mask: np.ndarray, dx: int, dy: int) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros_like(mask)
    ys, xs = np.where(mask)
    ny = ys + dy
    nx = xs + dx
    valid = (ny >= 0) & (ny < h) & (nx >= 0) & (nx < w)
    out[ny[valid], nx[valid]] = True
    return out


def _flood_component(mask: np.ndarray, sx: int, sy: int) -> np.ndarray:
    h, w = mask.shape
    kept = np.zeros_like(mask)
    if not (0 <= sx < w and 0 <= sy < h and mask[sy, sx]):
        return kept
    q: deque[tuple[int, int]] = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or kept[y, x] or not mask[y, x]:
            continue
        kept[y, x] = True
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return kept


def clean_hammer_mask(mask: np.ndarray, full: np.ndarray) -> np.ndarray:
    """빨간 표시: 손잡i 아래 잔여 픽셀 제거. 파란 표시: 가장자리 매끈화."""
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return mask

    grip_x = int(np.percentile(xs, 8))
    grip_y = int(np.percentile(ys, 88))

    # 1) 손잡i 그립과 연결된 본체만 유지 (아래 잔여 조각 제거)
    main = _flood_component(mask, grip_x, grip_y)
    if main.any():
        mask = main

    # 2) 손잡i 끝 아래 4px 이내 작은 조각 제거 (빨간 영역)
    below = grip_y + 4
    for y in range(below, mask.shape[0]):
        if mask[y].sum() and mask[y].sum() < 20:
            mask[y, :] = False

    # 3) 배포 로고에 실제 픽셀이 있는 영역과 교집합 (허공 마스크 제거)
    logo_vis = full[:, :, 3] >= 140
    refined = mask & logo_vis
    if refined.sum() >= mask.sum() * 0.82:
        mask = refined
        # 교집합 후 끊긴 작은 조각(빨간 표시) 제거 — 그립 본체만 유지
        mask = _flood_component(mask, grip_x, grip_y)

    return mask


def build_layers(
    full: np.ndarray, mask: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """망치·받침대 = 배포 로고 픽셀 그대로. 합성 시 원본과 동일."""
    draw = dilate_mask(mask, radius=1)

    hammer = np.zeros_like(full)
    hammer[draw] = full[draw]

    home = full.copy()
    home[draw] = (0, 0, 0, 0)
    return home, hammer


def compute_pivot(mask: np.ndarray) -> tuple[float, float]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return 20.0, 64.0
    px = float(np.percentile(xs, 8))
    py = float(np.percentile(ys, 88))
    w, h = mask.shape[1], mask.shape[0]
    return px / w * 100, py / h * 100


def hit_area(mask: np.ndarray) -> dict[str, float]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return {"left": 10, "top": 20, "width": 35, "height": 48}
    w, h = mask.shape[1], mask.shape[0]
    grip_y = int(np.percentile(ys, 88))
    keep = ys <= grip_y + 2
    xs_k, ys_k = xs[keep], ys[keep]
    pad_x, pad_y = w * 0.01, h * 0.01
    left = max(0, xs_k.min() - pad_x) / w * 100
    top = max(0, ys_k.min() - pad_y) / h * 100
    right = min(w, xs_k.max() + pad_x) / w * 100
    bottom = min(h, ys_k.max() + pad_y) / h * 100
    return {
        "left": round(float(left), 2),
        "top": round(float(top), 2),
        "width": round(float(right - left), 2),
        "height": round(float(bottom - top), 2),
    }


def main() -> None:
    if not FULL_LOGO.exists():
        raise SystemExit(f"배포 로고 없음: {FULL_LOGO}")

    full = np.array(Image.open(FULL_LOGO).convert("RGBA"))
    h, w = full.shape[:2]

    base_mask = mask_from_hammer_src(Image.open(HAMMER_SRC), (w, h))
    shifted = shift_mask(base_mask, OFFSET_X, OFFSET_Y)
    mask = clean_hammer_mask(shifted, full)

    home, hammer_layer = build_layers(full, mask)

    verify = Image.fromarray(home, "RGBA")
    verify.alpha_composite(Image.fromarray(hammer_layer, "RGBA"))

    pivot_x, pivot_y = compute_pivot(mask)
    hit = hit_area(mask)

    meta = {
        "width": w,
        "height": h,
        "offsetX": OFFSET_X,
        "offsetY": OFFSET_Y,
        "pivotX": round(pivot_x, 2),
        "pivotY": round(pivot_y, 2),
        "restRotate": 0,
        "strikeRotate": 32,
        "hitArea": hit,
        "impact": {
            "left": round(pivot_x + 4, 2),
            "top": round(pivot_y - 2, 2),
        },
    }

    Image.fromarray(home, "RGBA").save(ROOT / "ai-judge-logo-home.png", optimize=True)
    Image.fromarray(hammer_layer, "RGBA").save(
        ROOT / "ai-judge-hammer-layer.png", optimize=True
    )
    verify.save(ROOT / "_verify_hammer_composite.png", optimize=True)
    (ROOT / "hammer-meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"pivot {pivot_x:.2f}% {pivot_y:.2f}% hit {hit}")
    print(f"mask pixels {mask.sum()} bbox {Image.fromarray(hammer_layer).getbbox()}")


if __name__ == "__main__":
    main()

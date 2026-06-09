"""로고 누끼 — 배포본(extract_logo)과 동일한 정밀 배경 제거."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).parent


def corner_bg_mask(rgb: np.ndarray, tolerance: int) -> np.ndarray:
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


def drop_small(mask: np.ndarray, min_area: int) -> np.ndarray:
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


def decontaminate(rgba: np.ndarray, bg: np.ndarray) -> np.ndarray:
    out = rgba.astype(np.float32).copy()
    rgb = out[:, :, :3]
    a = np.maximum(out[:, :, 3] / 255.0, 1e-3)[:, :, np.newaxis]
    out[:, :, :3] = np.clip((rgb - (1.0 - a) * bg) / a, 0, 255)
    return out.astype(np.uint8)


def extract_rgba(
    img: Image.Image,
    *,
    tolerance: int = 13,
    luma_offset: float = 24,
    luma_scale: float = 7.5,
    alpha_threshold: float = 36,
    min_area: int = 36,
    blur_radius: float = 0.35,
    alpha_boost: float = 1.05,
) -> np.ndarray:
    """배포 로고와 동일한 누끼 파이프라인."""
    src = np.array(img.convert("RGBA"))
    rgb = src[:, :, :3]
    luma = rgb.max(axis=2).astype(np.float32)

    bg = corner_bg_mask(rgb, tolerance=tolerance)

    alpha = np.clip((luma - luma_offset) * luma_scale, 0, 255)
    alpha[bg] = 0

    fg = alpha > alpha_threshold
    fg = drop_small(fg, min_area=min_area)
    alpha = np.where(fg, alpha, 0)

    alpha_u8 = Image.fromarray(alpha.astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(radius=blur_radius)
    )
    alpha = np.array(alpha_u8, dtype=np.float32)
    alpha = np.where(fg, np.clip(alpha * alpha_boost, 0, 255), 0)

    bg_color = np.median(
        [rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]], axis=0
    ).astype(np.float32)

    out = src.copy()
    out[:, :, :3] = rgb
    out[:, :, 3] = alpha.astype(np.uint8)
    out = decontaminate(out, bg_color)
    out[~fg, 3] = 0
    return out


def harmonize_to_reference(hammer: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """망치 색상을 배포 로고(흰색 계조)와 동일하게 맞춤 — 알파·형태는 유지."""
    out = hammer.copy()
    vis = hammer[:, :, 3] > 128
    ref_vis = reference[:, :, 3] > 128
    if not vis.any() or not ref_vis.any():
        return out

    ref_luma = reference[:, :, :3].max(axis=2)[ref_vis]
    r_lo = float(np.percentile(ref_luma, 2))
    r_hi = float(np.percentile(ref_luma, 98))
    span = max(r_hi - r_lo, 1.0)

    h_luma = hammer[:, :, :3].max(axis=2)
    h_samples = h_luma[vis]
    h_lo = float(np.percentile(h_samples, 2))
    h_hi = float(np.percentile(h_samples, 98))
    h_span = max(h_hi - h_lo, 1.0)

    mapped = r_lo + (h_luma - h_lo) / h_span * span
    mapped = np.clip(mapped, 0, 255)

    for c in range(3):
        channel = out[:, :, c].astype(np.float32)
        channel[vis] = mapped[vis]
        out[:, :, c] = channel.astype(np.uint8)
    return out


def resize_rgba(rgba: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    im = Image.fromarray(rgba, "RGBA")
    if im.size != size:
        im = im.resize(size, Image.Resampling.LANCZOS)
    return np.array(im)


def dilate_mask(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    h, w = mask.shape
    out = mask.copy()
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        out[ny, nx] = True
    return out


def erode_mask(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros_like(mask)
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            ok = True
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < h and 0 <= nx < w and mask[ny, nx]):
                        ok = False
                        break
                if not ok:
                    break
            if ok:
                out[y, x] = True
    return out

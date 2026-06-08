"""법봉 레이어·홈 레이어 — 원본 로고에서 망치(머리+손잡이)만 분리."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W, H = 616, 338
ROOT = Path(__file__).parent

# 망치 머리 전체 (회로 패턴 포함)
HEAD_POLY = [
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

# 손잡이 — 피벗(약 148,195)에서 머리 연결부까지
HANDLE_POINTS = [
    (149, 195),
    (158, 182),
    (172, 168),
    (188, 152),
    (205, 138),
    (218, 125),
]


def _flood_keep_connected(mask: np.ndarray, seeds: list[tuple[int, int]]) -> np.ndarray:
    """시드와 연결된 영역만 유지해 파편·잔여 픽셀 제거."""
    kept = np.zeros_like(mask)
    for sx, sy in seeds:
        if not mask[sy, sx]:
            continue
        q: deque[tuple[int, int]] = deque([(sx, sy)])
        while q:
            x, y = q.popleft()
            if x < 0 or y < 0 or x >= W or y >= H:
                continue
            if kept[y, x] or not mask[y, x]:
                continue
            kept[y, x] = True
            q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return kept


def build_mask(alpha: np.ndarray) -> np.ndarray:
    img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(img)
    draw.polygon(HEAD_POLY, fill=255)
    draw.line(HANDLE_POINTS, fill=255, width=16)
    draw.ellipse([138, 186, 160, 204], fill=255)

    mask = np.array(img) > 128

    # 받침대(베이스) — 홈 레이어에 유지
    for y in range(200, 272):
        for x in range(168, 262):
            mask[y, x] = False

    # 왼쪽 파동(음향) — 홈 레이어에 유지
    for y in range(H):
        for x in range(W):
            if x < 155 and y < 235:
                mask[y, x] = False

    mask &= alpha >= 30
    mask = _flood_keep_connected(mask, [(200, 115), (149, 195), (220, 160)])

    return mask


def fill_gaps(full: np.ndarray, mask: np.ndarray) -> np.ndarray:
    alpha = full[:, :, 3]
    hammer = np.zeros_like(full)
    hammer[mask & (alpha >= 40)] = full[mask & (alpha >= 40)]

    gap = mask & (alpha < 40)
    for _ in range(48):
        for y in range(H):
            for x in range(W):
                if not gap[y, x] or hammer[y, x, 3] >= 250:
                    continue
                y0, y1 = max(0, y - 4), min(H, y + 5)
                x0, x1 = max(0, x - 4), min(W, x + 5)
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


def main() -> None:
    full = np.array(Image.open(ROOT / "ai-judge-logo.png").convert("RGBA"))
    alpha = full[:, :, 3]
    mask = build_mask(alpha)
    hammer = fill_gaps(full, mask)

    home = full.copy()
    home[mask] = (0, 0, 0, 0)

    vis = hammer[:, :, 3] >= 200
    seen = np.zeros_like(vis)
    comps: list[int] = []
    for y in range(H):
        for x in range(W):
            if not vis[y, x] or seen[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(x, y)])
            n = 0
            while q:
                cx, cy = q.popleft()
                if cx < 0 or cy < 0 or cx >= W or cy >= H:
                    continue
                if not vis[cy, cx] or seen[cy, cx]:
                    continue
                seen[cy, cx] = True
                n += 1
                q.extend([(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)])
            comps.append(n)

    print(
        "mask",
        int(mask.sum()),
        "visible",
        int(vis.sum()),
        "components",
        sorted(comps, reverse=True)[:3],
    )

    Image.fromarray(hammer).save(ROOT / "ai-judge-hammer-layer.png")
    Image.fromarray(home).save(ROOT / "ai-judge-logo-home.png")


if __name__ == "__main__":
    main()

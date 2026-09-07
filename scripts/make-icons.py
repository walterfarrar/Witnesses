#!/usr/bin/env python3
"""Write simple PNG icons without third-party libraries."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def png(width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row = y * width
        for x in range(width):
            raw.extend(pixels[row + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", ihdr),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def draw(size: int) -> bytes:
    bg = (20, 17, 14, 255)
    page = (246, 234, 208, 255)
    ink = (42, 33, 22, 255)
    gold = (212, 176, 86, 255)
    pixels = [bg] * (size * size)
    radius = int(size * 0.19)

    def set_px(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < size and 0 <= y < size:
            pixels[y * size + x] = color

    def fill_round_rect(x0, y0, x1, y1, r, color) -> None:
        for y in range(y0, y1):
            for x in range(x0, x1):
                dx = 0 if x0 + r <= x < x1 - r else min(abs(x - (x0 + r)), abs(x - (x1 - r - 1)))
                dy = 0 if y0 + r <= y < y1 - r else min(abs(y - (y0 + r)), abs(y - (y1 - r - 1)))
                inside = True
                if x < x0 + r and y < y0 + r:
                    inside = (x - (x0 + r)) ** 2 + (y - (y0 + r)) ** 2 <= r * r
                elif x >= x1 - r and y < y0 + r:
                    inside = (x - (x1 - r - 1)) ** 2 + (y - (y0 + r)) ** 2 <= r * r
                elif x < x0 + r and y >= y1 - r:
                    inside = (x - (x0 + r)) ** 2 + (y - (y1 - r - 1)) ** 2 <= r * r
                elif x >= x1 - r and y >= y1 - r:
                    inside = (x - (x1 - r - 1)) ** 2 + (y - (y1 - r - 1)) ** 2 <= r * r
                if inside:
                    set_px(x, y, color)
                else:
                    _ = dx, dy

    fill_round_rect(0, 0, size, size, radius, bg)
    margin = int(size * 0.17)
    page_r = int(size * 0.06)
    fill_round_rect(margin, margin, size - margin, size - margin, page_r, page)

    # ruled lines
    line_x0 = margin + int(size * 0.08)
    line_x1 = size - margin - int(size * 0.08)
    for i, width_frac in enumerate((1.0, 0.78, 0.88, 0.62)):
        y = margin + int(size * (0.18 + i * 0.13))
        x1 = line_x0 + int((line_x1 - line_x0) * width_frac)
        thickness = max(2, size // 48)
        for y2 in range(y, y + thickness):
            for x in range(line_x0, x1):
                set_px(x, y2, ink)

    # gold seal
    cx = size - margin - int(size * 0.14)
    cy = size - margin - int(size * 0.14)
    rr = int(size * 0.09)
    for y in range(cy - rr, cy + rr):
        for x in range(cx - rr, cx + rr):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr:
                set_px(x, y, gold)

    return png(size, size, pixels)


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    (out / "icon-192.png").write_bytes(draw(192))
    (out / "icon-512.png").write_bytes(draw(512))
    (out / "apple-touch-icon.png").write_bytes(draw(180))


if __name__ == "__main__":
    main()

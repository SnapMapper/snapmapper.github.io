#!/usr/bin/env python3
"""Draw the Mapper Log icon (a timeline with one highlighted tick) as PNGs.

Standard library only. Run from the project root:  python3 tools/make-icons.py
"""
import math
import os
import struct
import zlib

BG = (15, 23, 32)
LINE = (59, 74, 92)
MINOR = (91, 107, 127)
ACCENT = (45, 212, 191)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def shapes(scale):
    """Shapes in unit coordinates; scale shrinks them about the centre (for maskable)."""
    def s(v):
        return 0.5 + (v - 0.5) * scale

    out = [("cap", (s(0.16), s(0.60), s(0.84), s(0.60)), 0.020 * scale, LINE)]
    for x in (0.25, 0.37, 0.71, 0.81):
        out.append(("cap", (s(x), s(0.54), s(x), s(0.66)), 0.016 * scale, MINOR))
    out.append(("cap", (s(0.55), s(0.36), s(0.55), s(0.70)), 0.032 * scale, ACCENT))
    out.append(("dot", (s(0.55), s(0.29)), 0.075 * scale, ACCENT))
    return out


def render(size, scale=1.0):
    shp = shapes(scale)
    rows = bytearray()
    px_size = 1.0 / size
    for y in range(size):
        rows.append(0)  # filter: none
        py = (y + 0.5) / size
        for x in range(size):
            px = (x + 0.5) / size
            r, g, b = BG
            for kind, geom, rad, col in shp:
                if kind == "cap":
                    d = seg_dist(px, py, *geom) - rad
                else:
                    d = math.hypot(px - geom[0], py - geom[1]) - rad
                cov = max(0.0, min(1.0, 0.5 - d / px_size))
                if cov > 0:
                    r = r + (col[0] - r) * cov
                    g = g + (col[1] - g) * cov
                    b = b + (col[2] - b) * cov
            rows += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), 255))
    return bytes(rows)


def png(size, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    targets = [
        ("apple-touch-icon.png", 180, 1.0),
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-512-maskable.png", 512, 0.8),
    ]
    for name, size, scale in targets:
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(png(size, render(size, scale)))
        print("wrote", name)


if __name__ == "__main__":
    main()

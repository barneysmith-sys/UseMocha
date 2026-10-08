#!/usr/bin/env python3
"""Bake the alpine reference into a compact particle field.

The PNG is a sampling source only. Runtime never displays it.
Output: public/terrain/alpine.bin
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    "/home/ubuntu/.cursor/projects/workspace/assets/8cf16e3e-a725-4218-b5cc-079dd446b5d4.png"
)
OUT = ROOT / "public" / "terrain" / "alpine.bin"
PREVIEW = ROOT / "scripts" / "alpine-preview.png"


def read_png(path: Path):
    data = path.read_bytes()
    pos = 8
    w = h = None
    idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos : pos + 4])[0]
        typ = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + ln]
        if typ == b"IHDR":
            w, h = struct.unpack(">II", chunk[:8])
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    bpp = 3
    rows = []
    stride = w * bpp
    i = 0
    prev = bytearray(stride)

    def paeth(a, b, c):
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        if pa <= pb and pa <= pc:
            return a
        if pb <= pc:
            return b
        return c

    for _y in range(h):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        if filt == 1:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + left) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + paeth(a, b, c)) & 255
        rows.append(row)
        prev = row
    return w, h, rows


def in_wordmark(x, y, w, h) -> bool:
    """The reference banner has the mocha wordmark painted in the sky."""
    return (0.27 * h) < y < (0.41 * h) and (0.34 * w) < x < (0.70 * w)


def bake():
    w, h, rows = read_png(SRC)
    thr = 168
    ink = bytearray(w * h)
    reds = bytearray(w * h)
    for y in range(h):
        row = rows[y]
        base = y * w
        for x in range(w):
            r = row[x * 3]
            if r > thr and not in_wordmark(x, y, w, h):
                ink[base + x] = 1
                reds[base + x] = r

    # Column crest (smallest y with ink) for ridgeline weight.
    crest = [h] * w
    for x in range(w):
        for y in range(h):
            if ink[y * w + x]:
                crest[x] = y
                break

    particles = []

    def push(cx, cy, size_px, alpha, square, seed):
        # Smooth crest lookup across a few columns.
        acc = 0
        n = 0
        for dx in range(-2, 3):
            xx = min(w - 1, max(0, int(cx) + dx))
            if crest[xx] < h:
                acc += crest[xx]
                n += 1
        top = (acc / n) if n else cy
        dist = max(0.0, cy - top)
        ridge = max(0.0, 1.0 - dist / 42.0)
        # Lower in the frame reads nearer; crest particles sit slightly forward too.
        depth = min(1.0, max(0.0, (cy / h) * 0.85 + ridge * 0.15))
        u = min(0.9999, max(0.0, cx / w))
        v = min(0.9999, max(0.0, cy / h))
        particles.append((u, v, size_px, alpha, 1 if square else 0, ridge, depth, seed))

    # Connected components for isolated squares. Large masses are grid-sampled.
    seen = bytearray(w * h)
    dirs = ((1, 0), (-1, 0), (0, 1), (0, -1))
    from collections import deque

    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not ink[i] or seen[i]:
                continue
            q = deque([(x, y)])
            seen[i] = 1
            cells = [(x, y)]
            minx = maxx = x
            miny = maxy = y
            red_acc = reds[i]
            while q:
                cx, cy = q.popleft()
                for dx, dy in dirs:
                    nx, ny = cx + dx, cy + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    j = ny * w + nx
                    if ink[j] and not seen[j]:
                        seen[j] = 1
                        q.append((nx, ny))
                        cells.append((nx, ny))
                        red_acc += reds[j]
                        if nx < minx:
                            minx = nx
                        if nx > maxx:
                            maxx = nx
                        if ny < miny:
                            miny = ny
                        if ny > maxy:
                            maxy = ny
            area = len(cells)
            bw = maxx - minx + 1
            bh = maxy - miny + 1
            mean_red = red_acc / area
            alpha = 0.45 + 0.55 * ((mean_red - thr) / (255 - thr))
            alpha = max(0.35, min(1.0, alpha))

            # Isolated geometric marks — the squares breaking off the right massif.
            if area <= 80 and bw <= 18 and bh <= 18 and bw * bh < 340:
                cx = sum(p[0] for p in cells) / area
                cy = sum(p[1] for p in cells) / area
                aspect = bw / max(1, bh)
                square = area >= 7 and 0.55 <= aspect <= 1.8 and bw >= 3 and bh >= 3
                size = (bw + bh) * 0.42
                if square:
                    size = max(3.2, min(8.5, (bw + bh) * 0.46))
                else:
                    size = max(1.15, min(3.1, 1.05 + area * 0.16))
                seed = ((x * 374761393 + y * 668265263) & 65535) / 65535
                push(cx, cy, size, alpha, square, seed)
                continue

            # Dense stipple: one particle per cell, keeping the silhouette.
            step = 2
            buckets = {}
            for px, py in cells:
                key = (px // step, py // step)
                b = buckets.get(key)
                if b is None:
                    buckets[key] = [px, py, 1, reds[py * w + px]]
                else:
                    b[0] += px
                    b[1] += py
                    b[2] += 1
                    b[3] += reds[py * w + px]
            for (gx, gy), (sx, sy, n, rs) in buckets.items():
                cx = sx / n
                cy = sy / n
                local = rs / n
                a = 0.42 + 0.58 * ((local - thr) / (255 - thr))
                # Slightly larger marks where the stipple is solid white.
                size = 1.25 + (n / (step * step)) * 1.35
                size = max(1.05, min(2.85, size))
                seed = ((gx * 915488 + gy * 1103515245) & 65535) / 65535
                push(cx + 0.5, cy + 0.5, size, max(0.34, min(1.0, a)), 0, seed)

    # Sort far to near so the painter's order is stable if depth writes are off.
    particles.sort(key=lambda p: p[6])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    buf = bytearray()
    buf += struct.pack("<4sIHH", b"MALP", len(particles), w, h)
    for u, v, size, alpha, square, ridge, depth, seed in particles:
        buf += struct.pack(
            "<HHBBBBBB",
            int(u * 65535),
            int(v * 65535),
            int(max(0, min(255, round((size / 10.0) * 255)))),
            int(max(0, min(255, round(alpha * 255)))),
            1 if square else 0,
            int(max(0, min(255, round(ridge * 255)))),
            int(max(0, min(255, round(depth * 255)))),
            int(max(0, min(255, round(seed * 255)))),
        )
    OUT.write_bytes(buf)
    print(f"wrote {len(particles)} particles -> {OUT} ({len(buf)} bytes)")
    write_preview(particles, w, h)


def write_preview(particles, src_w, src_h):
    # Small preview to judge silhouette. Scale 0.45.
    scale = 0.42
    pw, ph = int(src_w * scale), int(src_h * scale)
    # RGB cobalt
    pix = bytearray([0, 83, 253]) * (pw * ph)

    def plot(x, y, size, alpha, square):
        r = max(0.6, size * scale * 0.92)
        x0 = int(x - r)
        y0 = int(y - r)
        x1 = int(x + r + 1)
        y1 = int(y + r + 1)
        for yy in range(max(0, y0), min(ph, y1)):
            for xx in range(max(0, x0), min(pw, x1)):
                dx = xx + 0.5 - x
                dy = yy + 0.5 - y
                if square:
                    if max(abs(dx), abs(dy)) > r:
                        continue
                else:
                    if dx * dx + dy * dy > r * r:
                        continue
                i = (yy * pw + xx) * 3
                # Source-over white
                a = alpha
                pix[i] = int(pix[i] * (1 - a) + 255 * a)
                pix[i + 1] = int(pix[i + 1] * (1 - a) + 255 * a)
                pix[i + 2] = int(pix[i + 2] * (1 - a) + 255 * a)

    for u, v, size, alpha, square, _ridge, _depth, _seed in particles:
        plot(u * pw, v * ph, size, alpha * 0.92, square)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b""
    stride = pw * 3
    for y in range(ph):
        raw += b"\x00" + bytes(pix[y * stride : (y + 1) * stride])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", pw, ph, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    PREVIEW.write_bytes(png)
    print(f"preview {PREVIEW} {pw}x{ph}")


if __name__ == "__main__":
    bake()

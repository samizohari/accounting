#!/usr/bin/env python3
"""Generate app icons (no external dependencies): favicon.ico (PNG-embedded),
apple-touch-icon.png (180x180), icons/icon-192.png, icons/icon-512.png.
Draws a simple white bar-chart glyph on a blue rounded square."""
import struct, zlib, os, math

BASE = (15, 23, 42)        # dark navy #0f172a
GLYPH = (56, 189, 248)     # light blue #38bdf8
ACCENT = (13, 110, 253)    # blue #0d6efd

def rounded(x, y, size, radius):
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2

def make_png(size, path):
    r = size * 0.22
    rows = []
    for y in range(size):
        row = bytearray(b'\x00')
        for x in range(size):
            if not rounded(x + 0.5, y + 0.5, size, r):
                row += bytes((0, 0, 0, 0))  # transparent corner
                continue
            # background: vertical gradient navy -> blue
            t = y / size
            bg = tuple(int(BASE[i] + (ACCENT[i] - BASE[i]) * t * 0.55) for i in range(3))
            # bar chart glyph: 4 bars
            bw = size * 0.10
            gap = size * 0.035
            x0 = size * 0.24
            base_y = size * 0.74
            heights = [0.30, 0.48, 0.40, 0.60]
            color = bg
            for i, h in enumerate(heights):
                bx0 = x0 + i * (bw + gap)
                bx1 = bx0 + bw
                by0 = base_y - h * size * 0.5
                if bx0 <= x <= bx1 and by0 <= y <= base_y:
                    color = GLYPH
                    break
            row += bytes(color + (255,))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, size, 'x', size)

def make_ico(png_bytes, path):
    # ICO with a single embedded PNG (works for modern browsers)
    header = struct.pack('<HHH', 0, 1, 1)
    w = 32
    entry = struct.pack('<BBBBHHII', w if w < 256 else 0, w if w < 256 else 0, 0, 0, 1, 32, len(png_bytes), 22)
    with open(path, 'wb') as f:
        f.write(header + entry + png_bytes)
    print('wrote', path)

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    make_png(180, os.path.join(root, 'apple-touch-icon.png'))
    os.makedirs(os.path.join(root, 'icons'), exist_ok=True)
    make_png(192, os.path.join(root, 'icons', 'icon-192.png'))
    make_png(512, os.path.join(root, 'icons', 'icon-512.png'))
    # favicon: render 32px PNG in memory
    import io
    buf = io.BytesIO()
    size = 32
    r = size * 0.22
    rows = []
    for y in range(size):
        row = bytearray(b'\x00')
        for x in range(size):
            if not rounded(x + 0.5, y + 0.5, size, r):
                row += bytes((0, 0, 0, 0))
                continue
            bg = BASE
            bw = size * 0.10
            gap = size * 0.03
            x0 = size * 0.24
            base_y = size * 0.74
            heights = [0.30, 0.48, 0.40, 0.60]
            color = bg
            for i, h in enumerate(heights):
                bx0 = x0 + i * (bw + gap)
                bx1 = bx0 + bw
                by0 = base_y - h * size * 0.5
                if bx0 <= x <= bx1 and by0 <= y <= base_y:
                    color = GLYPH
                    break
            row += bytes(color + (255,))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png32 = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    make_ico(png32, os.path.join(root, 'favicon.ico'))

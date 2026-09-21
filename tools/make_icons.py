"""Draws the Imudist icon (the same mark as src/components/AppLogo.tsx) and writes the PNG / ICO files in public/.

Run from the project folder:  python tools/make_icons.py
Needs Pillow (pip install pillow).
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public')

BG = (34, 26, 26, 255)  # the app's surface color
BLUE = (0, 102, 255, 255)
WHITE = (255, 255, 255, 255)
SUPER = 4  # draw at 4x and shrink, for smooth edges


def arc_points(cx, cy, r, a0, a1, steps=24):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / steps)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]


# the mark, in the 36 x 32 units of the SVG; every path is a polyline drawn with round caps and joins
BRACKETS = [
    [(8, 4), (3, 4), (3, 28), (8, 28)],
    [(28, 4), (33, 4), (33, 28), (28, 28)],
]
LETTERS = [
    [(11.5, 10), (11.5, 22)],  # I
    [(16, 22), (16, 13.5)],  # left leg of m
    arc_points(18.25, 16.3, 2.25, 180, 360) + [(20.5, 22)],  # first arch
    arc_points(22.75, 16.3, 2.25, 180, 360) + [(25, 22)],  # second arch
]


def stroke(draw, pts, width, color, ox, oy, s):
    xy = [(ox + x * s, oy + y * s) for x, y in pts]
    r = width / 2
    draw.line(xy, fill=color, width=round(width), joint='curve')
    for x, y in (xy[0], xy[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def render(size, rounded=True, logo_width=0.6):
    big = size * SUPER
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.19, fill=BG)
        d.rounded_rectangle((big * 0.012, big * 0.012, big * 0.988, big * 0.988), radius=big * 0.18, outline=(255, 255, 255, 26), width=max(1, round(big * 0.006)))
    else:
        d.rectangle((0, 0, big, big), fill=BG)
    s = big * logo_width / 36
    ox = (big - 36 * s) / 2
    oy = (big - 32 * s) / 2
    w = 2.4 * s
    for path in BRACKETS:
        stroke(d, path, w, BLUE, ox, oy, s)
    for path in LETTERS:
        stroke(d, path, w, WHITE, ox, oy, s)
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
    render(192).save(os.path.join(OUT, 'icons', 'icon-192.png'))
    render(512).save(os.path.join(OUT, 'icons', 'icon-512.png'))
    # maskable: the system may crop it to any shape, so the picture fills the square and the mark stays in the safe zone
    render(512, rounded=False, logo_width=0.5).save(os.path.join(OUT, 'icons', 'icon-maskable-512.png'))
    # the Windows file / app icon: several sizes in one file
    render(256).save(os.path.join(OUT, 'imudist.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('icons written to', os.path.normpath(OUT))


if __name__ == '__main__':
    main()

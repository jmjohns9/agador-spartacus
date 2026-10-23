"""Render the macOS app icon: a Limestone tile holding a Basalt stone with the
T monogram cut out of it and the Signal "tell" dot (the first-direction mark).

Run:  python build_icon.py      (needs Pillow)
Writes files/build/icon-1024.png and files/build/icon.icns.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

INK = (28, 29, 31, 255)          # Basalt
SIGNAL = (232, 89, 12, 255)      # Signal
TILE = (233, 230, 224, 255)      # Limestone

# Same geometry as the brand board's mark (viewBox 0 0 120 100).
STONE = [(12, 12), (108, 12), (92, 88), (28, 88)]
STROKE = 16
T_BAR = (30, 29, 60, 11)         # x, y, w, h — cut in the tile colour
T_STEM = (54.5, 29, 11, 48)
T_RADIUS = 2
DOT = (81, 58, 7)                 # cx, cy, r

SS = 4            # supersampling factor
SIZE = 1024
BODY = 824        # Apple's macOS icon grid: 824 px tile, 100 px margin
RADIUS = 185
STONE_W = 500     # drawn stone width on the 1024 canvas

BUILD = Path(__file__).parent.parent / "files" / "build"


def render() -> Image.Image:
    n = SIZE * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))

    # Soft drop shadow under the tile, as system icons have.
    shadow = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    off = (SIZE - BODY) // 2 * SS
    ImageDraw.Draw(shadow).rounded_rectangle(
        (off, off + 12 * SS, off + BODY * SS, off + BODY * SS + 12 * SS), RADIUS * SS, fill=(0, 0, 0, 90))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14 * SS)))

    d = ImageDraw.Draw(img)
    d.rounded_rectangle((off, off, off + BODY * SS, off + BODY * SS), RADIUS * SS, fill=TILE)

    # Stone: drawn box is 4..116 x 4..96 in mark units; centre it on the tile.
    k = STONE_W * SS / 112
    ox = n / 2 - 60 * k
    oy = n / 2 - 50 * k
    pts = [(ox + x * k, oy + y * k) for x, y in STONE]
    d.polygon(pts, fill=INK)
    r = STROKE / 2 * k
    for a, b in zip(pts, pts[1:] + pts[:1]):
        d.line([a, b], fill=INK, width=round(STROKE * k))
    for x, y in pts:  # round joins
        d.ellipse((x - r, y - r, x + r, y + r), fill=INK)

    def box(x, y, w, h):
        return (ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k)

    d.rounded_rectangle(box(*T_BAR), T_RADIUS * k, fill=TILE)
    d.rounded_rectangle(box(*T_STEM), T_RADIUS * k, fill=TILE)
    cx, cy, cr = DOT
    d.ellipse(box(cx - cr, cy - cr, 2 * cr, 2 * cr), fill=SIGNAL)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    icon = render()
    icon.save(BUILD / "icon-1024.png")
    icon.save(BUILD / "icon.icns", sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
    print(f"wrote {BUILD / 'icon-1024.png'} and icon.icns")


if __name__ == "__main__":
    main()

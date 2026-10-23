"""Render the GitHub social preview card: the T-and-dot mark and the wordmark
on Basalt, with the one-line description under it.

Run:  python build_social.py      (needs Pillow; macOS for Helvetica Neue)
Writes brand/github/social-preview.png (1280 x 640). GitHub's API can't set
the card, so upload it by hand: Settings -> General -> Social preview.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASALT = (22, 23, 26)
PAPER = (245, 243, 238)
SIGNAL = (232, 89, 12)
PAPER_70 = tuple(round(b + (p - b) * 0.7) for p, b in zip(PAPER, BASALT))

# Same mark geometry as build_icon.py (viewBox 0 0 120 100).
STONE = [(12, 12), (108, 12), (92, 88), (28, 88)]
STROKE = 16
T_BAR = (30, 29, 60, 11)
T_STEM = (54.5, 29, 11, 48)
T_RADIUS = 2
DOT = (81, 58, 7)

W, H = 1280, 640
SS = 4
MARGIN = 80
MARK_W = 250                       # drawn stone width
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"
LINE = "Your car writes down what goes wrong. Tattlestone reads it to you."

OUT = Path(__file__).parent / "github" / "social-preview.png"


def draw_mark(d: ImageDraw.ImageDraw, ox: float, oy: float, k: float) -> None:
    pts = [(ox + x * k, oy + y * k) for x, y in STONE]
    d.polygon(pts, fill=PAPER)
    r = STROKE / 2 * k
    for a, b in zip(pts, pts[1:] + pts[:1]):
        d.line([a, b], fill=PAPER, width=round(STROKE * k))
    for x, y in pts:
        d.ellipse((x - r, y - r, x + r, y + r), fill=PAPER)

    def box(x, y, w, h):
        return (ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k)

    d.rounded_rectangle(box(*T_BAR), T_RADIUS * k, fill=BASALT)
    d.rounded_rectangle(box(*T_STEM), T_RADIUS * k, fill=BASALT)
    cx, cy, cr = DOT
    d.ellipse(box(cx - cr, cy - cr, 2 * cr, 2 * cr), fill=SIGNAL)


def render() -> Image.Image:
    img = Image.new("RGB", (W * SS, H * SS), BASALT)
    d = ImageDraw.Draw(img)

    k = MARK_W * SS / 112
    mark_h = 92 * k
    top = (H * SS - mark_h) / 2 - 40 * SS
    draw_mark(d, MARGIN * SS - 4 * k, top - 4 * k, k)

    bold = ImageFont.truetype(FONT, 112 * SS, index=1)
    text_x = (MARGIN + MARK_W + 56) * SS
    d.text((text_x, top + mark_h / 2), "Tattlestone", font=bold, fill=PAPER, anchor="lm")

    regular = ImageFont.truetype(FONT, 30 * SS, index=0)
    d.text((MARGIN * SS, H * SS - MARGIN * SS), LINE, font=regular, fill=PAPER_70, anchor="ls")
    return img.resize((W, H), Image.LANCZOS)


def main():
    OUT.parent.mkdir(exist_ok=True)
    render().save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

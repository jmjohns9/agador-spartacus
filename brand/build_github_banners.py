"""Write the README banners: the T-and-dot mark, the wordmark and the tagline,
laid out like the social card (build_social.py).

Run:  python build_github_banners.py      (stdlib only)
Writes brand/github/readme-banner-light.svg and readme-banner-dark.svg.
"""
import re
from pathlib import Path

BASALT = "#16171A"
PAPER = "#F5F3EE"
SIGNAL = "#E8590C"
TAGLINE = "Your car writes down what goes wrong. Tattlestone reads it to you."
FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"

W, H = 1200, 320
MARGIN = 80
MARK_K = 1.4                 # mark units -> banner units (mark drawn 4..116 x 4..96)
WORD_S = 0.08                # wordmark font units -> banner units (cap height 714)

BRAND = Path(__file__).parent
OUT = BRAND / "github"


def mix(a: str, b: str, t: float) -> str:
    """Colour t of the way from a to b."""
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(ca, cb))


def mark(ink: str, cut: str) -> str:
    # Same geometry as build_icon.py / build_social.py (viewBox 0 0 120 100).
    return (
        f'<polygon points="12,12 108,12 92,88 28,88" fill="{ink}" stroke="{ink}" '
        f'stroke-width="16" stroke-linejoin="round"/>'
        f'<rect x="30" y="29" width="60" height="11" rx="2" fill="{cut}"/>'
        f'<rect x="54.5" y="29" width="11" height="48" rx="2" fill="{cut}"/>'
        f'<circle cx="81" cy="58" r="7" fill="{SIGNAL}"/>'
    )


def banner(bg: str, ink: str) -> str:
    word = re.search(r'd="([^"]+)"', (BRAND / "tattlestone-wordmark.svg").read_text()).group(1)
    mark_top = 52
    mark_mid = mark_top + 50 * MARK_K
    word_x = MARGIN + 112 * MARK_K + 44
    baseline = mark_mid + 714 * WORD_S / 2
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Tattlestone. {TAGLINE}">
<rect x="0" y="0" width="{W}" height="{H}" fill="{bg}"/>
<g transform="translate({MARGIN - 4 * MARK_K:.1f} {mark_top - 4 * MARK_K:.1f}) scale({MARK_K})">{mark(ink, bg)}</g>
<path transform="translate({word_x - 13 * WORD_S:.1f} {baseline:.1f}) scale({WORD_S})" fill="{ink}" d="{word}"/>
<text x="{MARGIN}" y="{H - 52}" font-family="{FONT}" font-size="30" fill="{mix(bg, ink, 0.7)}">{TAGLINE}</text>
</svg>
'''


def main():
    OUT.mkdir(exist_ok=True)
    for name, bg, ink in [("light", PAPER, BASALT), ("dark", BASALT, PAPER)]:
        path = OUT / f"readme-banner-{name}.svg"
        path.write_text(banner(bg, ink))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()

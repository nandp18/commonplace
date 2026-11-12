"""
Draws the Commonplace logo: a drop of gold, made of halftone dots like the sea, with an
opening quotation mark picked out in brighter dots. Writes public/icon.svg and the PNG
icons from the same dots, so they always match.

    python3 scripts/make-icon.py            # write the icons
    python3 scripts/make-icon.py preview    # also write docs/logo-preview.png
"""

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SIZE = 512
INK = (30, 35, 29)  # --ink
GOLD = (222, 180, 104)  # the ceremony's gold, a touch deeper
CREAM = (250, 236, 200)
GAP = 15  # distance between dots
FONT = "/System/Library/Fonts/Supplemental/Georgia.ttf"

# The drop: a circle with a point above it, joined by tangent lines.
CX, CY, R = 256, 314, 140
TIP = (256, 70)


def in_drop(x: float, y: float) -> bool:
    if math.hypot(x - CX, y - CY) <= R:
        return True
    d = CY - TIP[1]
    half = math.asin(R / d)  # half the angle of the cone at the tip
    L = math.sqrt(d * d - R * R)
    tangent_y = TIP[1] + L * math.cos(half)
    if y < TIP[1] or y > tangent_y:
        return False
    return abs(math.atan2(x - TIP[0], y - TIP[1])) <= half


def quote_mask() -> Image.Image:
    """The “ glyph, rendered large, where it sits in the drop."""
    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    font = ImageFont.truetype(FONT, 510)
    l, t, r, b = draw.textbbox((0, 0), "“", font=font)
    w, h = r - l, b - t
    draw.text((CX - w / 2 - l, CY - h / 2 - t), "“", font=font, fill=255)
    # Center what was actually drawn (the font's box includes room above the mark).
    bl, bt, br, bb = mask.getbbox()
    return mask.transform(mask.size, Image.Transform.AFFINE, (1, 0, (bl + br) / 2 - CX, 0, 1, (bt + bb) / 2 - CY + 4))


def dots():
    mask = quote_mask()
    out = []
    row_h = GAP * math.sqrt(3) / 2  # a hexagonal lattice
    rows = int(SIZE / row_h) + 2
    for j in range(rows):
        y = j * row_h
        for i in range(-1, int(SIZE / GAP) + 2):
            x = i * GAP + (GAP / 2 if j % 2 else 0) + (SIZE / 2 % GAP)
            if not in_drop(x, y):
                continue
            # Lit from the upper left, like a bead of gold: bigger dots where it's brighter.
            nx, ny = (x - CX) / R, (y - CY) / R
            light = max(0.0, 1 - math.hypot(nx + 0.35, ny + 0.45) / 1.9)
            edge = min(1.0, max(0.0, (R - math.hypot(x - CX, max(y, CY) - CY)) / 30))
            if mask.getpixel((int(x), int(y))) > 120:
                out.append((x, y, GAP * 0.42, CREAM, 1.0))
            else:
                r = GAP * (0.17 + 0.17 * light) * (0.75 + 0.25 * edge)
                out.append((x, y, r, GOLD, 0.55 + 0.45 * light))
    return out


def svg(ds) -> str:
    body = "\n".join(
        f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="rgb{c}"{"" if a >= 1 else f" fill-opacity={chr(34)}{a:.2f}{chr(34)}"}/>'
        for x, y, r, c, a in ds
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">\n'
        f'  <rect width="{SIZE}" height="{SIZE}" rx="112" fill="rgb{INK}"/>\n{body}\n</svg>\n'
    )


def png(ds, size: int, rounded=True) -> Image.Image:
    k = 4 * size / SIZE  # draw big, then shrink, for smooth dots
    big = Image.new("RGBA", (int(SIZE * k), int(SIZE * k)), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    # Home screens round the corners themselves, so the PNGs are full squares.
    if rounded:
        d.rounded_rectangle((0, 0, big.width - 1, big.height - 1), radius=112 * k, fill=INK)
    else:
        d.rectangle((0, 0, big.width, big.height), fill=INK)
    for x, y, r, c, a in ds:
        col = tuple(round(INK[i] + (c[i] - INK[i]) * a) for i in range(3))
        d.ellipse(((x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k), fill=col)
    return big.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    ds = dots()
    (ROOT / "public/icon.svg").write_text(svg(ds))
    for s in (192, 512):
        png(ds, s, rounded=False).convert("RGB").save(ROOT / f"public/icon-{s}.png")
    if "preview" in sys.argv:
        sheet = Image.new("RGB", (512 + 40 + 192 + 40 + 64 + 40 + 32 + 40, 552), (244, 241, 232))
        x = 20
        for s in (512, 192, 64, 32):
            sheet.paste(png(ds, s), (x, 20), png(ds, s))
            x += s + 40
        sheet.save(ROOT / "docs/logo-preview.png")
    print(f"{len(ds)} dots")

"""Generate larger launcher/adaptive icons for notification header visibility."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'app-icon.png'
SIZE = 1024


def _tight_crop(img: Image.Image) -> Image.Image:
    px = img.load()
    w, h = img.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            if r > 245 and g > 245 and b > 245:
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    if max_x <= min_x or max_y <= min_y:
        return img
    pad = 4
    return img.crop((
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + pad + 1),
        min(h, max_y + pad + 1),
    ))


def main() -> None:
    src = Image.open(SRC).convert('RGBA')
    emblem = _tight_crop(src)

    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    target = int(SIZE * 0.88)
    fill = int(SIZE * 0.9)
    ratio = emblem.width / emblem.height
    if ratio >= 1:
        nw, nh = fill, max(1, int(fill / ratio))
    else:
        nh, nw = fill, max(1, int(fill * ratio))
    emblem_copy = emblem.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (SIZE - emblem_copy.width) // 2
    y = (SIZE - emblem_copy.height) // 2 - int(SIZE * 0.02)
    canvas.paste(emblem_copy, (x, y), emblem_copy)
    canvas.save(ASSETS / 'nepse-ghar-adaptive-foreground.png', optimize=True)

    green = (27, 94, 32, 255)
    circle = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, SIZE - 1, SIZE - 1), fill=green)

    emblem2 = emblem.resize((nw, nh), Image.Resampling.LANCZOS)
    px = emblem2.load()
    for iy in range(emblem2.height):
        for ix in range(emblem2.width):
            r, g, b, a = px[ix, iy]
            if a > 200 and r > 240 and g > 240 and b > 240:
                px[ix, iy] = (r, g, b, 0)
    ex = (SIZE - emblem2.width) // 2
    ey = (SIZE - emblem2.height) // 2 - int(SIZE * 0.01)
    circle.paste(emblem2, (ex, ey), emblem2)
    circle.save(ASSETS / 'nepse-ghar-launcher-icon.png', optimize=True)
    print('Wrote launcher icons to', ASSETS)


if __name__ == '__main__':
    main()

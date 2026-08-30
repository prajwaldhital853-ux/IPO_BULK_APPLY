"""Generate app / launcher / notification icons from nepse-ghar-full-source.png."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'nepse-ghar-full-source.png'
SIZE = 1024
NOTIF_SIZE = 96

# Android adaptive icons mask ~outer 25%. Keep logo within safe zone so the
# full SS2 artwork (bull, bear, NEPSE GHAR text) stays visible on home screen.
ICON_FILL_RATIO = 0.68
ADAPTIVE_FILL_RATIO = 0.68
NOTIF_FILL_RATIO = 0.62  # unused by emblem notification icon; kept for reference


def _fit_logo(
    src: Image.Image,
    canvas_size: int,
    fill_ratio: float,
    *,
    background: str,
) -> Image.Image:
    """Scale logo to fill_ratio of canvas and center it."""
    if background == 'white':
        canvas = Image.new('RGBA', (canvas_size, canvas_size), (255, 255, 255, 255))
    else:
        canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))

    target = int(canvas_size * fill_ratio)
    logo = src.convert('RGBA')
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (canvas_size - logo.width) // 2
    y = (canvas_size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas


def _make_notification_icon() -> Image.Image:
    """Simple NPS emblem silhouette — dense full-logo masks become a green square."""
    emblem_src = Image.open(ASSETS / 'app-icon.png').convert('RGBA')
    w, h = emblem_src.size
    emblem = emblem_src.crop((0, 0, w, int(h * 0.62)))

    canvas = Image.new('RGBA', (NOTIF_SIZE, NOTIF_SIZE), (0, 0, 0, 0))
    target = int(NOTIF_SIZE * 0.54)
    emblem.thumbnail((target, target), Image.Resampling.LANCZOS)

    layer = Image.new('RGBA', emblem.size, (0, 0, 0, 0))
    px = emblem.load()
    out_px = layer.load()
    for y in range(emblem.height):
        for x in range(emblem.width):
            r, g, b, a = px[x, y]
            if a < 16 or (r > 245 and g > 245 and b > 245):
                continue
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            alpha = min(255, max(80, 255 - lum))
            out_px[x, y] = (255, 255, 255, alpha)

    x = (NOTIF_SIZE - layer.width) // 2
    y = (NOTIF_SIZE - layer.height) // 2
    canvas.paste(layer, (x, y), layer)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f'Missing source logo: {SRC}')

    src = Image.open(SRC).convert('RGBA')

    # Square launcher + adaptive use same safe-zone scale (white background).
    app_icon = _fit_logo(src, SIZE, ICON_FILL_RATIO, background='white')
    app_icon.save(ASSETS / 'nepse-ghar-app-icon.png', optimize=True)
    app_icon.save(ASSETS / 'icon.png', optimize=True)
    app_icon.save(ASSETS / 'nepse-ghar-launcher-icon.png', optimize=True)

    adaptive = _fit_logo(src, SIZE, ADAPTIVE_FILL_RATIO, background='white')
    adaptive.save(ASSETS / 'nepse-ghar-adaptive-foreground.png', optimize=True)

    notif = _make_notification_icon()
    notif.save(ASSETS / 'notification-icon.png', optimize=True)

    print('Generated icons from', SRC.name)
    for name in (
        'nepse-ghar-app-icon.png',
        'icon.png',
        'nepse-ghar-adaptive-foreground.png',
        'notification-icon.png',
    ):
        print(' -', ASSETS / name)


if __name__ == '__main__':
    main()

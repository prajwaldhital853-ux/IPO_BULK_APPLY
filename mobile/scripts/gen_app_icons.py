"""Generate Daraz-style app icons: solid brand background + centered SS2 logo."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'nepse-ghar-full-source.png'
SIZE = 1024
NOTIF_SIZE = 96

# Brand green — solid squircle background like Daraz orange tile.
BRAND_GREEN = (27, 94, 32, 255)

# Logo scale inside the tile (safe for Android adaptive circle mask).
LOGO_FILL_RATIO = 0.72


def _brand_tile_icon(src: Image.Image, canvas_size: int, fill_ratio: float) -> Image.Image:
    """Solid brand-green square with SS2 logo centered and fully visible."""
    canvas = Image.new('RGBA', (canvas_size, canvas_size), BRAND_GREEN)

    target = int(canvas_size * fill_ratio)
    logo = src.convert('RGBA')
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (canvas_size - logo.width) // 2
    y = (canvas_size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas


def _adaptive_foreground(src: Image.Image, canvas_size: int, fill_ratio: float) -> Image.Image:
    """Logo on transparent — pairs with adaptiveIcon.backgroundColor."""
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    target = int(canvas_size * fill_ratio)
    logo = src.convert('RGBA')
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (canvas_size - logo.width) // 2
    y = (canvas_size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas


def _make_notification_icon() -> Image.Image:
    """White NPS emblem on transparent — tinted green by Android (not a solid block)."""
    emblem_src = Image.open(ASSETS / 'app-icon.png').convert('RGBA')
    w, h = emblem_src.size
    emblem = emblem_src.crop((0, 0, w, int(h * 0.62)))

    canvas = Image.new('RGBA', (NOTIF_SIZE, NOTIF_SIZE), (0, 0, 0, 0))
    target = int(NOTIF_SIZE * 0.52)
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

    # Daraz-style launcher tile: green background + full SS2 logo.
    app_icon = _brand_tile_icon(src, SIZE, LOGO_FILL_RATIO)
    app_icon.save(ASSETS / 'nepse-ghar-app-icon.png', optimize=True)
    app_icon.save(ASSETS / 'icon.png', optimize=True)
    app_icon.save(ASSETS / 'nepse-ghar-launcher-icon.png', optimize=True)

    adaptive = _adaptive_foreground(src, SIZE, LOGO_FILL_RATIO - 0.04)
    adaptive.save(ASSETS / 'nepse-ghar-adaptive-foreground.png', optimize=True)

    notif = _make_notification_icon()
    notif.save(ASSETS / 'notification-icon.png', optimize=True)

    print('Generated Daraz-style icons from', SRC.name)
    for name in (
        'nepse-ghar-app-icon.png',
        'icon.png',
        'nepse-ghar-adaptive-foreground.png',
        'notification-icon.png',
    ):
        print(' -', ASSETS / name)


if __name__ == '__main__':
    main()

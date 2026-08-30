"""Generate Daraz-style app icons: solid brand background + centered SS2 logo."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'nepse-ghar-full-source.png'
SIZE = 1024
NOTIF_SIZE = 192

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
    """
    Bold full-bleed white house-with-chart glyph on transparent.

    Android forces the notification small icon through an alpha mask: every
    non-transparent pixel is repainted with the accent colour, so any detailed
    or multi-colour artwork collapses into an unreadable blob. A single thick
    silhouette filling the whole canvas is the only shape that stays legible at
    24dp, so the glyph is drawn here rather than downscaled from the logo.
    """
    s = NOTIF_SIZE
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def p(fx: float, fy: float) -> tuple[int, int]:
        return int(fx * s), int(fy * s)

    house = [
        p(0.50, 0.02),
        p(0.98, 0.44),
        p(0.98, 0.98),
        p(0.02, 0.98),
        p(0.02, 0.44),
    ]
    draw.polygon(house, fill=(255, 255, 255, 255))

    # Negative-space rising bars read as a chart inside the house.
    bars = ((0.20, 0.72), (0.42, 0.60), (0.64, 0.46))
    for left, top in bars:
        draw.rectangle(
            [p(left, top), p(left + 0.16, 0.86)],
            fill=(0, 0, 0, 0),
        )

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

"""Generate app icons and Android notification icons from SS2 logo source."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'nepse-ghar-full-source.png'
SIZE = 1024
NOTIF_SIZE = 192
LARGE_NOTIF_SIZE = 256

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


def _remove_white_background(img: Image.Image, threshold: int = 245) -> Image.Image:
    """Turn near-white pixels transparent so the logo shape can be extracted."""
    rgba = img.convert('RGBA')
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
    return rgba


def _logo_graphic_crop(src: Image.Image) -> Image.Image:
    """Use the bull/bear/NPS artwork without the bottom wordmark."""
    cutout = _remove_white_background(src)
    bbox = cutout.getbbox()
    if not bbox:
        return cutout
    cropped = cutout.crop(bbox)
    w, h = cropped.size
    crop_h = int(h * 0.78)
    return cropped.crop((0, 0, w, crop_h))


def _bolden_alpha(mask: Image.Image, size: int = 5) -> Image.Image:
    """Thicken logo strokes so the tiny tray icon stays readable."""
    if size < 3:
        return mask
    return mask.filter(ImageFilter.MaxFilter(size))


def _make_notification_icon(src: Image.Image) -> Image.Image:
    """
    Daraz-style inverted tile: solid shape (tinted green on device) with the
    real SS2 logo knocked out so it reads as a white logo on a green tile —
    visible on white notification backgrounds (unlike a sparse white silhouette).
    """
    s = NOTIF_SIZE
    margin = int(s * 0.04)
    radius = int(s * 0.22)

    # Opaque white tile → Android repaints as brand green (#1B5E20).
    tile = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    draw.rounded_rectangle(
        [(margin, margin), (s - margin - 1, s - margin - 1)],
        radius=radius,
        fill=(255, 255, 255, 255),
    )

    graphic = _logo_graphic_crop(src)
    target = int(s * 0.84)
    logo = graphic.convert('RGBA')
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    lx = (s - logo.width) // 2
    ly = (s - logo.height) // 2

    alpha = logo.split()[3]
    alpha = _bolden_alpha(alpha, size=5)

    tile_px = tile.load()
    alpha_px = alpha.load()
    for y in range(logo.height):
        ty = ly + y
        if ty < 0 or ty >= s:
            continue
        for x in range(logo.width):
            tx = lx + x
            if tx < 0 or tx >= s:
                continue
            if alpha_px[x, y] > 96:
                tile_px[tx, ty] = (0, 0, 0, 0)

    return tile


def _preview_green_tile(icon: Image.Image) -> Image.Image:
    """Simulate on-device look: green tile with white logo cut-out."""
    green = Image.new('RGBA', icon.size, BRAND_GREEN)
    white_bg = Image.new('RGBA', icon.size, (255, 255, 255, 255))
    alpha = icon.split()[3]
    # Opaque tile pixels → green; transparent knock-out → white (notification bg).
    return Image.composite(green, white_bg, alpha)


def _make_notification_large_icon(src: Image.Image) -> Image.Image:
    """Full-color SS2 logo for Android notification large icon."""
    cutout = _remove_white_background(src)
    canvas = Image.new('RGBA', (LARGE_NOTIF_SIZE, LARGE_NOTIF_SIZE), (0, 0, 0, 0))
    logo = cutout.convert('RGBA')
    logo.thumbnail((LARGE_NOTIF_SIZE, LARGE_NOTIF_SIZE), Image.Resampling.LANCZOS)
    x = (LARGE_NOTIF_SIZE - logo.width) // 2
    y = (LARGE_NOTIF_SIZE - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f'Missing source logo: {SRC}')

    src = Image.open(SRC).convert('RGBA')

    app_icon = _brand_tile_icon(src, SIZE, LOGO_FILL_RATIO)
    app_icon.save(ASSETS / 'nepse-ghar-app-icon.png', optimize=True)
    app_icon.save(ASSETS / 'icon.png', optimize=True)
    app_icon.save(ASSETS / 'nepse-ghar-launcher-icon.png', optimize=True)

    adaptive = _adaptive_foreground(src, SIZE, LOGO_FILL_RATIO - 0.04)
    adaptive.save(ASSETS / 'nepse-ghar-adaptive-foreground.png', optimize=True)

    notif = _make_notification_icon(src)
    notif.save(ASSETS / 'notification-icon.png', optimize=True)
    _preview_green_tile(notif).save(
        ASSETS / 'notification-icon-preview-green.png',
        optimize=True,
    )

    large_notif = _make_notification_large_icon(src)
    large_notif.save(ASSETS / 'notification-large-icon.png', optimize=True)

    print('Generated icons from', SRC.name)
    for name in (
        'nepse-ghar-app-icon.png',
        'icon.png',
        'nepse-ghar-adaptive-foreground.png',
        'notification-icon.png',
        'notification-icon-preview-green.png',
        'notification-large-icon.png',
    ):
        print(' -', ASSETS / name)


if __name__ == '__main__':
    main()

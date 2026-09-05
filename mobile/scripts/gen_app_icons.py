"""Generate app icons, splash logo, and Android notification icons from brand source."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'nepse-ghar-full-source.png'
SIZE = 1024
NOTIF_SIZE = 192
LARGE_NOTIF_SIZE = 256

# Brand green — notification tile preview only.
BRAND_GREEN = (27, 94, 32, 255)

# Launcher / splash: show the full white rounded-square tile (like classic home-screen icon).
LAUNCHER_FILL_RATIO = 0.96

# Extracted graphic only (notifications, optional crops).
LOGO_FILL_RATIO = 0.68


def _is_background_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a == 0:
        return False
    # White rounded-square frame + light border.
    if r >= 232 and g >= 232 and b >= 232:
        return True
    if r >= 190 and g >= 190 and b >= 190 and max(r, g, b) - min(r, g, b) < 18:
        return True
    # Black plate behind the logo inside the white tile.
    if r <= 36 and g <= 36 and b <= 36:
        return True
    return False


def _remove_background(img: Image.Image) -> Image.Image:
    rgba = img.convert('RGBA')
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if _is_background_pixel(r, g, b, a):
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def _extract_logo_graphic(src: Image.Image) -> Image.Image:
    """Logo only — no white/black square frames."""
    cutout = _remove_background(src)
    bbox = cutout.getbbox()
    if not bbox:
        return cutout
    return cutout.crop(bbox)


def _fit_on_canvas(
    logo: Image.Image,
    canvas_size: int,
    fill_ratio: float,
    background: tuple[int, int, int, int],
) -> Image.Image:
    canvas = Image.new('RGBA', (canvas_size, canvas_size), background)
    target = int(canvas_size * fill_ratio)
    fitted = logo.convert('RGBA')
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (canvas_size - fitted.width) // 2
    y = (canvas_size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def _full_tile_icon(src: Image.Image, canvas_size: int, fill_ratio: float) -> Image.Image:
    """Full logo tile on white — matches classic launcher (entire design visible)."""
    return _fit_on_canvas(src, canvas_size, fill_ratio, (255, 255, 255, 255))


def _adaptive_foreground(src: Image.Image, canvas_size: int, fill_ratio: float) -> Image.Image:
    """Full tile on transparent canvas; pairs with white adaptive background."""
    return _fit_on_canvas(src, canvas_size, fill_ratio, (0, 0, 0, 0))


def _bolden_alpha(mask: Image.Image, size: int = 5) -> Image.Image:
    if size < 3:
        return mask
    return mask.filter(ImageFilter.MaxFilter(size))


def _make_notification_icon(logo: Image.Image) -> Image.Image:
    """Green tile with logo knocked out — reads on white notification tray."""
    s = NOTIF_SIZE
    margin = int(s * 0.04)
    radius = int(s * 0.22)

    tile = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    draw.rounded_rectangle(
        [(margin, margin), (s - margin - 1, s - margin - 1)],
        radius=radius,
        fill=(255, 255, 255, 255),
    )

    target = int(s * 0.84)
    fitted = logo.convert('RGBA')
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    lx = (s - fitted.width) // 2
    ly = (s - fitted.height) // 2

    alpha = _bolden_alpha(fitted.split()[3], size=5)
    tile_px = tile.load()
    alpha_px = alpha.load()
    for y in range(fitted.height):
        ty = ly + y
        if ty < 0 or ty >= s:
            continue
        for x in range(fitted.width):
            tx = lx + x
            if tx < 0 or tx >= s:
                continue
            if alpha_px[x, y] > 96:
                tile_px[tx, ty] = (0, 0, 0, 0)

    return tile


def _preview_green_tile(icon: Image.Image) -> Image.Image:
    green = Image.new('RGBA', icon.size, BRAND_GREEN)
    white_bg = Image.new('RGBA', icon.size, (255, 255, 255, 255))
    return Image.composite(green, white_bg, icon.split()[3])


def _make_notification_large_icon(logo: Image.Image) -> Image.Image:
    canvas = Image.new('RGBA', (LARGE_NOTIF_SIZE, LARGE_NOTIF_SIZE), (0, 0, 0, 0))
    fitted = logo.convert('RGBA')
    fitted.thumbnail((LARGE_NOTIF_SIZE, LARGE_NOTIF_SIZE), Image.Resampling.LANCZOS)
    x = (LARGE_NOTIF_SIZE - fitted.width) // 2
    y = (LARGE_NOTIF_SIZE - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f'Missing source logo: {SRC}')

    src = Image.open(SRC).convert('RGBA')
    logo = _extract_logo_graphic(src)

    app_icon = _full_tile_icon(src, SIZE, LAUNCHER_FILL_RATIO)
    app_icon.save(ASSETS / 'nepse-ghar-app-icon.png', optimize=True)
    app_icon.save(ASSETS / 'icon.png', optimize=True)
    app_icon.save(ASSETS / 'nepse-ghar-launcher-icon.png', optimize=True)

    adaptive = _adaptive_foreground(src, SIZE, LAUNCHER_FILL_RATIO - 0.04)
    adaptive.save(ASSETS / 'nepse-ghar-adaptive-foreground.png', optimize=True)

    splash = _full_tile_icon(src, SIZE, LAUNCHER_FILL_RATIO)
    splash.save(ASSETS / 'nepse-ghar-logo.png', optimize=True)

    notif = _make_notification_icon(logo)
    notif.save(ASSETS / 'notification-icon.png', optimize=True)
    _preview_green_tile(notif).save(
        ASSETS / 'notification-icon-preview-green.png',
        optimize=True,
    )

    large_notif = _make_notification_large_icon(logo)
    large_notif.save(ASSETS / 'notification-large-icon.png', optimize=True)

    print('Generated icons from', SRC.name)
    for name in (
        'nepse-ghar-app-icon.png',
        'nepse-ghar-logo.png',
        'nepse-ghar-adaptive-foreground.png',
        'notification-icon.png',
        'notification-large-icon.png',
    ):
        print(' -', ASSETS / name)


if __name__ == '__main__':
    main()

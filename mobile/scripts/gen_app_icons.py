"""Generate app / launcher / notification icons from nepse-ghar-full-source.png."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
SRC = ASSETS / 'nepse-ghar-full-source.png'
SIZE = 1024
NOTIF_SIZE = 96


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


def _make_notification_icon(src: Image.Image) -> Image.Image:
    """White silhouette on transparent — Android status-bar small icon."""
    # Use safe-zone scale so bull/bear are not clipped at 96px.
    base = _fit_logo(src, NOTIF_SIZE, 0.62, background='white')
    rgba = base.convert('RGBA')
    px = rgba.load()
    out = Image.new('RGBA', (NOTIF_SIZE, NOTIF_SIZE), (0, 0, 0, 0))
    out_px = out.load()
    for y in range(NOTIF_SIZE):
        for x in range(NOTIF_SIZE):
            r, g, b, a = px[x, y]
            if r > 245 and g > 245 and b > 245:
                continue
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            alpha = min(255, max(0, 255 - lum + 40))
            if alpha > 24:
                out_px[x, y] = (255, 255, 255, alpha)
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f'Missing source logo: {SRC}')

    src = Image.open(SRC).convert('RGBA')

    # Square launcher icon — full logo visible with small margin.
    app_icon = _fit_logo(src, SIZE, 0.94, background='white')
    app_icon.save(ASSETS / 'nepse-ghar-app-icon.png', optimize=True)
    app_icon.save(ASSETS / 'icon.png', optimize=True)

    # Adaptive foreground — smaller so Android circle mask does not crop bull/bear.
    adaptive = _fit_logo(src, SIZE, 0.56, background='transparent')
    adaptive.save(ASSETS / 'nepse-ghar-adaptive-foreground.png', optimize=True)

    # Legacy alias used by older config paths.
    app_icon.save(ASSETS / 'nepse-ghar-launcher-icon.png', optimize=True)

    notif = _make_notification_icon(src)
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

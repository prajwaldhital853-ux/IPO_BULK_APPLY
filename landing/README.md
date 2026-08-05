# NEPSE GHAR Landing

This folder contains the static marketing site for `nepseghar.com`.

## Deployment Target

- `nepseghar.com` -> Vercel static site from this `landing/` folder
- `www.nepseghar.com` -> Vercel static site
- `api.nepseghar.com` -> VPS backend (`64.120.94.197`)

## Local Preview

```bash
cd landing
npm run dev
```

Then open `http://localhost:4173`.

## Vercel Setup

When importing this repository into Vercel:

1. Select this repository
2. Set **Root Directory** to `landing`
3. Framework preset: `Other`
4. Build command: leave empty
5. Output directory: leave empty
6. Deploy

`vercel.json` in this folder handles:

- clean URLs (`/privacy` → `privacy.html`, `/terms` → `terms.html`)
- cache headers for CSS/JS
- a few security-oriented response headers

Public legal pages (required for Google Play):

- https://www.nepseghar.com/privacy
- https://www.nepseghar.com/terms

## DNS Setup

In Hostinger DNS keep the API separate from the landing page:

- `api` -> `A` record -> `64.120.94.197`
- root `@` -> point to Vercel per the domain settings Vercel shows
- `www` -> point to Vercel per the domain settings Vercel shows

Do not change the `api` record to Vercel.

## Content Notes

This landing page is intentionally static and independent from:

- `mobile/` Expo app
- `backend/` FastAPI API

That keeps deployment simple and avoids mixing web hosting concerns with the app backend.

## Optional Hero Video

The hero section is wired for a background video. If you want autoplay video in production, place an MP4 here:

`landing/assets/hero-market.mp4`

The page will fall back to a static visual if that file is missing.

# IPO Bulk Apply / NEPSE GHAR

## Projects

### Mobile app

```bash
cd mobile
pnpm start
```

Core shell UI matches client screenshots (dark theme, local device storage for demo accounts). See `mobile/README.md`.

### Landing site

Static marketing site for `nepseghar.com`, intended for Vercel deployment from the `landing/` folder.

```bash
cd landing
npm run dev
```

See `landing/README.md` for Vercel and DNS setup details.

### Backend API

FastAPI backend for `api.nepseghar.com`, intended to run on the VPS with PostgreSQL.

See `backend/README.md`.

# NEPSE GHAR — Mobile (Expo)

Pixel-same **core shell** UI (dark theme) matching client screenshots.

## Run

```bash
cd mobile
pnpm start
```

Then press `a` for Android emulator / Expo Go, or scan QR with Expo Go.

## What’s included (design phase)

- App bar + eSewa/Khalti promo banner
- Side drawer (market / IPO / resources sections)
- Bottom tabs: Home · Apply · Services · Check · Profile
- Apply empty + filled states
- Add Capital Detail → Bank Detail (data saved **locally** via AsyncStorage)
- Check hub + Current IPO Status
- Profile (Guest)
- Responsive scaling (`rs()`) for phone widths

## Not yet

- Full Services grids / Market charts
- Real Meroshare HTTP apply/result
- SecureStore for passwords (design demo still uses AsyncStorage)

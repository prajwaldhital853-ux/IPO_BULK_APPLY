# NEPSE GHAR — Mobile (Expo)

Pixel-same **core shell** UI (dark theme) matching client screenshots.

## Run (Expo Go — quick test)

```bash
cd mobile
cp .env.example .env   # once; already filled for nepseghar API
npm install            # once
npm run start:go
```

Phone and PC on the **same Wi‑Fi** → scan the QR in **Expo Go**.  
Different network / QR fails → `npm run start:go:tunnel` then scan.

Google sign-in in Expo Go uses the browser flow (not the native picker).  
MeroShare CRN/PIN verify runs on-device against MeroShare — good for testing the save probe fix.

## Run (dev client / full)

```bash
cd mobile
npm start
```

Then press `a` for Android emulator, or use a preview APK.

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

# Share preview APK with client (no Play Store)

## 1. One-time login (you must do this in your terminal)

Create a free account at https://expo.dev if needed, then:

```powershell
cd d:\IPO_BULK_APPLY_PROJECT\mobile
eas login
```

## 2. Link project + build APK

```powershell
cd d:\IPO_BULK_APPLY_PROJECT\mobile
eas build:configure
eas build -p android --profile preview
```

When asked about generating a new Android Keystore → **Yes**.

Build runs in Expo cloud (~10–20 min). When finished, Expo shows a **download URL** for the `.apk`.

## 3. Send to client

- WhatsApp / Drive / email the APK link, **or** download the file and send it  
- Client: enable “Install unknown apps”, open the APK, install

Preview profile is configured in `eas.json` as an **APK** (easy to sideload).

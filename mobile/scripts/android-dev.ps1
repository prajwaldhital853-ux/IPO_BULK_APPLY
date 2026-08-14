# One-time local dev build on USB phone (Google Sign-In works; no EAS per change).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/android-dev.ps1

$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $mobileRoot "android"
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$localProps = Join-Path $androidDir "local.properties"

if (-not (Test-Path $sdk)) {
  Write-Host "Android SDK not found at $sdk"
  Write-Host "Install Android Studio or set ANDROID_HOME."
  exit 1
}

$env:ANDROID_HOME = $sdk
$env:LOCAL_DEV = "1"

if (-not (Test-Path $localProps)) {
  $escaped = $sdk -replace '\\', '\\'
  Set-Content -Path $localProps -Value "sdk.dir=$escaped`n"
  Write-Host "Created android/local.properties"
}

$adb = Join-Path $sdk "platform-tools\adb.exe"
if (Test-Path $adb) {
  $devices = & $adb devices | Select-String "device$"
  if (-not $devices) {
    Write-Host ""
    Write-Host "No phone detected. Plug in USB, enable USB debugging, tap Allow."
    Write-Host "Then run this script again."
    exit 1
  }
}

Set-Location $mobileRoot
Write-Host "Building dev client and installing on phone (first run ~5-15 min)..."
npx expo run:android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "After this succeeds once, for daily work run:"
Write-Host "  npm run start:dev"
Write-Host ""
Write-Host "Then add debug SHA-1 to Google Cloud:"
Write-Host "  npm run sha1:debug"

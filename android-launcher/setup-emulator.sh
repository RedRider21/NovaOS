#!/usr/bin/env bash
# Installa Android SDK (cmdline-tools, platform-tools, emulator, system image)
# e crea un AVD "nova" pronto per testare NovaOS.
# Idempotente: puo' essere rilanciato senza danni.
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
CLT_ZIP="commandlinetools-linux-11076708_latest.zip"
CLT_URL="https://dl.google.com/android/repository/$CLT_ZIP"
API="34"
IMG="system-images;android-${API};google_apis;x86_64"

echo "[1/6] Preparazione $ANDROID_HOME"
mkdir -p "$ANDROID_HOME/cmdline-tools"

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[2/6] Download command line tools"
  tmp="$(mktemp -d)"
  curl -L --fail -o "$tmp/$CLT_ZIP" "$CLT_URL"
  echo "[3/6] Estrazione"
  ( cd "$tmp" && unzip -q "$CLT_ZIP" )
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
else
  echo "[2/6] command line tools gia' presenti, salto"
fi

SDKMGR="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDMGR="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

echo "[4/6] Accettazione licenze"
yes | "$SDKMGR" --licenses >/dev/null 2>&1 || true

echo "[5/6] Installazione pacchetti (platform-tools, emulator, platform, system image, build-tools)"
"$SDKMGR" "platform-tools" "emulator" "platforms;android-${API}" "$IMG" "build-tools;34.0.0"

echo "[6/6] Creazione AVD 'nova' (Pixel 6)"
if ! "$AVDMGR" list avd 2>/dev/null | grep -q "Name: nova"; then
  echo "no" | "$AVDMGR" create avd -n nova -k "$IMG" -d pixel_6 --force
else
  echo "AVD 'nova' gia' esistente"
fi

echo "SETUP-COMPLETATO"

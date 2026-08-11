#!/usr/bin/env bash
# Trasforma l'emulatore in un dispositivo "NovaOS": installa il launcher come
# app di SISTEMA (priv-app), disabilita il launcher e il setup wizard di serie,
# imposta NovaOS come Home + telefono predefinito. Il device si avvia direttamente
# in NovaOS — come una ROM stile Firefox OS/KaiOS — SENZA ricompilare AOSP.
#
# PREREQUISITO: avvia l'emulatore con la partizione di sistema scrivibile:
#   emulator -avd nova -writable-system -no-snapshot -gpu host
#
# Uso: ./make-emulator-rom.sh
set -e
export PATH="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"
APK="$(cd "$(dirname "$0")/.." && pwd)/android-launcher/build/novaos.apk"
PKG=os.nova.launcher

[ -f "$APK" ] || { echo "APK non trovato. Compila prima: bash android-launcher/build-apk.sh"; exit 1; }

echo "[1/6] root + partizione di sistema scrivibile"
adb root; sleep 2
if ! adb remount 2>/dev/null; then
  echo "  disattivo dm-verity e riavvio (necessario una volta sola)…"
  adb disable-verity || true
  adb reboot; adb wait-for-device; sleep 8
  adb root; sleep 2; adb remount
fi

echo "[2/6] installo NovaOS come app di sistema (priv-app)"
adb shell mkdir -p /system/priv-app/NovaOS
adb push "$APK" /system/priv-app/NovaOS/NovaOS.apk

echo "[3/6] disabilito launcher e setup di serie"
for p in com.google.android.apps.nexuslauncher com.android.launcher3 \
         com.google.android.setupwizard com.android.provision; do
  adb shell pm disable-user --user 0 "$p" 2>/dev/null || true
done

echo "[4/6] NovaOS come Home predefinita"
adb shell cmd package set-home-activity "$PKG/.MainActivity" || true

echo "[5/6] NovaOS come telefono predefinito"
adb shell cmd role add-role-holder android.app.role.DIALER "$PKG" 2>/dev/null || true
adb shell cmd telecom set-default-dialer "$PKG" 2>/dev/null || true

echo "[6/6] riavvio: il device parte direttamente in NovaOS"
adb reboot
echo "Fatto. Per annullare: android-launcher/reset-device.sh, oppure ricrea l'AVD."

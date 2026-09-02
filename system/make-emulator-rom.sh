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

echo "[2/6] installo NovaOS come app di sistema (priv-app) + whitelist privilegi"
adb shell mkdir -p /system/priv-app/NovaOS
adb push "$APK" /system/priv-app/NovaOS/NovaOS.apk
# SENZA la whitelist, Android 9+ blocca il boot con "not in privapp-permissions
# allowlist" (crashloop di system_server). Deve stare in /system/etc/permissions/.
adb shell mkdir -p /system/etc/permissions
adb push "$(dirname "$0")/privapp-permissions-novaos.xml" /system/etc/permissions/privapp-permissions-novaos.xml

echo "[3/6] disabilito launcher e setup di serie"
for p in com.google.android.apps.nexuslauncher com.android.launcher3 \
         com.google.android.setupwizard com.android.provision; do
  adb shell pm disable-user --user 0 "$p" 2>/dev/null || true
done

echo "[4/6] NovaOS come Home predefinita"
adb shell cmd package set-home-activity "$PKG/.MainActivity" || true

echo "[5/6] NovaOS come telefono predefinito"
# Il ruolo dialer si assegna SOLO con cmd role (senza --user: il flag causa
# NumberFormatException). cmd telecom set-default-dialer NON esiste come comando
# shell: il default-dialer è proprio il ruolo, quindi basta il comando seguente.
adb shell cmd role add-role-holder android.app.role.DIALER "$PKG" 2>/dev/null || true

echo "[6/6] riavvio: il device parte direttamente in NovaOS"
adb reboot
echo "Fatto. Per annullare: android-launcher/reset-device.sh, oppure ricrea l'AVD."

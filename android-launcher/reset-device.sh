#!/usr/bin/env bash
# Ripristina il telefono/emulatore allo stato normale dopo aver usato NovaOS.
# NovaOS, quando lo imposti come Home e come telefono predefinito, "prende il
# posto" del launcher e del dialer di sistema: questo script rimette a posto tutto.
#
# Uso: ./reset-device.sh            (device/emulatore collegato via adb)
set -e
export PATH="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"
PKG=os.nova.launcher

echo "== 1) Ripristino il launcher (Home) di sistema =="
# individua un launcher di sistema disponibile e lo imposta come Home
HOME_ACT=$(adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null \
  | grep -oE "[a-zA-Z0-9_.]+/[a-zA-Z0-9_.]+" | grep -v "$PKG" | head -1)
if [ -n "$HOME_ACT" ]; then
  adb shell cmd package set-home-activity "$HOME_ACT" && echo "Home -> $HOME_ACT"
else
  echo "Nessun altro launcher trovato: verrà ripristinato disinstallando NovaOS."
fi

echo "== 2) Ripristino il telefono (dialer) predefinito =="
# toglie a NovaOS il ruolo di app telefono predefinita
adb shell cmd role remove-role-holder android.app.role.DIALER "$PKG" 2>/dev/null || true
# in alternativa reimposta il dialer di sistema, se presente
for d in com.google.android.dialer com.android.dialer; do
  adb shell cmd telecom set-default-dialer "$d" 2>/dev/null && { echo "Dialer -> $d"; break; }
done

echo "== 3) (opzionale) Disinstallo NovaOS =="
read -r -p "Vuoi disinstallare NovaOS dal device? [s/N] " ans
if [ "$ans" = "s" ] || [ "$ans" = "S" ]; then
  adb uninstall "$PKG" && echo "NovaOS disinstallato."
else
  echo "NovaOS resta installato (lo apri dall'app drawer quando vuoi)."
fi

echo "Fatto. Premi Home per verificare che sia tornato il launcher di sistema."

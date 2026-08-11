#!/usr/bin/env bash
# Innesta NovaOS in un'immagine Android VANILLA già pronta (GSI = Generic System
# Image di Google), SENZA compilare AOSP. Produce un system.img "NovaOS" flashabile
# via fastboot su un device compatibile Project Treble (o avviabile in emulatore).
#
# Idea: il GSI è Android puro prebuilt (~1 GB). Lo montiamo, copiamo NovaOS come
# app di sistema (priv-app), applichiamo gli overlay (Home = NovaOS, via novaos.mk
# non serve: qui basta l'overlay/config), rimpacchettiamo. È il modello Firefox OS
# ottenuto per innesto, non per ricompilazione.
#
# PREREQUISITI:
#   - sudo (per il mount in loop dell'immagine)
#   - simg2img / img2simg  (pacchetto: android-sdk-libsparse-utils)
#   - un GSI vanilla scaricato (vedi GSI_URL)
set -e

# GSI AOSP ufficiali: https://developer.android.com/topic/generic-system-image/releases
# build grezze: https://ci.android.com  (aosp_arm64-exp-* / aosp_x86_64-exp-*)
GSI_URL="${GSI_URL:-<incolla-qui-URL-del-GSI-vanilla.zip>}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android-launcher/build/novaos.apk"
WORK="${WORK:-$HOME/novaos-gsi}"
mkdir -p "$WORK"; cd "$WORK"

[ -f "$APK" ] || { echo "APK mancante: bash android-launcher/build-apk.sh"; exit 1; }

echo "[1/5] scarico ed estraggo il GSI vanilla"
[ -f gsi.zip ] || curl -L -o gsi.zip "$GSI_URL"
unzip -o gsi.zip            # -> system.img (sparse)

echo "[2/5] converto sparse -> raw e monto"
simg2img system.img system.raw
mkdir -p mnt
sudo mount -o loop,rw system.raw mnt

echo "[3/5] innesto NovaOS come app di sistema"
sudo mkdir -p mnt/system/priv-app/NovaOS
sudo cp "$APK" mnt/system/priv-app/NovaOS/NovaOS.apk
# overlay: imposta NovaOS come Home predefinita (config_defaultHome)
# copia qui gli overlay/ già presenti in system/overlay se il GSI li supporta.

echo "[4/5] smonto e riconverto in sparse"
sudo umount mnt
img2simg system.raw system-novaos.img

echo "[5/5] pronto -> $WORK/system-novaos.img"
echo "Device reale (Treble):   fastboot flash system system-novaos.img"
echo "Emulatore:               emulator -avd nova -system $WORK/system-novaos.img"

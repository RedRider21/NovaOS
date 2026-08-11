#!/usr/bin/env bash
# NovaOS — passi per costruire l'immagine di sistema (ROM).
# NON eseguibile "as-is": è una guida operativa. Richiede ~400 GB liberi,
# molta RAM e ore di build. Esegui i blocchi manualmente sulla macchina di build.
set -e

# ============================================================
#  OPZIONE A — build AOSP completa (NovaOS come system app)
# ============================================================
aosp() {
  mkdir -p ~/novaos-aosp && cd ~/novaos-aosp

  # 1. strumenti
  #   sudo apt install repo openjdk-17-jdk git-lfs ...

  # 2. sorgenti AOSP (base = il vero SO sotto la web shell)
  repo init -u https://android.googlesource.com/platform/manifest -b android-14.0.0_r30
  repo sync -c -j"$(nproc)"

  # 3. inietta il product tree di NovaOS
  mkdir -p device/nova/novaos
  cp -r "$OLDPWD"/system/novaos.mk    device/nova/novaos/
  cp -r "$OLDPWD"/system/overlay      device/nova/novaos/overlay
  cat > device/nova/novaos/AndroidProducts.mk <<'EOF'
PRODUCT_MAKEFILES := $(LOCAL_DIR)/novaos.mk
COMMON_LUNCH_CHOICES := novaos-userdebug novaos-eng
EOF

  # 4. compila il launcher e mettilo tra i pacchetti buildabili
  #    (in alternativa prebuilt: copia NovaOSLauncher.apk in un modulo prebuilt)
  cp -r "$OLDPWD"/android-launcher packages/apps/NovaOSLauncher
  #    e impacchetta la web shell negli assets del launcher:
  rm -rf packages/apps/NovaOSLauncher/app/src/main/assets/www
  mkdir -p packages/apps/NovaOSLauncher/app/src/main/assets/www
  cp -r "$OLDPWD"/shell/* packages/apps/NovaOSLauncher/app/src/main/assets/www/
  #    ricorda: in MainActivity.java imposta DEV=false per caricare gli assets locali.

  # 5. build
  source build/envsetup.sh
  lunch novaos-userdebug
  make -j"$(nproc)"

  # 6. avvia in emulatore con la system image prodotta, oppure flasha il device
  #    emulator -verbose  (usa i target di out/)
}

# ============================================================
#  OPZIONE B — LineageOS + priv-app (più rapida)
# ============================================================
lineage() {
  # 1. segui la guida LineageOS per il device target (repo init del branch lineage-21)
  # 2. copia il launcher come priv-app prebuilt:
  #      vendor/nova/prebuilt/NovaOSLauncher/NovaOSLauncher.apk + Android.mk
  # 3. overlay config_defaultHome -> os.nova.launcher/.MainActivity (vedi system/overlay)
  # 4. brunch <device>  ->  produce zip flashabile via recovery
  echo "Vedi commenti: integrazione priv-app in LineageOS."
}

echo "NovaOS ROM: apri lo script e segui la funzione aosp() o lineage()."

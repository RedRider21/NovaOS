# NovaOS — product makefile AOSP
# Copiare come device/nova/novaos/novaos.mk e referenziare in AndroidProducts.mk.
# Trasforma una build AOSP in NovaOS: launcher di sistema come Home predefinita,
# rimozione delle app superflue, nessun Google Mobile Services.

# Eredita la base handheld di AOSP (telefonia, WebView, servizi essenziali)
$(call inherit-product, $(SRC_TARGET_DIR)/product/core_64_bit.mk)
$(call inherit-product, $(SRC_TARGET_DIR)/product/handheld_system.mk)

PRODUCT_NAME    := novaos
PRODUCT_DEVICE  := generic_x86_64
PRODUCT_BRAND   := NovaOS
PRODUCT_MODEL   := Nova N1
PRODUCT_MANUFACTURER := Nova

# --- App di sistema di NovaOS ---
# NovaOSLauncher = il launcher WebView (cartella android-launcher/ compilata).
# Va installato come priv-app perché è la Home di sistema.
PRODUCT_PACKAGES += \
    NovaOSLauncher \
    WebViewGoogle \
    Chrome

# --- App AOSP da NON includere (le sostituisce la web shell) ---
# Si ottiene non ereditando i pacchetti relativi e/o rimuovendoli qui.
PRODUCT_PACKAGES_REMOVE += \
    Launcher3 \
    Launcher3QuickStep \
    Calendar \
    QuickSearchBox

# --- Override di configurazione (vedi overlay/) ---
# Imposta NovaOSLauncher come Home predefinita e altre policy.
PRODUCT_PACKAGE_OVERLAYS += device/nova/novaos/overlay

# WebView aggiornabile e cleartext consentito in dev (rimuovere in release)
PRODUCT_PROPERTY_OVERRIDES += \
    ro.novaos.version=0.1 \
    ro.novaos.channel=dev

# Niente Google Mobile Services: NovaOS è puramente open + web app.

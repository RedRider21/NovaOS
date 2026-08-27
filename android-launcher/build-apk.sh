#!/usr/bin/env bash
# Build manuale dell'APK del launcher NovaOS senza Gradle:
# aapt2 (link manifest+assets) -> javac -> d8 (dex) -> zipalign -> apksigner.
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/34.0.0"
JDK="$(dirname "$(dirname "$(readlink -f "$(which java)")")")"
JAVAC="$JDK/bin/javac"
AJAR="$SDK/platforms/android-34/android.jar"
APP="$(cd "$(dirname "$0")/app" && pwd)"
OUT="$(dirname "$0")/build"; OUT="$(cd "$(dirname "$0")" && pwd)/build"
MANIFEST="$APP/src/main/AndroidManifest.xml"
JAVA_SRC="$APP/src/main/java"
ASSETS="$APP/src/main/assets"
RES="$APP/src/main/res"
LIBS="$(cd "$(dirname "$0")" && pwd)/libs"

# librerie esterne (JavaMail per Android: SMTP/IMAP reali)
CP="$AJAR"
LIBJARS=""
if [ -d "$LIBS" ]; then
  for j in "$LIBS"/*.jar; do [ -f "$j" ] && CP="$CP:$j" && LIBJARS="$LIBJARS $j"; done
fi

rm -rf "$OUT"; mkdir -p "$OUT/classes"

echo "[0/6] sincronizzo la web shell negli assets (offline)"
SHELL_SRC="$(cd "$(dirname "$0")/.." && pwd)/shell"

# genera version.json (fonte di verità per l'auto-aggiornamento OTA): versione e build
# vengono lette dal manifest così non vanno mai fuori sincrono col numero dell'APK.
VNAME="$(grep -o 'versionName="[^"]*"' "$MANIFEST" | head -1 | sed 's/versionName="//;s/"//')"
VCODE="$(grep -o 'versionCode="[^"]*"' "$MANIFEST" | head -1 | sed 's/versionCode="//;s/"//')"
VDATE="$(date +%Y-%m-%d)"
NOTES="${NOVA_UPDATE_NOTES:-Miglioramenti e correzioni.}"
# minNative = build nativa minima capace di eseguire questa shell. Da alzare SOLO quando
# la shell dipende da un nuovo metodo del bridge Java (allora serve un APK, non l'OTA-shell).
MINNATIVE="${NOVA_MIN_NATIVE:-12}"
# elenco dei file della shell da scaricare per l'aggiornamento OTA (esclusi gli harness di
# test); version.json incluso in coda così la shell interna aggiorna il proprio numero.
FILES_JSON="$(cd "$SHELL_SRC" && find . -type f ! -name '_t*.html' ! -name 'version.json' | sed 's#^\./##' | sort | sed 's/.*/    "&"/' | paste -sd, -)"
FILES_JSON="$FILES_JSON,
    \"version.json\""
cat > "$SHELL_SRC/version.json" <<JSON
{
  "version": "$VNAME",
  "build": $VCODE,
  "minNative": $MINNATIVE,
  "date": "$VDATE",
  "notes": "$NOTES",
  "apk": "https://github.com/RedRider21/NovaOS/releases/download/v0.1.50/NovaOS-0.1.50.apk",
  "files": [
$FILES_JSON
  ]
}
JSON
echo "     version.json -> $VNAME (build $VCODE, minNative $MINNATIVE)"

# genera js/version.js: espone la build via <script> (window.__NOVA_SHELL). Necessario
# perché quando la shell gira da file:// (aggiornata via OTA) la WebView blocca
# fetch("version.json"); così l'updater riconosce la build attiva e non ripropone in
# loop lo stesso aggiornamento. Stessi numeri di version.json.
cat > "$SHELL_SRC/js/version.js" <<JS
/* Generato da build-apk.sh — build della shell in esecuzione. Vedi js/version.js nel repo. */
window.__NOVA_SHELL = { version: "$VNAME", build: $VCODE, minNative: $MINNATIVE, date: "$VDATE" };
JS

rm -rf "$ASSETS/www"; mkdir -p "$ASSETS/www"
cp -r "$SHELL_SRC"/. "$ASSETS/www/"
rm -f "$ASSETS/www"/_t*.html   # non impacchettare gli harness di test

echo "[1/6] aapt2 compile risorse (icona) + link (manifest + assets)"
"$BT/aapt2" compile --dir "$RES" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$AJAR" \
  --manifest "$MANIFEST" -A "$ASSETS" "$OUT/res.zip" \
  --min-sdk-version 26 --target-sdk-version 34 \
  --auto-add-overlay

echo "[2/6] javac"
find "$JAVA_SRC" -name '*.java' > "$OUT/sources.txt"
"$JAVAC" -source 17 -target 17 -classpath "$CP" \
  -d "$OUT/classes" @"$OUT/sources.txt" 2>&1 | grep -v "bootstrap class path" || true

echo "[3/6] d8 (dex — include le librerie mail)"
CLASSES=$(find "$OUT/classes" -name '*.class')
"$BT/d8" $CLASSES $LIBJARS --lib "$AJAR" --min-api 26 --output "$OUT"

echo "[4/6] aggiungo i .dex all'APK"
( cd "$OUT" && zip -q -j base.apk classes*.dex )

echo "[5/6] zipalign"
"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/novaos-aligned.apk"

echo "[6/6] firma (debug keystore)"
KS="$HOME/.android/debug.keystore"
if [ ! -f "$KS" ]; then
  mkdir -p "$HOME/.android"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" \
    -keyalg RSA -keysize 2048 -validity 10000
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/novaos.apk" "$OUT/novaos-aligned.apk"

echo "OK -> $OUT/novaos.apk"

# NovaOS — Prossimi step verso la ROM (kernel originale intatto)

Data: 2026-10-18
Stato di partenza: shell 0.1.60 (build 62), modulo Gecko ricompilato, APK debug
`gecko-debug.apk` prodotto in locale.

Questa scheda è il **percorso operativo a tappe** per arrivare alla ROM installabile.
La descrizione tecnica completa delle vie di installazione resta in
[`GUIDA-ROM.md`](GUIDA-ROM.md) §5; qui c'è l'ordine in cui fare le cose.

---

## 0. Principio: come si tiene il kernel originale

La via pulita è la **GSI** (Generic System Image):

- si sostituisce **solo la partizione `system`** (al massimo anche `product`);
- restano intatti **`boot.img` / `vendor_boot.img`** → il **kernel è quello del
  telefono**, insieme a `dtbo` e alla partizione **`vendor`** con driver e HAL;
- serve un device **Project Treble**, con bootloader sbloccabile e (meglio)
  partizioni dinamiche;
- va disattivata la verifica AVB/verity
  (`fastboot --disable-verity --disable-verification`): non è una sostituzione del
  kernel, è solo il controllo di firma.

Su Android 12+ con **GKI** il discorso è ancora più netto: il kernel sta nel boot
originale e i moduli del produttore restano quelli del vendor.

---

## 1. Scegliere il telefono di prova (secondario)

Meglio un Pixel o un device con GSI ben supportata. Da collegare in ADB e
verificare:

```bash
adb shell getprop ro.product.model
adb shell getprop ro.treble.enabled          # deve essere true
adb shell getprop ro.build.ab_update         # A/B?
adb shell getprop ro.boot.dynamic_partitions # true = partizioni dinamiche
adb shell getprop ro.vndk.version            # compatibilità GSI
adb shell getprop ro.build.version.release
adb shell getprop ro.product.cpu.abi
```

## 2. Preparare il ritorno

Scaricare il **firmware stock** del modello e mettere da parte `boot`,
`vendor_boot`, `dtbo`, `vbmeta`; verificare che il bootloader sia sbloccabile.
Lo sblocco **cancella i dati**.

## 3. Prima milestone senza ROM (kernel già intatto)

Installare l'APK NovaOS come Home sul telefono stock e, con un modulo Magisk,
metterlo in `priv-app` con la whitelist dei permessi: così si provano bridge
privilegiato, telefonia, impostazioni di sistema e OTA **senza toccare nulla del
sistema**. È la verifica più economica.

## 4. Prima ROM vera: GSI precompilata + NovaOS

Non serve compilare AOSP subito: si parte da una **GSI AOSP/LineageOS**, ci si
innesta NovaOS come launcher/priv-app con overlay e permessi, e si flasha **solo
`system`**. Il telefono conserva kernel e vendor originali. Qui si collaudano
chiamate, SMS, fotocamera, sensori e app di terze parti.

## 5. GSI NovaOS propria

Solo dopo: build AOSP del target GSI con dentro NovaOS (priv-app, Home predefinita,
whitelist, SELinux, OTA). Fino a quel momento la GSI precompilata basta per
validare tutto.

## 6. Rifinitura

Firma con chiavi proprie, aggiornamenti OTA della shell, pacchetto di ripristino
per ogni modello, e test delle app bancarie/Play Integrity (con bootloader
sbloccato possono rifiutarsi: è un limite del device, non della ROM).

---

## Spazio su disco: cosa serve davvero

| Attività | Spazio richiesto | Quando |
|---|---|---|
| Test dell'app/shell su telefono reale | **0** sul PC (sta sul telefono) | subito, tappa 3 |
| GSI precompilata + NovaOS (tappa 4) | ~1–2 GB (download immagine) | dopo la tappa 3 |
| Build AOSP / GSI propria (tappa 5) | **200–300 GB** + 16 GB RAM | ultima |

Quindi **la mancanza di spazio non blocca i prossimi passi**: blocca solo la
build AOSP della tappa 5, che è l'ultima.

## L'APK da 504 MB: si può eliminare?

Sì. È un prodotto di build **ricostruibile** dai sorgenti recuperati, con la
toolchain in `os/privato/`:

- `android-launcher/gecko/build/` → 1,5 GB (di cui 504 MB l'APK): **eliminabile**,
  si rigenera con Gradle in ~40 s (toolchain già scaricata, funziona offline);
- `os/privato/` → 2,9 GB: **da tenere**, è la toolchain che permette la
  ricompilazione senza riscaricare nulla.

Quando servirà l'APK per il telefono converrà produrre una variante **solo
`arm64-v8a`** (~170 MB invece di 504 MB), sufficiente per qualsiasi telefono
recente: la build universale include anche `armeabi-v7a` e `x86_64`.

Per ricostruire (dalla cartella `android-launcher/`):

```bash
GRADLE_USER_HOME=../privato/gradle-home \
  ../privato/gradle-9.7.1/bin/gradle :gecko:assembleDebug
```

---

## Cosa serve per partire

Il **modello esatto del telefono** e l'output dei comandi della tappa 1. Con
quelli si preparano la scheda di compatibilità, il pacchetto `priv-app` +
whitelist + overlay e la procedura di flash/ripristino specifica del dispositivo.

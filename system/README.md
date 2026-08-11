# NovaOS — livello di sistema (SO di base)

Questa cartella risponde alla domanda: **"dov'è il SO di base sotto la web app?"**

## Perché non vedi i sorgenti del SO base nel repo

Il "SO di base" di NovaOS **è AOSP** (Android Open Source Project): kernel Linux,
driver/HAL, servizi di sistema, stack radio, runtime. Non lo scriviamo da zero —
sarebbe il lavoro di centinaia di persone. Lo **riusiamo e lo configuriamo**,
esattamente come fanno LineageOS, /e/OS, KaiOS e (a suo tempo) Firefox OS.

AOSP non sta nel repo perché:
- pesa ~200 GB una volta sincronizzato con `repo`;
- si scarica dai server Google/AOSP con `repo init && repo sync`;
- versionarlo in un repo applicativo non ha senso.

Quello che sta nel repo è la **ricetta** per trasformare AOSP in NovaOS:
il device/product tree, l'integrazione del launcher come app di sistema, la
rimozione delle app non volute e le override di configurazione.

## Architettura a tre livelli

```
Livello 2  web shell (shell/)            HTML/CSS/JS — l'esperienza utente
Livello 1  NovaOS launcher (android-launcher/)  WebView Home + bridge nativo
Livello 0  AOSP  (questa cartella = ricetta)     kernel, HAL, radio, servizi
```

- **Fase attuale (dev)**: Livelli 1+2 girano sopra un AOSP standard
  (l'emulatore, o un telefono con LineageOS). Il launcher si installa come una
  normale app e si imposta come Home. È ciò che stiamo testando.
- **Fase ROM (questa cartella)**: si compila un'immagine AOSP custom in cui il
  launcher è **app di sistema** e **Home predefinita non disinstallabile**, le
  app superflue sono rimosse e NovaOS è l'unica esperienza. Il risultato è una
  `system.img` flashabile: il vero "NovaOS" come sistema operativo.

## Ottenere NovaOS come sistema: i percorsi

Nota sul termine "ISO": una `.iso` è il formato immagine per PC/CD. **Android non
usa ISO** — un sistema Android si distribuisce come immagine di partizione
(`system.img`) o come pacchetto flashabile via recovery. NovaOS segue lo stesso
modello di Firefox OS/KaiOS: kernel + HAL di Android sotto, esperienza web sopra.

**Idea chiave (la via consigliata): non serve compilare AOSP.** Si prende
un'immagine Android **vanilla già pronta** e vi si *innesta* NovaOS. Due casi:

1. **Emulatore — subito, senza scaricare nulla** → `make-emulator-rom.sh`.
   L'immagine dell'emulatore È Android vanilla (AOSP `google_apis`): lo script
   installa la shell come app di sistema, disabilita launcher e setup di serie, e
   fa avviare l'emulatore **direttamente in NovaOS**.
   ```bash
   emulator -avd nova -writable-system -no-snapshot -gpu host   # terminale 1
   ./system/make-emulator-rom.sh                                 # terminale 2
   ```

2. **Device reale via GSI (immagine vanilla prebuilt)** → `build-gsi.sh`.
   Si scarica un **GSI** (Generic System Image di Google, ~1 GB, Android puro
   prebuilt), lo si monta, vi si copia NovaOS come app di sistema e si rimpacchetta
   un `system.img` **flashabile via fastboot** su un device Project Treble.
   Nessuna compilazione di AOSP. È la risposta a "scaricare vanilla e innestare".

   **Perché è subito compatibile con l'hardware del telefono (Project Treble).**
   Da Android 8 il sistema è diviso in partizioni separate:
   - `system` = framework Android generico (sostituibile → qui va NovaOS);
   - `vendor` = driver e HAL specifici del telefono;
   - `boot` = kernel (con i driver del device).

   Flashando **solo `system`** con NovaOS e lasciando **intatte `vendor` e `boot`**,
   NovaOS gira usando **kernel e driver originali del telefono** → radio, fotocamera,
   sensori, GPU, ecc. funzionano subito. È esattamente il principio con cui Firefox OS
   (Gonk) riusava l'HAL di Android. Requisiti: device Treble-compatibile (≈ tutti da
   Android 9+) e bootloader sbloccato.

Alternative avanzate (solo se serve controllo totale):

3. **ROM AOSP completa** → `novaos.mk` + `build-rom.sh` (scarica AOSP con `repo`,
   compila `system.img`). ~400 GB e ore di build.
4. **LineageOS + priv-app** → parti da LineageOS del tuo device e inietti NovaOS
   come priv-app. Vedi `build-rom.sh` (sezione LINEAGE).

## Cosa resta e cosa si elimina nella ROM

Costruire NovaOS come sistema **non** significa "cancellare tutto Android". Significa
partire da AOSP e togliere lo strato *esperienza* di serie, lasciando intatto il
**nucleo minimo** che gestisce l'hardware. "Eliminare tutto" non è letterale.

### Cosa resta (il nucleo indispensabile — "il SO che serve sotto")

- **Kernel Linux + driver/HAL**: schermo, touch, batteria, sensori, radio, fotocamera.
- **Stack telefonia** (RIL, Telephony/TelecomManager): serve per le chiamate reali —
  la web app Telefono lo pilota via `tel:` / bridge `NovaNative.call`.
- **Servizi di sistema**: display (SurfaceFlinger), audio, connettività, package
  manager, gestione permessi.
- **Motore WebView/Chromium**: è il runtime su cui gira l'intera shell di NovaOS.
  Senza questo, NovaOS non esiste.

### Cosa si elimina (lo strato "esperienza" di serie)

- **Launcher stock** (Launcher3/QuickStep) → sostituito da NovaOSLauncher.
- **App e servizi Google** (Play Store, GMS, Gmail, ecc.): NovaOS è open + web app.
- **Setup wizard** di Google.
- **App di serie ridondanti** rimpiazzate da web app (Calendario, ricerca, ecc.).

Questo si traduce direttamente in `novaos.mk`:
`PRODUCT_PACKAGES` (cosa resta) vs `PRODUCT_PACKAGES_REMOVE` (cosa si toglie),
niente Google Mobile Services, `config_defaultHome` = NovaOSLauncher.

### Il caso delicato: la telefonia (backend invisibili)

Alcune app "di sistema" non sono solo interfacce: sono **backend**. Il *Dialer* di
sistema, per esempio, gestisce la telefonata reale che la nostra app Telefono
innesca. Quindi:

- **Opzione semplice**: tenere un dialer di sistema minimo (anche headless) come
  backend delle chiamate; l'interfaccia resta la web app di NovaOS.
- **Opzione completa**: implementare un `InCallService` custom dentro il launcher,
  così anche la gestione della chiamata in corso (rispondi/riaggancia/vivavoce) è
  nativa di NovaOS e non serve il dialer stock.

Lo stesso ragionamento vale per SMS (`SmsManager`/default SMS app) e per la
fotocamera (il servizio camera di sistema resta; l'app Fotocamera è la web app).

Regola pratica: **si eliminano le interfacce di serie, si tengono i servizi/backend**
che quelle interfacce pilotavano. NovaOS fornisce le nuove interfacce (web) e le
collega ai backend tramite URI (`tel:`, `sms:`) o tramite il bridge nativo.

## Come procedere per costruire la ROM

1. Prerequisiti: Linux, ~400 GB liberi, 32+ GB RAM consigliati, `repo`, toolchain AOSP.
2. Sincronizza AOSP (vedi `build-rom.sh`): `repo init -b android-14.0.0_r... && repo sync`.
3. Copia `novaos/` come product tree in `device/nova/novaos/` (vedi `novaos.mk`).
4. Copia il launcher compilato (`NovaOSLauncher.apk`) tra i `PRODUCT_PACKAGES`.
5. `source build/envsetup.sh && lunch novaos-userdebug && make -jN`.
6. Flash su device supportato o avvio in emulatore con la system image prodotta.

I file `novaos.mk`, `overlay/` e `build-rom.sh` contengono la configurazione di
partenza già pronta da adattare.

## Alternativa più rapida: LineageOS + priv-app

Invece di una build AOSP completa si può partire da una ROM LineageOS del device
target e iniettare il launcher in `vendor/` come `priv-app`, impostandolo come
Home di default via overlay. Stesso risultato pratico (NovaOS come sistema),
molto meno tempo di build. Passi in `build-rom.sh` (sezione LINEAGE).

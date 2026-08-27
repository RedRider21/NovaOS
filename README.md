# NovaOS

Sistema operativo per smartphone con **interfacce web su base Android**, nello
spirito di Firefox OS / KaiOS: Android gestisce solo l'essenziale (kernel, driver,
radio, sensori), mentre tutta l'esperienza utente — home, lockscreen, app — è
scritta in HTML/CSS/JS. Le applicazioni sono **web app / PWA**.

> Nome in codice e versione: **NovaOS 0.1.50** (build 52). Nome placeholder,
> modificabile in un punto (`shell/index.html` e `manifest.webmanifest`).
>
> 📘 Per la distribuzione definitiva vedi **[docs/GUIDA-ROM.md](docs/GUIDA-ROM.md)**:
> cosa resta del telefono (kernel/driver riusati), installazione passo-passo,
> bridge "reale" a doppia modalità e nota sulle app bancarie/attestazione.

## Architettura a tre livelli

```
Livello 2  shell/               web shell: l'intero "sistema" visibile (HTML/CSS/JS)
Livello 1  android-launcher/    launcher WebView (Home) + bridge nativo all'hardware
Livello 0  system/              ricetta AOSP per la ROM (il "SO di base" sotto)
```

- **Sviluppo**: la web shell gira in un browser o nella WebView dell'emulatore.
- **Device**: il launcher registra NovaOS come Home e apre la shell a schermo intero.
- **ROM**: `system/` documenta come compilare un'immagine AOSP con NovaOS integrato.

## Struttura

```
web-phone-os/
├─ shell/                     web shell (cuore del progetto)
│  ├─ index.html              boot · lockscreen · home · app view · shade · navbar
│  ├─ css/style.css           design flat, tema chiaro/scuro, componenti
│  ├─ js/os.js                core: boot, blocco/PIN, window manager, notifiche,
│  │                          stato di sistema, storage, archivio foto (IndexedDB)
│  ├─ js/apps.js              app di sistema (vedi sotto)
│  ├─ manifest.webmanifest    PWA installabile
│  ├─ icon.svg                logo Nova
│  └─ sw.js                   service worker (offline, network-first)
├─ android-launcher/          app Android (Java, WebView) + bridge NovaNative
│  ├─ app/src/main/java/os/nova/launcher/MainActivity.java
│  ├─ app/src/main/AndroidManifest.xml
│  ├─ build.gradle · settings.gradle
│  └─ setup-emulator.sh       installa Android SDK + emulatore e crea l'AVD
└─ system/                    livello di sistema (ROM AOSP)
   ├─ README.md               spiegazione del "SO di base"
   ├─ novaos.mk               product makefile AOSP
   ├─ overlay/…/config.xml    NovaOS come Home predefinita
   └─ build-rom.sh            passi per costruire la ROM (AOSP o LineageOS)
```

## App incluse

| App | Funzioni |
|-----|----------|
| Telefono | dialer completo stile Android: **Preferiti, Recenti** (con ricerca), **Contatti dalla rubrica** (chiama / SMS / email / stella preferito / apri Rubrica), **tastierino con suggerimenti contatti** mentre digiti, cronologia con richiamo e aggiunta a contatti, chiamata reale (`tel:` / bridge `NovaNative.call`) e **schermata di chiamata in corso** (muto, vivavoce, tastierino DTMF) |
| Rubrica | contatti CRUD (nome/telefono/email), chiama/SMS/email dal contatto |
| Messaggi | nuova conversazione dai contatti, elimina, orari per messaggio, risposte contestuali, avatar |
| Mail | client email **reale** (SMTP/IMAP via bridge nativo JavaMail): schermata account con **selettore provider** (Gmail/Outlook/Yahoo/iCloud/Libero/Aruba/PEC/GMX/TIM che precompilano host e porte) **o configurazione manuale**, invio SMTP e sincronizzazione IMAP, **password cifrata nell'Android Keystore** (mai in chiaro). In assenza del bridge (browser) resta simulazione locale. Inoltre: cartelle (arrivo/inviati/bozze/cestino), **ricerca**, stella, **bozze reali**, **rispondi con citazione**, **inoltra**, **allegati** con anteprima, destinatari dai contatti, firma |
| Browser | cronologia + preferiti; sul device apre i siti in **WebView nativa a schermo intero** (BrowserActivity) → nessun limite iframe (banche, Google, ecc.). **Vista desktop** (pulsante 🖥) attiva in automatico per **WhatsApp/Telegram Web** così compare il **QR** di accesso (con UA mobile reindirizzerebbero all'app). In shell web resta l'anteprima iframe |
| Fotocamera | anteprima live `getUserMedia`, scatto salvato in Galleria, import da file |
| Galleria | **clone di Google Foto**: tab **Foto · Cerca · Raccolte** (le raccolte si **creano** e si **eliminano** — l'eliminazione non tocca le foto — e le foto selezionate si aggiungono a una raccolta esistente o creata al volo), **Ricordi** (striscia + per mese), giorni (Oggi/Ieri/data), **selezione multipla** (pressione lunga) con azioni (preferito/condividi/cestino), **preferiti**, **cestino** con ripristino (30 giorni) e **svuota**, **archivio**, ricerca per nome/album/data, **viewer** con swipe, zoom doppio-tap, **info scatto** e menu azioni (ruota, imposta come sfondo, sposta nel cestino), **editor** (filtri + luminosità/contrasto/saturazione + rotazione, salvataggio come nuova foto). Gli **esempi di primo avvio sono foto reali** (canvas JPEG) salvate nello store: si eliminano davvero e non ricompaiono. Il cestino tiene traccia del **momento della cancellazione** (non dello scatto): anche una foto vecchia resta 30 giorni nel cestino e si può ripristinare |
| Orologio | orologio, **sveglie** (picker integrato), **cronometro**, **fusi orari CRUD** (copertura mondiale) |
| Calendario | vista mese, eventi per giorno (aggiungi/elimina), navigazione mesi |
| Meteo | **previsioni reali** via open-meteo (geocoding città + 7 giorni, percepita/umidità/vento) |
| Note | multi-nota con **ricerca**, **cartelle/categorie**, colori, **formattazione markdown** + anteprima, note fissate, data modifica |
| Calcolatrice | espressioni con operatori |
| File | gestore file reale: area **"I miei file"** con cartelle e file di testo (**crea/rinomina/sposta/elimina**), **ricerca**, **riepilogo spazio** reale; cartelle intelligenti **Immagini** (foto reali, elimina + apri in Galleria) e **Note** |
| Store | installa **web app di terze parti** via URL, con **scelta icona** (emoji / favicon del sito / immagine caricata), anteprima e **modifica** delle app installate (nome/URL/icona/colore) |
| Impostazioni | Rete, Dispositivi connessi, Display, Suoni, Notifiche, Sicurezza/PIN, Privacy, App, Batteria, Archiviazione, Accessibilità, Sistema, Info telefono. **Sensori reali** (Wi-Fi/BT/NFC/posizione/aereo/dati): stato letto dall'hardware e **toggle a doppia modalità** — da app apre i pannelli di sistema, nel ROM privilegiato commuta in-process (vedi [GUIDA-ROM](docs/GUIDA-ROM.md) §4). **Versione reale** installata da `PackageInfo`. **Aggiornamenti di Sistema OTA**: controllo autonomo all'avvio contro `shell/version.json` su GitHub, notifica quando c'è una versione più recente, e installazione dalla UI (su dispositivo scarica+installa l'APK, su web/PWA svuota cache e ricarica) |

Funzioni di sistema: boot con logo animato, **blocco/sblocco** (nessuno / scorrimento
/ **PIN**) con **blocco automatico per inattività**, **tendina rapida stile Android**
(10 tile tonde con icona + slider luminosità), tema chiaro/scuro, luminosità (con
**adattiva** e **risparmio energetico** reali), dimensione testo, sfondi, **icone
monocromatiche/contorno con colori personalizzabili**, accessibilità (grassetto,
**contrasto elevato**, riduci animazioni), **suoni di sistema con suonerie/notifiche/
sveglia selezionabili** (sintetizzate, con volumi reali), **notifiche heads-up (bolle)**
e per-app, **backup dati** (export JSON), ricerca nelle impostazioni. **Home a pagine
editabile** con **posizionamento libero delle icone** (slot fissi 4×4: ogni icona
resta dove la metti, anche con spazi vuoti), drag tra desktop, cartelle, swipe con flick.
I **launcher alternativi** (drawer, elenco, tessere, dash, radiale, cover, layout custom
dei temi) sostituiscono la home classica e **nascondono la widget orologio di sistema**
in alto (portano il proprio orologio); la springboard classica la mantiene. Nomi e
cifre dei launcher hanno lo **stesso spessore del modello** dello Studio
(nomi tessere/cover 700, elenco 500, categorie 400).
Sul dispositivo molte voci aprono i **pannelli di sistema reali** (Wi-Fi, Bluetooth,
data/ora, lingua, permessi app).

## Avvio rapido (sviluppo)

```bash
cd shell
python3 -m http.server 8091
# apri http://127.0.0.1:8091/index.html in un browser
```

## Anteprima live del tema (feed sul dispositivo)

Dalla build installata (APK/WebView) non è possibile scambiare postMessage con lo
Studio come nel browser. La shell supporta quindi un **feed del tema corrente**:
lo Studio pubblica il tema su un endpoint (`/theme/current`, incluso in
`novaos-theme-studio/server.py`) e la shell lo **polla ogni 2 secondi** e lo applica
dal vivo, senza salvare.

```text
?preview=1&themeFeed=http://192.168.x.x:8100/theme/current
```

- `themeFeed` può essere assoluto (telefono sulla stessa rete Wi-Fi del server,
  che risponde con **CORS aperto** per funzionare anche da `file://` dentro l'APK)
  o relativo (stessa origine: `?preview=1&themeFeed=/theme/current`).
- L'endpoint serve `{rev, theme}`; la shell applica solo quando `rev` cambia.
- Sull'emulatore Android si punta a `http://10.0.2.2:8100/theme/current`.
- Nello Studio il link pronto è nel pannello **"Sul dispositivo"**.

## Test nell'emulatore Android

```bash
# 1. una tantum: installa SDK + emulatore e crea l'AVD "nova"
./android-launcher/setup-emulator.sh

# 2. avvia l'emulatore (headless)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
emulator -avd nova -no-window -no-audio -gpu swiftshader_indirect &

# 3. servi la shell e aprila nella WebView/Chrome dell'emulatore
cd shell && python3 -m http.server 8091 &
adb shell am start -a android.intent.action.VIEW \
  -d "http://10.0.2.2:8091/index.html" \
  -n com.android.chrome/com.google.android.apps.chrome.Main
# screenshot: adb exec-out screencap -p > screen.png
```

## Launcher come Home reale

Apri `android-launcher/` in Android Studio e premi Run (o `./gradlew installDebug`
con l'emulatore avviato). Il manifest registra NovaOS come categoria `HOME`:
premi il tasto Home e scegli NovaOS come launcher. Il bridge `NovaNative` espone
alla shell `call`, `sms`/`sendSms`, `vibrate`, `batteryLevel`, `toast`,
`openBrowser`, `shareImage`/`shareText`, la Mail (`mail*`), i **sensori**
(`sensorStates`, `setWifi`/`setBluetooth`/`setAirplane`/`setLocation`/`setNfc`/`setMobileData`,
`openSetting`, `privileged`) e la **versione reale** (`appVersion`). Per un SO offline,
imposta `DEV=false` in `MainActivity.java` e copia `shell/` in
`app/src/main/assets/www/`.

## Chiamate native dentro NovaOS (InCallService)

NovaOS può gestire la telefonata **dentro la propria interfaccia** invece di usare
la schermata di sistema. Serve che NovaOS sia il **telefono predefinito**:

- `NovaInCallService` riceve le chiamate dal sistema telefonico;
- `CallHub` fa da ponte verso la WebView; `MainActivity.pushCall()` invia lo stato
  alla shell con `window.NovaCall.update(stato, numero)`;
- la shell mostra la **schermata di chiamata** (`window.NovaCall`) con rispondi /
  riaggancia / muto / vivavoce, che richiamano `window.NovaNative.call*`.

All'avvio il launcher chiede il ruolo di telefono predefinito. Impostarlo a mano:
```bash
adb shell cmd telecom set-default-dialer os.nova.launcher   # o: cmd role add-role-holder android.app.role.DIALER os.nova.launcher
```
Testare una chiamata in arrivo nell'emulatore:
```bash
adb emu gsm call 3401234567     # squillo -> compare la schermata di NovaOS
adb emu gsm cancel 3401234567   # termina la chiamata simulata
```

## Ripristinare il telefono (quando chiudi NovaOS)

NovaOS come Home + telefono predefinito "prende il posto" del launcher e del
dialer di sistema. Per rimettere tutto a posto:

```bash
./android-launcher/reset-device.sh   # ripristina Home + dialer di sistema, e (opz.) disinstalla NovaOS
```

Sul **telefono reale** senza adb: Impostazioni → App → App predefinite →
- *App Home*: riseleziona il launcher originale;
- *App telefono*: riseleziona il dialer di sistema.
Poi eventualmente disinstalla NovaOS come una normale app.

## Costruire la ROM (SO di base)

**Guida completa e passo-passo: [docs/GUIDA-ROM.md](docs/GUIDA-ROM.md).** Copre cosa
resta fisso e viene riusato (kernel/driver/radio/WebView del telefono, mai
sostituiti), l'installazione dal più semplice (emulatore, GSI su device reale) al
più completo (AOSP), la firma di piattaforma + whitelist priv-app
(`system/privapp-permissions-novaos.xml`), il bridge sensori a **doppia modalità**
(stesso APK: apre i pannelli da app, commuta in-process nel ROM) e la questione
**app bancarie/attestazione** (Play Integrity).

Riferimenti tecnici di dettaglio anche in `system/README.md` e `system/build-rom.sh`.
In sintesi: si parte da un Android vanilla (GSI/AOSP), si innesta NovaOS come app di
sistema e Home predefinita, si flasha **solo `system`** lasciando intatte `vendor` e
`boot` → l'hardware del telefono continua a funzionare col suo kernel.

## Stato

Prototipo completo e funzionante, testato su emulatore Android (AOSP 14).

Fatto:
- 15 app operative (molte con dati/contenuti reali: Meteo via open-meteo, File
  collegato a foto e note, cronologia chiamate, ecc.).
- Chiamate reali verificate: la web app apre il dialer nativo che instrada sulla radio.
- **APK compilato** (build manuale senza Gradle: `android-launcher/build-apk.sh`) con
  la shell impacchettata negli assets (**offline**) e **icona Nova** (adaptive icon).
- Bridge nativo `NovaNative` (chiamate/SMS/vibrazione/batteria) e permesso camera per `getUserMedia`.
- **NovaOS impostato e testato come Home predefinita** dell'emulatore.
- Validazione JS rapida via Chrome headless (`google-chrome --headless --dump-dom`).
- **Tipografia del tema** — il `.novatheme/2` ora applica anche `typography.font`
  (`system`/`serif`/`mono`) e `typography.weight` (`normal`/`medium`/`bold`, classi
  `tf-medium`/`tf-bold` sul `body`, stesse dell'accessibilità): font e spessore testi
  gestibili dal Theme Studio valgono per tutta l'interfaccia.
- **Suonerie personalizzate dal tema** — un tema può portare `sounds.{ringtone,notif,alarm}`
  come `{type:"sequence", value:[[freqHz,durSec],…]}` (composto col mini-sequencer dello
  Studio): la shell le registra (`Sounds.setCustom`) e le usa al posto dei suoni builtin.
- **Icone vettoriali dai temi** — un `.novatheme` può portare icone **SVG** per-app
  (`icons.map` con `{type:"svg"}`): la shell le applica convertendole in **data-URL immagine**
  (mai HTML raw → nessuna iniezione anche da temi non fidati) e le mostra in home e in **tutti**
  i launcher. Il Theme Studio include il pack **«NovaOS»**: 16 icone disegnate ad hoc stile
  suite Google (badge con gradiente per-app + simbolo bianco; la Galleria ha la **girandola**,
  il Meteo sole+nube, il Telefono la cornetta…).
- **Icone di sistema NovaOS** — le stesse 16 icone del pack sono ora le icone **di default**
  delle app di sistema: ogni app di base (Telefono, Galleria, Meteo, Impostazioni,
  Registratore…) ha il suo badge con gradiente + simbolo bianco, mostrato in home e in
  **tutti** i launcher senza dover applicare nessun tema. Un tema importato le sostituisce
  comunque con le proprie.
- **Galleria — gestione raccolte** — nella scheda Raccolte si **creano** nuove raccolte e si
  **eliminano** quelle esistenti (l'eliminazione non tocca le foto, che restano in Galleria);
  selezionando più foto le si aggiunge a una raccolta già creata o se ne crea una **al volo**.
  Corretto anche il bottone **←** per tornare a Foto da Cerca e Raccolte.
- **Drawer riallineato al modello dello Studio** — le icone delle Quick action del launcher
  Drawer riempiono la cella come nel modello (niente più testo `data:` a video).
- **Fix icone del Drawer** — le 4 app fisse del launcher Drawer (le Quick action: Telefono,
  Messaggi, Fotocamera, Browser) non riempiono più la cella: restano a **48px** centrate
  (come la griglia), così non appaiono più enormi né nel Drawer reale né nella simulazione
  del reale dello Studio (il modello in scala resta invariato).

Ultime novità (0.1.49):
- **Dock compatto come il modello** — le 4 app fisse in basso (Telefono, Messaggi, Fotocamera,
  Browser) hanno le icone a **42px** (`.dock .app-icon .glyph`), come nel modello dello Studio
  (`.p-dock .p-ic`): prima, con le icone vettoriali NovaOS, le tessere a 58px del dock
  apparivano enormi rispetto al modello (le emoji precedenti stavano a ~27px).

Prossimi passi: rifinire il launcher (evitare il re-boot quando si preme Home,
gestione InCallService per la telefonia nativa), poi la build ROM (`system/`).

### Ricompilare l'APK
```bash
# copia la shell negli assets e compila (serve openjdk-17-jdk + Android SDK build-tools 34)
cp -r shell/* android-launcher/app/src/main/assets/www/
bash android-launcher/build-apk.sh   # -> android-launcher/build/novaos.apk
```
La build include le librerie in `android-launcher/libs/` (JavaMail per Android:
`android-mail` + `android-activation`) per l'email reale SMTP/IMAP.

### Dove sono salvati i dati
- **localStorage** (chiavi `nova:*`): impostazioni, contatti, messaggi, note, email,
  file di testo, eventi, ecc. — testo/JSON, limite pratico ~5–10 MB.
- **IndexedDB** (`nova-photos`): le foto (binari) — quota molto più ampia.
- **Android Keystore** (solo bridge nativo): password email cifrata AES/GCM.

Tutto risiede nella cartella dati privata dell'app (`/data/data/os.nova.launcher/`).

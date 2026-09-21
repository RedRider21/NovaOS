# NovaOS

Sistema operativo per smartphone con **interfacce web su base Android**, nello
spirito di Firefox OS / KaiOS: Android gestisce solo l'essenziale (kernel, driver,
radio, sensori), mentre tutta l'esperienza utente — home, lockscreen, app — è
scritta in HTML/CSS/JS. Le applicazioni sono **web app / PWA**.

> Nome in codice e versione: **NovaOS 0.1.56** (build 58). Nome placeholder,
> modificabile in un punto (`shell/index.html` e `manifest.webmanifest`).
>
> 📘 Per la distribuzione definitiva vedi **[docs/GUIDA-ROM.md](docs/GUIDA-ROM.md)**:
> cosa resta del telefono (kernel/driver riusati), installazione passo-passo,
> bridge "reale" a doppia modalità e nota sulle app bancarie/attestazione.

> Sito di presentazione e manuale d'uso: **<https://redrider21.github.io/NovaOS/>**
> (pubblicato da `docs/` con GitHub Pages; `docs/index.html`, `docs/manuale.html`).
>
> Il **Theme Studio** — costruttore visuale di temi `.novatheme/2` — è un progetto
> dedicato: repo **<https://github.com/RedRider21/novaos-theme-studio>** · demo live
> **<https://redrider21.github.io/novaos-theme-studio/studio/>** · pagina sul sito
> **<https://redrider21.github.io/NovaOS/theme-studio.html>**.

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

Per lo sviluppo su device si apre `android-launcher/` in Android Studio e si preme
Run (percorso Gradle, con le librerie `libs/` dichiarate; la build canonica resta
`bash android-launcher/build-apk.sh`, che copia la shell negli assets e firma l'APK).
Il manifest registra NovaOS come categoria `HOME`:
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

Il ruolo si imposta da **Impostazioni → Rete → Telefono predefinito** (apre il pannello
del sistema) oppure a mano:
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

## App bancarie, attestazione e le due destinazioni

Questa sezione raccoglie la risposta alla domanda «NovaOS disinnesca i controlli delle app
bancarie?» e la decisione che ne è seguita. Il dettaglio operativo è in
[docs/GUIDA-ROM.md](docs/GUIDA-ROM.md) §6.

**Oggi, con NovaOS come app su Android di serie, non si disinnesca nulla.** Le app bancarie
sono processi separati nel loro sandbox: NovaOS è un'app come le altre, non le tocca, e il
bootloader resta bloccato, quindi l'attestazione passa. Anche aprire il sito della banca nella
WebView di NovaOS è una normale sessione browser: i controlli dell'app non c'entrano.

Il rischio nasce **solo** con la ROM, ed è più duro di quanto sembri.

### Il fusibile hardware

Sbloccare il bootloader scrive un **fusibile hardware** nel dispositivo. Da quel momento il
chip di sicurezza dichiara onestamente `UNLOCKED` nella sua attestazione, e
`MEETS_STRONG_INTEGRITY` diventa **impossibile per via fisica** — nessun modulo software lo
aggira. Non è un limite di NovaOS: vale per qualunque ROM custom.

| Livello Play Integrity | Cosa verifica | Con bootloader sbloccato |
|---|---|---|
| `MEETS_BASIC_INTEGRITY` | sistema non manomesso | di solito passa |
| `MEETS_DEVICE_INTEGRITY` | dispositivo certificato e non modificato | recuperabile con configurazione adeguata |
| `MEETS_STRONG_INTEGRITY` | attestazione hardware + bootloader bloccato | **impossibile** |

`BASIC` + `DEVICE` si recuperano con uno stack di occultamento (Magisk + Zygisk + moduli tipo
Play Integrity Fix + DenyList), ma è un tiro alla fune: Google cambia la verifica ogni 4–6
settimane. E alcune banche **ignorano del tutto Play Integrity**, usando controlli propri
(RASP nativo, ricerca di binari `su`, blocklist di impronte): con quelle non c'è partita,
qualunque cosa si installi.

### Come si evita il problema (non come si aggira)

Il fusibile non è aggirabile, ma **si può non incontrarlo**: alcune macchine supportano il
**ri-blocco del bootloader con una chiave AVB propria** (un root of trust personale), così
verified boot torna verde. GrapheneOS funziona esattamente così, ed è il motivo per cui
supporta **solo Pixel** — è stato il primo OS alternativo a usare questa funzione e ha
contribuito a scriverne la documentazione AOSP. Il limite resta: il dispositivo **non è
certificato Google**, quindi circa l'1% delle app con controlli rigidi resta fuori, mentre la
gran parte delle app bancarie funziona.

### Le due destinazioni

Da qui la decisione del 2026-09-17: **due tracce, entrambe mantenute**.

| Traccia | Cosa | Stato |
|---|---|---|
| **A** | **GeckoView dentro l'APK** — NovaOS resta un'app/launcher su Android di serie e adotta GeckoView al posto della WebView | immediata |
| **B** | **ROM su telefono secondario** — il telefono principale resta stock | differita |

Entrambe portano lo stesso motore GeckoView, quindi lo **spike della fase 0** (vedi
[docs/MIGRAZIONE-GECKOVIEW.md](docs/MIGRAZIONE-GECKOVIEW.md)) serve identico a tutte e due.

La traccia A ha un valore che **non dipende dalla ROM**: GeckoView conviene già dentro l'APK
normale.

- `getUserMedia` audio e video catturano davvero → spariscono i fallback nativi
  `audioRecStart`/`audioRecStop` — **verificato il 2026-09-18** (§15 del documento di migrazione),
  non più una previsione;
- `window.confirm`/`alert` nativi → sparisce `os.confirm` in-app;
- storage standard su `file://`, niente più doppia persistenza;
- nessun tocco a bootloader, integrità, Google Wallet o DRM.

Per la traccia B: **il telefono secondario va scelto Pixel**, l'unico che supporta il ri-blocco
con chiave AVB propria. Su un dispositivo qualsiasi si finisce nello stack di occultamento, da
mantenere a mano nel tempo.

### Perché Firefox OS non ha mai incontrato questo problema

Vale la pena fissarlo, perché spiega il costo che NovaOS paga oggi. Firefox OS (B2G, annunciato
nel 2011, primi dispositivi 2013, sviluppo cessato nel 2016) **non ha risolto il problema del
fusibile: non l'ha mai incontrato**, per tre ragioni indipendenti.

1. **Era troppo presto.** L'attestazione hardware entra in gioco molto dopo:

   | Anno | Cosa succede |
   |---|---|
   | 2014 | SafetyNet Attestation API: **software**, binaria (`basicIntegrity`/`ctsProfileMatch`) |
   | 2016 | Android 7.0 — key attestation (Keymaster 2) |
   | 2017 | Android 8.0 — attestazione ID, **obbligatoria per la certificazione** |
   | maggio 2020 | Google abilita l'attestazione hardware nelle risposte SafetyNet |
   | marzo 2021 | il campo `evaluationType` diventa ufficiale |
   | 2022 → maggio 2025 | Play Integrity sostituisce SafetyNet, che viene dismesso |

   Nel periodo commerciale di Firefox OS l'attestazione era **software e aggirabile**: non era
   ancora un cancello.

2. **Non eseguiva app Android.** Firefox OS girava su Gonk — kernel Linux più HAL derivato da
   Android — ma **senza il framework applicativo Android**: niente SafetyNet, niente Play
   Integrity, nessuna app bancaria a cui opporre controlli. Il suo problema era l'opposto del
   nostro: non «le app rifiutano di girare», ma **«le app non esistono»**. L'app più citata tra
   quelle mancanti è proprio **WhatsApp**, la stessa che NovaOS usa via web.

3. **Quindi il fusibile non interessava nessuno.** Senza attestazione da soddisfare, lo stato
   del bootloader era irrilevante per il mercato.

La lezione è il rovescio della medaglia: **la ROM costa proprio perché NovaOS ha scelto di
restare su Android.** È quella scelta che rende possibili WhatsApp e le app bancarie; è la
stessa scelta che fa ereditare la catena di fiducia di Google. Firefox OS non ha pagato quel
prezzo perché ha rinunciato all'ecosistema — ed è anche per questo che è finito. Oggi l'erede
di quell'idea, un'attestazione alternativa che non passi da Google, è l'**Android Integrity
Consortium** (iodéOS e Famoco, 2025): ancora in fase embrionale, senza specifiche pubbliche.

## WhatsApp Web e Telegram Web: come collegarli

NovaOS apre già questi siti correttamente: `BrowserActivity` forza in automatico la **vista
desktop** su `web.whatsapp.com` e `web.telegram.org`, così compare la pagina di accesso invece
del rimando all'app (con user agent mobile rimanderebbero all'app installata).

Il QR però **non si può inquadrare dal telefono stesso**: la fotocamera posteriore punta dalla
parte opposta dello schermo, quindi il dispositivo non può fotografare il proprio display.
Split-screen e screenshot non risolvono — la fotocamera resta girata dall'altra parte, e il
codice è legato alla sessione viva e si rigenera ogni ~20 secondi, quindi uno screenshot è già
scaduto.

**La soluzione è l'alternativa ufficiale al QR: «Collega con numero di telefono».** Su
`web.whatsapp.com` scegli quell'opzione invece del codice QR, inserisci il numero, ricevi un
**codice di 8 caratteri** e lo digiti in WhatsApp → *Dispositivi collegati* → *Collega un
dispositivo* → *Collega con numero di telefono*. Nessuna fotocamera, nessun secondo schermo.
Vale per Web/Windows/Mac, che è il nostro caso: si sta collegando una **sessione browser**, non
un secondo telefono (quello richiede ancora il QR).

Due vincoli da sapere: massimo **4 dispositivi collegati**, e il telefono deve restare online
perché WhatsApp Web specchi la sessione. Come alternativa fisica resta uno specchio che
rifletta lo schermo nella fotocamera.

## Stato

Prototipo completo e funzionante, testato su emulatore Android (AOSP 14).

Fatto:
- 15 app operative (molte con dati/contenuti reali: Meteo via open-meteo, File
  collegato a foto e note, cronologia chiamate, ecc.).
- Chiamate reali verificate: la web app apre il dialer nativo che instrada sulla radio.
- **APK compilato** (build manuale senza Gradle: `android-launcher/build-apk.sh`) con
  la shell impacchettata negli assets (**offline**) e **icona Nova** (adaptive icon).
- Bridge nativo (chiamate/SMS/vibrazione/batteria) e permesso camera per `getUserMedia`.
  La shell ha **un solo punto di contatto**, `shell/js/bridge.js`: nessun file della shell
  interroga più `window.NovaNative` — né per i getter sincroni, né per i comandi.
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
- **Theme Studio pubblicato online** — il costruttore di temi ha ora un repository
  dedicato ([RedRider21/novaos-theme-studio](https://github.com/RedRider21/novaos-theme-studio))
  con demo pubblicata su GitHub Pages
  ([studio](https://redrider21.github.io/novaos-theme-studio/studio/) ·
  [galleria launcher](https://redrider21.github.io/novaos-theme-studio/gallery/launcher-lab.html))
  e una pagina dedicata sul sito NovaOS
  ([theme-studio.html](https://redrider21.github.io/NovaOS/theme-studio.html)).
- **Drawer riallineato al modello dello Studio** — le icone delle Quick action del launcher
  Drawer riempiono la cella come nel modello (niente più testo `data:` a video).
- **Fix icone del Drawer** — le 4 app fisse del launcher Drawer (le Quick action: Telefono,
  Messaggi, Fotocamera, Browser) non riempiono più la cella: restano a **48px** centrate
  (come la griglia), così non appaiono più enormi né nel Drawer reale né nella simulazione
  del reale dello Studio (il modello in scala resta invariato).
Ultime novità (0.1.56) — la Galleria apre l'elemento giusto:
- **Toccando una foto o un video si apriva l'elemento sbagliato.** La griglia di Foto è divisa per
  giorno, e ogni giorno è una griglia a sé: il numero scritto sulla cella era la posizione **dentro
  il giorno** (che riparte da zero), mentre il visualizzatore lo interpretava come posizione
  **nell'elenco completo**. Conseguenza: dal secondo giorno in poi si apriva l'elemento che occupava
  quella posizione nella galleria intera — ad esempio la seconda foto di «Ieri» apriva la seconda
  foto della galleria. Riguardava anche i risultati della **ricerca** (anch'essi raggruppati per
  giorno) e i **video**, che passano dalla stessa griglia. Ora la cella ricava la sua posizione
  dall'elenco completo, che è la stessa lista da cui il visualizzatore conta avanti e indietro:
  si apre sempre l'elemento toccato. Verificato sull'emulatore nei due versi (con il codice
  precedente il tocco apriva l'elemento sbagliato, con questo apre quello giusto).
  Aggiornamento della sola interfaccia: **non richiede di reinstallare l'APK**.

Ultime novità (0.1.55) — i comandi passano dal ponte:
- **La shell non interroga più `window.NovaNative`** — i 28 comandi *fire-and-forget* (vibrazione,
  condivisione, apertura browser, torcia, mail, chiamata, SMS…) passano ora da `NovaBridge.cmd()`,
  che risponde `true` **solo se il comando è arrivato al nativo**. È il sostituto dei probe sparsi
  `window.NovaNative && window.NovaNative.x` e dei `try/catch` che li avvolgevano: dove il comando
  non parte, l'app prosegue con la **simulazione** come ha sempre fatto (Web Vibration API, Web
  Share, anteprima in-app del Browser, `sms:`/`tel:`).
- **Sistema quattro chiamate mail senza guardia** — `mailFetch`, `mailConfigure`, `mailClear` e
  `mailSend` erano invocate direttamente: su un contenitore senza quei metodi avrebbero sollevato
  un'eccezione invece di ripiegare sulla posta simulata. Ora passano dal ponte come tutto il resto.
- **Prepara la migrazione a GeckoView** — è il punto che il documento di migrazione segnalava come
  più insidioso (vedi il §8 di
  [docs/MIGRAZIONE-GECKOVIEW.md](docs/MIGRAZIONE-GECKOVIEW.md)): sotto Gecko quei rami useranno il
  ponte, invece di cadere in silenzio sulla simulazione. **Comportamento sul motore attuale
  invariato** — verificato con un test di equivalenza (2 modalità × 9 scenari, risultati identici
  prima e dopo, con i percorsi nativi confermati vivi). Aggiornamento della sola interfaccia:
  **non richiede di reinstallare l'APK**.

Ultime novità (0.1.54) — raccolte della Galleria:
- **Le raccolte di esempio eliminate non ricompaiono più** — eliminando tutte e tre le raccolte
  predefinite (Paesaggi, Città, Natura) il seme iniziale ripartiva e le ricreava al riavvio della
  Galleria. Ora il seme si applica **solo se non è mai stata salvata una lista di raccolte**: una
  lista vuota è la scelta di chi ha eliminato, e viene rispettata. Le installazioni nuove
  continuano a trovare le tre raccolte, e una lista parziale (es. solo Paesaggi) non viene toccata.
- Aggiornamento della sola interfaccia: **non richiede di reinstallare l'APK**.

Ultime novità (0.1.53) — ponte unico pagina↔nativo:
- **`js/bridge.js`, un solo punto di contatto con l'hardware** — la shell non chiama più
  `window.NovaNative` sparso nel codice: il ponte dichiara il **contratto** dei 53 metodi
  (28 comandi fire-and-forget · 13 getter sincroni · 12 richieste/risposte) e inoltra al nativo
  quando c'è, alla cache quando non c'è, al default del chiamante come ultima spiaggia.
- **Predisposizione alla migrazione a GeckoView** — dove il ponte diventa asincrono a messaggi:
  gli esiti ancora ignoti non fanno più prendere un ramo a caso (tri-stato `true`/`false`/`null`),
  le coppie richiesta/risposta si **aspettano**, e i push nativo→pagina hanno un dispatcher unico
  `NovaMsg`. Il caso critico è l'aggiornamento OTA: `shellWrite` che non risponde `true` **aborta
  prima del commit**, invece di committare uno staging incompleto.
- **Comportamento sul motore attuale invariato** — verificato con un test di equivalenza su 24
  scenari eseguito sull'albero prima e dopo (stessi risultati); dettagli in
  [docs/MIGRAZIONE-GECKOVIEW.md](docs/MIGRAZIONE-GECKOVIEW.md). Essendo un aggiornamento della sola
  interfaccia, **non richiede di reinstallare l'APK**.

Ultime novità (0.1.52) — fix ruolo dialer:
- **Doppio intent-filter `ACTION_DIAL`** — il ruolo di telefono predefinito su Android 10+ richiede
  **due** filtri (uno senza scheme e uno con `scheme="tel"`): aggiunto il secondo. Senza, il sistema
  non offre il ruolo a NovaOS e l'InCallService resta inattivo.
- **Whitelist priv-app in `make-emulator-rom.sh`** — lo script ora pusha da solo
  `system/privapp-permissions-novaos.xml` in `/system/etc/permissions/` (senza la whitelist,
  Android 9+ blocca il boot con `not in privapp-permissions allowlist`). Rimossi `--user 0` dal
  `cmd role` (NumberFormatException) e il comando inesistente `cmd telecom set-default-dialer`.

Ultime novità (0.1.51) — telefonia:
- **UI di chiamata ridisegnata in stile dialer Android** — schermata in arrivo con avatar
  grande, nome e numero, e i pulsanti **Rispondi** (verde) / **Rifiuta** (rosso) con etichette;
  in chiamata il grande pulsante **Termina**, i controlli Muto/Tastierino/Vivavoce e il
  **tastierino DTMF** con le lettere sotto i numeri. Si prova anche senza ROM: dal Telefono
  il tasto verde avvia una **chiamata simulata** in browser/preview.
- **InCallService abilitato** — aggiunti gli intent-filter di telefono (`ACTION_DIAL`,
  `tel:`, `ACTION_CALL`) che rendono NovaOS **eleggibile** come telefono predefinito su
  Android 10+ (prima il sistema non offriva il ruolo e l'InCallService non veniva mai
  attivato). La composizione quando si è telefono predefinito passa da
  `TelecomManager.placeCall` (con ACTION_CALL finirebbe in loop su NovaOS stesso).
- **Link tel:/ACTION_DIAL precompilano il compositore** — toccando un numero in un'altra
  app, NovaOS apre il Telefono col numero già scritto (`NovaDial`).
- **Recupero della chiamata al boot** — se una chiamata arriva mentre la WebView non è
  ancora pronta, la schermata la recupera all'avvio (`currentCallState`).
- **Impostazioni → Rete → Telefono predefinito** — voce dedicata: mostra se NovaOS è il
  telefono predefinito e apre il pannello del ruolo per impostarlo (niente più richiesta
  automatica a ogni avvio).

Ultime novità (0.1.49):
- **Dock compatto come il modello** — le 4 app fisse in basso (Telefono, Messaggi, Fotocamera,
  Browser) hanno le icone a **42px** (`.dock .app-icon .glyph`), come nel modello dello Studio
  (`.p-dock .p-ic`): prima, con le icone vettoriali NovaOS, le tessere a 58px del dock
  apparivano enormi rispetto al modello (le emoji precedenti stavano a ~27px).

Validazione ROM sull'emulatore (2026-08-27, Via A):
- **`system/make-emulator-rom.sh` funzionante** — innesta NovaOS come **priv-app** su
  AVD con `-writable-system`, disattiva launcher/setup di serie, imposta Home e telefono
  predefinito. L'emulatore **boota direttamente in NovaOS** come interfaccia di sistema.
- **Fix trovati e applicati** (bug reali, prima del flash su hardware): (1) senza la
  whitelist `system/privapp-permissions-novaos.xml` in `/system/etc/permissions/`,
  Android 9+ blocca il boot con `not in privapp-permissions allowlist` (crashloop di
  `system_server`) → lo script ora la puscha da solo; (2) il ruolo dialer richiede **due**
  filtri `ACTION_DIAL` (uno senza scheme e uno con `scheme="tel"`) → manifest aggiornato
  (incluso nella **release 0.1.52**).
- **NETWORK_SETTINGS `granted=false`** (ri-verificato il 2026-09-02 con 0.1.52): è **atteso**,
  non un bug — l'immagine dell'emulatore dichiara quel permesso `prot=signature` (lo concede
  solo la chiave di piattaforma; l'APK di prova è firmato debug). Il codice di NovaOS non lo
  usa mai (i toggle diretti usano `WRITE_SECURE_SETTINGS` e `MODIFY_PHONE_STATE`, concessi).
  Nel ROM definitivo (app firmata con chiave di piattaforma) verrà concesso per signature match.
- **Esito**: permessi privilegiati concessi (`WRITE_SECURE_SETTINGS`, `MODIFY_PHONE_STATE`,
  `WRITE_SETTINGS` → i toggle dei sensori commutano in-process, banner «Sistema integrato»),
  permessi runtime concessi, **ruolo DIALER assegnato a NovaOS**.

Prossimi passi (aggiornati al 2026-09-18, **due tracce** — vedi
[App bancarie, attestazione e le due destinazioni](#app-bancarie-attestazione-e-le-due-destinazioni)):

**Traccia A — GeckoView dentro l'APK** *(immediata)*
1. ~~**Spike di fase 0**~~ — **fatto (2026-09-17): la shell boota sotto GeckoView**, da entrambe le
   origini previste (`resource://android/assets/…` e `file://…/files/shell/`), senza modifiche al
   codice della shell. Esito, catena di build e comportamenti diversi dalla WebView sono in
   **[docs/MIGRAZIONE-GECKOVIEW.md §9](docs/MIGRAZIONE-GECKOVIEW.md)**.
2. ~~**Ponte verso il nativo (fase 2)**~~ — **fatto (2026-09-18)**: il ponte regge end-to-end,
   provato dal tasto del browser del dock. Il percorso è a tre salti (stub iniettato nella pagina →
   content script → background dell'estensione → Java) e la shell è servita da un server HTTP
   locale dentro l'app. Costato quattro tentativi: `file://` non è più agganciabile dalle
   estensioni, i content script vivono in un mondo isolato e non possono esporre
   `window.NovaNative` alla pagina, e una pagina servita da `moz-extension://` non raggiunge il
   nativo. Vincoli e soluzione in
   **[docs/MIGRAZIONE-GECKOVIEW.md §10](docs/MIGRAZIONE-GECKOVIEW.md)**.
3. ~~**Canale nativo → pagina**~~ — **fatto (2026-09-18)**: chiuso il rischio più serio del piano.
   Sotto WebView tutto ciò che il sistema mandava alla shell passava da `evaluateJavascript`, che
   in GeckoView non esiste. La via è la **porta nativa** (`WebExtension.Port.postMessage`): il
   nativo parla per primo, il background la dirama alle pagine, lo stub la consegna a
   `window.NovaMsg` — il dispatcher che la shell usa già. Provato sullo schermo: una chiamata in
   arrivo comandata da Java. Dettagli in
   **[docs/MIGRAZIONE-GECKOVIEW.md §10.7](docs/MIGRAZIONE-GECKOVIEW.md)**.
4. ~~**Getter di stato e primi eventi veri (fase 3)**~~ — **fatto (2026-09-18)**: i getter del
   contratto rispondono con il valore vero, e `requestMic` è il primo comando che non finisce in un
   log — chiede il permesso di sistema e ne rimanda l'esito, che la shell disegna con il suo
   avviso. Nessuna modifica a `shell/`. Due scoperte hanno deciso la forma: `has()` non è una
   guardia ma un interruttore (non esporre un getter fa vincere il *default*, che per `micDiag` è
   «granted» — un guasto silenzioso, non un degrado prudente), e le preferenze non servono dal
   nativo perché lo `store` della shell ripiega già su `localStorage`. Dettagli in
   **[docs/MIGRAZIONE-GECKOVIEW.md §11](docs/MIGRAZIONE-GECKOVIEW.md)**.
5. ~~**Tasto Indietro**~~ — **fatto (2026-09-18)**: lo consuma la shell, non il browser. Il modulo
   chiamava `GeckoSession.goBack()`, cioè la cronologia del browser — che con la shell non c'entra
   nulla, perché la shell è una pagina sola. Il tasto rispondeva e non succedeva niente, senza un
   solo errore da nessuna parte. È il primo caso in cui l'API esiste ma significa **un'altra
   cosa**: la categoria più insidiosa del porting. Dettagli in
   **[docs/MIGRAZIONE-GECKOVIEW.md §12](docs/MIGRAZIONE-GECKOVIEW.md)**.
6. ~~**Canale richiesta/risposta (fase 4)**~~ — **fatto (2026-09-18)**: il ponte ora regge anche la
   forma che serve ai 14 comandi che restituiscono un valore. Lo stub assegna un id e restituisce
   una Promise, Java la scioglie postando `__novaRisposta`. Verificato end-to-end con `saveDownload`:
   il backup scrive il file, il percorso torna alla pagina intatto e la shell vibra. Il canale è
   delicato per la trappola **simmetrica** a `has()`: esporre un comando che il nativo non risponde
   significa un `await` che non si scioglie mai — la shell appesa su quel gesto, senza errore e
   senza scadenza. Da qui tre regole (l'elenco è la copia esatta dei `case` cablati, il `default:`
   di Java risponde `null`, un timeout di sicurezza che risolve *e lo dice*). Nel corso della
   verifica è emerso un difetto che vale la pena ricordare: **un array di tipi misti non
   sopravvive a `postMessage`** — la stringa arrivava come `0`, con l'id perfettamente corretto e
   il canale che girava. Dettagli in
   **[docs/MIGRAZIONE-GECKOVIEW.md §13](docs/MIGRAZIONE-GECKOVIEW.md)**.
7. ~~**OTA della shell (fase 5)**~~ — **fatto (2026-09-18)**: il percorso di aggiornamento della
   sola interfaccia — quello che permette a NovaOS di aggiornarsi senza reinstallare l'APK —
   funziona sotto Gecko e è verificato nei **tre momenti che contano**: commit, sopravvivenza al
   riavvio, ripristino. Con una correzione che vale più delle tre: la shell copiata dagli asset
   in `files/shell` **non viene più ricopiata a ogni avvio** se la sua build è più alta. Prima lo
   era, e con l'OTA sarebbe diventato «l'aggiornamento sparisce al riavvio successivo» — senza
   errori, e quindi senza modo di collegarlo al commit del giorno prima. Dettagli in
   **[docs/MIGRAZIONE-GECKOVIEW.md §14](docs/MIGRAZIONE-GECKOVIEW.md)**.
8. ~~**Permessi media (fase 6)**~~ — **fatto (2026-09-18)**: sotto GeckoView `getUserMedia`
   **cattura davvero**, microfono e fotocamera. Il registratore registra e salva (provato con una
   registrazione di 40 s) senza mai chiamare `audioRecStart`/`audioRecStop`: sulla traccia A quei
   due comandi **non vanno cablati affatto**, e con loro spariscono il ripiego nativo e l'audio in
   base64. La fotocamera apre il flusso a 9 fps. Serviva un `PermissionDelegate` — senza, Gecko
   nega ogni richiesta e la shell mostra l'avviso sul microfono, accusando il componente sano. Nel
   farlo è emerso un difetto vero: la shell chiede `requestMic` e `getUserMedia` a **77 ms** di
   distanza, Android accetta **una** richiesta di permessi per volta e rifiutava la seconda
   all'istante — un rifiuto tecnico indistinguibile da un diniego. Ora le richieste sono
   serializzate da una coda. Dettagli in
   **[docs/MIGRAZIONE-GECKOVIEW.md §15](docs/MIGRAZIONE-GECKOVIEW.md)**.
9. ~~**Telefonia e condivisione (fase 7)**~~ — **fatto (2026-09-18)**: sotto Gecko la shell
   **chiama, riceve, risponde, riaggancia, muta, mette in vivavoce, manda DTMF, invia SMS e
   condivide foto, file e testo**. Portate da `:app` le classi `CallHub`, `NovaInCallService` e
   `ShareProvider` (autorità `os.nova.gecko.share`); la schermata di chiamata compare da sola su
   una chiamata in arrivo, anche se il processo è stato riavviato — `currentCallState` non è più
   un valore fisso. Corretto un difetto che sarebbe stato invisibile fino al primo telefono vero:
   `NovaInCallService` avviava l'Activity senza dichiarare l'origine, e il valore predefinito era
   quella che il content script non aggancia — la chiamata arrivava e la schermata non compariva.
   Dettagli in **[docs/MIGRAZIONE-GECKOVIEW.md §16](docs/MIGRAZIONE-GECKOVIEW.md)**.
10. ~~**Getter, richiesta/risposta e stato dei sensori (fase 3 residua)**~~ — **fatto (2026-09-21)**:
   sotto Gecko **non esiste una chiamata sincrona al nativo**, quindi i getter rispondevano vuoti.
   Ora il nativo pubblica lo stato e lo ripubblica quando il sistema annuncia un cambio, al ritorno
   in primo piano e quando cambia la torcia; i sensori si leggono a **tre stati** (acceso, spento,
   non noto) e una chiave assente non è uno «spento»; la torcia è osservata con un `TorchCallback`,
   perché si accende anche da fuori; `openSetting`, i sette `set*` e `prefSet`/`prefDel` sono
   cablati — i `set*` rispondono `true` solo se commutano in-process, `false` se delegano al
   pannello di sistema. Provando è emerso un difetto vero: la tendina dava per sincrono il ritorno
   del nativo, che sotto Gecko è una **Promise**, quindi la torcia si accendeva e il suo tile
   restava spento senza più correggersi. Corretto con l'`await`, che vale identico sotto WebView.
   Dettagli in **[docs/MIGRAZIONE-GECKOVIEW.md §17](docs/MIGRAZIONE-GECKOVIEW.md)**.
11. **Completare il ponte** — in Java sono cablati **32 comandi su 53**, più **11 getter serviti
   dal payload di stato**: dopo `toast`, `vibrate`, `openBrowser`, `requestMic` e `openAppSettings`
   sono entrate telefonia e condivisione (§16), poi i getter, la richiesta/risposta e i sette
   `set*` (§17). Restano sei `cmd` — le quattro `mail*`, `screenshot`, `installUpdate` — e il port
   di `BrowserActivity`. Restano fuori **di proposito** `prefGet`/`prefKeys` (la migrazione una
   tantum delle preferenze sarebbe distruttiva sotto Gecko, dove l'autorità è `localStorage`) e
   `audioRecStart`/`audioRecStop` (`getUserMedia` li rende inutili, §15.2). I `set*` sotto Android
   stock rispondono `false` e aprono il pannello di sistema: è il comportamento voluto, non un
   guasto — nel ROM commutano direttamente (§14.5).
12. **Migrazione del contenitore** — `GeckoSession` + WebExtension al posto di
    `addJavascriptInterface`, contenuta al livello contenitore (piano dettagliato in
    **[docs/MIGRAZIONE-GECKOVIEW.md](docs/MIGRAZIONE-GECKOVIEW.md)**). Va messo a piano che la
    traccia A **abbandona `build-apk.sh`**: la catena di GeckoView richiede Gradle (§9).
13. **Pulizia dei fallback WebView-specifici** resi inutili da Gecko: audio nativo, `os.confirm`,
    doppia persistenza, le sonde `__probe_bg`/`__probe_stub`, e il sottotitolo «NFC» di
    Impostazioni su dispositivi che non hanno NFC (§17.4).

**Traccia B — ROM su telefono secondario** *(differita)*
14. **ROM su hardware reale** via GSI (flash del solo `system`, kernel e driver originali intatti).
15. **ROM definitiva** con GeckoView come UI di sistema (priv-app firmata + whitelist + SELinux).
   Da fare **solo su un dispositivo secondario, preferibilmente Pixel**, mai sul telefono
   principale: il fusibile hardware è irreversibile.

~~Pulizia dei fallback WebView-specifici~~ — **fatta**: `js/bridge.js` è il punto di contatto
unico e la shell non tocca più `window.NovaNative` in nessun punto.

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

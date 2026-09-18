# Migrazione del motore web: WebView → GeckoView

Documento di progetto. Obiettivo: sostituire la WebView di sistema
che oggi fa da contenitore alla shell con **GeckoView** (il motore di Firefox), mantenendo
invariata tutta la parte web. Questo documento è la base di lavoro per lo spike isolato sul
ramo parallelo `novaos-rom/`; la shell (`shell/`) non deve cambiare.

- Stato: **fasi 0 (§9), 2 (§10), 3 (§11), 4 (§13) e 5 (§14) verificate su emulatore il
  2026-09-18**, più il tasto Indietro (§12). In concreto: i comandi della shell arrivano al
  nativo, gli eventi del nativo (es. chiamata in arrivo) compaiono nella shell, i getter di stato
  rispondono con il valore vero, il canale richiesta/risposta si scioglie con il valore giusto, e
  **l'aggiornamento OTA della shell funziona nei tre momenti che contano** — commit, sopravvivenza
  al riavvio, ripristino. Restano da cablare 43 comandi su 53 e le fasi 6–8. Nulla di quanto
  descritto qui è stato pubblicato: lo spike vive su un ramo isolato.
- Interessati: livello `android-launcher/` (contenitore + ponte), `shell/` (minimi ritocchi),
  `system/` (ROM definitiva)
- **Il codice dello spike vive sul ramo `gecko-spike`** (non linkato di proposito: un link
  relativo a un altro ramo si rompe, perché viene risolto a partire da questo file) — modulo
  `android-launcher/gecko/`, con `ShellServer.java`, `MainActivity.java`, `BrowserActivity.java`
  e l'estensione in `assets/extension/`. Su `main` non c'è: `main` porta la shell pubblicata e
  questa documentazione. Il ramo esiste per non perdere il lavoro e per poterlo leggere accanto
  al documento; **non è un ramo di rilascio** e non entra in `main` finché la migrazione non è
  completa.

> **Da leggere per primo se si riprende in mano il ponte:** §10. I vincoli scoperti lì
> (`file://` non agganciabile, mondo isolato dei content script, pagina d'estensione non
> privilegiata) invalidano il piano originale del §4 e sono il motivo per cui la shell è servita
> da un server HTTP locale invece che dagli asset. Il verso nativo → pagina, che era il rischio
> più serio del piano, è risolto e descritto in **§10.7**.

> **Da leggere per primo se si riprende il lato getter:** §11.2. La semantica di `has()` rende
> obbligatorio esporre i getter nello stub — non esporli non è prudenza, è un guasto silenzioso —
> e lo `store` della shell ripiega già su `localStorage`, quindi le preferenze non hanno bisogno
> del nativo.

> **Da leggere per primo se si tocca l'avvio o l'OTA:** §14.1. La copia degli asset in
> `files/shell` non è più incondizionata, ed è deliberato: una ricopiatura a ogni avvio cancella
> l'aggiornamento e lo fa sparire **al riavvio successivo**, senza errori. È il guasto peggiore
> incontrato finora proprio perché sembra un successo.

---

## 1 · Perché migrare

| WebView di sistema | GeckoView |
|---|---|
| Motore variabile col dispositivo (versioni Android diverse = comportamenti diversi) | Motore **fisso, aggiornabile**, identico ovunque |
| Engine di Chromium/Android non progettato per essere il "sistema" | Motore pensato per essere incastonato in un'applicazione (Firefox per Android) |
| `addJavascriptInterface` espone un oggetto nativo **sincrono** dentro la pagina (superficie d'attacco) | Nessun bridge JS sincrono: la comunicazione passa per **messaggi** espliciti e tipizzati |
| Nessun controllo fine su estensioni/contenuti | Architettura a **WebExtension**: il ponte può vivere come estensione |
| Aggiornabile solo col sistema | Aggiornabile con l'app (o la ROM) |

Resta fermo il principio del progetto: la **web shell è un insieme di pagine statiche** che parla
con l'esterno tramite un piccolo contratto (`window.NovaNative`, `window.NovaCall`, `NovaDial`).
Migrare il motore significa far rispettare *lo stesso contratto* a un contenitore diverso.

## 2 · Cosa NON cambia

- La shell `shell/` (HTML/CSS/JS): layout, app, temi `.novatheme`, OTA, service worker.
- Il formato dei dati: preferenze, IndexedDB delle foto, backup JSON.
- La posta reale: `MailBridge` usa **JavaMail** in Java, è indipendente dal motore.
- Le chiamate/SMS/sensori: `CallHub`, `NovaInCallService`, `ShareProvider`, permessi.
- Il rollout finale (priv-app + whitelist + SELinux) è già descritto in `GUIDA-ROM.md`.

## 3 · Il contratto da preservare (superficie del ponte)

Rilievo dal codice attuale (`MainActivity.java`, `CallHub.java`, `MailBridge.java`).

### 3.1 Da pagina a nativo (oggi: `window.NovaNative`, via `addJavascriptInterface`)

| Gruppo | Metodi | Tipo di ritorno oggi |
|---|---|---|
| Telefonia | `call`, `sms`, `sendSms`, `callAnswer`, `callHangup`, `callMute`, `callSpeaker`, `callDtmf` | fire-and-forget |
| Stato | `isDialer()`, `currentCallState()`, `batteryLevel()` | **sincrono** (letto subito dalla pagina) |
| Sensori | `sensorStates()`, `setWifi/Bluetooth/Airplane/Location/Nfc/MobileData` | getter sincrono + comandi |
| Sistema | `vibrate`, `toast`, `openBrowser`, `openSetting`, `appVersion()` | misto (getter sincrono) |
| Condivisione | `shareImage`, `shareFile`, `shareText` | fire-and-forget |
| Mail | `mailConfigure`, `mailSend`, `mailFetch`, `mailAccount()`, `mailClear` | misto (getter sincrono) |

### 3.2 Da nativo a pagina (oggi: `web.evaluateJavascript`)

- `window.NovaCall.update(stato, numero)` — push di chiamata in arrivo/in corso.
- `window.NovaDial(numero)` — apri il dialer col numero precompilato.
- (App Browser) `window.NovaNative.openBrowser(url)` apre la `BrowserActivity` esterna.

> Nota importante: in WebView l'app **inietta** funzioni JS nella pagina e i getter rispondono in
> modo **sincrono**. In GeckoView la comunicazione pagina↔nativo è **asincrona e a messaggi**:
> i getter sincroni (`appVersion`, `isDialer`, `currentCallState`, `mailAccount`, parte dei sensori)
> sono i punti che richiederanno un adattamento nella shell (promise + valori «messi in cache»
> all'avvio), oppure un'iniezione iniziale di un piccolo shim.
>
> **Come è andata a finire (2026-09-18).** L'iniezione iniziale non serve per gli eventi in
> ingresso: `window.NovaMsg` esiste già in `bridge.js` e la shell lo usa come dispatcher unico per
> tutti e nove gli eventi di questa sezione. Sotto Gecko basta che lo stub iniettato chiami
> `window.NovaMsg(tipo, ...args)` al posto di `evaluateJavascript` — vedi §10.7. Restano
> asincroni i **getter**, che è il lavoro della fase 3.

**Stato: predisposizione fatta.** La shell non parla più direttamente col ponte: c'è un solo punto
di contatto, `shell/js/bridge.js`, che oggi inoltra a `window.NovaNative` e domani parlerà a
messaggi. Il resto di questo paragrafo descrive **cosa il ponte nuovo deve fornire** perché quel
file continui a funzionare: è il contratto dello shim.

- **Regola di lettura** (implementata in `bridge.js`):
  `has(nome)` → si chiama `NovaNative[nome]` · altrimenti `cache[nome]` · altrimenti il default del
  chiamante. La cache **non viene mai letta mentre il nativo è raggiungibile**, quindi in WebView
  il comportamento è identico a prima per costruzione. `has()` è per-metodo, non «il nativo c'è»:
  un APK vecchio può non avere `shellWrite`.
- **Comandi inoltrati dal ponte**: i 28 metodi *fire-and-forget* passano da `NovaBridge.cmd(nome, …)`,
  che risponde `true` **solo se il comando è arrivato al nativo**. È il sostituto dei vecchi probe
  sparsi `window.NovaNative && window.NovaNative.x` e dei `try/catch` che li avvolgevano: dove il
  comando non parte, l'app prosegue con la simulazione come ha sempre fatto (Web Vibration API,
  Web Share, anteprima in-app del Browser, `sms:`/`tel:`). **La shell non interroga più
  `window.NovaNative` in nessun punto**: sotto Gecko quei rami useranno il ponte invece di cadere
  in silenzio sulla simulazione.
- **Niente snapshot al boot**: `os.js` costruisce `state` al **parsing** (non a `DOMContentLoaded`)
  e alcuni getter sono riletti di continuo (`sensorStates` a ogni `renderQuick()`,
  `currentCallState` ogni 400 ms). Congelarli in cache sarebbe un cambio di comportamento **anche
  in WebView**: la cache è solo un ripiego.
- **Preferenze**: `prefGet` restituisce la **stringa JSON così com'è** (il `JSON.parse` resta in
  `store.get`). Se lo shim restituisse un oggetto già decodificato, *tutte* le impostazioni
  tornerebbero ai default in silenzio. `prefSet`/`prefDel` hanno il write-through su cache e nativo.
- **Bootstrap delle preferenze**: se un content script inietta `window.__NOVA_PREFS` **a
  `document_start`** (prima che `os.js` costruisca `state`), quelle chiavi entrano nella cache.
  Altrimenti `NovaBridge.prefsPending` è vero e `onPrefsReady(cb)`/`hydratePrefs(obj)` permettono
  la re-idratazione. In WebView il ramo non viene mai eseguito.
- **Booleani tri-stato**: dove un bool decide un ramo si usa `=== true` / `!== true`, con `null` =
  «esito non ancora noto» (solo a messaggi) → non decidere, non notificare, non cambiare stato.
  Su un booleano Java vero `=== true` è identico a prima. Il caso critico è l'OTA: con un ponte
  asincrono un `if (!ok)` sarebbe falso e l'updater committerebbe uno **staging incompleto**
  (shell brickata); oggi `shellWrite` che non risponde `true` **aborta senza chiamare `shellCommit`**.
- **Push**: i globali `NovaCall`/`NovaDial`/`NovaBack`/`__novaShot`/`__novaMic`/`__novaMicResume`
  restano, ma esiste un dispatcher unico `window.NovaMsg(tipo, …)` che lo shim può chiamare per
  tutti. Il gestore è risolto **pigramente** a ogni chiamata (sono definiti più avanti nel codice,
  o ridescritti a ogni render). Un tipo sconosciuto restituisce `false` senza sollevare eccezioni.

## 4 · Architettura di destinazione

```
Livello web (shell)              chiama  window.NovaBridge.xxx()  (shim sottile)
        │            messaggi nativi → window.onNova(...)   /   window.NovaCall.update(...)
        ▼
stub nella pagina                window.NovaNative, iniettato come <script>
        │        postMessage({__novaGeo:{nova,args}})
        ▼
content script                   nell'estensione, mondo isolato
        │        browser.runtime.sendMessage(...)
        ▼
background dell'estensione       l'unico ambiente che raggiunge il nativo
        │        browser.runtime.sendNativeMessage("browser", ...)
        ▼
Livello nativo (Java)            WebExtension.MessageDelegate → NovaBridge → CallHub · MailBridge · sensori
```

Elementi chiave:

1. **GeckoSession** al posto della `WebView`; l'app registra una **WebExtension Nova**
   (manifest incluso negli `assets`) con un content script e un background script.
2. La pagina continua a vedere `window.NovaNative`/`NovaCall`, ma **non basta un content script**:
   i content script di Firefox girano in un mondo isolato (Xray) e le proprietà che scrivono su
   `window` restano invisibili agli script della pagina. Serve uno **stub iniettato come
   `<script>`**, che è codice della pagina a tutti gli effetti (§10.2).
3. I messaggi **pagina → nativo** passano per **tre salti** (stub → content script → background →
   nativo) e nessuno è aggirabile. Arrivano al `WebExtension.MessageDelegate` in Java e vengono
   instradati agli stessi componenti di oggi (`CallHub`, `MailBridge`, …).
4. I messaggi **nativo → pagina** hanno oggi due sole vie: un port di messaggistica oppure il
   riavvio del canale dal background. **`session.evaluate` non esiste** in GeckoView 155
   (verificato con `javap`: nessun metodo di valutazione o iniezione su `GeckoSession`), quindi la
   via «Java esegue JS nella pagina» va ripensata, non adattata: è il punto aperto della fase 4.

Durante la transizione i due motori convivono dietro un'interfaccia comune **`Engine`**
(`load`, `evaluate`, `bridgeSend`, `setPermissionDelegate`, ecc.) con una variante
`WebViewEngine` (oggi) e `GeckoEngine` (nuova), attivabile da un flag di sviluppo: permette di
migrare un componente alla volta e tenere sempre un'istanza avviabile.

## 5 · Cosa cambia in pratica nel progetto

- **Build**: oggi `build-apk.sh` compila **senza Gradle** (solo SDK + javac + aapt2). GeckoView si
  distribuisce come **AAR su Maven** e richiede **Gradle + AndroidX**. Conseguenza da decidere
  in fase 1:
  - *opzione A*: il ramo GeckoView passa a Gradle (struttura `android-launcher/` attuale) e
    `build-apk.sh` resta solo per la variante WebView;
  - *opzione B*: si mantiene in parallelo `build-apk.sh` (WebView, dev veloce) e una build Gradle
    (GeckoView, dev di motore). La shell è identica, quindi la doppia build è economica.
- **Ponte**: si elimina `addJavascriptInterface`; al suo posto uno stub iniettato nella pagina, un
  content script che fa da relè e il `MessageDelegate` dell'estensione in Java (§4, §10).
- **Origine della shell**: non più `file:///android_asset/` ma un **server HTTP locale**
  (`http://127.0.0.1:8731`), avviato dall'app e in ascolto solo su localhost (§10.4). È la
  conseguenza più visibile dei vincoli scoperti in fase 2.
- **Permessi runtime**: camera/mic/posizione si gestiscono col `PermissionDelegate` della
  `GeckoSession` (oggi via `onPermissionRequest` WebChromeClient).
- **File/allegati**: `<input type=file>` e download passano per i delegate Gecko
  (`PromptDelegate`, `ContentDelegate`), non più `onShowFileChooser`/DownloadListener.
- **User-Agent / vista desktop**: la `BrowserActivity` esterna oggi imposta la UA via WebView;
  in Gecko la UA si configura a livello di `GeckoSessionSettings`.
- **Service worker offline** (`sw.js`, cache `novaos-vNN`): Gecko supporta i service worker;
  va verificato che la strategia network-first della shell resti valida con la policy di cache
  di GeckoView e che l'update della cache (bump `CACHE` a ogni rilascio) continui a funzionare.

## 6 · Fasi di lavoro proposte

| Fase | Cosa | Verifica | Note/rischio |
|---|---|---|---|
| 0 | Spike minimo: progetto Gradle + `GeckoView` AAR + load della shell assets in una `GeckoSession` | La shell **boota** identica all'emulatore | APK + ~50 MB di motore; primo download Gradle+Maven lungo |
| 1 | Interfaccia `Engine` comune; `WebViewEngine` attuale dentro; `GeckoEngine` per lo spike | Entrambe le varianti aprono la shell | Decisione build A/B (§5) |
| 2 | WebExtension Nova: content script + shim `window.NovaNative`/`NovaCall` | I metodi *fire-and-forget* rispondono (toast, vibrate, share) | ✅ **Fatto e verificato** il 2026-09-18: il ponte regge end-to-end, provato dal tasto del browser del dock. Tre salti, tutti necessari — v. §10. Resta da cablare in Java il resto dei comandi (oggi solo 3 su 53) |
| 3 | Getter sincroni → asincroni con cache all'avvio | `appVersion`, `isDialer`, `currentCallState`, sensori, `mailAccount` tornano corretti nelle Impostazioni | **Lato shell: fatto** (`shell/js/bridge.js` + ricablaggio dei call-site; comportamento in WebView invariato, verificato). Resta da scrivere lo **shim** lato Gecko e l'iniezione di `__NOVA_PREFS` a `document_start` |
| 4 | Push chiamata: `NovaCall.update`/`NovaDial` da Java | Chiamata simulata (`adb emu gsm call`) mostra la schermata NovaOS | `session.evaluate` o port di messaggistica |
| 5 | Permessi, file, download, UA, popup | Fotocamera scatta, Browser apre i siti, allegati Mail si aprono | Delegate GeckoSession dedicati |
| 6 | Mail + telefonia + sensori end-to-end sul GeckoEngine | Suite di prova manuale su emulatore | JavaMail invariato |
| 7 | OTA + service worker + temi sul GeckoEngine | Aggiornamento e offline come oggi | Cache/`CACHE`/aggiornamento |
| 8 | Rom definitiva: priv-app firmata + whitelist + SELinux; rimozione della variante WebView | Flash GSI su device reale | Fase finale, richiede hardware |

## 7 · Rischi principali

1. **Sincronia del ponte**: è il punto più delicato; mitigare con shim + cache all'avvio e
   mantenendo sempre attivo il fallback di simulazione della shell. Lato shell la mitigazione
   **c'è già** (`js/bridge.js`: punto di contatto unico, tri-stato sugli esiti ignoti, `await` sulle
   coppie richiesta/risposta) e il comportamento in WebView è verificato identico. Il canale
   *fire-and-forget* è **provato end-to-end** (§10) e il verso nativo → pagina è **provato sullo
   schermo** (§10.7); restano i getter e le richiesta/risposta, che sono la parte che richiede
   davvero la cache (§10.6).
   *Rischio chiuso per la parte che poteva invalidare il piano: la via d'iniezione del ponte era il
   vero punto di rottura, ed è risolta in entrambi i versi. Ciò che resta — asincronia dei getter e
   asincronia dei comandi — è lavoro noto, non un'incognita architetturale: la shell è già scritta
   per reggere un nativo asincrono e assente (`await`, tri-stato, fallback di simulazione).*
2. **Dimensioni**: il motore GeckoView pesa decine di MB → APK molto più grande di oggi (546 KB);
   da accettare (l'APK è bootstrap, la shell resta OTA) e da documentare.
3. **Service worker offline**: va verificata la compatibilità della strategia di cache della shell
   con la gestione cache di Gecko.
4. **Doppia build**: tenere vivi due percorsi di compilazione richiede disciplina; la shell comune
   limita il costo.
5. **Comportamenti diversi**: `addJavascriptInterface` sincrono sparisce; **tutti** i call-site della
   shell sono stati ricablati su `js/bridge.js` — sia i getter sincroni, sia i comandi
   *fire-and-forget*, sia i **probe di presenza** del nativo (che sono la parte più insidiosa: sotto
   Gecko sarebbero caduti in silenzio sulla simulazione). La shell non tocca più
   `window.NovaNative`. Restano da verificare sull'emulatore i percorsi che il test di equivalenza
   non copre (fase 6–7).

## 8 · Punti aperti da confermare nello spike

- [x] **Rilascio AAR + Maven** — risolto dallo spike: GeckoView `155.0.20260903215306`, scaricabile
  **solo** da `maven.mozilla.org/maven2/` (non su Maven Central), minSdk 26 (già conforme).
  La catena di build che ne deriva è in §9.
- [x] **Modalità dello shim in pagina** — risolto (§10.2): lo shim è uno **stub iniettato come
  `<script>`**, non un content script. Un content script non può esporre `window.NovaNative` alla
  pagina, perché vive in un mondo isolato. Lo stub soddisfa il contratto di `js/bridge.js` e va
  iniettato a `document_start`, prima che `bridge.js` catturi `window.NovaNative`.
  Resta da aggiungere l'iniezione di `__NOVA_PREFS` nello stesso momento.
- [ ] Persistenza dati shell (preferenze/IndexedDB) nello storage di GeckoView: migrazione o
  convivenza col percorso attuale.
- [ ] Policy UA per la vista desktop del Browser.
- [ ] Impatto di `?preview=1` / anteprime (nessuna differenza attesa).
- [x] **Probe di presenza del nativo** — risolto: la shell non interroga più `window.NovaNative`.
  Tutti i comandi passano da `NovaBridge.cmd()` (che risponde `true` solo se inoltrato) e i getter
  dagli accessori del ponte.
- [x] **Forma dello shim** — risolto e **verificato**: lo shim espone `window.NovaNative` (tramite
  lo stub iniettato, §10.2), `bridge.js` lo cattura da solo e `has()` continua a funzionare senza
  alcuna modifica alla shell. Nessun adattamento lato shell è servito.
- [ ] **`saveDownload`**: sotto Gecko il percorso di destinazione non è restituibile in modo
  sincrono. Serve un push `NovaMsg("download.saved", path)`; senza, il backup riesce ma la notifica
  dice «non riuscito» (il valore di ritorno è già trattato come «ignoto» e non fa danni).
- [x] **Push lato Java** (`MainActivity.java`, `MailBridge.java`) — risolto e **verificato sullo
  schermo** il 2026-09-18 (§10.7): non più `evaluateJavascript` (che in GeckoView non esiste), ma
  `WebExtension.Port.postMessage` → background → content script → stub → `window.NovaMsg`. La
  prova è la schermata di chiamata in arrivo della shell, comandata dal nativo.

## 9 · Esito dello spike (fase 0) — 2026-09-17

**Risposta: sì.** La shell NovaOS gira sotto GeckoView, da entrambe le origini previste, senza
modifiche al codice della shell.

### Cosa è stato costruito

Modulo Gradle separato `android-launcher/gecko/`, `applicationId "os.nova.gecko"`, quindi
installabile **accanto** a NovaOS: lo spike non tocca l'app in uso. Carica la shell in una
`GeckoSession` e la serve da due origini, scelte con l'extra di intent `origin`:

| `origin` | URL | Esito |
|---|---|---|
| `asset` (default) | `resource://android/assets/www/index.html` | ✅ lockscreen → home, icone e dock corretti |
| `internal` | `file://…/files/shell/index.html` | ✅ identico |

Verifica di interattività: aperta la Calcolatrice e calcolato `7 + 5` → `12`. Il JS della shell
risponde ai tocchi sotto Gecko.

L'origine `internal` era stata preparata per la fase 2, sul presupposto che il ponte avrebbe
richiesto la shell su `file://`. **Quel presupposto si è rivelato sbagliato** (§10.1): `file://`
non è agganciabile. La conclusione corretta — la shell servita da un server HTTP locale — è in
§10.4. Il percorso `internal` resta utile solo come copia in storage interno, che è la stessa
disposizione che NovaOS usa già per la shell aggiornata via OTA.

### Catena di build — il vincolo più pesante scoperto

Provata una versione alla volta, ognuna fallita sul precedente:

| Tentativo | Esito |
|---|---|
| `compileSdk 34` + AGP 8.5.0 (catena del progetto) | ❌ `androidx.core:core:1.19.0` chiede ≥ 36 |
| `compileSdk 36` + AGP 8.13.2 + Gradle 8.13 | ❌ la stessa chiede ≥ 37 **e AGP ≥ 9.1.0** |
| `compileSdk 37` + AGP 9.4.0 + Gradle 9.7.1 | ❌ GeckoView 155 stesso chiede ≥ **37.1** |
| `compileSdk 37` + `compileSdkMinor 1` + platform `android-37.1` | ✅ |

Catena definitiva: **GeckoView 155.0.20260903215306 · AGP 9.4.0 · Gradle 9.7.1 · compileSdk 37.1
(versione minore, platform separata) · minSdk 26** (già conforme) · Java 17.

GeckoView non è su Maven Central: si scarica solo da `maven.mozilla.org/maven2/`, da aggiungere in
`settings.gradle`.

**Conseguenza non aggirabile:** la traccia A implica **abbandonare `build-apk.sh`** in favore di
Gradle. La build artigianale `aapt2`/`javac`/`d8` non regge la composizione di ~40 dipendenze
transitive (media3/ExoPlayer, androidx.core, lifecycle, `play-services-fido`, exifinterface,
tracing). L'APK debug dello spike pesa **504 MB** — non minificato e con tutte le ABI; in release
scende molto, ma resta nell'ordine delle decine di MB (§7.2).

### Comportamenti diversi dalla WebView, da mettere a piano

- **`AssetManager.list()` restituisce un array vuoto — non `null` — per i file.** Il primo tentativo
  di copiare la shell in storage interno ha trasformato `index.html`, `sw.js`, `icon.svg`,
  `manifest.webmanifest` e `version.json` in **cartelle vuote**; Gecko mostrava un «Index of…»
  invece della shell. L'unico modo affidabile di distinguere file e cartelle è provare ad aprire il
  percorso come stream. Corretto e verificato.
- **`ContentDelegate.onConsoleMessage` non esiste più** in GeckoView 155 (verificato con `javap`
  sull'AAR: nessuna classe `Console*`). La console si dirotta con
  `GeckoRuntimeSettings.Builder().consoleOutput(true)` → logcat, tag `GeckoConsole`. I ponti
  JS↔nativo passano ormai dalle WebExtension, quindi `NovaBridge` va **riprogettato**, non adattato.
- **I flag `SYSTEM_UI_FLAG_*` sono ignorati** sulle versioni recenti di Android: la status bar resta
  visibile. Per il fullscreen immersivo serve `WindowInsetsController` (fase 1).
- **Primo avvio lento**: caricamento delle librerie native `20,1 s` al primo avvio a freddo, con
  `Skipped 186 frames` a catena. Si tratta di un costo una tantum (le lib restano nella cache), ma
  va tenuto presente per la schermata di avvio.
- **Nessun errore JS** dalla shell in nessuna delle due origini: l'unica riga in `GeckoConsole` è
  l'innocuo `No chrome package registered for chrome://browser/content/built_in_addons.json`.

### Nota sull'ambiente di prova

L'emulatore era configurato con `-gpu swiftshader_indirect` (rendering software) e con GeckoView in
esecuzione la pipeline grafica si è **bloccata in modo irreversibile** — `screencap` non rispondeva
più nemmeno dopo la chiusura dell'app. Riavviato con `-gpu host` (GPU reale) tutto funziona. Non è
un problema di NovaOS, ma è un dato pratico: **per provare Gecko serve un dispositivo o un emulatore
con accelerazione grafica reale**, non uno in rendering software.

### Cosa resta aperto

Persistenza (`localStorage`/IndexedDB) nello storage di Gecko — l'origine cambia, quindi i dati
esistenti non seguono; service worker e `fetch`; peso finale in release. Sono le fasi 2–7.
Due voci di questo elenco sono state **chiuse il 2026-09-18 dalla fase 2** (§10): la forma dello
shim del ponte e la scelta dell'origine. Una è stata **riaperta**: la shell non può stare su
`file://`, quindi «service worker e `fetch` su `file://`» non è più la domanda giusta — vanno
verificati su `http://127.0.0.1`, dove peraltro il service worker è disponibile perché localhost è
contesto sicuro.

## 10 · Esito della fase 2 — il ponte (2026-09-18)

**Risposta: sì, il ponte regge.** Provato end-to-end dal tasto del browser del dock: la shell chiede
`openBrowser`, il comando arriva a Java e si apre la `BrowserActivity` nativa invece dell'anteprima
in-app. La catena che lo rende possibile è a **tre salti**, e ognuno serve:

```
pagina → stub iniettato → (postMessage) → content script
       → (sendMessage) → background → (sendNativeMessage) → Java
```

Ci sono voluti quattro tentativi perché ogni vincolo **mascherava il successivo**: finché non se ne
risolveva uno, non si vedeva il prossimo. Sono vincoli di piattaforma, non difetti dello spike, e
valgono anche per la ROM.

### 10.1 · `file://` non è più agganciabile

Da **Firefox 153** — quindi in Gecko 155 — l'accesso ai file è un **permesso separato**, spento per
impostazione predefinita in **ogni** estensione, comprese quelle integrate. In `about:addons` si
chiama «Accesso ai file locali sul computer»; in GeckoView non esiste alcuna interfaccia per
concederlo.

- Dichiararlo fra i permessi *richiesti* nel manifest non basta.
- `permissions.request({origins:["file:///*"]})` **non apre alcun prompt**.
- `WebExtensionController.addOptionalPermissions(id, [], ["file:///*"], [])` **concede l'origine**
  ma **non sblocca l'iniezione**: il registro dice `grantedOptionalOrigins=[file:///*]` e il content
  script continua a non essere iniettato.

Provato empiricamente: lo **stesso identico** content script gira su `https://it.wikipedia.org` e
non gira sulla shell servita da `file://`. Il piano originale del ponte — shell su `file://`, shim
iniettato da un content script — è **da considerarsi morto**.

### 10.2 · Un content script non può esporre `window.NovaNative` alla pagina

Questo è il vincolo che corrispondeva esattamente al sintomo osservato («il dock apre il browser
vecchio»). I content script di Firefox girano in un **mondo isolato** (Xray vision): il loro
`window` non è quello della pagina, e le proprietà che vi scrivono **restano invisibili agli script
della pagina**. Il quadro che ne risultava era ingannevole al massimo grado:

- il content script si inietta e gira (`content script agganciato a …` in logcat);
- le sonde raggiungono il nativo;
- ma `bridge.js` **non vede** `window.NovaNative`, quindi `has("openBrowser")` è falso e la shell
  ripiega sulla sua anteprima in-app — il «browser vecchio».

La cura è uno **stub iniettato come `<script>` nella pagina**: lì è codice della pagina e vede il
proprio `window`. Lo stub non ha però accesso a `browser.runtime`, quindi parla al content script
con `postMessage`, e il content script inoltra.

### 10.3 · Una pagina servita da `moz-extension://` non è un ambiente privilegiato

Secondo tentativo: servire la shell **dall'interno dell'estensione**
(`moz-extension://…/www/index.html`), dove non serve alcun content script perché la pagina
dovrebbe vedere `browser.runtime` direttamente. La shell carica, l'adattatore si installa,
`sendNativeMessage` **esiste** — e i messaggi **non arrivano**: la promessa non si risolve né si
rifiuta, e il nativo non registra nulla. Un fallimento silenzioso, il tipo peggiore.

Resta provato, e vale la pena tenerlo: quell'origine **non soffre della CSP d'estensione**? No —
la soffre. Le pagine servite da `moz-extension://` ricevono una CSP propria
(`script-src 'self' 'wasm-unsafe-eval'`) che blocca gli attributi di evento inline
(`onerror="…"` nelle icone): errore non fatale, ma da mettere a piano per la fase 5.

### 10.4 · La soluzione: la shell su `http://127.0.0.1`

Un'origine **HTTP locale** non ha nessuno dei tre problemi: non è un file (quindi il content script
si inietta), non è una pagina di estensione (quindi nessuna CSP d'estensione). In più `127.0.0.1` è
considerato **contesto sicuro** dalle specifiche del web, quindi restano disponibili le API che
altrove richiedono HTTPS, service worker compreso.

La forma implementata nello spike: un server HTTP minimo **dentro l'app** (`ShellServer.java`,
~200 righe, `ServerSocket` su `127.0.0.1`), che serve la shell dalla stessa copia in storage
interno già usata dall'OTA. Due scelte non casuali:

- **porta fissa** (8731), perché l'origine di una pagina comprende la porta: cambiandola
  cambierebbe l'origine, e con essa `localStorage` e IndexedDB, cioè tutti i dati della shell;
- **ascolto solo su `127.0.0.1`**, così la shell non è raggiungibile dalla rete né da altre app.

Il traffico è in chiaro ma non lascia il telefono; nel modulo spike è autorizzato da un
`network_security_config` limitato a `127.0.0.1`/`localhost`.

**Perché conta anche per la ROM:** è l'unica origine che sopravvive alla traccia B. Servire la
shell da `10.0.2.2` (il computer di sviluppo) va bene in prova, ma su un telefono reale quel
computer non esiste. Il server locale invece è autosufficiente.

### 10.5 · Altri vincoli scoperti nella stessa tornata

- **`org.json.JSONObject`, non `GeckoBundle`.** I messaggi di una WebExtension arrivano al
  `MessageDelegate` come `org.json.JSONObject` con `args` come `JSONArray`. `GeckoBundle`
  implementa **solo `Parcelable`**, non `java.util.Map`: un controllo `instanceof Map` non scatta
  mai e il nome del comando resta `null` — il ponte sembra morto mentre il canale funziona.
- **`SessionController` esiste, ed è annidata** (correzione del 2026-09-18 a un'affermazione
  sbagliata scritta qui il giorno prima). Cercandola di primo livello — `org.mozilla.geckoview.
  SessionController` — non si trova, e da lì era nata la conclusione «non esiste». In realtà è
  **`WebExtension.SessionController`**, con `setMessageDelegate(WebExtension, MessageDelegate,
  String)`, `getMessageDelegate`, `setActionDelegate`, `setTabDelegate`. Serve quando le sessioni
  sono più d'una e il delegate va legato alla singola; qui la sessione è una sola e basta
  `WebExtension.setMessageDelegate(delegate, "browser")` — ma la classe c'è, e negarlo era un
  errore di ricognizione, non una semplificazione.
- **Ciò che davvero manca è l'esecuzione di JS.** `GeckoSession` non espone alcun metodo di
  valutazione o iniezione (nessun `evaluate`, `inject`, `script`, `chrome` — verificato con `javap`
  sull'AAR). È la perdita più pesante rispetto alla WebView: sotto WebView **tutto** il verso
  nativo → pagina passava da lì, `web.evaluateJavascript("window.NovaCall.update(...)")`, ed è il
  meccanismo su cui sono scritte le chiamate in arrivo, gli SMS, gli esiti del microfono, i timer.
  Non esiste un sostituto diretto: il sostituto è la **porta** descritta in §10.7.
- **`installBuiltIn` è asincrona.** Caricando la pagina subito dopo la chiamata, il content script
  dichiarato a `document_start` arriva a documento già iniziato e **non viene mai iniettato**:
  l'estensione risulta installata, abilitata e con le origini concesse. La shell va caricata
  **dentro** il callback di installazione.
- **Il `MessageDelegate` riceve anche il mittente**: `sender.environmentType` distingue
  `ENV_TYPE_EXTENSION` da `ENV_TYPE_CONTENT_SCRIPT`, e `sender.url` dice da dove viene. È
  l'informazione che ha permesso di capire, salto per salto, chi parlava davvero.
- **Il tasto indietro non chiude le viste interne.** La shell lo gestisce con
  `window.NovaBack()` chiamato da Java; sotto Gecko quella via non esiste, e `session.goBack()` non
  sostituisce la navigazione interna di una single-page app. Da risolvere in fase 5.

### 10.6 · Stato dell'implementazione nello spike

| Cosa | Stato |
|---|---|
| Shell servita dal server locale, avvio e interattività | ✅ verificato |
| Ponte a tre salti, con sonda dalla pagina | ✅ verificato: `__probe_stub` arriva a Java |
| `openBrowser` → `BrowserActivity` nativa | ✅ verificato dal dock |
| Comandi cablati in Java | **3 su 53** (`toast`, `vibrate`, `openBrowser`): tutti gli altri arrivano e finiscono nel log |
| Getter e richiesta/risposta (14 + 11) | ❌ in questa fase; **risolti in §11** (fase 3): gli 11 getter sono cablati, restano i 14 asincroni |
| Ritorno nativo → pagina, con evento consegnato alla shell | ✅ verificato (§10.7) |
| `BrowserActivity` | copiata da `:app`, **ancora basata su WebView**: il port a GeckoView è un passo a sé |
| Pulizia | la fascia diagnostica è già stata tolta; le sonde `__probe_bg` / `__probe_stub` **restano** finché servono alla fase 3 come spia di canale vivo |

**Nota pratica.** La fascia diagnostica copriva il dock e ne intercettava i tocchi: per un giro di
prove il ponte è sembrato rotto mentre funzionava. Una diagnostica che introduce un guasto mentre
ne cerca un altro costa più di quanto renda — ora è `pointer-events:none`.

### 10.7 · Il verso che mancava: nativo → pagina

**Esito: funziona, verificato sullo schermo il 2026-09-18.** Il nativo manda un evento, e la
schermata di chiamata in arrivo della shell compare — disegnata dalla pagina, comandata da Java.

La via è la **porta**. `sendNativeMessage` è a senso unico: la pagina chiama, il nativo risponde.
Perché il nativo possa parlare per primo serve un canale persistente, e GeckoView ce l'ha:

| Passo | Lato | API |
|---|---|---|
| 1 | Java | `WebExtension.MessageDelegate.onConnect(WebExtension.Port)` |
| 2 | Java | `port.postMessage(org.json.JSONObject)` |
| 3 | background | `browser.runtime.connectNative("browser")` → `port.onMessage` |
| 4 | background | ricopia il messaggio su ogni porta `browser.runtime.onConnect` aperta dalle pagine |
| 5 | content script | `window.postMessage({__novaGeoDalNativo: msg}, "*")` |
| 6 | stub in pagina | `window.NovaMsg(evento, ...args)` |

Il passo 6 è la parte che rende il tutto economico: **la shell ha già quel dispatcher**. In
`shell/js/bridge.js` c'è la mappa `MSG` con i nove eventi in ingresso (`call.update`, `dial`,
`back`, `shell.shot`, `mic.result`, `mic.resume`, `mail.onMessages`, `mail.onSent`, `mail.onError`)
e la funzione `msg(tipo, ...a)`, esposta come `window.NovaMsg`. Sotto WebView la chiama Java via
`evaluateJavascript`; sotto Gecko la chiama lo stub iniettato. **Da lì in poi la shell non sa — e
non deve sapere — da quale motore arriva l'evento.** È la ragione per cui il porting della shell
non richiede toccare `os.js`, `apps.js` o `bridge.js`: cambia solo chi pronuncia il nome.

Dettagli che sono costati tempo e vanno ricordati:

- **Due marche, non una.** Il listener di andata (`__novaGeo`) e quello di ritorno
  (`__novaGeoDalNativo`) convivono nella stessa pagina: con una sola, il messaggio di ritorno
  verrebbe rispedito al nativo a ogni giro, all'infinito.
- **Lo stub fa due cose.** Non solo definisce `window.NovaNative` (andata): registra anche
  l'ascoltatore del ritorno. È l'unico punto del sistema che sta nel contesto della pagina, quindi
  è l'unico che può parlare con la shell.
- **`connectNative` è diagnostico.** Se il nativo non ha un delegate registrato, lancia subito. È
  l'opposto di `sendNativeMessage`, che in quel caso non si risolve né si rifiuta e lascia il
  ponte in un silenzio indistinguibile dal funzionamento.
- **La porta nativa è una sola**, e il background fa da smistamento verso N porte di pagina. Con
  una sola pagina il Set ha un elemento; il disegno regge anche il reload e le schede multiple.
- **La porta va chiusa senza azzerare quella nuova.** `onDisconnect` azzera il campo solo se la
  porta che si chiude è ancora quella corrente: all'avvio di una seconda istanza la chiusura della
  vecchia arriva dopo l'apertura della nuova, e un azzeramento ingenuo lascerebbe il nativo muto.

**Un errore di metodo, che vale più del risultato.** La prima prova ha risposto «funziona» e sullo
schermo non c'era nulla. Il log diceva `consegnato alla pagina: call.update` — la catena era
integra, ma l'evento arrivava a 2,5 s dall'avvio, quando la shell è ancora al boot: la chiamata
finiva dietro il lockscreen e il boot la cancellava. Da qui il ritardo di 15 s in
`ATTESA_PROVA_MS` (che è un artefatto della sonda: sparisce quando l'evento lo genera un fatto
vero e non una prova). La lezione è che **«il log dice che è arrivato» e «è successo qualcosa»
sono due affermazioni diverse**, e in un sistema a sei salti la prima non implica la seconda.

**Conseguenza sul piano.** Il rischio 1 di §7 — «il verso nativo → pagina è il pezzo che può
costringere a ripensare tutto» — è **chiuso**. Le fasi 0 e 2 sono verificate in entrambi i versi;
quello che resta è lavoro noto e senza incognite: cablare i comandi (3 su 53), rendere asincroni i
getter (fase 3), e le differenze di comportamento di fase 5.

---

## 11 · Esito della fase 3 — i getter e i primi eventi veri (2026-09-18)

**Esito: verificato.** Lo stato del telefono (versione app, batteria, permessi, ruolo dialer, stato
chiamata) parte da Java, attraversa la porta nativa, e la shell lo legge dai getter del contratto
come se fosse sotto WebView. Un comando vero — `requestMic` — chiede il permesso di sistema e ne
rimanda l'esito alla pagina, in entrambi gli esiti.

### 11.1 · Perché i getter sono un problema diverso dai comandi

Un comando è fire-and-forget: la pagina chiama, il nativo fa. Un getter **restituisce un valore che
la pagina legge subito**, e questa differenza non è aggirabile: il ponte è asincrono per
costruzione, quindi il valore non può essere la risposta della chiamata. Il nativo manda lo stato
una volta, all'avvio; lo stub lo tiene in una variabile; il getter restituisce quella copia. La
finestra fra `document_start` (quando lo stub esiste) e `load` (quando lo stato arriva) è coperta
dal valore `null`, che i chiamanti già trattano come «non noto».

Conseguenza sul contratto: **il valore può essere vecchio.** Sotto WebView `micDiag()` interrogava
il sistema nel momento della chiamata; qui risponde con una fotografia. Da qui l'obbligo, in
`onRequestPermissionsResult`, di rimandare lo stato aggiornato subito dopo aver risposto: senza,
`micDiag` resterebbe quello di prima fino al riavvio successivo, e la shell crederebbe a
un'informazione che il sistema ha già smentito.

### 11.2 · `has()` è un interruttore, non una guardia

Questa è la scoperta che ha deciso la forma della fase, e va letta prima di toccare lo stub.

In `shell/js/bridge.js`:

```js
has(n)  = !!(CONTRACT[n] && raw && typeof raw[n] === "function")
get(n)  = has(n) ? raw[n]() : cache[n] !== undefined ? cache[n] : default
```

Il chiamante però non usa `get()`. Scrive quasi sempre così:

```js
has("micDiag") ? micDiag() : "granted"
```

Il ragionamento istintivo è: «se il nativo non sa rispondere, `has()` è falso e la shell ripiega
sul default — un degrado prudente». **È falso.** Il default di `micDiag` è `"granted"`: con
`has()` falso la shell si dichiara con il permesso mentre il nativo dice `"blocked"`. Il ripiego
non è prudente, è **ottimista**, e senza lo stub il ponte sembrerebbe assente mentre sta invece
mentendo a favore del permesso.

Non esporre i getter non era quindi una scelta conservativa, era **un guasto silenzioso**. La
scelta giusta è esporli (come fa WebView, dove esistono tutti e 53 i metodi), e restituire il
valore vero.

**L'elenco non è tutto `CONTRACT`.** Sono cablati gli 11 getter puri:

`sensorStates`, `appVersion`, `mailAccount`, `isDialer`, `currentCallState`, `micGranted`,
`micDiag`, `batteryLevel`, `micReady`, `privileged`, `shellSource`.

Restano fuori, deliberatamente, due gruppi:
- i **14 di richiesta/risposta** (`audioRec*`, `saveDownload`, `setWifi`…): devono restituire una
  Promise, e un metodo esposto che risponde `undefined` li farebbe sembrare *falliti* invece che
  *non noti* — un guasto peggiore del degrado;
- **`prefGet` / `prefKeys`**: con `has()` vero partirebbe la migrazione una tantum di `os.js`, che
  copierebbe la `localStorage` verso un nativo che non ha preferenze. Cablarli senza implementarle
  sarebbe stato distruttivo.

### 11.3 · Le preferenze non hanno bisogno del nativo

Scoperta che riduce di molto la fase 3, e che vale la pena fissare perché sembra controintuitiva.

`shell/js/os.js` definisce `store` con **due livelli**: prima il nativo, e se il nativo non c'è,
`localStorage`. Sotto Gecko su `http://127.0.0.1` la seconda via c'è, è affidabile ed è **sincrona
al parse** — cioè le impostazioni sono già lette e applicate prima che qualunque getter asincrono
possa rispondere.

Quindi la fase 3 non deve cablare l'intera superficie dei getter: le preferenze funzionano già.
Restano i getter che riguardano lo *stato del dispositivo*, che è esattamente la lista di §11.2.
Nella ROM (traccia B) il discorso è diverso e va riaperto: lì l'origine cambia e la `localStorage`
non è più la stessa cosa.

### 11.4 · Il primo evento che non è una sonda

Le fasi precedenti si erano verificate con sonde (`__probe_bg`, `__probe_stub`, una chiamata in
arrivo finta). Una sonda prova che il canale è vivo; non prova che il canale **serva**. Il primo
evento generato da un fatto vero è `mic.result`: il nativo chiede il permesso di sistema e rimanda
l'esito.

```java
case "requestMic":
  if (già concesso) inviaEvento("mic.result", true);
  else requestPermissions(new String[]{RECORD_AUDIO}, RICHIESTA_MIC);
```

e in `onRequestPermissionsResult`: `inviaEvento("mic.result", concesso)` seguito da
`inviaStatoAllaShell()`.

Dall'altra parte non serve nulla di nuovo: `mic.result` è già nella mappa `MSG` di `bridge.js`, e
la shell lo consegna a `window.__novaMic(ok)`, la funzione che `apps.js` usa per mostrare o
nascondere l'avviso. **Verificato in entrambi gli esiti:**

- **concesso** → `micGranted: true`, `micDiag` passa da `"blocked"` a `"granted"`, nessun avviso a
  schermo (corretto: non c'è nulla da segnalare);
- **negato** → `mic.result` con `false`, e il Registratore disegna «Serve il permesso del microfono
  per registrare» con il pulsante «Consenti microfono». **Lo stesso avviso che disegna sotto
  WebView**, perché entra dalla stessa porta.

Il valore di questa prova non è il microfono: è che un fatto del sistema operativo arriva
all'interfaccia senza che sia stata toccata una riga di `shell/`.

**Due cose da sapere prima, che sembrano dettagli e non lo sono.**
- **Il permesso va dichiarato nel manifest del modulo.** Senza `<uses-permission
  android:name="android.permission.RECORD_AUDIO"/>` `requestPermissions` non mostra alcun dialogo
  e risponde «negato» all'istante: il comando sembra rotto mentre è il modulo a essere incompleto.
  Nel modulo `:app` il permesso c'è già. (È una precondizione nota di Android, non un guasto
  incontrato qui: la dichiarazione è stata aggiunta prima della build.)
- **La richiesta parte dal thread principale, e la riga che lo garantisce è una sola.**
  `requestPermissions` va chiamata dal thread UI, e `esegui` ci gira — ma **non** perché Gecko
  consegni `MessageDelegate.onMessage` lì: lo consegna sul suo thread, e il salto è esplicito,
  `runOnUiThread(() -> esegui(n2, a2, id2))` (`MainActivity.java:321`; stessa cosa per
  `esegui` in `:203`). Detta com'era scritta prima — «il delegate viene consegnato sul thread
  principale» — la frase era meccanicamente falsa e faceva sembrare una garanzia del motore
  ciò che è una riga scritta a mano. Chi in futuro tocca quella riga deve sapere che senza di
  essa `requestPermissions` fallisce.

**Un errore di metodo, per la seconda volta lo stesso.** Il primo tentativo «non ha fatto nulla»:
nessun dialogo, nessuna callback. La causa non era nel codice — l'emulatore si era riaddormentato
e il tocco era finito sul lockscreen, quindi `requestMic` non era mai partito. È esattamente la
lezione di §10.7 in un'altra veste: **prima di attribuire un guasto al codice, verificare che
l'azione sia arrivata.** La differenza è che qui il log lo diceva in modo netto — `requestMic` non
compariva affatto — e questo avrebbe dovuto chiudere il sospetto in un minuto invece che in un
giro di prove. Un comando che *non arriva* e un comando che *arriva e non fa nulla* sono due
problemi diversi, e il log li distingue sempre.

### 11.5 · Stato dopo la fase 3

| Cosa | Stato |
|---|---|
| Ponte pagina → nativo | ✅ verificato (§10) |
| Ponte nativo → pagina, con evento vero e non sonda | ✅ verificato: `mic.result` (§11.4) |
| Getter di stato (11) | ✅ cablati e verificati: `has(micDiag)=true`, valore `"blocked"` |
| Preferenze | ✅ già funzionanti via `localStorage`, senza Java (§11.3) |
| Richiesta/risposta (14) | ❌ da fare: servono Promise, quindi un disegno a parte |
| Comandi cablati in Java | **5 su 53** (`toast`, `vibrate`, `openBrowser`, `requestMic`, `openAppSettings`) |
| `BrowserActivity` | copiata da `:app`, **ancora basata su WebView**: il port è un passo a sé |
| Tasto Indietro | ✅ cablato e verificato (§12) |
| Sonde `__probe_bg` / `__probe_stub` | restano: costano due righe di log e servono a distinguere «canale morto» da «comando sbagliato» |

La fase 3 non ha richiesto **nessuna modifica a `shell/`**. È il segno che §8 aveva preparato bene
il terreno: la shell non interroga più il motore, quindi cambiare motore non la tocca.

---

## 12 · Il tasto Indietro: quando la stessa API significa un'altra cosa (2026-09-18)

**Esito: corretto e verificato.** Da Impostazioni, Indietro riporta alla home. Prima non faceva
nulla.

Questo è il primo difetto del porting che **non** è «l'API non esiste». È la categoria più
insidiosa, e vale la pena isolarla perché ne incontreremo altre.

Lo spike aveva scritto:

```java
public void onBackPressed() {
    if (session != null) { session.goBack(); return; }
    super.onBackPressed();
}
```

`GeckoSession.goBack()` esiste, compila, e fa esattamente ciò che il nome promette: la navigazione
**indietro del browser**. Il launcher però intende un'altra cosa — «chiudi lo shade, oppure esci
dall'app aperta» — ed è ciò che `:app` faceva con
`web.evaluateJavascript("window.NovaBack && window.NovaBack()")` (`:app` `MainActivity.java:1084`).

Il guasto non somiglia a un guasto: nessuna eccezione, nessun log, **nessun errore da nessuna
parte**. Il tasto risponde (il tocco arriva, l'Activity lo riceve) e semplicemente non succede
niente di visibile, perché la shell è una pagina sola e la sua cronologia ha un elemento. Da qui
la diagnosi è difficile: sembra che il tasto sia rotto a livello di sistema, mentre sta facendo
con scrupolo una cosa che non è quella richiesta.

**La correzione non aggiunge un'API: cambia il destinatario.** Il nativo manda l'evento `back`
sulla porta nativa — lo stesso canale di `mic.result` — e dall'altra parte non serve nulla:
`back` è già nella mappa `MSG` di `bridge.js` e arriva a `window.NovaBack` (`shell/js/os.js:1899`),
la stessa funzione che chiamava WebView.

Il ripiego su `super.onBackPressed()` scatta **solo a ponte spento** (shell non servita, estensione
non caricata): lì la shell non riceverebbe nulla, e senza ripiego l'app diventerebbe impossibile
da chiudere. A ponte vivo il comportamento è identico a `:app`, che inoltra sempre e non chiude mai
l'Activity — quindi anche `:app`, sulla home senza app aperte e senza shade, ingoia il tasto. Non è
una svista del porting: è il comportamento da riprodurre, ed è bene saperlo prima di «correggerlo».

**Regola da tenere per le fasi successive:** quando un'API del motore *sembra* fare la cosa giusta,
il porting è finito solo se si è verificato **cosa fa dall'altra parte**, non se compila.

---

## 13 · Esito della fase 4 — il canale richiesta/risposta (2026-09-18)

**Esito: il canale funziona, verificato end-to-end con `saveDownload`.** Il backup scrive davvero
il file (216 byte in `Download/`), Java risponde col percorso, la pagina lo riceve **intatto**, la
shell vibra — il suo ramo di successo. Nessuna riga di `shell/` modificata.

### 13.1 · Perché serviva un canale a parte

Le fasi 2 e 3 avevano costruito due versi che non si toccavano: la pagina **chiede** (28 comandi
fire-and-forget) e riceve **eventi** (11 getter sincroni, più `mic.result` e `back`). Manca la
forma che serve alla maggior parte dei 14 comandi di `CONTRACT` rimasti: una domanda che vuole una
risposta. La shell li chiama con `await` — `await NB().audioRecStart()` — perché sotto WebView
`NovaNative` li espone come metodi che restituiscono un valore.

Il canale: lo stub espone il comando, gli assegna un **id progressivo** e restituisce una Promise;
Java la scioglie postando `__novaRisposta` sulla porta nativa con lo stesso id. Un id e non il nome
del comando: due richieste uguali in volo (due salvataggi insieme) devono poter ricevere risposte
diverse.

`await` su un valore semplice e `await` su una Promise sono la stessa cosa per il chiamante, quindi
**la sostituzione è invisibile alla shell**. È il motivo per cui il canale si è potuto aggiungere
senza toccare una riga di `shell/`.

### 13.2 · La trappola simmetrica a `has()`

§11.2 ha stabilito che `has()` è un interruttore, non una guardia: esporre un getter che il nativo
non riempie fa prendere ai chiamanti un default ottimista invece del valore vero. Il canale
richiesta/risposta ha lo stesso problema **rovesciato**, e peggiore:

| | Getter (§11.2) | Richiesta/risposta (§13) |
|---|---|---|
| Esposto ma non risposto | `has()` vero → default ottimista, silenzioso | la Promise non si scioglie → **la shell si blocca su quel gesto** |
| Sintomo | un valore sbagliato | nessun valore, per sempre |
| Come si scopre | confrontando col nativo | non si scopre: nessun errore, nessuna scadenza |

Un `await` che non torna non produce un'eccezione, non logga nulla e non ha scadenza: la shell
resta appesa sul gesto. Perciò tre regole, tutte e tre necessarie:

1. **L'elenco `RR` nello stub è la copia esatta di ciò che Java risponde.** Un nome in più è un
   blocco. Non è un elenco «dei comandi che esisterebbero»: è l'elenco dei `case` realmente cablati.
2. **`id >= 0` distingue una richiesta da un comando fire-and-forget.** Solo la prima va risolta;
   il `default:` di Java risponde `null` invece di tacere, così un comando che qualcuno aggiunge a
   `RR` senza cablarlo si scopre subito invece di bloccare la shell.
3. **Un timeout di sicurezza nello stub (10 s)** che risolve comunque, e **lo dice in console**:
   un timeout silenzioso sarebbe una bugia, e il chiamante deve poter distinguere «non riuscito»
   da «il nativo non ha risposto». Scaduto, il valore è `null`, che i chiamanti già trattano come
   «non riuscito».

### 13.3 · Il difetto trovato durante la verifica, e cosa insegna

Il primo giro è **sembrato** riuscito e non lo era. La risposta passava per l'array `{evento, args}`
usato dagli eventi:

```
Java:   risposta inviata: id=1 valore=Download/novaos-backup-2026-09-18.json
porta:  {"evento":"__novaRisposta","args":[1,0]}
pagina: risposta per id 1: 0
```

L'id arrivava, la Promise si scioglieva, **il canale funzionava** — e il valore era `0`. La
diagnosi: un `JSONArray` di **tipi misti** non sopravvive alla conversione `JSONObject` →
`GeckoBundle` che sta dietro `WebExtension.Port.postMessage`. Il numero è passato, la stringa è
diventata `0`. La correzione sono campi con un nome — `{"evento":"__novaRisposta","id":1,
"valore":"…"}` — che non dipendono da come il motore serializza gli array.

Tre cose da portare avanti:

- **Gli eventi non se n'erano accorti per fortuna, non per disegno.** I loro array sono vuoti
  (`back`) o contengono un solo elemento dello stesso tipo (`mic.result` con un booleano,
  `shell.state` con un oggetto). Un array di un tipo solo passa; uno misto no. La regola generale
  è di non contare sulla serializzazione degli array per trasportare valori di tipo imprevedibile.
- **Un dato che attraversa un confine va guardato dall'altra parte.** Il log di Java diceva
  `valore=Download/…json`, corretto. Se la verifica si fosse fermata lì — «Java ha inviato il
  valore giusto» — il difetto sarebbe passato. La riga che conta è quella della pagina: *cosa è
  arrivato*. È la stessa lezione di §12 in un'altra veste.
- **Un id giusto non è una risposta giusta.** Il canale era corretto in ogni sua parte
  meccanica; a essere sbagliato era solo il carico. Verificare che il meccanismo giri non dice
  nulla su ciò che trasporta: vanno provati **entrambi**, e con un valore che si possa
  riconoscere.

### 13.4 · Un difetto preesistente, ora visibile

Il file scritto è `Download/novaos-backup-2026-09-18 (1).json` mentre Java ha risposto
`Download/novaos-backup-2026-09-18.json`: **MediaStore rinomina in caso di collisione** e il
percorso che l'app comunica non è quello del file su disco. Non è una regressione di GeckoView —
lo stesso identico codice sta in `:app` (`MainActivity.java:898`), quindi il comportamento è già
quello dell'app pubblicata. La differenza è che sotto WebView questo valore finiva in un
`JavascriptInterface` e la shell lo scriveva a schermo; qui finora diventava `0` e il difetto era
invisibile. Da correggere quando si toccherà `saveDownload`: il nome vero si legge dall'URI
restituito da MediaStore, non si presume da quello richiesto.

### 13.5 · Stato dopo la fase 4

| Cosa | Stato |
|---|---|
| Ponte pagina → nativo | ✅ verificato (§10) |
| Ponte nativo → pagina, con evento vero | ✅ verificato: `mic.result` (§11.4), `back` (§12) |
| Getter di stato (11) | ✅ cablati e verificati |
| Preferenze | ✅ già funzionanti via `localStorage`, senza Java (§11.3) |
| **Canale richiesta/risposta** | ✅ **verificato end-to-end** (§13) — ma con **1 comando su 14** |
| Comandi cablati in Java | **5 su 53** (`toast`, `vibrate`, `openBrowser`, `requestMic`, `openAppSettings`) |
| `BrowserActivity` | copiata da `:app`, **ancora basata su WebView**: il port è un passo a sé |
| Tasto Indietro | ✅ cablato e verificato (§12) |

Il canale è la parte difficile; i comandi che lo usano sono ora quasi tutti una riga in `RR` più
un `case` in Java. L'ordine utile è: **`shellWrite`/`shellCommit`** (è il percorso dell'OTA sotto
Gecko), poi **`audioRecStart`/`audioRecStop`** — che Gecko dovrebbe rendere superflui via
`getUserMedia`, quindi vanno provati in quest'ordine, non cablati a scatola chiusa — e infine i
sette `set*`, che **non sono lavoro di porting**: sotto Android stock rispondono già `false` oggi,
anche nell'app pubblicata, perché richiedono `WRITE_SECURE_SETTINGS`. Sono lavoro della traccia B.

---

## 14 · Esito della fase 5 — l'OTA sotto Gecko (2026-09-18)

**Esito: il percorso di aggiornamento della shell funziona, verificato nei tre momenti che
contano** — commit, sopravvivenza al riavvio, ripristino. È il passo senza il quale la migrazione
non starebbe in piedi: l'aggiornamento della sola interfaccia è il modo con cui NovaOS si aggiorna
senza reinstallare l'APK, e sotto WebView passava da `addJavascriptInterface` e da `loadUrl`.

### 14.1 · Il difetto che avrebbe reso tutto inutile, in silenzio

`copiaShellInInterno()` ricopiava gli asset in `files/shell` **a ogni avvio**. Finché la shell era
solo quella dell'APK era la cosa giusta — si riparte da zero, nessun residuo di un avvio
precedente. Con l'OTA diventa un guasto silenzioso:

1. `shellCommit` sostituisce `files/shell` con la shell scaricata;
2. l'utente riavvia l'app (o il telefono);
3. la copia incondizionata cancella la shell nuova e rimette quella dell'APK.

Il sintomo è il peggiore possibile: **l'aggiornamento sembra riuscito** — e lo è, fino al riavvio
successivo — poi sparisce senza un errore, senza un log, senza che nessuno possa collegare la
cosa al commit di ieri. Un aggiornamento che fallisce subito è molto meglio di uno che riesce e
poi si disfa.

La correzione non inventa nulla: è la regola che `:app` usa già in `resolveShellUrl()` — la shell
interna si tiene solo se la sua `build` è più alta di quella degli asset, confrontata sul
`version.json`, non sulle date dei file (le date di una copia non significano nulla, e dopo un OTA
sarebbero «adesso» per entrambe). La funzione ora si chiama `preparaShell()`, perché non è più una
copia.

**Il caso peggiore di qualunque guasto qui è «si torna alla shell dell'APK»**, mai «niente shell»:
una cartella interna senza `index.html`, o con un `version.json` illeggibile, non è una shell e
viene ricopiata. È il degrado progettato del resto del ponte.

### 14.2 · I tre comandi

| Comando | Tipo | Cosa fa |
|---|---|---|
| `shellStageBegin` | fire-and-forget | svuota e ricrea `files/shell_stage` |
| `shellWrite(rel, base64)` | richiesta/risposta → `boolean` | scrive un file nella staging |
| `shellCommit()` | richiesta/risposta → `boolean` | valida la staging, sostituisce `files/shell`, ricarica |
| `shellReset` | fire-and-forget | cancella tutto e ricopia dagli asset |

Tre cose non ovvie, tutte con lo stesso schema — *un errore qui non si vede subito*:

- **La risposta parte prima della ricarica.** `os.js` fa `done = await NB().shellCommit()` e solo
  dopo si aspetta di essere ricaricata: il commit vero è la ricarica, ma l'esito è la Promise.
  Ricaricando mentre la Promise è in volo, il chiamante non riceverebbe mai la risposta — e non
  potrebbe riceverla dopo, perché la pagina che l'aspettava non esiste più. Da qui i 400 ms fra
  la risposta e `session.reload()`.
- **`true` vero, non un valore qualsiasi.** `os.js` confronta con `ok !== true`, non con `!ok`:
  un esito ancora ignoto (`null`) brickerebbe la shell al commit successivo. I tre comandi devono
  quindi rispondere un booleano, e il `default:` di Java che risponde `null` resta la rete di
  sicurezza, non un comportamento accettabile.
- **Il controllo di path-traversal non è pignoleria.** `rel` arriva **dalla rete**, e senza il
  controllo su `..` e sul percorso canonico un `../../shared_prefs/…` scriverebbe dentro i dati
  privati dell'app. È la stessa logica di `:app`, e va tenuta identica.

### 14.3 · La cache del server locale, e perché `no-store`

Dopo un commit la shell ricarica chiedendo **gli stessi percorsi, sulla stessa porta, dalla stessa
origine**. Le risposte di `ShellServer` non avevano intestazioni di cache: il motore poteva
servirle dalla propria e mostrare l'**interfaccia vecchia con dentro il `version.json` nuovo** —
di nuovo un aggiornamento che sembra riuscito e non è applicato, con l'aggravante che stavolta la
versione dichiarata sarebbe quella giusta.

Aggiunto `Cache-Control: no-store`. Servendo pochi file da disco, la cache qui non guadagna nulla
che valga il rischio.

### 14.4 · Come è stato provato senza pubblicare nulla

Il percorso vero si prova solo con una `version.json` su GitHub con `build` più alta — cioè
**pubblicando**, e attivando l'aggiornamento su tutti i dispositivi. Non è una prova, è un rilascio.

La prova è stata fatta con una **sonda temporanea nello stub** (rimossa nello stesso commit che
l'ha introdotta) che esercita i tre comandi con una shell finta, contando i giri in `localStorage`
per distinguere i momenti dentro un solo avvio:

| Momento | Come | Esito |
|---|---|---|
| **Commit** | giro 0: `shellStageBegin`, due `shellWrite`, `shellCommit` | `commit eseguito: shell sostituita, build 999`; la pagina a schermo è davvero quella nuova; `commit=true` |
| **Sopravvivenza** | `force-stop` + riavvio dell'app | `shell interna tenuta: build 999 > asset 57` — **la riga che prima non esisteva** |
| **Ripristino** | giro 2: `shellReset` | `shell dagli asset (interna=-1 asset=57)`, la shell torna NovaOS |

La sonda ha anche sbagliato una volta, ed è l'unico difetto banale della giornata: `btoa` rifiuta i
caratteri sopra `0xFF`, e la pagina finta conteneva un trattino lungo. È il tipo di errore che si
corregge in un minuto — ma vale la pena notarlo perché la sonda era codice vero, non una
simulazione: **una prova che non passa dal percorso reale va comunque scritta bene**, altrimenti
non sta provando quello che dice.

### 14.5 · Stato dopo la fase 5

| Cosa | Stato |
|---|---|
| Ponte pagina → nativo | ✅ verificato (§10) |
| Ponte nativo → pagina, con evento vero | ✅ verificato: `mic.result` (§11.4), `back` (§12) |
| Getter di stato (11) | ✅ cablati e verificati |
| Preferenze | ✅ già funzionanti via `localStorage`, senza Java (§11.3) |
| Canale richiesta/risposta (14) | ✅ il canale è verificato (§13) — cablati **3 su 14** |
| **OTA della shell** | ✅ **verificato nei tre momenti** (§14) |
| Comandi cablati in Java | **10 su 53** — 7 dei 28 fire-and-forget, 3 dei 14 di richiesta/risposta |
| `BrowserActivity` | copiata da `:app`, **ancora basata su WebView**: il port è un passo a sé |
| Tasto Indietro | ✅ cablato e verificato (§12) |

Resta da fare, in ordine di utilità: **`audioRecStart`/`audioRecStop`** — che Gecko dovrebbe rendere
superflui via `getUserMedia`, quindi vanno *provati* prima di cablarli, non cablati a scatola
chiusa — poi i comandi di telefonia e condivisione, e infine i sette `set*`, che **non sono lavoro
di porting**: sotto Android stock rispondono già `false` oggi, anche nell'app pubblicata, perché
richiedono `WRITE_SECURE_SETTINGS`. Sono lavoro della traccia B.

## 15 · Esito della fase 6 — i permessi media (2026-09-18)

La fase 6 non nasce da una voce della tabella dei comandi ma da una domanda: **sotto GeckoView
`getUserMedia` cattura davvero?** La shell prova *prima* la via web (`getUserMedia` +
`MediaRecorder`) e ripiega sul nativo solo se quella fallisce (`shell/js/apps.js:4111-4139`).
Quindi la risposta decide due cose insieme: se il registratore funziona, e se i comandi
`audioRecStart`/`audioRecStop` — il ripiego nativo, con l'audio che viaggia in base64 — servono
ancora su questa traccia.

### 15.1 · Senza `PermissionDelegate` Gecko non risponde, e non lo dice

GeckoView non concede i media da solo: se la sessione non ha un `PermissionDelegate`, ogni
`getUserMedia` viene **negata** e la pagina riceve un `NotAllowedError`. Il sintomo però non
somiglia a un guasto del contenitore: `getUserMedia` fallisce, la shell ripiega sul registratore
nativo (non cablato), e **mostra l'avviso sul microfono**. Chi guarda cerca il problema nel
microfono, che non c'entra nulla.

Da qui `PermessiMedia`, più `<uses-permission android:name="android.permission.CAMERA" />` nel
manifest — la stessa assenza che con `RECORD_AUDIO` faceva rispondere «negato» all'istante, senza
nemmeno mostrare un dialogo.

L'ordine dentro `PermessiMedia` è deliberato: **prima il permesso di sistema, poi la risposta a
Gecko**. Concedere a Gecko senza il permesso di Android darebbe alla pagina un microfono che non
capta niente — di nuovo un guasto che non somiglia a un guasto.

### 15.2 · L'audio è web-puro: `audioRecStart` e `audioRecStop` non vanno cablati

Provato sull'emulatore con la shell servita dall'origine locale:

```
la pagina chiede i media: video=false audio=true
permessi media per la pagina: concessi
media già consentiti: concedo senza un secondo dialogo
```

Il registratore parte e resta in `Registrazione...`; fermato, salva in elenco una registrazione di
**00:40**. E soprattutto: **`audioRecStart` e `audioRecStop` non sono mai stati chiamati** — nel log
non c'è nessuna riga `comando dal ponte: audioRecStart`, e nessun `comando riconosciuto ma non
ancora cablato`. La shell è passata interamente dalla via web.

Conseguenza per la traccia A: **i due comandi non vanno cablati affatto**. Spariscono il ripiego
nativo, l'audio in base64 su un canale di messaggi e due voci di richiesta/risposta. È la prima
volta in questa migrazione che una fase *toglie* lavoro invece di aggiungerne, ed è esattamente
quello che il §1 prometteva.

> Il §14.5 li indicava come «la prossima cosa da fare, ma vanno provati prima di cablarli, non
> cablati a scatola chiusa». Provati: non servono. Vale la pena notare che la prudenza era
> giustificata nei due sensi — cablarli per abitudine avrebbe aggiunto codice morto e una seconda
> strada per lo stesso risultato.

### 15.3 · Anche il video

La fotocamera chiede `video=true audio=false`, e dopo il consenso:

```
Camera2Session: Camera device successfully started.
CameraStatistics: Camera fps: 9.
```

L'anteprima è dal vivo. Da notare che il percorso video chiede `{video:true, audio:true}` e ripiega
su `{video:true, audio:false}` se il primo fallisce (`apps.js:550-552`): è la stessa impronta del
registratore, e la ragione per cui valeva la pena cablare *entrambi* i rami del `PermissionDelegate`
invece del solo microfono.

### 15.4 · Il difetto trovato provando: due richieste di permesso in volo insieme

La shell chiama `NB().cmd("requestMic")` **e 77 ms dopo** `getUserMedia` (`apps.js:4116-4117`).
Due richieste di permessi Android in volo insieme, e Android ne accetta una per volta:

```
10:13:42.340  comando dal ponte: requestMic (0 argomenti)
10:13:42.417  la pagina chiede i media: video=false audio=true
              W Activity: Can request only one set of permissions at a time
              permessi media per la pagina: negati        ← 2 ms dopo
```

Quel rifiuto è **tecnico, non dell'utente**. Ma è indistinguibile da un diniego: `getUserMedia`
fallisce, la shell ripiega sul nativo e mostra l'avviso sul microfono. Il registratore falliva per
una ragione che non aveva niente a che vedere con il registratore — la stessa forma di guasto delle
trappole già catalogate (§10, §13.2), con in più che qui il sintomo accusava un componente sano.

La correzione è una coda: `unPermessoAllaVolta(Runnable)` esegue subito se nessun dialogo è aperto,
altrimenti accoda; il turno passa in `onRequestPermissionsResult`, che è **l'unico punto in cui un
dialogo si chiude**, quindi l'unico in cui la coda può avanzare.

Il corpo accodato **ricontrolla i permessi al proprio turno** invece di fidarsi di quelli calcolati
prima di mettersi in coda. Non è ridondanza: se nel frattempo l'utente ha concesso il microfono dal
dialogo di `requestMic`, alla richiesta media non resta niente da chiedere. Un secondo dialogo
identico, subito dopo il primo, sembrerebbe un'app che non prende la risposta.

La stessa sequenza di prima, ora:

```
10:13:42.340  comando dal ponte: requestMic (0 argomenti)
10:13:42.417  la pagina chiede i media: video=false audio=true
10:13:42.417  richiesta di permessi in coda: ce n'è già una aperta
10:14:02.214  permesso microfono: concesso
10:14:02.215  evento inviato alla pagina: mic.result
10:14:02.247  media già consentiti: concedo senza un secondo dialogo
10:14:02.537  comando dal ponte: vibrate
```

Un solo dialogo, zero occorrenze di `Can request only one set of permissions at a time`, e la shell
che riprende da sola (`vibrate` è il registratore che parte). Da notare che i due rami di
`onRequestPermissionsResult` devono **entrambi** finire con `turnoSuccessivoDeiPermessi()`: liberare
il turno solo sul ramo del microfono lascerebbe la coda ferma per sempre al primo caso video.

### 15.5 · La trappola dell'origine: il ponte che tace senza dirlo

Questa non è un difetto del codice — è una trappola dell'ambiente di prova, e va scritta perché
è costata un'ora di diagnosi sbagliata.

Lo spike sceglie la shell con un extra dell'intent, `origin`. Omesso, il valore predefinito è
**`asset`**: `resource://android/assets/www/index.html`. Quella è la provenienza da cui il motore
carica la shell, e **i content script non possono agganciarla** (§10) — è la ragione per cui esiste
il server locale.

Con l'origine sbagliata la shell **boota benissimo**: si disegna, risponde ai tocchi, tutte le app
si aprono in modalità simulata. Quello che non succede è qualunque cosa di nativo. `window.NovaNative`
non esiste, `bridge.js` costruisce `window.NovaBridge` sul ripiego — `{has: () => false, cmd: () => false}`
— e **ogni comando della shell restituisce `false` in silenzio**. Nessun errore, nessun avviso,
nemmeno in console: la shell è *progettata* per degradare con grazia senza nativo (§8), e lo fa.

Il modo affidabile per accorgersene è chiedere al ponte di parlare per primo. A pagina caricata lo
stub manda due messaggi:

```
comando dal ponte: __probe_stub    … da=moz-extension://…/_generated_background_page.html
comando dal ponte: __pagina_pronta … da=moz-extension://…/_generated_background_page.html
```

**Se queste due righe non compaiono nel log all'avvio della shell, il ponte è morto** — qualunque
cosa sembri funzionare. È il controllo più economico che esista su questo spike, e va fatto prima di
qualunque prova che riguardi il nativo.

Utile sapere, dalla stessa diagnosi: GeckoView 155 non ha più `ContentDelegate.onConsoleMessage`
(§10), ma `GeckoRuntimeSettings.consoleOutput(true)` esiste e manda la console della pagina in
logcat sotto il tag `GeckoConsole`. Con il ponte morto è l'unico posto dove la shell può ancora
dire cosa le sta succedendo.

### 15.6 · Stato dopo la fase 6

| Cosa | Stato |
|---|---|
| Ponte pagina → nativo | ✅ verificato (§10) |
| Ponte nativo → pagina, con evento vero | ✅ verificato: `mic.result` (§11.4), `back` (§12) |
| Getter di stato (11) | ✅ cablati e verificati |
| Preferenze | ✅ già funzionanti via `localStorage`, senza Java (§11.3) |
| Canale richiesta/risposta (14) | ✅ il canale è verificato (§13) — cablati **3 su 14** |
| OTA della shell | ✅ **verificato nei tre momenti** (§14) |
| **Permessi media** | ✅ **microfono e fotocamera, entrambi verificati** (§15) |
| **`audioRecStart`/`audioRecStop`** | ⛔ **non vanno cablati**: `getUserMedia` li rende inutili (§15.2) |
| Comandi cablati in Java | **10 su 53** — invariato, ma il totale utile è sceso di 2 |
| `BrowserActivity` | copiata da `:app`, **ancora basata su WebView**: il port è un passo a sé |
| Tasto Indietro | ✅ cablato e verificato (§12) |

La fase 6 non ha aggiunto comandi cablati: ha **verificato una capacità** e **tolto due comandi dal
lavoro**. Restano i comandi di telefonia e condivisione, il port di `BrowserActivity`, e i sette
`set*` — che restano lavoro della traccia B (§14.5).

---

*Documento di pianificazione — l'implementazione vive sul ramo `gecko-spike`. La shell è già stata
predisposta (`js/bridge.js`) con comportamento invariato sul motore attuale, così le fasi 0–6
lavorano su un'interfaccia stabile senza toccare l'app in uso. Finché la migrazione non è completa
`main` resta la shell pubblicata: nessuna fase di questo documento, da sola, è un rilascio.*

# Migrazione del motore web: WebView → GeckoView

Documento di progetto. Obiettivo: sostituire la WebView di sistema
che oggi fa da contenitore alla shell con **GeckoView** (il motore di Firefox), mantenendo
invariata tutta la parte web. Questo documento è la base di lavoro per lo spike isolato sul
ramo parallelo `novaos-rom/`; la shell (`shell/`) non deve cambiare.

- Stato: **fase 0 (§9) e fase 2 (§10) verificate su emulatore il 2026-09-18**, in **entrambi i
  versi**: i comandi della shell arrivano al nativo e gli eventi del nativo (es. chiamata in
  arrivo) compaiono nella shell. Restano da cablare la maggior parte dei comandi e le fasi 3–8.
  Nulla di quanto descritto qui è stato pubblicato: lo spike vive su un ramo isolato.
- Interessati: livello `android-launcher/` (contenitore + ponte), `shell/` (minimi ritocchi),
  `system/` (ROM definitiva)

> **Da leggere per primo se si riprende in mano il ponte:** §10. I vincoli scoperti lì
> (`file://` non agganciabile, mondo isolato dei content script, pagina d'estensione non
> privilegiata) invalidano il piano originale del §4 e sono il motivo per cui la shell è servita
> da un server HTTP locale invece che dagli asset. Il verso nativo → pagina, che era il rischio
> più serio del piano, è risolto e descritto in **§10.7**.

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
| Getter e richiesta/risposta (14 + 11) | ❌ da fare: sono asincroni, servono cache all'avvio (fase 3) |
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

*Documento di pianificazione — l'implementazione avviene su ramo isolato. La shell è già stata
predisposta (`js/bridge.js`) con comportamento invariato sul motore attuale, così le fasi 0–5
lavorano su un'interfaccia stabile senza toccare l'app in uso.*

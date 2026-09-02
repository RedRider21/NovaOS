# Migrazione del motore web: WebView → GeckoView

Documento di progetto (non ancora implementato). Obiettivo: sostituire la WebView di sistema
che oggi fa da contenitore alla shell con **GeckoView** (il motore di Firefox), mantenendo
invariata tutta la parte web. Questo documento è la base di lavoro per lo spike isolato sul
ramo parallelo `novaos-rom/`; la shell (`shell/`) non deve cambiare.

- Stato: **bozza di piano**
- Interessati: livello `android-launcher/` (contenitore + ponte), `shell/` (minimi ritocchi),
  `system/` (ROM definitiva)

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

## 4 · Architettura di destinazione

```
Livello web (shell)              chiama  window.NovaBridge.xxx()  (shim sottile)
        │            messaggi nativi → window.onNova(...)   /   window.NovaCall.update(...)
        ▼
WebExtension Nova                  content script ↔ pagina (custom event), background ↔ nativo
        │        GeckoView: WebExtension.MessageDelegate / SessionController.setMessageDelegate
        ▼
Livello nativo (Java)             NovaBridge → CallHub · MailBridge · sensori · ShareProvider
```

Elementi chiave:

1. **GeckoSession** al posto della `WebView`; l'app registra una **WebExtension Nova**
   (manifest incluso negli `assets`) con un content script e un background script.
2. La pagina continua a vedere `window.NovaNative`/`NovaCall` grazie a un **content script che
   inietta lo shim** e lo collega ai messaggi (pattern standard GeckoView: la pagina non tocca mai
   direttamente l'API nativa).
3. I messaggi **pagina → nativo** arrivano al `WebExtension.MessageDelegate` in Java e vengono
   instradati agli stessi componenti di oggi (`CallHub`, `MailBridge`, …).
4. I messaggi **nativo → pagina** partono da Java e raggiungono lo shim via `session.evaluate`
   o via port/background, ricreando `NovaCall.update` e `NovaDial`.

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
- **Ponte**: si elimina `addJavascriptInterface`; si introducono content script + MessageDelegate.
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
| 2 | WebExtension Nova: content script + shim `window.NovaNative`/`NovaCall` | I metodi *fire-and-forget* rispondono (toast, vibrate, share) | Usare il pattern ufficiale del native-messaging GeckoView |
| 3 | Getter sincroni → asincroni con cache all'avvio | `appVersion`, `isDialer`, `currentCallState`, sensori, `mailAccount` tornano corretti nelle Impostazioni | Ritocco mirato in `shell/` dietro il solito fallback (se manca il nativo, simulazione) |
| 4 | Push chiamata: `NovaCall.update`/`NovaDial` da Java | Chiamata simulata (`adb emu gsm call`) mostra la schermata NovaOS | `session.evaluate` o port di messaggistica |
| 5 | Permessi, file, download, UA, popup | Fotocamera scatta, Browser apre i siti, allegati Mail si aprono | Delegate GeckoSession dedicati |
| 6 | Mail + telefonia + sensori end-to-end sul GeckoEngine | Suite di prova manuale su emulatore | JavaMail invariato |
| 7 | OTA + service worker + temi sul GeckoEngine | Aggiornamento e offline come oggi | Cache/`CACHE`/aggiornamento |
| 8 | Rom definitiva: priv-app firmata + whitelist + SELinux; rimozione della variante WebView | Flash GSI su device reale | Fase finale, richiede hardware |

## 7 · Rischi principali

1. **Sincronia del ponte**: è il punto più delicato; mitigare con shim + cache all'avvio e
   mantenendo sempre attivo il fallback di simulazione della shell.
2. **Dimensioni**: il motore GeckoView pesa decine di MB → APK molto più grande di oggi (546 KB);
   da accettare (l'APK è bootstrap, la shell resta OTA) e da documentare.
3. **Service worker offline**: va verificata la compatibilità della strategia di cache della shell
   con la gestione cache di Gecko.
4. **Doppia build**: tenere vivi due percorsi di compilazione richiede disciplina; la shell comune
   limita il costo.
5. **Comportamenti diversi**: `addJavascriptInterface` sincrono sparisce; eventuali call-site
   dimenticati nella shell si romperanno solo sul motore nuovo → copertura tramite checklist
   dell'emulatore (fase 6–7).

## 8 · Punti aperti da confermare nello spike

- [ ] Rilascio AAR + Maven: versione GeckoView e requisiti (minSdk) da fissare.
- [ ] Modalità migliore per lo shim in pagina: content script che espone `window.NovaNative`
  (pattern ufficiale) oppure WebChannel.
- [ ] Persistenza dati shell (preferenze/IndexedDB) nello storage di GeckoView: migrazione o
  convivenza col percorso attuale.
- [ ] Policy UA per la vista desktop del Browser.
- [ ] Impatto di `?preview=1` / anteprime (nessuna differenza attesa).

---

*Documento di pianificazione — l'implementazione avviene su ramo isolato; la shell non cambia
durante le fasi 0–5.*

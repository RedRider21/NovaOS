# NovaOS — Guida completa alla ROM finale

Questa guida spiega **cos'è la distribuzione definitiva di NovaOS**, cosa cambia
rispetto all'uso attuale come app, come installarla nel modo più semplice, quali
parti del telefono **restano fisse e vengono riutilizzate** (a partire dal kernel),
e risponde alla domanda pratica sulle **app APK particolari** (es. quelle bancarie
con conferme/attestazione).

> In breve: NovaOS è un'esperienza **web** in stile Firefox OS/KaiOS che gira sopra
> un Android **minimale**. Non riscriviamo Android: ne teniamo il nucleo (kernel,
> driver, radio, WebView) e sostituiamo solo lo *strato interfaccia*.

---

## 1. I tre livelli (e cosa diventa la ROM)

```
Livello 2  shell/               HTML/CSS/JS — TUTTA l'interfaccia utente (nostra)
Livello 1  android-launcher/    launcher WebView (Home) + bridge nativo NovaNative
Livello 0  Android minimale     kernel Linux, driver/HAL, radio, WebView, servizi
```

- **Oggi (app):** i livelli 1+2 girano come una normale app impostata come Home,
  sopra un Android qualsiasi. Funziona, ma per i sensori Android obbliga ad aprire
  i suoi pannelli (vedi §4).
- **ROM finale:** NovaOS diventa **app di sistema privilegiata** dentro l'immagine,
  la Impostazioni/SystemUI di serie spariscono dalla vista, e i comandi si eseguono
  **dentro NovaOS**. Nasce l'esperienza monolitica.

---

## 2. Cosa NON viene sostituito: resta e viene RIUTILIZZATO

La ROM **non** cancella Android: parte da un Android vanilla e ne riusa il nucleo.
Questi elementi restano fissi, legati all'hardware del tuo telefono:

| Componente | Chi lo fornisce | Perché resta |
|---|---|---|
| **Kernel Linux** (partizione `boot`) | il telefono / vendor | contiene i driver del device; NovaOS **lo usa, non lo tocca** |
| **Driver e HAL** (partizione `vendor`) | il telefono | radio/modem, fotocamera, GPU, sensori, touch |
| **Stack telefonia (RIL/Telecom)** | Android | chiamate e SMS reali che le app web pilotano |
| **Servizi di sistema** | Android | SurfaceFlinger (display), audio, connettività, package manager |
| **Motore WebView/Chromium** | Android | è il runtime su cui gira **tutta** la shell di NovaOS |

**Punto chiave (Project Treble).** Da Android 8 il sistema è diviso in partizioni:
`system` (framework generico, **sostituibile** → qui va NovaOS), `vendor` (driver
del telefono) e `boot` (kernel). Flashando **solo `system`** e lasciando **intatte
`vendor` e `boot`**, NovaOS gira con **kernel e driver originali del telefono**:
radio, fotocamera, sensori, GPU funzionano subito. È lo stesso principio con cui
Firefox OS (Gonk) riusava l'HAL di Android.

## 3. Cosa viene rimosso o nascosto (lo strato "esperienza" di serie)

- Launcher stock → sostituito da NovaOS.
- SystemUI / app Impostazioni stock → nascoste (l'interfaccia è la nostra).
- App e servizi Google (Play Store, GMS, setup wizard) → assenti: NovaOS è web/open.
- App di serie ridondanti → rimpiazzate dalle web app.

Regola pratica: **si eliminano le interfacce di serie, si tengono i backend**
(telefonia, camera service, connettività) che quelle interfacce pilotavano.

---

## 4. Il bridge "reale": stesso APK, due comportamenti

NovaOS rileva **da solo** se ha poteri di sistema e si adatta — senza cambiare una
riga di codice tra telefono di prova e ROM:

| Situazione | `privileged()` | Cosa succede toccando un interruttore |
|---|---|---|
| **App normale** (telefono di prova) | `false` | apre il **pannello ufficiale** di Android (Wi-Fi, aereo, ecc.); al ritorno la voce «Aggiorna» rilegge lo stato reale |
| **ROM (priv-app firmata)** | `true` | **commuta l'hardware in-process**, con toast di conferma, senza uscire da NovaOS |

Metodi del bridge coinvolti (in `MainActivity.java`): `setWifi`, `setBluetooth`,
`setAirplane`, `setLocation`, `setNfc`, `setMobileData` — ognuno prova la via diretta
e, se non è privilegiato, ripiega sul pannello. `sensorStates()` riporta lo stato
vero letto dall'hardware **e** il flag `privileged`. In Impostazioni → Rete compare
la scritta «✓ Sistema integrato» quando i toggle sono diretti.

**Cosa sblocca i poteri di sistema:** due cose, entrambe già predisposte nel repo.
1. **Firma di piattaforma** dell'APK (chiavi del ROM).
2. **Whitelist priv-app**: `system/privapp-permissions-novaos.xml`, da copiare in
   `/system/etc/permissions/`. Concede `WRITE_SECURE_SETTINGS`, `WRITE_SETTINGS`,
   `MODIFY_PHONE_STATE`, `NETWORK_SETTINGS` (già dichiarati nel manifest: da app
   normale restano inerti, nel ROM vengono concessi).

Su Android recenti serve anche un piccolo **ritocco alle policy SELinux** per
consentire all'app di sistema di scrivere i secure settings.

---

## 5. Installare la ROM — dal più semplice al più completo

### Via A — Emulatore, subito, senza scaricare nulla (per provare)

L'immagine dell'emulatore È Android vanilla. NovaOS ci si innesta come app di sistema.

```bash
# terminale 1: emulatore con partizione di sistema scrivibile
emulator -avd nova -writable-system -no-snapshot -gpu host

# terminale 2: innesta NovaOS come priv-app + disabilita launcher/setup di serie
./system/make-emulator-rom.sh
```
Risultato: l'emulatore si avvia **direttamente in NovaOS**.

### Via B — Telefono reale via GSI (la più semplice su hardware)

**La più consigliata**: non si compila nulla, si usa un'immagine Android generica
(GSI) e vi si innesta NovaOS, poi si flasha **solo la partizione `system`**.

Requisiti: device **Project Treble** (≈ tutti da Android 9+) e **bootloader
sbloccabile**.

```bash
# 1. Sblocca il bootloader del device (procedura del produttore).
#    Su molti: Impostazioni → Opzioni sviluppatore → OEM unlocking, poi:
adb reboot bootloader
fastboot flashing unlock          # cancella i dati: fai prima un backup

# 2. Costruisci il system.img NovaOS a partire da un GSI vanilla (~1 GB).
./system/build-gsi.sh             # scarica il GSI, innesta NovaOS, rimpacchetta

# 3. Flasha SOLO system (vendor e boot restano quelli del telefono → HW ok).
adb reboot bootloader
fastboot flash system out/novaos-system.img
fastboot -w reboot                # -w azzera userdata la prima volta
```

Se il device ha partizioni dinamiche (super), `build-gsi.sh` gestisce il flashing
`fastboot flash system` con il device in `fastbootd` (lo script lo indica).

### Via C — LineageOS + priv-app (device molto supportati)

Parti da una ROM LineageOS del tuo device e inietti NovaOS in `system/priv-app/`,
impostandolo come Home via overlay. Passi in `system/build-rom.sh` (sezione LINEAGE).
Vantaggio: massima compatibilità hardware; più passaggi manuali.

### Via D — Build AOSP completa (controllo totale)

`system/novaos.mk` + `system/build-rom.sh`: `repo sync` di AOSP, NovaOS tra i
`PRODUCT_PACKAGES`, `make`. ~400 GB e ore di build. Solo se serve controllo pieno.

### Tornare indietro

Riflasha la `system.img` originale del device (o l'OTA di fabbrica) e, se vuoi,
`fastboot flashing lock`. Con la Via A basta chiudere l'emulatore (niente è
permanente sull'immagine base).

---

## 6. App APK particolari (banche, app con conferme): funzionano?

Domanda giusta e importante. Risposta onesta, in due parti.

### 6a. Tecnicamente si possono installare ed eseguire?
**Sì.** NovaOS sostituisce l'**interfaccia**, non il **runtime**: il framework
applicativo Android resta sotto. Se nel ROM manteniamo l'installer dei pacchetti e
il framework app (lo facciamo), puoi **installare normali APK** (sideload o, se
presente, uno store) e **lanciarli**: si aprono come una normale finestra Android
sopra la shell. Possiamo aggiungere in NovaOS un cassetto "App Android" che elenca
gli APK installati e li avvia via intent.

### 6b. Le app bancarie *accetteranno* di girare?
**Dipende dall'attestazione, ed è il vero ostacolo — comune a TUTTE le ROM custom,
non un limite di NovaOS.** Le app bancarie usano:

- **Rilevamento manomissione/root** e bootloader sbloccato;
- **Play Integrity API** (ex SafetyNet, che l'ha preceduta dal 2014 al maggio 2025):
  verifica che il sistema sia "certificato Google".

Il punto da capire è che **il fusibile è hardware**. Sbloccare il bootloader scrive un
fusibile nel dispositivo, e da quel momento il chip di sicurezza dichiara onestamente
`UNLOCKED` nella sua attestazione. Non è una variabile che si possa nascondere via software:

| Livello | Cosa verifica | Con bootloader sbloccato |
|---|---|---|
| `MEETS_BASIC_INTEGRITY` | sistema non manomesso | di solito passa |
| `MEETS_DEVICE_INTEGRITY` | dispositivo certificato e non modificato | recuperabile con configurazione adeguata |
| `MEETS_STRONG_INTEGRITY` | attestazione hardware + bootloader bloccato | **impossibile** (fisicamente) |

Quindi:

| Scenario | Esito realistico con le app bancarie |
|---|---|
| NovaOS **come app** su telefono **stock e bloccato** | ✅ le app bancarie funzionano (l'attestazione passa: il sistema è quello certificato) |
| NovaOS **come ROM** (bootloader sbloccato, non certificato) | ⚠️ le app che impongono Play Integrity forte spesso **si rifiutano** o bloccano le conferme |

**Vie d'uscita, in ordine di praticità:**

1. **Home banking via web.** È la strada naturale in stile Firefox OS: NovaOS apre i
   siti delle banche nella **WebView nativa a schermo intero** (o in Chrome), con
   OTP via SMS. Funziona senza attestazione dell'app.
2. **Device Pixel con re-lock a chiavi proprie.** Sui Pixel puoi **richiudere il
   bootloader firmando il ROM con le tue chiavi AVB** (custom root of trust): verified boot
   torna verde. È l'unico percorso "pulito", ed è quello che fa GrapheneOS — che infatti
   supporta **solo Pixel**, è stato il primo OS alternativo a usare questa funzione e ha
   contribuito a scriverne la documentazione AOSP. **Attenzione al limite:** il dispositivo
   resta **non certificato Google**, quindi circa l'1% delle app con controlli rigidi
   continua a non funzionare, anche se la gran parte delle app bancarie va.
3. **Tenere le poche app critiche su un telefono stock.** Pragmatico se ti servono
   solo per rare conferme — ed è la ragione per cui la via ROM di NovaOS è ora destinata a
   un **dispositivo secondario** (vedi il README).
4. *(Sconsigliato)* moduli tipo Play Integrity Fix: rincorsa continua, non affidabile — Google
   cambia la verifica ogni 4–6 settimane, e alcune banche usano controlli propri (RASP nativo,
   ricerca di binari `su`, blocklist di impronte) che ignorano del tutto Play Integrity.

**In sintesi:** far *girare* gli APK sì; farli *superare i controlli bancari* dipende
dall'attestazione, che il modello "ROM custom" mette in discussione per progettazione
del sistema Google — non per come è fatta NovaOS. Per l'uso bancario quotidiano, la
**versione web** dentro NovaOS è la soluzione robusta e sempre disponibile.

> Perché il problema non si pose a Firefox OS (e perché oggi NovaOS paga questo costo),
> con la cronologia dell'attestazione hardware dal 2014 a oggi: vedi la sezione
> **«App bancarie, attestazione e le due destinazioni»** nel [README](../README.md).

---

## 7. Checklist per il salto app → ROM

- [ ] Chiave di **firma di piattaforma** del ROM (o Pixel con AVB personalizzato).
- [ ] Copiare `system/privapp-permissions-novaos.xml` in `/system/etc/permissions/`.
- [ ] NovaOS in `priv-app/`, impostato Home via overlay `config_defaultHome`.
- [ ] Ritocco **SELinux** per la scrittura dei secure settings da app di sistema.
- [ ] Flashare **solo `system`**; lasciare **`vendor`/`boot`** originali.
- [ ] Decidere se includere installer APK + cassetto "App Android".
- [ ] Verificare in Impostazioni → Rete la scritta «✓ Sistema integrato».

Il codice è **già a prova di ROM**: i toggle diretti si attivano da soli quando i
permessi privilegiati risultano concessi. Nessuna riscrittura dell'interfaccia.

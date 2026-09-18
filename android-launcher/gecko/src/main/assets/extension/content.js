/* ============================================================
   NovaOS — ponte pagina ↔ nativo sotto GeckoView (fase 2)

   PERCORSO COMPLETO

     pagina → stub → (postMessage) → content script
            → (sendMessage) → background → (sendNativeMessage) → Java

   Tre salti, e nessuno è aggirabile. Ognuno risolve un vincolo
   diverso, verificato il 2026-09-18:

   1. STUB INIETTATO perché il content script NON può scrivere
      window.NovaNative per la pagina. I content script di Firefox
      girano in un mondo isolato (Xray vision): una proprietà scritta
      su `window` da lì resta invisibile agli script della pagina.
      Il sintomo era esatto: il content script girava, le sonde
      arrivavano al nativo, ma bridge.js non vedeva NovaNative,
      `has()` era falso e il dock apriva il browser vecchio.
      Perciò lo stub viene inserito come <script> nella pagina, dove
      È codice della pagina, e parla con postMessage.

   2. postMessage perché lo stub di pagina non ha browser.runtime:
      non è un content script, è la pagina. Il canale è postMessage
      con un marcatore riconoscibile e il controllo su event.source.

   3. sendMessage → background perché il content script non può
      chiamare direttamente il nativo: sendNativeMessage da lì non
      arriva al MessageDelegate (la promessa non si risolve né si
      rifiuta). Solo l'ambiente dell'estensione lo raggiunge, quindi
      il background fa da relay.

   QUALI METODI ESPONE

   Dei 53 metodi del contratto (shell/js/bridge.js) qui compaiono
   SOLO i 28 fire-and-forget. I getter e le richiesta/risposta
   restituiscono un valore che la pagina legge subito, e un messaggio
   non può darlo: esponendoli, `has()` risulterebbe vero e la shell
   leggerebbe undefined — un guasto silenzioso. Non esponendoli,
   `has()` è falso e la shell ripiega su cache e simulazione, che è
   il degrado progettato. Diventeranno asincroni in fase 3.

   run_at: document_start è obbligatorio — lo stub deve precedere
   bridge.js, che cattura window.NovaNative una volta sola.
   ============================================================ */
(() => {
  "use strict";

  // I 28 comandi fire-and-forget, esattamente i "cmd" di CONTRACT in shell/js/bridge.js.
  const COMANDI = [
    "call", "sms", "sendSms", "vibrate", "toast",
    "callAnswer", "callHangup", "callMute", "callSpeaker", "callDtmf",
    "requestDialerRole", "requestMic", "openAppSettings", "openBrowser",
    "shareImage", "shareFile", "shareText", "openSetting",
    "installUpdate", "screenshot",
    "shellStageBegin", "shellReset",
    "mailConfigure", "mailClear", "mailSend", "mailFetch",
    "prefSet", "prefDel",
  ];

  // I getter sincroni di CONTRACT che questa spike sa leggere davvero. Lo stub li
  // espone restituendo l'ultimo stato ricevuto dal nativo (vedi inviaStatoAllaShell).
  //
  // PERCHÉ ESPORLI, e non lasciarli solo nella cache di bridge.js:
  //   has(n) è `CONTRACT[n] && raw && typeof raw[n] === "function"`. Se lo stub non
  //   espone il getter, has() è falso: get() ripiega sulla cache e il valore arriva
  //   — ma i punti della shell che scrivono `has("micDiag") ? micDiag() : default`
  //   prendono il DEFAULT e non leggono mai la cache, perché has() è falso. Con
  //   micDiag il default è "granted", quindi la shell credeva di avere il permesso
  //   mentre il nativo diceva "blocked".
  //   Esponendoli, has() torna vero come sotto WebView (dove tutti i 53 metodi
  //   esistono davvero), e get() chiama lo stub, che risponde con il valore vero.
  //
  // Il valore è null finché lo stato non arriva (a pagina caricata): null è il
  // default che i chiamanti già trattano come "non noto", quindi la finestra fra
  // document_start e load è innocua.
  //
  // NON sono qui: i 14 comandi di richiesta/risposta (audioRec*, saveDownload,
  // setWifi…): quelli devono restituire una Promise, e un metodo esposto che
  // risponde undefined li farebbe sembrare falliti invece che "non noti".
  // Né prefGet/prefKeys: con has() vero partirebbe la migrazione una tantum di
  // os.js, che copierebbe la localStorage verso un nativo che non ha preferenze.
  const GETTER = [
    "sensorStates", "appVersion", "mailAccount", "isDialer", "currentCallState",
    "micGranted", "micDiag", "batteryLevel", "micReady", "privileged", "shellSource",
  ];

  const MARCA = "__novaGeo";

  // Marca distinta per il verso opposto. Due marche e non una perché i due
  // listener convivono nella stessa pagina: con una sola, il messaggio di
  // ritorno verrebbe rispedito al nativo all'infinito.
  const MARCA_RITORNO = "__novaGeoDalNativo";

  // ---- 1. stub nel contesto della pagina ----
  // Scritto come sorgente testuale e inserito con <script>: è l'unico modo di
  // mettere una proprietà su window che gli script della pagina vedano.
  // Se non parte (CSP restrittiva, per esempio), la shell degrada in simulazione
  // esattamente come sotto WebView senza nativo.
  //
  // Lo stub fa TRE cose:
  //   uscita  — definisce window.NovaNative: i comandi postano verso il nativo,
  //             i getter rispondono con l'ultimo stato ricevuto;
  //   ritorno — ascolta i messaggi del nativo e li consegna a window.NovaMsg,
  //             il dispatcher che la shell usa già per call.update, dial, back…
  //             (shell/js/bridge.js). Da lì in poi la shell non sa e non deve
  //             sapere se il messaggio arriva da WebView o da GeckoView;
  //   stato   — a pagina caricata chiede lo stato al nativo (__pagina_pronta) e lo
  //             tiene in `stato`, che è ciò che i getter restituiscono.
  //
  // Un template literal e non una concatenazione: a questa lunghezza le virgolette
  // sfuggite diventano illeggibili e sbagliarle costa un giro di build.
  const sorgenteStub = `(() => {
  const C = ${JSON.stringify(COMANDI)};
  const G = ${JSON.stringify(GETTER)};
  const MARCA = ${JSON.stringify(MARCA)};
  const RITORNO = ${JSON.stringify(MARCA_RITORNO)};
  const stato = {};

  const ponte = {};
  for (const n of C) {
    ponte[n] = (...a) => {
      try { window.postMessage({ [MARCA]: { nova: n, args: a } }, "*"); } catch (e) {}
    };
  }
  for (const n of G) {
    ponte[n] = () => (n in stato ? stato[n] : null);
  }
  window.NovaNative = ponte;

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || !d[RITORNO]) return;
    const m = d[RITORNO];

    if (m.evento === "shell.state") {
      const s = (m.args && m.args[0]) || {};
      Object.assign(stato, s);
      try {
        if (window.NovaBridge && window.NovaBridge.hydratePrefs) {
          window.NovaBridge.hydratePrefs(s);
        }
      } catch (e) { console.log("[nova-bridge] idratazione fallita: " + e); }
      console.log("[nova-bridge] stato ricevuto: " + Object.keys(s).join(","));
      // Autodiagnosi: non basta sapere che lo stato e' arrivato, bisogna sapere che la
      // SHELL lo legge. Queste tre righe interrogano NovaBridge esattamente come fa la
      // shell, quindi dicono se il giro e' chiuso o se si e' fermato a meta'.
      try {
        const NB = window.NovaBridge;
        if (!NB) { console.log("[nova-bridge] autodiagnosi: NovaBridge ASSENTE"); }
        else {
          console.log("[nova-bridge] autodiagnosi: has(micDiag)=" + NB.has("micDiag")
            + " micDiag=" + JSON.stringify(NB.micDiag())
            + " appVersion=" + JSON.stringify(NB.appVersion())
            + " isDialer=" + JSON.stringify(NB.isDialer()));
        }
      } catch (e) { console.log("[nova-bridge] autodiagnosi fallita: " + e); }
      return;
    }

    try {
      if (window.NovaMsg) {
        window.NovaMsg(m.evento, ...(m.args || []));
        console.log("[nova-bridge] consegnato alla pagina: " + m.evento);
      } else {
        console.log("[nova-bridge] NovaMsg assente: " + m.evento);
      }
    } catch (e) { console.log("[nova-bridge] consegna fallita: " + e); }
  });

  // A pagina caricata, non prima: bridge.js è eseguito e la shell ha già letto le
  // impostazioni. Lo stato serve alle app, che lo leggono quando si aprono.
  window.addEventListener("load", () => {
    try { window.postMessage({ [MARCA]: { nova: "__pagina_pronta", args: [location.href] } }, "*"); }
    catch (e) { console.log("[nova-bridge] richiesta di stato fallita: " + e); }
  });

  console.log("[nova-bridge] stub di pagina installato: " + C.length + " comandi, " + G.length + " getter");

  // Sonda: parte DAL CONTESTO DELLA PAGINA e attraversa tutti e tre i salti.
  // Se il nativo la registra in logcat, il ponte è in piedi per davvero — non
  // serve dedurlo, e non c'è modo di confonderla con una sonda del content script.
  // Da questa versione la sonda ha anche una RISPOSTA: il nativo risponde sulla
  // porta nativa, e se la risposta arriva fino a window.NovaMsg il ponte è
  // verificato in entrambi i versi con un solo gesto.
  window.postMessage({ [MARCA]: { nova: "__probe_stub", args: [location.href] } }, "*");
})();`;

  let iniettato = false;
  try {
    const s = document.createElement("script");
    s.textContent = sorgenteStub;
    (document.head || document.documentElement).appendChild(s);
    s.remove();                     // lo script è già stato eseguito all'inserimento
    iniettato = true;
  } catch (e) {
    console.log("[nova-bridge] stub non iniettato: " + e);
  }

  // ---- 2. relay verso il background ----
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || !d[MARCA]) return;
    try {
      browser.runtime.sendMessage(d[MARCA])
        .catch(e => console.log("[nova-bridge] inoltro fallito: " + e));
    } catch (e) {
      console.log("[nova-bridge] inoltro non disponibile: " + e);
    }
  });

  // ---- 3. porta verso il background, per la via di ritorno ----
  // `sendMessage` (sopra) è a senso unico. Per ricevere dal nativo serve una
  // porta persistente: il background la registra e ci copia dentro tutto ciò
  // che arriva dalla porta nativa. Da qui il messaggio rientra nella pagina con
  // window.postMessage, che è l'unico canale tra mondo isolato e pagina.
  try {
    const canale = browser.runtime.connect({ name: "nova-pagina" });
    canale.onMessage.addListener((messaggio) => {
      try {
        window.postMessage({ [MARCA_RITORNO]: messaggio }, "*");
      } catch (e) {
        console.log("[nova-bridge] ricaduta in pagina fallita: " + e);
      }
    });
  } catch (e) {
    console.log("[nova-bridge] canale verso il background non aperto: " + e);
  }

  // ---- 4. diagnostica ----
  // Solo console: il nativo la riporta in logcat (il content script gira in un
  // processo «Isolated Web Content», quindi le sue righe si riconoscono da lì).
  //
  // Qui c'era anche una fascia rossa disegnata nella pagina. È stata tolta per due
  // ragioni: copriva il dock e ne intercettava i tocchi — per un giro di prove il
  // ponte è sembrato rotto mentre funzionava — e a verifica conclusa non serve più.
  // Nota per chi la volesse reintrodurre: `pointer-events:none` è obbligatorio.
  //
  // Attenzione a una trappola: `typeof window.NovaNative` da QUI non dice nulla di
  // utile, perché questo è il mondo isolato e la proprietà scritta nella pagina non
  // si vede. La prova del ponte è la sonda __probe_stub, che parte dalla pagina e
  // che il nativo registra solo se tutti e tre i salti funzionano.
  console.log("[nova-bridge] content script agganciato a " + location.href
              + " · stub=" + iniettato);
})();

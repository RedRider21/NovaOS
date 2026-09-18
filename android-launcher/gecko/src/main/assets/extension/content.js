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
  // Lo stub fa DUE cose, una per verso:
  //   uscita — definisce window.NovaNative, che la shell interroga all'avvio;
  //   ritorno — ascolta i messaggi del nativo e li consegna a window.NovaMsg,
  //             il dispatcher che la shell usa già per call.update, dial, back…
  //             (shell/js/bridge.js). Da lì in poi la shell non sa e non deve
  //             sapere se il messaggio arriva da WebView o da GeckoView.
  const sorgenteStub = "(() => {"
    + "const C=" + JSON.stringify(COMANDI) + ";"
    + "const p={};"
    + "for (const n of C) p[n]=(...a)=>{try{window.postMessage({"
    + JSON.stringify(MARCA) + ":{nova:n,args:a}},"
    + "\"*\")}catch(e){}};"
    + "window.NovaNative=p;"
    + "window.addEventListener(\"message\",(ev)=>{"
    + "if(ev.source!==window)return;"
    + "const d=ev.data;"
    + "if(!d||!d[" + JSON.stringify(MARCA_RITORNO) + "])return;"
    + "const m=d[" + JSON.stringify(MARCA_RITORNO) + "];"
    + "try{if(window.NovaMsg){window.NovaMsg(m.evento,...(m.args||[]));"
    + "console.log(\"[nova-bridge] consegnato alla pagina: \"+m.evento);}"
    + "else console.log(\"[nova-bridge] NovaMsg assente: \"+m.evento);}"
    + "catch(e){console.log(\"[nova-bridge] consegna fallita: \"+e);}"
    + "});"
    + "console.log(\"[nova-bridge] stub di pagina installato: \"+C.length+\" comandi\");"
    // Sonda: parte DAL CONTESTO DELLA PAGINA e attraversa tutti e tre i salti.
    // Se il nativo la registra in logcat, il ponte è in piedi per davvero — non
    // serve dedurlo, e non c'è modo di confonderla con una sonda del content script.
    // Da questa versione la sonda ha anche una RISPOSTA: il nativo risponde sulla
    // porta nativa, e se la risposta arriva fino a window.NovaMsg il ponte è
    // verificato in entrambi i versi con un solo gesto.
    + "window.postMessage({" + JSON.stringify(MARCA)
    + ":{nova:\"__probe_stub\",args:[location.href]}},\"*\");"
    + "})();";

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

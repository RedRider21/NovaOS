/* ============================================================
   NovaOS — inoltro dei comandi dal content script al nativo

   PERCHÉ ESISTE QUESTO RELAY (verificato il 2026-09-18)

   Il content script non può parlare direttamente al nativo. Dalla
   pagina servita via http il content script si inietta e vede
   browser.runtime, ma `sendNativeMessage` da lì non arriva al
   MessageDelegate registrato in Java: la promessa non si risolve
   né si rifiuta, e il nativo non registra nulla. Vale anche per
   `sendMessage`, che senza un listener risponde «Receiving end
   does not exist».

   L'unico ambiente che raggiunge il nativo è quello dell'estensione
   (lo script di background): è la stessa via per cui passa la
   sonda d'avvio, che infatti risponde.

   Quindi il percorso completo è a tre salti:

     pagina → content script → background → nativo

   Il content script chiama `browser.runtime.sendMessage`; questo
   file ascolta e rilancia con `sendNativeMessage("browser", …)`,
   che è il nome con cui MainActivity ha registrato il delegate.

   LA VIA DI RITORNO (nativo → pagina), aggiunta il 2026-09-18

   `sendNativeMessage` è a senso unico: manda e riceve una risposta,
   ma non permette al nativo di parlare per primo. Per quello serve
   una PORTA: `browser.runtime.connectNative("browser")` apre un
   canale persistente, e in Java `MessageDelegate.onConnect` riceve
   l'oggetto `WebExtension.Port` con `postMessage(JSONObject)`.

   La porta nativa è però unica e il content script non la vede
   (gira in un mondo isolato, e `connectNative` da lì non raggiunge
   il nativo — stessa ragione del resto). Quindi il background fa da
   smistamento: tiene la porta nativa e una porta per ogni pagina,
   e copia i messaggi dall'una alle altre.

     nativo → background (porta nativa) → content script (porta
     "nova-pagina") → window.postMessage → stub nella pagina

   Lo stub consegna al dispatcher già esistente della shell,
   `window.NovaMsg(tipo, ...args)` (shell/js/bridge.js), che è la
   stessa porta da cui oggi entrano le chiamate sotto WebView.
   ============================================================ */
(() => {
  "use strict";

  // Le porte delle pagine aperte. Normalmente una sola (la shell), ma il Set
  // regge anche il caso di più schede o di un reload non ancora chiuso.
  const pagine = new Set();

  browser.runtime.onConnect.addListener((porta) => {
    if (porta.name !== "nova-pagina") return;
    console.log("[nova-bridge] pagina collegata alla porta");
    pagine.add(porta);
    porta.onDisconnect.addListener(() => {
      pagine.delete(porta);
      console.log("[nova-bridge] pagina scollegata dalla porta");
    });
  });

  // Apre la porta verso il nativo e ci resta attaccato. Se il nativo non ha
  // registrato un delegate (`onConnect`), connectNative lancia subito: è una
  // diagnosi immediata, non un fallimento silenzioso come sendNativeMessage.
  let portaNativa = null;
  try {
    portaNativa = browser.runtime.connectNative("browser");
    console.log("[nova-bridge] porta nativa aperta");

    portaNativa.onMessage.addListener((messaggio) => {
      console.log("[nova-bridge] dal nativo: " + JSON.stringify(messaggio));
      for (const p of pagine) {
        try {
          p.postMessage(messaggio);
        } catch (e) {
          console.log("[nova-bridge] smistamento fallito: " + e);
        }
      }
    });

    portaNativa.onDisconnect.addListener(() => {
      console.log("[nova-bridge] porta nativa chiusa: "
                  + (browser.runtime.lastError
                     ? browser.runtime.lastError.message : "senza errore"));
      portaNativa = null;
    });
  } catch (e) {
    console.log("[nova-bridge] porta nativa non apribile: " + e);
  }

  // Il ponte vero: ogni comando che arriva dalla pagina prosegue verso il nativo.
  // Il messaggio è già nella forma { nova, args } — non va toccato.
  browser.runtime.onMessage.addListener((messaggio) => {
    try {
      browser.runtime.sendNativeMessage("browser", messaggio)
        .catch(e => console.log("[nova-bridge] inoltro fallito: " + e));
    } catch (e) {
      console.log("[nova-bridge] inoltro non disponibile: " + e);
    }
    return Promise.resolve({ ok: true });
  });

  // Sonda d'avvio: prova che il canale nativo dal background è aperto. Serve a
  // distinguere «inoltro rotto» da «content script non iniettato» quando un
  // comando non arriva.
  try {
    browser.runtime.sendNativeMessage("browser", { nova: "__probe_bg", args: ["startup"] })
      .then(() => console.log("[nova-bridge] sonda nativa: risposta ricevuta"))
      .catch(e => console.log("[nova-bridge] sonda nativa fallita: " + e));
  } catch (e) {
    console.log("[nova-bridge] sonda nativa non disponibile: " + e);
  }
})();

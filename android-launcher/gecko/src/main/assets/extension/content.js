/* ============================================================
   NovaOS — shim del ponte per GeckoView (fase 2)

   Oggi MainActivity inietta window.NovaNative con
   addJavascriptInterface: un oggetto SINCRONO. Sotto Gecko quella
   API non esiste, quindi questo content script riespone lo stesso
   nome, ma ogni metodo è un INVIO DI MESSAGGIO: asincrono, senza
   valore di ritorno.

   Da qui la scelta di quali metodi esporre. Di tutti i 53 metodi
   del contratto (shell/js/bridge.js), qui compaiono SOLO i 28
   fire-and-forget. Perché:

     - i "cmd" non hanno un valore di ritorno da interpretare: la
       pagina chiama e prosegue. Il messaggio è la traduzione
       esatta di ciò che facevano.
     - i getter ("get") e le richiesta/risposta ("rr") restituiscono
       un valore che la pagina legge SUBITO. Un messaggio non può
       darlo. Se li esponessimo qui, bridge.js li considererebbe
       disponibili (`has()` è vero: sono funzioni) e leggerebbe
       `undefined` al posto del valore giusto — un guasto silenzioso.
       Non esponendoli, `has()` è falso e la shell ripiega su cache
       e simulazione, che è il degrado progettato.

   I getter diventano asincroni in fase 3, con la cache popolata
   all'avvio. Fino ad allora questa resta la ripartizione corretta.

   run_at: document_start è obbligatorio — bridge.js cattura
   window.NovaNative una volta sola, mentre si carica.
   ============================================================ */
(() => {
  "use strict";

  // I 28 comandi fire-and-forget, esattamente i "cmd" di CONTRACT
  // in shell/js/bridge.js. Se là cambia la tabella, cambia qui.
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

  const ponte = {};

  for (const nome of COMANDI) {
    ponte[nome] = (...args) => {
      // Come il try/catch che avvolgeva ogni chiamata diretta in bridge.js:
      // se il messaggio non parte, il comando risulta non inoltrato e il
      // chiamante prosegue con la simulazione.
      try {
        browser.runtime.sendMessage({ nova: nome, args });
      } catch (e) {
        /* niente nativo: la shell prosegue in simulazione */
      }
    };
  }

  window.NovaNative = ponte;
})();

/* ============================================================
   NovaOS — ponte unico pagina ↔ nativo (window.NovaBridge)

   Oggi il contenitore è la WebView Android: MainActivity inietta
   window.NovaNative (addJavascriptInterface) e i suoi metodi
   rispondono in modo SINCRONO. Domani (GeckoView) il ponte è a
   messaggi e asincrono. La shell non deve sapere quale dei due
   motori c'è sotto: chiama solo window.NovaBridge.

   REGOLA DI LETTURA (unica, vale per tutti i getter):
     se has(nome)            → raw[nome](...)    valore dal ponte, IDENTICO a prima
     altrimenti se in cache  → cache[nome]       solo quando il ponte sincrono manca
     altrimenti              → default del chiamante (null / "" / false)

   La cache non viene MAI letta finché il ponte sincrono è
   raggiungibile: in WebView l'equivalenza col comportamento
   precedente è per costruzione, non per fortuna. Non esiste alcuno
   snapshot "al boot": os.js costruisce lo stato a tempo di parsing
   (os.js:106) e alcuni getter sono vivi (sensorStates viene riletto
   a ogni renderQuick, currentCallState è pollato ogni 400 ms),
   quindi congelarli in cache sarebbe un cambiamento di comportamento.

   Questo file NON sovrascrive window.NovaNative: la proprietà
   iniettata da Java resta al suo posto e il design non dipende
   dalla sua scrivibilità.

   I push nativo → pagina passano da window.NovaMsg(tipo, ...):
   è la forma a messaggi del contratto. I globali storici
   (NovaCall, NovaDial, NovaMail, NovaBack, __novaShot, __novaMic,
   __novaMicResume) restano in piedi: la migrazione è additiva.
   ============================================================ */
window.NovaBridge = (() => {

  // ---- 1) cattura dell'oggetto iniettato da Java ----
  // __NovaNativeRaw è solo diagnostica: non è un'API da usare nella shell.
  const raw = (typeof window.NovaNative !== "undefined" && window.NovaNative) || null;
  window.__NovaNativeRaw = raw;

  // ---- 2) contratto del ponte ----
  // Elenco esplicito dei 53 metodi di MainActivity.NovaBridge, con la loro natura:
  //   "cmd" = comando fire-and-forget (il valore di ritorno è ignorato)
  //   "get" = getter sincrono, il valore viene letto subito dalla pagina
  //   "rr"  = richiesta/risposta: il risultato decide l'azione successiva
  // Non enumeriamo `raw` a runtime (i metodi iniettati non sono enumerabili ovunque):
  // questa tabella è la documentazione del contratto ed è la whitelist di has().
  const CONTRACT = {
    // comandi (fire-and-forget)
    call:"cmd", sms:"cmd", sendSms:"cmd", vibrate:"cmd", toast:"cmd",
    callAnswer:"cmd", callHangup:"cmd", callMute:"cmd", callSpeaker:"cmd", callDtmf:"cmd",
    requestDialerRole:"cmd", requestMic:"cmd", openAppSettings:"cmd", openBrowser:"cmd",
    shareImage:"cmd", shareFile:"cmd", shareText:"cmd", openSetting:"cmd",
    installUpdate:"cmd", screenshot:"cmd",
    shellStageBegin:"cmd", shellReset:"cmd",
    mailConfigure:"cmd", mailClear:"cmd", mailSend:"cmd", mailFetch:"cmd",
    prefSet:"cmd", prefDel:"cmd",
    // getter sincroni
    prefGet:"get", prefKeys:"get", sensorStates:"get", appVersion:"get",
    mailAccount:"get", isDialer:"get", currentCallState:"get",
    micGranted:"get", micDiag:"get",
    batteryLevel:"get", micReady:"get", privileged:"get", shellSource:"get",
    // richiesta / risposta
    audioRecStart:"rr", audioRecStop:"rr", saveDownload:"rr",
    setWifi:"rr", setBluetooth:"rr", setAirplane:"rr", setLocation:"rr",
    setNfc:"rr", setMobileData:"rr", setTorch:"rr",
    shellWrite:"rr", shellCommit:"rr",
  };

  // ---- 3) disponibilità PER METODO ----
  // Non "il nativo esiste": un APK vecchio può non avere un singolo metodo
  // (il codice attuale lo verifica già metodo per metodo, es. os.js:1651).
  const has = n => !!(CONTRACT[n] && raw && typeof raw[n] === "function");

  // ---- 4) cache: ripiego per quando il ponte sincrono non c'è ----
  // La scrivono solo il write-through di prefSet/prefDel e (domani) il
  // bootstrap del content script Gecko. La shell non la popola in lettura.
  const cache = Object.create(null);

  // Inoltro: SEMPRE raw[nome].apply(raw, …), mai la funzione estratta —
  // staccata dall'oggetto perderebbe il receiver attraverso il proxy iniettato.
  function call(n, args) { return raw[n].apply(raw, args); }
  function get(n, dflt) {
    if (has(n)) { try { return call(n, []); } catch (e) {} }
    if (n in cache) return cache[n];
    return dflt === undefined ? null : dflt;
  }
  function rr(n, args, dflt) {
    if (has(n)) { try { return call(n, args); } catch (e) {} }
    if (n in cache) return cache[n];
    return dflt === undefined ? null : dflt;
  }

  // ---- 5) preferenze: write-through sulla cache ----
  // prefGet restituisce la stringa JSON COSÌ COM'È (contratto Java: String|null):
  // il JSON.parse resta in store.get (os.js:33). Restituire qui un oggetto
  // farebbe fallire quel parse e TUTTE le impostazioni tornerebbero ai default.
  function prefGet(k) { if (has("prefGet")) { try { return call("prefGet", [k]); } catch (e) {} } return (k in cache) ? cache[k] : null; }
  function prefSet(k, v) {
    cache[k] = v;
    if (has("prefSet")) { try { call("prefSet", [k, v]); } catch (e) {} }
  }
  function prefDel(k) {
    delete cache[k];
    if (has("prefDel")) { try { call("prefDel", [k]); } catch (e) {} }
  }
  function prefKeys() {
    if (has("prefKeys")) { try { return call("prefKeys", []); } catch (e) {} }
    return JSON.stringify(Object.keys(cache));
  }

  // ---- 6) push nativo → pagina: un solo dispatcher ----
  // Risoluzione PIGRA del gestore a ogni chiamata: NovaCall è definito più avanti
  // (os.js:2273), NovaMail viene ridescritto a ogni render dell'app Mail e __novaMic
  // viene azzerato alla chiusura dell'app (apps.js:663, 4202).
  // Nessuna coda per gli eventi che arrivano prima del gestore: oggi Java fa
  // `window.NovaCall && NovaCall.update(...)` e l'evento si perde — accodarlo
  // sarebbe un cambiamento di comportamento.
  const MSG = {
    "call.update":   (state, number, name) => { const h = window.NovaCall; if (h && h.update) h.update(state, number, name); },
    "dial":          num => { if (window.NovaDial) window.NovaDial(num); },
    "back":          ()  => { if (window.NovaBack) window.NovaBack(); },
    "shell.shot":    d   => { if (window.__novaShot) window.__novaShot(d); },
    "mic.result":    ok  => { if (window.__novaMic) window.__novaMic(ok); },
    "mic.resume":    ()  => { if (window.__novaMicResume) window.__novaMicResume(); },
    "mail.onMessages": (folder, json) => { const h = window.NovaMail; if (h && h.onMessages) h.onMessages(folder, json); },
    "mail.onSent":   (ok, err) => { const h = window.NovaMail; if (h && h.onSent) h.onSent(ok, err); },
    "mail.onError":  err => { const h = window.NovaMail; if (h && h.onError) h.onError(err); },
  };
  function msg(tipo, ...a) {
    const h = MSG[tipo];
    if (!h) return false;
    try { h(...a); return true; } catch (e) { return false; }
  }
  if (!window.NovaMsg) window.NovaMsg = msg;   // il futuro shim può averlo già definito

  // ---- 7) bootstrap delle preferenze (predisposizione GeckoView) ----
  // Il content script Gecko dovrà iniettare window.__NOVA_PREFS a document_start,
  // PRIMA di questo file: os.js legge le preferenze a tempo di parsing (os.js:106),
  // quindi una cache riempita a DOMContentLoaded arriverebbe troppo tardi e il primo
  // boot perderebbe le impostazioni. In WebView quel ramo non viene mai eseguito.
  let prefsPending = false;
  if (window.__NOVA_PREFS && typeof window.__NOVA_PREFS === "object") {
    for (const k in window.__NOVA_PREFS) cache[k] = window.__NOVA_PREFS[k];
  } else if (!raw) {
    prefsPending = true;   // nessun ponte e nessun bootstrap: re-idratazione possibile
  }
  const readyCbs = [];
  function onPrefsReady(cb) { if (prefsPending) readyCbs.push(cb); else { try { cb(); } catch (e) {} } }
  function hydratePrefs(obj) {
    for (const k in obj) if (!(k in cache)) cache[k] = obj[k];
    prefsPending = false;
    readyCbs.splice(0).forEach(cb => { try { cb(); } catch (e) {} });
  }

  // ---- API pubblica ----
  return {
    has, CONTRACT, msg,
    // preferenze
    prefGet, prefSet, prefDel, prefKeys,
    get prefsPending() { return prefsPending; },
    onPrefsReady, hydratePrefs,
    // getter sincroni (default = null, come il ponte assente di oggi)
    sensorStates:     () => get("sensorStates"),
    appVersion:       () => get("appVersion"),
    mailAccount:      () => get("mailAccount"),
    isDialer:         () => get("isDialer"),
    currentCallState: () => get("currentCallState"),
    micGranted:       () => get("micGranted"),
    micDiag:          () => get("micDiag", "granted"),
    // richiesta/risposta — oggi valori sincroni, domani Promise (i chiamanti
    // usano `await` + confronto esplicito con true, quindi reggono entrambi)
    audioRecStart:  ()         => rr("audioRecStart", [], false),
    audioRecStop:   ()         => rr("audioRecStop", [], ""),
    saveDownload:   (name, b64) => rr("saveDownload", [name, b64], ""),
    shellWrite:     (rel, b64)  => rr("shellWrite", [rel, b64], false),
    shellCommit:    ()         => rr("shellCommit", [], false),
    // i toggle dei sensori restituiscono true/false/null: null = "esito non noto"
    // (solo col ponte a messaggi) → il chiamante non deve decidere nulla.
    setWifi:       on => rr("setWifi", [on], null),
    setBluetooth:  on => rr("setBluetooth", [on], null),
    setAirplane:   on => rr("setAirplane", [on], null),
    setLocation:   on => rr("setLocation", [on], null),
    setNfc:        on => rr("setNfc", [on], null),
    setMobileData: on => rr("setMobileData", [on], null),
    setTorch:      on => rr("setTorch", [on], null),
  };
})();

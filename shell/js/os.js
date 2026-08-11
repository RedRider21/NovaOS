/* ============================================================
   NovaOS — core della shell
   boot · blocco/sblocco (nessuno/scorrimento/PIN) · home ·
   window manager (app di sistema + web app di terze parti) ·
   status bar · centro notifiche · impostazioni di sistema · storage.
   ============================================================ */

const OS = (() => {

  const $ = s => document.querySelector(s);
  const screens = {
    boot: $("#boot"), lock: $("#lockscreen"), home: $("#home"), app: $("#app-view"),
  };

  // ---------------- storage ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("nova:"+k); return v===null?d:JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("nova:"+k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem("nova:"+k); } catch {} },
  };

  // ---------------- stato di sistema ----------------
  const defaults = {
    theme: "dark", wifi: true, bt: false, dnd: false, vibrate: true,
    battery: 82, saver: false, volume: 60,
    brightness: 100, textScale: 100, wallpaper: 0,
    lockType: "swipe",   // "none" | "swipe" | "pin"
    pin: "",             // PIN salvato (demo: in chiaro; in un SO reale sarebbe hash)
    autolock: 30,        // secondi (informativo)
    wifiName: "NovaNet",
    // rete / connettività
    airplane: false, mobileData: true, hotspot: false, nfc: true, location: true,
    // display
    autoRotate: true, adaptiveBright: true, screenTimeout: 30, refreshHigh: true,
    // audio (volumi separati)
    volRing: 70, volMedia: 60, volNotif: 50, volAlarm: 80,
    // notifiche
    notifLock: true, notifHistory: false, bubbles: true, batteryPercent: true, charging: false,
    // accessibilità
    boldText: false, highContrast: false, reduceMotion: false,
  };
  const state = Object.fromEntries(Object.keys(defaults).map(k => [k, store.get(k, defaults[k])]));

  // wallpaper: tinte semitrasparenti che sfumano sullo sfondo tema-aware,
  // così si adattano automaticamente a tema scuro e chiaro.
  const WALLS = [
    "radial-gradient(130% 80% at 50% 0%, rgba(60,95,165,.55) 0%, transparent 58%)",
    "linear-gradient(180deg, rgba(120,75,190,.5) 0%, transparent 60%)",
    "linear-gradient(180deg, rgba(20,130,150,.45) 0%, transparent 60%)",
    "linear-gradient(180deg, rgba(190,55,90,.45) 0%, transparent 60%)",
    "linear-gradient(160deg, rgba(45,150,80,.45) 0%, transparent 60%)",
    "linear-gradient(160deg, rgba(45,80,165,.5) 0%, transparent 60%)",
    "radial-gradient(120% 90% at 30% 10%, rgba(90,110,185,.5) 0%, transparent 60%)",
    "linear-gradient(180deg, rgba(130,130,150,.4) 0%, transparent 60%)",
  ];

  let currentApp = null;
  const activeIntervals = new Set();
  let notifId = 0;
  const notifs = [];

  // PIN input in corso
  let pinBuffer = "";
  let pinMode = "unlock";        // "unlock" | callback per impostazione
  let pinOnDone = null;

  // ============================================================
  //  registro app: sistema + utente (web app installate)
  // ============================================================
  function userApps() { return store.get("userApps", []); }
  function allApps() {
    return [...NovaApps.list, ...userApps().map(u => ({ ...u, web: true }))];
  }
  function appById(id) {
    return NovaApps.byId[id] || userApps().map(u=>({...u,web:true})).find(a => a.id === id);
  }
  function installApp({ name, url, color, icon }) {
    const list = userApps();
    const id = "web_" + Date.now();
    if (!/^https?:/.test(url)) url = "https://" + url;
    list.push({ id, name: name || url, url, color: color || "#6d8bff", icon: icon || "🌐" });
    store.set("userApps", list);
    return id;
  }
  function uninstallApp(id) { store.set("userApps", userApps().filter(a => a.id !== id)); }

  // ============================================================
  //  schermate / tema / display
  // ============================================================
  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
    $("#navbar").classList.toggle("show", name === "home" || name === "app");
  }

  function applyTheme() {
    document.body.dataset.theme = state.theme;
    $('meta[name="theme-color"]').setAttribute("content", state.theme==="dark" ? "#0b0f17" : "#eef1f7");
  }
  function applyDisplay() {
    document.documentElement.style.fontSize = (16 * state.textScale/100) + "px";
    $("#bright-overlay").style.opacity = String((100 - state.brightness) / 100 * 0.7);
    // il colore base viene dal tema (CSS var --bg); il wallpaper è solo la tinta sopra
    const w = WALLS[state.wallpaper] || WALLS[0];
    screens.home.style.backgroundColor = "var(--bg)";
    screens.home.style.backgroundImage = w;
    document.body.classList.toggle("a11y-bold", !!state.boldText);
    document.body.classList.toggle("a11y-contrast", !!state.highContrast);
    document.body.classList.toggle("a11y-reduce", !!state.reduceMotion);
  }

  // ============================================================
  //  status bar + orologi
  // ============================================================
  function renderStatusbars() {
    const d = new Date();
    const time = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
    const wifi = state.wifi ? `<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>` : "";
    document.querySelectorAll("[data-statusbar]").forEach(sb => {
      sb.innerHTML = `
        <span class="sb-left">${time}</span>
        <span class="sb-right">
          ${state.dnd ? "🌙" : ""} ${state.bt ? "🔵" : ""} ${wifi}
          <span class="sb-batt"><span class="sb-batt-shell"><span class="sb-batt-fill" style="width:${state.battery}%;background:${state.charging?'var(--ok)':(state.battery<20?'var(--danger)':'currentColor')}"></span></span>${state.charging?'⚡':''}${state.battery}%</span>
        </span>`;
    });
  }
  function renderClocks() {
    const d = new Date();
    const time = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
    const date = d.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
    document.querySelectorAll(".lock-time,.home-time").forEach(e => e.textContent = time);
    document.querySelectorAll(".lock-date,.home-date").forEach(e => e.textContent = date);
  }

  // ============================================================
  //  home
  // ============================================================
  function renderHome() {
    const grid = $("#app-grid"); grid.innerHTML = "";
    allApps().forEach((a, i) => grid.appendChild(iconEl(a, i)));
    const dock = $("#dock"); dock.innerHTML = "";
    NovaApps.dock.forEach((a, i) => dock.appendChild(iconEl(a, i)));
  }
  function iconEl(a, i) {
    const el = document.createElement("div");
    el.className = "app-icon";
    el.style.animationDelay = (i*0.02)+"s";
    // icona come immagine (favicon/upload) oppure emoji
    const isImg = /^(https?:|data:)/.test(a.icon || "");
    const glyph = isImg
      ? `<div class="glyph" style="background:${a.color};padding:0;overflow:hidden"><img src="${a.icon}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🌐'"></div>`
      : `<div class="glyph" style="background:${a.color}">${a.icon}</div>`;
    el.innerHTML = `${glyph}<div class="label">${a.name}</div>`;
    el.onclick = () => openApp(a.id);
    // long-press per disinstallare le web app utente
    if (a.web) {
      let t;
      const arm = () => t = setTimeout(() => {
        if (confirm(`Rimuovere "${a.name}"?`)) { uninstallApp(a.id); renderHome(); }
      }, 600);
      const dis = () => clearTimeout(t);
      el.addEventListener("touchstart", arm); el.addEventListener("touchend", dis); el.addEventListener("touchmove", dis);
      el.addEventListener("mousedown", arm); el.addEventListener("mouseup", dis); el.addEventListener("mouseleave", dis);
    }
    return el;
  }

  // ============================================================
  //  window manager
  // ============================================================
  function cleanupApp() {
    const frame = $("#app-frame");
    if (frame._cleanup) { try { frame._cleanup(); } catch {} frame._cleanup = null; }
  }
  function openApp(id) {
    const a = appById(id);
    if (!a) return;
    clearIntervals(); cleanupApp();
    currentApp = id;
    const frame = $("#app-frame");
    frame.innerHTML = ""; frame.scrollTop = 0;
    if (a.web) {
      const f = document.createElement("iframe");
      f.className = "web-frame"; f.src = a.url;
      f.setAttribute("allow", "camera;microphone;geolocation;fullscreen");
      frame.appendChild(f);
    } else {
      a.render(frame, api);
    }
    show("app");
    renderStatusbars();
  }
  function goHome() { clearIntervals(); cleanupApp(); currentApp = null; show("home"); renderHome(); renderClocks(); renderStatusbars(); }
  function goBack() { if (screens.app.classList.contains("active")) goHome(); }

  function interval(root, fn, ms) { const id = setInterval(fn, ms); activeIntervals.add(id); return id; }
  function clearIntervals() { activeIntervals.forEach(clearInterval); activeIntervals.clear(); }

  // ============================================================
  //  blocco / sblocco
  // ============================================================
  function lockDevice() {
    pinBuffer = ""; pinMode = "unlock"; pinOnDone = null;
    clearIntervals(); currentApp = null;
    show("lock");
    renderLockNotifs();
    setupLockUI();
  }
  function setupLockUI() {
    const usePin = state.lockType === "pin" && state.pin;
    $("#lock-hint").classList.toggle("hidden", usePin || state.lockType === "none");
    $("#pinpad").classList.toggle("hidden", !usePin);
    if (usePin) { $("#pin-label").textContent = "Inserisci il PIN"; $("#pin-label").classList.remove("err"); renderPinpad(); renderPinDots(); }
  }
  function renderPinpad() {
    const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
    $("#pin-keys").innerHTML = keys.map(k => k===""
      ? `<div></div>`
      : `<button class="pin-key ${k==='⌫'?'fn':''}" data-k="${k}">${k}</button>`).join("");
    $("#pin-keys").querySelectorAll("[data-k]").forEach(b => b.onclick = () => pinPress(b.dataset.k));
  }
  function renderPinDots(len = 4) {
    $("#pin-dots").innerHTML = Array.from({length:len}).map((_,i) =>
      `<div class="pin-dot ${i < pinBuffer.length ? 'on':''}"></div>`).join("");
  }
  function pinPress(k) {
    if (k === "⌫") { pinBuffer = pinBuffer.slice(0,-1); renderPinDots(); return; }
    if (pinBuffer.length >= 4) return;
    pinBuffer += k; renderPinDots();
    if (pinBuffer.length === 4) setTimeout(checkPin, 120);
  }
  function checkPin() {
    if (pinMode === "unlock") {
      if (pinBuffer === state.pin) { unlock(); }
      else { $("#pin-label").textContent = "PIN errato"; $("#pin-label").classList.add("err");
             $("#pinpad").animate([{transform:"translateX(0)"},{transform:"translateX(-8px)"},{transform:"translateX(8px)"},{transform:"translateX(0)"}],{duration:350});
             pinBuffer = ""; renderPinDots(); }
    } else if (typeof pinOnDone === "function") {
      const val = pinBuffer; pinBuffer = ""; renderPinDots();
      pinOnDone(val);
    }
  }
  function unlock() {
    if (state.lockType === "pin" && state.pin && pinBuffer !== state.pin && pinMode === "unlock") {
      // sblocco solo via PIN corretto (gestito da checkPin)
      return;
    }
    screens.lock.style.transform=""; screens.lock.style.opacity="";
    goHome();
  }

  // ============================================================
  //  notifiche + shade
  // ============================================================
  // vibrazione REALE: bridge nativo se presente, altrimenti Web Vibration API
  function vibrate(pattern) {
    if (!state.vibrate) return;
    if (window.NovaNative && window.NovaNative.vibrate) window.NovaNative.vibrate(Array.isArray(pattern)?pattern.reduce((a,b)=>a+b,0):pattern);
    else if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function notify({ app, title, text }) {
    const a = appById(app) || { icon:"🔔", color:"var(--accent)" };
    notifs.unshift({ id:++notifId, icon:a.icon, color:a.color, title, text, time:"ora" });
    renderNotifs();
    if (screens.lock.classList.contains("active")) renderLockNotifs();
    if (!state.dnd) { pulse(); vibrate(60); }
  }
  function renderNotifs() {
    const box = $("#shade-notifs");
    if (!notifs.length) { box.innerHTML = `<div class="shade-empty">Nessuna notifica</div>`; return; }
    box.innerHTML = notifs.map(notifHtml).join("");
    box.querySelectorAll(".notif").forEach((el,i) => el.onclick = () => { notifs.splice(i,1); renderNotifs(); });
  }
  function renderLockNotifs() { $("#lock-notifs").innerHTML = notifs.slice(0,4).map(notifHtml).join(""); }
  function notifHtml(n) {
    return `<div class="notif"><div class="n-ico" style="background:${n.color}">${n.icon}</div>
      <div style="flex:1"><div class="n-title">${n.title}</div><div class="n-text">${n.text}</div></div>
      <div class="n-time">${n.time}</div></div>`;
  }
  function pulse() { document.querySelectorAll("[data-statusbar] .sb-left").forEach(e => e.animate([{opacity:1},{opacity:.3},{opacity:1}], {duration:600})); }

  function renderQuick() {
    const q = [["wifi","📶","Wi-Fi"],["bt","🔵","Bluetooth"],["dnd","🌙","Non dist."],["theme","🎨","Tema"]];
    $("#shade-quick").innerHTML = q.map(([k,ic,l]) =>
      `<div class="quick ${quickOn(k)?'on':''}" data-q="${k}"><span class="q-ico">${ic}</span>${l}</div>`).join("");
    $("#shade-quick").querySelectorAll(".quick").forEach(el =>
      el.onclick = () => { toggle(el.dataset.q); el.classList.toggle("on", quickOn(el.dataset.q)); });
  }
  function quickOn(k) { return k==="theme" ? state.theme==="dark" : !!state[k]; }

  // ============================================================
  //  API stato (usata dalle app, es. Impostazioni)
  // ============================================================
  function set(k, v) { state[k] = v; store.set(k, v);
    if (k==="theme") applyTheme();
    if (["brightness","textScale","wallpaper","boldText","highContrast","reduceMotion"].includes(k)) applyDisplay();
    renderStatusbars();
  }
  function toggle(k) {
    if (k === "theme") { set("theme", state.theme==="dark"?"light":"dark"); }
    else set(k, !state[k]);
  }
  function factoryReset() {
    Object.keys(defaults).forEach(store.del); store.del("userApps"); store.del("notes");
    location.reload();
  }

  // ============================================================
  //  shade open/close + gesture
  // ============================================================
  function openShade() {
    renderQuick(); renderNotifs();
    $("#shade-time").textContent = new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
    $("#shade").classList.add("open"); $("#shade-scrim").classList.add("show");
  }
  function closeShade() { $("#shade").classList.remove("open"); $("#shade-scrim").classList.remove("show"); }

  function bindGestures() {
    // swipe-up di sblocco (solo se non è richiesto il PIN)
    let sy = null;
    const canSwipe = () => state.lockType !== "pin" || !state.pin;
    const start = y => { if (screens.lock.classList.contains("active") && canSwipe()) sy = y; };
    const move  = y => { if (sy===null) return; const dy = Math.min(0, y - sy);
      screens.lock.classList.add("dragging");
      screens.lock.style.transform = `translateY(${dy}px)`; screens.lock.style.opacity = String(1 + dy/500); };
    const end = y => { if (sy===null) return; const dy = y - sy;
      screens.lock.classList.remove("dragging"); screens.lock.style.transform=""; screens.lock.style.opacity="";
      if (dy < -80) unlock(); sy = null; };
    screens.lock.addEventListener("touchstart", e => start(e.touches[0].clientY));
    screens.lock.addEventListener("touchmove",  e => move(e.touches[0].clientY));
    screens.lock.addEventListener("touchend",   e => end(e.changedTouches[0].clientY));
    screens.lock.addEventListener("mousedown",  e => start(e.clientY));
    window.addEventListener("mousemove", e => { if(sy!==null) move(e.clientY); });
    window.addEventListener("mouseup",   e => { if(sy!==null) end(e.clientY); });
    // click semplice = sblocca solo se non serve PIN
    screens.lock.addEventListener("click", e => { if (canSwipe() && !e.target.closest("#pinpad")) unlock(); });

    // shade dalla status bar
    let ty = null;
    document.querySelectorAll("[data-statusbar]").forEach(z => {
      z.addEventListener("touchstart", e => ty = e.touches[0].clientY);
      z.addEventListener("touchmove",  e => { if(ty!==null && e.touches[0].clientY-ty > 40){ openShade(); ty=null; } });
      z.addEventListener("click", () => openShade());
    });
    $("#shade-scrim").addEventListener("click", closeShade);
    // rotellina impostazioni nella tendina (come Android)
    $("#shade-settings").addEventListener("click", () => { closeShade(); openApp("settings"); });
    let cy=null;
    $("#shade").addEventListener("touchstart", e => cy = e.touches[0].clientY);
    $("#shade").addEventListener("touchmove",  e => { if(cy!==null && cy-e.touches[0].clientY > 40){ closeShade(); cy=null; } });

    document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
      const n = b.dataset.nav;
      if (n==="home") { if (screens.app.classList.contains("active")) goHome(); }
      else if (n==="back") goBack();
      else if (n==="recents") openShade();
    });
  }

  // hook per il tasto Indietro fisico di Android (chiamato dal launcher)
  window.NovaBack = () => {
    if ($("#shade").classList.contains("open")) { closeShade(); return; }
    if (screens.app.classList.contains("active")) { goBack(); return; }
  };

  // ============================================================
  //  boot
  // ============================================================
  // ---- batteria REALE (Web Battery API) ----
  function initBattery() {
    if (!navigator.getBattery) return;                 // fallback: valore simulato
    navigator.getBattery().then(b => {
      const upd = () => { state.battery = Math.round(b.level*100); state.charging = b.charging; renderStatusbars(); };
      upd();
      b.addEventListener("levelchange", upd);
      b.addEventListener("chargingchange", upd);
    }).catch(()=>{});
  }

  // ---- sveglie REALI: suonano all'orario impostato ----
  let lastAlarmKey = "";
  function initAlarms() {
    const check = () => {
      const d = new Date();
      const hhmm = String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
      const key = d.toDateString()+" "+hhmm;
      if (key === lastAlarmKey) return;
      const a = store.get("alarms", []).find(x => x.on && x.time === hhmm);
      if (a) { lastAlarmKey = key; ringAlarm(hhmm); }
    };
    setInterval(check, 10000); check();
  }
  function ringAlarm(time) {
    if (state.vibrate && navigator.vibrate) navigator.vibrate([400,200,400,200,600]);
    let ctx, beepInt;
    try {
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      const beep = () => { const osc=ctx.createOscillator(), g=ctx.createGain();
        osc.frequency.value=880; osc.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.4); osc.start(); osc.stop(ctx.currentTime+0.45); };
      beep(); beepInt = setInterval(beep, 800);
    } catch {}
    const ov = document.createElement("div");
    ov.className = "alarm-ring";
    ov.innerHTML = `<div class="ar-time">${time}</div><div class="ar-label">⏰ Sveglia</div>
      <div class="ar-actions"><button id="ar-snooze">Posponi 5 min</button><button id="ar-stop">Ferma</button></div>`;
    $("#device").appendChild(ov);
    const stop = () => { if(beepInt) clearInterval(beepInt); try{ctx&&ctx.close();}catch{}; if(navigator.vibrate) navigator.vibrate(0); ov.remove(); };
    ov.querySelector("#ar-stop").onclick = stop;
    ov.querySelector("#ar-snooze").onclick = () => {
      stop();
      const d = new Date(Date.now()+5*60000);
      const t = String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
      const al = store.get("alarms", []); al.push({ id:Date.now(), time:t, on:true, snooze:true }); store.set("alarms", al);
    };
    notify({ app:"clock", title:"Sveglia", text:time+" — è ora!" });
  }

  function boot() {
    applyTheme(); applyDisplay();
    show("boot");
    renderStatusbars(); renderClocks(); renderNotifs(); renderQuick();
    initBattery(); initAlarms();
    setTimeout(() => {
      notifs.push(
        { id:++notifId, icon:"💬", color:"#34c759", title:"Anna", text:"Ci vediamo alle 18?", time:"16:04" },
        { id:++notifId, icon:"⚙️", color:"#5a6473", title:"NovaOS", text:"Benvenuto! Sistema pronto.", time:"ora" },
      );
      renderNotifs();
    }, 100);
    setInterval(() => { renderClocks(); renderStatusbars(); }, 1000);
    setTimeout(() => lockDevice(), 2600);
  }

  // ============================================================
  //  archivio foto (IndexedDB) — usato da Fotocamera e Galleria
  // ============================================================
  const photos = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("nova-photos", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("ph", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    // NB: la transazione va creata e usata SINCRONICAMENTE (nessun await in mezzo),
    // altrimenti IndexedDB la chiude e le operazioni falliscono.
    return {
      async add(dataURL) {
        const db = await open();
        return new Promise((res, rej) => {
          const item = { id: Date.now()+"_"+Math.random().toString(36).slice(2,7), data: dataURL, ts: Date.now() };
          const t = db.transaction("ph", "readwrite");
          t.objectStore("ph").add(item);
          t.oncomplete = () => res(item);
          t.onerror = () => rej(t.error);
        });
      },
      async all() {
        const db = await open();
        return new Promise((res, rej) => {
          const req = db.transaction("ph", "readonly").objectStore("ph").getAll();
          req.onsuccess = () => res((req.result||[]).sort((a,b)=>b.ts-a.ts));
          req.onerror = () => rej(req.error);
        });
      },
      async remove(id) {
        const db = await open();
        return new Promise((res, rej) => {
          const t = db.transaction("ph", "readwrite");
          t.objectStore("ph").delete(id);
          t.oncomplete = () => res();
          t.onerror = () => rej(t.error);
        });
      },
    };
  })();

  // API esposta alle app
  const api = {
    state, store, notify, toggle, set, interval, openApp, goHome, lockDevice, factoryReset,
    WALLS, photos, vibrate,
    // gestione app di terze parti
    installApp, uninstallApp, userApps,
    // impostazione PIN: chiede due volte tramite pinpad sul lockscreen non serve qui,
    // le app la gestiscono con input diretti (vedi Impostazioni)
    get theme(){ return state.theme; },
  };

  return { boot, bindGestures, api };
})();

window.addEventListener("DOMContentLoaded", () => {
  OS.bindGestures();
  OS.boot();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
});

/* ============================================================
   NovaCall — schermata di chiamata dentro NovaOS.
   L'InCallService nativo chiama window.NovaCall.update(stato, numero, nome).
   I pulsanti richiamano window.NovaNative.call* per pilotare la telefonata.
   ============================================================ */
window.NovaCall = (() => {
  let ov = null, t0 = 0, timer = null, muted = false, spk = false;
  const N = () => window.NovaNative || {};

  // risolve il contatto dalla rubrica in base al numero
  function resolve(number) {
    const digits = (number || "").replace(/\D/g, "");
    let name = "", photo = null;
    if (digits.length >= 6) {
      const contacts = (OS.api.store.get("contacts", []) || []);
      const c = contacts.find(x => {
        const cd = (x.phone || "").replace(/\D/g, "");
        return cd.length >= 6 && (cd.endsWith(digits.slice(-9)) || digits.endsWith(cd.slice(-9)));
      });
      if (c) { name = c.name; photo = c.photo || null; }
    }
    return { name, photo, number: number || "Sconosciuto" };
  }
  const initials = n => n.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
  const colorOf = n => `hsl(${[...n].reduce((s,c)=>s+c.charCodeAt(0),0)%360} 55% 45%)`;

  function build() {
    ov = document.createElement("div");
    ov.className = "call-ov";
    const keys = ["1","2","3","4","5","6","7","8","9","*","0","#"];
    ov.innerHTML = `
      <div class="call-top">
        <div class="call-avatar" id="call-av">👤</div>
        <div class="call-num">Chiamata</div>
        <div class="call-state">…</div>
      </div>
      <div class="call-dtmf" id="call-dtmf">
        <div class="call-dtmf-disp" id="call-dtmf-disp"></div>
        <div class="call-dtmf-keys">${keys.map(k=>`<button data-dtmf="${k}">${k}</button>`).join("")}</div>
        <button class="call-dtmf-close" id="call-dtmf-close">Nascondi tastierino</button>
      </div>
      <div class="call-controls">
        <button class="call-c" data-c="mute"><span>🔇</span>Muto</button>
        <button class="call-c" data-c="keypad"><span>⠿</span>Tastierino</button>
        <button class="call-c" data-c="speaker"><span>🔊</span>Vivavoce</button>
      </div>
      <div class="call-actions">
        <button class="call-answer" data-c="answer">📞</button>
        <button class="call-hangup" data-c="hangup">📞</button>
      </div>`;
    (document.querySelector("#device") || document.body).appendChild(ov);
    ov.querySelector('[data-c="answer"]').onclick  = () => N().callAnswer && N().callAnswer();
    ov.querySelector('[data-c="hangup"]').onclick  = () => { if (N().callHangup) N().callHangup(); else close(); };
    ov.querySelector('[data-c="mute"]').onclick    = e => { muted=!muted; e.currentTarget.classList.toggle("on",muted); N().callMute && N().callMute(muted); };
    ov.querySelector('[data-c="speaker"]').onclick = e => { spk=!spk; e.currentTarget.classList.toggle("on",spk); N().callSpeaker && N().callSpeaker(spk); };
    ov.querySelector('[data-c="keypad"]').onclick  = () => ov.classList.toggle("dtmf-open");
    ov.querySelector('#call-dtmf-close').onclick   = () => ov.classList.remove("dtmf-open");
    const disp = ov.querySelector("#call-dtmf-disp");
    ov.querySelectorAll("[data-dtmf]").forEach(b => b.onclick = () => {
      disp.textContent += b.dataset.dtmf;
      if (N().callDtmf) N().callDtmf(b.dataset.dtmf);
      OS.api.vibrate(20);
    });
  }
  function setContact(number, name) {
    const info = name ? { name, photo:null, number } : resolve(number);
    const avEl = ov.querySelector("#call-av");
    if (info.photo) { avEl.textContent = ""; avEl.style.background = `#232c3d center/cover url('${info.photo}')`; }
    else if (info.name) { avEl.textContent = initials(info.name); avEl.style.background = colorOf(info.name); }
    else { avEl.textContent = "👤"; avEl.style.background = "#232c3d"; }
    ov.querySelector(".call-num").textContent = info.name || info.number;
  }
  function startTimer() {
    if (timer) return; t0 = Date.now();
    timer = setInterval(() => { const s = Math.floor((Date.now()-t0)/1000);
      ov.querySelector(".call-state").textContent = String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }, 1000);
  }
  function close() { if (timer){clearInterval(timer);timer=null;} if (ov){ov.remove();ov=null;} muted=false; spk=false; }
  function update(state, number, name) {
    if (state === "ended") { close(); return; }
    if (!ov) build();
    ov.dataset.state = state;
    setContact(number, name);
    const st = ov.querySelector(".call-state");
    if (state === "incoming")      st.textContent = "Chiamata in arrivo…";
    else if (state === "dialing")  st.textContent = "Chiamata in corso…";
    else if (state === "active")   startTimer();
  }
  return { update };
})();

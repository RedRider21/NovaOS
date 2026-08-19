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
  // Persistenza doppia: SharedPreferences native (se presente il bridge) + localStorage.
  // La localStorage della WebView su origine file:// NON è garantita tra i riavvii dell'app;
  // le preferenze native lo sono. Scrive su entrambe; legge prima dal nativo con fallback.
  const _prefs = () => window.NovaNative || {};
  const store = {
    get(k, d) {
      try {
        let v = null;
        if (_prefs().prefGet) { try { v = _prefs().prefGet("nova:"+k); } catch {} }
        if (v === null || v === undefined) v = localStorage.getItem("nova:"+k);
        return (v === null || v === undefined) ? d : JSON.parse(v);
      } catch { return d; }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      try { localStorage.setItem("nova:"+k, s); } catch {}
      try { if (_prefs().prefSet) _prefs().prefSet("nova:"+k, s); } catch {}
    },
    del(k) {
      try { localStorage.removeItem("nova:"+k); } catch {}
      try { if (_prefs().prefDel) _prefs().prefDel("nova:"+k); } catch {}
    },
  };
  // migrazione una tantum: porta nelle preferenze native le impostazioni finora salvate
  // solo in localStorage (così non si perdono al primo riavvio dopo l'aggiornamento).
  (function migratePrefs() {
    const nn = window.NovaNative;
    if (!nn || !nn.prefSet || !nn.prefGet) return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("nova:") === 0) {
          let ex = null; try { ex = nn.prefGet(k); } catch {}
          if (ex === null || ex === undefined) { try { nn.prefSet(k, localStorage.getItem(k)); } catch {} }
        }
      }
    } catch {}
  })();

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
    // audio (volumi separati) + suonerie/suoni selezionabili + suoni di sistema
    volRing: 70, volMedia: 60, volNotif: 50, volAlarm: 80,
    ringtone: "Nova", notifSound: "Goccia", alarmSound: "Radar", sysSounds: true,
    // notifiche
    notifLock: true, notifHistory: false, bubbles: true, batteryPercent: true, charging: false,
    notifApps: {},   // id app -> false = notifiche silenziate per quell'app
    // accessibilità
    boldText: false, highContrast: false, reduceMotion: false,
    // aspetto icone/desktop: stile "filled" (tessere colorate) o "outline" (contorno
    // monocromatico); colori personalizzati opzionali (vuoto = default del tema)
    iconStyle: "filled", deskColor: "", iconColor: "",
    // forma delle tessere icona (circle|squircle|square) e colore di risalto (accento/bordo)
    iconShape: "squircle", accentColor: "",
    // paradigma della home (launcher): "springboard" (griglia+dock, default) oppure
    // un launcher alternativo registrato (es. "list"). Vedi Launcher provider.
    launcher: "springboard",
    // immagine di sfondo (data URL JPEG ridimensionato). Vuoto = usa il gradiente/tinta.
    wallImage: "",
    // inquadratura dello sfondo: adattamento + zoom (%) + posizione (% orizz./vert.)
    wallFit: "cover", wallZoom: 100, wallPosX: 50, wallPosY: 50,
    // override icone per-app (id → emoji) applicato dai temi (.novatheme icons.map)
    iconMap: {},
    // torcia (flash) e protezione occhi (filtro luce blu)
    torch: false, eyeComfort: false,
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
  // notifiche REALI e persistenti: nascono solo da eventi effettivi (sveglie, posta,
  // conferme delle app). Sopravvivono al riavvio finché non vengono scartate.
  const notifs = store.get("notifs", []);
  let notifId = notifs.reduce((m,n)=>Math.max(m, n.id||0), 0);
  const saveNotifs = () => store.set("notifs", notifs.slice(0, 40));

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
  // icona effettiva di un'app: override del tema (state.iconMap) oppure quella di default.
  // SICUREZZA: l'icona viene inserita in innerHTML (ramo testo e attributo src). Un tema
  // importato è un file esterno non fidato: scartiamo i valori che contengono caratteri
  // capaci di uscire dal contesto HTML/attributo (< > " ' `). Emoji, data-URI SVG
  // percent-encoded, immagini base64 e URL https non ne contengono → restano validi.
  function safeIcon(v) { v = String(v == null ? "" : v); return /[<>"'`]/.test(v) ? "" : v; }
  function appIcon(a) {
    const ov = safeIcon(a && state.iconMap && state.iconMap[a.id]);
    return ov || safeIcon(a && a.icon) || "";
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
  // modifica una web app installata (nome, url, icona, colore)
  function updateApp(id, patch) {
    const list = userApps();
    const i = list.findIndex(a => a.id === id);
    if (i < 0) return;
    if (patch.url && !/^https?:/.test(patch.url)) patch.url = "https://" + patch.url;
    list[i] = { ...list[i], ...patch };
    store.set("userApps", list);
  }

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
    // dimensione testo: moltiplicatore globale usato da OGNI font-size via calc(...*--fscale)
    document.documentElement.style.setProperty("--fscale", String(state.textScale/100));
    // luminosità effettiva: risparmio energetico limita il massimo; la luminosità
    // adattiva attenua la sera/notte (effetti reali sull'overlay di luminosità).
    let eff = state.saver ? Math.min(state.brightness, 45) : state.brightness;
    if (state.adaptiveBright) { const h = new Date().getHours(); if (h >= 20 || h < 7) eff = Math.round(eff * 0.75); }
    $("#bright-overlay").style.opacity = String((100 - eff) / 100 * 0.7);
    // protezione occhi: velo ambra (più marcato di notte); indipendente dalla luminosità
    const eyeEl = $("#eye-overlay");
    if (eyeEl) eyeEl.style.opacity = state.eyeComfort ? "0.22" : "0";
    // il colore base viene dal tema (CSS var --bg); il wallpaper è solo la tinta sopra.
    // se l'utente ha scelto un colore di fondo, quello vince (tinta unita, niente wallpaper).
    // priorità sfondo: colore unito (deskColor) > immagine (wallImage) > gradiente tema.
    const w = WALLS[state.wallpaper] || WALLS[0];
    const desk = state.deskColor || "var(--bg)";
    screens.home.style.backgroundColor = desk;
    if (state.deskColor) {
      screens.home.style.backgroundImage = "none";
    } else if (state.wallImage) {
      screens.home.style.backgroundImage = `url("${state.wallImage}")`;
      // inquadratura: adattamento (riempi/adatta/zoom personalizzato) + posizione
      screens.home.style.backgroundSize =
        state.wallFit === "contain" ? "contain"
        : state.wallFit === "custom" ? `${state.wallZoom}%`
        : "cover";
      screens.home.style.backgroundPosition = `${state.wallPosX}% ${state.wallPosY}%`;
      screens.home.style.backgroundRepeat = "no-repeat";
    } else {
      screens.home.style.backgroundImage = w;
      screens.home.style.backgroundSize = "";
      screens.home.style.backgroundPosition = "";
    }
    // aspetto icone: stile e colori personalizzati (usati dal CSS via variabili)
    document.body.classList.toggle("icons-outline", state.iconStyle === "outline");
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--icon-color", state.iconColor || (state.theme==="dark" ? "#e8ecf4" : "#141a24"));
    rootStyle.setProperty("--icon-bg", state.deskColor || "var(--bg)");
    // forma delle tessere icona
    rootStyle.setProperty("--icon-radius", { circle:"50%", squircle:"28%", square:"12%" }[state.iconShape] || "28%");
    // colore di risalto (accento/bordo): se personalizzato sovrascrive il --accent del tema
    if (state.accentColor) rootStyle.setProperty("--accent", state.accentColor);
    else rootStyle.removeProperty("--accent");
    document.body.classList.toggle("a11y-bold", !!state.boldText);
    document.body.classList.toggle("a11y-contrast", !!state.highContrast);
    // riduci animazioni: attivo anche col risparmio energetico
    document.body.classList.toggle("a11y-reduce", !!state.reduceMotion || !!state.saver);
    document.body.classList.toggle("power-saver", !!state.saver);
  }

  // ============================================================
  //  status bar + orologi
  // ============================================================
  function renderStatusbars() {
    const d = new Date();
    const time = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
    const wifi = state.wifi ? `<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>` : "";
    const bt = state.bt ? `<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7.5 17 16.5l-5 4V3l5 4L7 16.5"/></svg>` : "";
    document.querySelectorAll("[data-statusbar]").forEach(sb => {
      sb.innerHTML = `
        <span class="sb-left">${time}</span>
        <span class="sb-right">
          ${state.dnd ? "🌙" : ""} ${bt} ${wifi}
          <span class="sb-batt"><span class="sb-batt-shell"><span class="sb-batt-fill" style="width:${state.battery}%;background:${state.charging?'var(--ok)':(state.battery<20?'var(--danger)':'currentColor')}"></span></span>${state.charging?'⚡':''}${state.batteryPercent===false?'':state.battery+'%'}</span>
        </span>`;
    });
  }
  function renderClocks() {
    const d = new Date();
    const time = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
    const date = d.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
    document.querySelectorAll(".lock-time,.home-time,.lc-clock").forEach(e => e.textContent = time);
    document.querySelectorAll(".lock-date,.home-date,.lc-date").forEach(e => e.textContent = date);
  }

  // ============================================================
  //  home
  // ============================================================
  // ============================================================
  //  Home a pagine + cartelle (modificabile solo in modalità edit)
  // ============================================================
  let homePage = 0, editing = false;
  const escH = s => (s==null?"":String(s)).replace(/[<>&"]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[c]));
  const dockIds = () => NovaApps.dock.map(a => a.id);
  const pageableIds = () => { const d = dockIds(); return allApps().map(a=>a.id).filter(id => !d.includes(id)); };

  // ricostruisce/normalizza il layout a SLOT FISSI (16 per pagina): ogni pagina è
  // un array di lunghezza PER dove ogni cella è un elemento (app/cartella) oppure
  // null (slot vuoto). Così le icone restano dove le posizioni, con spazi liberi.
  // Rimuove app sparite, dissolve cartelle <2, colloca le app nuove nel primo slot
  // libero, elimina le pagine del tutto vuote e migra il vecchio formato "denso".
  const PER = 16;
  const blankPage = () => new Array(PER).fill(null);
  function homeLayout() {
    const ids = pageableIds(); const idset = new Set(ids);
    const placed = new Set();
    const normItem = it => {
      if (!it) return null;
      if (it.t === "folder") {
        const items = (it.items||[]).filter(id => idset.has(id) && !placed.has(id));
        items.forEach(id => placed.add(id));
        if (items.length >= 2) return { t:"folder", name: it.name||"Cartella", items };
        if (items.length === 1) return { t:"app", id: items[0] };
        return null;
      }
      if (it.t === "app" && idset.has(it.id) && !placed.has(it.id)) { placed.add(it.id); return { t:"app", id: it.id }; }
      return null;
    };
    let L = store.get("homeLayout", null);
    let pages;
    if (!L || !Array.isArray(L.pages)) {
      pages = [];
      for (let i=0;i<ids.length;i+=PER) { const pg = blankPage(); ids.slice(i,i+PER).forEach((id,j)=>{ pg[j]={t:"app",id}; placed.add(id); }); pages.push(pg); }
    } else {
      pages = L.pages.map(pg => {
        const slots = blankPage();
        (pg||[]).forEach((it,i) => { const n = normItem(it); if (!n) return;
          const idx = (i < PER && slots[i] === null) ? i : slots.indexOf(null);   // preserva la posizione (migra il formato denso)
          if (idx >= 0) slots[idx] = n; });
        return slots;
      });
    }
    // app nuove -> primo slot libero (aggiunge una pagina se tutte piene)
    const missing = ids.filter(id => !placed.has(id));
    missing.forEach(id => {
      let target = null;
      for (const pg of pages) { const f = pg.indexOf(null); if (f>=0) { target=[pg,f]; break; } }
      if (!target) { const pg = blankPage(); pages.push(pg); target=[pg,0]; }
      target[0][target[1]] = { t:"app", id };
    });
    // rimuovi le pagine del tutto vuote (tranne quella corrente in modifica, per poterne
    // aggiungere una col "+" e riempirla)
    pages = pages.filter((pg,i) => pg.some(Boolean) || (editing && i===homePage));
    if (!pages.length) pages = [blankPage()];
    return { pages };
  }
  const saveLayout = L => store.set("homeLayout", L);
  // primo slot libero in tutto il layout; se pieno, crea una pagina
  function placeFree(L, item) {
    for (const pg of L.pages) { const f = pg.indexOf(null); if (f>=0) { pg[f]=item; return; } }
    const pg = blankPage(); pg[0]=item; L.pages.push(pg);
  }

  // ============================================================
  //  Launcher provider: la home è un modulo intercambiabile. "springboard"
  //  (griglia + dock) è il paradigma predefinito, gestito inline più sotto.
  //  Altri launcher registrano una render(host) e ricevono il contesto tramite
  //  le funzioni di modulo (allApps/openApp). Un tema (novatheme/2) può scegliere
  //  il launcher via il campo layout.id. Le app non cambiano mai.
  // ============================================================
  const attrEsc = s => escH(s).replace(/"/g, "&quot;");
  // ordine personalizzato del launcher Lista (id app), persistito; le app nuove
  // non ancora ordinate finiscono in coda mantenendo l'ordine del registro.
  const launcherOrder = () => store.get("launcherOrder", []);
  function orderedApps() {
    const apps = allApps();
    const ord = launcherOrder();
    if (!ord.length) return apps;
    const byId = Object.fromEntries(apps.map(a => [a.id, a]));
    const head = ord.map(id => byId[id]).filter(Boolean);
    const seen = new Set(ord);
    return head.concat(apps.filter(a => !seen.has(a.id)));
  }
  function llRow(a) {
    const glyph = appGlyph(a, "ll-ic");
    return `<div class="ll-row" data-app="${a.id}" data-name="${attrEsc((a.name||"").toLowerCase())}">${glyph}<div class="ll-nm">${escH(a.name)}</div>
      <button class="ll-grip" aria-label="Trascina per riordinare"><span></span><span></span><span></span></button></div>`;
  }
  function renderListLauncher(host) {
    host.innerHTML = `<div class="launcher-list">
      <div class="ll-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <input id="ll-q" placeholder="Cerca app" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="ll-scroll no-sb" id="ll-scroll">
        ${orderedApps().map(llRow).join("")}
        <div class="ll-empty" id="ll-empty" style="display:none">Nessuna app trovata</div>
      </div></div>`;
    const q = host.querySelector("#ll-q");
    const scroll = host.querySelector("#ll-scroll");
    const empty = host.querySelector("#ll-empty");
    const filter = () => {
      const v = (q.value || "").trim().toLowerCase();
      let any = false;
      scroll.querySelectorAll(".ll-row").forEach(r => {
        const m = !v || (r.dataset.name || "").includes(v);
        r.style.display = m ? "" : "none"; if (m) any = true;
      });
      empty.style.display = any ? "none" : "";
      // il riordino ha senso solo senza filtro attivo
      scroll.classList.toggle("filtering", !!v);
    };
    if (q) q.addEventListener("input", filter);
    // apertura app: click sul corpo riga (non sulla maniglia)
    scroll.querySelectorAll(".ll-row").forEach(r => r.addEventListener("click", e => {
      if (e.target.closest(".ll-grip")) return;
      openApp(r.dataset.app);
    }));
    enableListReorder(scroll, empty);
  }
  // Riordino per trascinamento della maniglia (Pointer Events: mouse + touch).
  // La maniglia ha touch-action:none, così il resto della lista continua a scorrere.
  function enableListReorder(scroll, empty) {
    scroll.querySelectorAll(".ll-grip").forEach(grip => {
      grip.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        const row = grip.closest(".ll-row");
        try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        row.classList.add("ll-dragging"); scroll.classList.add("ll-reordering");
        try { vibrate(10); } catch (err) {}
        const move = ev => {
          const y = ev.clientY;
          const others = [...scroll.querySelectorAll(".ll-row:not(.ll-dragging)")];
          let target = null;
          for (const s of others) {
            const r = s.getBoundingClientRect();
            if (y < r.top + r.height / 2) { target = s; break; }
          }
          if (target) scroll.insertBefore(row, target);
          else scroll.insertBefore(row, empty);
          // autoscroll ai bordi
          const sr = scroll.getBoundingClientRect();
          if (y < sr.top + 40) scroll.scrollTop -= 8;
          else if (y > sr.bottom - 40) scroll.scrollTop += 8;
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          grip.removeEventListener("pointercancel", up);
          row.classList.remove("ll-dragging"); scroll.classList.remove("ll-reordering");
          const ids = [...scroll.querySelectorAll(".ll-row")].map(r => r.dataset.app);
          store.set("launcherOrder", ids);
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
        grip.addEventListener("pointercancel", up);
      });
    });
  }

  // categorie app (usate da drawer e cover per raggruppare/etichettare)
  const APP_CATS = {
    phone:"Comunicazione", messages:"Comunicazione", contacts:"Comunicazione", mail:"Comunicazione",
    camera:"Multimedia", gallery:"Multimedia", recorder:"Multimedia",
    notes:"Produttività", calendar:"Produttività", calc:"Produttività", files:"Produttività",
    browser:"Sistema", weather:"Sistema", clock:"Sistema", store:"Sistema", settings:"Sistema",
  };
  const CAT_ORDER = ["Comunicazione","Multimedia","Produttività","Sistema","Le tue app"];

  // glifo icona app (tessera colorata o immagine) per i launcher alternativi
  function appGlyph(a, cls, extra) {
    const ic = appIcon(a); const isImg = /^(https?:|data:)/.test(ic || "");
    return isImg
      ? `<div class="${cls}" style="background:${a.color};padding:0;overflow:hidden;${extra||""}"><img src="${ic}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🌐'"></div>`
      : `<div class="${cls}" style="background:${a.color};${extra||""}">${ic}</div>`;
  }

  // ---- Drawer: home minimale (orologio + scorciatoie) + menu laterale a scomparsa ----
  function renderDrawerLauncher(host, ctx) {
    const quick = ctx.dock.slice(0, 4);
    const cats = CAT_ORDER.filter(c => ctx.apps.some(a => (APP_CATS[a.id] || "Le tue app") === c));
    const panel = cats.map(c => `<div class="ll-cat">${c}</div>` +
      ctx.apps.filter(a => (APP_CATS[a.id] || "Le tue app") === c)
        .map(a => `<div class="lc-prow" data-app="${a.id}">${appGlyph(a, "ll-ic")}<div class="ll-nm">${escH(a.name)}</div></div>`).join("")).join("");
    host.innerHTML = `<div class="lc-drawer">
      <div class="lcd-main">
        <button class="lcd-burger" data-burger aria-label="Apri menu"><span></span><span></span><span></span></button>
        <div class="lc-clock lcd-clock"></div>
        <div class="lc-date lcd-date"></div>
        <div class="lcd-quick">${quick.map(a => `<div class="lcd-qc" data-app="${a.id}">${appIcon(a)}<small>${escH(a.name)}</small></div>`).join("")}</div>
      </div>
      <div class="lc-scrim" data-scrim></div>
      <div class="lc-panel no-sb">
        <div class="lc-panel-h"><div class="lc-logo">✦</div><b>NovaOS</b></div>
        ${panel}
      </div></div>`;
    const wrap = host.querySelector(".lc-drawer");
    host.querySelector("[data-burger]").onclick = () => wrap.classList.add("open");
    host.querySelector("[data-scrim]").onclick = () => wrap.classList.remove("open");
    host.querySelectorAll("[data-app]").forEach(el => el.onclick = () => openApp(el.dataset.app));
  }

  // ---- Tiles: riquadri colorati di misure diverse (stile Metro) ----
  function renderTilesLauncher(host, ctx) {
    const SIZE = { phone:"w2", camera:"h2", browser:"w2", clock:"", weather:"" };
    const cells = ctx.apps.map(a => {
      const big = a.id === "clock" ? `<div class="lc-clock lc-tbig"></div>`
                : a.id === "weather" ? `<div class="lc-tbig">22°</div>` : "";
      const ic = appIcon(a);
      return `<div class="lc-tile ${SIZE[a.id] || ""}" data-app="${a.id}" style="background:linear-gradient(150deg,${a.color},color-mix(in srgb,${a.color} 60%,#000))">
        <div class="lc-ti">${/^(https?:|data:)/.test(ic||"")?`<img src="${ic}" style="width:26px;height:26px;border-radius:6px;object-fit:cover">`:ic}</div>${big}<b>${escH(a.name)}</b></div>`;
    }).join("");
    host.innerHTML = `<div class="lc-tiles no-sb">${cells}</div>`;
    host.querySelectorAll("[data-app]").forEach(el => el.onclick = () => openApp(el.dataset.app));
  }

  // ---- Foglio "Tutte le app": cassetto a scomparsa dal basso (stile Android) ----
  //  Usato dai launcher-widget (es. Dashboard/Radiale) che non mostrano l'intero
  //  elenco. Apribile con un pulsante o con un TRASCINAMENTO reale verso l'alto:
  //  il cassetto segue il dito e si assesta aperto/chiuso al rilascio.
  //  buildAppSheet costruisce il DOM (chiuso); openAppSheet lo apre animato;
  //  enableDrawerDrag collega un trascinamento interattivo a una maniglia/area.

  // Costruisce il cassetto in stato "chiuso" e ritorna i controlli per pilotarlo.
  function buildAppSheet(ctx) {
    const host = $("#app-grid");
    const cells = ctx.apps.map(a => {
      const ic = appIcon(a);
      const g = /^(https?:|data:)/.test(ic || "")
        ? `<img src="${ic}" alt="">` : `<span class="lcs-em">${ic}</span>`;
      return `<div class="lcs-app" data-app="${a.id}"><div class="lcs-ic" style="--c:${a.color}">${g}</div><small>${escH(a.name)}</small></div>`;
    }).join("");
    const ov = document.createElement("div");
    ov.className = "lc-sheet";
    ov.innerHTML = `<div class="lcs-scrim"></div>
      <div class="lcs-card no-sb">
        <div class="lcs-grip"></div>
        <div class="lcs-h">Tutte le app</div>
        <div class="lcs-grid">${cells}</div>
      </div>`;
    host.appendChild(ov);
    const card = ov.querySelector(".lcs-card");
    const scrim = ov.querySelector(".lcs-scrim");
    let closing = false;
    const remove = () => { try { ov.remove(); } catch {} };
    // progress 0 = chiuso (in basso), 1 = aperto; pilota card e velo senza classi
    const setProgress = p => {
      p = Math.min(1, Math.max(0, p));
      card.style.transition = "none"; scrim.style.transition = "none";
      card.style.transform = `translateY(${(1 - p) * 100}%)`;
      scrim.style.opacity = String(p);
    };
    const settleOpen = () => {
      card.style.transition = ""; scrim.style.transition = "";
      card.style.transform = ""; scrim.style.opacity = "";
      ov.classList.add("open");
    };
    const close = () => {
      if (closing) return; closing = true;
      card.style.transition = ""; scrim.style.transition = "";
      ov.classList.remove("open");
      card.style.transform = "translateY(100%)"; scrim.style.opacity = "0";
      setTimeout(remove, 280);
    };
    scrim.onclick = close;
    ov.querySelectorAll("[data-app]").forEach(el => el.onclick = () => { close(); openApp(el.dataset.app); });
    // trascina la maniglia verso il basso per chiudere
    const grip = ov.querySelector(".lcs-grip");
    let gy = null;
    grip.addEventListener("pointerdown", e => { gy = e.clientY; try { grip.setPointerCapture(e.pointerId); } catch {} });
    grip.addEventListener("pointermove", e => { if (gy == null) return; const dy = e.clientY - gy; if (dy > 0) { card.style.transition = "none"; card.style.transform = `translateY(${dy}px)`; } });
    grip.addEventListener("pointerup", e => { if (gy == null) return; const dy = e.clientY - gy; gy = null; card.style.transition = ""; if (dy > 90) close(); else card.style.transform = ""; });
    return { ov, card, setProgress, settleOpen, close, get closing() { return closing; } };
  }

  // Apertura semplice (pulsante): costruisce e anima l'apertura.
  function openAppSheet(ctx) {
    const host = $("#app-grid");
    if (host.querySelector(".lc-sheet")) return; // già aperto
    const s = buildAppSheet(ctx);
    requestAnimationFrame(() => s.settleOpen());
  }

  // Collega un trascinamento verso l'alto: il cassetto nasce e segue il dito.
  //  el = area su cui iniziare il gesto; opts.fromBottom limita l'avvio alla
  //  parte bassa dell'area (per non interferire con i tocchi in alto).
  function enableDrawerDrag(el, ctx, opts) {
    opts = opts || {};
    let startY = null, startX = null, sheet = null, dragging = false, h = 1;
    el.addEventListener("pointerdown", e => {
      if ($("#app-grid").querySelector(".lc-sheet")) return;
      const r = el.getBoundingClientRect();
      if (opts.fromBottom && e.clientY < r.top + r.height * (1 - opts.fromBottom)) { startY = null; return; }
      startY = e.clientY; startX = e.clientX; h = r.height || window.innerHeight; dragging = false;
    });
    el.addEventListener("pointermove", e => {
      if (startY == null) return;
      const dy = startY - e.clientY;                 // positivo = verso l'alto
      const dx = Math.abs(e.clientX - startX);
      if (!dragging) {
        if (dy > 8 && dy > dx) {                      // gesto verticale verso l'alto
          if ($("#app-grid").querySelector(".lc-sheet")) { startY = null; return; } // già aperto/in apertura
          dragging = true;
          sheet = buildAppSheet(ctx);
          try { el.setPointerCapture(e.pointerId); } catch {}
        } else if (dx > 10 || dy < -8) {              // gesto orizzontale/in giù: annulla
          startY = null; return;
        }
      }
      if (dragging && sheet) sheet.setProgress(dy / (h * 0.55));
    });
    const end = e => {
      if (startY == null) { return; }
      const dy = startY - (e.clientY != null ? e.clientY : startY);
      startY = null;
      if (!dragging || !sheet) { dragging = false; sheet = null; return; }
      const vOpen = dy > h * 0.18;                    // soglia di assestamento
      if (vOpen) sheet.settleOpen(); else sheet.close();
      dragging = false; sheet = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ---- Dashboard: widget (orologio, meteo, recenti, preferite) ----
  function renderDashLauncher(host, ctx) {
    const recent = (ctx.recent.length ? ctx.recent : ctx.apps).slice(0, 4);
    const fav = ctx.dock.concat(appById("settings") ? [appById("settings")] : []).filter(Boolean).slice(0, 5);
    host.innerHTML = `<div class="lc-dash no-sb">
      <div class="lc-widget lc-wclock"><div class="lc-clock t"></div><div class="lc-date d"></div></div>
      <div class="lc-widget lc-wwx"><div class="lft"><div class="em">⛅</div><div><div style="font-size:calc(13px*var(--fscale,1))">Meteo</div><div style="color:var(--text-dim);font-size:calc(11px*var(--fscale,1))">Nubi sparse</div></div></div><div class="tp">22°</div></div>
      <div class="lc-widget"><div class="lc-wt">App recenti</div><div class="lc-wrow">${recent.map(a => `<div data-app="${a.id}">${appGlyph(a, "lc-wic")}</div>`).join("")}</div></div>
      <div class="lc-widget"><div class="lc-wt">Preferite</div><div class="lc-wrow" style="justify-content:space-around">${fav.map(a => `<div data-app="${a.id}">${appGlyph(a, "lc-wic")}</div>`).join("")}</div></div>
      <div class="lc-dash-hint" data-allapps><span class="lc-dash-chev"></span>Trascina in alto per tutte le app</div>
    </div>`;
    host.querySelectorAll("[data-app]").forEach(el => el.onclick = () => openApp(el.dataset.app));
    // la maniglia in basso: tap apre il cassetto…
    host.querySelector("[data-allapps]").onclick = () => openAppSheet(ctx);
    // …e il trascinamento verso l'alto dalla metà bassa della dashboard lo apre interattivo
    enableDrawerDrag(host.querySelector(".lc-dash"), ctx, { fromBottom: 0.5 });
  }

  // ---- Radiale: app in orbita attorno a un hub centrale ----
  function renderRadialLauncher(host, ctx) {
    const apps = ctx.apps.slice(0, 16);
    const inner = apps.slice(0, 6), outer = apps.slice(6, 16);
    const ring = (arr, R, d0) => arr.map((a, i) => {
      const ang = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(Math.cos(ang) * R), y = Math.round(Math.sin(ang) * R);
      const ic = appIcon(a);
      return `<div class="lc-ra" data-app="${a.id}" style="--x:${x}px;--y:${y}px;transform:translate(${x}px,${y}px);background:${a.color};animation-delay:${(d0 + i * 0.025).toFixed(3)}s">${/^(https?:|data:)/.test(ic||"")?`<img src="${ic}" style="width:26px;height:26px;border-radius:8px;object-fit:cover">`:ic}</div>`;
    }).join("");
    host.innerHTML = `<div class="lc-radial">
      <div class="lc-hub" data-allapps><div class="lc-clock t"></div><small>TUTTE</small></div>
      ${ring(inner, 66, 0)}${ring(outer, 116, 0.12)}
      <div class="lc-rlabel">Tocca l'hub o trascina in alto per tutte le app</div>
    </div>`;
    host.querySelectorAll("[data-app]").forEach(el => el.onclick = () => openApp(el.dataset.app));
    host.querySelector("[data-allapps]").onclick = () => openAppSheet(ctx);
    // trascinamento verso l'alto dalla metà bassa dell'area radiale (senza scroll che intralcia)
    enableDrawerDrag(host.querySelector(".lc-radial"), ctx, { fromBottom: 0.6 });
  }

  // ---- Cover flow: carosello orizzontale di grandi schede ----
  function renderCoverLauncher(host, ctx) {
    const cards = ctx.apps.map(a => { const ic = appIcon(a); return `<div class="lc-cv" data-app="${a.id}" style="background:linear-gradient(160deg,${a.color},color-mix(in srgb,${a.color} 45%,#000))">
      <div class="lc-cvi">${/^(https?:|data:)/.test(ic||"")?`<img src="${ic}" style="width:42px;height:42px;border-radius:12px;object-fit:cover">`:ic}</div>
      <b>${escH(a.name)}</b><small>${APP_CATS[a.id] || "App"}</small></div>`; }).join("");
    host.innerHTML = `<div class="lc-cover no-sb">${cards}</div>`;
    host.querySelectorAll("[data-app]").forEach(el => el.onclick = () => openApp(el.dataset.app));
  }

  // ============================================================
  //  Motore di layout a BLOCCHI (dichiarativo, per i temi)
  // ------------------------------------------------------------
  //  La home può essere composta da blocchi indipendenti descritti in un template
  //  JSON (nessun codice: sicuro anche per i temi importati). NovaOS ha UN renderer
  //  generico; lo Studio costruisce il template visualmente. I 7 launcher classici
  //  restano come "standard" a cui tornare. Un tema può portarsi il proprio layout
  //  (launcher "custom"): si importa, si esegue, si ripristina come i launcher veri.
  // ============================================================

  // ---- Blocco: indice alfabetico A-Z con scorrimento rapido (scrubber + bollicina) ----
  function blkAppIndex(el, ctx, params) {
    const apps = ctx.apps.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "it"));
    const groups = {};
    apps.forEach(a => { const L = (a.name || "#").charAt(0).toUpperCase(); (groups[L] = groups[L] || []).push(a); });
    const letters = Object.keys(groups).sort((a, b) => a.localeCompare(b, "it"));
    el.innerHTML = `
      <div class="ai-scroll no-sb">${letters.map(L =>
        `<div class="ai-hdr" data-letter="${attrEsc(L)}">${escH(L)}</div>` +
        groups[L].map(a => `<div class="ai-row blk-app" data-app="${a.id}" data-appname="${attrEsc((a.name || "").toLowerCase())}">${appGlyph(a, "ai-ic")}<span>${escH(a.name)}</span></div>`).join("")
      ).join("")}</div>
      <div class="ai-rail">${letters.map(L => `<span data-jump="${attrEsc(L)}">${escH(L)}</span>`).join("")}</div>
      <div class="ai-bubble"></div>`;
    const scroll = el.querySelector(".ai-scroll"), rail = el.querySelector(".ai-rail"), bubble = el.querySelector(".ai-bubble");
    el.querySelectorAll("[data-app]").forEach(r => r.onclick = () => openApp(r.dataset.app));
    const jumpTo = L => { const h = el.querySelector(`.ai-hdr[data-letter="${L}"]`); if (h) scroll.scrollTop = h.offsetTop - 4; };
    let bt = null;
    const showBubble = L => { bubble.textContent = L; bubble.classList.add("on"); clearTimeout(bt); bt = setTimeout(() => bubble.classList.remove("on"), 480); };
    const letterAt = y => { const r = rail.getBoundingClientRect(); const i = Math.min(letters.length - 1, Math.max(0, Math.floor((y - r.top) / (r.height / letters.length)))); return letters[i]; };
    let active = false;
    const at = y => { const L = letterAt(y); if (L) { jumpTo(L); showBubble(L); } };
    rail.addEventListener("pointerdown", e => { active = true; at(e.clientY); try { rail.setPointerCapture(e.pointerId); } catch {} });
    rail.addEventListener("pointermove", e => { if (active) at(e.clientY); });
    const off = () => { active = false; };
    rail.addEventListener("pointerup", off); rail.addEventListener("pointercancel", off);
  }
  // ---- Blocco: orologio + data (aggiornati da renderClocks via .lc-clock/.lc-date) ----
  function blkClock(el, ctx, params) {
    const big = params && params.size === "small" ? "blk-clock-sm" : "";
    el.innerHTML = `<div class="lc-clock blk-clock ${big}"></div><div class="lc-date blk-cdate"></div>`;
  }
  // ---- Blocco: ricerca che filtra le app dei blocchi elenco nella stessa home ----
  function blkSearch(el, ctx, params) {
    el.innerHTML = `<div class="blk-search"><span>${LGI.search}</span><input type="search" placeholder="Cerca app" aria-label="Cerca app"></div>`;
    const inp = el.querySelector("input");
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      const root = el.closest(".lc-blocks") || document;
      root.querySelectorAll(".blk-app").forEach(r => { r.style.display = (!q || (r.dataset.appname || "").indexOf(q) >= 0) ? "" : "none"; });
      // nasconde le intestazioni lettera senza righe visibili
      root.querySelectorAll(".ai-hdr").forEach(h => {
        let vis = false;
        for (let n = h.nextElementSibling; n && n.classList.contains("ai-row"); n = n.nextElementSibling) if (n.style.display !== "none") { vis = true; break; }
        h.style.display = vis ? "" : "none";
      });
    };
  }
  // ---- Blocco: griglia semplice di app (params.cols = 3..5) ----
  function blkAppGrid(el, ctx, params) {
    const cols = Math.min(5, Math.max(3, (params && params.cols) || 4));
    el.style.setProperty("--blk-cols", cols);
    el.innerHTML = `<div class="blk-grid no-sb">${ctx.apps.map(a =>
      `<div class="blk-gapp blk-app" data-app="${a.id}" data-appname="${attrEsc((a.name || "").toLowerCase())}">${appGlyph(a, "blk-gic")}<span>${escH(a.name)}</span></div>`).join("")}</div>`;
    el.querySelectorAll("[data-app]").forEach(r => r.onclick = () => openApp(r.dataset.app));
  }
  // ---- Blocco: dock delle preferite ----
  function blkDock(el, ctx, params) {
    el.innerHTML = `<div class="blk-dock">${ctx.dock.map(a => `<div data-app="${a.id}">${appGlyph(a, "blk-dic")}</div>`).join("")}</div>`;
    el.querySelectorAll("[data-app]").forEach(r => r.onclick = () => openApp(r.dataset.app));
  }
  const BLOCKS = { appindex: blkAppIndex, clock: blkClock, search: blkSearch, appgrid: blkAppGrid, dock: blkDock };

  // renderer generico: monta i blocchi del template nella home
  function renderBlockLayout(host, ctx, layout) {
    host.innerHTML = `<div class="lc-blocks no-sb"></div>`;
    const root = host.querySelector(".lc-blocks");
    (layout && Array.isArray(layout.blocks) ? layout.blocks : []).forEach(b => {
      const fn = b && BLOCKS[b.type]; if (!fn) return;
      const wrap = document.createElement("div");
      wrap.className = "blk blk-" + b.type;
      root.appendChild(wrap);
      try { fn(wrap, ctx, b.params || {}); } catch (e) {}
    });
  }
  // template del launcher predefinito "Indice A-Z" (usa il motore a blocchi)
  const INDEX_TEMPLATE = { engine: "blocks", blocks: [
    { type: "clock", params: { size: "small" } },
    { type: "search", params: {} },
    { type: "appindex", params: {} },
    { type: "dock", params: {} },
  ] };
  // applica il layout a blocchi di un tema (launcher "custom"): salva e attiva.
  function applyThemeLayout(layout) {
    if (!layout || !Array.isArray(layout.blocks)) return false;
    const safe = {
      engine: "blocks",
      name: safeIcon(layout.name) || "Tema personalizzato",
      blocks: layout.blocks.filter(b => b && BLOCKS[b.type]).map(b => ({ type: b.type, params: (b.params && typeof b.params === "object") ? b.params : {} })),
    };
    if (!safe.blocks.length) return false;
    store.set("customLayout", safe);
    set("launcher", "custom");
    return true;
  }

  // glifi per blocchi/launcher aggiuntivi
  const LGI = {
    search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  };

  // registro launcher: id + metadati (glifo SVG per la galleria in Impostazioni) + render
  const LG = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    list:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    drawer:'<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="5" y1="8" x2="7" y2="8"/><line x1="5" y1="11" x2="7" y2="11"/>',
    tiles:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    dash:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="12" width="10" height="9" rx="2"/><rect x="15" y="12" width="6" height="9" rx="2"/>',
    radial:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="4" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="20" cy="12" r="1.6"/><circle cx="6" cy="6" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
    cover:'<rect x="8" y="5" width="8" height="14" rx="1.6"/><rect x="2.5" y="8" width="4" height="8" rx="1.2" opacity=".6"/><rect x="17.5" y="8" width="4" height="8" rx="1.2" opacity=".6"/>',
    index:'<line x1="4" y1="6" x2="15" y2="6"/><line x1="4" y1="12" x2="15" y2="12"/><line x1="4" y1="18" x2="15" y2="18"/><circle cx="20" cy="5" r="1"/><circle cx="20" cy="9" r="1"/><circle cx="20" cy="13" r="1"/><circle cx="20" cy="17" r="1"/><circle cx="20" cy="21" r="1"/>',
    custom:'<rect x="3" y="3" width="18" height="5" rx="1.5"/><rect x="3" y="10" width="18" height="4" rx="1.5" opacity=".7"/><rect x="3" y="16" width="11" height="5" rx="1.5" opacity=".7"/>',
  };
  const LAUNCHERS = {
    springboard: { id:"springboard", name:"Griglia",     desc:"Icone a pagine + dock",       ic:LG.grid },
    list:        { id:"list",        name:"Lista",       desc:"Elenco con ricerca e riordino", ic:LG.list,   render: renderListLauncher },
    drawer:      { id:"drawer",      name:"Drawer",      desc:"Menu laterale a scomparsa",    ic:LG.drawer, render: renderDrawerLauncher },
    tiles:       { id:"tiles",       name:"Tiles",       desc:"Riquadri colorati",            ic:LG.tiles,  render: renderTilesLauncher },
    dash:        { id:"dash",        name:"Dashboard",   desc:"Widget + recenti",             ic:LG.dash,   render: renderDashLauncher },
    radial:      { id:"radial",      name:"Radiale",     desc:"App in orbita attorno all'hub", ic:LG.radial, render: renderRadialLauncher },
    cover:       { id:"cover",       name:"Cover flow",  desc:"Carosello di grandi schede",   ic:LG.cover,  render: renderCoverLauncher },
    index:       { id:"index",       name:"Indice A-Z",  desc:"Elenco alfabetico + scorrimento rapido", ic:LG.index, render: (host, ctx) => renderBlockLayout(host, ctx, INDEX_TEMPLATE) },
  };
  // lista per la galleria in Impostazioni: i launcher predefiniti + eventuale layout
  // personalizzato attivo (portato da un tema), così l'utente può tornarci o cambiarlo.
  function launcherList() {
    const base = Object.values(LAUNCHERS).map(l => ({ id: l.id, name: l.name, desc: l.desc, ic: l.ic }));
    const cl = store.get("customLayout", null);
    if (cl && Array.isArray(cl.blocks) && cl.blocks.length)
      base.push({ id: "custom", name: cl.name || "Personalizzato", desc: "Layout del tema importato", ic: LG.custom });
    return base;
  }

  function renderHome() {
    const host = $("#app-grid");
    const dock = $("#dock");
    // dispatch verso un launcher alternativo registrato (diverso da springboard)
    const lch = state.launcher || "springboard";
    // launcher "custom": layout a blocchi portato da un tema importato (motore generico)
    if (lch === "custom") {
      const cl = store.get("customLayout", null);
      if (cl && Array.isArray(cl.blocks) && cl.blocks.length) {
        editing = false;
        host.classList.remove("editing"); host.classList.add("launcher-alt");
        host.setAttribute("data-launcher", "custom");
        dock.style.display = "none"; dock.innerHTML = "";
        const ctx = { apps: allApps(), dock: NovaApps.dock, recent: recentApps().map(appById).filter(Boolean), open: openApp };
        renderBlockLayout(host, ctx, cl);
        renderClocks();
        return;
      }
      // nessun layout personalizzato salvato: ripiega sullo springboard
    }
    if (lch !== "springboard" && LAUNCHERS[lch] && LAUNCHERS[lch].render) {
      editing = false;
      host.classList.remove("editing"); host.classList.add("launcher-alt");
      host.setAttribute("data-launcher", lch);
      dock.style.display = "none"; dock.innerHTML = "";
      // contesto passato ai launcher: app, dock, recenti, apertura (le app non cambiano)
      const ctx = { apps: allApps(), dock: NovaApps.dock, recent: recentApps().map(appById).filter(Boolean), open: openApp };
      LAUNCHERS[lch].render(host, ctx);
      renderClocks();   // popola subito eventuali orologi del launcher
      return;
    }
    host.classList.remove("launcher-alt");
    host.removeAttribute("data-launcher");
    dock.style.display = "";
    const L = homeLayout();
    homePage = Math.max(0, Math.min(homePage, L.pages.length-1));
    host.classList.toggle("editing", editing);
    host.innerHTML = `
      <div class="home-track" style="transform:translateX(${-homePage*100}%)">
        ${L.pages.map((pg,pi)=>`<div class="home-page" data-page="${pi}">${pg.map((it,ii)=> it ? homeIcon(it,pi,ii) : `<div class="app-slot" data-loc="${pi}:${ii}"></div>`).join("")}</div>`).join("")}
      </div>
      <div class="page-dots">
        ${L.pages.map((_,pi)=>`<span class="dot ${pi===homePage?'on':''}" data-dot="${pi}"></span>`).join("")}
        ${editing?`<button class="dot-add" id="add-page" title="Nuova pagina">＋</button>`:''}
      </div>
      ${editing?`<div class="edit-bar"><span>Trascina le icone · tienile su un'altra per creare una cartella</span><button class="home-done" id="home-done">✓ Fine</button></div>`:''}`;
    bindHome(L, host);
    dock.innerHTML = "";
    NovaApps.dock.forEach((a, i) => dock.appendChild(iconEl(a, i)));
  }

  // applica un ordine app (da un tema .novatheme, layout.order): imposta l'ordine del
  // launcher Lista e ricostruisce la home a griglia disponendo le app in quell'ordine
  // (le app del dock restano nel dock). Le app non elencate vanno in coda.
  function applyLayoutOrder(order) {
    if (!Array.isArray(order) || !order.length) return;
    store.set("launcherOrder", order.slice());
    const dock = new Set(dockIds());
    const valid = order.filter(id => appById(id) && !dock.has(id));
    const used = new Set(valid);
    const rest = allApps().filter(a => !dock.has(a.id) && !used.has(a.id)).map(a => a.id);
    const ids = valid.concat(rest);
    const pages = [];
    for (let i = 0; i < ids.length; i += PER) {
      const pg = blankPage(); ids.slice(i, i + PER).forEach((id, j) => pg[j] = { t:"app", id }); pages.push(pg);
    }
    saveLayout({ pages: pages.length ? pages : [blankPage()] });
    if (screens.home.classList.contains("active")) renderHome();
  }

  function homeIcon(it, pi, ii) {
    if (it.t === "folder") {
      const mini = it.items.map(appById).filter(Boolean).slice(0,4).map(a => {
        const ic = appIcon(a); const isImg = /^(https?:|data:)/.test(ic||"");
        return `<span style="background:${a.color}${isImg?`;background-image:url('${ic}')`:''}">${isImg?'':ic}</span>`;
      }).join("");
      return `<div class="app-icon folder" data-loc="${pi}:${ii}"><div class="glyph folder-glyph">${mini}</div><div class="label">${escH(it.name)}</div></div>`;
    }
    const a = appById(it.id); if (!a) return "";
    const ic = appIcon(a); const isImg = /^(https?:|data:)/.test(ic||"");
    const glyph = isImg
      ? `<div class="glyph" style="background:${a.color};padding:0;overflow:hidden"><img src="${ic}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🌐'"></div>`
      : `<div class="glyph" style="background:${a.color}">${ic}</div>`;
    return `<div class="app-icon" data-loc="${pi}:${ii}" data-app="${a.id}">${editing&&a.web?`<button class="icon-rm" data-rm="${a.id}">✕</button>`:''}${glyph}<div class="label">${a.name}</div></div>`;
  }

  function bindHome(L, host) {
    const done = host.querySelector("#home-done");
    if (done) done.onclick = () => { editing = false; saveLayout(L); renderHome(); };
    const addP = host.querySelector("#add-page");
    if (addP) addP.onclick = () => { L.pages.push(blankPage()); saveLayout(L); homePage = L.pages.length-1; renderHome(); };
    host.querySelectorAll(".dot").forEach(d => d.onclick = () => { homePage = +d.dataset.dot; renderHome(); });
    host.querySelectorAll(".icon-rm").forEach(b => b.onclick = e => {
      e.stopPropagation(); const id = b.dataset.rm;
      const nm = (appById(id)||{}).name||id;
      confirmDialog({ title:"Rimuovere l'app?", message:`"${nm}" verrà rimossa dalla home.`, okText:"Rimuovi" })
        .then(ok => { if (ok) { uninstallApp(id); saveLayout(homeLayout()); renderHome(); } });
    });
    host.querySelectorAll(".app-icon").forEach(el => {
      const [pi,ii] = el.dataset.loc.split(":").map(Number);
      const it = L.pages[pi][ii];
      if (!editing) {
        el.onclick = () => it.t==="folder" ? openFolder(L,pi,ii) : openApp(it.id);
      } else {
        el.onclick = () => { if (it.t==="folder") openFolder(L,pi,ii); };
        makeDraggable(el, L, pi, ii, host);
      }
    });
    enablePageSwipe(host);
  }

  // cambio pagina con trascinamento (mouse + touch): premi, tieni premuto e scorri
  // a destra/sinistra. Il carosello segue il dito e scatta alla pagina più vicina.
  // Solo in modalità normale (in modifica il drag sposta le icone). Legato una volta.
  function enablePageSwipe(host) {
    if (host._swipeBound) return; host._swipeBound = true;
    let startX=0, startY=0, dx=0, w=0, pagesN=1, track=null, active=false, dragging=false, decided=false;
    let t0=0, lastX=0, lastT=0, vel=0;   // per il "flick": velocità del dito
    const onDown = e => {
      // in modifica: se parto da un'icona la trascina makeDraggable; se parto da uno
      // spazio vuoto uso lo swipe per cambiare pagina (così si modificano tutte le
      // pagine senza dover prima uscire dalla modalità modifica).
      if (editing && e.target.closest(".app-icon")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      track = host.querySelector(".home-track"); if (!track) return;
      active=true; dragging=false; decided=false; dx=0;
      startX=e.clientX; startY=e.clientY;
      t0=lastT=performance.now(); lastX=e.clientX; vel=0;
      w = host.clientWidth || window.innerWidth;
      pagesN = homeLayout().pages.length;
      track.style.transition = "none";
    };
    const onMove = e => {
      if (!active) return;
      dx = e.clientX-startX; const dy = e.clientY-startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true; dragging = Math.abs(dx) > Math.abs(dy);
        if (!dragging) { active=false; track.style.transition=""; return; }
      }
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      const now = performance.now(), dt = now-lastT;   // velocità istantanea (px/ms)
      if (dt > 0) vel = (e.clientX-lastX)/dt;
      lastX = e.clientX; lastT = now;
      let off = -homePage*w + dx;
      const min = -(pagesN-1)*w, max = 0;               // resistenza oltre i bordi
      if (off > max) off = max + (off-max)*0.35;
      if (off < min) off = min + (off-min)*0.35;
      track.style.transform = `translateX(${off}px)`;
    };
    const onUp = () => {
      if (!active) { return; }
      active=false;
      if (!track) return;
      track.style.transition = "";
      if (dragging) {
        // commit se: superata la soglia di distanza (12% della larghezza) OPPURE
        // "flick" veloce (>0.35 px/ms) anche con spostamento breve → molto reattivo
        const flick = Math.abs(vel) > 0.35;
        const goNext = (dx < -w*0.12 || (flick && vel < 0)) && homePage < pagesN-1;
        const goPrev = (dx >  w*0.12 || (flick && vel > 0)) && homePage > 0;
        if (goNext) homePage++;
        else if (goPrev) homePage--;
      }
      track.style.transform = `translateX(${-homePage*100}%)`;
      host.querySelectorAll(".dot").forEach(d => d.classList.toggle("on", +d.dataset.dot===homePage));
      if (dragging && Math.abs(dx) > 8) {              // dopo uno swipe non aprire l'app
        const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
        host.addEventListener("click", kill, true);
        setTimeout(() => host.removeEventListener("click", kill, true), 80);
      }
      dragging=false;
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // trascinamento icona in modalità modifica: riordina, sposta tra pagine, crea cartelle
  function makeDraggable(el, L, pi, ii, host) {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", e => {
      if (e.button === 2) return;
      const rect = el.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const offX = e.clientX-rect.left, offY = e.clientY-rect.top;
      const track = host.querySelector(".home-track");
      let ghost = null, dragging = false, edgeTimer = null, edgeDir = 0;
      const at = (x,y) => { if (ghost) ghost.style.display="none"; const u = document.elementFromPoint(x,y); if (ghost) ghost.style.display=""; return u; };
      const startDrag = () => {
        dragging = true;
        if (track) track.style.transition = "none";   // cambio pagina istantaneo durante il drag
        ghost = el.cloneNode(true); ghost.classList.add("drag-ghost");
        ghost.style.cssText += `;position:fixed;margin:0;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:200;pointer-events:none;opacity:.92;transform:scale(1.12)`;
        document.body.appendChild(ghost);
        el.style.opacity = ".25";
      };
      const move = ev => {
        if (!dragging) {
          if (Math.abs(ev.clientX-startX) < 7 && Math.abs(ev.clientY-startY) < 7) return;
          startDrag();
        }
        ghost.style.left = (ev.clientX-offX)+"px"; ghost.style.top = (ev.clientY-offY)+"px";
        const u = at(ev.clientX, ev.clientY);
        host.querySelectorAll(".app-icon").forEach(x => x.classList.remove("drop-into"));
        const tIcon = u && u.closest(".app-icon");
        if (tIcon && tIcon !== el) tIcon.classList.add("drop-into");
        // bordo sinistro/destro: tenendo l'icona ferma sul bordo per un istante si
        // cambia pagina (per spostarla su un altro desktop). Un SOLO cambio per ogni
        // "ingresso" nella zona bordo: per cambiare ancora bisogna allontanarsi e
        // rientrare. Così non si sfogliano decine di pagine né se ne creano a raffica.
        const w = window.innerWidth, dir = ev.clientX < w*0.12 ? -1 : ev.clientX > w*0.88 ? 1 : 0;
        const atEnd = dir > 0 && homePage === L.pages.length-1 && !L.pages[homePage].every(c => c===null);
        host.querySelectorAll(".dot").forEach((d,di) => d.classList.toggle("drop-target", !!dir && (homePage+dir)===di));
        if (dir !== edgeDir) {
          edgeDir = dir; clearTimeout(edgeTimer);
          if (dir) edgeTimer = setTimeout(() => {
            let np = homePage + dir;
            // oltre l'ultima pagina si crea UN nuovo desktop, ma solo se quella attuale
            // non è già vuota (evita di accumulare pagine vuote). Senza renderHome, che
            // interromperebbe il trascinamento in corso.
            if (dir > 0 && np >= L.pages.length) {
              if (!atEnd) { edgeDir = dir; return; }   // ultima pagina vuota: non creare
              L.pages.push(blankPage());
              const idx = L.pages.length - 1;
              const pg = document.createElement("div");
              pg.className = "home-page"; pg.dataset.page = idx;
              track.appendChild(pg);
              const dots = host.querySelector(".page-dots");
              const dot = document.createElement("span");
              dot.className = "dot"; dot.dataset.dot = idx;
              dots.insertBefore(dot, host.querySelector("#add-page") || null);
              np = idx;
            }
            if (np >= 0 && np < L.pages.length) {
              homePage = np;
              track.style.transition = "transform .26s cubic-bezier(.22,.61,.36,1)";
              track.style.transform = `translateX(${-homePage*100}%)`;
              host.querySelectorAll(".dot").forEach(d => d.classList.toggle("on", +d.dataset.dot===homePage));
            }
            // NON azzero edgeDir: resta = dir, così non riparte finché il dito non lascia
            // il bordo (dir torna 0) e vi rientra. Un cambio pagina alla volta.
          }, 620);
        }
      };
      const up = ev => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        clearTimeout(edgeTimer);
        // tap semplice (nessuno spostamento): non toccare il layout, lascia gestire l'onclick
        if (!dragging) { if (ghost) ghost.remove(); return; }
        ghost.remove();
        const u = at(ev.clientX, ev.clientY);
        const src = L.pages[pi][ii];
        const dot = u && u.closest(".dot");
        const slot = u && u.closest("[data-loc]");     // cella piena (.app-icon) o vuota (.app-slot)
        const tPage = u && u.closest(".home-page");
        // sposta l'icona nel primo slot libero della pagina p (se ce n'è uno)
        const placeOnPage = p => { const f = L.pages[p].indexOf(null); if (f>=0) { L.pages[pi][ii]=null; L.pages[p][f]=src; } };
        if (dot) { const p = +dot.dataset.dot; if (p!==pi) placeOnPage(p); saveLayout(L); renderHome(); return; }
        if (slot && slot !== el && slot.dataset.loc) {
          const [tpi,tsi] = slot.dataset.loc.split(":").map(Number);
          const tItem = L.pages[tpi][tsi];
          if (tItem === null) {                          // slot VUOTO → posizione libera esatta
            L.pages[pi][ii]=null; L.pages[tpi][tsi]=src; saveLayout(L); renderHome(); return;
          }
          const r = slot.getBoundingClientRect();
          const near = Math.abs(ev.clientX-(r.left+r.width/2)) < r.width*0.34 && Math.abs(ev.clientY-(r.top+r.height/2)) < r.height*0.34;
          if (near && src.t==="app" && tItem.t==="folder") { tItem.items.push(src.id); L.pages[pi][ii]=null; saveLayout(L); renderHome(); return; }
          if (near && src.t==="app" && tItem.t==="app") { L.pages[tpi][tsi] = { t:"folder", name:"Cartella", items:[tItem.id, src.id] }; L.pages[pi][ii]=null; saveLayout(L); renderHome(); return; }
          // altrimenti: scambia le due posizioni
          L.pages[pi][ii]=tItem; L.pages[tpi][tsi]=src; saveLayout(L); renderHome(); return;
        }
        if (tPage) { const p = +tPage.dataset.page; if (p!==pi) placeOnPage(p); saveLayout(L); renderHome(); return; }
        renderHome();
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }

  // apertura cartella: rinomina, avvio app, e (in edit) estrazione app dalla cartella
  function openFolder(L, pi, ii) {
    const f = L.pages[pi][ii]; if (!f || f.t!=="folder") return;
    const ov = document.createElement("div"); ov.className = "folder-ov";
    const close = () => { saveLayout(homeLayout()); ov.remove(); renderHome(); };
    const draw = () => {
      ov.innerHTML = `<div class="folder-card">
        <input class="folder-name" value="${escH(f.name)}" ${editing?'':'readonly'}>
        <div class="folder-grid">${f.items.map(id => { const a = appById(id); if(!a) return "";
          const isImg = /^(https?:|data:)/.test(a.icon||"");
          return `<div class="app-icon" data-fid="${id}">${editing?`<button class="icon-rm" data-pop="${id}">✕</button>`:''}
            <div class="glyph" style="background:${a.color}${isImg?';padding:0;overflow:hidden':''}">${isImg?`<img src="${a.icon}" style="width:100%;height:100%;object-fit:cover">`:a.icon}</div>
            <div class="label">${a.name}</div></div>`;}).join("")}</div>
        ${editing?`<div class="folder-hint">Tocca ✕ per riportare un'app sulla home. Sotto le 2 app la cartella si scioglie.</div>`:''}
        <button class="folder-close">${editing?'Fine':'Chiudi'}</button></div>`;
      const nm = ov.querySelector(".folder-name");
      if (editing) nm.onchange = () => { f.name = nm.value.trim()||"Cartella"; saveLayout(L); };
      ov.querySelector(".folder-close").onclick = close;
      ov.onclick = e => { if (e.target === ov) close(); };
      ov.querySelectorAll("[data-fid]").forEach(el => el.onclick = e => {
        if (e.target.dataset.pop !== undefined) return;
        if (!editing) { ov.remove(); openApp(el.dataset.fid); }
      });
      ov.querySelectorAll("[data-pop]").forEach(b => b.onclick = e => {
        e.stopPropagation(); const id = b.dataset.pop;
        f.items = f.items.filter(x => x !== id);
        if (f.items.length < 2) {                       // dissolvi: l'ultima app prende lo slot della cartella
          const rem = f.items[0];
          L.pages[pi][ii] = rem ? { t:"app", id:rem } : null;
          placeFree(L, { t:"app", id });                // l'app estratta va nel primo slot libero
          saveLayout(L); ov.remove(); renderHome(); return;
        }
        placeFree(L, { t:"app", id });
        saveLayout(L); draw();
      });
    };
    draw();
    document.body.appendChild(ov);
  }

  function iconEl(a, i) {
    const el = document.createElement("div");
    el.className = "app-icon";
    el.dataset.app = a.id;
    el.style.animationDelay = (i*0.02)+"s";
    // icona come immagine (favicon/upload) oppure emoji (con eventuale override del tema)
    const ic = appIcon(a); const isImg = /^(https?:|data:)/.test(ic || "");
    const glyph = isImg
      ? `<div class="glyph" style="background:${a.color};padding:0;overflow:hidden"><img src="${ic}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🌐'"></div>`
      : `<div class="glyph" style="background:${a.color}">${ic}</div>`;
    el.innerHTML = `${glyph}<div class="label">${a.name}</div>`;
    el.onclick = () => openApp(a.id);
    // long-press per disinstallare le web app utente
    if (a.web) {
      let t;
      const arm = () => t = setTimeout(() => {
        confirmDialog({ title:"Rimuovere l'app?", message:`"${a.name}" verrà rimossa.`, okText:"Rimuovi" })
          .then(ok => { if (ok) { uninstallApp(a.id); renderHome(); } });
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
  function recentApps() { return store.get("recentApps", []); }
  function pushRecent(id) {
    const r = store.get("recentApps", []).filter(x => x !== id);
    r.unshift(id); if (r.length > 10) r.length = 10; store.set("recentApps", r);
  }
  function openApp(id) {
    const a = appById(id);
    if (!a) return;
    pushRecent(id);
    // web app sul device: apri nel browser nativo a schermo intero. Così i siti che
    // vietano l'incorporamento in iframe (WhatsApp Web, Telegram Web, banche, Google…)
    // si aprono davvero, invece di restare bianchi.
    if (a.web && window.NovaNative && window.NovaNative.openBrowser) {
      try { window.NovaNative.openBrowser(a.url); return; } catch (e) {}
    }
    // Browser: sul device apre direttamente il browser nativo (clone Chrome, schede,
    // preferiti, download) — lo stesso che apre le web app. In emulatore (nessun
    // bridge) resta l'anteprima interna in-app come ripiego.
    if (a.id === "browser" && window.NovaNative && window.NovaNative.openBrowser) {
      try { window.NovaNative.openBrowser(""); return; } catch (e) {}
    }
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
  function goHome() { clearIntervals(); cleanupApp(); currentApp = null; editing = false; show("home"); renderHome(); renderClocks(); renderStatusbars(); }
  function goBack() { if (screens.app.classList.contains("active")) goHome(); }

  function interval(root, fn, ms) { const id = setInterval(fn, ms); activeIntervals.add(id); return id; }
  function clearIntervals() { activeIntervals.forEach(clearInterval); activeIntervals.clear(); }

  // ============================================================
  //  blocco / sblocco
  // ============================================================
  function lockDevice() {
    pinBuffer = ""; pinMode = "unlock"; pinOnDone = null;
    // NON chiudere l'app aperta: resta sotto il lockscreen (col suo stato) e al sblocco
    // si torna esattamente dov'eri. Niente clearIntervals/currentApp=null qui.
    if (state.sysSounds && !screens.lock.classList.contains("active")) beep(320, .12, 0.16);
    show("lock");
    renderLockNotifs();
    setupLockUI();
  }
  function setupLockUI() {
    const usePin = state.lockType === "pin" && state.pin;
    // Stato iniziale: orologio + suggerimento "scorri verso l'alto", tastierino NASCOSTO.
    // Anche con PIN il tastierino compare DOPO lo scorrimento (vedi revealLock).
    $("#lock-hint").classList.toggle("hidden", state.lockType === "none");
    $("#pinpad").classList.add("hidden");
    if (usePin) { $("#pin-label").textContent = "Inserisci il PIN"; $("#pin-label").classList.remove("err"); renderPinpad(); renderPinDots(); }
  }
  // dopo lo scorrimento verso l'alto: se è impostato il PIN mostra il tastierino,
  // altrimenti (nessuno/scorrimento) sblocca direttamente.
  function revealLock() {
    if (state.lockType === "pin" && state.pin) {
      pinBuffer = ""; renderPinDots();
      $("#lock-hint").classList.add("hidden");
      $("#pinpad").classList.remove("hidden");
    } else {
      unlock();
    }
  }
  function renderPinpad() {
    const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
    $("#pin-keys").innerHTML = keys.map(k => k===""
      ? `<div></div>`
      : `<button class="pin-key ${k==='⌫'?'fn':''}" data-k="${k}">${k}</button>`).join("");
    // pointerdown = risposta immediata al tocco (niente ritardo del click ~300ms
    // né interferenze con lo swipe del lockscreen); un solo evento per pressione.
    $("#pin-keys").querySelectorAll("[data-k]").forEach(b => {
      const press = e => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add("press");
        vibrate(8);
        pinPress(b.dataset.k);
      };
      const release = () => b.classList.remove("press");
      b.addEventListener("pointerdown", press);
      b.addEventListener("pointerup", release);
      b.addEventListener("pointerleave", release);
      b.addEventListener("pointercancel", release);
    });
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
    noteActivity();
    if (state.sysSounds) beep(760, .1, 0.18);
    // torna dove eri: se un'app era aperta la riprendi com'era (stesso stato, stessa
    // schermata), altrimenti vai alla home.
    if (currentApp && $("#app-frame").children.length) { show("app"); renderStatusbars(); }
    else goHome();
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

  // suono reale (WebAudio) con volume 0..1; usato da notifiche e sveglia.
  function beep(freq = 660, dur = 0.18, vol = 0.3) {
    if (vol <= 0) return;
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.frequency.value = freq; osc.type = "sine"; osc.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime+0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur);
      osc.start(); osc.stop(ctx.currentTime+dur+0.02);
      osc.onended = () => { try { ctx.close(); } catch {} };
    } catch {}
  }

  // ============================================================
  //  Suoni di sistema: suonerie, notifiche, sveglie (sintetizzate, offline)
  //  Ogni "melodia" è una sequenza di note [frequenzaHz, durataSec]; freq 0 = pausa.
  // ============================================================
  const Sounds = (() => {
    const NOTIF = {
      "Goccia":    [[880,.12],[1245,.14]],
      "Pop":       [[520,.07],[780,.12]],
      "Bip":       [[1000,.09],[0,.05],[1000,.09]],
      "Cristallo": [[1320,.1],[1760,.1],[2217,.16]],
      "Legno":     [[440,.08],[330,.14]],
    };
    const RING = {
      "Nova":     [[660,.18],[880,.18],[990,.22],[0,.18]],
      "Classica": [[784,.2],[659,.2],[784,.2],[988,.3],[0,.22]],
      "Digitale": [[1000,.1],[0,.06],[1000,.1],[0,.06],[1300,.16],[0,.28]],
      "Marimba":  [[523,.16],[659,.16],[784,.16],[1047,.22],[0,.22]],
      "Arpeggio": [[440,.13],[554,.13],[659,.13],[880,.13],[659,.13],[554,.13],[0,.22]],
    };
    const ALARM = {
      "Radar":   [[740,.24],[0,.1],[740,.24],[0,.14]],
      "Sirena":  [[600,.3],[900,.3]],
      "Mattino": [[880,.15],[1108,.15],[1319,.2],[0,.22]],
    };
    let stopFn = null;
    function stop() { if (stopFn) stopFn(); }
    function playSeq(notes, vol, loop) {
      stop();
      if (vol <= 0 || !notes) return;
      let ctx; try { ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch { return; }
      let cancelled = false;
      const total = notes.reduce((s,n)=>s+n[1],0) + 0.12;
      const once = t0 => { let t = t0;
        notes.forEach(([f,d]) => { if (f>0) { const o=ctx.createOscillator(), g=ctx.createGain();
          o.frequency.value=f; o.type="sine"; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+0.02);
          g.gain.exponentialRampToValueAtTime(0.0001,t+d); o.start(t); o.stop(t+d+0.03); } t += d; }); };
      once(ctx.currentTime+0.03);
      if (loop) { const iv = setInterval(() => { if (!cancelled) once(ctx.currentTime+0.03); }, total*1000);
        stopFn = () => { cancelled=true; clearInterval(iv); try{ctx.close();}catch{} stopFn=null; }; }
      else { stopFn = () => { cancelled=true; try{ctx.close();}catch{} stopFn=null; };
        setTimeout(() => { if (stopFn) { try{ctx.close();}catch{} stopFn=null; } }, total*1000+250); }
    }
    return {
      lists: { ring: Object.keys(RING), notif: Object.keys(NOTIF), alarm: Object.keys(ALARM) },
      notif: (name, vol) => playSeq(NOTIF[name]||NOTIF.Goccia, vol, false),
      ring:  (name, vol) => playSeq(RING[name]||RING.Nova, vol, true),
      alarm: (name, vol) => playSeq(ALARM[name]||ALARM.Radar, vol, true),
      preview: (cat, name, vol=0.35) => { const map = cat==="ring"?RING:cat==="alarm"?ALARM:NOTIF; playSeq(map[name]||Object.values(map)[0], vol, false); },
      stop,
    };
  })();

  // banner "bolla" (heads-up) transitorio in alto, alla ricezione di una notifica
  function showBubble(n) {
    const b = document.createElement("div");
    b.className = "heads-up";
    b.innerHTML = `<div class="n-ico" style="background:${n.color}">${n.icon}</div>
      <div style="flex:1;min-width:0"><div class="n-title">${escH(n.title)}</div><div class="n-text">${escH(n.text)}</div></div>`;
    (document.querySelector("#device") || document.body).appendChild(b);
    requestAnimationFrame(() => b.classList.add("show"));
    const kill = () => { b.classList.remove("show"); setTimeout(() => b.remove(), 250); };
    b.onclick = kill;
    setTimeout(kill, 3500);
  }

  function notify({ app, title, text }) {
    if (state.notifApps && state.notifApps[app] === false) return;   // app silenziata
    const a = appById(app) || { icon:"🔔", color:"var(--accent)" };
    const n = { id:++notifId, icon:a.icon, color:a.color, title, text,
      ts: Date.now(), time: new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}) };
    notifs.unshift(n);
    if (notifs.length > 40) notifs.length = 40;
    saveNotifs();
    renderNotifs();
    if (screens.lock.classList.contains("active")) renderLockNotifs();
    if (!state.dnd) { pulse(); vibrate(60); Sounds.notif(state.notifSound, (state.volNotif==null?50:state.volNotif)/100*0.4);
      if (state.bubbles && !screens.lock.classList.contains("active")) showBubble(n); }
  }
  // Dialog di conferma in-app (sostituisce window.confirm, che nella WebView Android
  // con WebChromeClient personalizzato ritorna sempre false senza mostrare nulla —
  // per questo le eliminazioni non andavano a buon fine). Ritorna una Promise<boolean>.
  function confirmDialog(opts) {
    opts = opts || {};
    const title = opts.title || "Conferma";
    const message = opts.message || "";
    const okText = opts.okText || "Elimina";
    const cancelText = opts.cancelText || "Annulla";
    const danger = opts.danger !== false;   // default: azione distruttiva (rosso)
    return new Promise(resolve => {
      const ov = document.createElement("div"); ov.className = "nc-ov";
      const card = document.createElement("div"); card.className = "nc-card";
      card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "true");
      const h = document.createElement("div"); h.className = "nc-title"; h.textContent = title; card.appendChild(h);
      if (message) { const m = document.createElement("div"); m.className = "nc-msg"; m.textContent = message; card.appendChild(m); }
      const act = document.createElement("div"); act.className = "nc-actions";
      const bc = document.createElement("button"); bc.className = "nc-btn nc-cancel"; bc.textContent = cancelText;
      const bo = document.createElement("button"); bo.className = "nc-btn nc-ok" + (danger ? " nc-danger" : ""); bo.textContent = okText;
      act.appendChild(bc); act.appendChild(bo); card.appendChild(act); ov.appendChild(card);
      let done = false;
      const close = v => { if (done) return; done = true; ov.classList.remove("show"); setTimeout(() => ov.remove(), 180); resolve(v); };
      ov.addEventListener("click", e => { if (e.target === ov) close(false); });
      bc.onclick = () => close(false); bo.onclick = () => close(true);
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add("show"));
      setTimeout(() => bo.focus(), 60);
      try { vibrate(8); } catch (e) {}
    });
  }
  const notifAgo = n => {
    if (!n.ts) return n.time || "";
    const m = Math.floor((Date.now()-n.ts)/60000);
    if (m < 1) return "ora"; if (m < 60) return m+" min fa";
    const h = Math.floor(m/60); if (h < 24) return h+" h fa";
    return n.time || "";
  };
  function renderNotifs() {
    const box = $("#shade-notifs");
    if (!notifs.length) { box.innerHTML = `<div class="shade-empty">Nessuna notifica</div>`; return; }
    box.innerHTML = `<div class="shade-notifs-head"><span>${notifs.length} notifiche</span><button id="notif-clear">Cancella tutto</button></div>`
      + notifs.map(notifHtml).join("");
    const clr = box.querySelector("#notif-clear"); if (clr) clr.onclick = () => { notifs.length = 0; saveNotifs(); renderNotifs(); renderLockNotifs(); };
    box.querySelectorAll(".notif").forEach((el,i) => el.onclick = () => { notifs.splice(i,1); saveNotifs(); renderNotifs(); renderLockNotifs(); });
  }
  function renderLockNotifs() { const el = $("#lock-notifs"); if (el) el.innerHTML = state.notifLock ? notifs.slice(0,4).map(notifHtml).join("") : ""; }
  function notifHtml(n) {
    return `<div class="notif"><div class="n-ico" style="background:${n.color}">${n.icon}</div>
      <div style="flex:1"><div class="n-title">${n.title}</div><div class="n-text">${n.text}</div></div>
      <div class="n-time">${notifAgo(n)}</div></div>`;
  }
  function pulse() { document.querySelectorAll("[data-statusbar] .sb-left").forEach(e => e.animate([{opacity:1},{opacity:.3},{opacity:1}], {duration:600})); }

  // ---- ponte sensori nativi (presente solo dentro l'app NovaOS) ----
  const NN = () => window.NovaNative || {};
  const hasNativeSensors = () => !!(window.NovaNative && window.NovaNative.sensorStates);
  function readNativeSensors() { try { return hasNativeSensors() ? JSON.parse(NN().sensorStates()) : null; } catch { return null; } }
  function syncQuickSensors() { const ns = readNativeSensors(); if (!ns) return;
    ["wifi","bt","nfc","location","airplane"].forEach(k => { if (k in ns) state[k] = ns[k]; }); }

  // ============================================================
  //  Aggiornamenti di sistema (OTA)
  //  Confronta la build installata con shell/version.json pubblicato su GitHub (raw).
  //  Controllo autonomo all'avvio (con throttle) → notifica; l'applicazione avviene
  //  dalla UI in Impostazioni → Sistema → Aggiornamenti di Sistema.
  //   · su dispositivo: scarica e installa l'APK (bridge nativo) o apre il download
  //   · su web/PWA: svuota le cache e ricarica (la shell è servita via rete)
  // ============================================================
  const Updater = (() => {
    const RAW = "https://raw.githubusercontent.com/dPlusOS21/NovaOS/main/shell/version.json";
    const appInfo = () => { try { return JSON.parse(NN().appVersion()); } catch { return null; } };
    let last = null;   // ultimo esito del controllo

    async function localInfo() {
      // Fonte primaria: window.__NOVA_SHELL iniettato da js/version.js. Funziona anche
      // quando la shell gira da file:// (aggiornata via OTA), dove fetch() è bloccata
      // dalla WebView → senza questo la build risultava 0 e l'update si riproponeva
      // in loop. fetch("version.json") resta come fallback (web/PWA).
      try { if (window.__NOVA_SHELL && window.__NOVA_SHELL.build) return window.__NOVA_SHELL; } catch {}
      try { const r = await fetch("version.json", { cache:"no-store" }); if (r.ok) return await r.json(); } catch {}
      return null;
    }
    async function check(/*force*/) {
      const li = await localInfo();
      const ai = appInfo();
      // La build "installata" è la più alta tra il codice dell'APK (PackageInfo) e la
      // build della shell già applicata via OTA (version.json interno): senza questo,
      // dopo un aggiornamento della sola interfaccia l'APK resta indietro e l'update
      // verrebbe riproposto in loop. Il nome segue chi è più recente.
      const apkCode = (ai && ai.code) || 0;
      const apkName = (ai && ai.name && ai.name !== "?") ? ai.name : "";
      const shellBuild = (li && li.build) || 0;
      const shellName = (li && li.version) || "";
      const curBuild = Math.max(apkCode, shellBuild) || 0;
      const curName  = (shellBuild >= apkCode ? shellName : apkName) || apkName || shellName || "0.1.15";
      let rel = null;
      try { const r = await fetch(RAW + "?t=" + Date.now(), { cache:"no-store" }); if (r.ok) rel = await r.json(); } catch {}
      const latestBuild = rel ? (rel.build || 0) : curBuild;
      const hasUpdate = !!rel && latestBuild > curBuild;
      last = {
        current: curBuild, currentName: curName,
        latest: latestBuild, latestName: rel ? (rel.version || "?") : curName,
        notes: rel ? (rel.notes || "") : "", apk: rel ? (rel.apk || "") : "",
        date: rel ? (rel.date || "") : "", reachable: !!rel, hasUpdate,
        // aggiornamento OTA della sola shell: elenco file + build nativa minima richiesta
        files: rel && Array.isArray(rel.files) ? rel.files : [],
        minNative: rel ? (rel.minNative || 0) : 0,
        nativeBuild: (ai && ai.code) || 0,
      };
      store.set("updLastCheck", Date.now());
      store.set("updAvailable", hasUpdate ? last.latestName : "");
      // notifica una sola volta per build
      if (hasUpdate && store.get("updNotified", 0) !== latestBuild) {
        store.set("updNotified", latestBuild);
        notify({ app:"settings", title:"Aggiornamento disponibile",
                 text:`NovaOS ${last.latestName} pronto · Impostazioni → Sistema → Aggiornamenti` });
      }
      return last;
    }
    // controllo autonomo all'avvio: solo se online e non già controllato di recente (~6h)
    function autoCheck() {
      if (!navigator.onLine) return;
      if (state.saver) return;   // risparmio energetico: niente controlli in background
      if (Date.now() - store.get("updLastCheck", 0) < 6 * 3600 * 1000) return;
      setTimeout(() => check().catch(()=>{}), 4000);
    }
    // base64 di un ArrayBuffer (per passare i file al bridge nativo)
    function toBase64(buf) {
      const bytes = new Uint8Array(buf); let bin = "";
      const CH = 0x8000; for (let i=0;i<bytes.length;i+=CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+CH));
      return btoa(bin);
    }
    const RAWBASE = "https://raw.githubusercontent.com/dPlusOS21/NovaOS/main/shell/";
    // scarica i file della nuova shell nella staging nativa; true se tutti scritti
    async function downloadShell(files) {
      try { NN().shellStageBegin(); } catch { return false; }
      for (const rel of files) {
        const r = await fetch(RAWBASE + rel + "?t=" + Date.now(), { cache:"no-store" });
        if (!r.ok) return false;
        const b64 = toBase64(await r.arrayBuffer());
        let ok = false; try { ok = NN().shellWrite(rel, b64); } catch {}
        if (!ok) return false;
      }
      return true;
    }
    async function apply() {
      const info = last || await check();
      const nn = window.NovaNative;
      // 1) AGGIORNAMENTO SOLO INTERFACCIA (shell) SENZA APK: se il bridge lo supporta e la
      //    build nativa installata è sufficiente per la nuova shell (minNative). La parte
      //    nativa (bridge Java) resta invariata: si aggiornano solo HTML/CSS/JS.
      const nativeOk = !info.minNative || (info.nativeBuild >= info.minNative);
      if (nn && nn.shellWrite && nn.shellCommit && info.files.length && nativeOk) {
        try {
          if (await downloadShell(info.files)) {
            store.set("updAvailable", "");
            let done = false; try { done = nn.shellCommit(); } catch {}
            if (done) return { mode:"shell" };   // il bridge ricarica l'interfaccia
          }
        } catch {}
        // se qualcosa va storto si prosegue col fallback APK (nessun rischio: la shell
        // interna viene sostituita solo al commit atomico riuscito)
      }
      // 2) dispositivo: installazione APK nativa (serve quando cambia il codice nativo),
      //    con fallback all'apertura del download nel browser
      if (nn && info.apk) {
        if (nn.installUpdate) { try { nn.installUpdate(info.apk); return { mode:"apk" }; } catch {} }
        if (nn.openBrowser)   { try { nn.openBrowser(info.apk);   return { mode:"browser" }; } catch {} }
      }
      // 3) web/PWA: auto-aggiornamento reale (svuota cache + aggiorna service worker + reload)
      try {
        if ("caches" in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
        if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update())); }
      } catch {}
      setTimeout(() => location.reload(true), 400);
      return { mode:"web" };
    }
    return { check, apply, autoCheck, get last(){ return last; } };
  })();

  // pannello rapido stile Android: pulsanti tondi con icona + slider luminosità.
  // I sensori (Wi-Fi/BT/aereo/posizione/NFC) sul dispositivo agiscono davvero
  // (o aprono il pannello di sistema); gli interruttori software cambiano subito.
  // glifo monocromatico Bootstrap (offline) con fallback emoji, tinto via currentColor
  const qGlyph = (id, em) => (window.NovaIcons && NovaIcons.svg[id])
    ? `<svg viewBox="0 0 16 16" fill="currentColor">${NovaIcons.svg[id]}</svg>` : (em||"");
  const SETFN = { wifi:"setWifi", bt:"setBluetooth", airplane:"setAirplane", location:"setLocation", nfc:"setNfc", mobileData:"setMobileData" };

  function renderQuick() {
    if (hasNativeSensors()) syncQuickSensors();
    const native = hasNativeSensors();
    // k = chiave/azione · g = id glifo · em = fallback emoji · l = etichetta
    // sensor/panel = hardware (dual-mode) · act = azione speciale (torcia, qr, ...)
    const tiles = [
      { k:"wifi",       g:"wifi",               em:"📶", l:"Wi-Fi",     sensor:true, panel:"wifi" },
      { k:"mobileData", g:"reception-4",        em:"📱", l:"Dati",      sensor:true, panel:"data" },
      { k:"bt",         g:"bluetooth",          em:"🔵", l:"Bluetooth", sensor:true, panel:"bluetooth" },
      { k:"torch",      g:"lightning-charge-fill", em:"🔦", l:"Torcia",  act:"torch" },
      { k:"airplane",   g:"airplane-fill",      em:"✈️", l:"Aereo",     sensor:true, panel:"airplane" },
      { k:"dnd",        g:"bell-slash-fill",    em:"🌙", l:"Non dist." },
      { k:"autoRotate", g:"arrow-repeat",       em:"🔄", l:"Rotazione" },
      { k:"location",   g:"geo-alt-fill",       em:"📍", l:"Posizione", sensor:true, panel:"location" },
      // pagina 2
      { k:"nightMode",  g:"moon-stars-fill",    em:"🌙", l:"Notte",     act:"night" },
      { k:"eyeComfort", g:"eye-fill",           em:"👁️", l:"Comfort occhi", act:"eye" },
      { k:"vibrate",    g:"phone-vibrate-fill", em:"📳", l:"Vibrazione" },
      { k:"saver",      g:"battery-half",       em:"🔋", l:"Risparmio" },
      { k:"nfc",        g:"broadcast-pin",      em:"📡", l:"NFC",       sensor:true, panel:"nfc" },
      { k:"audio",      g:"sliders",            em:"🎚️", l:"Audio",     act:"audio" },
      { k:"qr",         g:"qr-code-scan",       em:"🔳", l:"Scansione QR", act:"qr" },
      { k:"screenshot", g:"aspect-ratio-fill",  em:"🖼️", l:"Schermata", act:"shot" },
    ];
    const PERQ = 8;
    const pages = []; for (let i=0;i<tiles.length;i+=PERQ) pages.push(tiles.slice(i,i+PERQ));
    const tileHtml = t => `<button class="qtile ${quickOn(t.k)?'on':''}" data-q="${t.k}" data-sensor="${t.sensor?1:0}" data-panel="${t.panel||''}" data-act="${t.act||''}">
        <span class="q-ico">${qGlyph(t.g, t.em)}</span><span class="q-lbl">${t.l}</span></button>`;
    const briFill = Math.round((state.brightness - 20) / 80 * 100);
    $("#shade-quick").innerHTML = `
      <div class="qs-pager" id="qs-pager">
        ${pages.map(pg => `<div class="qs-page">${pg.map(tileHtml).join("")}</div>`).join("")}
      </div>
      ${pages.length>1 ? `<div class="qs-dots">${pages.map((_,i)=>`<span class="qd ${i===0?'on':''}"></span>`).join("")}</div>` : ""}
      <div class="qs-bright"><span class="qs-sun">${qGlyph("brightness-high-fill","☀")}</span><input type="range" id="qs-bri" min="20" max="100" value="${state.brightness}" style="--fill:${briFill}%"></div>`;
    // scorrimento orizzontale dei gruppi (scroll-snap CSS) → aggiorna i puntini
    const pager = $("#qs-pager");
    if (pager && pages.length>1) pager.onscroll = () => {
      const i = Math.round(pager.scrollLeft / pager.clientWidth);
      $("#shade-quick").querySelectorAll(".qd").forEach((d,di)=>d.classList.toggle("on", di===i));
    };
    $("#shade-quick").querySelectorAll(".qtile").forEach(el => el.onclick = () => quickTap(el, native));
    const bri = $("#qs-bri"); if (bri) bri.oninput = e => {
      const v = +e.target.value; e.target.style.setProperty("--fill", Math.round((v-20)/80*100)+"%");
      set("brightness", v);
    };
  }
  function quickTap(el, native) {
    const k = el.dataset.q, isSensor = el.dataset.sensor === "1", act = el.dataset.act;
    if (act) { quickAct(act, k, el); return; }
    if (isSensor && native) {
      let applied = false;
      try { const fn = SETFN[k]; if (fn && NN()[fn]) applied = NN()[fn](!state[k]); } catch (e) {}
      if (applied) { syncQuickSensors(); renderQuick(); }
      else closeShade();
      return;
    }
    toggle(k);
    el.classList.toggle("on", quickOn(k));
  }
  function quickAct(act, k, el) {
    if (act === "torch") {
      const on = !state.torch; let applied = false;
      try { if (NN().setTorch) applied = NN().setTorch(on); } catch {}
      if (window.NovaNative && !applied) { notify({ app:"camera", title:"Torcia", text:"Torcia non disponibile su questo dispositivo." }); return; }
      set("torch", on); el.classList.toggle("on", state.torch); return;
    }
    if (act === "night")  { set("theme", state.theme === "dark" ? "light" : "dark"); renderQuick(); return; }
    if (act === "eye")    { toggle("eyeComfort"); el.classList.toggle("on", quickOn("eyeComfort")); return; }
    if (act === "audio")  { openSettings("sound"); return; }
    if (act === "qr")     { closeShade(); openQrScanner(); return; }
    if (act === "shot")   {
      closeShade();
      if (NN().screenshot) setTimeout(() => { try { NN().screenshot(); } catch {} }, 420);
      else setTimeout(() => notify({ app:"settings", title:"Schermata", text:"Acquisizione disponibile solo sul dispositivo." }), 300);
      return;
    }
  }
  function quickOn(k) {
    if (k === "nightMode") return state.theme === "dark";
    if (k === "audio" || k === "qr" || k === "screenshot") return false;   // azioni momentanee
    return !!state[k];
  }
  // apre le Impostazioni direttamente su una sezione (deep-link dalla tendina)
  let _settingsSection = null;
  function openSettings(sec) { _settingsSection = sec; closeShade(); openApp("settings"); }
  function takeSettingsSection() { const s = _settingsSection; _settingsSection = null; return s; }

  // scanner QR: usa BarcodeDetector (nativo, offline) + fotocamera; nessuna libreria esterna
  async function openQrScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify({ app:"camera", title:"Scansione QR", text:"Fotocamera non disponibile." }); return;
    }
    const ov = document.createElement("div"); ov.className = "qr-ov";
    ov.innerHTML = `<video id="qr-video" autoplay muted playsinline></video>
      <div class="qr-frame"></div><div class="qr-hint" id="qr-hint">Inquadra un codice QR</div>
      <button class="qr-close" id="qr-x">✕</button><div class="qr-result" id="qr-res"></div>`;
    (document.querySelector("#device") || document.body).appendChild(ov);
    let stream = null, raf = 0, stopped = false;
    const close = () => { stopped = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t=>t.stop()); ov.remove(); };
    ov.querySelector("#qr-x").onclick = close;
    try { stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } }); }
    catch (e) { ov.remove(); notify({ app:"camera", title:"Scansione QR", text:"Permesso fotocamera negato." }); return; }
    const video = ov.querySelector("#qr-video"); video.srcObject = stream;
    const Det = window.BarcodeDetector;
    if (!Det) { ov.querySelector("#qr-hint").textContent = "Scanner QR non supportato su questo dispositivo."; return; }
    let det; try { det = new Det({ formats:["qr_code"] }); } catch { ov.querySelector("#qr-hint").textContent = "Scanner non disponibile."; return; }
    const onResult = val => {
      stopped = true; cancelAnimationFrame(raf); vibrate(40);
      const res = ov.querySelector("#qr-res");
      const isUrl = /^https?:\/\//i.test(val);
      res.innerHTML = `<div class="qr-val">${escH(val)}</div>
        ${isUrl ? `<button class="btn" id="qr-open">Apri il link</button>` : `<button class="btn" id="qr-copy">Copia</button>`}
        <button class="btn ghost" id="qr-again">Scansiona ancora</button>`;
      res.classList.add("show");
      const op = res.querySelector("#qr-open"); if (op) op.onclick = () => { close(); if (window.NovaNative && NN().openBrowser) { try { NN().openBrowser(val); return; } catch {} } window.open(val, "_blank"); };
      const cp = res.querySelector("#qr-copy"); if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(val); } catch {} notify({ app:"camera", title:"QR", text:"Testo copiato." }); };
      const ag = res.querySelector("#qr-again"); if (ag) ag.onclick = () => { res.classList.remove("show"); stopped = false; scan(); };
    };
    const scan = async () => {
      if (stopped) return;
      try { const codes = await det.detect(video); if (codes && codes[0] && codes[0].rawValue) { onResult(codes[0].rawValue); return; } } catch {}
      raf = requestAnimationFrame(scan);
    };
    video.onloadedmetadata = () => scan();
  }

  // ============================================================
  //  API stato (usata dalle app, es. Impostazioni)
  // ============================================================
  function set(k, v) { state[k] = v; store.set(k, v);
    if (k==="theme") { applyTheme(); applyDisplay(); }
    if (["brightness","textScale","wallpaper","wallImage","wallFit","wallZoom","wallPosX","wallPosY","boldText","highContrast","reduceMotion","iconStyle","deskColor","iconColor","iconShape","accentColor","saver","adaptiveBright","eyeComfort"].includes(k)) applyDisplay();
    if (["iconStyle","deskColor","iconColor","iconShape","launcher","iconMap"].includes(k) && screens.home.classList.contains("active")) renderHome();
    if (k==="notifLock") renderLockNotifs();
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
    // scorrimento verso l'alto per sbloccare. Con il PIN NON sblocca subito: rivela il
    // tastierino (revealLock). Attivo solo quando il tastierino non è già mostrato.
    let sy = null;
    const swipeStage = () => $("#pinpad").classList.contains("hidden");   // fase "orologio"
    const start = y => { if (screens.lock.classList.contains("active") && swipeStage()) sy = y; };
    const move  = y => { if (sy===null) return; const dy = Math.min(0, y - sy);
      screens.lock.classList.add("dragging");
      screens.lock.style.transform = `translateY(${dy}px)`; screens.lock.style.opacity = String(1 + dy/500); };
    const end = y => { if (sy===null) return; const dy = y - sy;
      screens.lock.classList.remove("dragging"); screens.lock.style.transform=""; screens.lock.style.opacity="";
      if (dy < -80) revealLock(); sy = null; };
    screens.lock.addEventListener("touchstart", e => start(e.touches[0].clientY));
    screens.lock.addEventListener("touchmove",  e => move(e.touches[0].clientY));
    screens.lock.addEventListener("touchend",   e => end(e.changedTouches[0].clientY));
    screens.lock.addEventListener("mousedown",  e => start(e.clientY));
    window.addEventListener("mousemove", e => { if(sy!==null) move(e.clientY); });
    window.addEventListener("mouseup",   e => { if(sy!==null) end(e.clientY); });
    // tocco semplice sull'orologio: rivela il PIN (o sblocca se non serve). Sul tastierino no.
    screens.lock.addEventListener("click", e => { if (swipeStage() && !e.target.closest("#pinpad")) revealLock(); });

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
    // modifica home dalla tendina
    $("#shade-edit").addEventListener("click", () => {
      closeShade(); goHome(); editing = true; renderHome();
    });
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
    // suoneria sveglia scelta, in loop, al volume impostato
    Sounds.alarm(state.alarmSound, (state.volAlarm==null?80:state.volAlarm)/100*0.45);
    const ov = document.createElement("div");
    ov.className = "alarm-ring";
    ov.innerHTML = `<div class="ar-time">${time}</div><div class="ar-label">⏰ Sveglia</div>
      <div class="ar-actions"><button id="ar-snooze">Posponi 5 min</button><button id="ar-stop">Ferma</button></div>`;
    $("#device").appendChild(ov);
    const stop = () => { Sounds.stop(); if(navigator.vibrate) navigator.vibrate(0); ov.remove(); };
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
    // cronologia notifiche disattivata → non conservare le notifiche tra i riavvii
    if (!state.notifHistory && notifs.length) { notifs.length = 0; saveNotifs(); }
    show("boot");
    renderStatusbars(); renderClocks(); renderNotifs(); renderQuick();
    initBattery(); initAlarms();
    // niente notifiche fittizie: la tendina mostra solo eventi reali (posta, sveglie,
    // conferme delle app) e le notifiche persistono finché non le scarti.
    setInterval(() => { renderClocks(); renderStatusbars(); }, 1000);
    initAutolock();
    // Ricezione screenshot dal nativo: lo aggiunge alla Galleria di NovaOS (album Schermate)
    window.__novaShot = (dataURI) => {
      if (!dataURI) return;
      photos.add(dataURI, { album:"Schermate", shot:true })
        .then(() => notify({ app:"gallery", title:"Schermata acquisita", text:"Aperta nella Galleria di NovaOS." }))
        .catch(() => {});
    };
    Updater.autoCheck();   // controlla in autonomia se c'è un aggiornamento (e notifica)
    setTimeout(() => lockDevice(), 2600);
  }

  // blocco automatico per inattività: dopo N secondi senza tocchi/tasti la schermata
  // si blocca davvero (mostra il lockscreen). N = il minore tra "spegnimento schermo"
  // (Display) e "blocco automatico" (Sicurezza). Con blocco "Nessuno" non si attiva.
  let lastActivity = Date.now();
  function noteActivity() { lastActivity = Date.now(); }
  function initAutolock() {
    // ogni interazione reale (tocco, movimento, tasto, scroll, click, digitazione)
    // rimanda il blocco: così NON scatta mentre si sta effettivamente usando il telefono.
    ["pointerdown","pointermove","pointerup","touchstart","touchmove","keydown","wheel","click","input","scroll"]
      .forEach(ev => window.addEventListener(ev, noteActivity, { capture:true, passive:true }));
    document.addEventListener("scroll", noteActivity, { capture:true, passive:true });
    // tornando su NovaOS (es. dopo il browser nativo di una web app) si riparte da zero,
    // per non trovarsi bloccati appena si rientra.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) noteActivity(); });
    setInterval(() => {
      if (state.lockType === "none") return;
      if (document.hidden) return;   // schermo/app in background: il conteggio riprende al ritorno
      if (!(screens.home.classList.contains("active") || screens.app.classList.contains("active"))) return;
      const secs = Math.min(state.autolock || 30, state.screenTimeout || 30);
      if (Date.now() - lastActivity >= secs * 1000) { noteActivity(); lockDevice(); }
    }, 1000);
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
      async add(dataURL, extra) {
        const db = await open();
        return new Promise((res, rej) => {
          const item = Object.assign({ id: Date.now()+"_"+Math.random().toString(36).slice(2,7), data: dataURL, ts: Date.now() }, extra||{});
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

  // ---- Backup / ripristino dati ----
  //  Raccoglie tutte le chiavi nova:* (impostazioni + dati app leggeri, salvati in
  //  doppia copia localStorage+SharedPreferences). NON include foto/registrazioni
  //  (IndexedDB, binari pesanti). restore riscrive nelle DUE copie e conta le voci.
  function backupData() {
    const d = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("nova:") === 0) d[k] = localStorage.getItem(k); } } catch {}
    // integra eventuali chiavi presenti solo nelle prefs native (se il bridge le elenca)
    try { const nn = _prefs(); if (nn && nn.prefKeys) { const raw = nn.prefKeys(); const keys = raw ? JSON.parse(raw) : []; keys.forEach(k => { if (k && k.indexOf("nova:") === 0 && !(k in d)) { const v = nn.prefGet(k); if (v != null) d[k] = v; } }); } } catch {}
    return d;
  }
  function restoreData(d) {
    if (!d || typeof d !== "object") return 0;
    let n = 0;
    for (const k in d) {
      if (k.indexOf("nova:") !== 0) continue;
      const v = String(d[k]);
      try { localStorage.setItem(k, v); } catch {}
      try { if (_prefs().prefSet) _prefs().prefSet(k, v); } catch {}
      n++;
    }
    return n;
  }

  // API esposta alle app
  const api = {
    state, store, notify, confirm: confirmDialog, toggle, set, interval, openApp, goHome, lockDevice, factoryReset,
    launchers: launcherList, renderHome, applyLayoutOrder, applyThemeLayout, backup: backupData, restore: restoreData,
    WALLS, photos, vibrate, sounds: Sounds, updater: Updater,
    openSettings, takeSettingsSection,
    // gestione app di terze parti
    installApp, uninstallApp, updateApp, userApps,
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
  const stopRing = () => { try { OS.api.sounds.stop(); } catch {} };
  function close() { stopRing(); if (timer){clearInterval(timer);timer=null;} if (ov){ov.remove();ov=null;} muted=false; spk=false; }
  function update(state, number, name) {
    if (state === "ended") { close(); return; }
    if (!ov) build();
    ov.dataset.state = state;
    setContact(number, name);
    const st = ov.querySelector(".call-state");
    if (state === "incoming") { st.textContent = "Chiamata in arrivo…";
      // suoneria scelta in Impostazioni, in loop, finché non si risponde/termina
      try { const S = OS.api.state; if (!S.dnd) OS.api.sounds.ring(S.ringtone, (S.volRing==null?70:S.volRing)/100*0.5); } catch {}
    }
    else if (state === "dialing")  { stopRing(); st.textContent = "Chiamata in corso…"; }
    else if (state === "active")   { stopRing(); startTimer(); }
  }
  return { update };
})();

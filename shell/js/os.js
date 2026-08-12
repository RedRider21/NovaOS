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
    // aspetto icone/desktop: stile "filled" (tessere colorate) o "outline" (contorno
    // monocromatico); colori personalizzati opzionali (vuoto = default del tema)
    iconStyle: "filled", deskColor: "", iconColor: "",
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
    document.documentElement.style.fontSize = (16 * state.textScale/100) + "px";
    $("#bright-overlay").style.opacity = String((100 - state.brightness) / 100 * 0.7);
    // il colore base viene dal tema (CSS var --bg); il wallpaper è solo la tinta sopra.
    // se l'utente ha scelto un colore di fondo, quello vince (tinta unita, niente wallpaper).
    const w = WALLS[state.wallpaper] || WALLS[0];
    const desk = state.deskColor || "var(--bg)";
    screens.home.style.backgroundColor = desk;
    screens.home.style.backgroundImage = state.deskColor ? "none" : w;
    // aspetto icone: stile e colori personalizzati (usati dal CSS via variabili)
    document.body.classList.toggle("icons-outline", state.iconStyle === "outline");
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--icon-color", state.iconColor || (state.theme==="dark" ? "#e8ecf4" : "#141a24"));
    rootStyle.setProperty("--icon-bg", state.deskColor || "var(--bg)");
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
  // ============================================================
  //  Home a pagine + cartelle (modificabile solo in modalità edit)
  // ============================================================
  let homePage = 0, editing = false;
  const escH = s => (s==null?"":String(s)).replace(/[<>&"]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[c]));
  const dockIds = () => NovaApps.dock.map(a => a.id);
  const pageableIds = () => { const d = dockIds(); return allApps().map(a=>a.id).filter(id => !d.includes(id)); };

  // ricostruisce/normalizza il layout: rimuove app sparite, dissolve cartelle <2,
  // aggiunge le app nuove non ancora posizionate, garantisce almeno una pagina.
  function homeLayout() {
    const ids = pageableIds(); const idset = new Set(ids);
    let L = store.get("homeLayout", null);
    const PER = 16;
    if (!L || !Array.isArray(L.pages)) {
      L = { pages: [] };
      for (let i=0;i<ids.length;i+=PER) L.pages.push(ids.slice(i,i+PER).map(id=>({t:"app",id})));
    } else {
      const placed = new Set();
      L.pages = L.pages.map(pg => (pg||[]).map(it => {
        if (it && it.t==="folder") {
          const items = (it.items||[]).filter(id => idset.has(id) && !placed.has(id));
          items.forEach(id=>placed.add(id));
          return { t:"folder", name: it.name||"Cartella", items };
        }
        if (it && idset.has(it.id) && !placed.has(it.id)) { placed.add(it.id); return { t:"app", id:it.id }; }
        return null;
      }).filter(Boolean));
      // dissolvi cartelle con meno di 2 elementi
      L.pages = L.pages.map(pg => pg.flatMap(it => it.t==="folder" ? (it.items.length>=2 ? [it] : it.items.map(id=>({t:"app",id}))) : [it]));
      // rimuovi automaticamente le pagine vuote; in modifica si conserva solo quella
      // attualmente visualizzata (così puoi aggiungerne una col "+" e riempirla).
      L.pages = L.pages.filter((pg,i) => pg.length || (editing && i===homePage));
      // app nuove -> in coda all'ultima pagina
      const missing = ids.filter(id => !placed.has(id));
      if (missing.length) { if (!L.pages.length) L.pages.push([]); missing.forEach(id => L.pages[L.pages.length-1].push({t:"app",id})); }
      // paginazione automatica: nessun desktop supera PER icone → si spande sui successivi
      // (così tante app riempiono più desktop invece di far scorrere una pagina).
      const capped = [];
      L.pages.forEach(pg => {
        if (pg.length <= PER) capped.push(pg);
        else for (let i=0;i<pg.length;i+=PER) capped.push(pg.slice(i,i+PER));
      });
      L.pages = capped;
    }
    if (!L.pages.length) L.pages.push([]);
    return L;
  }
  const saveLayout = L => store.set("homeLayout", L);

  function renderHome() {
    const host = $("#app-grid");
    const L = homeLayout();
    homePage = Math.max(0, Math.min(homePage, L.pages.length-1));
    host.classList.toggle("editing", editing);
    host.innerHTML = `
      <div class="home-track" style="transform:translateX(${-homePage*100}%)">
        ${L.pages.map((pg,pi)=>`<div class="home-page" data-page="${pi}">${pg.map((it,ii)=>homeIcon(it,pi,ii)).join("")}</div>`).join("")}
      </div>
      <div class="page-dots">
        ${L.pages.map((_,pi)=>`<span class="dot ${pi===homePage?'on':''}" data-dot="${pi}"></span>`).join("")}
        ${editing?`<button class="dot-add" id="add-page" title="Nuova pagina">＋</button>`:''}
      </div>
      ${editing?`<div class="edit-bar"><span>Trascina le icone · tienile su un'altra per creare una cartella</span><button class="home-done" id="home-done">✓ Fine</button></div>`:''}`;
    bindHome(L, host);
    const dock = $("#dock"); dock.innerHTML = "";
    NovaApps.dock.forEach((a, i) => dock.appendChild(iconEl(a, i)));
  }

  function homeIcon(it, pi, ii) {
    if (it.t === "folder") {
      const mini = it.items.map(appById).filter(Boolean).slice(0,4).map(a => {
        const isImg = /^(https?:|data:)/.test(a.icon||"");
        return `<span style="background:${a.color}${isImg?`;background-image:url('${a.icon}')`:''}">${isImg?'':a.icon}</span>`;
      }).join("");
      return `<div class="app-icon folder" data-loc="${pi}:${ii}"><div class="glyph folder-glyph">${mini}</div><div class="label">${escH(it.name)}</div></div>`;
    }
    const a = appById(it.id); if (!a) return "";
    const isImg = /^(https?:|data:)/.test(a.icon||"");
    const glyph = isImg
      ? `<div class="glyph" style="background:${a.color};padding:0;overflow:hidden"><img src="${a.icon}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🌐'"></div>`
      : `<div class="glyph" style="background:${a.color}">${a.icon}</div>`;
    return `<div class="app-icon" data-loc="${pi}:${ii}" data-app="${a.id}">${editing&&a.web?`<button class="icon-rm" data-rm="${a.id}">✕</button>`:''}${glyph}<div class="label">${a.name}</div></div>`;
  }

  function bindHome(L, host) {
    const done = host.querySelector("#home-done");
    if (done) done.onclick = () => { editing = false; saveLayout(L); renderHome(); };
    const addP = host.querySelector("#add-page");
    if (addP) addP.onclick = () => { L.pages.push([]); saveLayout(L); homePage = L.pages.length-1; renderHome(); };
    host.querySelectorAll(".dot").forEach(d => d.onclick = () => { homePage = +d.dataset.dot; renderHome(); });
    host.querySelectorAll(".icon-rm").forEach(b => b.onclick = e => {
      e.stopPropagation(); const id = b.dataset.rm;
      if (confirm(`Rimuovere "${(appById(id)||{}).name||id}"?`)) { uninstallApp(id); saveLayout(homeLayout()); renderHome(); }
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
      if (editing) return;
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
      if (!active || editing) return;
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
        // bordo sinistro/destro: dopo una breve attesa cambia pagina (per spostare
        // l'icona su un altro desktop). Zone ampie e attesa breve per renderlo facile.
        const w = window.innerWidth, dir = ev.clientX < w*0.16 ? -1 : ev.clientX > w*0.84 ? 1 : 0;
        host.querySelectorAll(".dot").forEach((d,di) => d.classList.toggle("drop-target", dir && (homePage+dir)===di));
        if (dir !== edgeDir) {
          edgeDir = dir; clearTimeout(edgeTimer);
          if (dir) edgeTimer = setTimeout(() => {
            let np = homePage + dir;
            // trascinando oltre l'ultima pagina si crea un nuovo desktop al volo
            // (senza renderHome, che interromperebbe il trascinamento in corso)
            if (dir > 0 && np >= L.pages.length) {
              L.pages.push([]);
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
            if (np >= 0 && np < L.pages.length) { homePage = np; track.style.transform = `translateX(${-homePage*100}%)`;
              host.querySelectorAll(".dot").forEach(d => d.classList.toggle("on", +d.dataset.dot===homePage)); }
            edgeDir = 0;   // consente un ulteriore cambio pagina se si resta sul bordo
          }, 350);
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
        const tIcon = u && u.closest(".app-icon");
        const tPage = u && u.closest(".home-page");
        if (dot) { const p = +dot.dataset.dot; if (p!==pi || true) { L.pages[pi].splice(ii,1); L.pages[p].push(src); } saveLayout(L); renderHome(); return; }
        if (tIcon && tIcon !== el && tIcon.dataset.loc) {
          const [tpi,tii] = tIcon.dataset.loc.split(":").map(Number);
          const tItem = L.pages[tpi][tii];
          const r = tIcon.getBoundingClientRect();
          const near = Math.abs(ev.clientX-(r.left+r.width/2)) < r.width*0.34 && Math.abs(ev.clientY-(r.top+r.height/2)) < r.height*0.34;
          if (near && src.t==="app" && tItem.t==="folder") { L.pages[pi].splice(ii,1); tItem.items.push(src.id); saveLayout(L); renderHome(); return; }
          if (near && src.t==="app" && tItem.t==="app") {
            L.pages[pi].splice(ii,1);
            let a = tpi, b = tii; if (tpi===pi && ii<tii) b--;
            L.pages[a][b] = { t:"folder", name:"Cartella", items:[tItem.id, src.id] };
            saveLayout(L); renderHome(); return;
          }
          // riordino: inserisci prima dell'icona target
          L.pages[pi].splice(ii,1);
          let tb = tii; if (tpi===pi && ii<tii) tb--;
          L.pages[tpi].splice(tb,0,src); saveLayout(L); renderHome(); return;
        }
        if (tPage) { const p = +tPage.dataset.page; if (p!==pi) { L.pages[pi].splice(ii,1); L.pages[p].push(src); saveLayout(L); } renderHome(); return; }
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
        L.pages[pi].push({ t:"app", id });
        if (f.items.length < 2) {                       // dissolvi: l'ultima app torna sulla pagina
          const rem = f.items[0];
          L.pages[pi].splice(ii, 1, ...(rem ? [{t:"app",id:rem}] : []));
          saveLayout(L); ov.remove(); renderHome(); return;
        }
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
    // web app sul device: apri nel browser nativo a schermo intero. Così i siti che
    // vietano l'incorporamento in iframe (WhatsApp Web, Telegram Web, banche, Google…)
    // si aprono davvero, invece di restare bianchi.
    if (a.web && window.NovaNative && window.NovaNative.openBrowser) {
      try { window.NovaNative.openBrowser(a.url); return; } catch (e) {}
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
    notifs.unshift({ id:++notifId, icon:a.icon, color:a.color, title, text,
      ts: Date.now(), time: new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}) });
    if (notifs.length > 40) notifs.length = 40;
    saveNotifs();
    renderNotifs();
    if (screens.lock.classList.contains("active")) renderLockNotifs();
    if (!state.dnd) { pulse(); vibrate(60); }
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
  function renderLockNotifs() { const el = $("#lock-notifs"); if (el) el.innerHTML = notifs.slice(0,4).map(notifHtml).join(""); }
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

  // pannello rapido stile Android: pulsanti tondi con icona + slider luminosità.
  // I sensori (Wi-Fi/BT/aereo/posizione/NFC) sul dispositivo agiscono davvero
  // (o aprono il pannello di sistema); gli interruttori software cambiano subito.
  function renderQuick() {
    if (hasNativeSensors()) syncQuickSensors();
    const native = hasNativeSensors();
    // k = chiave stato · ic = icona · l = etichetta · sensor/panel = gestione hardware
    const tiles = [
      { k:"wifi",      ic:"📶", l:"Wi-Fi",      sensor:true, panel:"wifi" },
      { k:"bt",        ic:"🔵", l:"Bluetooth",  sensor:true, panel:"bluetooth" },
      { k:"dnd",       ic:"🌙", l:"Non dist." },
      { k:"airplane",  ic:"✈️", l:"Aereo",      sensor:true, panel:"airplane" },
      { k:"theme",     ic:"🌗", l:"Tema" },
      { k:"location",  ic:"📍", l:"Posizione",  sensor:true, panel:"location" },
      { k:"vibrate",   ic:"📳", l:"Vibrazione" },
      { k:"saver",     ic:"🔋", l:"Risparmio" },
      { k:"autoRotate",ic:"🔄", l:"Rotazione" },
      { k:"nfc",       ic:"📡", l:"NFC",        sensor:true, panel:"nfc" },
    ];
    $("#shade-quick").innerHTML = `
      <div class="qs-grid">
        ${tiles.map(t => `<button class="qtile ${quickOn(t.k)?'on':''}" data-q="${t.k}" data-sensor="${t.sensor?1:0}" data-panel="${t.panel||''}">
          <span class="q-ico">${t.ic}</span><span class="q-lbl">${t.l}</span></button>`).join("")}
      </div>
      <div class="qs-bright"><span>🔅</span><input type="range" class="slider" id="qs-bri" min="20" max="100" value="${state.brightness}"><span>🔆</span></div>`;
    const SETFN = { wifi:"setWifi", bt:"setBluetooth", airplane:"setAirplane", location:"setLocation", nfc:"setNfc" };
    $("#shade-quick").querySelectorAll(".qtile").forEach(el => el.onclick = () => {
      const k = el.dataset.q, isSensor = el.dataset.sensor === "1";
      if (isSensor && native) {
        // sul dispositivo: prova l'azione reale; se applicata in-process (ROM
        // privilegiato) aggiorna la tile senza uscire, altrimenti si apre il
        // pannello di sistema e chiudiamo la tendina per renderlo visibile.
        let applied = false;
        try { const fn = SETFN[k]; if (fn && NN()[fn]) applied = NN()[fn](!state[k]); } catch (e) {}
        if (applied) { syncQuickSensors(); renderQuick(); }
        else closeShade();
        return;
      }
      toggle(k);        // software (o simulazione sensori in sviluppo)
      el.classList.toggle("on", quickOn(k));
    });
    const bri = $("#qs-bri"); if (bri) bri.oninput = e => set("brightness", +e.target.value);
  }
  function quickOn(k) { return k==="theme" ? state.theme==="dark" : !!state[k]; }

  // ============================================================
  //  API stato (usata dalle app, es. Impostazioni)
  // ============================================================
  function set(k, v) { state[k] = v; store.set(k, v);
    if (k==="theme") { applyTheme(); applyDisplay(); }
    if (["brightness","textScale","wallpaper","boldText","highContrast","reduceMotion","iconStyle","deskColor","iconColor"].includes(k)) applyDisplay();
    if (["iconStyle","deskColor","iconColor"].includes(k) && screens.home.classList.contains("active")) renderHome();
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
    // niente notifiche fittizie: la tendina mostra solo eventi reali (posta, sveglie,
    // conferme delle app) e le notifiche persistono finché non le scarti.
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

/* ============================================================
   NovaOS — registro delle app di sistema
   Ogni app: id, name, icon, color, dock?, render(root, os).
   Le web app di terze parti sono gestite a runtime da os.js (Store).
   ============================================================ */

const NovaApps = (() => {
  const app = d => d;

  // Icona flat (SVG monocromatico da NovaIcons); eredita il colore del testo.
  // Uso: ICO("telephone-fill") oppure ICO("gear-fill","width:22px;height:22px").
  const ICO = (name, css) => {
    const inner = (window.NovaIcons && NovaIcons.svg && NovaIcons.svg[name]) || "";
    if (!inner) return "";
    return `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="width:1em;height:1em;vertical-align:-.125em;${css||''}">${inner}</svg>`;
  };

  /* ---------- Telefono (tastierino + recenti + chiamata reale) ---------- */
  const phone = app({ id:"phone", name:"Telefono", icon:"📞", color:"#35c759", dock:true,
    render(root, os) {
      const native = typeof window.NovaNative !== "undefined";
      let log = os.store.get("callLog", []);
      const saveLog = () => os.store.set("callLog", log);
      const norm = s => (s||"").replace(/[\s\-()]/g,"");
      const contactFor = num => { const n = norm(num); return os.store.get("contacts", []).find(x=>norm(x.phone)===n) || null; };
      const nameOf = num => { const c = contactFor(num); return c ? c.name : null; };
      const H = s => [...(s||"?")].reduce((a,c)=>a+c.charCodeAt(0),0);
      const grad = n => { const h=H(n)%360; return `linear-gradient(135deg,hsl(${h} 62% 52%),hsl(${(h+40)%360} 62% 44%))`; };
      const initials = n => (n||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
      let tab = "keypad";

      const placeCall = (num) => {
        num = (num||"").trim(); if (!num) return;
        log.unshift({ num, name:nameOf(num), time:Date.now(), dir:"out" });
        log = log.slice(0, 50); saveLog();
        os.vibrate(30);
        if (native && window.NovaNative.call) window.NovaNative.call(num);
        else window.location.href = "tel:" + encodeURIComponent(num);
        os.notify({ app:"phone", title:"Chiamata", text:"Composizione " + (nameOf(num)||num) + "…" });
      };

      const ago = ts => { const m = Math.floor((Date.now()-ts)/60000);
        if (m<1) return "ora"; if (m<60) return m+" min fa"; const h=Math.floor(m/60);
        if (h<24) return h+" h fa"; return new Date(ts).toLocaleDateString("it-IT",{day:"numeric",month:"short"}); };

      const DIR = {
        out:    { ico:"↗", label:"Uscita",  col:"#35c759", txt:"var(--text)" },
        in:     { ico:"↙", label:"Entrata", col:"#0a84ff", txt:"var(--text)" },
        missed: { ico:"↙", label:"Persa",   col:"#ff453a", txt:"#ff453a" },
      };

      const shell = (body) => {
        root.innerHTML = `
          <div class="hero"><div class="hero-l"><h1>Telefono</h1>
            <div class="hero-sub">${native ? "Modem nativo collegato" : "Dialer di sistema (tel:)"}</div></div></div>
          <div class="seg" style="margin:6px 16px 12px">
            <button data-t="keypad" class="${tab==='keypad'?'on':''}">Tastierino</button>
            <button data-t="recents" class="${tab==='recents'?'on':''}">Recenti</button></div>
          <div id="ph-body">${body}</div>`;
        root.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { tab=b.dataset.t; render(); });
      };

      const keypad = () => {
        const keys = [["1",""],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],
                      ["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]];
        shell(`
          <div style="text-align:center;height:60px">
            <div id="dial-num" style="font-size:calc(34px*var(--fscale,1));letter-spacing:2px;line-height:38px;min-height:38px;font-weight:500"></div>
            <div id="dial-name" style="font-size:calc(14px*var(--fscale,1));color:var(--accent);min-height:18px"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:12px 44px">
            ${keys.map(([k,sub])=>`<button class="dial-k" data-k="${k}" style="aspect-ratio:1;border-radius:50%;border:none;background:var(--surface);color:var(--text);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1">
              <span style="font-size:calc(27px*var(--fscale,1));font-weight:500">${k}</span><span style="font-size:calc(9px*var(--fscale,1));letter-spacing:2px;color:var(--text-dim);height:10px">${sub}</span></button>`).join("")}
          </div>
          <div style="display:flex;justify-content:center;align-items:center;gap:26px;padding-top:6px">
            <span style="width:52px"></span>
            <button id="call" style="width:72px;height:72px;border-radius:50%;border:none;background:linear-gradient(135deg,#3ad06a,#25b257);color:#fff;font-size:calc(28px*var(--fscale,1));cursor:pointer;box-shadow:0 8px 22px rgba(53,199,89,.4)">📞</button>
            <button id="del" style="width:52px;height:52px;border-radius:50%;border:none;background:var(--surface);color:var(--text);font-size:calc(20px*var(--fscale,1));cursor:pointer;display:none">⌫</button>
          </div>`);
        const out = root.querySelector("#dial-num");
        const nm  = root.querySelector("#dial-name");
        const del = root.querySelector("#del");
        const sync = () => {
          const v = out.textContent;
          del.style.display = v ? "" : "none";
          const c = contactFor(v);
          nm.textContent = c ? c.name : "";
        };
        const type = ch => { out.textContent += ch; os.vibrate(15); sync(); };
        root.querySelectorAll(".dial-k").forEach(b => {
          const k = b.dataset.k;
          b.onclick = () => type(k);
          if (k === "0") {
            let t; const start = () => { t = setTimeout(()=>{ out.textContent = out.textContent.slice(0,-1)+"+"; os.vibrate(30); sync(); }, 450); };
            const cancel = () => clearTimeout(t);
            b.addEventListener("touchstart", start, {passive:true}); b.addEventListener("mousedown", start);
            ["touchend","touchcancel","mouseup","mouseleave"].forEach(ev=>b.addEventListener(ev, cancel));
          }
        });
        del.onclick = () => { out.textContent = out.textContent.slice(0,-1); os.vibrate(10); sync(); };
        let dt; del.addEventListener("mousedown", ()=>{ dt=setTimeout(()=>{ out.textContent=""; os.vibrate(30); sync(); },450); });
        ["mouseup","mouseleave"].forEach(ev=>del.addEventListener(ev, ()=>clearTimeout(dt)));
        root.querySelector("#call").onclick = () => placeCall(out.textContent);
        sync();
      };

      const recents = () => {
        shell(log.length ? `<div class="list" style="padding-top:2px">${log.map((c,i)=>{const D=DIR[c.dir]||DIR.out; const known=!!c.name; const nm=c.name||c.num;return `
          <div class="card tappable" data-i="${i}"><div class="c-ico av" style="background:${grad(nm)}">${initials(nm)}</div>
            <div class="c-body"><div class="c-title" style="color:${D.txt}">${nm}</div>
              <div class="c-sub"><span style="color:${D.col}">${D.ico}</span> ${D.label}${known?" · "+c.num:""} · ${ago(c.time)}</div></div>
            ${known?"":`<button data-add="${c.num}" title="Aggiungi a contatti" style="background:none;border:none;font-size:calc(19px*var(--fscale,1));cursor:pointer;color:var(--accent)">＋</button>`}
            <button data-call="${c.num}" class="round-act small" style="background:linear-gradient(135deg,#3ad06a,#25b257)">📞</button></div>`;}).join("")}
          <button class="btn ghost" id="clear" style="margin:12px 16px;color:var(--danger)">Cancella cronologia</button><div style="height:80px"></div></div>`
          : `<div style="text-align:center;color:var(--text-dim);padding:48px">Nessuna chiamata recente</div>`);
        root.querySelectorAll("[data-call]").forEach(b => b.onclick = (e) => { e.stopPropagation(); placeCall(b.dataset.call); });
        root.querySelectorAll("[data-add]").forEach(b => b.onclick = (e) => {
          e.stopPropagation();
          const cs = os.store.get("contacts", []);
          cs.push({ id:Date.now(), name:b.dataset.add, phone:b.dataset.add, email:"" });
          os.store.set("contacts", cs);
          os.notify({ app:"contacts", title:"Contatto creato", text:"Apri la Rubrica per aggiungere nome e foto." });
          os.openApp("contacts");
        });
        root.querySelectorAll("[data-i]").forEach(el => el.onclick = () => placeCall(log[+el.dataset.i].num));
        const clr = root.querySelector("#clear"); if (clr) clr.onclick = () => { log=[]; saveLog(); recents(); };
      };

      const render = () => tab==="keypad" ? keypad() : recents();
      render();
    }});

  /* ---------- Messaggi (conversazioni funzionanti) ---------- */
  const messages = app({ id:"messages", name:"Messaggi", icon:"💬", color:"#34c759", dock:true,
    render(root, os) {
      const seed = {
        "Anna":   [["in","Ci vediamo alle 18?","16:04"]],
        "Papà":   [["in","Ho preso il pane 🥖","14:20"]],
        "Team NovaOS": [["in","Build 0.1 pronta ✅","ieri"]],
      };
      const threads = os.store.get("threads", seed);
      const save = () => os.store.set("threads", threads);
      const last = t => t[t.length-1];
      const now = () => new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
      const H = s => [...(s||"?")].reduce((a,c)=>a+c.charCodeAt(0),0);
      const grad = n => { const h=H(n)%360; return `linear-gradient(135deg,hsl(${h} 62% 52%),hsl(${(h+40)%360} 62% 44%))`; };
      const initials = n => n.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
      const resolveNumber = name => {
        if (/^[+\d][\d\s]{4,}$/.test(name)) return name.replace(/\s/g,"");
        const c = os.store.get("contacts", []).find(x => x.name === name);
        return c ? c.phone.replace(/\s/g,"") : null;
      };
      const esc = s => (s==null?"":String(s)).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));

      const autoReply = (txt) => {
        const t = txt.toLowerCase();
        if (t.includes("?")) return ["Sì, per me va bene 👍","Certo!","Ci penso e ti dico 😉","Dipende, a che ora?"][Math.floor(Math.random()*4)];
        if (/ciao|buongiorno|salve|ehi/.test(t)) return ["Ciao! 😊","Ehilà!","Ciao, come stai?"][Math.floor(Math.random()*3)];
        if (/grazie/.test(t)) return ["Di nulla! 🙌","Figurati","Quando vuoi!"][Math.floor(Math.random()*3)];
        return ["Perfetto 👍","Ok!","A dopo","Va bene 😊","Ci sentiamo","👍"][Math.floor(Math.random()*6)];
      };

      const drawList = () => {
        root.innerHTML = `<div class="hero"><div class="hero-l"><h1>Messaggi</h1></div></div>
          <div class="searchbar"><span class="sb-i">🔍</span><input id="q" placeholder="Cerca nelle conversazioni"></div>
          <div class="list" id="mlist"></div><div style="height:90px"></div>
          <button class="fab" id="new">✍️<span class="fab-t">Nuovo</span></button>`;
        const drawRows = (filter="") => {
          const f = filter.trim().toLowerCase();
          const names = Object.keys(threads).sort((a,b)=>{
            const la=last(threads[a]), lb=last(threads[b]);
            return (lb?lb[3]||0:0)-(la?la[3]||0:0);
          }).filter(n => !f || n.toLowerCase().includes(f) || (last(threads[n])&&last(threads[n])[1].toLowerCase().includes(f)));
          const box = root.querySelector("#mlist");
          box.innerHTML = names.length?names.map(n=>{const l=last(threads[n]);return `
            <div class="card tappable" data-n="${n}"><div class="c-ico av" style="background:${grad(n)}">${initials(n)}</div>
            <div class="c-body"><div class="c-title">${n}</div><div class="c-sub">${l?(l[0]==='out'?'Tu: ':'')+esc(l[1]):'—'}</div></div>
            <div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1))">${l?l[2]:''}</div></div>`;}).join("")
            :`<div style="text-align:center;color:var(--text-dim);padding:44px">${f?'Nessun risultato':'Nessuna conversazione'}</div>`;
          box.querySelectorAll("[data-n]").forEach(el => el.onclick = () => drawThread(el.dataset.n));
        };
        drawRows();
        root.querySelector("#q").oninput = e => drawRows(e.target.value);
        root.querySelector("#new").onclick = drawNew;
      };

      const drawNew = () => {
        const contacts = os.store.get("contacts", []);
        root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title">Nuovo messaggio</div></div>
          <div style="padding:0 16px 8px"><input id="to" placeholder="A: nome o numero" style="width:100%;background:var(--surface);border:none;border-radius:12px;padding:12px 14px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none"></div>
          <div class="section-label">Contatti</div><div class="group" id="clist"></div>
          <div style="padding:16px"><button class="btn" id="ok">Avvia conversazione</button></div>`;
        root.querySelector(".back-btn").onclick = drawList;
        const open = name => { name=name.trim(); if(!name) return; if(!threads[name]) threads[name]=[]; save(); drawThread(name); };
        const drawContacts = (filter="") => {
          const f = filter.trim().toLowerCase();
          const rows = contacts.filter(c => !f || c.name.toLowerCase().includes(f) || (c.phone||"").replace(/\s/g,"").includes(f.replace(/\s/g,"")));
          root.querySelector("#clist").innerHTML = rows.length ? rows.map(c=>`
            <div class="item" data-c="${c.name}"><div class="i-ico av" style="background:${grad(c.name)}">${initials(c.name)}</div>
              <div class="i-body"><div class="i-title">${c.name}</div><div class="i-sub">${c.phone}</div></div></div>`).join("")
            : `<div class="item"><div class="i-sub" style="padding:6px">Nessun contatto</div></div>`;
          root.querySelectorAll("[data-c]").forEach(el => el.onclick = () => open(el.dataset.c));
        };
        drawContacts();
        root.querySelector("#to").oninput = e => drawContacts(e.target.value);
        root.querySelector("#ok").onclick = () => open(root.querySelector("#to").value);
      };

      const drawThread = (name) => {
        const msgs = threads[name];
        const bubbles = () => msgs.map(([dir,txt,t])=>`
          <div style="display:flex;flex-direction:column;align-items:${dir==='out'?'flex-end':'flex-start'};padding:2px 12px">
            <div style="max-width:76%;padding:10px 15px;font-size:calc(15px*var(--fscale,1));background:${dir==='out'?'var(--accent)':'var(--surface)'};color:${dir==='out'?'#fff':'var(--text)'};white-space:pre-wrap;word-break:break-word;border-radius:${dir==='out'?'20px 20px 5px 20px':'20px 20px 20px 5px'}">${esc(txt)}</div>
            <div style="font-size:calc(10px*var(--fscale,1));color:var(--text-dim);margin:2px 8px">${t||''}</div>
          </div>`).join("");
        root.innerHTML = `
          <div class="back-bar"><button class="back-btn"></button>
            <div class="i-ico av" style="background:${grad(name)};width:36px;height:36px;border-radius:50%">${initials(name)}</div>
            <div class="back-title" style="flex:1;font-size:calc(18px*var(--fscale,1))">${name}</div>
            <button id="delc" style="background:none;border:none;font-size:calc(17px*var(--fscale,1));cursor:pointer">🗑️</button></div>
          <div id="thread" style="flex:1;padding:8px 0 12px;display:flex;flex-direction:column;gap:2px;overflow-y:auto">${bubbles()}</div>
          <div style="display:flex;gap:8px;padding:10px 12px;position:sticky;bottom:0;background:var(--bg)">
            <input id="msg" placeholder="Messaggio" style="flex:1;background:var(--surface);border:none;border-radius:22px;padding:12px 18px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none">
            <button id="send" class="round-act small" style="background:var(--accent)">➤</button>
          </div>`;
        root.querySelector(".back-btn").onclick = drawList;
        root.querySelector("#delc").onclick = async () => { if(await os.confirm({title:"Eliminare conversazione?",message:"La chat con "+name+" verrà eliminata.",okText:"Elimina"})){ delete threads[name]; save(); drawList(); } };
        const th = root.querySelector("#thread"); th.scrollTop = th.scrollHeight;
        const input = root.querySelector("#msg");
        const nativeSms = window.NovaNative && window.NovaNative.sendSms;
        const send = () => {
          const v = input.value.trim(); if(!v) return;
          msgs.push(["out",v,now(),Date.now()]); save(); input.value="";
          th.innerHTML = bubbles(); th.scrollTop = th.scrollHeight;
          if (nativeSms) {
            const num = resolveNumber(name);
            if (num) { try { window.NovaNative.sendSms(num, v); os.notify({app:"messages",title:name,text:"SMS inviato"}); } catch(e){ os.notify({app:"messages",title:name,text:"Invio SMS non riuscito"}); } }
            else os.notify({ app:"messages", title:name, text:"Nessun numero valido per l'invio" });
          } else {
            setTimeout(()=>{ msgs.push(["in",autoReply(v),now(),Date.now()]); save();
              th.innerHTML = bubbles(); th.scrollTop = th.scrollHeight;
              os.notify({ app:"messages", title:name, text:last(msgs)[1] });
            }, 900);
          }
        };
        root.querySelector("#send").onclick = send;
        input.onkeydown = e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } };
      };

      drawList();
    }});

  /* ---------- Fotocamera (getUserMedia, flip camere, miniatura, salvataggio) ---------- */
  const camera = app({ id:"camera", name:"Fotocamera", icon:"📷", color:"#1c1c1e",
    render(root, os) {
      root.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;background:#000">
          <div class="cam-bar">
            <button id="flash" class="cam-top" title="Flash">${ICO("lightning-charge-fill","width:16px;height:16px")}<span id="flash-lbl">off</span></button>
            <button id="grid" class="cam-top" title="Griglia">${ICO("grid-fill","width:16px;height:16px")}</button>
            <button id="timer" class="cam-top" title="Autoscatto">${ICO("stopwatch-fill","width:16px;height:16px")}<span id="timer-lbl">off</span></button>
            <span id="rec-clock" style="display:none;color:#fff;background:#e0233a;padding:4px 10px;border-radius:12px;font-size:calc(12px*var(--fscale,1));font-variant-numeric:tabular-nums">● 00:00</span>
          </div>
          <div style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">
            <video id="cam" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
            <div id="grid-ov" style="position:absolute;inset:0;pointer-events:none;display:none;
              background-image:linear-gradient(rgba(255,255,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.35) 1px,transparent 1px);
              background-size:33.33% 33.33%"></div>
            <div id="count" style="position:absolute;color:#fff;font-size:calc(96px*var(--fscale,1));font-weight:200;text-shadow:0 2px 20px rgba(0,0,0,.6);display:none"></div>
            <div id="flashfx" style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none"></div>
            <div id="cam-msg" style="position:absolute;color:#fff;text-align:center;padding:24px;font-size:calc(14px*var(--fscale,1));display:none"></div>
            <div id="mic-chip" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:10px;background:rgba(0,0,0,.78);color:#fff;padding:8px 10px 8px 14px;border-radius:20px;font-size:calc(12px*var(--fscale,1));z-index:6;white-space:nowrap">
              <span id="mic-txt">🔇 Microfono disattivato</span>
              <button id="mic-enable" style="background:#0a84ff;border:none;color:#fff;padding:6px 14px;border-radius:15px;font-size:calc(12px*var(--fscale,1));cursor:pointer">Attiva</button></div>
          </div>
          <div class="cam-modes"><button data-mode="photo" class="on">FOTO</button><button data-mode="video">VIDEO</button></div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 30px 22px;background:#000">
            <button id="thumb" style="width:52px;height:52px;border-radius:14px;border:2px solid rgba(255,255,255,.4);background:#222 center/cover no-repeat;cursor:pointer;font-size:calc(20px*var(--fscale,1));color:#fff">${ICO("images","width:22px;height:22px")}</button>
            <button id="shot" class="shutter"></button>
            <button id="flip" style="width:52px;height:52px;border-radius:50%;color:#fff;background:rgba(255,255,255,.12);border:none;cursor:pointer">${ICO("arrow-repeat","width:24px;height:24px")}</button>
          </div>
          <input id="pick" type="file" accept="image/*" hidden>
          <canvas id="cv" hidden></canvas>
          <style>
            .cam-bar{display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 0 6px;background:#000}
            .cam-top{background:rgba(255,255,255,.12);border:none;color:#fff;font-size:calc(14px*var(--fscale,1));padding:7px 12px;border-radius:16px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
            .cam-top span{font-size:calc(10px*var(--fscale,1));opacity:.85}
            .cam-modes{display:flex;justify-content:center;gap:8px;background:#000;padding:2px 0 8px}
            .cam-modes button{background:none;border:none;color:rgba(255,255,255,.55);font-size:calc(13px*var(--fscale,1));font-weight:700;letter-spacing:1px;padding:6px 14px;border-radius:16px;cursor:pointer}
            .cam-modes button.on{color:#ffd60a}
            .shutter{width:74px;height:74px;border-radius:50%;border:5px solid #fff;background:rgba(255,255,255,.25);cursor:pointer;transition:background .15s}
            .shutter.rec{border-color:#e0233a;background:#e0233a}
            .shutter.recording{border-radius:22px;border-color:#e0233a;background:#e0233a}
          </style>
        </div>`;
      const video = root.querySelector("#cam"), msg = root.querySelector("#cam-msg"), flash = root.querySelector("#flashfx");
      let stream = null, cams = [], curCam = 0, facing = "environment", timerSec = 0, flashOn = false;
      let mode = "photo", rec = null, recChunks = [], recStart = 0, recTimer = null, poster = null;
      let zoom = 1, zMax = 4, vTrack = null, zoomCap = null;
      const preview = video.parentElement;
      const zBadge = document.createElement("div");
      zBadge.style.cssText = "position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);color:#fff;padding:4px 12px;border-radius:14px;font-size:calc(13px*var(--fscale,1));opacity:0;transition:opacity .25s;pointer-events:none";
      preview.appendChild(zBadge);
      const applyZoom = () => {
        zoom = Math.min(zMax, Math.max(1, zoom));
        if (zoomCap && vTrack) {
          const z = zoomCap.min + (zoom-1)/(zMax-1)*(zoomCap.max-zoomCap.min);
          try { vTrack.applyConstraints({ advanced:[{ zoom:z }] }); } catch {}
          video.style.transform = facing==="user" ? "scaleX(-1)" : "";
        } else {
          video.style.transform = (facing==="user"?"scaleX(-1) ":"") + `scale(${zoom})`;
        }
        zBadge.textContent = zoom.toFixed(1)+"x"; zBadge.style.opacity = "1";
        clearTimeout(applyZoom._t); applyZoom._t = setTimeout(()=>{ zBadge.style.opacity = "0"; }, 900);
      };
      // pinch a due dita per zoomare; doppio tap per alternare 1x/2x
      let pStart = 0, zStart = 1, lastTapZ = 0;
      preview.addEventListener("touchstart", e => { if (e.touches.length===2) { pStart = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); zStart = zoom; } }, {passive:true});
      preview.addEventListener("touchmove", e => { if (e.touches.length===2 && pStart) { const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); zoom = zStart * (d/pStart); applyZoom(); } }, {passive:true});
      // messa a fuoco: tocco singolo mostra l'anello e prova ad applicare il fuoco nel punto
      const focusAt = (cx, cy) => {
        const r = preview.getBoundingClientRect();
        const ring = document.createElement("div");
        ring.style.cssText = `position:absolute;left:${cx-r.left-34}px;top:${cy-r.top-34}px;width:68px;height:68px;border:2px solid #ffd60a;border-radius:12px;pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,.3)`;
        preview.appendChild(ring);
        ring.animate([{transform:"scale(1.4)",opacity:0},{transform:"scale(1)",opacity:1,offset:.3},{opacity:1,offset:.7},{opacity:0}], {duration:1100}).onfinish = () => ring.remove();
        try { if (vTrack) { const x=(cx-r.left)/r.width, y=(cy-r.top)/r.height;
          vTrack.applyConstraints({ advanced:[{ focusMode:"single-shot", pointsOfInterest:[{x,y}] }] }).catch(()=>{}); } } catch {}
      };
      preview.addEventListener("touchend", e => { if (e.touches.length===0) pStart = 0;
        const now = Date.now(); const t = e.changedTouches[0];
        if (e.changedTouches.length===1 && now-lastTapZ<300) { zoom = zoom>1?1:2; applyZoom(); lastTapZ=0; }
        else { if (t && pStart===0 && zStart===zoom) focusAt(t.clientX, t.clientY); lastTapZ = now; } }, {passive:true});

      root.querySelector("#grid").onclick = () => { const g = root.querySelector("#grid-ov"); g.style.display = g.style.display==="none" ? "block" : "none"; };
      root.querySelector("#timer").onclick = () => { timerSec = timerSec===0?3:timerSec===3?10:0; root.querySelector("#timer-lbl").textContent = timerSec?timerSec+"s":"off"; };
      const flashBtn = root.querySelector("#flash");
      flashBtn.onclick = () => { flashOn = !flashOn; root.querySelector("#flash-lbl").textContent = flashOn?"on":"off"; flashBtn.style.color = flashOn?"#ffd60a":"#fff";
        try { if (window.NovaNative && window.NovaNative.setTorch && facing==="environment") window.NovaNative.setTorch(flashOn); } catch {} };

      const shotBtn = root.querySelector("#shot");
      const micChip = root.querySelector("#mic-chip");
      const micTxt = root.querySelector("#mic-txt");
      const micBtn = root.querySelector("#mic-enable");
      const micGranted = () => { try { return window.NovaNative && window.NovaNative.micGranted ? !!window.NovaNative.micGranted() : true; } catch { return true; } };
      // aggiorna l'avviso microfono: nascosto se c'è audio; "Attiva" (Impostazioni)
      // se il permesso è negato; "Riprova" se il permesso c'è ma manca la traccia audio.
      // se c'è il fallback audio nativo del runtime, l'audio del video è comunque
      // registrabile (traccia separata sincronizzata in riproduzione): nessun avviso.
      const nativeAudioAvail = !!(window.NovaNative && window.NovaNative.audioRecStart);
      const updateMicChip = () => {
        if (!wantAudio || hasAudioTrack || nativeAudioAvail) { micChip.style.display = "none"; return; }
        const granted = micGranted();
        micTxt.textContent = granted ? "🔇 Audio non disponibile" : "🔇 Microfono disattivato";
        micBtn.textContent = granted ? "Riprova" : "Attiva";
        micChip.dataset.act = granted ? "retry" : "settings";
        micChip.style.display = "flex";
      };
      micBtn.onclick = () => {
        if (micChip.dataset.act === "retry") { start(); return; }
        try { if (window.NovaNative && window.NovaNative.openAppSettings) { window.NovaNative.openAppSettings(); return; } } catch {}
        try { window.NovaNative && window.NovaNative.requestMic && window.NovaNative.requestMic(); } catch {}
      };
      const setMode = (m) => { mode = m;
        root.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("on", b.dataset.mode===m));
        shotBtn.classList.toggle("rec", m==="video");
        // Audio del video: se c'è il runtime nativo (WebView) lo registriamo a parte,
        // quindi l'anteprima resta video-only (nessuna contesa sul microfono). Senza
        // nativo (GeckoView/desktop) chiediamo l'audio dentro lo stream web.
        if (m==="video") { try { window.NovaNative && window.NovaNative.requestMic && window.NovaNative.requestMic(); } catch {} }
        const want = (m==="video") && !nativeAudioAvail;
        if (want !== wantAudio) {
          wantAudio = want;
          if (!want) micChip.style.display = "none";
          start();
        }
      };
      root.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{ if(rec) return; setMode(b.dataset.mode); });

      const updateThumb = async () => {
        const all = await os.photos.all();
        const t = root.querySelector("#thumb");
        if (all[0]) { t.style.backgroundImage = `url('${all[0].poster||all[0].data}')`; t.innerHTML = ""; }
        else { t.style.backgroundImage = ""; t.innerHTML = ICO("images","width:22px;height:22px"); }
      };

      // in modalità Video acquisiamo UN solo stream video+audio (registrazione
      // affidabile su WebView); in Foto lo stream è solo video (così scattare
      // non dipende mai dal permesso microfono).
      let wantAudio = false, hasAudioTrack = false;
      let curVideo = { facingMode: facing };
      const start = async (videoConstraint) => {
        if (videoConstraint) curVideo = videoConstraint;
        try {
          if (stream) stream.getTracks().forEach(t=>t.stop());
          let s = null;
          if (wantAudio) {
            try { s = await navigator.mediaDevices.getUserMedia({ video: curVideo, audio: true }); } catch { s = null; }
          }
          if (!s) s = await navigator.mediaDevices.getUserMedia({ video: curVideo, audio: false });
          stream = s;
          hasAudioTrack = stream.getAudioTracks().some(t => t.readyState === "live");
          updateMicChip();
          video.srcObject = stream; video.style.display = ""; msg.style.display = "none";
          vTrack = stream.getVideoTracks()[0] || null;
          try { const caps = vTrack && vTrack.getCapabilities && vTrack.getCapabilities(); zoomCap = caps && caps.zoom ? caps.zoom : null; } catch { zoomCap = null; }
          zoom = 1; applyZoom();
          if (!cams.length) { try { cams = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput"); } catch {} }
        } catch (e) {
          video.style.display = "none"; msg.style.display = "block";
          msg.innerHTML = "Fotocamera non disponibile qui.<br>Tocca 📷 per usare la fotocamera di sistema.";
          root.querySelector("#pick").setAttribute("capture", "environment");
          shotBtn.onclick = () => root.querySelector("#pick").click();
        }
      };

      const save = async (dataURL, extra) => {
        await os.photos.add(dataURL, extra);
        await updateThumb();
        os.notify({ app:"camera", title: extra&&extra.video?"Video salvato":"Foto salvata", text:"Nella Galleria di NovaOS." });
      };

      const grabPoster = () => { try {
        const cv = root.querySelector("#cv");
        cv.width = video.videoWidth || 720; cv.height = video.videoHeight || 960;
        cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
        return cv.toDataURL("image/jpeg", 0.6);
      } catch { return null; } };

      const capture = () => {
        const cv = root.querySelector("#cv");
        cv.width = video.videoWidth || 720; cv.height = video.videoHeight || 960;
        cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
        flash.animate([{opacity:.9},{opacity:0}], {duration:300});
        os.vibrate && os.vibrate(15);
        save(cv.toDataURL("image/jpeg", 0.9));
      };

      let nativeAudioRec = false, pendingAudioTrack = null;
      const startRec = async () => {
        if (!stream) { root.querySelector("#pick").click(); return; }
        try {
          poster = grabPoster();
          recChunks = [];
          pendingAudioTrack = null; nativeAudioRec = false;
          // Audio: se lo stream WEB ha già la traccia audio (es. su GeckoView) va nel
          // video stesso. Altrimenti, se la WebView non cattura il microfono, registra
          // l'audio col runtime nativo in parallelo -> traccia separata sincronizzata.
          if (!hasAudioTrack && nativeAudioAvail) {
            try { nativeAudioRec = !!window.NovaNative.audioRecStart(); } catch { nativeAudioRec = false; }
          }
          const cand = ["video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus","video/webm;codecs=h264,opus","video/mp4;codecs=h264,aac","video/webm"];
          let mime = cand.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
          const opts = mime ? { mimeType:mime } : undefined;
          if (opts && hasAudioTrack) opts.audioBitsPerSecond = 128000;
          rec = new MediaRecorder(stream, opts);
          rec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
          rec.onstop = () => {
            const blob = new Blob(recChunks, { type: recChunks[0]?recChunks[0].type:"video/webm" });
            const dur = Math.round((Date.now()-recStart)/1000);
            const audioTrack = pendingAudioTrack; pendingAudioTrack = null;
            const r = new FileReader(); r.onload = () => save(r.result, { video:true, dur, poster, audioTrack }); r.readAsDataURL(blob);
          };
          rec.start();
          recStart = Date.now();
          shotBtn.classList.add("recording");
          const clock = root.querySelector("#rec-clock"); clock.style.display = "inline-block";
          recTimer = setInterval(()=>{ const s=Math.floor((Date.now()-recStart)/1000); clock.textContent = "● "+String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }, 500);
          os.vibrate && os.vibrate(20);
        } catch (e) { if (nativeAudioRec) { try { window.NovaNative.audioRecStop(); } catch {} nativeAudioRec = false; } os.notify({ app:"camera", title:"Video", text:"Registrazione non supportata qui." }); }
      };
      const stopRec = () => {
        if (!rec) return;
        // ferma prima l'audio nativo e conservane la traccia per onstop
        if (nativeAudioRec) { try { pendingAudioTrack = window.NovaNative.audioRecStop() || null; } catch { pendingAudioTrack = null; } nativeAudioRec = false; }
        try { rec.stop(); } catch {}
        rec = null; clearInterval(recTimer); recTimer = null;
        shotBtn.classList.remove("recording");
        root.querySelector("#rec-clock").style.display = "none";
        os.vibrate && os.vibrate(20);
      };

      let counting = false;
      const pressShot = () => shotBtn.animate([{transform:"scale(1)"},{transform:"scale(.88)",offset:.4},{transform:"scale(1)"}], {duration:220, easing:"ease-out"});
      shotBtn.onclick = () => {
        pressShot();
        if (mode === "video") { rec ? stopRec() : startRec(); return; }
        if (!stream) { root.querySelector("#pick").click(); return; }
        if (counting) return;
        if (!timerSec) { capture(); return; }
        counting = true;
        const el = root.querySelector("#count"); el.style.display = "block";
        let left = timerSec; el.textContent = left;
        const tick = setInterval(() => { left--;
          if (left <= 0) { clearInterval(tick); el.style.display = "none"; counting = false; capture(); }
          else { el.textContent = left; }
        }, 1000);
      };
      root.querySelector("#flip").onclick = () => {
        if (rec) return;
        if (cams.length > 1) { curCam = (curCam+1) % cams.length; start({ deviceId:{ exact: cams[curCam].deviceId } }); }
        else { facing = facing==="environment" ? "user" : "environment"; start({ facingMode: facing }); }
      };
      root.querySelector("#thumb").onclick = () => os.openApp("gallery");
      root.querySelector("#pick").onchange = (e) => { const f=e.target.files[0]; if(!f) return;
        const r=new FileReader(); r.onload=()=>save(r.result); r.readAsDataURL(f); };

      // il permesso microfono arriva in modo asincrono. Concesso: nascondi l'avviso
      // e riacquisisci lo stream con audio. Negato: mostra il chip "Attiva" (che apre
      // le Impostazioni dell'app) così l'utente può riattivare il microfono.
      window.__novaMic = (ok) => {
        if (ok) { if (wantAudio && !hasAudioTrack && !rec) start(); else updateMicChip(); }
        else updateMicChip();
      };
      // tornando dall'app Impostazioni (dopo aver attivato il microfono a mano),
      // riacquisisci lo stream così il video avrà l'audio senza riaprire la Fotocamera.
      window.__novaMicResume = () => { if (wantAudio && !hasAudioTrack && !rec) start(); };

      start(); updateThumb();
      root._cleanup = () => { try{ if(rec) rec.stop(); }catch{} clearInterval(recTimer);
        try { if (flashOn && window.NovaNative && window.NovaNative.setTorch) window.NovaNative.setTorch(false); } catch {}
        window.__novaMic = null; window.__novaMicResume = null;
        if (stream) stream.getTracks().forEach(t=>t.stop()); };
    }});

  /* ---------- Rubrica (contatti completi) ---------- */
  const contacts = app({ id:"contacts", name:"Rubrica", icon:"👤", color:"#5e5ce6",
    render(root, os) {
      const seed = [
        { id:1, name:"Anna Rossi", phone:"+39 340 1234567", email:"anna@example.com" },
        { id:2, name:"Papà", phone:"+39 333 9988776", email:"" },
        { id:3, name:"Luca Bianchi", phone:"+39 348 5551212", email:"luca@example.com" },
      ];
      let list = os.store.get("contacts", seed);
      const save = () => os.store.set("contacts", list);
      const sorted = () => [...list].sort((a,b)=>a.name.localeCompare(b.name,"it"));
      const H = s => [...(s||"?")].reduce((a,c)=>a+c.charCodeAt(0),0);
      const grad = n => { const h=H(n)%360; return `linear-gradient(135deg,hsl(${h} 62% 52%),hsl(${(h+40)%360} 62% 44%))`; };
      const avatarBg = c => c.photo ? `background:#232c3d center/cover no-repeat url('${c.photo}')` : `background:${grad(c.name||"?")}`;
      const avatarTxt = c => c.photo ? "" : (c.name[0]||"?").toUpperCase();
      const resizeImg = (src, max) => new Promise(res => { const img=new Image();
        img.onload=()=>{ const s=Math.min(1,max/Math.max(img.width,img.height)); const cv=document.createElement("canvas");
          cv.width=img.width*s; cv.height=img.height*s; cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
          res(cv.toDataURL("image/jpeg",0.8)); }; img.src=src; });

      const row = c => `<div class="item" data-id="${c.id}"><div class="i-ico av" style="${avatarBg(c)}">${avatarTxt(c)}</div>
          <div class="i-body"><div class="i-title">${c.name}${c.fav?' <span style="color:#ffcf3f">★</span>':''}</div><div class="i-sub">${c.phone}</div></div><div class="chev"></div></div>`;

      const drawList = () => {
        root.innerHTML = `<div class="hero"><div class="hero-l"><h1>Rubrica</h1><div class="hero-sub">${list.length} contatti</div></div></div>
          <div class="searchbar"><span class="sb-i">🔍</span><input id="q" placeholder="Cerca per nome o numero"></div>
          <div id="clist"></div><div style="height:90px"></div>
          <button class="fab" id="add">＋<span class="fab-t">Nuovo</span></button>`;
        const drawRows = (filter="") => {
          const box = root.querySelector("#clist");
          const f = filter.trim().toLowerCase();
          const all = sorted().filter(c => c.name.toLowerCase().includes(f) || (c.phone||"").replace(/\s/g,"").includes(f.replace(/\s/g,"")));
          if (!all.length) { box.innerHTML = `<div class="group"><div class="item"><div class="i-sub" style="padding:6px">Nessun contatto</div></div></div>`; return; }
          let html = "";
          if (!f) {
            const favs = all.filter(c => c.fav);
            if (favs.length) html += `<div class="section-label">Preferiti</div><div class="group">${favs.map(row).join("")}</div>`;
          }
          let cur = null;
          all.forEach(c => {
            const L = (c.name[0]||"#").toUpperCase();
            if (L !== cur) { if (cur !== null) html += `</div>`; html += `<div class="section-label">${L}</div><div class="group">`; cur = L; }
            html += row(c);
          });
          if (cur !== null) html += `</div>`;
          box.innerHTML = html;
          box.querySelectorAll("[data-id]").forEach(el => el.onclick = () => drawDetail(+el.dataset.id));
        };
        drawRows();
        root.querySelector("#q").oninput = e => drawRows(e.target.value);
        root.querySelector("#add").onclick = () => drawEdit(null);
      };

      const drawDetail = (id) => {
        const c = list.find(x=>x.id===id);
        const actCol = (btnId,bg,ico,lbl) => `<div class="act-col"><button class="round-act" id="${btnId}" style="background:${bg}">${ico}</button>${lbl}</div>`;
        root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1">Contatto</div>
            <button id="fav" title="Preferito" style="background:none;border:none;color:${c.fav?'#ffcf3f':'var(--text-dim)'};font-size:calc(20px*var(--fscale,1));cursor:pointer;margin-right:6px">${c.fav?'★':'☆'}</button>
            <button id="edit" style="background:none;border:none;color:var(--accent);font-size:calc(15px*var(--fscale,1));cursor:pointer">Modifica</button></div>
          <div style="text-align:center;padding:12px 16px 22px">
            <div class="av" style="width:104px;height:104px;border-radius:50%;margin:0 auto 14px;${avatarBg(c)};font-size:calc(44px*var(--fscale,1))">${avatarTxt(c)}</div>
            <div style="font-size:calc(25px*var(--fscale,1));font-weight:700">${c.name}</div></div>
          <div style="display:flex;justify-content:center;gap:26px;padding-bottom:20px">
            ${actCol("call","linear-gradient(135deg,#3ad06a,#25b257)","📞","Chiama")}
            ${actCol("sms","linear-gradient(135deg,#3aa0ff,#0a84ff)","💬","Messaggio")}
            ${c.email?actCol("mail","linear-gradient(135deg,#ffb340,#ff9f0a)","✉️","Email"):''}
          </div>
          <div class="group">
            <div class="item"><div class="i-body"><div class="i-sub">Telefono</div><div class="i-title">${c.phone}</div></div></div>
            ${c.email?`<div class="item"><div class="i-body"><div class="i-sub">Email</div><div class="i-title">${c.email}</div></div></div>`:''}
          </div>
          <button class="btn ghost" id="del" style="margin:18px 16px;color:var(--danger)">Elimina contatto</button>`;
        root.querySelector(".back-btn").onclick = drawList;
        root.querySelector("#fav").onclick = () => { c.fav = !c.fav; save(); drawDetail(id); };
        root.querySelector("#edit").onclick = () => drawEdit(id);
        root.querySelector("#call").onclick = () => {
          const num = c.phone.replace(/\s/g,"");
          if (window.NovaNative && window.NovaNative.call) window.NovaNative.call(num);
          else window.location.href = "tel:" + num;
        };
        root.querySelector("#sms").onclick = () => {
          const num = c.phone.replace(/\s/g,"");
          if (window.NovaNative && window.NovaNative.sms) window.NovaNative.sms(num,"");
          else window.location.href = "sms:" + num;
        };
        const mail = root.querySelector("#mail"); if (mail) mail.onclick = () => window.location.href = "mailto:" + c.email;
        root.querySelector("#del").onclick = async () => { if(await os.confirm({title:"Eliminare contatto?",message:c.name+" verrà eliminato dalla rubrica.",okText:"Elimina"})){ list=list.filter(x=>x.id!==id); save(); drawList(); } };
      };

      const drawEdit = (id) => {
        const c = id ? list.find(x=>x.id===id) : { name:"", phone:"", email:"" };
        let photo = c.photo || null;
        const draw = () => {
          root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title">${id?"Modifica":"Nuovo contatto"}</div></div>
            <div style="text-align:center;margin:8px 0 18px">
              <label style="cursor:pointer;display:inline-block">
                <div id="av-prev" class="av" style="width:104px;height:104px;border-radius:50%;margin:0 auto;font-size:calc(38px*var(--fscale,1));${photo?`background:#232c3d center/cover no-repeat url('${photo}')`:`background:${grad(c.name||'?')}`}">${photo?'':'📷'}</div>
                <div style="color:var(--accent);font-size:calc(13px*var(--fscale,1));margin-top:8px">${photo?'Cambia foto':'Aggiungi foto'}</div>
                <input id="f-photo" type="file" accept="image/*" hidden></label>
              ${photo?`<div><button id="rm-photo" style="background:none;border:none;color:var(--danger);font-size:calc(12px*var(--fscale,1));cursor:pointer;margin-top:2px">Rimuovi foto</button></div>`:''}
            </div>
            <div class="group" style="padding:16px">
              <input id="f-name" value="${c.name}" placeholder="Nome" style="width:100%;background:var(--surface-2);border:none;border-radius:12px;padding:13px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none;margin-bottom:10px">
              <input id="f-phone" value="${c.phone}" inputmode="tel" placeholder="Telefono" style="width:100%;background:var(--surface-2);border:none;border-radius:12px;padding:13px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none;margin-bottom:10px">
              <input id="f-email" value="${c.email||''}" inputmode="email" placeholder="Email (facoltativa)" style="width:100%;background:var(--surface-2);border:none;border-radius:12px;padding:13px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none;margin-bottom:12px">
              <button class="btn" id="save">Salva</button>
            </div>`;
          root.querySelector(".back-btn").onclick = () => id ? drawDetail(id) : drawList();
          root.querySelector("#f-photo").onchange = e => { const f=e.target.files[0]; if(!f) return;
            const r=new FileReader(); r.onload=async()=>{ photo=await resizeImg(r.result,256); draw(); }; r.readAsDataURL(f); };
          const rm = root.querySelector("#rm-photo"); if (rm) rm.onclick = () => { photo=null; draw(); };
          root.querySelector("#save").onclick = () => {
            const name = root.querySelector("#f-name").value.trim();
            const phone = root.querySelector("#f-phone").value.trim();
            if (!name || !phone) { alert("Nome e telefono sono obbligatori."); return; }
            const email = root.querySelector("#f-email").value.trim();
            if (id) { Object.assign(c, { name, phone, email, photo }); }
            else { list.push({ id:Date.now(), name, phone, email, photo }); }
            save(); drawList();
          };
        };
        draw();
      };

      drawList();
    }});

  /* ---------- Browser ---------- */
  const browser = app({ id:"browser", name:"Browser", icon:"🌐", color:"#0a84ff", dock:true,
    render(root, os) {
      // sul device (launcher) apre a schermo intero: nessun limite iframe (banche ecc.)
      const native = !!(window.NovaNative && window.NovaNative.openBrowser);
      let bookmarks = os.store.get("bookmarks", [
        { name:"Wikipedia", url:"https://it.wikipedia.org" },
        { name:"OpenStreetMap", url:"https://www.openstreetmap.org" },
      ]);
      let history = os.store.get("browserHistory", []);
      const saveB = () => os.store.set("bookmarks", bookmarks);
      const saveH = () => os.store.set("browserHistory", (history = history.slice(0,30)));
      const norm = u => /^[a-z]+:\/\//i.test(u) ? u : "https://"+u;
      const host = u => { try { return new URL(norm(u)).hostname.replace(/^www\./,""); } catch { return u; } };
      const hue = u => ((host(u).length*67)%360);

      const go = (u) => {
        u = norm((u||"").trim()); if(!u) return;
        history = [{url:u, t:Date.now()}, ...history.filter(h=>h.url!==u)].slice(0,30); saveH();
        // resta in-shell come le altre app: mostra l'anteprima incorporata.
        // Se il sito blocca l'iframe, compare il pulsante "Apri sul dispositivo".
        drawFrame(u);
      };
      const sameUrl = (a,b) => norm(a)===norm(b);
      const isBm = (u) => bookmarks.some(b=>sameUrl(b.url,u));
      // stella: piena colorata = preferito, piena grigia = non preferito (manca la stella vuota tra le icone)
      const starBtn = (id, u, sz=16) => `<button class="round-act small" id="${id}" data-star="${u}" style="background:var(--surface);color:${isBm(u)?"#f5b301":"var(--text-dim)"}">${ICO("star-fill","width:"+sz+"px;height:"+sz+"px")}</button>`;
      const toggleBm = (u, label) => {
        u = norm((u||"").trim()); if(!u) return false;
        const i = bookmarks.findIndex(b=>sameUrl(b.url,u));
        if (i>=0) { bookmarks.splice(i,1); saveB(); os.notify({ app:"browser", title:"Browser", text:"Rimosso dai preferiti." }); return false; }
        bookmarks.push({ name:(label||host(u)), url:u }); saveB(); os.notify({ app:"browser", title:"Browser", text:"Aggiunto ai preferiti." }); return true;
      };
      let editBm = false;

      const bar = (val="") => `<div style="display:flex;gap:8px;padding:6px 16px 12px;align-items:center">
          <div class="searchbar" style="flex:1;margin:0"><span class="sb-i">${ICO("search")}</span>
            <input id="url" value="${val.replace(/"/g,'&quot;')}" placeholder="Cerca su Google o digita URL"></div>
          ${starBtn("star", val, 17)}
          <button class="round-act small" id="go" style="background:var(--accent)">${ICO("send-fill","width:16px;height:16px")}</button></div>`;
      const bind = () => {
        const inp = root.querySelector("#url");
        root.querySelector("#go").onclick = () => go(inp.value);
        inp.onkeydown = e => { if(e.key==="Enter") go(inp.value); };
        const star = root.querySelector("#star");
        if (star) star.onclick = () => {
          if (!inp.value.trim()) { os.notify({ app:"browser", title:"Browser", text:"Scrivi o apri un sito per aggiungerlo ai preferiti." }); return; }
          const on = toggleBm(inp.value);
          star.style.color = on ? "#f5b301" : "var(--text-dim)";
          if (root.querySelector("#bm-grid") || editBm) drawHome();
        };
      };

      const drawHome = () => {
        const bmView = bookmarks.length ? (editBm
          ? `<div class="group">${bookmarks.map((b,i)=>`
              <div class="item"><div class="i-ico" style="background:hsl(${hue(b.url)} 60% 45%)">${ICO("globe2","width:20px;height:20px")}</div>
                <div class="i-body"><input class="bm-name" data-i="${i}" value="${(b.name||"").replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:var(--surface-2);border:none;border-radius:8px;padding:7px 9px;color:var(--text);font-size:calc(13px*var(--fscale,1))"><div class="i-sub trunc" style="margin-top:3px">${b.url}</div></div>
                <button class="round-act small" data-rm="${i}" style="background:var(--surface);color:var(--danger)">${ICO("trash-fill","width:15px;height:15px")}</button></div>`).join("")}</div>`
          : `<div id="bm-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:6px 16px">
              ${bookmarks.map((b)=>`<div class="bm" data-url="${b.url}" style="text-align:center;cursor:pointer">
                <div style="width:52px;height:52px;border-radius:16px;margin:0 auto;background:hsl(${hue(b.url)} 60% 45%);display:flex;align-items:center;justify-content:center;color:#fff">${ICO("globe2","width:24px;height:24px")}</div>
                <div style="font-size:calc(11px*var(--fscale,1));margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.name}</div></div>`).join("")}</div>`)
          : `<div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:6px 16px">Nessun preferito. Apri un sito e tocca la stella.</div>`;

        root.innerHTML = `<div class="hero"><div class="hero-l"><h1>Browser</h1>${native?'':'<div class="hero-sub">Anteprima in-app</div>'}</div></div>
          ${bar()}
          <div class="section-label" style="display:flex;align-items:center;justify-content:space-between;padding-right:16px">
            <span>Preferiti</span>
            ${bookmarks.length?`<button id="editbm" class="btn ghost" style="width:auto;padding:2px 12px;font-size:calc(12px*var(--fscale,1))">${editBm?"Fine":"Modifica"}</button>`:""}</div>
          ${bmView}
          <div class="section-label">Cronologia</div>
          <div class="group">${history.length?history.slice(0,10).map(h=>`
            <div class="item" data-url="${h.url}"><div class="i-ico" style="background:hsl(${hue(h.url)} 60% 45%)">${ICO("globe2","width:20px;height:20px")}</div>
              <div class="i-body"><div class="i-title trunc">${host(h.url)}</div><div class="i-sub trunc">${h.url}</div></div>
              ${starBtn("", h.url, 15)}</div>`).join("")
            :'<div class="item"><div class="i-sub" style="padding:6px">Nessuna cronologia</div></div>'}</div>
          ${history.length?'<button class="btn ghost" id="clrh" style="margin:12px 16px;color:var(--danger)">Cancella cronologia</button>':''}
          <div style="height:16px"></div>`;
        bind();
        const eb = root.querySelector("#editbm"); if (eb) eb.onclick = () => { editBm=!editBm; drawHome(); };
        root.querySelectorAll("[data-url]").forEach(el => el.onclick = e => { if (e.target.closest("[data-star]")) return; go(el.dataset.url); });
        root.querySelectorAll("[data-star]").forEach(b => { if (b.id==="star") return; b.onclick = e => { e.stopPropagation(); toggleBm(b.dataset.star); drawHome(); }; });
        root.querySelectorAll("[data-rm]").forEach(b => b.onclick = e => { e.stopPropagation(); bookmarks.splice(+b.dataset.rm,1); saveB(); if(!bookmarks.length) editBm=false; drawHome(); });
        root.querySelectorAll(".bm-name").forEach(inp => inp.onchange = () => { const i=+inp.dataset.i; if(bookmarks[i]){ bookmarks[i].name = inp.value.trim()||host(bookmarks[i].url); saveB(); } });
        const clr = root.querySelector("#clrh"); if (clr) clr.onclick = () => { history=[]; saveH(); drawHome(); };
      };

      const drawFrame = (u) => {
        u = norm(u);
        const openReal = () => {
          if (window.NovaNative && window.NovaNative.openBrowser) { try { window.NovaNative.openBrowser(u); return; } catch(e){} }
          try { window.open(u, "_blank", "noopener"); } catch(e){}
        };
        root.innerHTML = `<div class="back-bar" style="padding:6px 10px;gap:6px"><button class="back-btn"></button>
            <div class="back-title" style="flex:1;font-size:calc(14px*var(--fscale,1));overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${host(u)}</div>
            <button class="round-act small" id="b-reload" style="background:var(--surface);color:var(--text)">${ICO("arrow-repeat","width:16px;height:16px")}</button>
            ${starBtn("b-star", u, 16)}
            <button class="round-act small" id="b-open" style="background:var(--accent)" title="Apri sul dispositivo">${ICO("box-arrow-right","width:15px;height:15px")}</button></div>
          ${bar(u)}
          <div style="padding:0 12px 24px;position:relative">
            <div id="fload" style="position:absolute;left:12px;right:12px;top:0;height:500px;border-radius:12px;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text-dim);font-size:calc(13px*var(--fscale,1))">
              <div class="spin"></div>Caricamento di ${host(u)}…</div>
            <iframe id="frame" src="${u}" style="width:100%;height:500px;border:none;border-radius:12px;background:#fff"></iframe>
            <div id="fblock" style="display:none;color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:14px 6px;line-height:1.5;text-align:center">
              <div style="font-size:calc(30px*var(--fscale,1))">🔒</div><b>${host(u)}</b> non consente l'anteprima incorporata (protezione tipica di banche e Google).<br>
              <button class="btn" id="opnew" style="margin-top:12px;width:auto;padding:11px 18px">Apri sul dispositivo</button></div>
          </div>`;
        root.querySelector(".back-btn").onclick = drawHome;
        root.querySelector("#b-open").onclick = openReal;
        root.querySelector("#b-reload").onclick = () => drawFrame(u);
        const bstar = root.querySelector("#b-star");
        bstar.onclick = () => { const on = toggleBm(u); bstar.style.color = on ? "#f5b301" : "var(--text-dim)"; };
        const frame = root.querySelector("#frame");
        const load = root.querySelector("#fload");
        const block = root.querySelector("#fblock");
        let done = false;
        frame.onload = () => { done = true; if (load) load.style.display = "none"; };
        // se dopo 4s non è arrivato l'onload (X-Frame-Options blocca il caricamento),
        // mostra l'avviso e l'opzione per aprirlo davvero.
        setTimeout(() => {
          if (done) return;
          if (load) load.style.display = "none";
          frame.style.display = "none";
          if (block) block.style.display = "block";
        }, 4000);
        const opn = root.querySelector("#opnew"); if (opn) opn.onclick = openReal;
        bind();
      };

      drawHome();
      // Il Browser si apre sulla sua home interna come ogni altra app: nessuna
      // apertura automatica del browser nativo (evita il lancio con URL stantio).
      // Il browser nativo a schermo intero resta disponibile toccando un sito o il
      // pulsante "Apri sul dispositivo" per i siti che bloccano l'anteprima iframe.
    }});

  /* ---------- Galleria (foto, album, visualizzatore, modifica) ---------- */
  const gallery = app({ id:"gallery", name:"Galleria", icon:"🖼️", color:"#af52de",
    render(root, os) {
      const subjects = [
        ["🏔️","Montagna","Paesaggi"],["🌊","Mare","Paesaggi"],["🌅","Alba","Paesaggi"],["🌲","Bosco","Paesaggi"],["🏜️","Deserto","Paesaggi"],["🏝️","Isola","Paesaggi"],
        ["🌆","Città","Città"],["🌌","Notte","Città"],["🚗","Viaggio","Città"],["☕","Caffè","Città"],
        ["🌸","Fiori","Natura"],["🦋","Farfalla","Natura"],["🍂","Autunno","Natura"],["❄️","Neve","Natura"],["🌈","Arcobaleno","Natura"],["🌻","Girasole","Natura"],["🐦","Uccello","Natura"],["🌋","Vulcano","Natura"],
      ];
      const grad = i => `linear-gradient(${i*47%360}deg, hsl(${i*57%360} 70% 55%), hsl(${(i*57+130)%360} 65% 40%))`;
      const demo = subjects.map(([e,n,al],i) => ({ id:"demo"+i, emoji:e, name:n, album:al, bg:grad(i) }));
      let hidden = os.store.get("galHidden", []);
      const FILTERS = [["Originale","none"],["B/N","grayscale(1)"],["Seppia","sepia(.8)"],["Vivido","saturate(1.7) contrast(1.08)"],["Freddo","saturate(1.2) hue-rotate(-15deg) brightness(1.05)"],["Caldo","sepia(.35) saturate(1.4)"]];

      let items = [], tab = "foto";
      const playBadge = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none"><div style="width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:calc(15px*var(--fscale,1))">▶</div></div>`;
      const cell = (p,i) => p.real
        ? `<div class="ph" data-i="${i}" style="position:relative;aspect-ratio:1;border-radius:6px;background-image:url('${p.poster||p.data}');background-size:cover;background-position:center;cursor:pointer">${p.video?playBadge:''}</div>`
        : `<div class="ph" data-i="${i}" style="aspect-ratio:1;background:${p.bg};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:calc(30px*var(--fscale,1));cursor:pointer">${p.emoji}</div>`;

      let scat = "Tutte";
      const heroBar = (real) => `<div class="hero"><div class="hero-l"><h1>${tab==='album'?'Raccolta':tab==='search'?'Cerca':'Foto'}</h1><div class="hero-sub">${real} elementi · ${demo.length} demo</div></div>
          <div style="display:flex;gap:8px">
            <button class="round-act small" id="cam" style="background:var(--surface);color:var(--text)">${ICO("camera-fill","width:18px;height:18px")}</button>
            <label class="round-act small" style="background:var(--surface);color:var(--text);cursor:pointer">${ICO("plus-circle-fill","width:18px;height:18px")}<input id="imp" type="file" accept="image/*" multiple hidden></label>
          </div></div>`;
      const tabbar = () => `<nav class="tabbar" id="gal-nav">
          <button data-tab="foto" class="${tab==='foto'?'on':''}"><span class="tb-pill">${ICO("images","width:20px;height:20px")}</span>Foto</button>
          <button data-tab="search" class="${tab==='search'?'on':''}"><span class="tb-pill">${ICO("search","width:20px;height:20px")}</span>Cerca</button>
          <button data-tab="album" class="${tab==='album'?'on':''}"><span class="tb-pill">${ICO("folder2-open","width:20px;height:20px")}</span>Raccolta</button>
        </nav>`;
      const wrap = (content) => root.innerHTML = `<div style="height:100%;display:flex;flex-direction:column">
          <div style="flex:1;overflow-y:auto">${heroBar(itemsReal)}${content}<div style="height:16px"></div></div>${tabbar()}</div>`;

      const bindTop = () => {
        root.querySelectorAll("#gal-nav [data-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;draw();});
        const cam = root.querySelector("#cam"); if (cam) cam.onclick = () => os.openApp("camera");
        const imp = root.querySelector("#imp"); if (imp) imp.onchange = (e) => { const files=[...e.target.files]; let done=0;
          files.forEach(f=>{const r=new FileReader();r.onload=async()=>{await os.photos.add(r.result);if(++done===files.length)draw();};r.readAsDataURL(f);}); };
      };

      const gridHtml = (arr, pad="0 4px 20px") => `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:${pad}">${arr.map((p)=>cell(p,items.indexOf(p))).join("")}</div>`;

      // raggruppa gli elementi reali per giorno (Oggi / Ieri / data)
      const dayLabel = ts => { const d=new Date(ts||Date.now()), t=new Date();
        const strip=x=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
        const diff=(strip(t)-strip(d))/86400000;
        if(diff===0) return "Oggi"; if(diff===1) return "Ieri";
        return d.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",...(d.getFullYear()!==t.getFullYear()?{year:"numeric"}:{})}); };

      let itemsReal = 0;
      const draw = async () => {
        const real = (await os.photos.all()).map(p => ({ real:true, id:p.id, data:p.data, ts:p.ts, album:p.album, video:!!p.video, poster:p.poster, dur:p.dur, audioTrack:p.audioTrack, name:p.video?"Video":(p.album||"Foto") }));
        items = [...real, ...demo.filter(d => !hidden.includes(d.id))];
        itemsReal = real.length;

        if (tab === "foto") {
          // sezioni per data (reali) + raccolta dimostrativa
          let html = "";
          if (real.length) {
            let curLbl = null;
            real.forEach(p => { const l = dayLabel(p.ts); if (l!==curLbl) { if(curLbl!==null) html+="</div>"; html+=`<div class="date-head" style="text-transform:capitalize">${l}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:0 4px 8px">`; curLbl=l; } html+=cell(p, items.indexOf(p)); });
            if (curLbl!==null) html+="</div>";
          } else {
            html += `<div style="text-align:center;color:var(--text-dim);padding:24px">Nessuna tua foto. Scatta con la Fotocamera.</div>`;
          }
          const dm = demo.filter(d => !hidden.includes(d.id));
          if (dm.length) html += `<div class="date-head">Raccolta dimostrativa</div>` + gridHtml(dm);
          wrap(html);
        } else if (tab === "search") {
          const CATS = ["Tutte","Foto","Video","Schermate","Paesaggi","Città","Natura"];
          const match = p => scat==="Tutte" ? true
            : scat==="Foto" ? (p.real && !p.video)
            : scat==="Video" ? p.video
            : p.album===scat;
          const arr = items.filter(match);
          const chips = `<div style="display:flex;gap:8px;overflow-x:auto;padding:2px 16px 12px">${CATS.map(c=>`<button class="chip ${scat===c?'on':''}" data-sc="${c}">${c}</button>`).join("")}</div>`;
          wrap(chips + (arr.length?gridHtml(arr):`<div style="text-align:center;color:var(--text-dim);padding:24px">Nessun elemento</div>`));
          root.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{ scat=b.dataset.sc; draw(); });
        } else {
          const shots = real.filter(p=>p.album==="Schermate");
          const vids = real.filter(p=>p.video);
          const cam = real.filter(p=>p.album!=="Schermate" && !p.video);
          const albums = [["Fotocamera", cam, "camera-fill"], ...(vids.length?[["Video", vids, "camera-reels-fill"]]:[]), ...(shots.length?[["Schermate", shots, "phone-vibrate-fill"]]:[]), ["Paesaggi", demo.filter(d=>d.album==="Paesaggi"), "tree-fill"], ["Città", demo.filter(d=>d.album==="Città"), "building"], ["Natura", demo.filter(d=>d.album==="Natura"), "flower1"]];
          const content = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:2px 16px 12px">${albums.map(([nome,arr,ic],ai)=>`
            <div class="alb" data-alb="${ai}" style="cursor:pointer">
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px;border-radius:16px;overflow:hidden;aspect-ratio:1">
                ${(arr.length?arr:[0,1,2,3]).slice(0,4).map(p=>p&&p.real?`<div style="background-image:url('${p.poster||p.data}');background-size:cover;background-position:center"></div>`:p&&p.emoji?`<div style="background:${p.bg};display:flex;align-items:center;justify-content:center;font-size:calc(24px*var(--fscale,1))">${p.emoji}</div>`:`<div style="background:var(--surface)"></div>`).join("")}
              </div><div style="padding:8px 2px 0"><div style="font-weight:600;display:flex;align-items:center;gap:6px">${ICO(ic,"width:15px;height:15px")}${nome}</div><div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1))">${arr.length}</div></div></div>`).join("")}</div>`;
          wrap(content);
          root.querySelectorAll("[data-alb]").forEach(el=>el.onclick=()=>{const a=albums[+el.dataset.alb];openAlbum(a[0],a[1]);});
        }
        bindTop();
        root.querySelectorAll(".ph").forEach(el => el.onclick = () => openViewer(+el.dataset.i));
      };

      const openAlbum = (nome, arr) => {
        root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title">${nome}</div></div>${arr.length?gridHtml(arr):'<div style="text-align:center;color:var(--text-dim);padding:40px">Album vuoto</div>'}`;
        root.querySelector(".back-btn").onclick = draw;
        root.querySelectorAll(".ph").forEach(el => el.onclick = () => openViewer(+el.dataset.i));
      };

      let slideTimer = null;
      const stopSlide = () => { if (slideTimer) { clearInterval(slideTimer); slideTimer = null; } };
      const fmtDate = ts => ts ? new Date(ts).toLocaleString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
      const sizeOf = data => { try { const b=atob((data||"").split(",")[1]||""); return (b.length/1024).toFixed(0)+" KB"; } catch { return "—"; } };

      const openViewer = (i) => {
        const p = items[i];
        const go = j => openViewer((j+items.length)%items.length);
        const big = p.video
          ? `<video id="vimg" src="${p.data}" controls autoplay playsinline ${p.audioTrack?'muted':''} style="max-width:100%;max-height:100%;object-fit:contain;background:#000"></video>${p.audioTrack?`<audio id="vaud" src="${p.audioTrack}" preload="auto"></audio>`:''}`
          : p.real
          ? `<img id="vimg" src="${p.data}" style="max-width:100%;max-height:100%;object-fit:contain;transition:transform .18s;touch-action:none;will-change:transform">`
          : `<div id="vimg" style="width:80%;aspect-ratio:3/4;border-radius:16px;background:${p.bg};display:flex;align-items:center;justify-content:center;font-size:calc(96px*var(--fscale,1))">${p.emoji}</div>`;
        root.innerHTML = `
          <div style="height:100%;display:flex;flex-direction:column;background:#000">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;color:#fff">
              <button id="vclose" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(18px*var(--fscale,1));cursor:pointer">✕</button>
              <div style="flex:1"><div style="font-weight:600">${p.name}</div><div style="font-size:calc(12px*var(--fscale,1));opacity:.6">${i+1} di ${items.length}</div></div>
              <button id="vslide" title="Presentazione" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(15px*var(--fscale,1));cursor:pointer">▶️</button>
              <button id="vinfo" title="Info" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(15px*var(--fscale,1));cursor:pointer">ℹ️</button>
              ${p.real?`<button id="vshare" title="Condividi" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(15px*var(--fscale,1));cursor:pointer">📤</button>`:''}
              ${p.real&&!p.video?`<button id="vedit" title="Modifica" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(15px*var(--fscale,1));cursor:pointer">✏️</button>`:''}
              <button id="vdel" title="Elimina" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,80,90,.35);color:#fff;font-size:calc(16px*var(--fscale,1));cursor:pointer">🗑</button>
            </div>
            <div id="vstage" style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
              <button id="vprev" style="position:absolute;left:8px;z-index:2;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.12);color:#fff;font-size:calc(20px*var(--fscale,1));cursor:pointer">‹</button>
              ${big}
              <button id="vnext" style="position:absolute;right:8px;z-index:2;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.12);color:#fff;font-size:calc(20px*var(--fscale,1));cursor:pointer">›</button>
              <div id="vinfobox" style="display:none;position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.72);color:#fff;padding:14px 18px;font-size:calc(13px*var(--fscale,1));line-height:1.7">
                <div><b>${p.real?'Foto':p.name}</b></div>
                <div style="opacity:.8;text-transform:capitalize">📅 ${fmtDate(p.ts)}</div>
                ${p.real?`<div style="opacity:.8" id="vdim">🖼️ dimensioni…</div><div style="opacity:.8">💾 ${sizeOf(p.data)}</div>`:'<div style="opacity:.8">Immagine dimostrativa</div>'}
              </div>
            </div>
          </div>`;
        root.querySelector("#vclose").onclick = () => { stopSlide(); draw(); };
        root.querySelector("#vprev").onclick = () => go(i-1);
        root.querySelector("#vnext").onclick = () => go(i+1);

        // pannello info + dimensioni reali
        const infobox = root.querySelector("#vinfobox");
        root.querySelector("#vinfo").onclick = () => { infobox.style.display = infobox.style.display==="none"?"block":"none"; };
        const img = root.querySelector("#vimg");
        if (p.real && img.tagName==="IMG") img.onload = () => { const d=root.querySelector("#vdim"); if(d) d.textContent=`🖼️ ${img.naturalWidth}×${img.naturalHeight} px`; };

        // presentazione (slideshow) automatica
        const slideBtn = root.querySelector("#vslide");
        slideBtn.onclick = () => {
          if (slideTimer) { stopSlide(); slideBtn.textContent="▶️"; }
          else { slideBtn.textContent="⏸️"; slideTimer = setInterval(()=>go(i+1), 2200); }
        };

        // condivisione: prima il bridge nativo (affidabile su Android), poi Web Share
        const shareBtn = root.querySelector("#vshare");
        if (shareBtn) shareBtn.onclick = async () => {
          if (window.NovaNative && window.NovaNative.shareImage) { window.NovaNative.shareImage(p.data); return; }
          try {
            const blob = await (await fetch(p.data)).blob();
            const file = new File([blob], "novaos-foto.jpg", { type: blob.type||"image/jpeg" });
            if (navigator.canShare && navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], title:"Foto da NovaOS" }); return; }
            if (navigator.share) { await navigator.share({ title:"Foto da NovaOS", text:"Condivisa da NovaOS" }); return; }
            os.notify({ app:"gallery", title:"Condivisione", text:"Condivisione non disponibile in questo contesto." });
          } catch (e) {}
        };

        const del = root.querySelector("#vdel");
        if (del) del.onclick = async () => {
          if (!await os.confirm({title:"Eliminare elemento?",message:"Questo elemento verrà eliminato dalla Galleria.",okText:"Elimina"})) return;
          stopSlide();
          if (p.real) await os.photos.remove(p.id);
          else { hidden.push(p.id); os.store.set("galHidden", hidden); }
          draw();
        };
        const ed = root.querySelector("#vedit"); if (ed) ed.onclick = () => { stopSlide(); openEditor(p); };

        // video con traccia audio separata (registrata dal runtime): sincronizza
        // l'audio nascosto col video muto durante play/pausa/seek.
        if (p.video && p.audioTrack) {
          const vid = img, aud = root.querySelector("#vaud");
          if (aud) {
            const sync = () => { if (Math.abs(aud.currentTime - vid.currentTime) > 0.25) aud.currentTime = vid.currentTime; };
            vid.addEventListener("play", () => { aud.currentTime = vid.currentTime; aud.play().catch(()=>{}); });
            vid.addEventListener("pause", () => aud.pause());
            vid.addEventListener("seeking", () => { try { aud.currentTime = vid.currentTime; } catch {} });
            vid.addEventListener("timeupdate", sync);
            vid.addEventListener("ratechange", () => { aud.playbackRate = vid.playbackRate; });
            vid.addEventListener("ended", () => aud.pause());
          }
        }

        // gesti: swipe per cambiare foto, doppio-tap per zoom, trascinamento in zoom
        const stage = root.querySelector("#vstage");
        if (p.video) return;   // per i video lasciamo i controlli nativi (no swipe/zoom)
        let scale = 1, tx = 0, ty = 0, sx = 0, sy = 0, moved = 0, dragging = false, lastTap = 0;
        const setT = () => { img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
        stage.addEventListener("touchstart", e => {
          if (e.touches.length!==1) return;
          dragging = true; moved = 0; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
          img.style.transition = "none";
        }, {passive:true});
        stage.addEventListener("touchmove", e => {
          if (!dragging || e.touches.length!==1) return;
          const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
          moved = Math.abs(dx)+Math.abs(dy);
          if (scale > 1) { tx += dx; ty += dy; sx = e.touches[0].clientX; sy = e.touches[0].clientY; setT(); }
        }, {passive:true});
        stage.addEventListener("touchend", e => {
          dragging = false; img.style.transition = "transform .18s";
          const dx = (e.changedTouches[0].clientX - sx);
          const now = Date.now();
          if (now - lastTap < 300 && moved < 12) {           // doppio-tap => zoom toggle
            if (scale>1){ scale=1; tx=0; ty=0; } else scale=2.4; setT(); lastTap=0; return;
          }
          lastTap = now;
          if (scale===1 && moved>60) { if (dx<-40) go(i+1); else if (dx>40) go(i-1); }
        }, {passive:true});
      };

      const openEditor = (p) => {
        let filter = "none", bright = 100, contrast = 100, saturate = 100, rot = 0;
        const cssFilter = () => `${filter==='none'?'':filter} brightness(${bright}%) contrast(${contrast}%) saturate(${saturate}%)`;
        const apply = () => { const el = root.querySelector("#edit-img");
          el.style.filter = cssFilter(); el.style.transform = `rotate(${rot}deg)` + (rot%180?" scale(.75)":""); };
        const slider = (id,label,min,max,val) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="color:#fff;font-size:calc(12px*var(--fscale,1));width:78px">${label}</div><input type="range" class="slider" style="flex:1" min="${min}" max="${max}" value="${val}" id="${id}"></div>`;
        root.innerHTML = `
          <div style="height:100%;display:flex;flex-direction:column;background:#000">
            <div class="back-bar"><button class="back-btn" style="background:rgba(255,255,255,.15)"></button><div class="back-title" style="color:#fff;flex:1">Modifica</div>
              <button id="rot" title="Ruota" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(16px*var(--fscale,1));cursor:pointer;margin-right:8px">↻</button>
              <button class="btn" id="save" style="width:auto;padding:8px 16px">Salva</button></div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden"><img id="edit-img" src="${p.data}" style="max-width:90%;max-height:100%;border-radius:12px;transition:transform .2s"></div>
            <div style="padding:12px 16px 4px">
              ${slider("br","Luminosità",50,150,100)}
              ${slider("co","Contrasto",50,150,100)}
              ${slider("sa","Saturazione",0,200,100)}</div>
            <div style="display:flex;gap:8px;overflow-x:auto;padding:8px 16px 20px">${FILTERS.map((f,fi)=>`
              <button data-fil="${fi}" style="flex:0 0 auto;padding:10px 14px;border-radius:12px;border:none;background:${fi===0?'var(--accent)':'rgba(255,255,255,.12)'};color:#fff;cursor:pointer;font-size:calc(13px*var(--fscale,1))">${f[0]}</button>`).join("")}</div>
          </div>`;
        apply();
        root.querySelector(".back-btn").onclick = () => openViewer(items.indexOf(p));
        root.querySelector("#br").oninput = e => { bright=+e.target.value; apply(); };
        root.querySelector("#co").oninput = e => { contrast=+e.target.value; apply(); };
        root.querySelector("#sa").oninput = e => { saturate=+e.target.value; apply(); };
        root.querySelector("#rot").onclick = () => { rot=(rot+90)%360; apply(); };
        root.querySelectorAll("[data-fil]").forEach(b=>b.onclick=()=>{ filter=FILTERS[+b.dataset.fil][1];
          root.querySelectorAll("[data-fil]").forEach(x=>x.style.background="rgba(255,255,255,.12)"); b.style.background="var(--accent)"; apply(); });
        root.querySelector("#save").onclick = () => {
          const img = new Image();
          img.onload = async () => {
            const swap = rot % 180 !== 0;
            const cv = document.createElement("canvas");
            cv.width  = swap ? img.height : img.width;
            cv.height = swap ? img.width  : img.height;
            const ctx = cv.getContext("2d");
            ctx.filter = cssFilter();
            ctx.translate(cv.width/2, cv.height/2);
            ctx.rotate(rot*Math.PI/180);
            ctx.drawImage(img, -img.width/2, -img.height/2);
            await os.photos.add(cv.toDataURL("image/jpeg",0.9));
            os.notify({ app:"gallery", title:"Galleria", text:"Foto modificata salvata." });
            draw();
          };
          img.src = p.data;
        };
      };

      draw();
      root._cleanup = stopSlide;
    }});

  /* ---------- Orologio (orologio + sveglie + cronometro + fusi CRUD) ---------- */
  const clock = app({ id:"clock", name:"Orologio", icon:"⏰", color:"#1c1c2e",
    render(root, os) {
      let alarms = os.store.get("alarms", [{ id:1, time:"07:00", on:true }, { id:2, time:"08:30", on:false }]);
      let world  = os.store.get("worldClocks", [
        { id:1, city:"New York", tz:"America/New_York" },
        { id:2, city:"Londra",   tz:"Europe/London" },
        { id:3, city:"Tokyo",    tz:"Asia/Tokyo" },
      ]);
      const saveA = () => os.store.set("alarms", alarms);
      const saveW = () => os.store.set("worldClocks", world);

      // elenco fusi selezionabili per il CRUD
      const CITIES = [
        ["Honolulu","Pacific/Honolulu"],["Anchorage","America/Anchorage"],["Los Angeles","America/Los_Angeles"],
        ["Denver","America/Denver"],["Città del Messico","America/Mexico_City"],["Chicago","America/Chicago"],
        ["New York","America/New_York"],["Toronto","America/Toronto"],["San Paolo","America/Sao_Paulo"],
        ["Buenos Aires","America/Argentina/Buenos_Aires"],["Azzorre","Atlantic/Azores"],["Londra","Europe/London"],
        ["Lisbona","Europe/Lisbon"],["Roma","Europe/Rome"],["Parigi","Europe/Paris"],["Berlino","Europe/Berlin"],
        ["Madrid","Europe/Madrid"],["Atene","Europe/Athens"],["Il Cairo","Africa/Cairo"],["Johannesburg","Africa/Johannesburg"],
        ["Mosca","Europe/Moscow"],["Istanbul","Europe/Istanbul"],["Dubai","Asia/Dubai"],["Karachi","Asia/Karachi"],
        ["Mumbai","Asia/Kolkata"],["Dhaka","Asia/Dhaka"],["Bangkok","Asia/Bangkok"],["Giacarta","Asia/Jakarta"],
        ["Singapore","Asia/Singapore"],["Hong Kong","Asia/Hong_Kong"],["Pechino","Asia/Shanghai"],["Perth","Australia/Perth"],
        ["Seul","Asia/Seoul"],["Tokyo","Asia/Tokyo"],["Adelaide","Australia/Adelaide"],["Brisbane","Australia/Brisbane"],
        ["Melbourne","Australia/Melbourne"],["Sydney","Australia/Sydney"],["Nouméa","Pacific/Noumea"],["Auckland","Pacific/Auckland"],
        ["Suva","Pacific/Fiji"],
      ];

      root.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column">
        <div style="flex:1;overflow-y:auto">
          <!-- SVEGLIA -->
          <section class="clk-sec on" id="sec-alarm">
            <div class="hero"><div class="hero-l"><h1>Sveglia</h1></div><button id="add-al" class="mini-add">${ICO("plus-circle-fill","width:22px;height:22px")}</button></div>
            <div id="al-panel"></div>
            <div class="group" id="alarms"></div>
          </section>
          <!-- OROLOGIO -->
          <section class="clk-sec" id="sec-clock">
            <div class="hero"><div class="hero-l"><h1>Orologio</h1></div><button id="add-tz" class="mini-add">${ICO("plus-circle-fill","width:22px;height:22px")}</button></div>
            <div style="text-align:center;padding:8px 12px 18px">
              <div id="big-clock" style="font-size:calc(64px*var(--fscale,1));font-weight:200;font-variant-numeric:tabular-nums"></div>
              <div style="color:var(--text-dim);text-transform:capitalize" id="big-date"></div></div>
            <div class="section-label">Fuso orario mondiale</div>
            <div id="tz-panel"></div>
            <div class="group" id="world"></div>
          </section>
          <!-- TIMER -->
          <section class="clk-sec" id="sec-timer">
            <div class="hero"><div class="hero-l"><h1>Timer</h1></div></div>
            <div style="padding:16px">
              <div id="tmr" style="text-align:center;font-size:calc(68px*var(--fscale,1));font-weight:200;font-variant-numeric:tabular-nums;margin:20px 0">00:00</div>
              <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:18px" id="tmr-presets">
                <button class="tpz" data-s="60">1 min</button><button class="tpz" data-s="300">5 min</button>
                <button class="tpz" data-s="600">10 min</button><button class="tpz" data-s="1800">30 min</button></div>
              <div style="display:flex;gap:10px">
                <button class="btn ghost" style="flex:1" id="tmr-reset">Azzera</button>
                <button class="btn" style="flex:1" id="tmr-btn">Avvia</button></div></div>
          </section>
          <!-- CRONOMETRO -->
          <section class="clk-sec" id="sec-chrono">
            <div class="hero"><div class="hero-l"><h1>Cronometro</h1></div></div>
            <div id="chrono" style="text-align:center;font-size:calc(64px*var(--fscale,1));font-weight:200;font-variant-numeric:tabular-nums;margin:24px 0">00:00.0</div>
            <div style="display:flex;gap:10px;padding:0 16px 8px">
              <button class="btn ghost" style="flex:1" id="chrono-lap">Giro</button>
              <button class="btn" style="flex:1" id="chrono-btn">Avvia</button></div>
            <div class="group" id="laps" style="display:none"></div>
          </section>
          <div style="height:20px"></div>
        </div>
        <nav class="tabbar" id="clk-nav">
          <button data-sec="alarm" class="on"><span class="tb-pill">${ICO("alarm-fill","width:20px;height:20px")}</span>Sveglia</button>
          <button data-sec="clock"><span class="tb-pill">${ICO("clock-fill","width:20px;height:20px")}</span>Orologio</button>
          <button data-sec="timer"><span class="tb-pill">${ICO("hourglass-split","width:20px;height:20px")}</span>Timer</button>
          <button data-sec="chrono"><span class="tb-pill">${ICO("stopwatch-fill","width:20px;height:20px")}</span>Cronometro</button>
        </nav>
        </div>
        <style>.mini-add{width:44px;height:44px;border-radius:50%;border:none;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
          .inline-panel{background:var(--surface);border-radius:var(--radius-sm);margin:0 16px 10px;padding:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
          .inline-panel input,.inline-panel select{background:var(--surface-2);border:none;border-radius:10px;padding:11px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none}
          .inline-panel input[type=time]{flex:1}.inline-panel select{flex:1}
          .tpz{background:var(--surface-2);border:none;border-radius:14px;padding:9px 12px;color:var(--text);font-size:calc(13px*var(--fscale,1));cursor:pointer}</style>`;

      const bc=root.querySelector("#big-clock"), bd=root.querySelector("#big-date");

      // ---- NAVIGAZIONE A SCHEDE (stile Google Orologio) ----
      root.querySelectorAll("#clk-nav [data-sec]").forEach(b => b.onclick = () => {
        const s = b.dataset.sec;
        root.querySelectorAll(".clk-sec").forEach(sec => sec.classList.toggle("on", sec.id==="sec-"+s));
        root.querySelectorAll("#clk-nav [data-sec]").forEach(x => x.classList.toggle("on", x===b));
      });

      // ---- SVEGLIE ----
      const drawAlarms = () => {
        const box = root.querySelector("#alarms");
        box.innerHTML = alarms.length ? alarms.map(a=>`
          <div class="item"><div class="i-body"><div class="i-title" style="font-size:calc(26px*var(--fscale,1));font-weight:300">${a.time}</div></div>
            <button data-del="${a.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer;margin-right:8px">${ICO("trash-fill","width:16px;height:16px")}</button>
            <div class="switch ${a.on?'on':''}" data-al="${a.id}"></div></div>`).join("")
          : `<div class="item"><div class="i-sub" style="padding:6px">Nessuna sveglia impostata</div></div>`;
        box.querySelectorAll("[data-al]").forEach(el => el.onclick = () => { const a=alarms.find(x=>x.id==el.dataset.al); a.on=!a.on; saveA(); el.classList.toggle("on"); });
        box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { alarms=alarms.filter(x=>x.id!=b.dataset.del); saveA(); drawAlarms(); });
      };
      const alPanel = root.querySelector("#al-panel");
      root.querySelector("#add-al").onclick = () => {
        if (alPanel.innerHTML) { alPanel.innerHTML=""; return; }
        alPanel.innerHTML = `<div class="inline-panel">
          <input type="time" id="al-time" value="09:00">
          <button class="btn" id="al-ok" style="width:auto;padding:11px 18px">Aggiungi</button></div>`;
        alPanel.querySelector("#al-ok").onclick = () => {
          const t = alPanel.querySelector("#al-time").value;
          if (t) { alarms.push({ id:Date.now(), time:t, on:true }); saveA(); alPanel.innerHTML=""; drawAlarms(); }
        };
      };

      // ---- FUSI ORARI (CRUD) ----
      const worldBox = root.querySelector("#world");
      const drawWorld = () => {
        const now = new Date();
        worldBox.innerHTML = world.length ? world.map(w=>{
          const t = now.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit",timeZone:w.tz});
          const off = new Intl.DateTimeFormat("en-US",{timeZone:w.tz,timeZoneName:"shortOffset"}).formatToParts(now).find(p=>p.type==="timeZoneName");
          return `<div class="item"><div class="i-body"><div class="i-title">${w.city}</div><div class="i-sub">${off?off.value:''}</div></div>
            <div style="font-size:calc(24px*var(--fscale,1));font-weight:300;font-variant-numeric:tabular-nums;margin-right:10px">${t}</div>
            <button data-tzdel="${w.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer">${ICO("trash-fill","width:16px;height:16px")}</button></div>`;
        }).join("") : `<div class="item"><div class="i-sub" style="padding:6px">Nessun fuso aggiunto</div></div>`;
        worldBox.querySelectorAll("[data-tzdel]").forEach(b => b.onclick = () => { world=world.filter(x=>x.id!=b.dataset.tzdel); saveW(); drawWorld(); });
      };
      const tzPanel = root.querySelector("#tz-panel");
      root.querySelector("#add-tz").onclick = () => {
        if (tzPanel.innerHTML) { tzPanel.innerHTML=""; return; }
        tzPanel.innerHTML = `<div class="inline-panel">
          <select id="tz-sel">${CITIES.map(([c,tz])=>`<option value="${tz}">${c}</option>`).join("")}</select>
          <button class="btn" id="tz-ok" style="width:auto;padding:11px 18px">Aggiungi</button></div>`;
        tzPanel.querySelector("#tz-ok").onclick = () => {
          const sel = tzPanel.querySelector("#tz-sel"); const tz = sel.value;
          const city = CITIES.find(c=>c[1]===tz)[0];
          world.push({ id:Date.now(), city, tz }); saveW(); tzPanel.innerHTML=""; drawWorld();
        };
      };

      const tick=()=>{const d=new Date();bc.textContent=d.toLocaleTimeString("it-IT");bd.textContent=d.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});drawWorld();};
      tick(); os.interval(root,tick,1000);
      drawAlarms();

      // ---- CRONOMETRO (con giri) ----
      let t0=null,raf=null,base=0,laps=[]; const ch=root.querySelector("#chrono"),cb=root.querySelector("#chrono-btn"),lapBtn=root.querySelector("#chrono-lap"),lapsBox=root.querySelector("#laps");
      const fmtCh=e=>{const m=String(Math.floor(e/60)).padStart(2,"0");return `${m}:${(e%60).toFixed(1).padStart(4,"0")}`;};
      const elapsed=()=>base+(t0!=null?(performance.now()-t0)/1000:0);
      const upd=()=>{ch.textContent=fmtCh(elapsed());raf=requestAnimationFrame(upd);};
      const drawLaps=()=>{lapsBox.style.display=laps.length?"block":"none";
        lapsBox.innerHTML=laps.map((l,i)=>`<div class="item"><div class="i-body"><div class="i-title">Giro ${i+1}</div></div><div style="font-variant-numeric:tabular-nums;margin-right:12px">${fmtCh(l)}</div></div>`).join("");};
      cb.onclick=()=>{
        if(raf){cancelAnimationFrame(raf);raf=null;base=elapsed();t0=null;cb.textContent="Riprendi";lapBtn.textContent="Azzera";}
        else{t0=performance.now();upd();cb.textContent="Ferma";lapBtn.textContent="Giro";}
      };
      lapBtn.onclick=()=>{
        if(raf){ laps.push(elapsed()); drawLaps(); }          // in marcia: segna giro
        else { base=0; laps=[]; ch.textContent="00:00.0"; drawLaps(); cb.textContent="Avvia"; }  // fermo: azzera
      };

      // ---- TIMER (conto alla rovescia) ----
      let tmrTotal=0, tmrLeft=0, tmrRaf=null, tmrEnd=0;
      const tmrEl=root.querySelector("#tmr"), tmrBtn=root.querySelector("#tmr-btn");
      const fmtTmr=s=>{s=Math.max(0,Math.ceil(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;
        return (h?String(h).padStart(2,"0")+":":"")+String(m).padStart(2,"0")+":"+String(ss).padStart(2,"0");};
      const drawTmr=()=>{tmrEl.textContent=fmtTmr(tmrLeft);};
      const tmrTick=()=>{ tmrLeft=(tmrEnd-performance.now())/1000;
        if(tmrLeft<=0){ tmrLeft=0; drawTmr(); stopTmr(); os.vibrate&&os.vibrate([200,120,200]); os.notify({app:"clock",title:"Timer",text:"Tempo scaduto ⏰"}); return; }
        drawTmr(); tmrRaf=requestAnimationFrame(tmrTick); };
      const stopTmr=()=>{ if(tmrRaf){cancelAnimationFrame(tmrRaf);tmrRaf=null;} tmrBtn.textContent="Avvia"; };
      root.querySelectorAll(".tpz").forEach(b=>b.onclick=()=>{ if(tmrRaf)return; tmrTotal=tmrLeft=+b.dataset.s; drawTmr(); });
      tmrBtn.onclick=()=>{
        if(tmrRaf){ stopTmr(); tmrTotal=tmrLeft; }               // pausa
        else { if(tmrLeft<=0){ if(tmrTotal>0)tmrLeft=tmrTotal; else return; } tmrEnd=performance.now()+tmrLeft*1000; tmrTick(); tmrBtn.textContent="Pausa"; }
      };
      root.querySelector("#tmr-reset").onclick=()=>{ stopTmr(); tmrLeft=tmrTotal; drawTmr(); };
      drawTmr();

      root._cleanup = () => { if(raf) cancelAnimationFrame(raf); if(tmrRaf) cancelAnimationFrame(tmrRaf); };
    }});

  /* ---------- Note (cartelle, ricerca, colori, formattazione) ---------- */
  const notes = app({ id:"notes", name:"Note", icon:"📝", color:"#ffcc00",
    render(root, os) {
      let list = os.store.get("notesList2", [
        { id:1, text:"# Benvenuto in NovaOS 📝\nQuesta app supporta **formattazione**, cartelle, colori e ricerca.\n- Tocca + per una nuova nota\n- Usa la barra per grassetto, titoli, elenchi", color:"#ffcc00", cat:"Personale", pin:true, updated:Date.now() },
      ]);
      const save = () => os.store.set("notesList2", list);
      const CATS = ["Personale","Lavoro","Idee","Altro"];
      const COLORS = ["#ffcc00","#35c759","#0a84ff","#ff375f","#af52de"];
      let filterCat = "Tutte", query = "";
      const esc = s => s.replace(/</g,"&lt;");
      const title = t => (t.split("\n")[0].replace(/^#\s*/,"") || "Nuova nota").slice(0,40);
      const preview = t => (t.split("\n").slice(1).join(" ").replace(/[#*-]/g,"") || "Nessun testo").slice(0,52);
      const when = ts => new Date(ts).toLocaleDateString("it-IT",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
      const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/\*(.+?)\*/g,"<i>$1</i>");
      const md = t => t.split("\n").map((l,i) => {
        const cb = l.match(/^-\s\[([ xX])\]\s?(.*)$/);
        if (cb) { const done=cb[1].toLowerCase()==="x"; return `<div class="chk" data-ln="${i}" style="display:flex;gap:8px;align-items:flex-start;padding:3px 0;cursor:pointer">
          <span style="font-size:calc(18px*var(--fscale,1));line-height:1.3;color:${done?'var(--accent)':'var(--text-dim)'}">${done?'☑':'☐'}</span>
          <span style="${done?'text-decoration:line-through;color:var(--text-dim)':''}">${inline(cb[2])||'&nbsp;'}</span></div>`; }
        return /^#\s/.test(l) ? `<h3 style="margin:10px 0 4px">${inline(l.slice(2))}</h3>`
          : /^-\s/.test(l) ? `<div style="padding-left:14px">• ${inline(l.slice(2))}</div>` : `<div>${inline(l)||"<br>"}</div>`;
      }).join("");

      const drawList = () => {
        const shown = list.filter(n => (filterCat==="Tutte"||n.cat===filterCat) && (!query || n.text.toLowerCase().includes(query.toLowerCase())))
                          .sort((a,b)=>(b.pin?1:0)-(a.pin?1:0) || b.updated-a.updated);
        root.innerHTML = `<div class="hero"><div class="hero-l"><h1>Note</h1><div class="hero-sub">${list.length} note</div></div></div>
          <div class="searchbar"><span class="sb-i">${ICO("search")}</span><input id="q" value="${query}" placeholder="Cerca nelle note"></div>
          <div class="seg" style="margin:2px 16px 8px;flex-wrap:wrap"><button data-cat="Tutte" class="${filterCat==='Tutte'?'on':''}">Tutte</button>${CATS.map(c=>`<button data-cat="${c}" class="${filterCat===c?'on':''}">${c}</button>`).join("")}</div>
          <div class="list">${shown.length?shown.map(n=>`
            <div class="card tappable" data-id="${n.id}" style="border-left:4px solid ${n.color}">
              <div class="c-body"><div class="c-title">${n.pin?ICO("pin-map-fill","width:.9em;height:.9em")+' ':''}${esc(title(n.text))}</div>
                <div class="c-sub">${esc(preview(n.text))}</div>
                <div style="font-size:calc(11px*var(--fscale,1));color:var(--text-dim);margin-top:3px">${n.cat} · ${when(n.updated)}</div></div></div>`).join("")
            :`<div style="text-align:center;color:var(--text-dim);padding:30px">Nessuna nota</div>`}</div>
          <div style="height:90px"></div>
          <button class="fab" id="new">${ICO("pencil-fill","width:22px;height:22px")}<span class="fab-t">Nuova</span></button>`;
        root.querySelector("#new").onclick = () => { const n={id:Date.now(),text:"",color:COLORS[0],cat:"Personale",pin:false,updated:Date.now()}; list.unshift(n); save(); drawEditor(n.id); };
        root.querySelector("#q").oninput = e => { query=e.target.value; const p=e.target.selectionStart; drawList(); const q2=root.querySelector("#q"); q2.focus(); q2.setSelectionRange(p,p); };
        root.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{filterCat=b.dataset.cat;drawList();});
        root.querySelectorAll("[data-id]").forEach(el => el.onclick = () => drawEditor(+el.dataset.id));
      };

      const drawEditor = (id) => {
        const n = list.find(x=>x.id===id); let editMode = true;
        const render = () => {
          root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1">Nota</div>
              <button id="pin" style="background:none;border:none;font-size:calc(17px*var(--fscale,1));cursor:pointer">${n.pin?'📌':'📍'}</button>
              <button id="prev" style="background:none;border:none;color:var(--accent);font-size:calc(14px*var(--fscale,1));cursor:pointer;margin:0 8px">${editMode?'Anteprima':'Modifica'}</button>
              <button id="del" style="background:none;border:none;color:var(--danger);font-size:calc(14px*var(--fscale,1));cursor:pointer">Elimina</button></div>
            ${editMode?`<div style="display:flex;gap:6px;padding:0 16px 8px">
              <button class="fmt" data-f="b" style="width:38px;height:36px;border:none;border-radius:9px;background:var(--surface);color:var(--text);font-weight:700;cursor:pointer">B</button>
              <button class="fmt" data-f="i" style="width:38px;height:36px;border:none;border-radius:9px;background:var(--surface);color:var(--text);font-style:italic;cursor:pointer">I</button>
              <button class="fmt" data-f="h" style="width:38px;height:36px;border:none;border-radius:9px;background:var(--surface);color:var(--text);cursor:pointer">H</button>
              <button class="fmt" data-f="l" style="width:38px;height:36px;border:none;border-radius:9px;background:var(--surface);color:var(--text);cursor:pointer">•</button>
              <button class="fmt" data-f="c" style="width:38px;height:36px;border:none;border-radius:9px;background:var(--surface);color:var(--text);cursor:pointer">☑</button></div>`:''}
            <div style="padding:0 16px">
              ${editMode
                ? `<textarea id="ed" placeholder="Scrivi qui… usa **grassetto**, # Titolo, - elenco" style="width:100%;min-height:300px;background:var(--surface);border:none;border-radius:14px;padding:16px;color:var(--text);font-size:calc(16px*var(--fscale,1));line-height:1.5;resize:none;outline:none">${esc(n.text)}</textarea>`
                : `<div style="background:var(--surface);border-radius:14px;padding:16px;min-height:300px;font-size:calc(16px*var(--fscale,1));line-height:1.6">${md(n.text)}</div>`}
            </div>
            <div class="section-label">Cartella</div>
            <div class="seg" style="flex-wrap:wrap">${CATS.map(c=>`<button data-c="${c}" class="${n.cat===c?'on':''}">${c}</button>`).join("")}</div>
            <div class="section-label">Colore</div>
            <div style="display:flex;gap:12px;padding:6px 16px 90px">${COLORS.map(c=>`<div data-col="${c}" style="width:34px;height:34px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${n.color===c?'var(--text)':'transparent'}"></div>`).join("")}</div>`;
          root.querySelector(".back-btn").onclick = drawList;
          root.querySelector("#pin").onclick = () => { n.pin=!n.pin; n.updated=Date.now(); save(); render(); };
          root.querySelector("#prev").onclick = () => { editMode=!editMode; render(); };
          root.querySelector("#del").onclick = () => { list=list.filter(x=>x.id!==id); save(); drawList(); };
          root.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{n.cat=b.dataset.c;n.updated=Date.now();save();render();});
          root.querySelectorAll("[data-col]").forEach(el=>el.onclick=()=>{n.color=el.dataset.col;save();render();});
          const ed = root.querySelector("#ed");
          if (ed) {
            ed.oninput = e => { n.text=e.target.value; n.updated=Date.now(); save(); };
            root.querySelectorAll(".fmt").forEach(b=>b.onclick=()=>{
              const s=ed.selectionStart, e=ed.selectionEnd, sel=ed.value.slice(s,e);
              const wrap=(a,z=a)=>ed.value.slice(0,s)+a+(sel||"testo")+z+ed.value.slice(e);
              const line=(pre)=>{const ls=ed.value.lastIndexOf("\n",s-1)+1; return ed.value.slice(0,ls)+pre+ed.value.slice(ls);};
              const f=b.dataset.f;
              ed.value = f==="b"?wrap("**"):f==="i"?wrap("*"):f==="h"?line("# "):f==="c"?line("- [ ] "):line("- ");
              n.text=ed.value; n.updated=Date.now(); save(); ed.focus();
            });
          }
          // in anteprima: spunta/despunta le checkbox toccandole
          root.querySelectorAll(".chk").forEach(el => el.onclick = () => {
            const lines = n.text.split("\n"); const i = +el.dataset.ln;
            lines[i] = lines[i].replace(/^-\s\[([ xX])\]/, (m,c)=>`- [${c.toLowerCase()==="x"?" ":"x"}]`);
            n.text = lines.join("\n"); n.updated=Date.now(); save(); render();
          });
        };
        render();
      };

      drawList();
    }});

  /* ---------- Calcolatrice ---------- */
  const calc = app({ id:"calc", name:"Calcolatrice", icon:"🧮", color:"#ff9500",
    render(root, os) {
      let expr = "", sci = false;
      let hist = os.store.get("calcHistory", []);
      const saveH = () => os.store.set("calcHistory", (hist = hist.slice(0,20)));

      const evalExpr = (s) => {
        const pre = "const sin=x=>Math.sin(x*Math.PI/180),cos=x=>Math.cos(x*Math.PI/180),tan=x=>Math.tan(x*Math.PI/180),"
          + "ln=Math.log,log=Math.log10,sqrt=Math.sqrt,pi=Math.PI,fact=n=>{let r=1;for(let i=2;i<=n;i++)r*=i;return r;};";
        let js = s.replace(/π/g,"pi").replace(/√/g,"sqrt").replace(/×/g,"*").replace(/÷/g,"/").replace(/−/g,"-")
          .replace(/\^/g,"**").replace(/(\d+(?:\.\d+)?|\))!/g,"fact($1)");
        const r = Function('"use strict";'+pre+"return ("+js+");")();
        return (Math.round(r*1e10)/1e10);
      };

      const draw = () => {
        const sciRows = sci ? `
          <button class="ck fn" data-k="sin(">sin</button><button class="ck fn" data-k="cos(">cos</button><button class="ck fn" data-k="tan(">tan</button><button class="ck fn" data-k="√(">√</button>
          <button class="ck fn" data-k="ln(">ln</button><button class="ck fn" data-k="log(">log</button><button class="ck fn" data-k="π">π</button><button class="ck fn" data-k="^">xʸ</button>
          <button class="ck fn" data-k="!">n!</button><button class="ck fn" data-k="%">%</button><button class="ck fn" data-k="(">(</button><button class="ck fn" data-k=")">)</button>` : "";
        const base = [["C","act"],["⌫","fn"],["±","fn"],["÷","op"],
          ["7","n"],["8","n"],["9","n"],["×","op"],["4","n"],["5","n"],["6","n"],["−","op"],
          ["1","n"],["2","n"],["3","n"],["+","op"],["0","n"],["00","n"],[".","n"],["=","eq"]];
        root.innerHTML = `
          <div class="hero"><div class="hero-l"><h1>Calcolatrice</h1></div>
            <div style="display:flex;gap:8px;align-items:center"><button class="round-act small" id="hist" style="background:var(--surface);color:var(--text)">${ICO("clock-fill","width:18px;height:18px")}</button>
            <button class="btn ghost" id="scitog" style="width:auto;padding:9px 14px">${sci?"Base":"Sci"}</button></div></div>
          <div id="hist-panel"></div>
          <div id="calc-out" style="text-align:right;font-size:calc(46px*var(--fscale,1));font-weight:300;padding:14px 24px 0;min-height:60px;word-break:break-all">${expr||"0"}</div>
          <div id="calc-prev" style="text-align:right;font-size:calc(20px*var(--fscale,1));color:var(--text-dim);padding:0 24px 8px;min-height:26px;font-variant-numeric:tabular-nums"></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:8px 16px 90px">
            ${sciRows}${base.map(([k,t])=>`<button class="ck ${t}" data-k="${k}">${k}</button>`).join("")}
          </div>
          <style>.ck{border:none;border-radius:16px;aspect-ratio:1.15;font-size:calc(22px*var(--fscale,1));cursor:pointer;background:var(--surface);color:var(--text)}
            .ck.op,.ck.eq{background:var(--accent);color:#fff}.ck.act{background:var(--danger);color:#fff}.ck.fn{background:var(--surface-2);font-size:calc(17px*var(--fscale,1))}
            .ck:active{opacity:.7}</style>`;
        root.querySelector("#scitog").onclick = () => { sci=!sci; draw(); };
        root.querySelector("#hist").onclick = () => {
          const p = root.querySelector("#hist-panel");
          p.innerHTML = p.innerHTML ? "" : `<div class="group" style="margin:0 16px 8px;max-height:150px;overflow:auto">${hist.length?hist.map(h=>`<div class="item" data-h="${h.r}"><div class="i-body"><div class="i-sub">${h.e}</div><div class="i-title">= ${h.r}</div></div></div>`).join(""):'<div class="item"><div class="i-sub" style="padding:6px">Nessun calcolo</div></div>'}</div>`;
          p.querySelectorAll("[data-h]").forEach(el => el.onclick = () => { expr=el.dataset.h; p.innerHTML=""; root.querySelector("#calc-out").textContent=expr; });
        };
        root.querySelectorAll(".ck").forEach(b => b.onclick = () => press(b.dataset.k));
        refresh();
      };
      const refresh = () => {
        const out = root.querySelector("#calc-out"); if (out) out.textContent = expr || "0";
        const prev = root.querySelector("#calc-prev"); if (!prev) return;
        // anteprima risultato live (solo se l'espressione è calcolabile e diversa dal risultato)
        if (!expr || /[+\-×÷^]$|\($/.test(expr) || expr==="Errore") { prev.textContent = ""; return; }
        try { const r = String(evalExpr(expr)); prev.textContent = (r!==expr && r!=="Infinity" && r!=="NaN") ? "= "+r : ""; }
        catch { prev.textContent = ""; }
      };
      const press = (k) => {
        if (k==="C") expr="";
        else if (k==="⌫") expr = expr.slice(0,-1);
        else if (k==="±") expr = expr.startsWith("-") ? expr.slice(1) : "-"+expr;
        else if (k==="=") { try { const r=String(evalExpr(expr)); if(expr && r!=="Infinity" && r!=="NaN"){ hist.unshift({e:expr,r}); saveH(); } expr=r; } catch { expr="Errore"; } }
        else { if(expr==="Errore"||expr==="Infinity"||expr==="NaN") expr=""; expr+=k; }
        refresh();
      };
      // tastiera fisica (utile su desktop e con tastiera collegata)
      const onKey = (e) => {
        const k = e.key;
        if (/[0-9.]/.test(k)) press(k);
        else if (k==="+") press("+");
        else if (k==="-") press("−");
        else if (k==="*") press("×");
        else if (k==="/") { e.preventDefault(); press("÷"); }
        else if (k==="^") press("^");
        else if (k==="(") press("(");
        else if (k===")") press(")");
        else if (k==="%") press("%");
        else if (k==="Enter" || k==="=") { e.preventDefault(); press("="); }
        else if (k==="Backspace") press("⌫");
        else if (k==="Escape") press("C");
        else return;
      };
      root._onKey = onKey; window.addEventListener("keydown", onKey);
      root._cleanup = () => window.removeEventListener("keydown", onKey);
      draw();
    }});

  /* ---------- Mail (client email — alternativa a Gmail) ---------- */
  const mail = app({ id:"mail", name:"Mail", icon:"✉️", color:"#e0245e",
    render(root, os) {
      const seed = {
        inbox: [
          { id:1, from:"Anna Rossi", subj:"Cena di venerdì", body:"Ciao! Confermi per venerdì sera? Pensavo alle 20:30.\n\nA presto,\nAnna", time:"16:04", read:false, star:true },
          { id:2, from:"NovaOS Team", subj:"Benvenuto in NovaOS Mail", body:"Grazie per aver scelto NovaOS.\nQuesto è il tuo client di posta: puoi leggere, rispondere, comporre e archiviare.", time:"14:20", read:false, star:false },
          { id:3, from:"Newsletter Tech", subj:"Le novità della settimana", body:"Questa settimana: web OS, PWA e molto altro.", time:"ieri", read:true, star:false },
        ], sent: [], drafts: [], trash: [],
      };
      let box = os.store.get("mailbox", seed);
      let cfg = os.store.get("mailCfg", { name:"Utente NovaOS", email:"tu@novaos.mail", signature:"— Inviato da NovaOS Mail", notify:true });
      let folder = "inbox", query = "";
      const save = () => os.store.set("mailbox", box);
      const saveCfg = () => os.store.set("mailCfg", cfg);
      const folders = [["inbox","Posta in arrivo","📥"],["sent","Inviati","📤"],["drafts","Bozze","📝"],["trash","Cestino","🗑️"]];
      const initials = n => n.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
      const color = n => `hsl(${[...n].reduce((s,c)=>s+c.charCodeAt(0),0)%360} 55% 50%)`;
      const esc = s => (s==null?"":String(s)).replace(/</g,"&lt;");
      const kb = n => n<1024?n+" B":(n/1024).toFixed(0)+" KB";
      const clip = t => (t.split("\n")[0]||"").slice(0,60);

      // ---- bridge nativo: posta reale (SMTP/IMAP) quando NovaOS è installato ----
      const nativeMail = !!(window.NovaNative && window.NovaNative.mailConfigure);
      const acct = () => { try { return nativeMail ? JSON.parse(window.NovaNative.mailAccount()||"{}") : { configured:false }; } catch { return { configured:false }; } };
      let syncing = false;

      // callback invocati dal MailBridge nativo al termine delle operazioni di rete
      window.NovaMail = {
        onMessages(f, jsonStr){
          let newUnread = 0;
          try {
            const arr = JSON.parse(jsonStr||"[]");
            const prev = new Set((box.inbox||[]).map(m=>m.uid));
            box.inbox = arr.map(m => ({ id: parseInt((m.uid||"").replace(/\D/g,""),10) || (Date.now()+Math.floor(Math.random()*1e6)),
              from:m.from, subj:m.subj, body:m.body, time:m.time, read:!!m.read, star:false, uid:m.uid }));
            newUnread = box.inbox.filter(m=>!m.read && !prev.has(m.uid)).length;
            save();
          } catch(e){}
          syncing = false;
          if (newUnread > 0) os.notify({ app:"mail", title:"Posta in arrivo", text:`${newUnread} nuov${newUnread>1?'i':'o'} messaggi${newUnread>1?'':'o'}` });
          if (root.isConnected) { folder="inbox"; drawList(); }
        },
        onSent(ok, err){
          syncing = false;
          os.notify({ app:"mail", title:"Mail", text: ok ? "Email inviata." : ("Invio non riuscito: "+(err||"errore")) });
          if (root.isConnected && folder==="sent") drawList();
        },
        onError(err){
          syncing = false;
          os.notify({ app:"mail", title:"Mail", text:"Errore posta: "+(err||"sconosciuto") });
          if (root.isConnected) drawList();
        },
      };
      const syncNow = () => {
        if (!nativeMail || !acct().configured || syncing) return;
        syncing = true; drawList();
        window.NovaNative.mailFetch("INBOX", 25);
      };

      const drawList = () => {
        const q = query.trim().toLowerCase();
        const msgs = box[folder].filter(m => !q || (m.from+" "+m.subj+" "+m.body).toLowerCase().includes(q));
        const unread = box.inbox.filter(m=>!m.read).length;
        const a = acct();
        const sub = syncing ? "Sincronizzazione…"
          : (a.configured ? a.email : (nativeMail ? "Account non configurato" : folders.find(f=>f[0]===folder)[1]))
            + (folder==='inbox'&&unread?` · ${unread} non lette`:'');
        root.innerHTML = `
          <div class="hero"><div class="hero-l"><h1>Mail</h1><div class="hero-sub">${sub}</div></div>
            <div style="display:flex;gap:8px;align-items:center">
              ${nativeMail&&a.configured?`<button class="round-act small" id="sync" style="background:var(--surface);color:var(--text)" ${syncing?'disabled':''}>${syncing?'⏳':ICO("arrow-repeat","width:17px;height:17px")}</button>`:''}
              <button class="round-act small" id="msettings" style="background:var(--surface);color:var(--text)">${ICO("gear-fill","width:17px;height:17px")}</button></div></div>
          <div class="searchbar"><span class="sb-i">${ICO("search")}</span><input id="q" value="${esc(query)}" placeholder="Cerca nella posta"></div>
          <div class="seg" style="margin-bottom:8px">${folders.map(f=>`<button data-f="${f[0]}" class="${folder===f[0]?'on':''}" style="font-size:calc(12px*var(--fscale,1))">${f[2]}${f[0]==='drafts'&&box.drafts.length?` ${box.drafts.length}`:''}</button>`).join("")}</div>
          <div class="list" style="padding-top:4px">${msgs.length?msgs.map(m=>`
            <div class="card tappable" data-id="${m.id}" style="${m.read?'':'border-left:3px solid var(--accent)'}">
              <div class="c-ico" style="background:${color(m.from)}">${initials(m.from)}</div>
              <div class="c-body"><div class="c-title" style="${m.read?'':'font-weight:700'}">${esc(m.from)} ${m.attachments&&m.attachments.length?'📎':''}</div>
                <div style="font-size:calc(14px*var(--fscale,1));${m.read?'color:var(--text-dim)':''}">${esc(m.subj)}</div>
                <div class="c-sub">${esc(clip(m.body))}</div></div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1))">${m.time}</div>
                <button data-star="${m.id}" style="background:none;border:none;font-size:calc(15px*var(--fscale,1));cursor:pointer">${m.star?'⭐':'☆'}</button></div></div>`).join("")
            :`<div style="text-align:center;color:var(--text-dim);padding:30px">${q?'Nessun risultato':'Nessun messaggio'}</div>`}</div>
          <div style="height:90px"></div>
          <button class="fab" id="compose">${ICO("pencil-fill","width:22px;height:22px")}<span class="fab-t">Scrivi</span></button>`;
        root.querySelector("#compose").onclick = () => drawCompose();
        root.querySelector("#msettings").onclick = drawSettings;
        const sy = root.querySelector("#sync"); if (sy) sy.onclick = syncNow;
        const qi = root.querySelector("#q");
        qi.oninput = e => { query=e.target.value; const p=e.target.selectionStart; drawList(); const q2=root.querySelector("#q"); q2.focus(); q2.setSelectionRange(p,p); };
        root.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { folder=b.dataset.f; drawList(); });
        root.querySelectorAll("[data-star]").forEach(b => b.onclick = e => { e.stopPropagation(); const m=box[folder].find(x=>x.id==b.dataset.star); m.star=!m.star; save(); drawList(); });
        root.querySelectorAll("[data-id]").forEach(el => el.onclick = e => { if(e.target.dataset.star!==undefined) return; drawRead(+el.dataset.id); });
      };

      // gestori di posta più noti, con host e porte già predisposti.
      // "custom" = configurazione manuale (l'utente inserisce tutto a mano).
      const PROVIDERS = [
        { id:"gmail",   name:"Gmail",     ic:"✉️", domains:["gmail.com","googlemail.com"], imap:["imap.gmail.com",993], smtp:["smtp.gmail.com",465], note:"Con la verifica in 2 passaggi serve una password per app." },
        { id:"outlook", name:"Outlook",   ic:"📧", domains:["outlook.com","hotmail.com","hotmail.it","live.com","live.it","msn.com"], imap:["outlook.office365.com",993], smtp:["smtp.office365.com",587], note:"Con 2FA serve una password per app." },
        { id:"yahoo",   name:"Yahoo",     ic:"🟣", domains:["yahoo.com","yahoo.it","ymail.com"], imap:["imap.mail.yahoo.com",993], smtp:["smtp.mail.yahoo.com",465], note:"Richiede una password per app." },
        { id:"icloud",  name:"iCloud",    ic:"☁️", domains:["icloud.com","me.com","mac.com"], imap:["imap.mail.me.com",993], smtp:["smtp.mail.me.com",587], note:"Richiede una password per app." },
        { id:"libero",  name:"Libero",    ic:"📮", domains:["libero.it","inwind.it","iol.it","blu.it"], imap:["imapmail.libero.it",993], smtp:["smtp.libero.it",465] },
        { id:"aruba",   name:"Aruba",     ic:"🟠", domains:["aruba.it"], imap:["imaps.aruba.it",993], smtp:["smtps.aruba.it",465] },
        { id:"pec",     name:"PEC Aruba", ic:"🔐", domains:["pec.it"], imap:["imaps.pec.aruba.it",993], smtp:["smtps.pec.aruba.it",465] },
        { id:"gmx",     name:"GMX",       ic:"📬", domains:["gmx.com","gmx.net","gmx.it"], imap:["imap.gmx.com",993], smtp:["mail.gmx.com",465] },
        { id:"tim",     name:"TIM/Alice", ic:"📨", domains:["tim.it","alice.it","virgilio.it"], imap:["in.virgilio.it",993], smtp:["out.virgilio.it",465] },
        { id:"custom",  name:"Altro / Manuale", ic:"⚙️", domains:[], imap:["",993], smtp:["",465], note:"Inserisci manualmente server e porte del tuo provider." },
      ];
      const provByDomain = (email) => { const d = (email.split("@")[1]||"").toLowerCase();
        return PROVIDERS.find(p => p.domains.includes(d)) || null; };
      const provPreset = (email) => { const p = provByDomain(email); return p ? [p.imap[0], p.smtp[0]] : null; };
      const inp = (id,val,ph,type,extra="") => `<input id="${id}" value="${esc(val||"")}" placeholder="${ph}" ${type?`type="${type}"`:''} ${extra} style="width:100%;background:var(--surface-2);border:none;border-radius:12px;padding:12px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none;margin-bottom:10px">`;

      const drawSettings = () => {
        const a = acct();
        root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title">Impostazioni Mail</div></div>
          <div class="section-label">Identità</div>
          <div class="group" style="padding:14px 16px">
            ${inp("c-name", cfg.name, "Nome visualizzato")}
            ${inp("c-email", nativeMail?(a.email||cfg.email):cfg.email, "Indirizzo email", "email", 'inputmode="email"').replace(";margin-bottom:10px","")}
          </div>
          ${nativeMail ? `
          <div class="section-label">Provider di posta</div>
          <div style="display:flex;gap:8px;overflow-x:auto;padding:2px 16px 10px;-webkit-overflow-scrolling:touch">
            ${PROVIDERS.map(p=>`<button class="prov-chip" data-prov="${p.id}" style="flex:0 0 auto;background:var(--surface-2);border:1.5px solid transparent;border-radius:14px;padding:9px 13px;color:var(--text);font-size:calc(13px*var(--fscale,1));white-space:nowrap;cursor:pointer">${p.ic} ${p.name}</button>`).join("")}
          </div>
          <div id="c-provnote" style="padding:0 16px 8px;color:var(--text-dim);font-size:calc(12px*var(--fscale,1));line-height:1.5"></div>
          <div class="section-label">Account posta (IMAP/SMTP)</div>
          <div class="group" style="padding:14px 16px">
            <div style="display:flex;gap:8px">${inp("c-imaphost", a.imapHost, "Server IMAP (in arrivo)")}<div style="width:84px;flex:0 0 84px">${inp("c-imapport", a.imapPort||993, "Porta", "number")}</div></div>
            <div style="display:flex;gap:8px">${inp("c-smtphost", a.smtpHost, "Server SMTP (in uscita)")}<div style="width:84px;flex:0 0 84px">${inp("c-smtpport", a.smtpPort||465, "Porta", "number")}</div></div>
            ${inp("c-user", a.user||a.email, "Nome utente (di solito l'email)")}
            ${inp("c-pass", "", a.hasPassword?"Password ····· (invariata)":"Password", "password", 'autocomplete="off"')}
            <div style="font-size:calc(12px*var(--fscale,1));color:var(--text-dim);line-height:1.5">La password è cifrata nel dispositivo (Android Keystore) e non viene mai salvata in chiaro. Per Gmail/Outlook con 2FA serve una <b>password per app</b>.</div>
          </div>
          <div style="padding:0 16px 6px"><button class="btn" id="c-connect">${a.configured?'Aggiorna account':'Collega account'}</button>
            ${a.configured?`<button class="btn ghost" id="c-disc" style="color:var(--danger);margin-top:8px">Scollega account</button>`:''}</div>`
          : `<div class="group" style="margin:0 16px"><div class="item"><div class="i-ico" style="background:#e0245e">ℹ️</div><div class="i-body"><div class="i-title">Posta reale non disponibile qui</div><div class="i-sub">Installa NovaOS come app per collegare un account IMAP/SMTP reale.</div></div></div></div>`}
          <div class="section-label">Firma</div>
          <div class="group" style="padding:14px 16px"><textarea id="c-sig" style="width:100%;min-height:70px;background:var(--surface-2);border:none;border-radius:12px;padding:12px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none;resize:none">${cfg.signature.replace(/</g,"&lt;")}</textarea></div>
          <div class="group" style="margin-top:12px"><div class="item"><div class="i-ico" style="background:#e0245e">🔔</div><div class="i-body"><div class="i-title">Notifiche email</div></div><div class="switch ${cfg.notify?'on':''}" id="c-notify"></div></div></div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
            <button class="btn" id="c-save">Salva impostazioni</button>
            <button class="btn ghost" id="c-read">Segna tutte come lette</button>
            <button class="btn ghost" id="c-empty" style="color:var(--danger)">Svuota cestino (${box.trash.length})</button>
          </div><div style="height:40px"></div>`;
        root.querySelector(".back-btn").onclick = drawList;
        root.querySelector("#c-notify").onclick = e => { cfg.notify=!cfg.notify; e.currentTarget.classList.toggle("on"); };
        root.querySelector("#c-save").onclick = () => {
          cfg.name = root.querySelector("#c-name").value.trim() || cfg.name;
          cfg.email = root.querySelector("#c-email").value.trim() || cfg.email;
          cfg.signature = root.querySelector("#c-sig").value;
          saveCfg(); os.notify({ app:"mail", title:"Mail", text:"Impostazioni salvate." }); drawList();
        };
        // ---- selettore provider: compila host/porte già predisposti ----
        const emailEl = root.querySelector("#c-email");
        if (nativeMail) {
          const ih=root.querySelector("#c-imaphost"), ip=root.querySelector("#c-imapport"),
                sh=root.querySelector("#c-smtphost"), sp=root.querySelector("#c-smtpport"),
                us=root.querySelector("#c-user"), note=root.querySelector("#c-provnote");
          const chips = root.querySelectorAll(".prov-chip");
          const highlight = id => chips.forEach(c => {
            const on = c.dataset.prov === id;
            c.style.borderColor = on ? "var(--accent)" : "transparent";
            c.style.background = on ? "color-mix(in srgb, var(--accent) 18%, var(--surface-2))" : "var(--surface-2)";
          });
          const applyProv = (p, {force}={}) => {
            if (!p) return;
            highlight(p.id);
            note.innerHTML = p.note ? `ℹ️ ${p.note}` : (p.id==="custom" ? "" : `Server predisposti per <b>${p.name}</b>.`);
            if (p.id === "custom") return;                 // manuale: non tocca i campi
            if (force || !ih.value) ih.value = p.imap[0];
            if (force || !ip.value || +ip.value===993) ip.value = p.imap[1];
            if (force || !sh.value) sh.value = p.smtp[0];
            if (force || !sp.value || +sp.value===465) sp.value = p.smtp[1];
            if (us && (!us.value || force)) us.value = emailEl.value.trim();
          };
          chips.forEach(c => c.onclick = () => applyProv(PROVIDERS.find(p=>p.id===c.dataset.prov), {force:true}));
          // stato iniziale: riconosce il provider dai dati già presenti
          const guessed = (ih.value ? PROVIDERS.find(p=>p.imap[0]===ih.value) : null)
                       || provByDomain(emailEl.value.trim())
                       || (a.configured ? PROVIDERS.find(p=>p.id==="custom") : null);
          if (guessed) highlight(guessed.id), note.innerHTML = guessed.note ? `ℹ️ ${guessed.note}` : "";
          // digitando l'email di un provider noto, propone in automatico
          emailEl.onblur = () => { const p = provByDomain(emailEl.value.trim()); if (p) applyProv(p); if (us&&!us.value) us.value = emailEl.value.trim(); };
        }
        const connect = root.querySelector("#c-connect");
        if (connect) connect.onclick = () => {
          const email = root.querySelector("#c-email").value.trim();
          const payload = {
            name: root.querySelector("#c-name").value.trim(),
            email,
            imapHost: root.querySelector("#c-imaphost").value.trim(),
            imapPort: +root.querySelector("#c-imapport").value || 993,
            smtpHost: root.querySelector("#c-smtphost").value.trim(),
            smtpPort: +root.querySelector("#c-smtpport").value || 465,
            user: root.querySelector("#c-user").value.trim() || email,
          };
          const pass = root.querySelector("#c-pass").value;
          if (pass) payload.password = pass;                 // inviata al nativo solo se (ri)digitata; mai salvata nel web
          if (!payload.imapHost || !payload.smtpHost || (!pass && !acct().hasPassword)) {
            os.notify({ app:"mail", title:"Mail", text:"Compila server IMAP, SMTP e password." }); return;
          }
          cfg.name = payload.name || cfg.name; cfg.email = email || cfg.email; saveCfg();
          window.NovaNative.mailConfigure(JSON.stringify(payload));
          os.notify({ app:"mail", title:"Mail", text:"Account collegato. Sincronizzo…" });
          drawList(); syncNow();
        };
        const disc = root.querySelector("#c-disc");
        if (disc) disc.onclick = async () => { if(await os.confirm({title:"Scollegare l'account?",message:"La password cifrata verrà rimossa dal dispositivo.",okText:"Scollega"})){ window.NovaNative.mailClear(); os.notify({ app:"mail", title:"Mail", text:"Account scollegato." }); drawSettings(); } };
        root.querySelector("#c-read").onclick = () => { box.inbox.forEach(m=>m.read=true); save(); os.notify({ app:"mail", title:"Mail", text:"Tutte le email segnate come lette." }); };
        root.querySelector("#c-empty").onclick = async () => { if(await os.confirm({title:"Svuotare il cestino?",message:"I messaggi nel cestino verranno eliminati definitivamente.",okText:"Svuota"})){ box.trash=[]; save(); os.notify({ app:"mail", title:"Mail", text:"Cestino svuotato." }); drawSettings(); } };
      };

      const quote = m => `\n\n\n----- Messaggio originale -----\nDa: ${m.from}\nData: ${m.time}\nOggetto: ${m.subj}\n\n${m.body.split("\n").map(l=>"> "+l).join("\n")}`;

      const drawRead = (id) => {
        const m = box[folder].find(x=>x.id===id); if(!m) return;
        if (folder==="drafts") { drawCompose({ ...m, draftId:m.id }); return; }
        m.read = true; save();
        const atts = m.attachments||[];
        root.innerHTML = `
          <div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1;font-size:calc(18px*var(--fscale,1))">${esc(m.subj)}</div>
            <button id="star" style="background:none;border:none;font-size:calc(18px*var(--fscale,1));cursor:pointer">${m.star?'⭐':'☆'}</button>
            <button id="del" style="background:none;border:none;font-size:calc(18px*var(--fscale,1));cursor:pointer;margin-left:6px">🗑️</button></div>
          <div style="padding:0 16px">
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0 16px;border-bottom:1px solid var(--surface-2)">
              <div style="width:44px;height:44px;border-radius:50%;background:${color(m.from)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600">${initials(m.from)}</div>
              <div style="flex:1"><div style="font-weight:600">${esc(m.from)}</div><div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1))">${m.time}</div></div></div>
            <div style="padding:16px 0;font-size:calc(15px*var(--fscale,1));line-height:1.6;white-space:pre-wrap">${esc(m.body)}</div>
            ${atts.length?`<div style="border-top:1px solid var(--surface-2);padding:12px 0"><div style="font-size:calc(12px*var(--fscale,1));color:var(--text-dim);margin-bottom:8px">${atts.length} allegato${atts.length>1?'i':''}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">${atts.map((a,ai)=>`
                <div class="att" data-att="${ai}" style="display:flex;align-items:center;gap:8px;background:var(--surface);border-radius:12px;padding:8px 12px;cursor:pointer;max-width:100%">
                  <span style="font-size:calc(20px*var(--fscale,1))">${/^image\//.test(a.type)?'🖼️':'📄'}</span>
                  <div style="overflow:hidden"><div style="font-size:calc(13px*var(--fscale,1));overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</div><div style="font-size:calc(11px*var(--fscale,1));color:var(--text-dim)">${kb(a.size)}</div></div></div>`).join("")}</div></div>`:''}
            <div style="display:flex;gap:10px;margin:12px 0 20px">
              <button class="btn" id="reply" style="flex:1">↩️ Rispondi</button>
              <button class="btn ghost" id="fwd" style="flex:1">➡️ Inoltra</button></div></div>`;
        root.querySelector(".back-btn").onclick = drawList;
        root.querySelector("#star").onclick = () => { m.star=!m.star; save(); drawRead(id); };
        root.querySelector("#del").onclick = () => {
          box[folder] = box[folder].filter(x=>x.id!==id);
          if (folder!=="trash") box.trash.unshift(m);
          save(); drawList();
        };
        root.querySelector("#reply").onclick = () => drawCompose({ to:m.from, subj:/^re:/i.test(m.subj)?m.subj:"Re: "+m.subj, body:quote(m) });
        root.querySelector("#fwd").onclick = () => drawCompose({ subj:/^fwd:/i.test(m.subj)?m.subj:"Fwd: "+m.subj, body:quote(m), attachments:atts.slice() });
        root.querySelectorAll("[data-att]").forEach(el => el.onclick = () => previewAtt(atts[+el.dataset.att]));
      };

      const previewAtt = (a) => {
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px";
        ov.innerHTML = (/^image\//.test(a.type)
          ? `<img src="${a.data}" style="max-width:100%;max-height:78%;border-radius:12px">`
          : `<div style="font-size:calc(60px*var(--fscale,1))">📄</div><div style="color:#fff;text-align:center"><div>${esc(a.name)}</div><div style="opacity:.6;font-size:calc(13px*var(--fscale,1))">${kb(a.size)} · anteprima non disponibile</div></div>`)
          + `<button style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:20px;padding:10px 22px;cursor:pointer">Chiudi</button>`;
        ov.querySelector("button").onclick = () => ov.remove();
        document.body.appendChild(ov);
      };

      const drawCompose = (pre={}) => {
        let atts = (pre.attachments||[]).slice();
        const draftId = pre.draftId || null;
        const suggestions = os.store.get("contacts", []).filter(c=>c.email).map(c=>c.email);
        const fields = () => ({ to:root.querySelector("#to").value.trim(), subj:root.querySelector("#subj").value.trim(), body:root.querySelector("#body").value });
        const hasContent = f => f.to || f.subj || f.body.trim() || atts.length;

        const render = () => {
          root.innerHTML = `
            <div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1">${draftId?'Bozza':'Nuovo messaggio'}</div>
              <button class="btn ghost" id="attach" style="width:auto;padding:8px 12px">📎</button>
              <button class="btn" id="send" style="width:auto;padding:8px 16px;margin-left:8px">Invia</button></div>
            <div style="padding:0 16px">
              <input id="to" list="mailto" value="${esc(pre.to||'')}" placeholder="A" style="width:100%;background:none;border:none;border-bottom:1px solid var(--surface-2);padding:12px 2px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none">
              <datalist id="mailto">${suggestions.map(e=>`<option value="${esc(e)}">`).join("")}</datalist>
              <input id="subj" value="${esc(pre.subj||'')}" placeholder="Oggetto" style="width:100%;background:none;border:none;border-bottom:1px solid var(--surface-2);padding:12px 2px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none">
              <div id="attbox" style="display:${atts.length?'flex':'none'};gap:8px;flex-wrap:wrap;padding:10px 0"></div>
              <textarea id="body" placeholder="Scrivi il messaggio..." style="width:100%;min-height:300px;background:none;border:none;padding:12px 2px;color:var(--text);font-size:calc(15px*var(--fscale,1));line-height:1.6;resize:none;outline:none">${esc(pre.body||'')}</textarea></div>
            <input id="afile" type="file" multiple hidden>`;
          const attbox = root.querySelector("#attbox");
          attbox.style.display = atts.length?'flex':'none';
          attbox.innerHTML = atts.map((a,ai)=>`<div style="display:flex;align-items:center;gap:6px;background:var(--surface);border-radius:10px;padding:6px 10px">
            <span>${/^image\//.test(a.type)?'🖼️':'📄'}</span><span style="font-size:calc(12px*var(--fscale,1));max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
            <button data-rma="${ai}" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:calc(14px*var(--fscale,1))">✕</button></div>`).join("");
          attbox.querySelectorAll("[data-rma]").forEach(b=>b.onclick=()=>{ atts.splice(+b.dataset.rma,1); pre={...fields(),attachments:atts}; render(); });

          root.querySelector(".back-btn").onclick = () => {
            const f = fields();
            if (hasContent(f)) {                          // salva/aggiorna bozza uscendo
              const d = { id:draftId||Date.now(), to:f.to, from:`Bozza → ${f.to||'(nessun destinatario)'}`, subj:f.subj, body:f.body, time:new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}), read:true, star:false, attachments:atts.slice() };
              if (draftId) box.drafts = box.drafts.map(x=>x.id===draftId?d:x); else box.drafts.unshift(d);
              save(); os.notify({ app:"mail", title:"Mail", text:"Bozza salvata." });
            }
            drawList();
          };
          root.querySelector("#attach").onclick = () => root.querySelector("#afile").click();
          root.querySelector("#afile").onchange = e => {
            const files=[...e.target.files]; let done=0; if(!files.length) return;
            files.forEach(f=>{ const r=new FileReader(); r.onload=()=>{ atts.push({ name:f.name, type:f.type||"application/octet-stream", size:f.size, data:r.result });
              if(++done===files.length){ pre={...fields(),attachments:atts}; render(); } }; r.readAsDataURL(f); });
          };
          root.querySelector("#send").onclick = () => {
            const f = fields();
            if (!f.to) { os.notify({ app:"mail", title:"Mail", text:"Inserisci un destinatario." }); return; }
            const now = new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
            const bodyTxt = f.body + (cfg.signature ? "\n\n"+cfg.signature : "");
            const real = nativeMail && acct().configured;
            box.sent.unshift({ id:Date.now(), from:`${cfg.name} (${cfg.email}) → ${f.to}`, subj:f.subj||"(nessun oggetto)", body:bodyTxt, time:now, read:true, star:false, attachments:atts.slice() });
            if (draftId) box.drafts = box.drafts.filter(x=>x.id!==draftId);   // la bozza inviata sparisce
            save();
            if (real) {                                        // invio SMTP reale (il MailBridge conferma via NovaMail.onSent)
              window.NovaNative.mailSend(JSON.stringify({ to:f.to, subj:f.subj, body:bodyTxt }));
              os.notify({ app:"mail", title:"Mail", text:"Invio in corso a "+f.to+"…" });
            } else {
              os.notify({ app:"mail", title:"Mail", text:"Messaggio inviato a "+f.to });
            }
            folder="sent"; query=""; drawList();
          };
        };
        render();
      };

      drawList();
    }});

  /* ---------- Calendario (alternativa a Google Calendar) ---------- */
  const calendar = app({ id:"calendar", name:"Calendario", icon:"📅", color:"#ea4335",
    render(root, os) {
      let events = os.store.get("events", [
        { id:1, date:new Date().toISOString().slice(0,10), title:"Riunione team", time:"10:00", color:"#ea4335", note:"" },
        { id:2, date:new Date().toISOString().slice(0,10), title:"Palestra", time:"18:30", color:"#35c759", note:"" },
      ]);
      const save = () => os.store.set("events", events);
      const todayStr = () => new Date().toISOString().slice(0,10);
      let view = new Date(); let sel = todayStr();
      const months = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
      const dows = ["L","M","M","G","V","S","D"];
      const PALETTE = ["#ea4335","#0a84ff","#35c759","#ff9500","#af52de","#5e5ce6"];

      const draw = () => {
        const y=view.getFullYear(), mo=view.getMonth();
        const first=(new Date(y,mo,1).getDay()+6)%7; // lun=0
        const days=new Date(y,mo+1,0).getDate();
        let cells="";
        for(let i=0;i<first;i++) cells+=`<div></div>`;
        for(let d=1;d<=days;d++){
          const ds=`${y}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const dots=events.filter(e=>e.date===ds);
          const today=ds===todayStr();
          cells+=`<div class="cal-d ${ds===sel?'sel':''}" data-d="${ds}" style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:10px;cursor:pointer;${ds===sel?'background:var(--accent);color:#fff':(today?'color:var(--accent);font-weight:700':'')}">${d}
            <span style="display:flex;gap:2px;margin-top:2px;height:5px">${dots.slice(0,3).map(e=>`<span style="width:5px;height:5px;border-radius:50%;background:${ds===sel?'#fff':(e.color||'var(--accent)')}"></span>`).join("")}</span></div>`;
        }
        const dayEvents=events.filter(e=>e.date===sel).sort((a,b)=>a.time.localeCompare(b.time));
        const isToday = sel===todayStr();
        root.innerHTML=`
          <div class="hero"><div class="hero-l"><h1 style="font-size:calc(26px*var(--fscale,1))">${months[mo]} ${y}</h1></div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="mini-add" id="today" style="background:var(--surface);color:var(--text);width:auto;padding:0 12px;font-size:calc(13px*var(--fscale,1))">Oggi</button>
              <button class="mini-add" id="prev" style="background:var(--surface);color:var(--text)">‹</button><button class="mini-add" id="next" style="background:var(--surface);color:var(--text)">›</button></div></div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 12px;color:var(--text-dim);font-size:calc(12px*var(--fscale,1));text-align:center;margin-bottom:4px">${dows.map(d=>`<div>${d}</div>`).join("")}</div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 12px">${cells}</div>
          <div class="section-label" style="display:flex;justify-content:space-between;align-items:center"><span>${isToday?"Oggi":sel.split("-").reverse().join("/")}</span><button class="mini-add" id="add">+</button></div>
          <div id="ev-panel"></div>
          <div class="group">${dayEvents.length?dayEvents.map(e=>`
            <div class="item tappable" data-edit="${e.id}"><div class="i-ico" style="background:${e.color||'#ea4335'}">${ICO("calendar-event-fill","width:18px;height:18px")}</div>
              <div class="i-body"><div class="i-title">${e.title}</div><div class="i-sub">${e.time}${e.note?" · "+e.note:""}</div></div>
              <button data-del="${e.id}" style="background:none;border:none;color:var(--text-dim);cursor:pointer">🗑</button></div>`).join("")
            :`<div class="item"><div class="i-sub" style="padding:6px">Nessun evento</div></div>`}</div>
          <style>.mini-add{height:32px;min-width:32px;border-radius:16px;border:none;background:var(--accent);color:#fff;font-size:calc(18px*var(--fscale,1));cursor:pointer}
            .inline-panel{background:var(--surface);border-radius:14px;margin:0 16px 10px;padding:14px;display:flex;gap:10px;flex-wrap:wrap}
            .inline-panel input{background:var(--surface-2);border:none;border-radius:10px;padding:11px;color:var(--text);outline:none}
            .cdot{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid transparent}.cdot.on{border-color:var(--text)}</style>
          <div style="height:80px"></div>`;
        root.querySelector("#today").onclick=()=>{view=new Date();sel=todayStr();draw();};
        root.querySelector("#prev").onclick=()=>{view=new Date(y,mo-1,1);draw();};
        root.querySelector("#next").onclick=()=>{view=new Date(y,mo+1,1);draw();};
        root.querySelectorAll("[data-d]").forEach(el=>el.onclick=()=>{sel=el.dataset.d;draw();});
        root.querySelectorAll("[data-del]").forEach(b=>b.onclick=(e)=>{e.stopPropagation();events=events.filter(x=>x.id!=b.dataset.del);save();draw();});
        root.querySelectorAll("[data-edit]").forEach(el=>el.onclick=()=>openPanel(events.find(x=>x.id==el.dataset.edit)));

        const panel=root.querySelector("#ev-panel");
        const openPanel=(ev)=>{
          if(panel.dataset.open===String(ev?ev.id:"new")){ panel.innerHTML=""; panel.dataset.open=""; return; }
          let col = ev?ev.color:PALETTE[0];
          panel.dataset.open = ev?ev.id:"new";
          panel.innerHTML=`<div class="inline-panel">
            <input id="et" placeholder="Titolo evento" value="${ev?ev.title.replace(/"/g,'&quot;'):""}" style="flex:1;min-width:140px">
            <input id="eh" type="time" value="${ev?ev.time:'09:00'}">
            <input id="en" placeholder="Nota o luogo (facoltativo)" value="${ev&&ev.note?ev.note.replace(/"/g,'&quot;'):""}" style="flex:1;min-width:100%">
            <div style="display:flex;gap:8px;align-items:center;width:100%">
              <div style="display:flex;gap:8px;flex:1">${PALETTE.map(c=>`<span class="cdot ${c===col?'on':''}" data-c="${c}" style="background:${c}"></span>`).join("")}</div>
              <button class="btn" id="eok" style="width:auto;padding:11px 16px">${ev?"Salva":"Aggiungi"}</button></div></div>`;
          panel.querySelectorAll(".cdot").forEach(s=>s.onclick=()=>{col=s.dataset.c;panel.querySelectorAll(".cdot").forEach(x=>x.classList.toggle("on",x===s));});
          panel.querySelector("#et").focus();
          panel.querySelector("#eok").onclick=()=>{
            const t=panel.querySelector("#et").value.trim(); if(!t) return;
            const data={ title:t, time:panel.querySelector("#eh").value, note:panel.querySelector("#en").value.trim(), color:col, date:sel };
            if(ev){ Object.assign(ev,data); } else { events.push({ id:Date.now(), ...data }); }
            save(); panel.dataset.open=""; draw();
          };
        };
        root.querySelector("#add").onclick=()=>openPanel(null);
      };
      draw();
    }});

  /* ---------- Meteo (previsioni REALI via open-meteo) ---------- */
  const weather = app({ id:"weather", name:"Meteo", icon:"⛅", color:"#4a90d9",
    render(root, os) {
      let cities = os.store.get("weatherCities2", [
        { name:"Roma", lat:41.8933, lon:12.4829 },
        { name:"Milano", lat:45.4642, lon:9.19 },
      ]);
      const save = () => os.store.set("weatherCities2", cities);
      const cache = {}; // lat,lon -> dati
      let sel = 0;

      // codici meteo WMO -> icona + testo
      const WMO = c => {
        if (c===0) return ["☀️","Sereno"];
        if (c<=2) return ["🌤️","Poco nuvoloso"];
        if (c===3) return ["☁️","Nuvoloso"];
        if (c<=48) return ["🌫️","Nebbia"];
        if (c<=57) return ["🌦️","Pioviggine"];
        if (c<=67) return ["🌧️","Pioggia"];
        if (c<=77) return ["🌨️","Neve"];
        if (c<=82) return ["🌧️","Rovesci"];
        if (c<=86) return ["🌨️","Rovesci di neve"];
        return ["⛈️","Temporale"];
      };
      const dayName = iso => ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][new Date(iso).getDay()];

      const fetchWeather = async (city) => {
        const key = city.lat+","+city.lon;
        if (cache[key]) return cache[key];
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}`
          + `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature`
          + `&hourly=temperature_2m,weather_code,precipitation_probability`
          + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max`
          + `&timezone=auto&forecast_days=7`;
        const r = await fetch(url); if (!r.ok) throw new Error("meteo");
        const d = await r.json(); cache[key] = d; return d;
      };
      const geocode = async (name) => {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=it`);
        const d = await r.json();
        if (!d.results || !d.results.length) return null;
        const g = d.results[0];
        return { name: g.name + (g.admin1?` (${g.country_code})`:""), lat:g.latitude, lon:g.longitude };
      };

      const draw = async () => {
        if (!cities.length) { root.innerHTML = `<div class="hero"><div class="hero-l"><h1>Meteo</h1></div></div>
          <div style="text-align:center;color:var(--text-dim);padding:30px">Nessuna città. <button class="btn" id="addc" style="margin-top:12px">Aggiungi città</button></div><div id="c-panel"></div>`;
          bindAdd(); return; }
        const c = cities[Math.min(sel, cities.length-1)];
        root.innerHTML = `
          <div class="hero"><div class="hero-l"><h1>Meteo</h1></div>
            <button class="round-act small" id="addc" style="background:var(--accent)">${ICO("plus-circle-fill","width:20px;height:20px")}</button></div>
          <div id="c-panel"></div>
          <div id="wx-main" style="text-align:center;padding:24px"><div style="color:var(--text-dim)">Caricamento previsioni…</div>
            <div class="boot-spinner" style="margin:16px auto"></div></div>
          <div id="wx-hourly"></div>
          <div id="wx-days"></div>
          <div class="section-label" style="display:flex;justify-content:space-between;align-items:center"><span>Le mie città</span><button id="geoloc" style="background:none;border:none;color:var(--accent);font-size:calc(12px*var(--fscale,1));cursor:pointer;text-transform:none;letter-spacing:0">📍 Posizione attuale</button></div>
          <div class="group" id="wx-cities"></div>
          <div style="height:80px"></div>
          <style>.inline-panel{background:var(--surface);border-radius:14px;margin:10px 16px;padding:14px;display:flex;gap:10px}
            .inline-panel input{flex:1;background:var(--surface-2);border:none;border-radius:10px;padding:11px;color:var(--text);outline:none}</style>`;
        bindAdd(); drawCitiesList(); bindGeo();
        try {
          const d = await fetchWeather(c);
          const cur = d.current, [ic,txt] = WMO(cur.weather_code);
          root.querySelector("#wx-main").innerHTML = `
            <div style="font-size:calc(20px*var(--fscale,1));color:var(--text-dim)">${c.name}</div>
            <div style="font-size:calc(76px*var(--fscale,1));font-weight:200;line-height:1.1">${Math.round(cur.temperature_2m)}°</div>
            <div style="font-size:calc(40px*var(--fscale,1))">${ic}</div><div style="font-size:calc(17px*var(--fscale,1))">${txt}</div>
            <div style="color:var(--text-dim);margin-top:8px">Percepita ${Math.round(cur.apparent_temperature)}° · Umidità ${cur.relative_humidity_2m}% · Vento ${Math.round(cur.wind_speed_10m)} km/h</div>`;
          // fascia oraria: prossime 24 ore a partire dall'ora corrente
          if (d.hourly && d.hourly.time) {
            const nowH = new Date();
            let start = d.hourly.time.findIndex(t => new Date(t) >= nowH);
            if (start < 0) start = 0;
            const slots = d.hourly.time.slice(start, start+24);
            root.querySelector("#wx-hourly").innerHTML =
              `<div class="section-label">Prossime ore</div>
               <div style="display:flex;gap:6px;overflow-x:auto;padding:0 16px 6px;scrollbar-width:none;touch-action:pan-x;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch">`
              + slots.map((t,k)=>{const idx=start+k;const [hi]=WMO(d.hourly.weather_code[idx]);
                const pp=d.hourly.precipitation_probability?d.hourly.precipitation_probability[idx]:null;
                return `<div style="flex:0 0 auto;min-width:52px;text-align:center;background:var(--surface);border-radius:12px;padding:8px 4px">
                  <div style="font-size:calc(11px*var(--fscale,1));color:var(--text-dim)">${k===0?"Ora":new Date(t).getHours()+""}</div>
                  <div style="font-size:calc(20px*var(--fscale,1));margin:2px 0">${hi}</div>
                  <div style="font-weight:600;font-variant-numeric:tabular-nums">${Math.round(d.hourly.temperature_2m[idx])}°</div>
                  ${pp!=null?`<div style="font-size:calc(10px*var(--fscale,1));color:#4aa3ff">${pp}%</div>`:''}</div>`;}).join("")
              + `</div>`;
          }
          root.querySelector("#wx-days").innerHTML = `<div class="section-label">Prossimi giorni</div><div class="group">`
            + d.daily.time.map((t,i)=>{const [di]=WMO(d.daily.weather_code[i]);
              const pp=d.daily.precipitation_probability_max?d.daily.precipitation_probability_max[i]:null;
              return `<div class="item"><div class="i-body"><div class="i-title">${i===0?"Oggi":dayName(t)}</div>${pp?`<div class="i-sub" style="color:#4aa3ff">💧 ${pp}%</div>`:''}</div>
                <div style="font-size:calc(20px*var(--fscale,1));margin-right:14px">${di}</div>
                <div style="font-variant-numeric:tabular-nums;color:var(--text-dim);margin-right:8px">${Math.round(d.daily.temperature_2m_min[i])}°</div>
                <div style="font-variant-numeric:tabular-nums;font-weight:600">${Math.round(d.daily.temperature_2m_max[i])}°</div></div>`;}).join("") + `</div>`;
          // alba / tramonto
          if (d.daily.sunrise && d.daily.sunset) {
            const hm = iso => new Date(iso).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
            root.querySelector("#wx-days").innerHTML += `<div class="group" style="margin-top:8px"><div class="item">
              <div class="i-body"><div class="i-title">🌅 Alba</div></div><div style="margin-right:14px">${hm(d.daily.sunrise[0])}</div></div>
              <div class="item"><div class="i-body"><div class="i-title">🌇 Tramonto</div></div><div style="margin-right:14px">${hm(d.daily.sunset[0])}</div></div></div>`;
          }
        } catch(e) {
          root.querySelector("#wx-main").innerHTML = `<div style="font-size:calc(20px*var(--fscale,1))">${c.name}</div>
            <div style="color:var(--text-dim);padding:20px">⚠️ Impossibile caricare le previsioni.<br>Verifica la connessione a internet.</div>`;
        }
      };

      const drawCitiesList = async () => {
        const box = root.querySelector("#wx-cities"); if(!box) return;
        box.innerHTML = cities.map((ci,i)=>`<div class="item" data-c="${i}"><div class="i-body"><div class="i-title">${ci.name}</div></div>
          <span id="mini-${i}" style="color:var(--text-dim);margin-right:12px">…</span>
          ${cities.length>1?`<button data-delc="${i}" style="background:none;border:none;color:var(--text-dim);cursor:pointer">🗑</button>`:''}</div>`).join("");
        box.querySelectorAll("[data-c]").forEach(el=>el.onclick=()=>{sel=+el.dataset.c;draw();});
        box.querySelectorAll("[data-delc]").forEach(b=>b.onclick=(e)=>{e.stopPropagation();cities.splice(+b.dataset.delc,1);if(sel>=cities.length)sel=0;save();draw();});
        cities.forEach(async (ci,i)=>{ try{ const d=await fetchWeather(ci); const el=root.querySelector("#mini-"+i);
          if(el){const [mi]=WMO(d.current.weather_code); el.textContent=`${mi} ${Math.round(d.current.temperature_2m)}°`;} }catch{} });
      };

      const bindGeo = () => {
        const geoBtn = root.querySelector("#geoloc"); if (!geoBtn) return;
        geoBtn.onclick = () => {
          if (!navigator.geolocation) { os.notify({app:"weather",title:"Meteo",text:"Geolocalizzazione non disponibile"}); return; }
          geoBtn.textContent = "📍 Individuazione…";
          navigator.geolocation.getCurrentPosition(async pos => {
            const lat = pos.coords.latitude, lon = pos.coords.longitude;
            let name = "La mia posizione";
            try { const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=it`);
              const j = await r.json(); name = j.city || j.locality || j.principalSubdivision || name; } catch {}
            if (!cities.some(ci => Math.abs(ci.lat-lat)<0.05 && Math.abs(ci.lon-lon)<0.05)) { cities.unshift({ name, lat, lon }); save(); }
            sel = 0; draw();
          }, () => { geoBtn.textContent = "📍 Posizione attuale"; os.notify({app:"weather",title:"Meteo",text:"Posizione non disponibile (permesso negato?)"}); }, { timeout:10000 });
        };
      };

      const bindAdd = () => {
        const panel = root.querySelector("#c-panel"); const btn = root.querySelector("#addc"); if(!btn) return;
        btn.onclick = () => {
          if(panel.innerHTML){panel.innerHTML="";return;}
          panel.innerHTML=`<div class="inline-panel"><input id="cn" placeholder="Cerca città (es. Torino)"><button class="btn" id="cok" style="width:auto;padding:11px 16px">Cerca</button></div><div id="cmsg" style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:0 16px"></div>`;
          const go = async () => {
            const n = panel.querySelector("#cn").value.trim(); if(!n) return;
            panel.querySelector("#cmsg").textContent = "Ricerca…";
            const g = await geocode(n);
            if (!g) { panel.querySelector("#cmsg").textContent = "Città non trovata."; return; }
            cities.push(g); save(); sel=cities.length-1; panel.innerHTML=""; draw();
          };
          panel.querySelector("#cok").onclick = go;
          panel.querySelector("#cn").onkeydown = e => { if(e.key==="Enter") go(); };
        };
      };

      draw();
    }});

  /* ---------- File (gestione file, collegato ai contenuti reali del SO) ---------- */
  const files = app({ id:"files", name:"File", icon:"📁", color:"#f4b400",
    render(root, os) {
      // Albero file utente {id,name,parent,kind:'folder'|'text',data,ts}
      let nodes = os.store.get("userfiles", []);
      const save = () => os.store.set("userfiles", nodes);
      let loc = "home", query = "";
      let sortBy = os.store.get("files.sort","name");   // name | date | size
      let viewMode = os.store.get("files.view","list");  // list | grid
      let selMode = false; const sel = new Set();

      const esc = s => (s||"").replace(/</g,"&lt;");
      const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      const kb = n => n<1024?Math.round(n)+" B":n<1048576?(n/1024).toFixed(0)+" KB":(n/1048576).toFixed(1)+" MB";
      const rel = ts => { if(!ts) return ""; const s=(Date.now()-ts)/1000; if(s<60)return"ora"; if(s<3600)return Math.floor(s/60)+" min fa"; if(s<86400)return Math.floor(s/3600)+" h fa"; const d=new Date(ts); return d.toLocaleDateString("it-IT",{day:"numeric",month:"short"}); };
      const byId = id => nodes.find(n=>n.id===id);
      const kids = pid => nodes.filter(n=>n.parent===pid);
      const descendants = id => { let acc=[], stack=[id]; while(stack.length){ const p=stack.pop(); kids(p).forEach(c=>{acc.push(c.id); if(c.kind==="folder") stack.push(c.id);}); } return acc; };
      const ext = name => { const m=/\.([a-z0-9]+)$/i.exec(name||""); return m?m[1].toLowerCase():""; };
      const IMG=["jpg","jpeg","png","gif","webp","bmp","heic"], VID=["mp4","mov","mkv","webm","avi","3gp"], AUD=["mp3","wav","m4a","ogg","flac","aac"], ARC=["zip","rar","7z","tar","gz"];
      const FT = { pdf:["PDF","#ff3b30"], doc:["DOC","#2b579a"], docx:["DOC","#2b579a"], rtf:["DOC","#2b579a"],
        xls:["XLS","#217346"], xlsx:["XLS","#217346"], csv:["CSV","#217346"], ppt:["PPT","#d24726"], pptx:["PPT","#d24726"],
        txt:["TXT","#5e5ce6"], md:["MD","#5e5ce6"], log:["LOG","#5e5ce6"], json:["{ }","#8e8e93"], html:["HTML","#e34c26"], js:["JS","#e6b800"] };
      const catOf = n => { const e=ext(n.name); if(IMG.includes(e))return"photos"; if(VID.includes(e))return"video"; if(AUD.includes(e))return"audio"; if(ARC.includes(e))return"archive"; return "doc"; };
      const sizeOf = n => n.kind==="folder"?0:(n.data?n.data.length:0);
      const badge = n => {
        if(n.kind==="folder") return `<div class="i-ico" style="background:#f4b400">📁</div>`;
        const e=ext(n.name);
        if(IMG.includes(e)) return `<div class="i-ico" style="background:#af52de">🖼️</div>`;
        if(VID.includes(e)) return `<div class="i-ico" style="background:#e0245e">🎬</div>`;
        if(AUD.includes(e)) return `<div class="i-ico" style="background:#ff9500">🎵</div>`;
        if(ARC.includes(e)) return `<div class="i-ico" style="background:#8e8e93">🗜️</div>`;
        const ft=FT[e]; if(ft) return `<div class="i-ico i-ext" style="background:${ft[1]}">${ft[0]}</div>`;
        return `<div class="i-ico" style="background:#5e5ce6">📄</div>`;
      };
      const sortNodes = arr => { const c=[...arr]; c.sort((a,b)=>{
          if(a.kind!==b.kind) return a.kind==="folder"?-1:1;
          if(sortBy==="date") return (b.ts||0)-(a.ts||0);
          if(sortBy==="size") return sizeOf(b)-sizeOf(a);
          return a.name.localeCompare(b.name,"it");
        }); return c; };
      // tutti i file (non cartelle) che matchano una categoria, con percorso
      const flat = pred => nodes.filter(n=>n.kind==="text"&&pred(n));
      const pathOf = n => { let p=[], cur=byId(n.parent); let g=0; while(cur&&g++<20){ p.unshift(cur.name); cur=byId(cur.parent);} return p.length?p.join(" / "):"I miei file"; };

      // ---- media reali: registrazioni audio (store del Registratore) ----
      const recDB = () => new Promise((res,rej)=>{ const r=indexedDB.open("nova-rec",1); r.onupgradeneeded=()=>r.result.createObjectStore("rec",{keyPath:"id"}); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
      const allRecs = () => new Promise(resolve=>{ let done=false; const fin=v=>{if(!done){done=true;resolve(v);}}; setTimeout(()=>fin([]),2000);
        (async()=>{ try{ const db=await recDB(); const rq=db.transaction("rec").objectStore("rec").getAll(); rq.onsuccess=()=>fin((rq.result||[]).sort((a,b)=>b.ts-a.ts)); rq.onerror=()=>fin([]);}catch{fin([]);} })(); });
      const delRecFile = async (id) => { try{ const db=await recDB(); await new Promise(res=>{ const t=db.transaction("rec","readwrite"); t.objectStore("rec").delete(id); t.oncomplete=res; t.onerror=res; }); }catch{} };
      const fmtDur = s => { s=Math.round(s||0); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };

      // riproduttore video a schermo intero (con traccia audio separata sincronizzata)
      const playVideo = (p) => {
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;inset:0;z-index:70;background:#000;display:flex;flex-direction:column";
        ov.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;color:#fff"><button id="vx" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:calc(18px*var(--fscale,1));cursor:pointer">✕</button><div style="flex:1;font-weight:600">Video · ${fmtDur(p.dur)}</div></div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden">
            <video id="fv" src="${p.data}" controls autoplay playsinline ${p.audioTrack?'muted':''} style="max-width:100%;max-height:100%;object-fit:contain;background:#000"></video>
            ${p.audioTrack?`<audio id="fva" src="${p.audioTrack}" preload="auto"></audio>`:''}</div>`;
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.querySelector("#vx").onclick = close;
        if (p.audioTrack) { const vid=ov.querySelector("#fv"), aud=ov.querySelector("#fva");
          vid.addEventListener("play",()=>{ aud.currentTime=vid.currentTime; aud.play().catch(()=>{}); });
          vid.addEventListener("pause",()=>aud.pause());
          vid.addEventListener("seeking",()=>{ try{aud.currentTime=vid.currentTime;}catch{} });
          vid.addEventListener("timeupdate",()=>{ if(Math.abs(aud.currentTime-vid.currentTime)>0.25) aud.currentTime=vid.currentTime; });
          vid.addEventListener("ended",()=>aud.pause()); }
      };

      const stats = async () => {
        const photos = await os.photos.all();
        const photoBytes = photos.reduce((s,p)=>s+(p.data?p.data.length*0.75:0),0);
        const notes = os.store.get("notesList2", []);
        const noteBytes = notes.reduce((s,n)=>s+(n.text?n.text.length:0),0);
        const userBytes = nodes.filter(n=>n.kind==="text").reduce((s,n)=>s+sizeOf(n),0);
        return { photos, photoBytes, notes, noteBytes, userBytes, total:photoBytes+userBytes+noteBytes };
      };

      // ---------- foglio azioni singolo nodo ----------
      const actionSheet = (node) => {
        const ov = document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.4);display:flex;align-items:flex-end";
        ov.innerHTML=`<div style="width:100%;background:var(--bg);border-radius:18px 18px 0 0;padding:8px 0 20px">
          <div style="display:flex;align-items:center;gap:12px;padding:14px 18px 10px;border-bottom:1px solid var(--surface-2)">${badge(node)}<div style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(node.name)}</div><div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1))">${node.kind==="folder"?kids(node.id).length+" elementi":kb(sizeOf(node))} · ${rel(node.ts)}</div></div></div>
          <div class="item tappable" data-a="rename"><div class="i-ico" style="background:#5e5ce6">✏️</div><div class="i-body"><div class="i-title">Rinomina</div></div></div>
          <div class="item tappable" data-a="move"><div class="i-ico" style="background:#0a84ff">📂</div><div class="i-body"><div class="i-title">Sposta</div></div></div>
          <div class="item tappable" data-a="dup"><div class="i-ico" style="background:#34c759">⧉</div><div class="i-body"><div class="i-title">Duplica</div></div></div>
          <div class="item tappable" data-a="del"><div class="i-ico" style="background:var(--danger)">🗑️</div><div class="i-body"><div class="i-title" style="color:var(--danger)">Elimina</div></div></div>
          <div style="padding:8px 16px 0"><button class="btn ghost" data-a="cancel">Annulla</button></div></div>`;
        const close=()=>ov.remove();
        ov.onclick=e=>{ if(e.target===ov) close(); };
        document.body.appendChild(ov);
        ov.querySelectorAll("[data-a]").forEach(el=>el.onclick=async()=>{ const a=el.dataset.a; close();
          if(a==="rename") renamePanel(node);
          else if(a==="move") movePicker([node.id]);
          else if(a==="dup"){ const d={...node,id:uid(),name:node.name.replace(/(\.[^.]+)?$/,(m)=>" copia"+(m||"")),ts:Date.now()}; if(node.kind==="folder"){d.kind="folder";} nodes.push(d); save(); draw(); }
          else if(a==="del"){ if(await os.confirm({title:node.kind==="folder"?"Eliminare la cartella?":"Eliminare il file?",message:`"${node.name}"${node.kind==="folder"?" e tutto il suo contenuto verranno eliminati":" verrà eliminato"}.`,okText:"Elimina"})){ const rm=new Set([node.id,...descendants(node.id)]); nodes=nodes.filter(n=>!rm.has(n.id)); save(); draw(); } }
        });
      };
      const renamePanel = (node) => {
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:24px";
        ov.innerHTML=`<div style="width:100%;max-width:320px;background:var(--bg);border-radius:16px;padding:18px">
          <div style="font-weight:600;margin-bottom:12px">Rinomina</div>
          <input id="rn" value="${esc(node.name)}" style="width:100%;background:var(--surface);border:none;border-radius:12px;padding:12px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none">
          <div style="display:flex;gap:10px;margin-top:14px"><button class="btn ghost" id="rc">Annulla</button><button class="btn" id="ro">Salva</button></div></div>`;
        document.body.appendChild(ov);
        const inp=ov.querySelector("#rn"); inp.focus(); inp.select();
        ov.querySelector("#rc").onclick=()=>ov.remove();
        ov.querySelector("#ro").onclick=()=>{ const v=inp.value.trim(); if(v){ node.name=v; node.ts=Date.now(); save(); } ov.remove(); draw(); };
      };
      const movePicker = (ids) => {
        const forbidden=new Set(); ids.forEach(id=>{ forbidden.add(id); descendants(id).forEach(d=>forbidden.add(d)); });
        const targets=[{id:"root",name:"I miei file"},...nodes.filter(n=>n.kind==="folder"&&!forbidden.has(n.id))];
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.5);display:flex;flex-direction:column;justify-content:flex-end";
        ov.innerHTML=`<div style="background:var(--bg);border-radius:18px 18px 0 0;max-height:70%;overflow:auto;padding:8px 0 20px">
          <div style="text-align:center;padding:12px;font-weight:600">Sposta ${ids.length>1?ids.length+" elementi":""} in…</div>
          ${targets.map(t=>`<div class="item tappable" data-t="${t.id}"><div class="i-ico" style="background:#f4b400">📁</div><div class="i-body"><div class="i-title">${esc(t.name)}</div></div></div>`).join("")}
          <div style="padding:8px 16px 0"><button class="btn ghost" id="mc">Annulla</button></div></div>`;
        document.body.appendChild(ov);
        ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
        ov.querySelector("#mc").onclick=()=>ov.remove();
        ov.querySelectorAll("[data-t]").forEach(el=>el.onclick=()=>{ ids.forEach(id=>{ const n=byId(id); if(n){n.parent=el.dataset.t; n.ts=Date.now();} }); save(); ov.remove(); selMode=false; sel.clear(); draw(); });
      };

      // ---------- creazione ----------
      const createPanel = () => {
        const parent = /^folder:/.test(loc)?loc.slice(7):"root";
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.4);display:flex;align-items:flex-end";
        ov.innerHTML=`<div style="width:100%;background:var(--bg);border-radius:18px 18px 0 0;padding:8px 0 20px">
          <div class="item tappable" data-a="folder"><div class="i-ico" style="background:#f4b400">📁</div><div class="i-body"><div class="i-title">Nuova cartella</div></div></div>
          <div class="item tappable" data-a="file"><div class="i-ico" style="background:#5e5ce6">📄</div><div class="i-body"><div class="i-title">Nuovo file di testo</div></div></div>
          <div style="padding:8px 16px 0"><button class="btn ghost" data-a="cancel">Annulla</button></div></div>`;
        document.body.appendChild(ov);
        ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
        ov.querySelectorAll("[data-a]").forEach(el=>el.onclick=()=>{ const a=el.dataset.a; ov.remove();
          if(a==="folder"){ const n={id:uid(),name:"Nuova cartella",parent,kind:"folder",ts:Date.now()}; nodes.push(n); save(); draw(); renamePanel(n); }
          else if(a==="file"){ const n={id:uid(),name:"Documento.txt",parent,kind:"text",data:"",ts:Date.now()}; nodes.push(n); save(); openText(n); }
        });
      };

      // ---------- editor testo ----------
      const openText = (n) => {
        root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1;font-size:calc(16px*var(--fscale,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.name)}</div>
            <button class="btn" id="save" style="width:auto;padding:8px 16px">Salva</button></div>
          <div style="padding:0 16px"><textarea id="ta" placeholder="Scrivi qui…" style="width:100%;min-height:380px;background:var(--surface);border:none;border-radius:14px;padding:16px;color:var(--text);font-size:calc(15px*var(--fscale,1));line-height:1.6;resize:none;outline:none">${esc(n.data||"")}</textarea>
            <div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1));padding:10px 4px" id="meta"></div></div>`;
        const ta=root.querySelector("#ta");
        const m=()=>root.querySelector("#meta").textContent=`${(ta.value||"").length} caratteri · ${kb((ta.value||"").length)}`;
        m(); ta.oninput=m;
        root.querySelector(".back-btn").onclick=()=>draw();
        root.querySelector("#save").onclick=()=>{ n.data=ta.value; n.ts=Date.now(); save(); os.notify({app:"files",title:"File",text:"File salvato."}); };
      };
      const openReadonly = (name,text,jump) => {
        root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1;font-size:calc(16px*var(--fscale,1))">${esc(name)}</div>
            ${jump?`<button class="btn ghost" id="jump" style="width:auto;padding:8px 14px">Apri in ${jump[0]}</button>`:''}</div>
          <div style="padding:16px"><div class="group" style="padding:16px;white-space:pre-wrap;font-size:calc(15px*var(--fscale,1));line-height:1.6">${esc(text)}</div></div>`;
        root.querySelector(".back-btn").onclick=()=>draw();
        const j=root.querySelector("#jump"); if(j) j.onclick=()=>os.openApp(jump[1]);
      };
      const openImage = (ph,label) => {
        root.innerHTML=`<div style="height:100%;display:flex;flex-direction:column;background:#000">
          <div class="back-bar"><button class="back-btn" style="background:rgba(255,255,255,.15)"></button><div class="back-title" style="color:#fff;flex:1;font-size:calc(15px*var(--fscale,1))">${esc(label)}</div>
            <button id="gal" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer">🖼️</button>
            <button id="dl" style="width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,80,90,.35);color:#fff;cursor:pointer;margin-left:6px">🗑️</button></div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center"><img src="${ph.data}" style="max-width:96%;max-height:100%;border-radius:12px"></div></div>`;
        root.querySelector(".back-btn").onclick=()=>draw();
        root.querySelector("#gal").onclick=()=>os.openApp("gallery");
        root.querySelector("#dl").onclick=async()=>{ if(await os.confirm({title:"Eliminare la foto?",message:"La foto verrà eliminata definitivamente.",okText:"Elimina"})){ await os.photos.remove(ph.id); draw(); } };
      };

      // ---------- barra strumenti (ordina / vista) ----------
      const toolbar = () => `<div class="fm-tools">
          <button class="fm-t" id="fm-sort">↕ ${sortBy==="name"?"Nome":sortBy==="date"?"Data":"Dimensione"}</button>
          <div style="flex:1"></div>
          <button class="fm-t" id="fm-sel">☑ Seleziona</button>
          <button class="fm-t" id="fm-view">${viewMode==="grid"?"☰":"▦"}</button></div>`;
      const bindTools = () => {
        const s=root.querySelector("#fm-sort"); if(s) s.onclick=()=>sortSheet();
        const v=root.querySelector("#fm-view"); if(v) v.onclick=()=>{ viewMode=viewMode==="grid"?"list":"grid"; os.store.set("files.view",viewMode); draw(); };
        const se=root.querySelector("#fm-sel"); if(se) se.onclick=()=>{ selMode=true; sel.clear(); draw(); };
      };
      const sortSheet = () => {
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.4);display:flex;align-items:flex-end";
        const opt=(k,l)=>`<div class="item tappable" data-s="${k}"><div class="i-body"><div class="i-title">${l}</div></div>${sortBy===k?'<div class="chev" style="transform:none">✓</div>':''}</div>`;
        ov.innerHTML=`<div style="width:100%;background:var(--bg);border-radius:18px 18px 0 0;padding:8px 0 20px">
          <div style="text-align:center;padding:10px;font-weight:600">Ordina per</div>
          ${opt("name","Nome")}${opt("date","Data (più recenti)")}${opt("size","Dimensione")}
          <div style="padding:8px 16px 0"><button class="btn ghost" id="sc">Chiudi</button></div></div>`;
        document.body.appendChild(ov);
        ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
        ov.querySelector("#sc").onclick=()=>ov.remove();
        ov.querySelectorAll("[data-s]").forEach(el=>el.onclick=()=>{ sortBy=el.dataset.s; os.store.set("files.sort",sortBy); ov.remove(); draw(); });
      };

      // barra azioni selezione multipla
      const selBar = (ids) => `<div class="fm-selbar">
          <button class="fm-t" id="sel-all">Tutti (${ids.length})</button>
          <div style="flex:1"></div>
          <button class="fm-t" id="sel-move" ${sel.size?'':'disabled'}>📂 Sposta</button>
          <button class="fm-t" id="sel-del" ${sel.size?'':'disabled'} style="color:var(--danger)">🗑 Elimina</button></div>`;
      const bindSelBar = (ids) => {
        root.querySelector("#sel-all").onclick=()=>{ if(sel.size===ids.length) sel.clear(); else ids.forEach(i=>sel.add(i)); draw(); };
        const mv=root.querySelector("#sel-move"); if(mv&&sel.size) mv.onclick=()=>movePicker([...sel]);
        const dl=root.querySelector("#sel-del"); if(dl&&sel.size) dl.onclick=async()=>{ const msg=sel.size===1?"1 elemento selezionato verrà eliminato.":`${sel.size} elementi selezionati verranno eliminati.`; if(await os.confirm({title:"Eliminare gli elementi?",message:msg,okText:"Elimina"})){ const rm=new Set(); sel.forEach(id=>{rm.add(id); descendants(id).forEach(d=>rm.add(d));}); nodes=nodes.filter(n=>!rm.has(n.id)); save(); selMode=false; sel.clear(); draw(); } };
      };

      // riga / cella di un nodo
      const nodeRow = (n, sub) => selMode
        ? `<div class="item tappable" data-sel="${n.id}"><div class="fm-check ${sel.has(n.id)?'on':''}">${sel.has(n.id)?'✓':''}</div>${badge(n)}<div class="i-body"><div class="i-title">${esc(n.name)}</div><div class="i-sub">${sub}</div></div></div>`
        : `<div class="item tappable" data-node="${n.id}">${badge(n)}<div class="i-body"><div class="i-title">${esc(n.name)}</div><div class="i-sub">${sub}</div></div><button class="fmore" data-more="${n.id}">⋯</button></div>`;
      const glyphOf = n => { if(n.kind==="folder")return"📁"; const e=ext(n.name);
        if(IMG.includes(e))return"🖼️"; if(VID.includes(e))return"🎬"; if(AUD.includes(e))return"🎵"; if(ARC.includes(e))return"🗜️";
        const ft=FT[e]; return ft?ft[0]:"📄"; };
      const nodeCell = (n, sub) => `<div class="fm-cell tappable" data-${selMode?'sel':'node'}="${n.id}">
          ${selMode?`<div class="fm-check ${sel.has(n.id)?'on':''}" style="position:absolute;top:8px;left:8px">${sel.has(n.id)?'✓':''}</div>`:''}
          <div class="fm-cell-ico">${glyphOf(n)}</div>
          <div class="fm-cell-nm">${esc(n.name)}</div><div class="fm-cell-sub">${sub}</div></div>`;
      const subFor = n => n.kind==="folder"?(kids(n.id).length+" elementi"):(kb(sizeOf(n))+" · "+rel(n.ts));

      const listBlock = (arr) => {
        if(!arr.length) return `<div class="fm-empty">Vuoto</div>`;
        if(viewMode==="grid") return `<div class="fm-grid">${arr.map(n=>nodeCell(n,subFor(n))).join("")}</div>`;
        return `<div class="group">${arr.map(n=>nodeRow(n,subFor(n))).join("")}</div>`;
      };

      // categorie: dashboard
      const catList = (key) => {
        if(key==="doc")   return sortNodes(flat(n=>catOf(n)==="doc"||catOf(n)==="archive"));
        if(key==="video") return sortNodes(flat(n=>catOf(n)==="video"));
        if(key==="audio") return sortNodes(flat(n=>catOf(n)==="audio"));
        if(key==="recent")return [...nodes.filter(n=>n.kind==="text")].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,40);
        return [];
      };

      const draw = async () => {
        const q = query.trim().toLowerCase();

        // ------- DASHBOARD -------
        if (loc === "home") {
          const notes = os.store.get("notesList2", []);
          const userBytes = nodes.filter(n=>n.kind==="text").reduce((s,n)=>s+sizeOf(n),0);
          const nDoc=flat(n=>catOf(n)==="doc"||catOf(n)==="archive").length, nVid=flat(n=>catOf(n)==="video").length, nAud=flat(n=>catOf(n)==="audio").length;
          const cats=[
            ["cat:recent","🕘","Recenti","#0a84ff",nodes.filter(n=>n.kind==="text").length+" file"],
            ["images","🖼️","Immagini","#af52de","…"],
            ["cat:video","🎬","Video","#e0245e",nVid+" file"],
            ["cat:audio","🎵","Audio","#ff9500",nAud+" file"],
            ["cat:doc","📄","Documenti","#5e5ce6",nDoc+" file"],
            ["folder:root","📁","Cartelle","#f4b400",kids("root").length+" elementi"],
            ["notes","📝","Note","#ffd60a",notes.length+" note"],
          ];
          const recent=[...nodes.filter(n=>n.kind==="text")].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,4);
          root.innerHTML=`
            <div class="hero"><div class="hero-l"><h1>File</h1><div class="hero-sub">Memoria interna</div></div>
              <button class="round-act small" id="new" style="background:var(--accent)">${ICO("plus-circle-fill","width:20px;height:20px")}</button></div>
            <div class="searchbar"><span class="sb-i">${ICO("search")}</span><input id="q" value="${esc(query)}" placeholder="Cerca in tutti i file"></div>
            <div class="fm-storage group">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><span style="font-weight:600">Spazio di archiviazione</span><span style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1))" id="st-total">…</span></div>
              <div class="fm-bar"><i style="width:0;background:#af52de" id="st-bar-p"></i><i style="width:${userBytes?60:0}%;background:#5e5ce6" id="st-bar-u"></i><i style="width:0;background:#ffd60a" id="st-bar-n"></i></div>
              <div class="fm-legend"><span><b style="background:#af52de"></b><span id="st-p">Foto …</span></span><span><b style="background:#5e5ce6"></b>File ${kb(userBytes)}</span><span><b style="background:#ffd60a"></b><span id="st-n">Note …</span></span></div></div>
            <div class="section-label">Categorie</div>
            <div class="fm-cats">${cats.map(([id,ic,nm,col,sub])=>`<button class="fm-cat" data-loc="${id}"><span class="fm-cat-ic" style="background:${col}">${ic}</span><span class="fm-cat-b"><span class="fm-cat-n">${nm}</span><span class="fm-cat-s" ${id==='images'?'id="sm-img"':id==='cat:video'?'id="sm-vid"':id==='cat:audio'?'id="sm-aud"':''}>${sub}</span></span></button>`).join("")}</div>
            ${recent.length?`<div class="section-label">Recenti</div><div class="group">${recent.map(n=>nodeRow(n,subFor(n))).join("")}</div>`:''}
            <div style="height:80px"></div>`;
          root.querySelector("#new").onclick=createPanel;
          const qi=root.querySelector("#q");
          qi.oninput=e=>{ query=e.target.value; loc = query.trim()?"search":"home"; const p=e.target.selectionStart; draw().then(()=>{ const q2=root.querySelector("#q"); if(q2){q2.focus();q2.setSelectionRange(p,p);} }); };
          root.querySelectorAll("[data-loc]").forEach(el=>el.onclick=()=>{ loc=el.dataset.loc; query=""; selMode=false; sel.clear(); draw(); });
          bindNodeEvents();
          // conteggi media reali (video Fotocamera + registrazioni)
          Promise.all([os.photos.all(), allRecs()]).then(([ph, recs]) => {
            const set=(id,v)=>{const e=root.querySelector(id); if(e) e.textContent=v;};
            const nV = ph.filter(p=>p.video).length + flat(n=>catOf(n)==="video").length;
            const nA = recs.length + flat(n=>catOf(n)==="audio").length;
            set("#sm-vid", nV+(nV===1?" video":" video")); set("#sm-aud", nA+(nA===1?" audio":" audio"));
            set("#sm-img", `${ph.filter(p=>!p.video).length} foto`);
          }).catch(()=>{});
          stats().then(st => {
            const set=(id,v)=>{const e=root.querySelector(id); if(e) e.textContent=v;};
            set("#st-total", kb(st.total)+" usati"); set("#st-p", "Foto "+kb(st.photoBytes)); set("#st-n","Note "+kb(st.noteBytes)); set("#sm-img", `${st.photos.filter(p=>!p.video).length} foto · ${kb(st.photoBytes)}`);
            const bp=root.querySelector("#st-bar-p"), bu=root.querySelector("#st-bar-u"), bn=root.querySelector("#st-bar-n");
            if (bp&&st.total){ bp.style.width=Math.max(3,st.photoBytes/st.total*100)+"%"; bu.style.width=(st.userBytes/st.total*100)+"%"; bn.style.width=(st.noteBytes/st.total*100)+"%"; }
          }).catch(()=>{});
          return;
        }

        // ------- RICERCA GLOBALE -------
        if (loc === "search") {
          const res = nodes.filter(n=>n.name.toLowerCase().includes(q));
          root.innerHTML=`
            <div style="padding:12px 16px 8px;position:relative">
              <input id="q" value="${esc(query)}" placeholder="Cerca in tutti i file" style="width:100%;background:var(--surface);border:none;border-radius:12px;padding:11px 14px 11px 38px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none">
              <span style="position:absolute;left:28px;top:23px;opacity:.5">🔍</span>
              <button id="qx" style="position:absolute;right:26px;top:20px;background:none;border:none;color:var(--text-dim);cursor:pointer">✕</button></div>
            <div class="section-label">${res.length} risultati</div>
            <div class="group">${res.length?res.map(n=>nodeRow(n,pathOf(n))).join(""):`<div class="fm-empty">Nessun file trovato</div>`}</div>`;
          const qi=root.querySelector("#q");
          qi.focus(); qi.setSelectionRange(qi.value.length,qi.value.length);
          qi.oninput=e=>{ query=e.target.value; loc = query.trim()?"search":"home"; const p=e.target.selectionStart; draw().then(()=>{ const q2=root.querySelector("#q"); if(q2){q2.focus();q2.setSelectionRange(p,p);} }); };
          root.querySelector("#qx").onclick=()=>{ query=""; loc="home"; draw(); };
          bindNodeEvents();
          return;
        }

        // ------- IMMAGINI (foto reali) -------
        if (loc === "images") {
          const photos = (await os.photos.all()).filter(p=>!p.video);
          root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="font-size:calc(16px*var(--fscale,1))">Immagini</div></div>
            ${photos.length?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:0 4px 90px">${photos.map((p,i)=>`<div class="ph" data-img="${i}" style="aspect-ratio:1;border-radius:6px;background:url('${p.data}') center/cover;cursor:pointer"></div>`).join("")}</div>`
              :`<div class="fm-empty" style="padding:40px">Nessuna foto. Scatta con la Fotocamera.</div>`}`;
          root.querySelector(".back-btn").onclick=()=>{loc="home";draw();};
          root.querySelectorAll("[data-img]").forEach(el=>el.onclick=()=>openImage(photos[+el.dataset.img],"IMG_"+String(+el.dataset.img+1).padStart(4,"0")+".jpg"));
          return;
        }

        // ------- NOTE -------
        if (loc === "notes") {
          const notes = os.store.get("notesList2", []);
          root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="font-size:calc(16px*var(--fscale,1))">Note</div></div>
            <div class="group">${notes.length?notes.map((n,i)=>{const t=(n.text.split("\n")[0].replace(/^#\s*/,"")||"Nota "+(i+1)).slice(0,30);return `<div class="item tappable" data-note="${i}"><div class="i-ico i-ext" style="background:#ffd60a;color:#3a2f00">TXT</div><div class="i-body"><div class="i-title">${esc(t)}.txt</div><div class="i-sub">${kb(n.text.length)}</div></div></div>`;}).join("")
              :`<div class="fm-empty">Nessuna nota. Creane una nell'app Note.</div>`}</div>`;
          root.querySelector(".back-btn").onclick=()=>{loc="home";draw();};
          root.querySelectorAll("[data-note]").forEach(el=>el.onclick=()=>{const n=notes[+el.dataset.note];openReadonly((n.text.split("\n")[0].replace(/^#\s*/,"")||"Nota")+".txt",n.text,["Note","notes"]);});
          return;
        }

        // ------- VIDEO (reali dalla Fotocamera/Galleria) -------
        if (loc === "cat:video") {
          const vids = (await os.photos.all()).filter(p=>p.video);
          const uvids = catList("video");   // eventuali video tra i file utente
          root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="font-size:calc(16px*var(--fscale,1))">Video</div></div>
            ${vids.length?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:0 4px 12px">${vids.map((p,i)=>`<div class="ph" data-vid="${i}" style="position:relative;aspect-ratio:1;border-radius:6px;background:#111 ${p.poster?`url('${p.poster}') center/cover`:''};cursor:pointer">
                <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:calc(24px*var(--fscale,1));text-shadow:0 1px 6px rgba(0,0,0,.7)">▶</span>
                <span style="position:absolute;right:5px;bottom:4px;color:#fff;font-size:calc(10px*var(--fscale,1));background:rgba(0,0,0,.55);padding:1px 5px;border-radius:8px">${fmtDur(p.dur)}</span>
                <button class="fm-mdel" data-vdel="${i}" title="Elimina" style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:calc(12px*var(--fscale,1));cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2">🗑</button></div>`).join("")}</div>`
              :''}
            ${uvids.length?`<div class="group">${uvids.map(n=>nodeRow(n,subFor(n))).join("")}</div>`:''}
            ${(!vids.length&&!uvids.length)?`<div class="fm-empty" style="padding:40px">Nessun video. Registra con la Fotocamera.</div>`:''}
            <div style="height:80px"></div>`;
          root.querySelector(".back-btn").onclick=()=>{loc="home";draw();};
          root.querySelectorAll("[data-vid]").forEach(el=>el.onclick=()=>playVideo(vids[+el.dataset.vid]));
          root.querySelectorAll("[data-vdel]").forEach(b=>b.onclick=async(e)=>{ e.stopPropagation(); const p=vids[+b.dataset.vdel]; if(!p) return;
            if(await os.confirm({title:"Eliminare il video?",message:"Il video verrà eliminato definitivamente.",okText:"Elimina"})){ await os.photos.remove(p.id); draw(); } });
          bindNodeEvents();
          return;
        }

        // ------- AUDIO (registrazioni reali + file utente) -------
        if (loc === "cat:audio") {
          const recs = await allRecs();
          const uaud = catList("audio");
          root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="font-size:calc(16px*var(--fscale,1))">Audio</div></div>
            ${recs.length?`<div class="section-label">Registrazioni</div><div class="group">${recs.map(r=>`
              <div class="item" style="flex-wrap:wrap"><button class="round-act small" data-play="${r.id}" style="background:var(--accent)">${ICO("play-fill","width:15px;height:15px")}</button>
                <div class="i-body"><div class="i-title trunc">${esc(r.name)}.m4a</div><div class="i-sub">${fmtDur(r.dur)} · ${rel(r.ts)}</div></div>
                <button class="round-act small" data-adel="${r.id}" title="Elimina" style="background:var(--surface-2);color:var(--danger)">${ICO("trash-fill","width:14px;height:14px")}</button>
                <div class="i-ico i-ext" style="background:#ff9500">M4A</div>
                <div class="fa-prog" data-prog="${r.id}" style="display:none;flex:0 0 100%;align-items:center;gap:12px;margin-top:6px">
                  <input type="range" class="slider fa-seek" min="0" max="${r.dur||1}" value="0" step="any" style="flex:1">
                  <span class="fa-tt" style="font-size:calc(12px*var(--fscale,1));color:var(--text-dim);font-variant-numeric:tabular-nums;white-space:nowrap">00:00 / ${fmtDur(r.dur)}</span>
                </div></div>`).join("")}</div>`:''}
            ${uaud.length?`<div class="section-label">File audio</div><div class="group">${uaud.map(n=>nodeRow(n,subFor(n))).join("")}</div>`:''}
            ${(!recs.length&&!uaud.length)?`<div class="fm-empty" style="padding:40px">Nessun audio. Usa il Registratore.</div>`:''}
            <audio id="fa" hidden></audio><div style="height:80px"></div>`;
          root.querySelector(".back-btn").onclick=()=>{loc="home";draw();};
          const fa = root.querySelector("#fa"); let playingRec = null; let faSeeking = false;
          const faDur = (fb) => (isFinite(fa.duration) && fa.duration>0) ? fa.duration : fb;
          root.querySelectorAll("[data-play]").forEach(b=>b.onclick=async()=>{
            const id=+b.dataset.play;
            const item=b.closest(".item"), prog=item.querySelector(".fa-prog"), seek=item.querySelector(".fa-seek"), tt=item.querySelector(".fa-tt");
            if(playingRec===id){ if(fa.paused){ fa.play(); b.innerHTML=ICO("pause-fill","width:15px;height:15px"); } else { fa.pause(); b.innerHTML=ICO("play-fill","width:15px;height:15px"); } return; }
            try{fa.pause();}catch{}
            root.querySelectorAll("[data-play]").forEach(x=>x.innerHTML=ICO("play-fill","width:15px;height:15px"));
            root.querySelectorAll(".fa-prog").forEach(p=>p.style.display="none");
            const r=recs.find(x=>x.id===id); if(!r) return;
            const total=r.dur||0;
            fa.src=r.data; playingRec=id; faSeeking=false; prog.style.display="flex"; b.innerHTML=ICO("pause-fill","width:15px;height:15px");
            seek.max=total||1; seek.value=0; tt.textContent="00:00 / "+fmtDur(total);
            fa.onloadedmetadata=()=>{ const d=faDur(total); if(d){ seek.max=d; tt.textContent=fmtDur(fa.currentTime)+" / "+fmtDur(d); } };
            fa.ontimeupdate=()=>{ if(faSeeking) return; const d=faDur(total); seek.value=fa.currentTime; tt.textContent=fmtDur(fa.currentTime)+" / "+fmtDur(d); };
            fa.onended=()=>{ b.innerHTML=ICO("play-fill","width:15px;height:15px"); seek.value=0; tt.textContent="00:00 / "+fmtDur(faDur(total)); playingRec=null; };
            seek.oninput=()=>{ faSeeking=true; tt.textContent=fmtDur(+seek.value)+" / "+fmtDur(faDur(total)); };
            seek.onchange=()=>{ try{ fa.currentTime=+seek.value; }catch{} faSeeking=false; };
            fa.play();
          });
          root.querySelectorAll("[data-adel]").forEach(b=>b.onclick=async(e)=>{ e.stopPropagation(); const id=+b.dataset.adel; const r=recs.find(x=>x.id===id);
            if(await os.confirm({title:"Eliminare la registrazione?",message:`"${r?r.name:"Questa registrazione"}" verrà eliminata definitivamente.`,okText:"Elimina"})){ try{fa.pause();}catch{} await delRecFile(id); draw(); } });
          bindNodeEvents();
          return;
        }

        // ------- CATEGORIE (recent / doc) -------
        if (/^cat:/.test(loc)) {
          const key=loc.slice(4);
          const title={recent:"Recenti",doc:"Documenti",video:"Video",audio:"Audio"}[key]||"File";
          let arr=catList(key); if(q) arr=arr.filter(n=>n.name.toLowerCase().includes(q));
          const ids=arr.map(n=>n.id);
          root.innerHTML=`<div class="back-bar"><button class="back-btn"></button><div class="back-title" style="flex:1;font-size:calc(16px*var(--fscale,1))">${title}</div>${selMode?`<button class="btn ghost" id="sel-x" style="width:auto;padding:6px 12px">Fine</button>`:''}</div>
            ${selMode?'':toolbar()}
            ${listBlock(arr)}
            <div style="height:80px"></div>
            ${selMode?selBar(ids):''}`;
          root.querySelector(".back-btn").onclick=()=>{ if(selMode){selMode=false;sel.clear();draw();} else {loc="home";draw();} };
          if(selMode){ root.querySelector("#sel-x").onclick=()=>{selMode=false;sel.clear();draw();}; bindSelBar(ids); } else bindTools();
          bindNodeEvents();
          return;
        }

        // ------- BROWSE CARTELLE -------
        if (/^folder:/.test(loc)) {
          const fid=loc.slice(7);
          const folder=fid==="root"?null:byId(fid);
          let arr=sortNodes(kids(fid)); if(q) arr=arr.filter(n=>n.name.toLowerCase().includes(q));
          const ids=arr.map(n=>n.id);
          // breadcrumb
          let crumbs=[["root","I miei file"]]; if(folder){ let chain=[], cur=folder, g=0; while(cur&&g++<20){ chain.unshift(cur); cur=byId(cur.parent);} chain.forEach(c=>crumbs.push([c.id,c.name])); }
          root.innerHTML=`<div class="back-bar"><button class="back-btn"></button>
              <div class="back-title" style="flex:1;font-size:calc(16px*var(--fscale,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(folder?folder.name:"I miei file")}</div>
              ${selMode?`<button class="btn ghost" id="sel-x" style="width:auto;padding:6px 12px">Fine</button>`:`<button class="btn" id="new" style="width:auto;padding:8px 14px">＋</button>`}</div>
            <div class="fm-crumbs">${crumbs.map((c,i)=>`<span class="fm-crumb" data-cr="${c[0]}">${esc(c[1])}</span>${i<crumbs.length-1?'<span class="fm-cr-sep">›</span>':''}`).join("")}</div>
            ${selMode?'':toolbar()}
            ${listBlock(arr)}
            <div style="height:80px"></div>
            ${selMode?selBar(ids):''}`;
          root.querySelector(".back-btn").onclick=()=>{ if(selMode){selMode=false;sel.clear();draw();return;} if(folder){ loc="folder:"+(folder.parent||"root"); } else { loc="home"; } draw(); };
          const nb=root.querySelector("#new"); if(nb) nb.onclick=createPanel;
          const sx=root.querySelector("#sel-x"); if(sx) sx.onclick=()=>{selMode=false;sel.clear();draw();};
          root.querySelectorAll("[data-cr]").forEach(el=>el.onclick=()=>{ loc="folder:"+el.dataset.cr; selMode=false; sel.clear(); draw(); });
          if(selMode) bindSelBar(ids); else bindTools();
          bindNodeEvents();
          return;
        }
      };

      const bindNodeEvents = () => {
        root.querySelectorAll("[data-more]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); actionSheet(byId(b.dataset.more)); });
        root.querySelectorAll("[data-sel]").forEach(el=>el.onclick=()=>{ const id=el.dataset.sel; if(sel.has(id))sel.delete(id); else sel.add(id); draw(); });
        root.querySelectorAll("[data-node]").forEach(el=>el.onclick=e=>{ if(e.target.dataset.more!==undefined) return;
          const n=byId(el.dataset.node); if(!n) return;
          if(n.kind==="folder"){ loc="folder:"+n.id; query=""; draw(); } else openText(n);
        });
      };

      draw();
    }});

  /* ---------- Store (gestione web app di terze parti) ---------- */
  const store = app({ id:"store", name:"Store", icon:"🧩", color:"#0a84ff",
    render(root, os) {
      const suggested = [
        { name:"Wikipedia", url:"https://it.wikipedia.org", icon:"📚", color:"#333" },
        { name:"OpenStreetMap", url:"https://www.openstreetmap.org", icon:"🗺️", color:"#7ebc6f" },
        { name:"YouTube", url:"https://m.youtube.com", icon:"▶️", color:"#ff0033" },
        { name:"Google", url:"https://www.google.com", icon:"🔎", color:"#4285f4" },
        { name:"Gmail", url:"https://mail.google.com", icon:"✉️", color:"#ea4335" },
        { name:"Google Maps", url:"https://maps.google.com", icon:"📍", color:"#34a853" },
        { name:"Google Drive", url:"https://drive.google.com", icon:"📁", color:"#ffba00" },
        { name:"WhatsApp", url:"https://web.whatsapp.com", icon:"💬", color:"#25d366" },
        { name:"Telegram", url:"https://web.telegram.org", icon:"✈️", color:"#28a8e9" },
        { name:"X (Twitter)", url:"https://x.com", icon:"✖️", color:"#111" },
        { name:"Reddit", url:"https://www.reddit.com", icon:"👽", color:"#ff4500" },
        { name:"Amazon", url:"https://www.amazon.it", icon:"🛒", color:"#ff9900" },
        { name:"Spotify", url:"https://open.spotify.com", icon:"🎵", color:"#1db954" },
        { name:"Google Traduttore", url:"https://translate.google.com", icon:"🌐", color:"#4285f4" },
      ];
      // icona come immagine (favicon/upload) oppure emoji
      const isImg = ic => /^(https?:|data:)/.test(ic || "");
      const ico = (ic, color) => isImg(ic)
        ? `<div class="i-ico" style="background:${color};padding:0;overflow:hidden"><img src="${ic}" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div class="i-ico" style="background:${color}">${ic}</div>`;
      const faviconFor = url => { try { const u = new URL(/^https?:/.test(url)?url:"https://"+url); return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`; } catch { return null; } };

      let chosenIcon = "🌐", curColor = "#6d8bff", editId = null;

      // icona Bootstrap -> data URI SVG (sfondo trasparente, glifo bianco con margine)
      // così si integra col rendering immagine già esistente e si tinge sul colore app.
      const svgData = (id, color = "#ffffff") => {
        const inner = window.NovaIcons && NovaIcons.svg[id]; if (!inner) return null;
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-3 -3 22 22' fill='${color}'>${inner}</svg>`;
        return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
      };
      // overlay di scelta icona dalla libreria offline (ricerca + categorie)
      const openIconPicker = onPick => {
        if (!window.NovaIcons) return;
        const ov = document.createElement("div"); ov.className = "ip-ov";
        const cell = id => `<button class="ip-cell" data-id="${id}" title="${id}"><svg viewBox="0 0 16 16" fill="currentColor">${NovaIcons.svg[id]}</svg></button>`;
        const groupsHtml = q => {
          if (q) { const hits = Object.keys(NovaIcons.svg).filter(id => id.includes(q));
            return hits.length ? `<div class="ip-grid">${hits.map(cell).join("")}</div>` : `<div style="color:var(--text-dim);padding:20px;text-align:center">Nessuna icona per «${q}»</div>`; }
          return NovaIcons.groups.map(g => `<div class="ip-cat">${g.name}</div><div class="ip-grid">${g.ids.map(cell).join("")}</div>`).join("");
        };
        ov.innerHTML = `<div class="ip-card">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <input id="ip-q" placeholder="Cerca icona (in inglese, es. phone, star…)" style="flex:1;background:var(--surface-2);border:none;border-radius:12px;padding:11px 14px;color:var(--text);font-size:calc(14px*var(--fscale,1));outline:none">
            <button class="btn ghost" id="ip-x" style="width:auto;padding:10px 12px">✕</button>
          </div>
          <div class="ip-scroll" id="ip-scroll">${groupsHtml("")}</div>
          <div style="color:var(--text-dim);font-size:calc(11px*var(--fscale,1));text-align:center;padding-top:8px">Bootstrap Icons · ${Object.keys(NovaIcons.svg).length} icone offline</div>
        </div>`;
        const close = () => ov.remove();
        (document.querySelector("#device") || document.body).appendChild(ov);
        const scroll = ov.querySelector("#ip-scroll");
        const bindCells = () => scroll.querySelectorAll(".ip-cell").forEach(b => b.onclick = () => { onPick(b.dataset.id); close(); });
        bindCells();
        ov.querySelector("#ip-x").onclick = close;
        ov.onclick = e => { if (e.target === ov) close(); };
        ov.querySelector("#ip-q").oninput = e => { scroll.innerHTML = groupsHtml(e.target.value.trim().toLowerCase()); bindCells(); };
      };

      const draw = () => {
        const installed = os.userApps();
        const editing = editId ? installed.find(a => a.id === editId) : null;
        if (!editing) editId = null;
        root.innerHTML = `
          <div class="hero"><div class="hero-l"><h1>Store</h1><div class="hero-sub">Aggiungi qualsiasi web app tramite URL</div></div></div>
          <div class="section-label">${editing?`Modifica «${editing.name}»`:"Installa una web app"}</div>
          <div class="group" style="padding:14px 16px${editing?';outline:2px solid var(--accent);outline-offset:-2px;border-radius:14px':''}">
            <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
              <div id="ap-preview" style="width:54px;height:54px;border-radius:15px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:calc(26px*var(--fscale,1));color:#fff;overflow:hidden"></div>
              <input id="ap-name" placeholder="Nome dell'app" style="flex:1;background:var(--surface-2);border:none;border-radius:12px;padding:12px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none">
            </div>
            <input id="ap-url" placeholder="Indirizzo (es. it.wikipedia.org)" inputmode="url" style="width:100%;background:var(--surface-2);border:none;border-radius:12px;padding:12px;color:var(--text);font-size:calc(15px*var(--fscale,1));outline:none;margin-bottom:12px">
            <div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1));text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Icona sul desktop</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
              <input id="ap-emoji" value="🌐" maxlength="2" title="Emoji" style="width:50px;text-align:center;background:var(--surface-2);border:none;border-radius:10px;padding:10px;font-size:calc(20px*var(--fscale,1));outline:none">
              <button class="btn ghost" id="ap-lib" style="width:auto;padding:10px 12px;font-size:calc(13px*var(--fscale,1))">⬡ Libreria icone</button>
              <button class="btn ghost" id="ap-fav" style="width:auto;padding:10px 12px;font-size:calc(13px*var(--fscale,1))">🌐 Favicon del sito</button>
              <label class="btn ghost" style="width:auto;padding:10px 12px;font-size:calc(13px*var(--fscale,1));cursor:pointer">🖼️ Immagine<input id="ap-file" type="file" accept="image/*" hidden></label>
              <input id="ap-color" type="color" value="${curColor}" title="Colore sfondo" style="width:44px;height:40px;border:none;background:none;border-radius:10px;cursor:pointer">
            </div>
            <button class="btn" id="ap-install">${editing?"Salva modifiche":"Installa sul desktop"}</button>
            ${editing?`<button class="btn ghost" id="ap-cancel" style="margin-top:8px">Annulla</button>`:''}
          </div>
          <div class="section-label">Suggerite</div>
          <div class="group">${suggested.map((s,i)=>`
            <div class="item" data-sugg="${i}">${ico(s.icon,s.color)}
              <div class="i-body"><div class="i-title trunc">${s.name}</div><div class="i-sub trunc">${s.url}</div></div>
              <div class="i-val" style="flex:0 0 auto">+ Aggiungi</div></div>`).join("")}</div>
          <div class="section-label">Installate (${installed.length})</div>
          <div class="group" style="${installed.length?'':'padding:16px'}">
            ${installed.length ? installed.map(a=>`
              <div class="item">${ico(a.icon,a.color)}
                <div class="i-body"><div class="i-title trunc">${a.name}</div><div class="i-sub trunc">${a.url}</div></div>
                <button class="btn ghost" style="width:auto;padding:8px 12px;flex:0 0 auto" data-ed="${a.id}">Modifica</button>
                <button class="btn ghost" style="width:auto;padding:8px 12px;color:var(--danger)" data-rm="${a.id}">Rimuovi</button></div>`).join("")
              : `<div style="color:var(--text-dim);font-size:calc(14px*var(--fscale,1))">Nessuna web app installata. Aggiungine una qui sopra: comparirà tra le icone della home.</div>`}
          </div>
          <div style="height:80px"></div>`;

        // in modifica: precompila i campi con i dati dell'app selezionata
        if (editing) {
          root.querySelector("#ap-name").value = editing.name || "";
          root.querySelector("#ap-url").value = editing.url || "";
          if (!isImg(editing.icon)) root.querySelector("#ap-emoji").value = editing.icon || "🌐";
          root.querySelector("#ap-color").value = editing.color || "#6d8bff";
        }

        const preview = () => {
          const p = root.querySelector("#ap-preview");
          p.style.background = curColor;
          p.innerHTML = isImg(chosenIcon) ? `<img src="${chosenIcon}" style="width:100%;height:100%;object-fit:cover">` : chosenIcon;
        };
        preview();

        root.querySelector("#ap-emoji").oninput = e => { chosenIcon = e.target.value.trim() || "🌐"; preview(); };
        root.querySelector("#ap-color").oninput = e => { curColor = e.target.value; preview(); };
        // dall'URL: propone nome (dal dominio) e favicon in automatico
        let iconTouched = false;
        root.querySelector("#ap-emoji").addEventListener("input", () => iconTouched = true);
        root.querySelector("#ap-url").oninput = e => {
          const v = e.target.value.trim(); if (!v) return;
          try {
            const u = new URL(/^https?:/.test(v) ? v : "https://"+v);
            const host = u.hostname.replace(/^www\./,"");
            const nameEl = root.querySelector("#ap-name");
            if (!nameEl.value.trim()) nameEl.placeholder = host.split(".")[0].replace(/^\w/,c=>c.toUpperCase());
            if (!iconTouched && host.includes(".")) { const f = faviconFor(v); if (f) { chosenIcon = f; preview(); } }
          } catch {}
        };
        root.querySelector("#ap-fav").onclick = () => {
          const f = faviconFor(root.querySelector("#ap-url").value.trim());
          if (f) { chosenIcon = f; preview(); } else os.notify({ app:"store", title:"Store", text:"Inserisci prima l'indirizzo del sito." });
        };
        const lib = root.querySelector("#ap-lib");
        if (lib) lib.onclick = () => openIconPicker(id => { const d = svgData(id); if (d) { chosenIcon = d; iconTouched = true; preview(); } });
        root.querySelector("#ap-file").onchange = e => {
          const file = e.target.files[0]; if(!file) return;
          const r = new FileReader(); r.onload = () => { chosenIcon = r.result; preview(); }; r.readAsDataURL(file);
        };

        root.querySelector("#ap-install").onclick = () => {
          const url = root.querySelector("#ap-url").value.trim();
          if (!url) { os.notify({ app:"store", title:"Store", text:"Inserisci l'indirizzo dell'app." }); return; }
          let name = root.querySelector("#ap-name").value.trim();
          if (!name) { try { const h = new URL(/^https?:/.test(url)?url:"https://"+url).hostname.replace(/^www\./,""); name = h.split(".")[0].replace(/^\w/,c=>c.toUpperCase()); } catch { name = "Web app"; } }
          if (editId) {
            os.updateApp(editId, { name, url, icon: chosenIcon, color: curColor });
            os.notify({ app:"store", title:"App aggiornata", text:`${name} modificata.` });
            editId = null;
          } else {
            os.installApp({ name, url, icon: chosenIcon, color: curColor });
            os.notify({ app:"store", title:"App installata", text:"Trovi la nuova icona nella home." });
          }
          chosenIcon = "🌐"; curColor = "#6d8bff"; draw();
        };
        const cancel = root.querySelector("#ap-cancel");
        if (cancel) cancel.onclick = () => { editId = null; chosenIcon = "🌐"; curColor = "#6d8bff"; draw(); };
        root.querySelectorAll("[data-sugg]").forEach(el => el.onclick = () => {
          const s = suggested[+el.dataset.sugg]; os.installApp(s);
          os.notify({ app:"store", title:"App installata", text:`${s.name} aggiunta alla home.` }); draw();
        });
        root.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => {
          editId = b.dataset.ed;
          const a = os.userApps().find(x => x.id === editId);
          if (a) { chosenIcon = a.icon || "🌐"; curColor = a.color || "#6d8bff"; }
          draw();
          root.scrollTop = 0;
        });
        root.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { if (editId===b.dataset.rm) editId=null; os.uninstallApp(b.dataset.rm); draw(); });
      };
      draw();
    }});

  /* ---------- Impostazioni (multi-sezione) ---------- */
  const settings = app({ id:"settings", name:"Impostazioni", icon:"⚙️", color:"#5a6473",
    render(root, os) {
      const S = os.state;
      // ---- ponte hardware reale (presente solo dentro l'app NovaOS su Android) ----
      const NN = window.NovaNative || {};
      const hasSensors = !!NN.sensorStates;
      const readSensors = () => { try { return NN.sensorStates ? JSON.parse(NN.sensorStates()) : null; } catch { return null; } };
      // specchia nello stato della shell i valori VERI letti dall'hardware
      const syncSensors = () => { const ns = readSensors(); if (!ns) return null;
        ["wifi","bt","nfc","location","airplane"].forEach(k => { if (k in ns) S[k] = ns[k]; }); return ns; };
      // toggle sensori: prova l'azione reale (diretta se privilegiato nel ROM,
      // altrimenti apre il pannello) e ridisegna con lo stato aggiornato
      const SETFN = { wifi:"setWifi", bt:"setBluetooth", airplane:"setAirplane", location:"setLocation", nfc:"setNfc", mobileData:"setMobileData" };
      const sensorAct = (k, redraw) => { let applied=false;
        try { const fn = SETFN[k]; if (fn && NN[fn]) applied = NN[fn](!S[k]); } catch (e) {}
        setTimeout(redraw, applied ? 300 : 800); };
      const isPriv = () => { const ns = readSensors(); return !!(ns && ns.privileged); };
      // versione REALE in esecuzione: la più recente tra l'APK nativo (PackageInfo) e la
      // shell aggiornata via OTA (window.__NOVA_SHELL). Senza questo, dopo un aggiornamento
      // della sola interfaccia le Info restavano ferme alla build dell'APK. Stessa logica
      // dell'updater (build effettiva = max(apk, shell)).
      const appVer = (() => { try { return NN.appVersion ? JSON.parse(NN.appVersion()) : null; } catch { return null; } })();
      const shellVer = (() => { try { return (window.__NOVA_SHELL && window.__NOVA_SHELL.build) ? window.__NOVA_SHELL : null; } catch { return null; } })();
      const apkCode = (appVer && appVer.code) || 0;
      const shellBuild = (shellVer && shellVer.build) || 0;
      const effCode = Math.max(apkCode, shellBuild);
      const effName = shellBuild >= apkCode
        ? ((shellVer && shellVer.version) || (appVer && appVer.name))
        : ((appVer && appVer.name) || (shellVer && shellVer.version));
      const VER = (effName && effName !== "?") ? effName : "0.1.15";
      const VERLONG = effCode ? `${VER} · build ${effCode}` : `${VER} · build web`;
      // aggiornamento in attesa (rilevato dal controllo autonomo): mostra un pallino
      const updPend = () => { try { return os.store.get("updAvailable","") || ""; } catch { return ""; } };

      const nav = (title, bodyFn) => {
        root.innerHTML = `<div class="back-bar"><button class="back-btn"></button><div class="back-title">${title}</div></div><div id="sec" style="padding-bottom:90px"></div>`;
        root.querySelector(".back-btn").onclick = home;
        bodyFn(root.querySelector("#sec"));
      };

      // --- home impostazioni (raggruppata in categorie come Android) ---
      const home = () => {
        syncSensors();   // riflette lo stato reale dei sensori nei sottotitoli
        root.innerHTML = `
          <div class="hero"><div class="hero-l"><h1>Impostazioni</h1><div class="hero-sub">NovaOS ${VERLONG}</div></div></div>
          <div class="searchbar"><span class="sb-i">${ICO("search")}</span><input id="q" placeholder="Cerca nelle impostazioni"></div>

          <div class="section-label">Rete e connettività</div>
          <div class="group">
            ${row("net","📶","#0a84ff","Rete e Internet", S.airplane?"Modalità aereo":(S.wifi?("Wi-Fi · "+S.wifiName):"Wi-Fi disattivato"))}
            ${row("connected","🔗","#0a84ff","Dispositivi connessi", (S.bt?"Bluetooth attivo":"Bluetooth off")+(S.nfc?" · NFC":""))}
          </div>

          <div class="section-label">Personalizzazione</div>
          <div class="group">
            ${row("display","🌗","#5e5ce6","Display", "Tema "+(S.theme==="dark"?"scuro":"chiaro")+" · testo "+S.textScale+"%")}
            ${row("sound","🔊","#ff375f","Suoni e vibrazione", "Suoneria "+S.volRing+"%"+(S.dnd?" · Non disturbare":""))}
            ${row("notifications","🔔","#ff9f0a","Notifiche", (S.notifLock?"Su schermata blocco":"Nascoste al blocco"))}
          </div>

          <div class="section-label">Privacy e sicurezza</div>
          <div class="group">
            ${row("lock","🔒","#30d158","Sicurezza e blocco", lockDesc())}
            ${row("privacy","🛡️","#34c759","Privacy e posizione", (S.location?"Posizione attiva":"Posizione off"))}
          </div>

          <div class="section-label">Sistema</div>
          <div class="group">
            ${row("apps","🧩","#af52de","App", os.userApps().length+" web app installate")}
            ${row("battery","🔋","#34c759","Batteria", S.battery+"%"+(S.saver?" · Risparmio":""))}
            ${row("storage","💾","#5e5ce6","Archiviazione", "Dati, foto e cache di NovaOS")}
            ${row("accessibility","♿","#0a84ff","Accessibilità", (S.boldText||S.highContrast||S.reduceMotion)?"Personalizzata":"Standard")}
            ${updPend()
              ? `<div class="item" data-go="system"><div class="i-ico" style="background:#8e8e93">⚙️</div><div class="i-body"><div class="i-title">Sistema <span class="upd-dot"></span></div><div class="i-sub" style="color:var(--accent)">Aggiornamento a NovaOS ${updPend()} disponibile</div></div><div class="chev"></div></div>`
              : row("system","⚙️","#8e8e93","Sistema", "Lingua, data e ora, aggiornamenti")}
            ${row("about","ℹ️","#8e8e93","Info sul telefono", "NovaOS "+VER+" · Nova N1")}
            ${row("help","❓","#0a84ff","Guida e assistenza", "Come usare NovaOS · link utili")}
          </div><div style="height:80px"></div>`;
        root.querySelectorAll("[data-go]").forEach(el => el.onclick = () => sections[el.dataset.go]());
        // ricerca: filtra le voci per titolo
        const q = root.querySelector("#q");
        q.oninput = () => { const v = q.value.toLowerCase();
          root.querySelectorAll(".group .item").forEach(it => {
            const t = it.querySelector(".i-title").textContent.toLowerCase();
            it.style.display = t.includes(v) ? "" : "none";
          });
          root.querySelectorAll(".section-label").forEach(l => l.style.display = v?"none":"");
        };
      };
      const row = (id,ic,c,t,sub) => `<div class="item" data-go="${id}"><div class="i-ico" style="background:${c}">${ic}</div>
        <div class="i-body"><div class="i-title">${t}</div><div class="i-sub">${sub}</div></div><div class="chev"></div></div>`;
      const lockDesc = () => S.lockType==="pin"&&S.pin ? "PIN" : S.lockType==="swipe" ? "Scorrimento" : "Nessuno";

      const sw = (on) => `<div class="switch ${on?'on':''}"></div>`;

      const sections = {
        // ---------------- Rete e Internet ----------------
        net: () => nav("Rete e Internet", sec => {
          const ns = syncSensors();
          // ===== dispositivo reale: agisce sull'hardware / apre i pannelli di sistema =====
          if (hasSensors) {
            const raw = ns ? JSON.stringify(ns) : "lettura non riuscita";
            const priv = !!(ns && ns.privileged);
            const banner = priv
              ? "Sistema integrato: gli interruttori commutano l'hardware direttamente, senza uscire da NovaOS."
              : "Stato reale dell'hardware. Da Android 10 un'app non può cambiare in silenzio Wi-Fi/dati/aereo: tocca un interruttore e si apre il pannello ufficiale. Al ritorno tocca «Aggiorna».";
            const tog = (k,ic,bg,t,sub) => `<div class="item" data-sens="${k}"><div class="i-ico" style="background:${bg}">${ic}</div><div class="i-body"><div class="i-title">${t}</div><div class="i-sub">${sub}</div></div>${sw(S[k])}</div>`;
            sec.innerHTML = `
              <div class="group" style="padding:12px 14px;color:${priv?'var(--ok)':'var(--text-dim)'};font-size:calc(12.5px*var(--fscale,1));line-height:1.5">${priv?'✓ ':''}${banner}</div>
              <div class="group">
                ${tog("airplane","✈️","#8e8e93","Modalità aereo",S.airplane?"Attiva":"Disattivata")}
                ${tog("wifi","📶","#0a84ff","Wi-Fi",S.wifi?"Attivo":"Disattivato")}
                ${tog("mobileData","📱","#0a84ff","Dati mobili",S.mobileData?"Attivi":"Disattivati")}
                <div class="item" data-open="hotspot"><div class="i-ico" style="background:#0a84ff">🔥</div><div class="i-body"><div class="i-title">Hotspot e tethering</div></div><div class="chev"></div></div>
              </div>
              <div class="group" style="margin-top:12px"><div class="item" data-open="wifi"><div class="i-ico" style="background:#2a3550">📡</div><div class="i-body"><div class="i-title">Reti Wi-Fi disponibili</div><div class="i-sub">Apri l'elenco reti del sistema</div></div><div class="chev"></div></div></div>
              <button class="btn ghost" id="net-refresh" style="margin:14px 16px 4px">🔄 Aggiorna stato</button>
              <div style="padding:0 16px 20px;color:var(--text-dim);font-size:calc(11px*var(--fscale,1));word-break:break-all">Diagnostica hardware: ${raw}</div>`;
            sec.querySelectorAll("[data-sens]").forEach(el => el.onclick = () => sensorAct(el.dataset.sens, () => sections.net()));
            sec.querySelectorAll("[data-open]").forEach(el => el.onclick = () => { try { NN.openSetting(el.dataset.open); } catch {} });
            sec.querySelector("#net-refresh").onclick = () => sections.net();
            return;
          }
          // ===== ambiente di sviluppo (browser/emulatore): simulazione =====
          const nets = ["NovaNet","FASTWEB-8842","TIM-Casa","AndroidAP","Vodafone-Guest","Iliad-Home"];
          const toggleRow = (k,ic,t,sub) => `<div class="item"><div class="i-ico" style="background:#0a84ff">${ic}</div>
            <div class="i-body"><div class="i-title">${t}</div><div class="i-sub">${sub}</div></div>${sw(S[k])}</div>`;
          sec.innerHTML = `
            <div class="group">
              <div class="item"><div class="i-ico" style="background:#8e8e93">✈️</div><div class="i-body"><div class="i-title">Modalità aereo</div></div>${sw(S.airplane)}</div>
              ${toggleRow("wifi","📶","Wi-Fi",S.airplane?"Disattivato (aereo)":(S.wifi?"Attivo · "+S.wifiName:"Disattivato"))}
              ${toggleRow("mobileData","📱","Dati mobili",S.mobileData?"Attivi · 4G":"Disattivati")}
              ${toggleRow("hotspot","🔥","Hotspot Wi-Fi",S.hotspot?"Attivo":"Disattivato")}
            </div>
            <div class="section-label">Reti disponibili</div>
            <div class="group" id="nets">${(S.wifi&&!S.airplane)?nets.map(n=>`<div class="item" data-net="${n}"><div class="i-ico" style="background:#2a3550">📡</div>
              <div class="i-body"><div class="i-title">${n}</div><div class="i-sub">${n===S.wifiName?"Connesso":"Protetta · WPA2"}</div></div>${n===S.wifiName?'<div class="i-val">✓</div>':'<div class="chev"></div>'}</div>`).join(""):'<div class="item"><div class="i-sub" style="padding:6px">Attiva il Wi-Fi per vedere le reti</div></div>'}</div>
            <div class="section-label">Avanzate</div>
            <div class="group">
              <div class="item"><div class="i-ico" style="background:#5e5ce6">🔐</div><div class="i-body"><div class="i-title">VPN</div><div class="i-sub">Nessuna configurata</div></div><div class="chev"></div></div>
              <div class="item"><div class="i-ico" style="background:#5e5ce6">🌐</div><div class="i-body"><div class="i-title">DNS privato</div></div><div class="i-val">Automatico</div></div>
            </div>`;
          const sws = sec.querySelectorAll(".group:first-child .switch");
          sws[0].onclick = () => { os.toggle("airplane"); if(S.airplane){os.set("wifi",false);os.set("mobileData",false);} sections.net(); };
          sws[1].onclick = () => { os.toggle("wifi"); sections.net(); };
          sws[2].onclick = () => { os.toggle("mobileData"); sections.net(); };
          sws[3].onclick = () => { os.toggle("hotspot"); sections.net(); };
          sec.querySelectorAll("[data-net]").forEach(el => el.onclick = () => { os.set("wifiName", el.dataset.net); sections.net(); });
        }),

        // ---------------- Dispositivi connessi ----------------
        connected: () => nav("Dispositivi connessi", sec => {
          const ns = syncSensors();
          // ===== dispositivo reale =====
          if (hasSensors) {
            const raw = ns ? JSON.stringify(ns) : "lettura non riuscita";
            const priv = !!(ns && ns.privileged);
            sec.innerHTML = `
              <div class="group">
                <div class="item" data-sens="bt"><div class="i-ico" style="background:#0a84ff">🔵</div><div class="i-body"><div class="i-title">Bluetooth</div><div class="i-sub">${S.bt?"Attivo":"Disattivato"}</div></div>${sw(S.bt)}</div>
                <div class="item" data-sens="nfc"><div class="i-ico" style="background:#5e5ce6">📡</div><div class="i-body"><div class="i-title">NFC</div><div class="i-sub">${S.nfc?"Attivo":"Disattivato"} · pagamenti e tag</div></div>${sw(S.nfc)}</div>
              </div>
              <div class="group" style="margin-top:12px"><div class="item" data-open="bluetooth"><div class="i-ico" style="background:#2a3550">🎧</div><div class="i-body"><div class="i-title">Accoppia un nuovo dispositivo</div><div class="i-sub">Apri le impostazioni Bluetooth</div></div><div class="chev"></div></div></div>
              <button class="btn ghost" id="conn-refresh" style="margin:14px 16px 4px">🔄 Aggiorna stato</button>
              <div style="padding:0 16px 20px;color:var(--text-dim);font-size:calc(11px*var(--fscale,1));word-break:break-all">${priv?'✓ Integrato · ':''}Diagnostica hardware: ${raw}</div>`;
            sec.querySelectorAll("[data-sens]").forEach(el => el.onclick = () => sensorAct(el.dataset.sens, () => sections.connected()));
            sec.querySelectorAll("[data-open]").forEach(el => el.onclick = () => { try { NN.openSetting(el.dataset.open); } catch {} });
            sec.querySelector("#conn-refresh").onclick = () => sections.connected();
            return;
          }
          // ===== simulazione (sviluppo) =====
          sec.innerHTML = `
            <div class="group">
              <div class="item"><div class="i-ico" style="background:#0a84ff">🔵</div><div class="i-body"><div class="i-title">Bluetooth</div><div class="i-sub">${S.bt?"Attivo":"Disattivato"}</div></div>${sw(S.bt)}</div>
              <div class="item"><div class="i-ico" style="background:#5e5ce6">📡</div><div class="i-body"><div class="i-title">NFC</div><div class="i-sub">Pagamenti e tag</div></div>${sw(S.nfc)}</div>
            </div>
            <div class="section-label">Dispositivi accoppiati</div>
            <div class="group">${S.bt?`
              <div class="item"><div class="i-ico" style="background:#2a3550">🎧</div><div class="i-body"><div class="i-title">Nova Buds</div><div class="i-sub">Connesso · 80%</div></div></div>
              <div class="item"><div class="i-ico" style="background:#2a3550">⌚</div><div class="i-body"><div class="i-title">Nova Watch</div><div class="i-sub">Salvato</div></div></div>`
              :`<div class="item"><div class="i-sub" style="padding:6px">Attiva il Bluetooth per accoppiare dispositivi</div></div>`}</div>
            <div class="group" style="margin-top:12px"><div class="item"><div class="i-ico" style="background:#af52de">📺</div><div class="i-body"><div class="i-title">Trasmetti schermo</div></div><div class="chev"></div></div></div>`;
          const sws = sec.querySelectorAll(".switch");
          sws[0].onclick = () => { os.toggle("bt"); sections.connected(); };
          sws[1].onclick = () => { os.toggle("nfc"); sections.connected(); };
        }),

        // ---------------- Display ----------------
        display: () => nav("Display", sec => {
          sec.innerHTML = `
            <div class="section-label">Tema</div>
            <div class="seg"><button data-th="dark" class="${S.theme==='dark'?'on':''}">Scuro</button><button data-th="light" class="${S.theme==='light'?'on':''}">Chiaro</button></div>
            <div class="section-label">Luminosità</div>
            <div class="group" style="padding:16px"><input type="range" class="slider" min="20" max="100" value="${S.brightness}" id="bri"></div>
            <div class="section-label">Dimensione testo · <span id="ts-v">${S.textScale}%</span></div>
            <div class="group" style="padding:16px"><input type="range" class="slider" min="80" max="130" step="5" value="${S.textScale}" id="ts"></div>
            <div class="group" style="margin-top:6px">
              <div class="item"><div class="i-ico" style="background:#ffcc00">🔆</div><div class="i-body"><div class="i-title">Luminosità adattiva</div><div class="i-sub">Regola in base alla luce</div></div>${sw(S.adaptiveBright)}</div>
              <div class="item"><div class="i-ico" style="background:#5e5ce6">🔄</div><div class="i-body"><div class="i-title">Rotazione automatica</div></div>${sw(S.autoRotate)}</div>
              <div class="item"><div class="i-ico" style="background:#0a84ff">⚡</div><div class="i-body"><div class="i-title">Frequenza elevata</div><div class="i-sub">${S.refreshHigh?"120 Hz":"60 Hz"}</div></div>${sw(S.refreshHigh)}</div>
            </div>
            <div class="section-label">Spegnimento schermo</div>
            <div class="seg">${[15,30,60,120].map(s=>`<button data-to="${s}" class="${S.screenTimeout===s?'on':''}">${s<60?s+"s":(s/60)+" min"}</button>`).join("")}</div>
            <div class="section-label">Sfondo</div>
            <div class="swatches">${os.WALLS.map((w,i)=>`<div class="swatch ${(!S.wallImage&&!S.deskColor&&i===S.wallpaper)?'on':''}" data-w="${i}" style="background:${w}"></div>`).join("")}</div>
            <div style="display:flex;gap:10px;margin:12px 16px 0">
              <label class="btn ghost" style="flex:1;text-align:center;cursor:pointer">${S.wallImage?'Cambia immagine':'Immagine di sfondo'}<input id="wall-img" type="file" accept="image/*" hidden></label>
              ${S.wallImage?`<button class="btn ghost" id="wall-clear" style="flex:0 0 auto;color:var(--danger)">Rimuovi</button>`:''}
            </div>
            ${S.wallImage?`
            <div class="wall-frame">
              <div id="wall-prev" class="wall-prev" style="background-image:url('${S.wallImage}')"></div>
            </div>
            <div class="seg" style="margin:10px 16px 0">
              <button data-fit="cover" class="${(S.wallFit||'cover')==='cover'?'on':''}">Riempi</button>
              <button data-fit="contain" class="${S.wallFit==='contain'?'on':''}">Adatta</button>
              <button data-fit="custom" class="${S.wallFit==='custom'?'on':''}">Zoom</button>
            </div>
            ${S.wallFit==='custom'?`<div class="wall-slid"><span>Zoom</span><input id="wall-zoom" type="range" min="60" max="260" value="${S.wallZoom||100}"><b id="wall-zoom-v">${S.wallZoom||100}%</b></div>`:''}
            <div class="wall-slid"><span>Orizz.</span><input id="wall-px" type="range" min="0" max="100" value="${S.wallPosX??50}"></div>
            <div class="wall-slid"><span>Vert.</span><input id="wall-py" type="range" min="0" max="100" value="${S.wallPosY??50}"></div>`:''}

            <div class="section-label">Home · launcher</div>
            <div class="lch-gallery">${os.launchers().map(l=>`<div class="lch-card ${(S.launcher||'springboard')===l.id?'on':''}" data-lch="${l.id}"><div class="g"><svg viewBox="0 0 24 24">${l.ic}</svg></div><div style="min-width:0"><b>${l.name}</b><small>${l.desc}</small></div></div>`).join("")}</div>
            ${(S.launcher==='list')?`<div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1));margin:8px 16px 0">Trascina la maniglia ⋮ a destra di una riga per riordinare le app.</div>`:''}

            <div class="section-label">Tema · stile icone</div>
            <div class="seg"><button data-is="filled" class="${S.iconStyle!=='outline'?'on':''}">Colorate</button><button data-is="outline" class="${S.iconStyle==='outline'?'on':''}">Contorno</button></div>
            <div class="section-label">Forma icone</div>
            <div class="seg">${[["circle","Cerchio"],["squircle","Squircle"],["square","Quadrato"]].map(([v,l])=>`<button data-ish="${v}" class="${(S.iconShape||'squircle')===v?'on':''}">${l}</button>`).join("")}</div>
            <div class="group" style="padding:14px 16px">
              <div class="item" style="padding:6px 0"><div class="i-body"><div class="i-title">Colore di fondo</div><div class="i-sub">${S.deskColor?"Personalizzato":"Come il tema"}</div></div>
                <input type="color" id="deskcol" value="${S.deskColor||(S.theme==='dark'?'#0b0f17':'#eef1f7')}" style="width:44px;height:38px;border:none;background:none;border-radius:10px;cursor:pointer"></div>
              <div class="item" style="padding:6px 0"><div class="i-body"><div class="i-title">Colore di risalto</div><div class="i-sub">Accento e bordi${S.accentColor?" · personalizzato":""}</div></div>
                <input type="color" id="acccol" value="${S.accentColor||(S.theme==='dark'?'#6d8bff':'#3f63ff')}" style="width:44px;height:38px;border:none;background:none;border-radius:10px;cursor:pointer"></div>
              <div class="item" style="padding:6px 0"><div class="i-body"><div class="i-title">Colore icone</div><div class="i-sub">Bordo e glifo${S.iconStyle==='outline'?'':' (attivo con "Contorno")'}</div></div>
                <input type="color" id="iconcol" value="${S.iconColor||(S.theme==='dark'?'#e8ecf4':'#141a24')}" style="width:44px;height:38px;border:none;background:none;border-radius:10px;cursor:pointer"></div>
              ${(S.deskColor||S.iconColor||S.accentColor||S.iconStyle==='outline'||(S.iconShape&&S.iconShape!=='squircle'))?`<button class="btn ghost" id="icon-reset" style="margin-top:10px">Ripristina aspetto predefinito</button>`:''}
            </div>
            <div class="section-label">Tema · condivisione</div>
            <div class="group" style="padding:14px 16px">
              <div style="display:flex;gap:10px">
                <button class="btn ghost" id="th-export" style="flex:1">Esporta tema</button>
                <label class="btn ghost" style="flex:1;text-align:center;cursor:pointer">Importa tema<input id="th-import" type="file" accept=".json,.novatheme" hidden></label>
              </div>
              <div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1));margin-top:8px">Salva o applica un tema (.novatheme/2): launcher, colori, forma e stile icone, sfondo, testo.</div>
            </div>`;
          sec.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { os.set("theme", b.dataset.th); sections.display(); });
          sec.querySelectorAll("[data-lch]").forEach(b => b.onclick = () => { os.set("launcher", b.dataset.lch); sections.display(); });
          sec.querySelectorAll("[data-is]").forEach(b => b.onclick = () => { os.set("iconStyle", b.dataset.is); sections.display(); });
          sec.querySelectorAll("[data-ish]").forEach(b => b.onclick = () => { os.set("iconShape", b.dataset.ish); sections.display(); });
          sec.querySelector("#deskcol").oninput = e => os.set("deskColor", e.target.value);
          sec.querySelector("#acccol").oninput = e => os.set("accentColor", e.target.value);
          sec.querySelector("#iconcol").oninput = e => os.set("iconColor", e.target.value);
          const ir = sec.querySelector("#icon-reset"); if (ir) ir.onclick = () => { ["iconStyle","deskColor","iconColor","accentColor"].forEach((k,i)=>os.set(k, i?"":"filled")); os.set("iconShape","squircle"); sections.display(); };
          // esporta/importa tema nel formato .novatheme (allineato al Theme Studio)
          sec.querySelector("#th-export").onclick = () => {
            const iconMap = {}; Object.entries(S.iconMap||{}).forEach(([id,v]) => { if (v) iconMap[id] = { type:"emoji", value:v }; });
            const order = os.store.get("launcherOrder", []);
            const t = { format:"novatheme/2", meta:{ id:"tema-"+Date.now(), name:"Tema personale", base:S.theme },
              layout:{ id:S.launcher||"springboard", ...(order.length?{order}:{}) },
              colors:{ accent:S.accentColor||undefined, bg:S.deskColor||undefined, icon:S.iconColor||undefined },
              shape:{ iconStyle:S.iconStyle, iconShape:S.iconShape||"squircle" },
              icons:{ shape:S.iconShape||"squircle", ...(Object.keys(iconMap).length?{map:iconMap}:{}) },
              wallpaper: S.deskColor?{type:"solid",value:S.deskColor}:(S.wallImage?{type:"image",value:S.wallImage,fit:S.wallFit||"cover",zoom:S.wallZoom||100,posX:S.wallPosX??50,posY:S.wallPosY??50}:{type:"gradient",value:os.WALLS[S.wallpaper]}),
              sounds:{ ringtone:{type:"builtin",value:S.ringtone}, notif:{type:"builtin",value:S.notifSound}, alarm:{type:"builtin",value:S.alarmSound} },
              typography:{ textScale:S.textScale } };
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(t,null,2)],{type:"application/json"}));
            a.download = "tema-novaos.novatheme.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
            os.notify({ app:"settings", title:"Tema", text:"Tema esportato come file." });
          };
          sec.querySelector("#th-import").onchange = e => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = () => { try { const t = JSON.parse(r.result);
              if (t.format !== "novatheme/1" && t.format !== "novatheme/2") { os.notify({app:"settings",title:"Tema",text:"File non riconosciuto."}); return; }
              if (t.meta?.base) os.set("theme", t.meta.base);
              // layout: template a blocchi del tema (launcher "custom") oppure launcher predefinito
              if (t.layout?.engine === "blocks" && Array.isArray(t.layout.blocks)) os.applyThemeLayout(t.layout);
              else if (t.layout?.id && os.launchers().some(l => l.id === t.layout.id)) os.set("launcher", t.layout.id);
              if (t.colors?.accent) os.set("accentColor", t.colors.accent);
              if (t.colors?.icon) os.set("iconColor", t.colors.icon);
              if (t.shape?.iconStyle) os.set("iconStyle", t.shape.iconStyle);
              if (t.shape?.iconShape) os.set("iconShape", t.shape.iconShape);
              if (t.typography?.textScale) os.set("textScale", t.typography.textScale);
              if (t.wallpaper?.type === "solid") { os.set("deskColor", t.wallpaper.value); os.set("wallImage",""); }
              else if (t.wallpaper?.type === "image") { os.set("wallImage", t.wallpaper.value); os.set("deskColor","");
                os.set("wallFit", t.wallpaper.fit||"cover"); os.set("wallZoom", t.wallpaper.zoom||100);
                os.set("wallPosX", t.wallpaper.posX??50); os.set("wallPosY", t.wallpaper.posY??50); }
              else { os.set("deskColor", ""); os.set("wallImage",""); }
              // override icone per-app (icons.map: id → {type:"emoji",value})
              // SICUREZZA: un tema è un file esterno non fidato. Accettiamo solo emoji/testo
              // brevi senza caratteri HTML pericolosi, oppure URL immagine data:image//https.
              if (t.icons && t.icons.map) { const m = {};
                Object.entries(t.icons.map).forEach(([id,o]) => {
                  let v = (o && typeof o==="object") ? o.value : o;
                  v = String(v == null ? "" : v).trim();
                  if (!v) return;
                  if (/[<>"'`]/.test(v)) return;                                  // possibile iniezione: scarta
                  const isImg = /^data:image\//i.test(v) || /^https:\/\//i.test(v);
                  const isText = !/^data:|^https?:|^javascript:/i.test(v) && v.length <= 8;  // emoji/simbolo breve
                  if (isImg || isText) m[id] = v;                                 // altrimenti scartato
                });
                os.set("iconMap", m);
              } else os.set("iconMap", {});
              // suoni (solo nomi validi per categoria)
              if (t.sounds) { const L = os.sounds.lists || {ring:[],notif:[],alarm:[]};
                const sv = s => (s && typeof s==="object") ? s.value : s;
                if (L.ring.includes(sv(t.sounds.ringtone))) os.set("ringtone", sv(t.sounds.ringtone));
                if (L.notif.includes(sv(t.sounds.notif)))   os.set("notifSound", sv(t.sounds.notif));
                if (L.alarm.includes(sv(t.sounds.alarm)))   os.set("alarmSound", sv(t.sounds.alarm));
              }
              // disposizione app (springboard + ordine lista)
              if (t.layout && Array.isArray(t.layout.order) && t.layout.order.length) os.applyLayoutOrder(t.layout.order);
              os.notify({ app:"settings", title:"Tema", text:`Tema «${t.meta?.name||"importato"}» applicato.` });
              sections.display();
            } catch (err) { os.notify({app:"settings",title:"Tema",text:"File non valido."}); } };
            r.readAsText(f);
          };
          sec.querySelector("#bri").oninput = e => os.set("brightness", +e.target.value);
          sec.querySelector("#ts").oninput = e => { os.set("textScale", +e.target.value); sec.querySelector("#ts-v").textContent = e.target.value+"%"; };
          sec.querySelectorAll("[data-w]").forEach(el => el.onclick = () => { os.set("wallpaper", +el.dataset.w); os.set("wallImage",""); os.set("deskColor",""); sections.display(); });
          // immagine di sfondo: ridimensiona (max lato 1080px, JPEG) prima di salvarla
          const downscale = (file, max, q) => new Promise((res, rej) => {
            const rd = new FileReader();
            rd.onload = () => { const img = new Image();
              img.onload = () => { let { width:w, height:h } = img; const s = Math.min(1, max/Math.max(w,h));
                w = Math.round(w*s); h = Math.round(h*s);
                const cv = document.createElement("canvas"); cv.width=w; cv.height=h;
                cv.getContext("2d").drawImage(img, 0, 0, w, h);
                try { res(cv.toDataURL("image/jpeg", q)); } catch(e){ rej(e); } };
              img.onerror = rej; img.src = rd.result; };
            rd.onerror = rej; rd.readAsDataURL(file);
          });
          const wi = sec.querySelector("#wall-img");
          if (wi) wi.onchange = e => { const f = e.target.files[0]; if (!f) return;
            downscale(f, 1080, 0.82).then(url => { os.set("wallImage", url); os.set("deskColor",""); sections.display();
              os.notify({ app:"settings", title:"Sfondo", text:"Immagine di sfondo impostata." }); })
              .catch(() => os.notify({ app:"settings", title:"Sfondo", text:"Immagine non valida." })); };
          const wc = sec.querySelector("#wall-clear");
          if (wc) wc.onclick = () => { os.set("wallImage",""); sections.display(); };
          // inquadratura dello sfondo: anteprima live + adattamento/zoom/posizione
          const prev = sec.querySelector("#wall-prev");
          const paintPrev = () => { if (!prev) return;
            const fit = os.store.get("wallFit","cover");
            prev.style.backgroundSize = fit==="contain" ? "contain" : fit==="custom" ? (os.store.get("wallZoom",100)+"%") : "cover";
            prev.style.backgroundPosition = os.store.get("wallPosX",50)+"% "+os.store.get("wallPosY",50)+"%";
          };
          paintPrev();
          sec.querySelectorAll("[data-fit]").forEach(b => b.onclick = () => { os.set("wallFit", b.dataset.fit); sections.display(); });
          const wz = sec.querySelector("#wall-zoom");
          if (wz) wz.oninput = e => { os.set("wallZoom", +e.target.value); const v=sec.querySelector("#wall-zoom-v"); if(v) v.textContent=e.target.value+"%"; paintPrev(); };
          const wpx = sec.querySelector("#wall-px");
          if (wpx) wpx.oninput = e => { os.set("wallPosX", +e.target.value); paintPrev(); };
          const wpy = sec.querySelector("#wall-py");
          if (wpy) wpy.oninput = e => { os.set("wallPosY", +e.target.value); paintPrev(); };
          sec.querySelectorAll("[data-to]").forEach(b => b.onclick = () => { os.set("screenTimeout", +b.dataset.to); sections.display(); });
          const dsw = sec.querySelectorAll(".switch");   // solo 3 switch nella sezione Display
          dsw[0].onclick = () => { os.toggle("adaptiveBright"); dsw[0].classList.toggle("on"); };
          dsw[1].onclick = () => { os.toggle("autoRotate"); dsw[1].classList.toggle("on"); };
          dsw[2].onclick = () => { os.toggle("refreshHigh"); sections.display(); };
        }),

        // ---------------- Suoni e vibrazione ----------------
        sound: () => nav("Suoni e vibrazione", sec => {
          const vol = (k,ic,label) => `<div class="item"><div class="i-ico" style="background:#ff375f">${ic}</div>
            <div class="i-body" style="padding-right:12px"><div class="i-title">${label}</div>
              <input type="range" class="slider" style="margin-top:8px" min="0" max="100" value="${S[k]}" data-vol="${k}"></div></div>`;
          sec.innerHTML = `
            <div class="group">
              ${vol("volRing","📞","Suoneria")}
              ${vol("volMedia","🎵","Contenuti multimediali")}
              ${vol("volNotif","🔔","Notifiche")}
              ${vol("volAlarm","⏰","Sveglia")}
            </div>
            <div class="group" style="margin-top:12px">
              <div class="item"><div class="i-ico" style="background:#5e5ce6">🌙</div><div class="i-body"><div class="i-title">Non disturbare</div><div class="i-sub">Silenzia le notifiche</div></div>${sw(S.dnd)}</div>
              <div class="item"><div class="i-ico" style="background:#ff9f0a">📳</div><div class="i-body"><div class="i-title">Vibrazione</div></div>${sw(S.vibrate)}</div>
            </div>
            <div class="section-label">Suoneria (chiamate)</div>
            <div class="chips" data-pick="ring">${os.sounds.lists.ring.map(n=>`<button class="chip ${S.ringtone===n?'on':''}" data-snd="${n}">${n}</button>`).join("")}</div>
            <div class="section-label">Suono notifiche</div>
            <div class="chips" data-pick="notif">${os.sounds.lists.notif.map(n=>`<button class="chip ${S.notifSound===n?'on':''}" data-snd="${n}">${n}</button>`).join("")}</div>
            <div class="section-label">Suono sveglia</div>
            <div class="chips" data-pick="alarm">${os.sounds.lists.alarm.map(n=>`<button class="chip ${S.alarmSound===n?'on':''}" data-snd="${n}">${n}</button>`).join("")}</div>
            <div class="group" style="margin-top:12px">
              <div class="item"><div class="i-ico" style="background:#8e8e93">🎚️</div><div class="i-body"><div class="i-title">Suoni di sistema</div><div class="i-sub">Blocco/sblocco e conferme</div></div>${sw(S.sysSounds)}</div>
            </div>
            <div style="display:flex;gap:10px;margin:16px">
              <button class="btn ghost" id="test" style="flex:1">Notifica di prova</button>
              <button class="btn ghost" id="vibtest" style="flex:1">Prova vibrazione</button></div>`;
          sec.querySelectorAll("[data-vol]").forEach(s => s.oninput = e => os.set(e.target.dataset.vol, +e.target.value));
          const sws = sec.querySelectorAll(".switch");
          sws[0].onclick = () => { os.toggle("dnd"); sws[0].classList.toggle("on"); };
          sws[1].onclick = () => { os.toggle("vibrate"); sws[1].classList.toggle("on"); if(os.state.vibrate) os.vibrate([80,40,80]); };
          sws[2].onclick = () => { os.toggle("sysSounds"); sws[2].classList.toggle("on"); };
          // selezione suonerie/suoni: salva la scelta e ne riproduce l'anteprima
          const keyOf = { ring:"ringtone", notif:"notifSound", alarm:"alarmSound" };
          const volOf = { ring:"volRing", notif:"volNotif", alarm:"volAlarm" };
          sec.querySelectorAll(".chips").forEach(box => {
            const cat = box.dataset.pick;
            box.querySelectorAll("[data-snd]").forEach(b => b.onclick = () => {
              os.set(keyOf[cat], b.dataset.snd);
              box.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c===b));
              os.sounds.preview(cat, b.dataset.snd, (S[volOf[cat]]==null?60:S[volOf[cat]])/100*0.5);
            });
          });
          sec.querySelector("#test").onclick = () => os.notify({ app:"settings", title:"NovaOS", text:"Notifica di prova." });
          sec.querySelector("#vibtest").onclick = () => os.vibrate([120,60,120,60,220]);
        }),

        // ---------------- Notifiche ----------------
        notifications: () => nav("Notifiche", sec => {
          sec.innerHTML = `
            <div class="group">
              <div class="item"><div class="i-ico" style="background:#ff9f0a">🔒</div><div class="i-body"><div class="i-title">Sulla schermata di blocco</div><div class="i-sub">Mostra le notifiche quando bloccato</div></div>${sw(S.notifLock)}</div>
              <div class="item"><div class="i-ico" style="background:#ff9f0a">🕓</div><div class="i-body"><div class="i-title">Cronologia notifiche</div></div>${sw(S.notifHistory)}</div>
              <div class="item"><div class="i-ico" style="background:#ff9f0a">💬</div><div class="i-body"><div class="i-title">Bolle</div><div class="i-sub">Banner fluttuante alla ricezione</div></div>${sw(S.bubbles)}</div>
              <div class="item"><div class="i-ico" style="background:#34c759">🔋</div><div class="i-body"><div class="i-title">Percentuale batteria</div><div class="i-sub">Mostra nella barra di stato</div></div>${sw(S.batteryPercent)}</div>
            </div>
            <div class="section-label">Notifiche per app</div>
            <div class="group">
              ${[["messages","Messaggi"],["phone","Telefono"],["mail","Mail"],["clock","Orologio"],["store","Store"]].map(([id,label])=>{
                const on = (S.notifApps||{})[id] !== false;
                return `<div class="item" data-napp="${id}"><div class="i-body"><div class="i-title">${label}</div><div class="i-sub">${on?"Attive":"Silenziate"}</div></div>${sw(on)}</div>`;}).join("")}
            </div>`;
          const sws = sec.querySelectorAll(".group:first-child .switch");
          ["notifLock","notifHistory","bubbles","batteryPercent"].forEach((k,i)=>sws[i].onclick=()=>{os.toggle(k);sws[i].classList.toggle("on");});
          // notifiche per app: attiva/silenzia davvero (usato da os.notify)
          sec.querySelectorAll("[data-napp]").forEach(row => row.onclick = () => {
            const id = row.dataset.napp, m = { ...(os.state.notifApps||{}) };
            m[id] = m[id] === false ? true : false;
            os.set("notifApps", m); sections.notifications();
          });
        }),

        // ---------------- Sicurezza e blocco ----------------
        lock: () => nav("Sicurezza e blocco", sec => {
          sec.innerHTML = `
            <div class="section-label">Blocco schermo</div>
            <div class="group">
              ${lockOpt("none","Nessuno","Accesso diretto alla home")}
              ${lockOpt("swipe","Scorrimento","Scorri verso l'alto per sbloccare")}
              ${lockOpt("pin","PIN","Codice numerico a 4 cifre")}
            </div>
            <div id="pin-setup"></div>
            <div class="section-label">Blocco automatico</div>
            <div class="seg">${[15,30,60].map(s=>`<button data-al="${s}" class="${S.autolock===s?'on':''}">${s<60?s+"s":"1 min"}</button>`).join("")}</div>
            <button class="btn ghost" id="lock-now" style="margin:16px">Blocca ora</button>`;
          sec.querySelectorAll("[data-lt]").forEach(el => el.onclick = () => chooseLock(el.dataset.lt, sec));
          sec.querySelectorAll("[data-al]").forEach(b => b.onclick = () => { os.set("autolock", +b.dataset.al); sections.lock(); });
          sec.querySelector("#lock-now").onclick = () => os.lockDevice();
          if (S.lockType === "pin") renderPinSetup(sec);
        }),

        // ---------------- Batteria ----------------
        battery: () => nav("Batteria", sec => {
          sec.innerHTML = `
            <div class="group" style="padding:20px;text-align:center">
              <div style="font-size:calc(52px*var(--fscale,1));font-weight:200">${S.battery}%</div>
              <div style="color:var(--text-dim)">${S.saver?"Risparmio energetico attivo":"Autonomia stimata ~9 h"}</div>
              <div style="height:10px;border-radius:5px;background:var(--surface-2);margin-top:16px;overflow:hidden"><div style="height:100%;width:${S.battery}%;background:${S.battery<20?'var(--danger)':'var(--ok)'}"></div></div>
            </div>
            <div class="group" style="margin-top:12px"><div class="item"><div class="i-ico" style="background:#ffcc00">⚡</div>
              <div class="i-body"><div class="i-title">Risparmio energetico</div><div class="i-sub">Riduce consumi e prestazioni</div></div>${sw(S.saver)}</div></div>`;
          sec.querySelector(".switch").onclick = () => { os.toggle("saver"); sections.battery(); };
        }),

        // ---------------- App ----------------
        apps: () => nav("App", sec => {
          const u = os.userApps();
          sec.innerHTML = `
            <div class="section-label">Web app installate</div>
            <div class="group" style="${u.length?'':'padding:16px'}">
              ${u.length ? u.map(a=>{const img=/^(https?:|data:)/.test(a.icon||"");return `<div class="item"><div class="i-ico" style="background:${a.color}${img?`;background-image:url('${a.icon}');background-size:cover`:''}">${img?'':a.icon}</div>
                <div class="i-body"><div class="i-title trunc">${a.name}</div><div class="i-sub trunc">${a.url}</div></div>
                <button class="btn ghost" style="width:auto;padding:8px 14px;color:var(--danger)" data-rm="${a.id}">Rimuovi</button></div>`;}).join("")
              : `<div style="color:var(--text-dim);font-size:calc(14px*var(--fscale,1))">Nessuna. Apri lo Store per aggiungere web app.</div>`}
            </div>
            <button class="btn" id="open-store" style="margin:16px">Apri lo Store</button>`;
          sec.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { os.uninstallApp(b.dataset.rm); sections.apps(); });
          sec.querySelector("#open-store").onclick = () => os.openApp("store");
        }),

        // ---------------- Privacy e posizione ----------------
        privacy: () => nav("Privacy e posizione", sec => {
          syncSensors();
          const locRow = hasSensors
            ? `<div class="item" data-sens="location"><div class="i-ico" style="background:#34c759">📍</div><div class="i-body"><div class="i-title">Posizione</div><div class="i-sub">${S.location?"Attiva":"Disattivata"}</div></div>${sw(S.location)}</div>`
            : `<div class="item"><div class="i-ico" style="background:#34c759">📍</div><div class="i-body"><div class="i-title">Posizione</div><div class="i-sub">${S.location?"Attiva":"Disattivata"}</div></div>${sw(S.location)}</div>`;
          sec.innerHTML = `
            <div class="group">
              ${locRow}
            </div>
            <div class="section-label">Permessi app${hasSensors?'':' (gestiti da Android)'}</div>
            <div class="group">
              ${[["📷","Fotocamera"],["🎤","Microfono"],["📍","Posizione"],["👤","Contatti"]].map(([ic,t])=>`
                <div class="item" ${hasSensors?'data-open="appdetails"':''}><div class="i-ico" style="background:#5e5ce6">${ic}</div><div class="i-body"><div class="i-title">${t}</div><div class="i-sub">${hasSensors?"Apri i permessi di sistema":"Concessi al primo utilizzo"}</div></div><div class="chev"></div></div>`).join("")}
            </div>
            <div class="group" style="margin-top:12px">
              <div class="item" id="clear-nav"><div class="i-ico" style="background:#8e8e93">🗑️</div><div class="i-body"><div class="i-title">Cancella dati di navigazione</div><div class="i-sub">Cronologia e preferiti del Browser</div></div><div class="chev"></div></div>
            </div>`;
          const locSens = sec.querySelector('[data-sens="location"]');
          if (locSens) locSens.onclick = () => sensorAct("location", () => sections.privacy());
          else { const lsw = sec.querySelector(".switch"); if (lsw) lsw.onclick = () => { os.toggle("location"); sections.privacy(); }; }
          sec.querySelectorAll("[data-open]").forEach(el => el.onclick = () => { try { NN.openSetting(el.dataset.open); } catch {} });
          sec.querySelector("#clear-nav").onclick = async () => {
            if (!await os.confirm({title:"Cancellare i dati di navigazione?",message:"Cronologia e preferiti del Browser verranno cancellati.",okText:"Cancella"})) return;
            os.store.del("browserHistory"); os.store.del("bookmarks");
            os.notify({ app:"settings", title:"Privacy", text:"Dati di navigazione cancellati." });
          };
        }),

        // ---------------- Archiviazione ----------------
        storage: () => nav("Archiviazione", sec => {
          const fmt = b => b>=1073741824 ? (b/1073741824).toFixed(2)+" GB" : b>=1048576 ? (b/1048576).toFixed(1)+" MB" : Math.round(b/1024)+" KB";
          // dimensione reale di localStorage (dati NovaOS)
          let lsBytes = 0; try { for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); lsBytes += (k.length+(localStorage.getItem(k)||"").length)*2; } } catch {}
          sec.innerHTML = `
            <div class="group" style="padding:18px" id="st-top">
              <div style="color:var(--text-dim)">Calcolo dello spazio realmente usato da NovaOS…</div>
              <div class="boot-spinner" style="margin:14px auto"></div></div>
            <div class="section-label">Dettaglio</div>
            <div class="group" id="st-det">
              <div class="item"><div class="i-ico" style="background:#5e5ce6">🗃️</div><div class="i-body"><div class="i-title">Dati app (localStorage)</div><div class="i-sub">Impostazioni, note, contatti, messaggi…</div></div><div class="i-val">${fmt(lsBytes)}</div></div>
              <div class="item" id="st-photos"><div class="i-ico" style="background:#ff375f">🖼️</div><div class="i-body"><div class="i-title">Foto (IndexedDB)</div></div><div class="i-val">…</div></div>
            </div>`;
          // stima reale complessiva dell'origine (localStorage + IndexedDB + cache)
          if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(est => {
              const used = est.usage||0, quota = est.quota||0;
              const top = sec.querySelector("#st-top"); if (!top) return;
              const pct = quota ? Math.min(100, used/quota*100) : 0;
              top.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>${fmt(used)} usati</b><span style="color:var(--text-dim)">quota ${fmt(quota)}</span></div>
                <div style="height:12px;border-radius:6px;background:var(--surface-2);overflow:hidden"><div style="height:100%;width:${pct.toFixed(1)}%;background:var(--accent)"></div></div>
                <div style="color:var(--text-dim);font-size:calc(12px*var(--fscale,1));margin-top:8px">Spazio effettivamente occupato da NovaOS in questo dispositivo (dati, foto, cache).</div>`;
            }).catch(()=>{ const top=sec.querySelector("#st-top"); if(top) top.innerHTML = `<div style="color:var(--text-dim)">Dati app: ${fmt(lsBytes)}. Stima complessiva non disponibile.</div>`; });
          } else { const top=sec.querySelector("#st-top"); if(top) top.innerHTML = `<div style="padding:4px"><b>${fmt(lsBytes)}</b> usati dai dati dell'app.</div>`; }
          // dimensione foto: numero e byte reali da IndexedDB (non blocca la UI)
          os.photos.all().then(ph => {
            const el = sec.querySelector("#st-photos"); if (!el) return;
            const bytes = ph.reduce((s,p)=>s+(p.data?p.data.length*0.75:0),0);   // base64 ~ 4/3 dei byte reali
            el.querySelector(".i-val").textContent = ph.length+" foto · "+fmt(bytes);
          }).catch(()=>{});
        }),

        // ---------------- Accessibilità ----------------
        accessibility: () => nav("Accessibilità", sec => {
          sec.innerHTML = `
            <div class="section-label">Visualizzazione</div>
            <div class="group">
              <div class="item"><div class="i-ico" style="background:#0a84ff">🅰️</div><div class="i-body"><div class="i-title">Testo in grassetto</div></div>${sw(S.boldText)}</div>
              <div class="item"><div class="i-ico" style="background:#0a84ff">◐</div><div class="i-body"><div class="i-title">Contrasto elevato</div></div>${sw(S.highContrast)}</div>
              <div class="item"><div class="i-ico" style="background:#0a84ff">🎞️</div><div class="i-body"><div class="i-title">Riduci animazioni</div></div>${sw(S.reduceMotion)}</div>
            </div>
            <div class="section-label">Dimensione testo</div>
            <div class="group" style="padding:16px"><input type="range" class="slider" min="80" max="130" step="5" value="${S.textScale}" id="ts2"></div>`;
          const sws = sec.querySelectorAll(".switch");
          ["boldText","highContrast","reduceMotion"].forEach((k,i)=>sws[i].onclick=()=>{os.toggle(k);sws[i].classList.toggle("on");});
          sec.querySelector("#ts2").oninput = e => os.set("textScale", +e.target.value);
        }),

        // ---------------- Sistema ----------------
        system: () => nav("Sistema", sec => {
          sec.innerHTML = `
            <div class="group">
              <div class="item" ${hasSensors?'data-open="locale"':''}><div class="i-ico" style="background:#8e8e93">🌐</div><div class="i-body"><div class="i-title">Lingue e inserimento</div><div class="i-sub">${navigator.language||"Italiano"}${hasSensors?' · apri':''}</div></div><div class="${hasSensors?'chev':'i-val'}">${hasSensors?'':'Italiano'}</div></div>
              <div class="item" ${hasSensors?'data-open="date"':''}><div class="i-ico" style="background:#8e8e93">🕐</div><div class="i-body"><div class="i-title">Data e ora</div><div class="i-sub">${new Date().toLocaleString("it-IT",{dateStyle:"medium",timeStyle:"short"})}${hasSensors?' · apri':''}</div></div><div class="${hasSensors?'chev':'i-val'}">${hasSensors?'':'Auto'}</div></div>
              <div class="item"><div class="i-ico" style="background:#8e8e93">💾</div><div class="i-body"><div class="i-title">Backup dati</div><div class="i-sub">Esporta o ripristina impostazioni e dati delle app</div></div></div>
              <div style="padding:2px 16px 12px">
                <div style="display:flex;gap:10px;margin-bottom:8px">
                  <button class="btn ghost" id="bk-export" style="flex:1">Esporta backup</button>
                  <label class="btn ghost" style="flex:1;text-align:center;cursor:pointer">Ripristina da file<input id="bk-import" type="file" accept="application/json,.json" hidden></label>
                </div>
                <div style="color:var(--text-dim);font-size:calc(11.5px*var(--fscale,1));line-height:1.45">Il backup include impostazioni, contatti, note, messaggi, eventi, preferiti e app installate. Non include foto e registrazioni (troppo pesanti). Il ripristino sovrascrive i dati attuali e riavvia l'interfaccia.</div>
              </div>
            </div>
            <div class="group" style="margin-top:12px">
              <div class="item"><div class="i-ico" style="background:#34c759">⬆️</div><div class="i-body"><div class="i-title">Aggiornamenti di Sistema</div><div class="i-sub" id="upd-sub">Versione installata: NovaOS ${VER}</div></div></div>
              <div id="upd-panel" style="padding:2px 16px 14px"></div>
            </div>
            <button class="btn ghost" id="reset" style="margin:16px;color:var(--danger)">Ripristina impostazioni di fabbrica</button>`;
          const panel = sec.querySelector("#upd-panel");
          const sub = sec.querySelector("#upd-sub");
          const esc = s => String(s==null?"":s).replace(/[<>&]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));
          const btag = n => n ? ` · build ${n}` : "";
          const renderUpd = (info, checking) => {
            if (checking) { panel.innerHTML = `<div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:6px 0"><span class="spin" style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:8px"></span>Verifica aggiornamenti…</div>`; return; }
            if (!info) {
              panel.innerHTML = `<div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:6px 0 10px">Impossibile contattare il server aggiornamenti. Riprova quando sei online.</div><button class="btn ghost" id="upd-retry">Riprova</button>`;
              const rt = panel.querySelector("#upd-retry"); if (rt) rt.onclick = doCheck; return;
            }
            const up = info.hasUpdate;
            // aggiornamento della SOLA interfaccia (shell HTML/JS/CSS) applicabile a caldo,
            // senza reinstallare l'APK: serve il bridge nativo e una build nativa adeguata.
            const nn = window.NovaNative;
            const otaShell = up && info.files && info.files.length
              && nn && nn.shellWrite && nn.shellCommit
              && (!info.minNative || info.nativeBuild >= info.minNative);
            const needsApk = up && !otaShell;
            sub.textContent = up ? `NovaOS ${info.currentName} · aggiornamento disponibile` : `NovaOS ${info.currentName} · aggiornato`;
            panel.innerHTML = `
              <div class="item" style="padding:6px 0"><div class="i-body"><div class="i-sub">Versione installata</div><div class="i-title">NovaOS ${esc(info.currentName)}${btag(info.current)}</div></div></div>
              ${info.reachable ? `<div class="item" style="padding:6px 0"><div class="i-body"><div class="i-sub">Ultima disponibile</div><div class="i-title">NovaOS ${esc(info.latestName)}${btag(info.latest)}${info.date?` · ${esc(info.date)}`:""}</div></div></div>` : ""}
              ${up && info.notes ? `<div style="background:var(--surface);border-radius:12px;padding:10px 12px;margin:6px 0;font-size:calc(13px*var(--fscale,1));color:var(--text-dim)">${esc(info.notes)}</div>` : ""}
              <div style="color:${up?'var(--accent)':'var(--ok)'};font-size:calc(13px*var(--fscale,1));margin:8px 0">${up?"⬇ È disponibile una versione più recente.":"✓ Il sistema è aggiornato all'ultima versione."}</div>
              ${up ? `<div style="display:flex;align-items:center;gap:8px;background:var(--surface);border-radius:12px;padding:9px 12px;margin-bottom:10px;font-size:calc(12.5px*var(--fscale,1))">
                <span style="font-size:calc(15px*var(--fscale,1))">${otaShell?"⚡":"📦"}</span>
                <span style="color:var(--text-dim)">${otaShell
                  ? "Solo interfaccia · si applica subito, <b style=\"color:var(--text)\">nessuna reinstallazione</b>."
                  : "Richiede la <b style=\"color:var(--text)\">reinstallazione dell'app</b> (aggiornamento del sistema)."}</span></div>` : ""}
              ${up ? `<button class="btn" id="upd-install">${otaShell?"Aggiorna ora":"Scarica e installa"}</button>` : `<button class="btn ghost" id="upd-recheck">Cerca aggiornamenti</button>`}`;
            const ins = panel.querySelector("#upd-install");
            if (ins) ins.onclick = async () => {
              ins.disabled = true; ins.textContent = "Avvio aggiornamento…";
              if (os.updater.last && os.updater.last.files && os.updater.last.files.length
                  && window.NovaNative && window.NovaNative.shellWrite
                  && (!os.updater.last.minNative || os.updater.last.nativeBuild >= os.updater.last.minNative)) {
                panel.innerHTML = `<div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:6px 0"><span class="spin" style="display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:8px"></span>Scarico e applico l'interfaccia aggiornata…</div>`;
              }
              let r = {}; try { r = await os.updater.apply(); } catch {}
              panel.innerHTML = (r.mode === "web" || r.mode === "shell")
                ? `<div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:6px 0">Applico l'aggiornamento e riavvio l'interfaccia…</div>`
                : `<div style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1));padding:6px 0">Scaricamento e installazione avviati. Segui la richiesta del sistema per completare l'installazione.</div>`;
            };
            const rc = panel.querySelector("#upd-recheck"); if (rc) rc.onclick = doCheck;
          };
          const doCheck = async () => { renderUpd(null, true); let info=null; try { info = await os.updater.check(); } catch {} renderUpd(info); };
          doCheck();   // controllo automatico all'apertura della sezione
          sec.querySelector("#reset").onclick = async () => { if (await os.confirm({title:"Ripristino di fabbrica?",message:"Verranno cancellati impostazioni e app installate. L'operazione non è reversibile.",okText:"Ripristina"})) os.factoryReset(); };
          // Data e ora / Lingua: aprono i pannelli reali di sistema (sul dispositivo)
          sec.querySelectorAll("[data-open]").forEach(el => el.onclick = () => { try { NN.openSetting(el.dataset.open); } catch {} });
          // Backup reale: esporta i dati nova:* come file JSON, ripristina da file.
          const bkName = () => `novaos-backup-${new Date().toISOString().slice(0,10)}.json`;
          const bkJson = () => JSON.stringify({ format:"novaos-backup/1", date:new Date().toISOString(), data: os.backup() }, null, 2);
          const b64utf8 = s => { try { return btoa(unescape(encodeURIComponent(s))); } catch { return btoa(s); } };
          const exp = sec.querySelector("#bk-export");
          if (exp) exp.onclick = async () => {
            const json = bkJson(); const n = Object.keys(os.backup()).length;
            const nn = window.NovaNative;
            if (nn && nn.saveDownload) {           // sul dispositivo: salva in Download
              let path = ""; try { path = nn.saveDownload(bkName(), b64utf8(json)); } catch {}
              os.notify({ app:"settings", title:"Backup", text: path ? `Backup salvato in ${path} (${n} voci).` : "Backup non riuscito." });
            } else {                                // desktop/PWA: download del file
              try {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([json], { type:"application/json" }));
                a.download = bkName(); document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                os.notify({ app:"settings", title:"Backup", text:`Backup esportato (${n} voci).` });
              } catch {
                try { await navigator.clipboard.writeText(json); os.notify({ app:"settings", title:"Backup", text:"Backup copiato negli appunti." }); }
                catch { os.notify({ app:"settings", title:"Backup", text:"Esportazione non riuscita." }); }
              }
            }
          };
          const imp = sec.querySelector("#bk-import");
          if (imp) imp.onchange = e => {
            const f = e.target.files && e.target.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = async () => {
              let obj = null;
              try { obj = JSON.parse(rd.result); } catch { obj = null; }
              const data = obj && (obj.data || (obj.format ? null : obj));   // accetta {format,data} o mappa diretta
              const keys = data && typeof data === "object" ? Object.keys(data).filter(k => k.indexOf("nova:") === 0) : [];
              if (!keys.length) { os.notify({ app:"settings", title:"Ripristino", text:"File di backup non valido." }); imp.value=""; return; }
              const ok = await os.confirm({ title:"Ripristinare il backup?", message:`Verranno ripristinate ${keys.length} voci, sovrascrivendo i dati attuali. L'interfaccia si riavvierà.`, okText:"Ripristina" });
              if (!ok) { imp.value=""; return; }
              const n = os.restore(data);
              os.notify({ app:"settings", title:"Ripristino", text:`Ripristinate ${n} voci. Riavvio…` });
              setTimeout(() => { try { location.reload(); } catch {} }, 700);
            };
            rd.onerror = () => os.notify({ app:"settings", title:"Ripristino", text:"Impossibile leggere il file." });
            rd.readAsText(f);
          };
        }),

        // ---------------- Info sul telefono ----------------
        about: () => nav("Info sul telefono", sec => {
          // dati reali del dispositivo/runtime
          const ua = navigator.userAgent || "";
          const chrome = (ua.match(/Chrome\/([\d.]+)/)||[])[1];
          const android = (ua.match(/Android ([\d.]+)/)||[])[1];
          const cores = navigator.hardwareConcurrency;
          const ram = navigator.deviceMemory;
          const res = `${screen.width}×${screen.height} @${window.devicePixelRatio||1}x`;
          // se interfaccia (OTA) e app (APK) hanno build diverse, lo mostriamo: chiarisce
          // che alcune novità arrivano via aggiornamento interno e altre reinstallando l'APK.
          const splitBuild = shellBuild && apkCode && shellBuild !== apkCode;
          const rows = [
            ["Nome dispositivo","Nova N1"],["Versione NovaOS",VERLONG],
            splitBuild?["Interfaccia (OTA)","build "+shellBuild]:null,
            splitBuild?["App installata (APK)","build "+apkCode]:null,
            android?["Sistema","Android "+android]:["Runtime","WebView / Chromium"],
            chrome?["Motore","Chromium "+chrome]:null,
            ["Risoluzione schermo",res],
            cores?["Core CPU",cores+" thread"]:null,
            ram?["RAM","≈ "+ram+" GB"]:null,
            ["Lingua",navigator.language||"—"],
            ["Online",navigator.onLine?"Sì":"No"],
          ].filter(Boolean);
          sec.innerHTML = `
            <div style="text-align:center;padding:16px">
              <svg viewBox="0 0 120 120" style="width:72px;height:72px"><circle cx="60" cy="60" r="40" fill="none" stroke="#8a63ff" stroke-width="3" stroke-dasharray="150 90"/><circle cx="60" cy="60" r="28" fill="#8a63ff"/><path fill="#fff" d="M60 36 C62 51,69 58,84 60 C69 62,62 69,60 84 C58 69,51 62,36 60 C51 58,58 51,60 36 Z"/></svg>
              <div style="font-size:calc(22px*var(--fscale,1));font-weight:700;margin-top:8px">NovaOS</div></div>
            <div class="group">${rows.map(([k,v])=>`<div class="item"><div class="i-body"><div class="i-sub">${k}</div><div class="i-title">${v}</div></div></div>`).join("")}</div>`;
        }),

        // ---------------- Guida e assistenza (manuale offline + link utili) ----------------
        help: () => nav("Guida e assistenza", sec => {
          // guida rapida, tutta offline: titolo + testo per ogni argomento
          const topics = [
            ["🏠","Home e launcher","La home è a pagine: scorri lateralmente e apri le app con un tocco; le preferite stanno nel dock in basso. Per riordinare le icone apri la tendina dall'alto e tocca ✎ (modifica), poi trascinale. In Impostazioni → Display → «Home · launcher» scegli lo stile: Griglia, Lista, Drawer, Tiles, Dashboard, Radiale o Cover flow."],
            ["📲","Tutte le app","Nei launcher Dashboard e Radiale non tutte le app sono in vista: trascina verso l'alto dalla parte bassa (o tocca la maniglia in fondo nella Dashboard, l'hub centrale nel Radiale) per aprire il cassetto con l'elenco completo."],
            ["🎨","Personalizzazione","In Impostazioni → Display cambi tema chiaro/scuro, colore di risalto e forma delle icone. Per lo sfondo scegli un'immagine e regolane l'inquadratura (Riempi, Adatta o Zoom) con la posizione orizzontale e verticale. Puoi esportare e importare interi temi in formato .novatheme."],
            ["⚡","Tendina rapida","Scorri dall'alto per aprire i comandi rapidi: Wi-Fi, Bluetooth, torcia, luminosità, non disturbare e altro. Da qui apri anche la modifica della home (✎) e le Impostazioni (⚙️)."],
            ["💾","Backup e ripristino","In Impostazioni → Sistema → «Backup dati» esporti tutte le impostazioni e i dati delle app in un file JSON (salvato nella cartella Download). Con «Ripristina da file» ricarichi un backup: i dati attuali vengono sovrascritti e l'interfaccia si riavvia. Le foto e le registrazioni non sono incluse."],
            ["⬆️","Aggiornamenti","In Impostazioni → Sistema → «Aggiornamenti» controlli e installi le novità. Gli aggiornamenti della sola interfaccia si applicano subito («Aggiorna ora»); quelli che toccano le funzioni di sistema richiedono la reinstallazione dell'app."],
            ["🔒","Blocco e sicurezza","In Impostazioni → «Sicurezza e blocco» imposti PIN o sblocco a scorrimento e la schermata di blocco. Il dispositivo si blocca da solo dopo un periodo di inattività."],
          ];
          const openUrl = u => { const nn = window.NovaNative; if (nn && nn.openBrowser) { try { nn.openBrowser(u); return; } catch(e){} } try { window.open(u, "_blank"); } catch(e){} };
          const REPO = "https://github.com/dPlusOS21/NovaOS";
          sec.innerHTML = `
            <div style="padding:6px 16px 4px;color:var(--text-dim);font-size:calc(13px*var(--fscale,1))">Guida rapida a NovaOS ${VER}. Tocca un argomento per i dettagli.</div>
            <div id="help-list">${topics.map(([ic,t,txt])=>`
              <div class="item help-q" style="align-items:flex-start"><div class="i-ico" style="background:var(--surface-2)">${ic}</div>
                <div class="i-body"><div class="i-title">${t}</div><div class="i-sub help-a" style="display:none;margin-top:6px;line-height:1.5;white-space:normal;overflow-wrap:anywhere">${txt}</div></div>
                <div class="chev help-chev"></div></div>`).join("")}</div>
            <div class="section-label">Link utili</div>
            <div class="group">
              <div class="item" data-url="${REPO}"><div class="i-ico" style="background:#24292e">${ICO("globe2","width:20px;height:20px")}</div><div class="i-body"><div class="i-title">Repository e documentazione</div><div class="i-sub trunc">${REPO}</div></div><div class="chev"></div></div>
              <div class="item" data-url="${REPO}/releases"><div class="i-ico" style="background:#0a84ff">${ICO("box-arrow-right","width:18px;height:18px")}</div><div class="i-body"><div class="i-title">Ultime versioni (Release)</div><div class="i-sub trunc">${REPO}/releases</div></div><div class="chev"></div></div>
              <div class="item" data-url="${REPO}/blob/main/docs/GUIDA-ROM.md"><div class="i-ico" style="background:#5e5ce6">${ICO("info-circle-fill","width:18px;height:18px")}</div><div class="i-body"><div class="i-title">Guida tecnica (ROM)</div><div class="i-sub">Per sviluppatori · installazione come sistema</div></div><div class="chev"></div></div>
            </div>
            <div style="color:var(--text-dim);font-size:calc(11.5px*var(--fscale,1));padding:10px 16px 24px">I link aprono il browser del dispositivo. La guida rapida qui sopra funziona anche offline.</div>`;
          // accordion: espandi/comprimi il testo di ogni argomento
          sec.querySelectorAll(".help-q").forEach(q => q.onclick = () => {
            const a = q.querySelector(".help-a"), open = a.style.display !== "none";
            a.style.display = open ? "none" : "block";
            q.querySelector(".help-chev").style.transform = open ? "" : "rotate(90deg)";
          });
          sec.querySelectorAll("[data-url]").forEach(el => el.onclick = () => openUrl(el.dataset.url));
        }),
      };

      const lockOpt = (lt,t,sub) => `<div class="item" data-lt="${lt}"><div class="i-body"><div class="i-title">${t}</div><div class="i-sub">${sub}</div></div><div class="radio ${S.lockType===lt?'on':''}"></div></div>`;

      function chooseLock(lt, sec) {
        if (lt === "pin") { os.set("lockType", "pin"); sections.lock(); }   // mostra setup PIN
        else { os.set("lockType", lt); os.set("pin", ""); sections.lock(); }
      }

      function renderPinSetup(sec) {
        const box = sec.querySelector("#pin-setup");
        const has = !!S.pin;
        box.innerHTML = `
          <div class="section-label">${has?"PIN impostato":"Imposta un PIN"}</div>
          <div class="group" style="padding:16px">
            <input id="pin1" type="password" inputmode="numeric" maxlength="4" placeholder="Nuovo PIN (4 cifre)" style="width:100%;letter-spacing:8px;text-align:center;background:var(--surface-2);border:none;border-radius:12px;padding:14px;color:var(--text);font-size:calc(18px*var(--fscale,1));outline:none;margin-bottom:10px">
            <input id="pin2" type="password" inputmode="numeric" maxlength="4" placeholder="Conferma PIN" style="width:100%;letter-spacing:8px;text-align:center;background:var(--surface-2);border:none;border-radius:12px;padding:14px;color:var(--text);font-size:calc(18px*var(--fscale,1));outline:none;margin-bottom:12px">
            <div id="pin-msg" style="color:var(--danger);font-size:calc(13px*var(--fscale,1));min-height:18px;margin-bottom:8px"></div>
            <button class="btn" id="pin-save">${has?"Cambia PIN":"Salva PIN"}</button>
          </div>`;
        box.querySelector("#pin-save").onclick = () => {
          const a = box.querySelector("#pin1").value, b = box.querySelector("#pin2").value, m = box.querySelector("#pin-msg");
          if (!/^\d{4}$/.test(a)) { m.textContent = "Il PIN deve avere 4 cifre."; return; }
          if (a !== b) { m.textContent = "I due PIN non coincidono."; return; }
          os.set("pin", a); os.set("lockType", "pin");
          os.notify({ app:"settings", title:"Sicurezza", text:"PIN impostato correttamente." });
          sections.lock();
        };
      }

      // deep-link dalla tendina rapida (es. tile "Audio" → sezione Suoni)
      const deep = os.takeSettingsSection && os.takeSettingsSection();
      if (deep && sections[deep]) sections[deep](); else home();
    }});

  /* ---------- Registratore audio ---------- */
  const recorder = app({ id:"recorder", name:"Registratore", icon:"🎙️", color:"#ff375f",
    render(root, os) {
      // store IndexedDB dedicato (le registrazioni possono essere grandi)
      const DB = () => new Promise((res, rej) => {
        const r = indexedDB.open("nova-rec", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("rec", { keyPath:"id" });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const allRecs = () => new Promise(resolve => {
        let done = false; const finish = v => { if (!done) { done = true; resolve(v); } };
        setTimeout(() => finish([]), 2500);   // non bloccare mai la UI
        (async () => { try { const db = await DB();
          const rq = db.transaction("rec").objectStore("rec").getAll();
          rq.onsuccess = () => finish((rq.result||[]).sort((a,b)=>b.ts-a.ts)); rq.onerror = () => finish([]);
        } catch { finish([]); } })();
      });
      const putRec = async (item) => { const db = await DB(); return new Promise((res,rej) => {
        const t = db.transaction("rec","readwrite"); t.objectStore("rec").put(item); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
      const delRec = async (id) => { const db = await DB(); return new Promise((res) => {
        const t = db.transaction("rec","readwrite"); t.objectStore("rec").delete(id); t.oncomplete = res; t.onerror = res; }); };

      let stream = null, rec = null, chunks = [], t0 = 0, timer = null, recording = false;
      let player = null, playingId = null, seeking = false;
      const fmt = s => String(Math.floor(s/60)).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0");
      const dayLabel = ts => { const d = new Date(ts), n = new Date(); const same = x => x.toDateString();
        if (same(d)===same(n)) return "Oggi"; const y = new Date(n); y.setDate(n.getDate()-1);
        if (same(d)===same(y)) return "Ieri"; return d.toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"}); };

      const stopPlayback = () => { if (player) { try{ player.pause(); }catch{} player = null; } playingId = null; };

      const draw = async () => {
        stopPlayback();
        const recs = await allRecs();
        const groups = {};
        recs.forEach(r => { const k = dayLabel(r.ts); (groups[k] = groups[k] || []).push(r); });
        const listHtml = recs.length ? Object.entries(groups).map(([k,arr]) => `
          <div class="date-head">${k}</div>
          <div class="group">${arr.map(r => `
            <div class="item" data-id="${r.id}" style="flex-wrap:wrap">
              <button class="round-act small play" data-play="${r.id}" style="background:var(--accent)">${ICO("play-fill","width:16px;height:16px")}</button>
              <div class="i-body"><div class="i-title trunc rec-name" data-name="${r.id}">${r.name}</div>
                <div class="i-sub">${fmt(r.dur||0)} · ${new Date(r.ts).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</div></div>
              <button class="round-act small" data-rename="${r.id}" style="background:var(--surface);color:var(--text)">${ICO("pencil-fill","width:14px;height:14px")}</button>
              <button class="round-act small" data-del="${r.id}" style="background:var(--surface);color:var(--danger)">${ICO("trash-fill","width:14px;height:14px")}</button>
              <div class="rec-prog" data-prog="${r.id}" style="display:none;flex:0 0 100%;align-items:center;gap:12px;margin-top:6px">
                <input type="range" class="slider rec-seek" min="0" max="${r.dur||1}" value="0" step="any" style="flex:1">
                <span class="rec-tt" style="font-size:calc(12px*var(--fscale,1));color:var(--text-dim);font-variant-numeric:tabular-nums;white-space:nowrap">00:00 / ${fmt(r.dur||0)}</span>
              </div>
            </div>`).join("")}</div>`).join("")
          : `<div style="text-align:center;color:var(--text-dim);padding:30px 20px;font-size:calc(13px*var(--fscale,1))">Nessuna registrazione.<br>Tocca il pulsante rosso per iniziare.</div>`;

        root.innerHTML = `<div class="hero"><div class="hero-l"><h1>Registratore</h1></div></div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 16px 20px">
            <div id="rec-time" style="font-size:calc(40px*var(--fscale,1));font-weight:200;font-variant-numeric:tabular-nums;letter-spacing:1px">00:00</div>
            <div id="rec-state" style="color:var(--text-dim);font-size:calc(13px*var(--fscale,1))">Pronto a registrare</div>
            <button id="rec-btn" style="width:76px;height:76px;border-radius:50%;border:5px solid color-mix(in srgb,#ff375f 45%,transparent);background:#ff375f;cursor:pointer;transition:border-radius .2s,transform .1s"></button>
            <div id="mic-warn" style="display:none;flex-direction:column;align-items:center;gap:6px;background:var(--surface);color:var(--text);padding:10px 14px;border-radius:16px;font-size:calc(12px*var(--fscale,1));max-width:280px;text-align:center">
              <span id="mic-warn-txt">🔇 Microfono disattivato</span>
              <button id="mic-go" class="btn" style="width:auto;padding:6px 16px;font-size:calc(12px*var(--fscale,1))">Attiva microfono</button></div>
          </div>
          <div id="rec-list">${listHtml}</div>
          <audio id="rec-audio" hidden></audio>`;
        bind();
      };

      const setState = (txt) => { const e = root.querySelector("#rec-state"); if (e) e.textContent = txt; };
      const micDiag = () => { try { return window.NovaNative && window.NovaNative.micDiag ? window.NovaNative.micDiag() : "granted"; } catch { return "granted"; } };
      const showMicWarn = () => {
        const w = root.querySelector("#mic-warn"), txt = root.querySelector("#mic-warn-txt"), go = root.querySelector("#mic-go");
        if (!w) return;
        const d = micDiag();
        if (d === "granted") {
          if (!captureFail) { w.style.display = "none"; return; }
          txt.textContent = "🔇 Microfono occupato o non accessibile ora."; go.textContent = "Riprova"; w.dataset.act = "retry"; w.style.display = "flex"; return;
        }
        txt.innerHTML = d === "blocked"
          ? "🔇 Microfono negato.<br>Impostazioni › Autorizzazioni › Microfono › Consenti."
          : "🔇 Serve il permesso del microfono per registrare.";
        go.textContent = d === "blocked" ? "Apri Impostazioni" : "Consenti microfono";
        w.dataset.act = d;
        w.style.display = "flex";
      };
      const hideMicWarn = () => { const w = root.querySelector("#mic-warn"); if (w) w.style.display = "none"; };

      // su device usa il registratore audio NATIVO (la WebView spesso non cattura
      // il microfono via getUserMedia); in emulatore/browser ripiega su MediaRecorder web.
      const nativeAudio = !!(window.NovaNative && window.NovaNative.audioRecStart);
      const beginUI = () => {
        recording = true; t0 = Date.now();
        const btn = root.querySelector("#rec-btn"); if (btn) { btn.style.borderRadius = "20px"; btn.style.transform = "scale(.9)"; }
        setState("Registrazione…"); os.vibrate && os.vibrate(20);
        timer = setInterval(() => { const s = (Date.now()-t0)/1000; const e = root.querySelector("#rec-time"); if (e) e.textContent = fmt(s); }, 200);
      };
      const endUI = () => {
        recording = false; clearInterval(timer); timer = null;
        const btn = root.querySelector("#rec-btn"); if (btn) { btn.style.borderRadius = "50%"; btn.style.transform = ""; }
        setState("Pronto a registrare"); os.vibrate && os.vibrate(20);
      };
      const saveRec = async (dataUrl, dur) => {
        const now = new Date();
        await putRec({ id: Date.now(), name: "Registrazione "+now.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})+" "+now.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}), ts: Date.now(), dur, data: dataUrl });
        await draw();
      };

      let usedNative = false;
      const start = async () => {
        hideMicWarn();
        // 1) via WEB standard (getUserMedia + MediaRecorder) — è così che funzionerà
        //    sulla ROM Gecko/Firefox OS finale, dove il runtime espone il microfono.
        try {
          try { window.NovaNative && window.NovaNative.requestMic && window.NovaNative.requestMic(); } catch {}
          stream = await navigator.mediaDevices.getUserMedia({ audio:true });
          const cand = ["audio/webm;codecs=opus","audio/mp4;codecs=mp4a.40.2","audio/mp4","audio/webm","audio/ogg;codecs=opus"];
          const mime = cand.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
          chunks = [];
          rec = new MediaRecorder(stream, mime ? { mimeType:mime, audioBitsPerSecond:128000 } : undefined);
          rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = async () => {
            const blob = new Blob(chunks, { type: chunks[0] ? chunks[0].type : "audio/webm" });
            const r = new FileReader(); r.onload = () => saveRec(r.result, Math.round((Date.now()-t0)/1000)); r.readAsDataURL(blob);
          };
          rec.start(); usedNative = false; beginUI(); return;
        } catch (e) {
          if (stream) { stream.getTracks().forEach(t=>t.stop()); stream = null; }
          rec = null;
        }
        // 2) ripiego sul layer del runtime (questa WebView non cattura il microfono):
        //    è lo stesso ruolo che avrebbe Gecko in Firefox OS, qui fornito da NovaNative.
        if (nativeAudio) {
          let ok = false; try { ok = window.NovaNative.audioRecStart(); } catch {}
          if (ok) { usedNative = true; beginUI(); return; }
        }
        showMicWarn(true);
      };
      const stop = async () => {
        if (!recording) return;
        const dur = Math.round((Date.now()-t0)/1000);
        endUI();
        if (usedNative) {
          let dataUrl = "";
          try { dataUrl = window.NovaNative.audioRecStop() || ""; } catch {}
          if (dataUrl) await saveRec(dataUrl, dur); else setState("Registrazione non riuscita");
          return;
        }
        try { rec && rec.stop(); } catch {}
        if (stream) { stream.getTracks().forEach(t=>t.stop()); stream = null; }
      };

      const bind = () => {
        const btn = root.querySelector("#rec-btn");
        if (btn) btn.onclick = () => { recording ? stop() : start(); };
        const go = root.querySelector("#mic-go");
        if (go) go.onclick = () => {
          const w = root.querySelector("#mic-warn");
          const act = w && w.dataset.act;
          if (act === "retry") { hideMicWarn(); start(); return; }
          if (act === "blocked") { try { window.NovaNative && window.NovaNative.openAppSettings && window.NovaNative.openAppSettings(); } catch {} return; }
          try { window.NovaNative && window.NovaNative.requestMic && window.NovaNative.requestMic(); } catch {}
        };
        const audio = root.querySelector("#rec-audio");
        const durOf = (fallback) => (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : fallback;
        root.querySelectorAll("[data-play]").forEach(b => b.onclick = async () => {
          const id = +b.dataset.play;
          const item = b.closest(".item");
          const prog = item.querySelector(".rec-prog");
          const seek = item.querySelector(".rec-seek");
          const tt = item.querySelector(".rec-tt");
          // stessa traccia → metti in pausa / riprendi mantenendo la posizione e la barra
          if (playingId === id && player) {
            if (player.paused) { player.play(); b.innerHTML = ICO("pause-fill","width:16px;height:16px"); }
            else { player.pause(); b.innerHTML = ICO("play-fill","width:16px;height:16px"); }
            return;
          }
          // nuova traccia → azzera le altre
          stopPlayback();
          root.querySelectorAll("[data-play]").forEach(x => x.innerHTML = ICO("play-fill","width:16px;height:16px"));
          root.querySelectorAll(".rec-prog").forEach(p => p.style.display = "none");
          const recs = await allRecs(); const r = recs.find(x=>x.id===id); if (!r) return;
          const total = r.dur || 0;
          audio.src = r.data; player = audio; playingId = id; seeking = false;
          prog.style.display = "flex"; b.innerHTML = ICO("pause-fill","width:16px;height:16px");
          seek.max = total || 1; seek.value = 0; tt.textContent = "00:00 / " + fmt(total);
          audio.onloadedmetadata = () => { const d = durOf(total); if (d) { seek.max = d; tt.textContent = fmt(audio.currentTime) + " / " + fmt(d); } };
          audio.ontimeupdate = () => { if (seeking) return; const d = durOf(total); seek.value = audio.currentTime; tt.textContent = fmt(audio.currentTime) + " / " + fmt(d); };
          audio.onended = () => { b.innerHTML = ICO("play-fill","width:16px;height:16px"); seek.value = 0; tt.textContent = "00:00 / " + fmt(durOf(total)); playingId = null; };
          seek.oninput = () => { seeking = true; tt.textContent = fmt(+seek.value) + " / " + fmt(durOf(total)); };
          seek.onchange = () => { try { audio.currentTime = +seek.value; } catch {} seeking = false; };
          audio.play();
        });
        root.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
          const id = +b.dataset.del;
          const recs = await allRecs(); const r = recs.find(x=>x.id===id);
          if (!await os.confirm({title:"Eliminare la registrazione?",message:`"${r ? r.name : "Questa registrazione"}" verrà eliminata definitivamente.`,okText:"Elimina"})) return;
          stopPlayback(); await delRec(id); await draw();
        });
        root.querySelectorAll("[data-rename]").forEach(b => b.onclick = async () => {
          const id = +b.dataset.rename; const el = root.querySelector(`.rec-name[data-name="${id}"]`); if (!el) return;
          const cur = el.textContent;
          el.innerHTML = `<input value="${cur.replace(/"/g,'&quot;')}" style="width:100%;background:var(--surface-2);border:none;border-radius:8px;padding:6px 8px;color:var(--text);font-size:calc(14px*var(--fscale,1))">`;
          const inp = el.querySelector("input"); inp.focus(); inp.select();
          const commit = async () => { const recs = await allRecs(); const r = recs.find(x=>x.id===id); if (r) { r.name = inp.value.trim()||cur; await putRec(r); } await draw(); };
          inp.onblur = commit; inp.onkeydown = e => { if (e.key==="Enter") inp.blur(); };
        });
      };

      // permesso microfono concesso (dialog) o ritorno dalle Impostazioni:
      // aggiorna l'avviso (e nascondilo se ora è tutto a posto).
      window.__novaMic = (ok) => { if (ok) hideMicWarn(); else showMicWarn(); };
      window.__novaMicResume = () => { if (micDiag() === "granted") hideMicWarn(); };

      draw();
      root._cleanup = () => { try { stop(); } catch {} stopPlayback(); window.__novaMic = null; window.__novaMicResume = null; };
    }});

  const list = [phone, contacts, messages, mail, browser, camera, gallery, recorder, clock, calendar, weather, notes, calc, files, store, settings];
  return { list, byId: Object.fromEntries(list.map(a => [a.id, a])), dock: list.filter(a => a.dock) };
})();

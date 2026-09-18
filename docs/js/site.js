/* NovaOS — sito di presentazione.
   Un solo compito: il bottone che riporta all'inizio della pagina, creato qui
   così le pagine restano senza marcatori duplicati. Senza JavaScript il sito
   funziona identico, semplicemente il bottone non c'è. */
(function () {
  "use strict";

  var DOPO_QUANTO = 420; // px di scorrimento prima di mostrarlo

  var bottone = document.createElement("button");
  bottone.type = "button";
  bottone.className = "totop";
  bottone.title = "Torna su";
  bottone.setAttribute("aria-label", "Torna all'inizio della pagina");
  bottone.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  /* La pagina dichiara scroll-behavior:smooth nel CSS. Chi ha chiesto meno
     animazioni deve saltare subito, quindi gliela si disattiva per un istante
     invece di passare «behavior» a scrollTo, che non batte la regola CSS. */
  function vaiInCima() {
    var radice = document.documentElement;
    var ridotto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (ridotto) {
      var prima = radice.style.scrollBehavior;
      radice.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      radice.style.scrollBehavior = prima;
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function aggiornaVisibilita() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    bottone.className = y > DOPO_QUANTO ? "totop on" : "totop";
  }

  bottone.addEventListener("click", vaiInCima);

  document.body.appendChild(bottone);
  aggiornaVisibilita();
  window.addEventListener("scroll", aggiornaVisibilita, { passive: true });
})();

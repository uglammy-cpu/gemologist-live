/* OFFERTA DI BENVENUTO — finestra di benvenuto per i brand, al posto della ruota (7 novembre 2026)
 *
 * Decisione di Elena del 7/11/2026, dopo LEG-004 del Legal: la ruota (premi diversi a sorte) è in demo;
 * al suo posto un'offerta uguale per tutti, senza sorte: il primo mese a un prezzo d'offerta (oggi 119 €)
 * per ogni brand approvato. Testi dal Legal (LEG-004), senza «exclusive», senza vincite e senza scadenze finte.
 *
 * - Script autonomo accanto alla ruota, su /join e in home (vetrina). Si accende e si spegne da /admin.
 * - Se la ruota è pubblica, questa finestra non compare: una finestra sola.
 * - Anteprima per Elena con ?welcome=preview, con l'etichetta «Anteprima».
 * - In home si apre dopo la schermata di benvenuto della prima visita; su /join appena si apre la pagina.
 *   Chiusa, resta il pulsante YOUR WELCOME OFFER; nella stessa sessione non si riapre da sola.
 * - Il prezzo lo applica il server all'approvazione (_billing_open): qui si mostra soltanto.
 */
(function () {
  "use strict";
  var W = { url: "{{URL}}", key: "{{KEY}}", join: "/live/join?lang=" };
  if (!window.fetch || !W.url || /\{\{/.test(W.url)) return;

  // titoli e pulsanti in inglese, come la voce del marchio della ruota; il resto nella lingua della pagina
  var BRAND = { title: "YOUR WELCOME OFFER", account: "CREATE YOUR ACCOUNT", apply: "REGISTER & APPLY", fab: "YOUR WELCOME OFFER" };
  var TX = {
    it: {
      eyebrow: "Per i brand che entrano in Uniqaia",
      first: "Il tuo primo mese: {p}", instead: "Invece di {s}.",
      renews: "Dal secondo mese {s} al mese, per {n} dirette fino a {m} minuti ciascuna.",
      terms: "Offerta di benvenuto uguale per tutti: il primo mese a {p} invece di {s}, solo se Uniqaia approva il tuo brand. Una volta per azienda.",
      until: "Valida per le candidature inviate entro il {d}.",
      closed: "Le candidature si aprono a breve: puoi già creare il tuo account.",
      open: "Ti rispondiamo entro 24 ore.",
      fd: "Founding 20: i primi 20 brand che attivano l'abbonamento ricevono un numero permanente, da #01 a #20. Restano {n} numeri.",
      fd1: "Founding 20: i primi 20 brand che attivano l'abbonamento ricevono un numero permanente, da #01 a #20. Resta 1 numero.",
      preview: "Anteprima · offerta non ancora pubblicata", close: "Chiudi"
    },
    en: {
      eyebrow: "For brands joining Uniqaia",
      first: "Your first month: {p}", instead: "Instead of {s}.",
      renews: "From the second month, {s} per month for {n} live shows of up to {m} minutes each.",
      terms: "A welcome offer that is the same for everyone: your first month at {p} instead of {s}, only if Uniqaia approves your brand. Once per company.",
      until: "Valid for applications sent by {d}.",
      closed: "Applications open soon: you can already create your account.",
      open: "We reply within 24 hours.",
      fd: "Founding 20: the first 20 brands to activate their subscription receive a permanent number, from #01 to #20. {n} numbers left.",
      fd1: "Founding 20: the first 20 brands to activate their subscription receive a permanent number, from #01 to #20. 1 number left.",
      preview: "Preview · offer not yet published", close: "Close"
    },
    fr: {
      eyebrow: "Pour les marques qui rejoignent Uniqaia",
      first: "Votre premier mois : {p}", instead: "Au lieu de {s}.",
      renews: "À partir du deuxième mois, {s} par mois pour {n} directs de {m} minutes maximum chacun.",
      terms: "Une offre de bienvenue identique pour tous : le premier mois à {p} au lieu de {s}, uniquement si Uniqaia approuve votre marque. Une fois par entreprise.",
      until: "Valable pour les candidatures envoyées jusqu'au {d}.",
      closed: "Les candidatures ouvrent bientôt : vous pouvez déjà créer votre compte.",
      open: "Nous vous répondons sous 24 heures.",
      fd: "Founding 20 : les 20 premières marques qui activent leur abonnement reçoivent un numéro permanent, de #01 à #20. Il reste {n} numéros.",
      fd1: "Founding 20 : les 20 premières marques qui activent leur abonnement reçoivent un numéro permanent, de #01 à #20. Il reste 1 numéro.",
      preview: "Aperçu · offre pas encore publiée", close: "Fermer"
    }
  };
  function lang() { return (document.documentElement.lang || "it").slice(0, 2).toLowerCase(); }
  function tl() { var l = lang(); return TX[l] ? l : "en"; }
  function tx(k, v) { var s = TX[tl()][k] || TX.en[k] || ""; return s.replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; }); }
  function eur(c) {
    var l = lang(), loc = l === "ar" ? "ar-AE-u-nu-latn" : l;
    try { return new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(c / 100); }
    catch (e) { return "€" + (c / 100); }
  }
  function day(iso) {
    var l = lang(), loc = l === "ar" ? "ar-AE-u-nu-latn" : l;
    try { return new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function store(kind) { try { var s = window[kind]; s.setItem("uqo-t", "1"); s.removeItem("uqo-t"); return s; } catch (e) { return null; } }
  var LS = store("localStorage"), SS = store("sessionStorage"), MEM = {};
  function get(s, k) { return s ? s.getItem(k) : MEM[k] || null; }
  function set(s, k, v) { if (s) { try { s.setItem(k, v); } catch (e) {} } else MEM[k] = v; }
  var Q = new URLSearchParams(location.search);
  if (Q.get("welcome") === "preview") set(SS, "uqo-preview", "1");
  var preview = get(SS, "uqo-preview") === "1";

  function rpc(fn, body) {
    return fetch(W.url + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: W.key, Authorization: "Bearer " + W.key }, body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || r.status); return j; }); });
  }

  var S = { o: null, fLeft: null, open: false, demo: false };
  var els = {};

  var CSS = [
    ".uqo-scrim{position:fixed;inset:0;z-index:80;background:rgba(22,18,12,.46);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:12px;opacity:0;transition:opacity .28s ease}",
    ".uqo-scrim.on{opacity:1}",
    ".uqo-card{position:relative;width:min(100%,430px);max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;background:#FFFDF8;color:var(--ink,#16181D);border-radius:20px;box-shadow:0 24px 70px rgba(28,20,6,.28),0 0 0 1px rgba(203,164,79,.35);padding:30px 22px 22px;text-align:center;font-family:var(--body,'Jost',system-ui,sans-serif);transform:translateY(10px) scale(.98);transition:transform .32s cubic-bezier(.2,.7,.2,1)}",
    ".uqo-scrim.on .uqo-card{transform:none}",
    ".uqo-card::before{content:'';position:absolute;inset:7px;border:1px solid rgba(203,164,79,.32);border-radius:15px;pointer-events:none}",
    ".uqo-card:focus{outline:none}",
    ".uqo-x{position:absolute;top:8px;inset-inline-end:8px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;display:grid;place-items:center;color:var(--ink,#16181D);z-index:2;cursor:pointer}",
    ".uqo-x:hover{background:rgba(203,164,79,.14)}",
    ".uqo-x svg{width:18px;height:18px}",
    ".uqo-demo{display:inline-block;margin:0 44px 12px;padding:4px 12px;border-radius:999px;background:#16181D;color:#EDD596;font-size:10.5px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase}",
    ".uqo-eyebrow{font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-edge,#8C6A2B);font-weight:500;margin:0 26px}",
    ".uqo-h{font-family:var(--display,'Bodoni Moda',Didot,Georgia,serif);font-weight:400;font-size:clamp(21px,5.6vw,26px);line-height:1.15;letter-spacing:.06em;margin:6px 0 4px;padding:0 26px}",
    ".uqo-gem{display:block;width:46px;height:46px;margin:14px auto 0}",
    ".uqo-offer{margin:14px auto 14px;max-width:340px;border:1px solid #EDD596;background:linear-gradient(180deg,#FBF3E0,#F8F1DF);border-radius:14px;padding:16px 16px 14px}",
    ".uqo-offer .p{font-family:var(--display,'Bodoni Moda',Didot,Georgia,serif);font-size:clamp(22px,6vw,27px);line-height:1.15;color:#1C1406;margin:0 0 8px}",
    ".uqo-offer .l{font-size:13.5px;line-height:1.5;color:#3b3a36;margin:0}",
    ".uqo-offer .l + .l{margin-top:2px}",
    ".uqo-res{font-size:13.5px;line-height:1.5;color:#2b2a26;margin:0 auto 14px;max-width:38ch}",
    ".uqo-btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 28px;border-radius:999px;border:1px solid #1C1406;background:#1C1406;color:#EDD596;font:500 14px/1 var(--body,'Jost',system-ui,sans-serif);letter-spacing:.16em;text-transform:uppercase;cursor:pointer;width:100%;max-width:320px}",
    ".uqo-btn:hover{background:#2a2010}",
    ".uqo-btn:focus-visible,.uqo-x:focus-visible,.uqo-fab:focus-visible{outline:2px solid #8C6A2B;outline-offset:3px}",
    ".uqo-terms{font-size:12px;line-height:1.45;color:#4a4740;margin:12px auto 0;max-width:40ch}",
    ".uqo-terms p{margin:0}",
    ".uqo-terms p + p{margin-top:4px}",
    ".uqo-fab{position:fixed;z-index:60;bottom:calc(16px + env(safe-area-inset-bottom,0px));right:max(16px,env(safe-area-inset-right,0px));display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px 0 13px;border-radius:999px;border:1px solid #CBA44F;background:#FFFDF8;color:#1C1406;box-shadow:0 6px 20px rgba(28,20,6,.16);font:500 11.5px/1 var(--body,'Jost',system-ui,sans-serif);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:opacity .25s,transform .25s}",
    "[dir=rtl] .uqo-fab{right:auto;left:max(16px,env(safe-area-inset-left,0px))}",
    ".uqo-fab svg{width:18px;height:18px;flex:none}",
    ".uqo-fab.off{opacity:0;transform:translateY(12px);pointer-events:none}",
    "html.uqo-lock,html.uqo-lock body{overflow:hidden}",
    "@media (max-width:380px){.uqo-card{padding:26px 16px 18px}.uqo-h,.uqo-eyebrow{padding:0 22px;margin-inline:0}}",
    "@media (prefers-reduced-motion:reduce){.uqo-scrim,.uqo-card,.uqo-fab{transition:none}}"
  ].join("\n");
  var GEM = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.2" aria-hidden="true"><path d="M8.5 3.5h7L19 8H5z" fill="#F8F1DF" stroke="#A9833A"/><path d="M5 8h14l-7 12.5z" fill="#FFFDF8" stroke="#A9833A"/><path d="M12 3.5 15.5 8 12 20.5 8.5 8z" stroke="#CBA44F"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function price() { return S.o.active ? S.o.first_cents : S.o.preview_cents; }
  function body() {
    var o = S.o, p = eur(price()), s = eur(o.std_cents || 14900);
    var ready = !!o.legal_ready, terms = ['<p>' + esc(tx("terms", { p: p, s: s })) + '</p>'];
    if (o.until) terms.push('<p>' + esc(tx("until", { d: day(o.until) })) + '</p>');
    if (S.fLeft != null && S.fLeft > 0) terms.push('<p>' + esc(S.fLeft === 1 ? tx("fd1") : tx("fd", { n: S.fLeft })) + '</p>');
    return (S.demo ? '<p class="uqo-demo">' + esc(tx("preview")) + '</p>' : "") +
      '<p class="uqo-eyebrow">' + esc(tx("eyebrow")) + '</p>' +
      '<p class="uqo-h" id="uqo-title">' + esc(BRAND.title) + '</p>' +
      '<span class="uqo-gem">' + GEM + '</span>' +
      '<div class="uqo-offer"><p class="p">' + esc(tx("first", { p: p })) + '</p><p class="l">' + esc(tx("instead", { s: s })) + '</p>' +
        '<p class="l">' + esc(tx("renews", { s: s, n: o.lives || 4, m: o.max_min || 60 })) + '</p></div>' +
      '<p class="uqo-res">' + esc(tx(ready ? "open" : "closed")) + '</p>' +
      '<button type="button" class="uqo-btn" id="uqo-go">' + esc(ready ? BRAND.apply : BRAND.account) + '</button>' +
      '<div class="uqo-terms">' + terms.join("") + '</div>';
  }

  function go() {
    close(true);
    var box = document.getElementById("acct");
    if (!box) { location.href = W.join + lang() + "#acct"; return; }
    var top = box.getBoundingClientRect().top + window.pageYOffset - 12;
    window.scrollTo({ top: top, behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(function () { var f = box.querySelector("input:not([type=hidden]):not([disabled]),select,textarea,button.btn"); if (f) f.focus({ preventScroll: true }); }, 450);
  }

  function build() {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var fab = document.createElement("button"); fab.type = "button"; fab.className = "uqo-fab off"; fab.setAttribute("aria-haspopup", "dialog");
    fab.innerHTML = GEM + "<span>" + esc(BRAND.fab) + "</span>"; fab.addEventListener("click", function () { open(); });
    document.body.appendChild(fab); els.fab = fab;
  }
  function render() { if (els.body) { els.body.innerHTML = body(); els.body.querySelector("#uqo-go").addEventListener("click", go); } }
  function open() {
    if (S.open) return;
    S.open = true; els.last = document.activeElement;
    var sc = document.createElement("div"); sc.className = "uqo-scrim";
    sc.innerHTML = '<div class="uqo-card" role="dialog" aria-modal="true" aria-labelledby="uqo-title" tabindex="-1"><button type="button" class="uqo-x" aria-label="' + esc(tx("close")) + '">' + CLOSE + '</button><div class="uqo-body"></div></div>';
    document.body.appendChild(sc);
    els.scrim = sc; els.card = sc.firstChild; els.x = sc.querySelector(".uqo-x"); els.body = sc.querySelector(".uqo-body");
    els.x.addEventListener("click", function () { close(); });
    sc.addEventListener("mousedown", function (e) { if (e.target === sc) close(); });
    document.addEventListener("keydown", onKey, true);
    document.documentElement.classList.add("uqo-lock");
    render(); sync();
    requestAnimationFrame(function () { sc.classList.add("on"); });
    els.card.focus({ preventScroll: true });
  }
  function close(went) {
    if (!S.open) return;
    S.open = false; set(SS, "uqo-closed", "1");
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.classList.remove("uqo-lock");
    var sc = els.scrim; els.scrim = els.body = null;
    sc.classList.remove("on"); setTimeout(function () { if (sc.parentNode) sc.parentNode.removeChild(sc); }, 260);
    sync();
    if (!went && els.fab && !els.fab.classList.contains("off")) els.fab.focus({ preventScroll: true });
    else if (!went && els.last && els.last.focus) els.last.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!S.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      var f = Array.prototype.filter.call(els.card.querySelectorAll("button:not([disabled]),a[href]"), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (i < 0) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); return; }
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  function sync() {
    if (!els.fab) return;
    var show = !S.open;
    els.fab.classList.toggle("off", !show); els.fab.tabIndex = show ? 0 : -1; els.fab.setAttribute("aria-hidden", show ? "false" : "true");
  }

  window.UQWelcome = { active: false, open: function () { if (window.UQWelcome.active) open(); } };

  // la lingua della pagina cambia senza ricaricare: la finestra aperta si riscrive
  new MutationObserver(function () { if (els.x) els.x.setAttribute("aria-label", tx("close")); if (S.open) render(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  rpc("welcome_offer").then(function (o) {
    if (!o || o.wheel_live) return;              // la ruota pubblica ha la precedenza: una finestra sola
    if (!o.active && !preview) return;
    S.o = o; S.demo = !o.active;
    window.UQWelcome.active = true;
    build();
    rpc("founding_left").then(function (n) { if (typeof n === "number") { S.fLeft = n; if (S.open) render(); } }, function () {});
    function auto() { if (get(SS, "uqo-closed") !== "1" && !/#acct$/.test(location.hash)) open(); else sync(); }
    // in home, alla prima visita, c'è la schermata di benvenuto: la finestra si apre quando la si chiude
    var wl = document.getElementById("welcome");
    if (wl && get(LS, "vetrina-welcomed") !== "1") {
      var t0 = Date.now(), seen = false;
      var iv = setInterval(function () {
        if (!wl.hidden && wl.innerHTML) seen = true;
        if (get(LS, "vetrina-welcomed") === "1" || (seen && wl.hidden) || (!seen && Date.now() - t0 > 4000)) { clearInterval(iv); auto(); }
      }, 400);
    } else auto();
    try { document.dispatchEvent(new CustomEvent("uqo:ready")); } catch (e) {}
  }).catch(function () {});
})();

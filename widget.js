/*!
 * Ask a Gemologist - Live · chat widget for jewelry brand websites
 * Gems & Jewelry Tech Lab · Elena Goglio, GIA Graduate Gemologist
 *
 * Install (any website, Shopify included), before </body>:
 *   <script src="https://live.gemsandjewelrytechlab.com/widget.js" data-brand="BRAND-SLUG" defer></script>
 * Optional on product pages, before the line above:
 *   <script>window.AAG_PRODUCT = { title: "...", price: "...", image: "https://...", url: "https://...", type: "...", tags: ["..."], message: "" };</script>
 * Options on the script tag: data-delay="25" (seconds before the message bubble), data-side="right|left", data-bottom="20" (px).
 * A brand's own button can open the chat with:  AskAGemologist.open()
 */
(function () {
  if (window.AskAGemologist) return;
  var me = document.currentScript || (function () { var s = document.querySelectorAll('script[src*="widget.js"]'); return s[s.length - 1]; })();
  var ORIGIN = new URL(me.src, location.href).origin;
  var D = me.dataset || {};
  var SLUG = (D.brand || "").replace(/[^a-z0-9-]/gi, "");
  var DELAY = Math.max(0, parseFloat(D.delay || "25"));
  var SIDE = D.side === "left" ? "left" : "right";
  var BOTTOM = parseInt(D.bottom || "20", 10);

  var TX = {
    en: { title: "Ask a Gemologist - Live", ring: "ASK A GEMOLOGIST · LIVE · ", ringSize: 10, sig: "Elena · GIA Graduate Gemologist", open: "Ask a Gemologist - Live: open the chat", close: "Close the message", replied: "Elena replied",
      m: { ringDiamond: "Questions about this diamond's color and clarity?", ringStone: "Curious how {stone} in this ring is graded?", ring: "Need help with the size of this ring?", diamond: "Questions about this diamond's color and clarity?", stone: "Curious how {stone} in this piece is graded?", earrings: "Wondering how these earrings look when worn?", necklace: "Not sure which length suits you?", bracelet: "Need help with the size of this bracelet?", generic: "Choosing an important piece? I can help." } },
    it: { title: "Chiedi alla Gemmologa - Live", ring: "CHIEDI ALLA GEMMOLOGA · LIVE · ", ringSize: 9, sig: "Elena · Gemmologa GIA", open: "Chiedi alla Gemmologa: apri la chat", close: "Chiudi il messaggio", replied: "Elena ti ha risposto",
      m: { ringDiamond: "Dubbi su colore e purezza di questo diamante?", ringStone: "Vuoi sapere come si valuta {stone} di questo anello?", ring: "Ti aiuto a scegliere la misura di questo anello?", diamond: "Dubbi su colore e purezza di questo diamante?", stone: "Vuoi sapere come si valuta {stone} di questo gioiello?", earrings: "Vuoi sapere come stanno indossati questi orecchini?", necklace: "Non sai quale lunghezza ti sta meglio?", bracelet: "Ti aiuto a scegliere la misura di questo bracciale?", generic: "Stai scegliendo un gioiello importante? Ti aiuto io." } }
  };
  var STONES = [
    ["zaffir|sapphire", "lo zaffiro", "the sapphire"], ["rubin|ruby", "il rubino", "the ruby"], ["smerald|emerald", "lo smeraldo", "the emerald"],
    ["acquamarin|aquamarine", "l'acquamarina", "the aquamarine"], ["paraiba", "la tormalina Paraíba", "the Paraíba tourmaline"], ["tormalin|tourmaline", "la tormalina", "the tourmaline"],
    ["tanzanit", "la tanzanite", "the tanzanite"], ["topazi|topaz", "il topazio", "the topaz"], ["ametist|amethyst", "l'ametista", "the amethyst"],
    ["morganit", "la morganite", "the morganite"], ["spinell|spinel", "lo spinello", "the spinel"], ["granat|garnet", "il granato", "the garnet"],
    ["perl|pearl", "la perla", "the pearl"], ["opal", "l'opale", "the opal"], ["turches|turquoise", "il turchese", "the turquoise"]
  ];
  function isRing(text) { return /anell|fede|trilogy|solitari|\brings?\b|engagement/.test(text); }
  function pickMessage(p, t, lang) {
    if (p.message && String(p.message).trim()) return String(p.message).trim();
    var text = [p.type || "", (p.tags || []).join(" "), p.title || ""].join(" ").toLowerCase();
    function has(re) { return re.test(text); }
    var diamond = has(/diamant|diamond|brillant|brilliant|solitari/), stone = null;
    for (var i = 0; i < STONES.length; i++) if (new RegExp(STONES[i][0]).test(text)) { stone = lang === "it" ? STONES[i][1] : STONES[i][2]; break; }
    function st(s) { return s.replace("{stone}", stone || (lang === "it" ? "la pietra" : "the stone")); }
    if (!p.title) return t.m.generic;
    if (isRing(text)) return stone ? st(t.m.ringStone) : diamond ? t.m.ringDiamond : t.m.ring;
    if (stone) return st(t.m.stone);
    if (diamond) return t.m.diamond;
    if (has(/orecchin|earring|pendenti|hoop|stud/)) return t.m.earrings;
    if (has(/collan|girocoll|pendent|ciondol|necklace|catena|chain/)) return t.m.necklace;
    if (has(/braccial|tennis|bangle|bracelet/)) return t.m.bracelet;
    return t.m.generic;
  }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".medal{all:unset;box-sizing:border-box;position:fixed;z-index:2147483000;" + SIDE + ":calc(20px + env(safe-area-inset-" + SIDE + ",0px));bottom:calc(" + BOTTOM + "px + env(safe-area-inset-bottom,0px));width:78px;height:78px;border-radius:50%;cursor:pointer;background:linear-gradient(140deg,#EDD596 0%,#CBA44F 52%,#A9833A 100%);border:1px solid #8C6A2B;box-shadow:0 10px 26px rgba(120,86,20,.38);display:flex;align-items:center;justify-content:center;transition:transform .2s ease}",
    ".medal:hover{transform:scale(1.04)}",
    ".medal .rt{transform-origin:50px 50px;animation:spin 40s linear infinite}",
    "@keyframes spin{to{transform:rotate(360deg)}}",
    ".on{position:absolute;top:-1px;right:-1px;width:13px;height:13px;border-radius:50%;background:#2E8B5E;border:2px solid #fff}",
    ".badge{position:absolute;top:-4px;left:-4px;min-width:22px;height:22px;border-radius:11px;background:#B4232A;color:#fff;font:600 12px/22px Jost,Helvetica,Arial,sans-serif;text-align:center;padding:0 6px;border:2px solid #fff}",
    ".badge[hidden]{display:none}",
    ".teaser{position:fixed;z-index:2147483000;" + SIDE + ":calc(108px + env(safe-area-inset-" + SIDE + ",0px));bottom:calc(" + BOTTOM + "px + env(safe-area-inset-bottom,0px));width:260px;max-width:calc(100vw - 140px);opacity:0;transform:translateX(" + (SIDE === "right" ? "10px" : "-10px") + ");transition:opacity .35s ease,transform .35s ease;font-family:Jost,'Helvetica Neue',Helvetica,Arial,sans-serif}",
    ".teaser.in{opacity:1;transform:none}",
    ".teaser[hidden]{display:none}",
    ".box{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:flex;flex-direction:column;gap:3px;background:linear-gradient(140deg,#EDD596 0%,#CBA44F 55%,#A9833A 100%);color:#1C1406;border:1px solid #8C6A2B;border-radius:" + (SIDE === "right" ? "16px 16px 4px 16px" : "16px 16px 16px 4px") + ";padding:10px 14px 11px;box-shadow:0 12px 28px rgba(120,86,20,.35);font-family:inherit}",
    ".head{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase}",
    ".dot{width:9px;height:9px;border-radius:50%;background:#1E7A4F;border:1.5px solid #fff;flex:none;animation:pulse 2s ease-out infinite}",
    "@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,139,94,.5)}70%{box-shadow:0 0 0 7px rgba(46,139,94,0)}100%{box-shadow:0 0 0 0 rgba(46,139,94,0)}}",
    ".msg{font-size:14px;line-height:1.35;font-weight:500}",
    ".sig{font-size:11px;color:#47381A}",
    ".x{all:unset;position:absolute;top:-10px;" + (SIDE === "right" ? "left" : "right") + ":-10px;width:26px;height:26px;border-radius:50%;cursor:pointer;background:#1C1406;color:#EDD596;border:1px solid #8C6A2B;font:15px/1 Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(17,24,39,.18)}",
    ".panel{position:fixed;z-index:2147483001;" + SIDE + ":calc(20px + env(safe-area-inset-" + SIDE + ",0px));bottom:calc(" + (BOTTOM + 92) + "px + env(safe-area-inset-bottom,0px));width:400px;height:min(680px,calc(100vh - " + (BOTTOM + 112) + "px));border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 24px 70px -18px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.06);opacity:0;transform:translateY(16px) scale(.98);transform-origin:bottom " + SIDE + ";transition:opacity .25s ease,transform .25s ease;pointer-events:none}",
    ".panel.open{opacity:1;transform:none;pointer-events:auto}",
    ".panel iframe{display:block;width:100%;height:100%;border:0}",
    "@media (max-width:520px){.panel{left:0;right:0;top:0;bottom:0;width:100%;height:100%;border-radius:0}.panel.open ~ .medal,.panel.open ~ .teaser{display:none}}",
    ".medal:focus-visible,.box:focus-visible,.x:focus-visible{outline:2px solid #1C1406;outline-offset:3px}",
    "@media (prefers-reduced-motion:reduce){.teaser,.panel{transition:none}.dot,.medal .rt{animation:none}}"
  ].join("\n");

  function boot(B) {
    var lang = B.lang === "it" ? "it" : "en", t = TX[lang];
    var P = window.AAG_PRODUCT || {};
    var host = document.createElement("div"); host.id = "ask-a-gemologist"; document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML = "<style>" + CSS + "</style>" +
      '<div class="panel" id="panel" role="dialog" aria-modal="false"></div>' +
      '<div class="teaser" id="teaser" hidden><button type="button" class="x" id="x">&times;</button><button type="button" class="box" id="box"><span class="head"><span class="dot"></span><span id="tt"></span></span><span class="msg" id="msg"></span><span class="sig" id="sig"></span></button></div>' +
      '<button type="button" class="medal" id="medal"><svg viewBox="0 0 100 100" width="78" height="78" aria-hidden="true"><defs><path id="rp" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"></path></defs><circle cx="50" cy="50" r="46" fill="none" stroke="#1C1406" stroke-opacity=".35" stroke-width="1"></circle><g class="rt"><text font-family="Jost, Helvetica, Arial, sans-serif" font-size="' + t.ringSize + '" font-weight="600" fill="#1C1406"><textPath href="#rp" textLength="234" lengthAdjust="spacing"></textPath></text></g><circle cx="50" cy="50" r="26" fill="#1C1406"></circle><g transform="translate(38 38)" fill="none" stroke="#EDD596" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8z"></path><path d="M8.5 8.5h7M8.5 11.5h4.5"></path></g></svg><span class="on"></span><span class="badge" id="badge" hidden></span></button>';
    var $ = function (id) { return root.getElementById ? root.getElementById(id) : root.querySelector("#" + id); };
    root.querySelector("textPath").textContent = t.ring;
    $("tt").textContent = t.title; $("sig").textContent = t.sig;
    $("msg").textContent = pickMessage(P, t, lang);
    $("medal").setAttribute("aria-label", t.open); $("x").setAttribute("aria-label", t.close); $("panel").setAttribute("aria-label", t.title);

    var panel = $("panel"), teaser = $("teaser"), frame = null, isOpen = false, unread = 0, prevOverflow = "";
    function frameUrl() {
      var q = new URLSearchParams({ embed: "1", b: SLUG });
      if (P.title) q.set("pt", P.title);
      if (P.price) q.set("pp", P.price);
      if (P.image) q.set("pi", String(P.image).replace(/^\/\//, "https://"));
      q.set("pu", P.url || location.href);
      if (P.title && isRing([P.type || "", (P.tags || []).join(" "), P.title].join(" ").toLowerCase())) q.set("pr", "1");
      return ORIGIN + "/w/?" + q.toString();
    }
    function ensureFrame() {
      if (frame) return;
      frame = document.createElement("iframe"); frame.src = frameUrl(); frame.title = t.title; frame.setAttribute("allow", "clipboard-write");
      panel.appendChild(frame);
    }
    function tell(type, value) { try { frame && frame.contentWindow.postMessage({ aagHost: 1, type: type, value: value }, ORIGIN); } catch (e) {} }
    function hideTeaser() { teaser.classList.remove("in"); setTimeout(function () { teaser.hidden = true; }, 350); }
    function showTeaser(text, sig) {
      if (isOpen) return;
      if (text) $("msg").textContent = text; if (sig) $("sig").textContent = sig;
      teaser.hidden = false; requestAnimationFrame(function () { teaser.classList.add("in"); });
    }
    function open() {
      ensureFrame(); hideTeaser(); isOpen = true; panel.classList.add("open");
      unread = 0; $("badge").hidden = true; tell("visible", true);
      if (window.matchMedia("(max-width:520px)").matches) { prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; }
      try { sessionStorage.setItem("aag-teaser-seen", "1"); } catch (e) {}
    }
    function close() {
      isOpen = false; panel.classList.remove("open"); tell("visible", false);
      document.documentElement.style.overflow = prevOverflow;
      $("medal").focus();
    }
    $("medal").addEventListener("click", function () { isOpen ? close() : open(); });
    $("box").addEventListener("click", open);
    $("x").addEventListener("click", hideTeaser);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) close(); });
    window.addEventListener("message", function (e) {
      if (e.origin !== ORIGIN || !e.data || !e.data.aag) return;
      var d = e.data;
      if (d.type === "close") close();
      if (d.type === "ready") tell("visible", isOpen);
      if (d.type === "unread" && !isOpen) {
        unread++; $("badge").textContent = String(unread); $("badge").hidden = false;
        var s = String(d.text || ""); showTeaser(s.length > 120 ? s.slice(0, 117) + "…" : s, t.replied);
      }
    });

    /* Returning visitor with an open conversation: load the chat in the background, so Elena's replies show up */
    try { if (localStorage.getItem("aag-has-chat-" + SLUG) === "1") ensureFrame(); } catch (e) {}
    window.addEventListener("message", function (e) { if (e.origin === ORIGIN && e.data && e.data.aag && e.data.type === "sent") { try { localStorage.setItem("aag-has-chat-" + SLUG, "1"); } catch (x) {} } });

    /* The message bubble: once per visit, after a few seconds */
    var seenTeaser = false; try { seenTeaser = sessionStorage.getItem("aag-teaser-seen") === "1"; } catch (e) {}
    if (!seenTeaser) setTimeout(function () { if (isOpen) return; try { sessionStorage.setItem("aag-teaser-seen", "1"); } catch (e) {} showTeaser(); }, DELAY * 1000);

    window.AskAGemologist = { open: open, close: close };
  }

  function go() {
    if (!SLUG) { console.warn("Ask a Gemologist: data-brand is missing"); return; }
    fetch(ORIGIN + "/brands/" + SLUG + ".json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(boot).catch(function (e) { console.warn("Ask a Gemologist: brand not found", e); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

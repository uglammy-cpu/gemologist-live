/* THE JEWELER'S WHEEL — pop-up di benvenuto della pagina /join e della home (4 novembre 2026, percorso con account)
 *
 * Script autonomo accanto alla pagina /join e alla home (vetrina).
 * - In home si apre dopo la schermata di benvenuto della prima visita, e anche dal pulsante «Trasmetti con noi»
 *   (window.UQWheel.open). REGISTER & APPLY dalla home porta all'area account di /join.
 * - Il premio lo decide il server (wheel_spin); qui si disegna solo l'animazione.
 * - Modalità "demo": visibile solo con ?wheel=preview, con l'etichetta "demo" ben in vista.
 * - Modalità "live": compare a tutti appena si apre la pagina.
 * - Chiuso il pop-up resta il pulsante YOUR WELCOME GIFT; nella stessa sessione non si riapre da solo.
 * - REGISTER & APPLY porta all'area account della pagina: dopo la registrazione o l'accesso il premio
 *   passa all'account (account_claim_spin) e non si perde più. Lo sconto vale solo per il primo mese
 *   e solo se Uniqaia approva il brand.
 * - Con un account aperto (window.UQAuth) la ruota mostra il premio dell'account da qualunque dispositivo.
 */
(function () {
  "use strict";
  // join: indirizzo della pagina /join (la build lo riscrive con il prefisso del sito)
  var W = { url: "{{URL}}", key: "{{KEY}}", join: "/live/join?lang=" };
  if (!window.fetch || !W.url || /\{\{/.test(W.url)) return;

  // ---------------------------------------------------------------- testi
  // Titoli e pulsanti restano in inglese in tutte le lingue (sono la voce del marchio, come da brief);
  // prezzi, condizioni e spiegazioni seguono la lingua della pagina.
  var BRAND = {
    title: "YOUR EXCLUSIVE WELCOME GIFT",
    spin: "SPIN & DISCOVER",
    congrats: "CONGRATULATIONS!",
    reserved: "YOUR WELCOME OFFER IS RESERVED!",
    apply: "REGISTER & APPLY",
    fab: "YOUR WELCOME GIFT"
  };
  var TX = {
    en: {
      sub: "Discover your special welcome advantage and start showcasing your jewelry to an international audience.",
      close: "Close", wheel: "Prize wheel. Prizes: {list}", spinning: "Spinning…",
      first: "Your first month: {p}", instead: "Instead of {s}.",
      renews: "Your subscription renews at {s}/month from the second month.",
      perkStd: "Your first month is at the standard price of {s}/month.",
      golden_visibility: "7 days of extra visibility in the brands section.",
      golden_promotion: "A personalised promotional reel for your first live, created from our template.",
      golden_spotlight: "Enjoy 7 days of featured visibility for your jewelry brand.",
      res1: "Your welcome discount will be applied to your first monthly subscription, subject to Uniqaia's review and approval of your brand.",
      res1perk: "Your welcome gift will be activated with your first monthly subscription, subject to Uniqaia's review and approval of your brand.",
      res2: "All applications are reviewed within 24 hours.",
      terms1: "Welcome offers are valid for the first month only and are subject to Uniqaia's approval of your brand.",
      terms2: "Standard subscription: {s}/month for {n} live shows of up to {m} minutes each.",
      linked: "Your offer is reserved for your account.",
      confirmed: "Your brand has been approved: the secure payment link is on its way to your inbox.",
      redeemed: "Your welcome offer has been applied to your subscription.",
      demo: "Preview · demo mode · no real prize", again: "Spin again (demo)",
      error: "The welcome gift isn't available right now. Please try again later.", result: "Result: {prize}"
    },
    it: {
      sub: "Scopri il tuo vantaggio di benvenuto e inizia a presentare i tuoi gioielli a un pubblico internazionale.",
      close: "Chiudi", wheel: "Ruota dei premi. Premi: {list}", spinning: "La ruota gira…",
      first: "Il tuo primo mese: {p}", instead: "Invece di {s}.",
      renews: "Dal secondo mese l'abbonamento si rinnova a {s} al mese.",
      perkStd: "Il primo mese è al prezzo standard di {s} al mese.",
      golden_visibility: "7 giorni di visibilità in più nella sezione dedicata ai brand.",
      golden_promotion: "Un reel promozionale personalizzato per la tua prima diretta, creato dal nostro modello.",
      golden_spotlight: "7 giorni in evidenza nella vetrina speciale della home page.",
      res1: "Lo sconto di benvenuto sarà applicato al primo mese di abbonamento, dopo la valutazione e l'approvazione del tuo brand da parte di Uniqaia.",
      res1perk: "Il regalo di benvenuto si attiva con il primo mese di abbonamento, dopo la valutazione e l'approvazione del tuo brand da parte di Uniqaia.",
      res2: "Valutiamo ogni candidatura entro 24 ore.",
      terms1: "Le offerte di benvenuto valgono solo per il primo mese e sono soggette all'approvazione del tuo brand da parte di Uniqaia.",
      terms2: "Abbonamento standard: {s} al mese per {n} dirette fino a {m} minuti ciascuna.",
      linked: "L'offerta è riservata al tuo account.",
      confirmed: "Il tuo brand è stato approvato: il link di pagamento sicuro è in arrivo nella tua casella email.",
      redeemed: "L'offerta di benvenuto è stata applicata al tuo abbonamento.",
      demo: "Anteprima · modalità demo · nessun premio reale", again: "Gira di nuovo (demo)",
      error: "Il regalo di benvenuto non è disponibile in questo momento. Riprova più tardi.", result: "Risultato: {prize}"
    },
    fr: {
      sub: "Découvrez votre avantage de bienvenue et commencez à présenter vos bijoux à un public international.",
      close: "Fermer", wheel: "Roue des cadeaux. Cadeaux : {list}", spinning: "La roue tourne…",
      first: "Votre premier mois : {p}", instead: "Au lieu de {s}.",
      renews: "À partir du deuxième mois, l'abonnement se renouvelle à {s} par mois.",
      perkStd: "Le premier mois est au tarif standard de {s} par mois.",
      golden_visibility: "7 jours de visibilité supplémentaire dans la section des marques.",
      golden_promotion: "Un reel promotionnel personnalisé pour votre premier live, créé à partir de notre modèle.",
      golden_spotlight: "7 jours de mise en avant dans la vitrine spéciale de la page d'accueil.",
      res1: "Votre remise de bienvenue sera appliquée à votre premier mois d'abonnement, sous réserve de l'examen et de l'approbation de votre marque par Uniqaia.",
      res1perk: "Votre cadeau de bienvenue sera activé avec votre premier mois d'abonnement, sous réserve de l'examen et de l'approbation de votre marque par Uniqaia.",
      res2: "Toutes les candidatures sont examinées sous 24 heures.",
      terms1: "Les offres de bienvenue ne valent que pour le premier mois et sont soumises à l'approbation de votre marque par Uniqaia.",
      terms2: "Abonnement standard : {s} par mois pour {n} directs de {m} minutes maximum chacun.",
      linked: "Votre offre est réservée à votre compte.",
      confirmed: "Votre marque a été approuvée : le lien de paiement sécurisé arrive dans votre boîte e-mail.",
      redeemed: "Votre offre de bienvenue a été appliquée à votre abonnement.",
      demo: "Aperçu · mode démo · aucun cadeau réel", again: "Tourner à nouveau (démo)",
      error: "Le cadeau de bienvenue n'est pas disponible pour le moment. Veuillez réessayer plus tard.", result: "Résultat : {prize}"
    },
    ru: {
      sub: "Откройте свой приветственный бонус и начните показывать свои украшения международной аудитории.",
      close: "Закрыть", wheel: "Колесо подарков. Подарки: {list}", spinning: "Колесо вращается…",
      first: "Ваш первый месяц: {p}", instead: "Вместо {s}.",
      renews: "Со второго месяца подписка продлевается по цене {s} в месяц.",
      perkStd: "Первый месяц — по стандартной цене {s} в месяц.",
      golden_visibility: "7 дней дополнительной видимости в разделе брендов.",
      golden_promotion: "Персональный промо-ролик для вашего первого эфира, созданный по нашему шаблону.",
      golden_spotlight: "7 дней в специальной витрине на главной странице.",
      res1: "Приветственная скидка будет применена к первому месяцу подписки после рассмотрения и одобрения вашего бренда командой Uniqaia.",
      res1perk: "Приветственный подарок будет активирован с первым месяцем подписки после рассмотрения и одобрения вашего бренда командой Uniqaia.",
      res2: "Все заявки рассматриваются в течение 24 часов.",
      terms1: "Приветственные предложения действуют только на первый месяц и при условии одобрения вашего бренда командой Uniqaia.",
      terms2: "Стандартная подписка: {s} в месяц за {n} эфира продолжительностью до {m} минут каждый.",
      linked: "Предложение закреплено за вашим аккаунтом.",
      confirmed: "Ваш бренд одобрен: защищённая ссылка на оплату уже отправлена на вашу почту.",
      redeemed: "Приветственное предложение применено к вашей подписке.",
      demo: "Предпросмотр · демо-режим · без реальных подарков", again: "Крутить снова (демо)",
      error: "Приветственный подарок сейчас недоступен. Попробуйте позже.", result: "Результат: {prize}"
    },
    ar: {
      sub: "اكتشف ميزتك الترحيبية الخاصة وابدأ بعرض مجوهراتك أمام جمهور دولي.",
      close: "إغلاق", wheel: "عجلة الهدايا. الهدايا: {list}", spinning: "العجلة تدور…",
      first: "شهرك الأول: {p}", instead: "بدلاً من {s}.",
      renews: "يتجدد اشتراكك بسعر {s} شهريًا ابتداءً من الشهر الثاني.",
      perkStd: "الشهر الأول بالسعر المعتاد {s} شهريًا.",
      golden_visibility: "7 أيام من الظهور الإضافي في قسم العلامات التجارية.",
      golden_promotion: "مقطع ترويجي مخصص لأول بث مباشر لك، يُنشأ من قالبنا.",
      golden_spotlight: "7 أيام من الظهور المميز في واجهة خاصة على الصفحة الرئيسية.",
      res1: "سيُطبَّق خصم الترحيب على الشهر الأول من اشتراكك، بعد مراجعة Uniqaia لعلامتك التجارية والموافقة عليها.",
      res1perk: "ستُفعَّل هديتك الترحيبية مع الشهر الأول من اشتراكك، بعد مراجعة Uniqaia لعلامتك التجارية والموافقة عليها.",
      res2: "نراجع جميع الطلبات خلال 24 ساعة.",
      terms1: "عروض الترحيب صالحة للشهر الأول فقط وتخضع لموافقة Uniqaia على علامتك التجارية.",
      terms2: "الاشتراك المعتاد: {s} شهريًا مقابل {n} بثوث مباشرة تصل مدة كل منها إلى {m} دقيقة.",
      linked: "العرض محجوز لحسابك.",
      confirmed: "تمت الموافقة على علامتك التجارية: رابط الدفع الآمن في طريقه إلى بريدك الإلكتروني.",
      redeemed: "تم تطبيق عرض الترحيب على اشتراكك.",
      demo: "معاينة · وضع تجريبي · لا توجد جوائز حقيقية", again: "أدر العجلة مرة أخرى (تجريبي)",
      error: "الهدية الترحيبية غير متاحة حاليًا. يرجى المحاولة لاحقًا.", result: "النتيجة: {prize}"
    }
  };
  function lang() { var l = (document.documentElement.lang || "it").slice(0, 2).toLowerCase(); return TX[l] ? l : "en"; }
  function tx(k, v) { var s = TX[lang()][k] || TX.en[k] || ""; return s.replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; }); }
  function eur(c) {
    var l = lang(), loc = l === "ar" ? "ar-AE-u-nu-latn" : l;
    try { return new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(c / 100); }
    catch (e) { return "€" + (c / 100); }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------------------------------------------------------------- memoria del browser
  function store(kind) { try { var s = window[kind]; s.setItem("uqw-t", "1"); s.removeItem("uqw-t"); return s; } catch (e) { return null; } }
  var LS = store("localStorage"), SS = store("sessionStorage"), MEM = {};
  function get(s, k) { return s ? s.getItem(k) : MEM[k] || null; }
  function set(s, k, v) { if (s) { try { s.setItem(k, v); } catch (e) {} } else MEM[k] = v; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function device() { var d = get(LS, "uqw-device"); if (!d) { d = uuid(); set(LS, "uqw-device", d); } return d; }
  function session() { var s = get(SS, "uqw-session"); if (!s) { s = uuid(); set(SS, "uqw-session", s); } return s; }
  var Q = new URLSearchParams(location.search);
  if (Q.get("wheel") === "preview") set(SS, "uqw-preview", "1");
  var preview = get(SS, "uqw-preview") === "1";

  // ---------------------------------------------------------------- server
  function bearer() { return window.UQAuth && UQAuth.fresh ? UQAuth.fresh().catch(function () { return null; }) : Promise.resolve(null); }
  function rpc(fn, body, keep) {
    return bearer().then(function (tok) {
      return fetch(W.url + "/rest/v1/rpc/" + fn, {
        method: "POST", keepalive: !!keep,
        headers: { "Content-Type": "application/json", apikey: W.key, Authorization: "Bearer " + (tok || W.key) },
        body: JSON.stringify(body)
      });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || r.status); return j; }); });
  }
  function track(ev) { rpc("wheel_track", { p_session: session(), p_device: device(), p_event: ev, p_lang: lang() }, true).catch(function () {}); }

  // ---------------------------------------------------------------- stato
  var S = { mode: "off", prizes: [], spin: null, std: 14900, lives: 4, maxMin: 60, open: false, view: "wheel", spinning: false, rot: 0, interacted: false };
  var els = {};

  // ---------------------------------------------------------------- stile
  var CSS = [
    ".uqw-scrim{position:fixed;inset:0;z-index:80;background:rgba(22,18,12,.46);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:12px;opacity:0;transition:opacity .28s ease}",
    ".uqw-scrim.on{opacity:1}",
    ".uqw-card{position:relative;width:min(100%,430px);max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;background:#FFFDF8;color:var(--ink,#16181D);border-radius:20px;box-shadow:0 24px 70px rgba(28,20,6,.28),0 0 0 1px rgba(203,164,79,.35);padding:30px 22px 22px;text-align:center;font-family:var(--body,'Jost',system-ui,sans-serif);transform:translateY(10px) scale(.98);transition:transform .32s cubic-bezier(.2,.7,.2,1)}",
    ".uqw-scrim.on .uqw-card{transform:none}",
    ".uqw-card::before{content:'';position:absolute;inset:7px;border:1px solid rgba(203,164,79,.32);border-radius:15px;pointer-events:none}",
    ".uqw-x{position:absolute;top:8px;inset-inline-end:8px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;display:grid;place-items:center;color:var(--ink,#16181D);z-index:2}",
    ".uqw-x:hover{background:rgba(203,164,79,.14)}",
    ".uqw-x svg{width:18px;height:18px}",
    ".uqw-demo{display:inline-block;margin:0 44px 12px;padding:4px 12px;border-radius:999px;background:#16181D;color:#EDD596;font-size:10.5px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase}",
    ".uqw-card:focus{outline:none}",
    ".uqw-eyebrow{font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-edge,#8C6A2B);font-weight:500;margin:0}",
    ".uqw-h{font-family:var(--display,'Bodoni Moda',Didot,Georgia,serif);font-weight:400;font-size:clamp(21px,5.6vw,26px);line-height:1.15;letter-spacing:.06em;margin:6px 0 8px;padding:0 26px}",
    ".uqw-sub{font-size:14px;line-height:1.5;color:var(--muted,#5B606A);font-style:italic;margin:0 auto;max-width:34ch}",
    ".uqw-stage{position:relative;width:min(70vw,290px,40dvh);aspect-ratio:1;margin:16px auto 16px}",
    ".uqw-rot{position:absolute;inset:0;will-change:transform}",
    ".uqw-rot svg,.uqw-pin svg{display:block;width:100%;height:100%;overflow:visible}",
    ".uqw-pin{position:absolute;left:50%;top:-6%;width:13%;height:17%;transform:translateX(-50%);filter:drop-shadow(0 2px 3px rgba(28,20,6,.35));z-index:1}",
    ".uqw-rot text{font-family:var(--display,'Bodoni Moda',Didot,Georgia,serif);fill:#1C1406}",
    ".uqw-rot text.s{font-family:var(--body,'Jost',system-ui,sans-serif);font-size:8.6px;letter-spacing:.16em;fill:#8C6A2B;font-weight:500}",
    ".uqw-rot .win{fill:#F3DFA9}",
    ".uqw-btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 28px;border-radius:999px;border:1px solid #1C1406;background:#1C1406;color:#EDD596;font:500 14px/1 var(--body,'Jost',system-ui,sans-serif);letter-spacing:.16em;text-transform:uppercase;cursor:pointer;width:100%;max-width:320px;transition:background .2s,color .2s,transform .1s}",
    ".uqw-btn:hover{background:#2a2010}",
    ".uqw-btn:active{transform:scale(.99)}",
    ".uqw-btn:disabled{opacity:.6;cursor:default}",
    ".uqw-btn:focus-visible,.uqw-x:focus-visible,.uqw-fab:focus-visible,.uqw-link:focus-visible{outline:2px solid #8C6A2B;outline-offset:3px}",
    ".uqw-prize{margin:18px auto 16px;max-width:340px;border:1px solid #EDD596;background:linear-gradient(180deg,#FBF3E0,#F8F1DF);border-radius:14px;padding:16px 16px 14px}",
    ".uqw-prize .n{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8C6A2B;margin:0 0 6px}",
    ".uqw-prize .p{font-family:var(--display,'Bodoni Moda',Didot,Georgia,serif);font-size:clamp(22px,6vw,27px);line-height:1.15;color:#1C1406;margin:0 0 8px}",
    ".uqw-prize .l{font-size:13.5px;line-height:1.5;color:#3b3a36;margin:0}",
    ".uqw-prize .l + .l{margin-top:2px}",
    ".uqw-fine{font-size:12px;line-height:1.45;color:var(--muted,#5B606A);margin:12px auto 0;max-width:38ch}",
    ".uqw-terms{font-size:12px;line-height:1.45;color:#4a4740;margin:12px auto 0;max-width:40ch}",
    ".uqw-terms p{margin:0}",
    ".uqw-terms p + p{margin-top:3px}",
    ".uqw-res{font-size:13.5px;line-height:1.5;color:#2b2a26;margin:0 auto 14px;max-width:38ch}",
    ".uqw-res p{margin:0}",
    ".uqw-res p + p{margin-top:4px;color:#8C6A2B}",
    ".uqw-note{font-size:13.5px;line-height:1.45;margin:4px auto 0;color:#1E7A4F;max-width:34ch}",
    ".uqw-link{display:inline-block;margin-top:10px;background:none;border:0;color:#8C6A2B;text-decoration:underline;font-size:12.5px;cursor:pointer;padding:6px}",
    ".uqw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".uqw-in{animation:uqwIn .45s ease both}",
    "@keyframes uqwIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    ".uqw-fab{position:fixed;z-index:60;bottom:calc(16px + env(safe-area-inset-bottom,0px));right:max(16px,env(safe-area-inset-right,0px));display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px 0 13px;border-radius:999px;border:1px solid #CBA44F;background:#FFFDF8;color:#1C1406;box-shadow:0 6px 20px rgba(28,20,6,.16);font:500 11.5px/1 var(--body,'Jost',system-ui,sans-serif);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:opacity .25s,transform .25s}",
    "[dir=rtl] .uqw-fab{right:auto;left:max(16px,env(safe-area-inset-left,0px))}",
    ".uqw-fab svg{width:18px;height:18px;flex:none}",
    ".uqw-fab.off{opacity:0;transform:translateY(12px);pointer-events:none}",
    "html.uqw-lock,html.uqw-lock body{overflow:hidden}",
    "@media (max-width:380px){.uqw-card{padding:26px 16px 18px}.uqw-h{padding:0 30px}}",
    "@media (prefers-reduced-motion:reduce){.uqw-scrim,.uqw-card,.uqw-fab{transition:none}.uqw-in{animation:none}}"
  ].join("\n");

  var GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M12 3.5 15.5 8 12 20.5 8.5 8z" stroke="#A9833A"/><path d="M5 8h14l-7 12.5z" stroke="#A9833A"/><path d="M8.5 3.5h7L19 8H5z" fill="#F8F1DF" stroke="#A9833A"/><circle cx="12" cy="9.6" r="1.6" fill="#D43F52" stroke="none"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  // ---------------------------------------------------------------- disegno della ruota
  function labels(p) {
    if (p.kind === "discount") return { s: p.name.replace(/\s*welcome\s*$/i, "").toUpperCase(), b: eur(p.first_month_cents), big: true };
    var w = p.name.split(/\s+/); return { s: (w.shift() || "").toUpperCase(), b: w.join(" ").toUpperCase(), big: false };
  }
  function wheelSVG() {
    var n = S.prizes.length, seg = 360 / n, R = 146, out = [];
    function pt(r, a) { var t = (a - 90) * Math.PI / 180; return (r * Math.cos(t)).toFixed(2) + " " + (r * Math.sin(t)).toFixed(2); }
    out.push('<svg viewBox="-160 -160 320 320" aria-hidden="true"><defs>' +
      '<linearGradient id="uqwG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDD596"/><stop offset=".55" stop-color="#CBA44F"/><stop offset="1" stop-color="#A9833A"/></linearGradient>' +
      '<radialGradient id="uqwH" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#F6EEDB"/></radialGradient></defs>');
    out.push('<circle r="157" fill="url(#uqwG)"/><circle r="' + (R + 1) + '" fill="#8C6A2B"/>');
    var tones = ["#FFFDF8", "#F6ECD6"];
    for (var i = 0; i < n; i++) {
      var a0 = i * seg, a1 = a0 + seg, fill = tones[i % 2];
      if (n % 2 && i === n - 1) fill = "#FBF4E4";
      // un solo premio: disco intero (un arco da 360° non si disegna), con la scritta in alto
      if (n === 1) out.push('<circle data-i="0" r="' + R + '" fill="' + fill + '"/>');
      else out.push('<path data-i="' + i + '" d="M0 0 L' + pt(R, a0) + ' A' + R + ' ' + R + ' 0 ' + (seg > 180 ? 1 : 0) + ' 1 ' + pt(R, a1) + ' Z" fill="' + fill + '" stroke="#CBA44F" stroke-width=".8"/>');
      var L = labels(S.prizes[i]), mid = n === 1 ? 0 : a0 + seg / 2;
      out.push('<g transform="rotate(' + mid.toFixed(2) + ')"><text class="s" x="0" y="-116" text-anchor="middle">' + esc(L.s) + '</text>' +
        '<text x="0" y="' + (L.big ? -86 : -92) + '" text-anchor="middle" font-size="' + (L.big ? 23 : 12.5) + '"' + (L.big ? '' : ' letter-spacing="1.2"') + '>' + esc(L.b) + '</text></g>');
    }
    for (var k = 0; k < 36; k++) out.push('<circle cx="' + pt(152, k * 10).split(" ")[0] + '" cy="' + pt(152, k * 10).split(" ")[1] + '" r="1.9" fill="#FFF8E6" stroke="#A9833A" stroke-width=".5"/>');
    out.push('<circle r="34" fill="url(#uqwG)"/><circle r="27.5" fill="url(#uqwH)"/><circle r="9" fill="#D43F52"/><circle cx="-2.6" cy="-3" r="2.6" fill="#fff" opacity=".55"/></svg>');
    return out.join("");
  }
  var PIN = '<svg viewBox="-14 -16 28 48" aria-hidden="true"><path d="M0 30 L-11.5 4 A12.6 12.6 0 1 1 11.5 4 Z" fill="url(#uqwP)" stroke="#8C6A2B" stroke-width=".8"/><defs><linearGradient id="uqwP" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDD596"/><stop offset=".6" stop-color="#CBA44F"/><stop offset="1" stop-color="#A9833A"/></linearGradient></defs><circle cy="-2" r="4.2" fill="#D43F52"/><circle cx="-1.3" cy="-3.4" r="1.3" fill="#fff" opacity=".6"/></svg>';

  function setRot(a) { S.rot = a; if (els.rot) els.rot.style.transform = "rotate(" + a.toFixed(3) + "deg)"; }
  function mod(a, m) { return ((a % m) + m) % m; }
  function landing(idx) {
    var seg = 360 / S.prizes.length, jitter = (Math.random() - .5) * seg * .6;
    return mod(360 - ((idx + .5) * seg + jitter), 360);
  }

  // Accelera (0,5 s), gira a velocità costante finché serve per allinearsi, poi rallenta (2,4 s)
  // fino a fermarsi esattamente sul premio deciso dal server: circa tre secondi in tutto.
  function animate(result, done) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { result.then(function (i) { if (i >= 0) setRot(landing(i)); done(); }, function () { done(); }); return; }
    var t0 = performance.now(), Ta = 500, Td = 2400, v = .9, a = v / Ta, start = S.rot, target = null, plan = null;
    result.then(function (i) { target = i; }, function () { target = -1; });
    function cruise(t) { return t <= Ta ? start + .5 * a * t * t : start + .5 * a * Ta * Ta + v * (t - Ta); }
    function frame(now) {
      var t = now - t0, ang;
      if (!plan) {
        ang = cruise(t);
        if (target !== null && t >= Ta) {
          var Dd = target >= 0 ? v * Td / 3 : v * 900 / 3, T = target >= 0 ? Td : 900;
          var extra = target >= 0 ? mod(landing(target) - (ang + Dd), 360) : 0;
          plan = { t1: t + extra / v, a1: ang + extra, D: Dd, T: T };
        }
      } else if (t < plan.t1) {
        ang = cruise(t);
      } else {
        var u = Math.min(1, (t - plan.t1) / plan.T);
        ang = plan.a1 + plan.D * (1 - Math.pow(1 - u, 3));
        setRot(ang);
        if (u >= 1) { done(); return; }
        requestAnimationFrame(frame); return;
      }
      setRot(ang);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- viste
  function prizeIndex(code) { for (var i = 0; i < S.prizes.length; i++) if (S.prizes[i].code === code) return i; return -1; }
  function demoTag() { return S.mode === "demo" ? '<p class="uqw-demo">' + esc(tx("demo")) + "</p>" : ""; }

  function termsBlock() {
    return '<div class="uqw-terms"><p>' + esc(tx("terms1")) + "</p><p>" + esc(tx("terms2", { s: eur(S.std), n: S.lives, m: S.maxMin })) + "</p></div>";
  }

  function viewWheel() {
    var names = S.prizes.map(function (p) { return p.name; }).join(", ");
    els.body.innerHTML = demoTag() +
      '<p class="uqw-h" id="uqw-title">' + esc(BRAND.title) + "</p>" +
      '<p class="uqw-sub">' + esc(tx("sub")) + "</p>" +
      '<div class="uqw-stage" dir="ltr" role="img" aria-label="' + esc(tx("wheel", { list: names })) + '"><div class="uqw-rot">' + wheelSVG() + '</div><div class="uqw-pin">' + PIN + "</div></div>" +
      '<button type="button" class="uqw-btn" id="uqw-spin">' + esc(BRAND.spin) + "</button>" + termsBlock();
    els.rot = els.body.querySelector(".uqw-rot"); setRot(S.rot);
    els.body.querySelector("#uqw-spin").addEventListener("click", spin);
  }

  function viewResult(fresh) {
    var s = S.spin, l = [], std = eur(S.std);
    if (s.kind === "discount") {
      l.push('<p class="p">' + esc(tx("first", { p: eur(s.first_month_cents) })) + "</p>");
      l.push('<p class="l">' + esc(tx("instead", { s: std })) + "</p>");
      l.push('<p class="l">' + esc(tx("renews", { s: std })) + "</p>");
    } else {
      l.push('<p class="p">' + esc(s.prize_name) + "</p>");
      l.push('<p class="l">' + esc(tx(s.prize_code)) + "</p>");
      l.push('<p class="l">' + esc(tx("perkStd", { s: std })) + "</p>");
    }
    var st = s.status, foot = "";
    if (st === "provisional" || st === "linked") {
      foot = '<div class="uqw-res"><p>' + esc(tx(s.kind === "discount" ? "res1" : "res1perk")) + "</p><p>" + esc(tx("res2")) + "</p></div>" +
        (st === "linked" ? '<p class="uqw-note">' + esc(tx("linked")) + "</p>" : "") +
        '<button type="button" class="uqw-btn" id="uqw-apply">' + esc(BRAND.apply) + "</button>";
    } else {
      foot = '<p class="uqw-note">' + esc(tx(st === "confirmed" ? "confirmed" : "redeemed")) + "</p>";
    }
    foot += termsBlock();
    if (S.mode === "demo") foot += '<button type="button" class="uqw-link" id="uqw-again">' + esc(tx("again")) + "</button>";
    els.body.innerHTML = demoTag() +
      '<div class="' + (fresh ? "uqw-in" : "") + '"><p class="uqw-eyebrow">' + esc(BRAND.congrats) + "</p>" +
      '<p class="uqw-h" id="uqw-title">' + esc(BRAND.reserved) + "</p>" +
      '<div class="uqw-prize">' + (s.kind === "discount" ? '<p class="n">' + esc(s.prize_name) + "</p>" : "") + l.join("") + "</div>" + foot + "</div>";
    els.rot = null;
    var c = els.body.querySelector("#uqw-apply"); if (c) c.addEventListener("click", apply);
    var g = els.body.querySelector("#uqw-again"); if (g) g.addEventListener("click", again);
    if (fresh) els.live.textContent = tx("result", { prize: s.prize_name });
    if (fresh && S.open) { var f = els.body.querySelector("#uqw-apply") || els.x; f.focus({ preventScroll: true }); }
  }

  function viewError() {
    els.body.innerHTML = demoTag() + '<p class="uqw-h" id="uqw-title">' + esc(BRAND.title) + '</p><p class="uqw-sub" style="font-style:normal">' + esc(tx("error")) + "</p>";
    els.rot = null;
  }

  function render() {
    if (!els.body) return;
    if (S.view === "result" && S.spin) viewResult(false);
    else if (S.view === "error") viewError();
    else if (!S.spinning) viewWheel();
  }

  // ---------------------------------------------------------------- azioni
  function spin() {
    if (S.spinning || S.spin) return;
    S.spinning = true; S.interacted = true; track("spin_click");
    var b = els.body.querySelector("#uqw-spin"); b.disabled = true; b.textContent = tx("spinning");
    var res = rpc("wheel_spin", { p_device: device(), p_session: session(), p_lang: lang() }).then(function (sp) {
      S.spin = sp; var i = prizeIndex(sp.prize_code); return i;
    });
    animate(res, function () {
      res.then(function (i) {
        S.spinning = false;
        var path = els.rot && els.rot.querySelector('[data-i="' + i + '"]'); if (path) path.classList.add("win");
        setTimeout(function () { S.view = "result"; viewResult(true); track("prize_shown"); syncFab(); changed(); }, path ? 650 : 0);
      }, function () { S.spinning = false; S.view = "error"; viewError(); });
    });
  }

  function again() {
    // solo in demo: nuovo dispositivo, nuovo giro, per provare gli esiti
    if (S.mode !== "demo") return;
    set(LS, "uqw-device", uuid()); S.spin = null; S.view = "wheel"; S.rot = 0; render(); changed();
    var b = els.body.querySelector("#uqw-spin"); if (b) b.focus();
  }

  // REGISTER & APPLY: si chiude il pop-up e si va all'area account della pagina (registrazione, accesso o candidatura)
  function apply() {
    track("claim_click"); close(true);
    var box = document.getElementById("acct");
    // fuori da /join (per esempio dalla home) si va all'area account della pagina /join
    if (!box) { location.href = W.join + lang() + "#acct"; return; }
    var top = box.getBoundingClientRect().top + window.pageYOffset - 12;
    window.scrollTo({ top: top, behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(function () { var f = box.querySelector("input:not([type=hidden]):not([disabled]),select,textarea,button.btn"); if (f) f.focus({ preventScroll: true }); }, 450);
  }

  // ---------------------------------------------------------------- pop-up
  function build() {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var fab = document.createElement("button"); fab.type = "button"; fab.className = "uqw-fab off"; fab.setAttribute("aria-haspopup", "dialog");
    fab.innerHTML = GIFT + "<span>" + esc(BRAND.fab) + "</span>"; fab.addEventListener("click", function () { track("gift_button"); open(); });
    document.body.appendChild(fab); els.fab = fab;
    // il pulsante si fa da parte quando l'invio del modulo è a portata di dito
    if ("IntersectionObserver" in window) {
      els.io = new IntersectionObserver(function (es) { es.forEach(function (e) { S.hideFab = e.isIntersecting; }); syncFab(); }, { rootMargin: "0px 0px -0px 0px", threshold: 0 });
      watchSubmit();
    }
  }
  function watchSubmit() { if (!els.io) return; els.io.disconnect(); S.hideFab = false; Array.prototype.forEach.call(document.querySelectorAll('form [type="submit"], form .submit'), function (b) { els.io.observe(b); }); }

  function open(auto) {
    if (S.open) return;
    S.open = true; S.view = S.spin ? "result" : "wheel";
    els.last = document.activeElement;
    var sc = document.createElement("div"); sc.className = "uqw-scrim";
    sc.innerHTML = '<div class="uqw-card" role="dialog" aria-modal="true" aria-labelledby="uqw-title" tabindex="-1"><button type="button" class="uqw-x" aria-label="' + esc(tx("close")) + '">' + CLOSE + '</button><div class="uqw-body"></div><p class="uqw-sr" aria-live="polite"></p></div>';
    document.body.appendChild(sc);
    els.scrim = sc; els.card = sc.firstChild; els.x = sc.querySelector(".uqw-x"); els.body = sc.querySelector(".uqw-body"); els.live = sc.querySelector(".uqw-sr");
    els.x.addEventListener("click", function () { close(); });
    sc.addEventListener("mousedown", function (e) { if (e.target === sc && !S.spinning) close(); });
    document.addEventListener("keydown", onKey, true);
    document.documentElement.classList.add("uqw-lock");
    render(); syncFab();
    requestAnimationFrame(function () { sc.classList.add("on"); });
    els.card.focus({ preventScroll: true });
    track("popup_view");
  }

  function close(claimed) {
    if (!S.open) return;
    if (S.spinning) return;
    if (!S.interacted && !S.spin && !claimed) track("close_no_spin");
    S.open = false; set(SS, "uqw-closed", "1");
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.classList.remove("uqw-lock");
    var sc = els.scrim; els.scrim = els.body = els.rot = null;
    sc.classList.remove("on"); setTimeout(function () { if (sc.parentNode) sc.parentNode.removeChild(sc); }, 260);
    syncFab();
    if (!claimed && els.fab && !els.fab.classList.contains("off")) els.fab.focus({ preventScroll: true });
    else if (!claimed && els.last && els.last.focus) els.last.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!S.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      var f = Array.prototype.filter.call(els.card.querySelectorAll("button:not([disabled]),a[href]"), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (i < 0) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); return; }
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function syncFab() {
    if (!els.fab) return;
    var dead = S.spin && (S.spin.status === "void" || S.spin.status === "redeemed");
    var show = !S.open && !dead && !S.hideFab;
    els.fab.classList.toggle("off", !show);
    els.fab.tabIndex = show ? 0 : -1;
    els.fab.setAttribute("aria-hidden", show ? "false" : "true");
  }

  // ---------------------------------------------------------------- dialogo con la pagina
  // La pagina /join legge lo stato della ruota (premio del dispositivo prima della registrazione)
  // e avvisa quando si entra o si esce dall'account: allora la ruota ricarica il premio dell'account.
  function changed() { try { document.dispatchEvent(new CustomEvent("uqw:change")); } catch (e) {} }
  window.UQWheel = {
    state: function () { return { mode: S.mode, spin: S.spin, std: S.std, lives: S.lives, maxMin: S.maxMin }; },
    device: device,
    open: function () { if (S.mode !== "off") open(); }
  };
  function reload() {
    return rpc("wheel_state", { p_device: device() }).then(function (st) {
      if (!st || st.mode === "off") return;
      S.spin = st.spin || null; if (S.open && !S.spinning) { S.view = S.spin ? "result" : "wheel"; render(); }
      syncFab(); changed();
    }).catch(function () {});
  }
  document.addEventListener("uqauth:change", reload);

  function observe() {
    // il tasto di invio del modulo cambia quando la pagina si ridisegna: il pulsante flottante lo segue
    var page = document.querySelector("main") || document.body, t = null;
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { watchSubmit(); syncFab(); }, 60); }).observe(page, { childList: true, subtree: true });
    new MutationObserver(function () {
      if (els.x) els.x.setAttribute("aria-label", tx("close"));
      if (S.open && !S.spinning) render();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }

  // ---------------------------------------------------------------- avvio: subito, senza ritardi
  rpc("wheel_state", { p_device: device() }).then(function (st) {
    if (!st || st.mode === "off" || (st.mode === "demo" && !preview) || !st.prizes || !st.prizes.length) return;
    S.mode = st.mode; S.prizes = st.prizes; S.spin = st.spin || null;
    S.std = st.standard_cents || 14900; S.lives = st.lives_per_month || 4; S.maxMin = st.live_max_min || 60;
    build(); observe(); changed();
    var dead = S.spin && (S.spin.status === "void" || S.spin.status === "redeemed");
    // chiuso in questa sessione: non si riapre da solo; nuova sessione: si riapre, con il premio già assegnato
    function auto() { if (get(SS, "uqw-closed") !== "1" && !dead && !/#acct$/.test(location.hash)) open(true); else syncFab(); }
    // in home, alla prima visita, c'è la schermata di benvenuto: la ruota si apre quando la si chiude
    var wl = document.getElementById("welcome");
    // se il benvenuto non compare entro 4 secondi (per esempio un servizio esterno lento), la ruota si apre lo stesso
    if (wl && get(LS, "vetrina-welcomed") !== "1") {
      var t0 = Date.now(), seen = false;
      var iv = setInterval(function () {
        if (!wl.hidden && wl.innerHTML) seen = true;
        if (get(LS, "vetrina-welcomed") === "1" || (seen && wl.hidden) || (!seen && Date.now() - t0 > 4000)) { clearInterval(iv); auto(); }
      }, 400);
    } else auto();
  }).catch(function () {});
})();

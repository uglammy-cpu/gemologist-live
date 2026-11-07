// Genera le pagine statiche della piattaforma Uniqaia dai modelli in _src/tpl, in due versioni:
//   1. /show/…   sul sito live.gemsandjewelrytechlab.com (GitHub Pages di questo repository)
//   2. /uniqaia/ pronta per il dominio uniqaia.com (Cloudflare Pages con cartella di output "uniqaia", oppure un repository a sé)
// Uso:  node show/_src/build.mjs            usa i dati salvati in _src/data.json
//       node show/_src/build.mjs --fetch    prima scarica i dati pubblici da Supabase (venditori, dirette, pezzi, foto) e li salva
// Le pagine di ogni diretta e la vetrina vengono generate con il contenuto già nell'HTML (condivisione social, motori di ricerca);
// il JavaScript poi le tiene aggiornate in tempo reale.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..", "..");         // radice del repository
// Vetrina dimostrativa: gioiellieri, dirette e prezzi sono di esempio.
// Al lancio con i gioiellieri veri: mettere DEMO = false (toglie noindex, riapre robots.txt e nasconde la riga in fondo alle pagine).
const DEMO = true;
const DEMO_META = DEMO ? '<meta name="robots" content="noindex,nofollow">' : "";
const DEMO_NOTE = DEMO ? '<p class="demo"><b>Demo</b><span data-t="demoNote">Vetrina dimostrativa: gioiellieri, dirette e prezzi sono esempi. Le dirette vere partono con i gioiellieri selezionati.</span></p>' : "";

const common = {
  SUPABASE_URL: "https://itoxzepuukyvdxxtfetf.supabase.co",
  SUPABASE_KEY: "sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk",
  TOKEN_BASE: "https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/live",
  NAME: "Uniqaia",
};
const TARGETS = [
  { out: path.join(ROOT, "show"), notFound: path.join(ROOT, "404.html"), site: "https://live.gemsandjewelrytechlab.com", prefix: "/show" },
  { out: path.join(ROOT, "uniqaia"), notFound: path.join(ROOT, "uniqaia", "404.html"), site: "https://uniqaia.com", prefix: "" },
];
const LOC = { it: "it-IT", en: "en-GB", fr: "fr-FR", ar: "ar-AE-u-nu-latn", ru: "ru-RU" };

const tpl = (n) => fs.readFileSync(path.join(HERE, "tpl", n), "utf8");
const parts = { HEAD: tpl("head.txt"), CSS: tpl("css.txt"), LKJS: tpl("lkjs.txt"), ART: tpl("art.txt"), T: tpl("t.txt"),
  // restyling «V2»: caratteri e blocco della home (restyle.txt), estensioni per le altre pagine pubbliche e per la diretta
  FONTS: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Manrope:wght@600..800&family=Source+Serif+4:ital,wght@0,600;1,400&display=swap">',
  RESTYLE: tpl("restyle.txt"), RESTYLE_PAGINE: tpl("restyle-pagine.txt"), RESTYLE_DIRETTA: tpl("restyle-diretta.txt"),
  // The Jeweler's Wheel: pop-up di benvenuto della pagina /join (script autonomo, vedi wheel.js)
  WHEEL: fs.readFileSync(path.join(HERE, "wheel.js"), "utf8"),
  // Avatar di Elena che spiega l'ingresso nella pagina /join (vedi avatar.js); i testi stanno in avatar-copione.json,
  // le misure dell'immagine in avatar-geometria.json (lo scrive ops/avatar/prepara-livelli.py) e, per la figura a mani
  // libere, in avatar-geometria-libera.json (ops/avatar/prepara-livelli-libera.py)
  AVATAR: fs.readFileSync(path.join(HERE, "avatar.js"), "utf8").replace("/*COPIONE*/{}", () => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, "avatar-copione.json"), "utf8"))).filter(([k]) => !k.startsWith("_")))))
    .replace("/*GEOMETRIA*/null", () => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, "avatar-geometria.json"), "utf8"))).filter(([k]) => !k.startsWith("_")))))
    // seconda figura, a mani libere (ops/avatar/prepara-livelli-libera.py)
    .replace("/*GEOMETRIA_LIBERA*/null", () => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, "avatar-geometria-libera.json"), "utf8"))).filter(([k]) => !k.startsWith("_"))))) };
const ART = JSON.parse(parts.ART), T = JSON.parse(parts.T);
const { landingBody } = createRequire(import.meta.url)("./landing-body.js");
const LANDING_JS = fs.readFileSync(path.join(HERE, "landing-body.js"), "utf8").replace(/if \(typeof module[^\n]*\n?/, "");
const esc = (s) => s.replace(/[/.]/g, "\\$&"); // per le espressioni regolari nel JS generato
const H = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- dati pubblici (snapshot in _src/data.json)
const DATA_FILE = path.join(HERE, "data.json");
async function fetchData() {
  const get = async (q) => {
    const r = await fetch(common.SUPABASE_URL + "/rest/v1/" + q, { headers: { apikey: common.SUPABASE_KEY, Authorization: "Bearer " + common.SUPABASE_KEY } });
    if (!r.ok) throw new Error(q + ": " + r.status + " " + (await r.text()));
    return r.json();
  };
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const data = {
    jewelers: await get("jewelers?select=id,slug,name,city,country,kind,tagline,tagline_i18n,categories,website,shop_url&is_public=eq.true&order=created_at"),
    categories: await get("categories?select=slug,position,name_i18n,art&active=eq.true&order=position"),
    shows: await get("shows?select=id,jeweler_id,slug,title,title_i18n,description_i18n,description,scheduled_at,status,lang,likes,categories,price_range,current_piece_id&visibility=eq.public&scheduled_at=gte." + since + "&order=scheduled_at.desc&limit=400"),
    pieces: await get("pieces?select=id,show_id,position,name,name_i18n,caption,caption_i18n,short,art,price_cents,currency,buy_url&order=position"),
    covers: await get("show_covers?select=show_id,data"),
    photos: await get("piece_photos?select=piece_id,data"),
    highlights: await get("highlights?select=id,position,title_i18n,subtitle_i18n,link,image,video_url&order=position"),
    // Dichiarazioni del venditore: vanno mostrate accanto al gioiello, attribuite a lui.
    declarations: await get("piece_declaration_current?select=piece_id,stones,treatments,origin,metal,certificate"),
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  console.log("dati scaricati:", data.jewelers.length, "venditori,", data.shows.length, "dirette,", data.pieces.length, "pezzi,", data.photos.length, "foto");
  return data;
}
let DATA = { jewelers: [], categories: [], shows: [], pieces: [], covers: [], photos: [], highlights: [], declarations: [] };
if (process.argv.includes("--fetch")) DATA = await fetchData();
else if (fs.existsSync(DATA_FILE)) DATA = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const sellers = DATA.jewelers.map((j) => j.slug).filter((s) => /^[a-z0-9-]{2,40}$/.test(s));
// categorie attive per il modulo di candidatura (solo slug e nomi)
parts.CATS = JSON.stringify((DATA.categories || []).map((c) => ({ slug: c.slug, name_i18n: c.name_i18n })));
const jById = Object.fromEntries(DATA.jewelers.map((j) => [j.id, j]));
const piecesByShow = {}; for (const p of DATA.pieces) (piecesByShow[p.show_id] = piecesByShow[p.show_id] || []).push(p);
const coverByShow = Object.fromEntries(DATA.covers.map((c) => [c.show_id, c.data]));
const photoByPiece = Object.fromEntries(DATA.photos.map((p) => [p.piece_id, p.data]));

// Immagini da base64 a file (copertine delle dirette e foto dei pezzi), nella cartella img condivisa
const IMG = path.join(ROOT, "show", "img");
function writeImage(sub, id, dataUrl) {
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl || ""); if (!m) return null;
  fs.mkdirSync(path.join(IMG, sub), { recursive: true });
  const rel = sub + "/" + id + ".jpg"; fs.writeFileSync(path.join(IMG, rel), Buffer.from(m[1], "base64"));
  return rel;
}
const coverFile = {}; for (const [id, d] of Object.entries(coverByShow)) { const f = writeImage("shows", id, d); if (f) coverFile[id] = f; }
function coverSrc(t, P, id) { return coverFile[id] ? `${t.site}${P}/img/${coverFile[id]}` : (/^https?:/.test(coverByShow[id] || "") ? coverByShow[id] : ""); }
const photoFile = {}; for (const [id, d] of Object.entries(photoByPiece)) { const f = writeImage("pieces", id, d); if (f) photoFile[id] = f; }
const hlFile = {}; for (const h of (DATA.highlights || [])) { if (h.image) { const f = writeImage("slides", h.id, h.image); if (f) hlFile[h.id] = f; } }

function render(t, name, runtime) {
  const cfg = { ...common, SITE: t.site };
  const P = t.prefix; // "" oppure "/show"
  const OG = {
    vetrina: { title: "Uniqaia · Fine jewelry & gemstones · Live", desc: "Dirette di gioiellerie e gem dealer selezionati. Gemmologa in diretta su richiesta. Live shows from selected jewellers and gem dealers. Gemologist live on request.", url: cfg.SITE + P + "/" },
    join: { title: "Uniqaia · Trasmetti con noi · Go live with us", desc: "La piattaforma di live show per gioiellerie e gem dealer. The live-show platform for jewellers and gem dealers.", url: cfg.SITE + P + "/join/" },
    viewer: { title: "Uniqaia · Live show", desc: "Gioielli e gemme dal vivo. Gemmologa in diretta su richiesta. Jewellery and gems live. Gemologist live on request.", url: "" },
    panel: { title: "Uniqaia · Pannello", desc: "Pannello riservato ai venditori.", url: "" },
    profile: { title: "Uniqaia · Scheda del venditore", desc: "Gioielleria o gem dealer selezionato su Uniqaia: specialità, dirette in programma, come acquistare.", url: "" },
  };
  let b = tpl(name + ".html");
  for (const [k, v] of Object.entries(parts)) b = b.split(`{{${k}}}`).join(v);
  // Valori di runtime calcolati nel browser (slug dall'indirizzo, token dalla query string)
  b = b.split('"lang":"{{LANG}}"').join('"lang":(Q.get("lang")||"").toLowerCase()');
  b = b.split('"slug":"{{SLUG}}"').join('"slug":SLUG');
  b = b.split('"showId":"{{SHOWID}}"').join('"showId":(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(Q.get("s")||"")?Q.get("s"):"")');
  b = b.split('"tokenUrl":"{{TOKENURL}}"').join('"tokenUrl":' + JSON.stringify(cfg.TOKEN_BASE + "/") + '+SLUG+"/token"');
  b = b.split('"token":"{{TOKEN}}"').join('"token":(Q.get(' + JSON.stringify(runtime.tokenParam || "t") + ')||"").replace(/[^a-f0-9]/g,"").slice(0,64)');
  b = b.split("var CFG = {").join('var Q = new URLSearchParams(location.search), SLUG = (location.pathname.match(/^' + esc(P) + '\\/([a-z0-9-]{2,40})(?:\\/|$)/) || [])[1] || "";\n  var CFG = {');
  // Indirizzi del sito: <prefix>/... al posto di /live/...
  const rep = [
    ['"/live/" + j.slug + "/" + s.slug + (lang', '"' + P + '/" + j.slug + "/" + s.slug + (lang'],
    ['"/live/" + CFG.slug + "/" + s.slug + (lang', '"' + P + '/" + CFG.slug + "/" + s.slug + (lang'],
    ['"/live/" + CFG.slug + "/profile?lang="', '"' + P + '/" + CFG.slug + "/profile/?lang="'],
    ["'/live/' + CFG.slug + '/profile?lang='", "'" + P + "/' + CFG.slug + '/profile/?lang='"],
    ['"/live/" + CFG.slug + "/profile"', '"' + P + '/" + CFG.slug + "/profile/"'],
    ['"/live/" + CFG.slug + "/" + s.slug + "?lang="', '"' + P + '/" + CFG.slug + "/" + s.slug + "/?lang="'],
    ['"/live/" + CFG.slug + "/" + state.show.slug', '"' + P + '/" + CFG.slug + "/" + state.show.slug + "/"'],
    ['"/live/" + CFG.slug + "/" + s.slug', '"' + P + '/" + CFG.slug + "/" + s.slug + "/"'],
    ['"/live/" + CFG.slug + "?s="', '"' + P + '/" + CFG.slug + "/?s="'],
    ['"/live/" + CFG.slug + "?lang="', '"' + P + '/" + CFG.slug + "/?lang="'],
    ['"/live/" + j.slug + "/profile?lang="', '"' + P + '/" + j.slug + "/profile/?lang="'],
    ['"/live/" + j.slug + "/" + s.slug + "?lang="', '"' + P + '/" + j.slug + "/" + s.slug + "/?lang="'],
    ['"/live/" + l.slice(7) + "/profile?lang="', '"' + P + '/" + l.slice(7) + "/profile/?lang="'],
    ['"/live")', '"' + P + '/")'],
    ['"/live";', '"' + P + '/";'],
    ['"/live?c="', '"' + P + '/?c="'],
    ["'/live?c='", "'" + P + "/?c='"],
    ['"/live?lang="', '"' + P + '/?lang="'],
    ["'/live?lang='", "'" + P + "/?lang='"],
    ['"/live/" + CFG.slug', '"' + P + '/" + CFG.slug + "/"'],
    ['"/live/" + j.slug + "?s="', '"' + P + '/" + j.slug + "/?s="'],
    ['"/live/" + j.slug + "?lang="', '"' + P + '/" + j.slug + "/?lang="'],
    ['"/live/" + j.slug + "/panel?k="', '"' + P + '/" + j.slug + "/panel/?k="'],
    ['"/live/" + sl + "/panel?k="', '"' + P + '/" + sl + "/panel/?k="'],
    ['"/live/" + sl)', '"' + P + '/" + sl + "/")'],
    ["' · /live/' + esc(j.slug)", "' · " + P + "/' + esc(j.slug) + '/'"],
    ["/live/join?lang=", P + "/join/?lang="],
    ['{{BASE}}/live/join"', "{{BASE}}" + P + '/join/"'],
    ['{{BASE}}/live"', "{{BASE}}" + P + '/"'],
    ["{{BASE}}/live'", "{{BASE}}" + P + "/'"],
    ['/live">', P + '/">'],
    ['href="/show/img/', 'href="' + P + '/img/'],
  ];
  for (const [a, c] of rep) b = b.split(a).join(c);
  // Anteprima per WhatsApp, Instagram, LinkedIn… (Open Graph)
  const og = OG[name] || OG.viewer;
  const ogTags = '<meta property="og:type" content="website"><meta property="og:site_name" content="' + cfg.NAME + '"><meta property="og:title" content="' + og.title + '"><meta property="og:description" content="' + og.desc + '">' +
    (og.url ? '<meta property="og:url" content="' + og.url + '">' : '') +
    '<meta property="og:image" content="' + cfg.SITE + P + '/img/uniqaia-og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="description" content="' + og.desc + '">';
  b = b.split('"/show/img/').join('"' + P + '/img/');
  const PWA = '<link rel="manifest" href="' + P + '/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Uniqaia"><meta name="apple-mobile-web-app-status-bar-style" content="default">';
  const SW = '<script>if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("' + P + '/sw.js").catch(function(){})});</scr' + 'ipt>';
  b = b.replace("</title>", "</title>" + DEMO_META + PWA + ogTags);
  if (b.includes("</body>")) b = b.replace("</body>", SW + "</body>");
  if (DEMO_NOTE) b = b.replace("</footer>", "</footer>" + DEMO_NOTE);
  const vars = { URL: cfg.SUPABASE_URL, KEY: cfg.SUPABASE_KEY, BASE: cfg.SITE, NAME: cfg.NAME, LANG: "it" };
  for (const [k, v] of Object.entries(vars)) b = b.split(`{{${k}}}`).join(v);
  const left = b.match(/\{\{[A-Z]+\}\}/g);
  if (left) throw new Error(name + ": segnaposto non risolti " + left.join(","));
  const live = b.split(cfg.TOKEN_BASE).join("").match(/[^/]\/live[/"'?]/g);
  if (live) throw new Error(name + ": restano indirizzi /live: " + live.join(" "));
  if (P === "" && b.includes("/show/")) throw new Error(name + ": resta un indirizzo /show/ nella versione per il dominio");
  return b;
}

// ---------- pagina pubblica di una diretta (prerender) e sua versione "dinamica" per le dirette non ancora generate
function landingDoc(t, body, lang, extraHead, bodyAttrs, langRow) {
  const P = t.prefix;
  const head = parts.HEAD.split('href="/show/img/').join('href="' + P + '/img/');
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head>${head}<title>${H(body.title)} · ${common.NAME}</title>${DEMO_META}<link rel="manifest" href="${P}/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Uniqaia"><meta name="apple-mobile-web-app-status-bar-style" content="default">${extraHead}<style>${parts.CSS}</style>${parts.FONTS}<style id="restyle">${parts.RESTYLE}${parts.RESTYLE_PAGINE}</style></head>
<body class="vetrina"${bodyAttrs || ""}>
<header class="topv wrap"><div class="col"><div class="brand"><a class="logo" href="${t.site}${P}/?lang=${lang}" aria-label="${common.NAME}">${tpl("vetrina.html").match(/<a class="logo"[^>]*>([\s\S]*?)<\/a>/)[1]}</a><small>${H(T[lang].tag)}</small></div>${langRow || ""}</div></header>
<main class="wrap"><div class="col" id="page">${body.html}</div></main>
<footer class="wrap">${H(T[lang].foot)}<br>${H(T[lang].footJoin)}</footer>${DEMO_NOTE}
<script>
(function(){
  // ora locale del visitatore e stato aggiornato (in diretta / terminata)
  Array.prototype.forEach.call(document.querySelectorAll("time[datetime]"), function(el){ try { el.textContent = new Intl.DateTimeFormat(navigator.language, { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" }).format(new Date(el.getAttribute("datetime"))); } catch(e){} });
  var id = document.body.getAttribute("data-show"); if (!id) return;
  fetch(${JSON.stringify(common.SUPABASE_URL + "/rest/v1/shows?select=status,likes&id=eq.")} + id, { headers: { apikey: ${JSON.stringify(common.SUPABASE_KEY)} } }).then(function(r){ return r.json(); }).then(function(rows){
    var s = rows && rows[0]; if (!s) return; var L = document.getElementById("lStatus"), J = document.getElementById("lJoin"), t = ${JSON.stringify({ live: T[lang].live, ended: T[lang].ended, soon: T[lang].soon, liveNow: T[lang].liveNow, join2: T[lang].join2, interest: T[lang].interest })};
    if (L){ L.className = "lbl" + (s.status === "live" ? "" : " off"); L.innerHTML = "<i></i>" + (s.status === "live" ? t.live : (s.status === "ended" ? t.ended : t.soon)); }
    if (J) J.textContent = s.status === "live" ? t.liveNow : (s.status === "ended" ? t.interest : t.join2);
  }).catch(function(){});
})();
</script>
<script>if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("${P}/sw.js").catch(function(){})});</script>
</body></html>`;
}
const LANGS = ["it", "en", "fr", "ar", "ru"];
function landingFor(t, s, lang = "it") {
  const j = jById[s.jeweler_id]; if (!j || !s.slug) return null;
  if (!T[lang]) lang = "it";
  const P = t.prefix;
  const photoUrls = {}; for (const p of piecesByShow[s.id] || []) if (photoFile[p.id]) photoUrls[p.id] = t.site + P + "/img/" + photoFile[p.id];
  const home = `${t.site}${P}/${j.slug}/${s.slug}/`;
  const self = lang === "it" ? home : `${home}${lang}/`;
  const alt = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${l === "it" ? home : home + l + "/"}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${home}">`;
  const declMap = {}; for (const x of DATA.declarations || []) declMap[x.piece_id] = x;
  const body = landingBody({ site: t.site, prefix: P, lang, show: s, jeweler: j, pieces: piecesByShow[s.id] || [], cats: DATA.categories, coverUrl: coverSrc(t, P, s.id), photoUrls, declarations: declMap, art: ART, t: T[lang], loc: LOC[lang] });
  const image = body.image || t.site + P + "/img/uniqaia-og.jpg";
  const ld = { "@context": "https://schema.org", "@type": "Event", name: body.title, description: body.desc, startDate: body.start, endDate: new Date(new Date(body.start).getTime() + 3600000).toISOString(), eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode", eventStatus: body.ended ? "https://schema.org/EventScheduled" : "https://schema.org/EventScheduled", location: { "@type": "VirtualLocation", url: body.viewerUrl }, organizer: { "@type": "Organization", name: j.name, url: t.site + P + "/" + j.slug + "/profile/" }, image: [image], inLanguage: lang, isAccessibleForFree: true, url: body.url };
  body.url = self;
  const extra = alt + '<meta name="description" content="' + H(body.desc) + '"><link rel="canonical" href="' + H(self) + '"><meta property="og:type" content="website"><meta property="og:site_name" content="' + common.NAME + '"><meta property="og:title" content="' + H(body.title) + '"><meta property="og:description" content="' + H(body.desc) + '"><meta property="og:url" content="' + H(body.url) + '"><meta property="og:image" content="' + H(image) + '"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + '</script>';
  const langRow = '<nav class="langrow" aria-label="Lingua">' + LANGS.map((l) => `<a${l === lang ? ' class="on" aria-current="true"' : ""} hreflang="${l}" href="${l === "it" ? home : home + l + "/"}">${l.toUpperCase()}</a>`).join("") + '</nav>';
  return landingDoc(t, body, lang, extra, ' data-show="' + s.id + '"', langRow);
}
function landingFallback(t) {
  // Pagina generica: legge venditore e diretta dall'indirizzo e costruisce la pagina nel browser (per le dirette create dopo l'ultima generazione)
  const P = t.prefix;
  const body = { title: common.NAME, html: '<p class="hint" style="padding:40px 0">…</p>' };
  let doc = landingDoc(t, body, "it", "", "");
  const js = `<script>
${LANDING_JS}
(function(){
  var m = location.pathname.match(/^${esc(P)}\\/([a-z0-9-]{2,40})\\/([a-z0-9-]{2,60})\\/?$/); if (!m) return;
  var U = ${JSON.stringify(common.SUPABASE_URL + "/rest/v1/")}, K = ${JSON.stringify(common.SUPABASE_KEY)}, TT = ${parts.T}, ART = ${parts.ART}, LOC = ${JSON.stringify(LOC)};
  function get(q){ return fetch(U + q, { headers: { apikey: K } }).then(function(r){ return r.json(); }); }
  get("jewelers?select=id,slug,name,city,country,kind,tagline,tagline_i18n,categories,website,shop_url&slug=eq." + m[1]).then(function(js){
    var j = js[0]; if (!j) return;
    return Promise.all([ get("shows?select=id,jeweler_id,slug,title,title_i18n,description_i18n,description,scheduled_at,status,lang,likes,categories,price_range&jeweler_id=eq." + j.id + "&slug=eq." + m[2]), get("categories?select=slug,position,name_i18n,art&active=eq.true&order=position") ]).then(function(r){
      var s = r[0][0]; if (!s) return;
      return Promise.all([ get("pieces?select=id,show_id,position,name,name_i18n,caption,caption_i18n,short,art,price_cents,currency,buy_url&show_id=eq." + s.id + "&order=position"), get("show_covers?select=show_id,data&show_id=eq." + s.id) ]).then(function(r2){
        var pieces = r2[0], ids = pieces.map(function(p){ return p.id; });
        return (ids.length ? get("piece_photos?select=piece_id,data&piece_id=in.(" + ids.join(",") + ")") : Promise.resolve([])).then(function(ph){
          var photoUrls = {}; ph.forEach(function(x){ photoUrls[x.piece_id] = x.data; });
          var q = (new URLSearchParams(location.search).get("lang") || "").toLowerCase(), st = ""; try { st = localStorage.getItem("vetrina-lang") || ""; } catch(e){}
          var lang = TT[q] ? q : (TT[st] ? st : (TT[s.lang] ? s.lang : "it"));
          var out = landingBody({ site: ${JSON.stringify(t.site)}, prefix: ${JSON.stringify(P)}, lang: lang, show: s, jeweler: j, pieces: pieces, cats: r[1], coverUrl: (r2[1][0] || {}).data || "", photoUrls: photoUrls, art: ART, t: TT[lang], loc: LOC[lang] });
          document.getElementById("page").innerHTML = out.html; document.title = out.title + " · " + ${JSON.stringify(common.NAME)}; document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
          Array.prototype.forEach.call(document.querySelectorAll("time[datetime]"), function(el){ try { el.textContent = new Intl.DateTimeFormat(navigator.language, { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" }).format(new Date(el.getAttribute("datetime"))); } catch(e){} });
        });
      });
    });
  });
})();
</script>`;
  return doc.replace("</body></html>", js + "\n</body></html>");
}

// ---------- prerender della vetrina (contenuto nell'HTML per i motori di ricerca; il JS poi lo rigenera e lo tiene aggiornato)
function prerenderVetrina(t, html) {
  const P = t.prefix, lang = "it", tt = T[lang];
  // stesse 6 categorie e 6 slide della home (elenco in tpl/vetrina.html, «var HOME»)
  const HOME = JSON.parse(tpl("vetrina.html").match(/var HOME = (\{.*\});/)[1]);
  const catName = (slug) => { const c = DATA.categories.find((x) => x.slug === slug); return c ? (c.name_i18n[lang] || slug) : slug; };
  const now = Date.now() - 12 * 3600000;
  const rows = DATA.shows.filter((s) => jById[s.jeweler_id] && (s.status === "live" || (s.status === "scheduled" && new Date(s.scheduled_at).getTime() > now)));
  const card = (s) => {
    const j = jById[s.jeweler_id];
    const url = s.status === "live" ? `${t.site}${P}/${j.slug}/?s=${s.id}` : `${t.site}${P}/${j.slug}/${s.slug}/`;
    const when = new Intl.DateTimeFormat(LOC[lang], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(s.scheduled_at));
    const cvSrc = coverSrc(t, P, s.id); const img = cvSrc ? `<img class="cv" alt="" src="${cvSrc}">` : `<div class="art">${(piecesByShow[s.id] && piecesByShow[s.id][0] && ART[piecesByShow[s.id][0].art]) || ART.ring}</div>`;
    const label = [(s.lang || "").toUpperCase(), ...(s.categories || []).filter((c) => Object.hasOwn(HOME.cats, c)).slice(0, 2).map((c) => HOME.cats[c]), s.price_range].filter(Boolean).join(" · ");
    return `<a class="vcard" href="${url}"><div class="cover"><div class="ph"></div>${img}<span class="lbl${s.status === "live" ? "" : " off"}"><i></i>${H(s.status === "live" ? tt.live : tt.soon)}</span>${s.status === "live" ? "" : `<div class="when"><small>${H(when)}</small></div>`}<div class="ctitle"><small>${H(label)}</small>${H(s.title)}</div></div><div class="meta"><span class="av">${H(j.name.charAt(0).toUpperCase())}</span><span><b>${H(j.name)}<span class="chk">✓</span></b><small>${H(j.city || "")} · ${H(j.kind === "gems" ? tt.gems : tt.shop)}</small></span></div></a>`;
  };
  const live = rows.filter((s) => s.status === "live").map(card).join("");
  // carosello: slide in evidenza + dirette della settimana
  const i18n = (o) => (o || {})[lang] || (o || {}).en || (o || {}).it || "";
  const catArt = (slug) => { const c = DATA.categories.find((x) => x.slug === slug); return (c && ART[c.art]) || ART.ring; };
  const week = rows.filter((s) => s.status === "live" || new Date(s.scheduled_at).getTime() <= Date.now() + 7 * 86400000).sort((a, b) => (b.status === "live") - (a.status === "live") || new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const MOTION = '<span class="grain"></span><span class="sheen"></span><span class="dust"><i style="inset-inline-start:8%;animation-duration:16s;animation-delay:0s"></i><i style="inset-inline-start:18%;animation-duration:21s;animation-delay:3s"></i><i style="inset-inline-start:27%;animation-duration:13s;animation-delay:6s"></i><i style="inset-inline-start:38%;animation-duration:19s;animation-delay:1.5s"></i><i style="inset-inline-start:46%;animation-duration:24s;animation-delay:8s"></i><i style="inset-inline-start:55%;animation-duration:15s;animation-delay:11s"></i><i style="inset-inline-start:64%;animation-duration:22s;animation-delay:4.5s"></i><i style="inset-inline-start:73%;animation-duration:18s;animation-delay:9.5s"></i><i style="inset-inline-start:84%;animation-duration:25s;animation-delay:13s"></i><i style="inset-inline-start:92%;animation-duration:17s;animation-delay:6.5s"></i></span><span class="sparks"><i style="top:21%;inset-inline-start:14%;animation-delay:0.2s"></i><i style="top:33%;inset-inline-start:72%;animation-delay:1.1s"></i><i style="top:15%;inset-inline-start:52%;animation-delay:2.0s"></i><i style="top:47%;inset-inline-start:30%;animation-delay:1.6s"></i><i style="top:26%;inset-inline-start:86%;animation-delay:0.7s"></i><i style="top:55%;inset-inline-start:62%;animation-delay:2.6s"></i></span>', MOTION_ART = '<span class="lights"><i></i><i></i></span><span class="halo"></span>';
  const slideMedia = (sl) => sl.video
    ? `<video class="cv" autoplay muted loop playsinline preload="metadata"${sl.img ? ` poster="${sl.img}"` : ""} src="${sl.video}"></video>`
    : (sl.img ? `<img class="cv" alt="" src="${sl.img}">` : `${MOTION_ART}<div class="art">${sl.art}</div>`);
  const slideHtml = (sl, i) => `<a class="slide${i === 0 ? " on" : ""}" href="${sl.href}" style="--c1:${sl.p[0]};--c2:${sl.p[1]}">${slideMedia(sl)}${MOTION}${sl.live ? `<span class="lbl"><i></i>${H(tt.live)}</span>` : ""}${sl.eyebrow ? `<span class="eyebrow">${H(sl.eyebrow)}</span>` : ""}<h2>${H(sl.title)}</h2>${sl.sub ? `<p>${H(sl.sub)}</p>` : ""}<span class="go">${H(sl.cta)}</span></a>`;
  const palOf = (key) => { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; return ["#3A2A17,#0F0A05","#122B45,#070D15","#2A2A30,#0A0A0D","#3A1F2C,#120810","#1C3328,#06100B","#2E2140,#0C0814","#22303A,#070B0E"][h % 7].split(","); };
  const linkOf = (l) => { l = l || ""; if (l.startsWith("cat:")) return `${t.site}${P}/?c=${l.slice(4)}`; if (l.startsWith("seller:")) return `${t.site}${P}/${l.slice(7)}/profile/`; if (l.startsWith("show:")) { const s = DATA.shows.find((x) => x.id === l.slice(5)); const j = s && jById[s.jeweler_id]; return j ? `${t.site}${P}/${j.slug}/${s.slug}/` : `${t.site}${P}/`; } return l || `${t.site}${P}/`; };
  const slidesHl = [], slidesSh = [];
  for (const h of (DATA.highlights || [])) if (Object.hasOwn(HOME.slides, "h" + h.id)) slidesHl.push({ p: palOf("h" + h.id), img: hlFile[h.id] ? `${t.site}${P}/img/${hlFile[h.id]}` : (/^https?:/.test(h.image || "") ? h.image : ""), video: h.video_url || "", art: (h.link || "").startsWith("cat:") ? catArt(h.link.slice(4)) : ART.sparkle, eyebrow: "", title: HOME.slides["h" + h.id], sub: "", cta: tt.discover, href: linkOf(h.link), live: false });
  for (const s of week) { if (!Object.hasOwn(HOME.slides, "s" + s.id)) continue; const j = jById[s.jeweler_id]; const isLive = s.status === "live"; const firstCat = (s.categories || [])[0]; const pc = (piecesByShow[s.id] || [])[0]; const img = coverSrc(t, P, s.id) || (pc && photoFile[pc.id] ? `${t.site}${P}/img/${photoFile[pc.id]}` : ""); slidesSh.push({ p: palOf(j.slug), img, art: pc ? (ART[pc.art] || ART.ring) : catArt(firstCat), eyebrow: (firstCat && Object.hasOwn(HOME.cats, firstCat) && HOME.cats[firstCat] !== HOME.slides["s" + s.id] ? HOME.cats[firstCat] + " · " : "") + j.name, title: HOME.slides["s" + s.id], sub: "", cta: isLive ? tt.enter : tt.discover, href: isLive ? `${t.site}${P}/${j.slug}/?s=${s.id}` : `${t.site}${P}/${j.slug}/${s.slug}/`, live: isLive }); }
  // una slide editoriale, una diretta: così le dirette della settimana restano in vista
  const slides = [];
  { let a = 0, b = 0;
    while (b < slidesSh.length && slidesSh[b].live) slides.push(slidesSh[b++]);
    while (a < slidesHl.length || b < slidesSh.length) {
      if (a < slidesHl.length) slides.push(slidesHl[a++]);
      if (b < slidesSh.length) slides.push(slidesSh[b++]);
    } }
  const hero = slides.slice(0, 12).map(slideHtml).join("");
  // messaggi sotto il carosello della prima slide e box «Vendi in diretta», come li scrive la pagina: senza JS, per Google e le anteprime dei link
  const slugOf = (title) => { title = title || ""; return Object.keys(HOME.cats).find((k) => HOME.cats[k] === title || (/^Specials/.test(title) && /^Specials/.test(HOME.cats[k]))) || ""; };
  const tCat = slides[0] ? slugOf(slides[0].title) : "";
  const trustItems = ((tt.trustCats || {})[tCat] || [tt.trust[0], tt.trust[1]]).concat([tt.trust[2]]);
  const trust = trustItems.map((x) => `<span><i></i>${H(x)}</span>`).join("");
  const cta = `<div><b>${H(tt.ctaTitle)}</b><small>${H(tt.ctaText)}</small><small class="cnote">${H(tt.ctaNote)}</small></div><a class="go" id="joinLink" href="${t.site}${P}/join/?lang=${lang}">${H(tt.ctaBtn)}</a>`;
  const dots = slides.slice(0, 12).map((_, i) => `<button type="button" class="${i === 0 ? "on" : ""}" aria-label="${i + 1}"></button>`).join("");
  const agenda = week.length ? `<div class="agenda">${week.map((s) => { const j = jById[s.jeweler_id]; const p = palOf(j.slug); const pc = (piecesByShow[s.id] || [])[0]; const img = coverSrc(t, P, s.id) || (pc && photoFile[pc.id] ? `${t.site}${P}/img/${photoFile[pc.id]}` : ""); const d = new Date(s.scheduled_at); const wd = new Intl.DateTimeFormat(LOC[lang], { weekday: "short", timeZone: "Europe/Rome" }).format(d), dn = new Intl.DateTimeFormat(LOC[lang], { day: "numeric", timeZone: "Europe/Rome" }).format(d), tm = new Intl.DateTimeFormat(LOC[lang], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome" }).format(d); const bits = [(s.lang || "").toUpperCase(), ...(s.categories || []).filter((c) => Object.hasOwn(HOME.cats, c)).slice(0, 2).map((c) => HOME.cats[c]), s.price_range].filter(Boolean).join(" · "); return `<a class="ag${s.status === "live" ? " live" : ""}" href="${s.status === "live" ? `${t.site}${P}/${j.slug}/?s=${s.id}` : `${t.site}${P}/${j.slug}/${s.slug}/`}"><div class="agd"><small>${H(s.status === "live" ? tt.live : wd)}</small><b>${H(dn)}</b><span>${H(tm)}</span></div><div class="agi" style="--c1:${p[0]};--c2:${p[1]}">${img ? `<img alt="" src="${img}">` : (pc ? (ART[pc.art] || ART.ring) : ART.ring)}</div><div class="agt"><small>${H(bits)}</small><b>${H(s.title)}</b><span>${H(j.name)}${j.city ? " · " + H(j.city) : ""}</span></div></a>`; }).join("")}</div>` : `<div class="empty">${H(tt.noWeek)}</div>`;
  const soon = rows.filter((s) => s.status !== "live" && new Date(s.scheduled_at).getTime() > Date.now() + 7 * 86400000).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).map(card).join("");
  const tiles = DATA.categories.filter((c) => Object.hasOwn(HOME.cats, c.slug)).map((c) => `<a class="tile ph" href="${t.site}${P}/?c=${c.slug}"><img class="ti" alt="" src="${t.site}${P}/img/tiles/${c.slug}.jpg">${ART[c.art] || ART.ring}<b>${H(HOME.cats[c.slug])}</b></a>`).join("");
  const shops = DATA.jewelers.map((j) => `<a class="seller" href="${t.site}${P}/${j.slug}/profile/"><span class="big">${H(j.name.charAt(0).toUpperCase())}</span><b>${H(j.name)}</b><small>${H(j.city || "")}<br>${H(j.kind === "gems" ? tt.gems : tt.shop)}</small></a>`).join("");
  html = html.replace(/<(\w+)([^>]*) data-t="(\w+)"([^>]*)><\/\1>/g, (m, tag, a, key, b) => `<${tag}${a} data-t="${key}"${b}>${H(tt[key] || "")}</${tag}>`).replace('<small id="tag"></small>', `<small id="tag">${H(tt.tag)}</small>`);
  return html.replace('<div class="track" id="track"></div>', `<div class="track" id="track">${hero}</div>`).replace('<div class="dots" id="dots"></div>', `<div class="dots" id="dots">${dots}</div>`).replace('<div id="weekBody"></div>', `<div id="weekBody">${agenda}</div>`)
    .replace('<div class="grid" id="gridLive"></div>', `<div class="grid" id="gridLive">${live}</div>`)
    .replace('<div class="grid" id="gridSoon"></div>', `<div class="grid" id="gridSoon">${soon}</div>`)
    .replace('<div class="tiles" id="tiles"></div>', `<div class="tiles" id="tiles">${tiles}</div>`)
    .replace('<div class="shops" id="shopsRow"></div>', `<div class="shops" id="shopsRow">${shops}</div>`)
    .replace('<div class="trust" id="trust"></div>', `<div class="trust" id="trust">${trust}</div>`)
    .replace('<div class="cta" id="cta"></div>', `<div class="cta" id="cta">${cta}</div>`)
    .replace('<section id="live">', live ? '<section id="live">' : '<section id="live" hidden>');
}

for (const t of TARGETS) {
  const P = t.prefix;
  const write = (rel, body) => { const p = path.join(t.out, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  write("manifest.webmanifest", JSON.stringify({
    name: "Uniqaia · Fine jewelry & gemstones live",
    short_name: "Uniqaia",
    description: "Dirette di gioiellerie e gem dealer selezionati. Gemmologa in diretta su richiesta.",
    start_url: P + "/?src=app",
    scope: P + "/",
    display: "standalone",
    orientation: "portrait",
    lang: "it",
    background_color: "#FFFFFF",
    theme_color: "#15121C",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: P + "/img/uniqaia-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: P + "/img/uniqaia-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: P + "/img/uniqaia-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  }, null, 1));
  // Service worker: le pagine arrivano sempre dalla rete (così le correzioni si vedono subito),
  // le immagini dalla cache e si aggiornano in sottofondo, e senza rete si vede l'ultima versione vista.
  write("sw.js", `var V = "uniqaia-1", START = ${JSON.stringify(P + "/?src=app")};
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return k === V ? null : caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener("fetch", function(e){
  var req = e.request; if (req.method !== "GET") return;
  var url; try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;
  if (/\\.(?:jpg|jpeg|png|svg|webp|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.open(V).then(function(c){
      return c.match(req).then(function(hit){
        var net = fetch(req).then(function(res){ if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (req.mode === "navigate" || url.pathname.endsWith("/") || /\\.html?$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(function(res){
      if (res && res.ok) { var cp = res.clone(); caches.open(V).then(function(c){ c.put(req, cp); }); }
      return res;
    }).catch(function(){ return caches.match(req).then(function(hit){ return hit || caches.match(START); }); }));
  }
});
`);
  write("index.html", prerenderVetrina(t, render(t, "vetrina", {})));
  write("join/index.html", render(t, "join", {}));
  write("wheel-admin/index.html", render(t, "wheel-admin", { tokenParam: "k" }));
  write("admin/index.html", render(t, "seller-admin", { tokenParam: "k" }));
  write("pay/index.html", render(t, "pay", {}));
  const viewer = render(t, "viewer", { tokenParam: "t" });
  const panel = render(t, "panel", { tokenParam: "k" });
  const profile = render(t, "profile", {});
  write("_viewer.html", viewer);
  write("_panel.html", panel);
  write("_profile.html", profile);
  write("_landing.html", landingFallback(t));
  // Una cartella per ogni venditore noto (indirizzi "veri" con risposta 200); gli altri passano dal 404.html
  for (const s of sellers) { write(`${s}/index.html`, viewer); write(`${s}/panel/index.html`, panel); write(`${s}/profile/index.html`, profile); }
  // Una pagina per ogni diretta pubblica
  const urls = [`${t.site}${P}/`, `${t.site}${P}/join/`, ...sellers.map((s) => `${t.site}${P}/${s}/profile/`)];
  let nLanding = 0;
  for (const s of DATA.shows) {
    const j = jById[s.jeweler_id]; if (!j || !s.slug) continue;
    for (const lang of LANGS) {
      const doc = landingFor(t, s, lang); if (!doc) continue;
      write(lang === "it" ? `${j.slug}/${s.slug}/index.html` : `${j.slug}/${s.slug}/${lang}/index.html`, doc);
      urls.push(lang === "it" ? `${t.site}${P}/${j.slug}/${s.slug}/` : `${t.site}${P}/${j.slug}/${s.slug}/${lang}/`);
      if (lang === "it") nLanding++;
    }
  }
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${H(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
  if (P === "") write("robots.txt", DEMO ? `User-agent: *\nAllow: /\nDisallow: /*/panel/\nDisallow: /wheel-admin/\nDisallow: /admin/\nDisallow: /pay/\nDisallow: /social/\n` : `User-agent: *\nAllow: /\nDisallow: /*/panel/\nDisallow: /wheel-admin/\nDisallow: /admin/\nDisallow: /pay/\nDisallow: /social/\nSitemap: ${t.site}/sitemap.xml\n`);
  // Immagini (logo, icona, anteprima, copertine, foto) condivise tra le due versioni
  if (P === "") { fs.cpSync(IMG, path.join(t.out, "img"), { recursive: true }); }
  // 404.html: instrada <prefix>/<slug>, /panel, /profile e <prefix>/<slug>/<diretta> verso le pagine giuste
  const notFound = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina non trovata</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#FBF8F2;color:#2B2520;display:grid;place-items:center;min-height:100vh}p{text-align:center;padding:24px;line-height:1.6}a{color:inherit}</style></head>
<body><script>
(function(){
  var m = location.pathname.match(/^${esc(P)}\\/([a-z0-9-]{2,40})(?:\\/([a-z0-9-]{2,60}))?\\/?$/);
  if (!m || m[1] === "join" || m[1] === "img" || m[1] === "pay" || m[1] === "admin" || m[1] === "wheel-admin") return;
  var f = !m[2] ? "${P}/_viewer.html" : (m[2] === "panel" ? "${P}/_panel.html" : (m[2] === "profile" ? "${P}/_profile.html" : "${P}/_landing.html"));
  fetch(f, { cache: "no-store" }).then(function(r){ return r.text(); }).then(function(h){ document.open(); document.write(h); document.close(); });
})();
</script><p><b>Pagina non trovata · Page not found</b><br><a href="${P}/">Vai alla vetrina · Go to the showcase</a></p></body></html>
`;
  fs.writeFileSync(t.notFound, notFound);
  console.log(`${path.relative(ROOT, t.out) || "."}: vetrina, join, ${sellers.length} venditori, ${nLanding} pagine di diretta, sitemap`);
}

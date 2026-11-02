// Genera le pagine statiche della piattaforma Uniqaia dai modelli in _src/tpl, in due versioni:
//   1. /show/…   sul sito live.gemsandjewelrytechlab.com (GitHub Pages di questo repository)
//   2. /uniqaia/ pronta per il dominio uniqaia.com (Cloudflare Pages con cartella di output "uniqaia", oppure un repository a sé)
// Uso: node show/_src/build.mjs   (dalla radice del repository)
// Le pagine leggono slug e parametri dall'indirizzo; i token video arrivano dalla edge function Supabase.
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..", "..");         // radice del repository
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

const tpl = (n) => fs.readFileSync(path.join(HERE, "tpl", n), "utf8");
const parts = { HEAD: tpl("head.txt"), CSS: tpl("css.txt"), LKJS: tpl("lkjs.txt"), ART: tpl("art.txt"), T: tpl("t.txt") };
const sellers = fs.readFileSync(path.join(HERE, "sellers.txt"), "utf8").split("\n").map((s) => s.trim()).filter((s) => /^[a-z0-9-]{2,40}$/.test(s));
const esc = (s) => s.replace(/[/.]/g, "\\$&"); // per le espressioni regolari nel JS generato

function render(t, name, runtime) {
  const cfg = { ...common, SITE: t.site };
  const P = t.prefix; // "" oppure "/show"
  const OG = {
    vetrina: { title: "Uniqaia · Fine jewelry & gemstones · Live", desc: "Dirette di gioiellerie e gem dealer selezionati, con una gemmologa GIA accanto. Live shows from selected jewellers and gem dealers, with a GIA gemologist at your side.", url: cfg.SITE + P + "/" },
    join: { title: "Uniqaia · Trasmetti con noi · Go live with us", desc: "La piattaforma di live show per gioiellerie e gem dealer. The live-show platform for jewellers and gem dealers.", url: cfg.SITE + P + "/join/" },
    viewer: { title: "Uniqaia · Live show", desc: "Gioielli e gemme dal vivo, con una gemmologa GIA. Jewellery and gems live, with a GIA gemologist.", url: "" },
    panel: { title: "Uniqaia · Pannello", desc: "Pannello riservato ai venditori.", url: "" },
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
  b = b.replace("</title>", "</title>" + ogTags);
  const vars = { URL: cfg.SUPABASE_URL, KEY: cfg.SUPABASE_KEY, BASE: cfg.SITE, NAME: cfg.NAME, LANG: "it" };
  for (const [k, v] of Object.entries(vars)) b = b.split(`{{${k}}}`).join(v);
  const left = b.match(/\{\{[A-Z]+\}\}/g);
  if (left) throw new Error(name + ": segnaposto non risolti " + left.join(","));
  const live = b.split(cfg.TOKEN_BASE).join("").match(/[^/]\/live[/"']/g);
  if (live) throw new Error(name + ": restano indirizzi /live: " + live.join(" "));
  if (P === "" && b.includes("/show/")) throw new Error(name + ": resta un indirizzo /show/ nella versione per il dominio");
  return b;
}

for (const t of TARGETS) {
  const write = (rel, body) => { const p = path.join(t.out, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); console.log("scritto", path.relative(ROOT, p), body.length); };
  write("index.html", render(t, "vetrina", {}));
  write("join/index.html", render(t, "join", {}));
  const viewer = render(t, "viewer", { tokenParam: "t" });
  const panel = render(t, "panel", { tokenParam: "k" });
  write("_viewer.html", viewer);
  write("_panel.html", panel);
  // Una cartella per ogni venditore noto (indirizzi "veri" con risposta 200); gli altri passano dal 404.html
  for (const s of sellers) { write(`${s}/index.html`, viewer); write(`${s}/panel/index.html`, panel); }
  // Immagini (logo, icona, anteprima) condivise tra le due versioni
  if (t.prefix === "") { fs.mkdirSync(path.join(t.out, "img"), { recursive: true }); for (const f of fs.readdirSync(path.join(ROOT, "show", "img"))) fs.copyFileSync(path.join(ROOT, "show", "img", f), path.join(t.out, "img", f)); }
  // 404.html: instrada <prefix>/<slug> e <prefix>/<slug>/panel verso le pagine giuste
  const P = t.prefix;
  const notFound = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina non trovata</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#FBF8F2;color:#2B2520;display:grid;place-items:center;min-height:100vh}p{text-align:center;padding:24px;line-height:1.6}a{color:inherit}</style></head>
<body><script>
(function(){
  var m = location.pathname.match(/^${esc(P)}\\/([a-z0-9-]{2,40})(\\/panel)?\\/?$/);
  if (!m || m[1] === "join" || m[1] === "img") return;
  fetch(m[2] ? "${P}/_panel.html" : "${P}/_viewer.html", { cache: "no-store" }).then(function(r){ return r.text(); }).then(function(h){ document.open(); document.write(h); document.close(); });
})();
</script><p><b>Pagina non trovata · Page not found</b><br><a href="${P}/">Vai alla vetrina · Go to the showcase</a></p></body></html>
`;
  fs.writeFileSync(t.notFound, notFound); console.log("scritto", path.relative(ROOT, t.notFound));
}

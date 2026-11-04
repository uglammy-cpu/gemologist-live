// Autotest di Nikita: dimostra che il collaudo SCOPRE i guasti, non solo che «passa».
// 1. serve in locale una copia del sito pubblicato (cartella uniqaia/) e lancia i test: devono passare (controprova);
// 2. serve una seconda copia con quattro guasti simulati e rilancia gli stessi test: ognuno deve fallire.
//    - un pulsante che non fa niente (freccia del carosello);
//    - un link che porta a una pagina inesistente;
//    - un errore JavaScript nella vetrina;
//    - una regressione nella ruota (il pulsante SPIN rinominato da un «aggiornamento»).
// Produce risultati/autotest.json, consegnato al registro insieme al collaudo.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const QUI = path.dirname(new URL(import.meta.url).pathname);
const SITO = path.resolve(QUI, "../../uniqaia");
const TIPI = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain" };

function copia(dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(SITO, dest, { recursive: true });
  return dest;
}

function servi(dir, porta) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = path.join(dir, p);
    if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { res.writeHead(404, { "content-type": TIPI[".html"] }); return res.end(fs.readFileSync(path.join(dir, "404.html"))); }
    res.writeHead(200, { "content-type": TIPI[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => srv.listen(porta, "127.0.0.1", () => ok(srv)));
}

function guasta(dir) {
  const home = path.join(dir, "index.html");
  let h = fs.readFileSync(home, "utf8");
  const extra =
    '<script>document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("#nextSlide"))e.stopImmediatePropagation();},true);</script>' +
    '<a href="https://uniqaia.com/pagina-sparita-nikita/" style="position:absolute;left:-9999px">guasto simulato</a>' +
    '<script>setTimeout(function(){ window.nikitaGuastoSimulato.boom(); }, 500);</script>';
  h = h.replace("</body>", extra + "</body>");
  fs.writeFileSync(home, h);
  const join = path.join(dir, "join", "index.html");
  let j = fs.readFileSync(join, "utf8");
  if (!j.includes('id="uqw-spin"')) throw new Error("il pulsante della ruota non è dove me lo aspetto: autotest da aggiornare");
  fs.writeFileSync(join, j.replace('id="uqw-spin"', 'id="uqw-spin-rinominato"'));
}

const PROVE = [
  { id: "e2e.nikita.autotest.pulsante", titolo: "Nikita scopre un pulsante che non funziona", test: "[e2e.home.carosello]", motivo: "la freccia ›" },
  { id: "e2e.nikita.autotest.link", titolo: "Nikita scopre un link verso una pagina inesistente", test: "[e2e.home.link]", motivo: "pagina-sparita-nikita" },
  { id: "e2e.nikita.autotest.errore_js", titolo: "Nikita scopre un errore JavaScript nella vetrina", test: "[e2e.home]", motivo: "boom" },
  { id: "e2e.nikita.autotest.regressione", titolo: "Nikita scopre una regressione della ruota dopo un aggiornamento", test: "[e2e.ruota]", motivo: "" },
];
const GREP = "\\[e2e\\.home\\]|\\[e2e\\.home\\.carosello\\]|\\[e2e\\.home\\.link\\]|\\[e2e\\.ruota\\]";

// ATTENZIONE: niente spawnSync. I server locali vivono in questo processo: se il processo resta bloccato
// ad aspettare i test, i server non rispondono e ogni pagina va in timeout (successo al primo autotest).
async function lancia(base, report) {
  await new Promise((ok) => {
    const p = spawn("npx", ["playwright", "test", "--project=computer", "--grep", GREP, "--workers=2"], {
      cwd: QUI, stdio: "inherit", env: { ...process.env, NIKITA_BASE: base, NIKITA_REPORT: report, NIKITA_NO_RETRY: "1" },
    });
    p.on("exit", ok); p.on("error", ok);
  });
  const rep = JSON.parse(fs.readFileSync(report, "utf8"));
  const esiti = {};
  const visita = (s) => { for (const x of s.suites || []) visita(x); for (const sp of s.specs || []) for (const t of sp.tests || []) {
    const k = sp.title.split(" ")[0]; const r = (t.results || []).at(-1) || {};
    esiti[k] = { status: t.status, errore: String((r.error && r.error.message) || "").replace(/\u001b\[[0-9;]*m/g, "") };
  } };
  visita(rep);
  return esiti;
}

fs.mkdirSync(path.join(QUI, "risultati"), { recursive: true });
const sana = copia("/tmp/nikita-sana"), rotta = copia("/tmp/nikita-guasta");
guasta(rotta);
const s1 = await servi(sana, 4801), s2 = await servi(rotta, 4802);
const controprova = await lancia("http://127.0.0.1:4801", path.join(QUI, "risultati/autotest-sana.json"));
const conGuasti = await lancia("http://127.0.0.1:4802", path.join(QUI, "risultati/autotest-guasta.json"));
s1.close(); s2.close();

const out = PROVE.map((p) => {
  const prima = controprova[p.test] || {}, dopo = conGuasti[p.test] || {};
  let status, reason;
  if (prima.status !== "expected") { status = "not_tested"; reason = `controprova non superata sul sito sano (${prima.status || "test non eseguito"}: ${(prima.errore || "").slice(0, 200)}): esito non dimostrativo`; }
  else if (dopo.status === "unexpected" && dopo.errore.includes(p.motivo)) { status = "pass"; reason = `guasto simulato scoperto: ${p.test} passa sul sito sano e fallisce su quello guasto («${dopo.errore.split("\n")[0].slice(0, 160)}»)`; }
  else if (dopo.status === "unexpected") { status = "partial"; reason = `il test fallisce sul sito guasto ma per un altro motivo: ${dopo.errore.split("\n")[0].slice(0, 200)}`; }
  else { status = "fail"; reason = `guasto simulato NON scoperto: ${p.test} risulta «${dopo.status}» sul sito guasto`; }
  return { check: p.id, title: p.titolo, area: "nikita", severity: "P2", status, reason, impact: "Nikita non si accorgerebbe di questo tipo di guasto.", fix: "Rafforzare il test indicato." };
});
fs.writeFileSync(path.join(QUI, "risultati/autotest.json"), JSON.stringify(out, null, 1));
for (const o of out) console.log(`${o.status.toUpperCase().padEnd(10)} ${o.check} — ${o.reason}`);

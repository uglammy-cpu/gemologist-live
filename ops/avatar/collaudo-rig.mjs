// Collaudo del rig di Gemma (skill 2d-character-rig-animation, «Rig QA»): un foglio con le pose, gli estremi delle
// articolazioni, occhi e bocca, e due controlli automatici (ripetibilità e figura col diamante invariata).
//
// Uso:  node ops/avatar/collaudo-rig.mjs [cartella di uscita]        (predefinita: ops/avatar/qa)
// Serve: playwright con Chromium. Esce <cartella>/rig-<figura>.png per tutte e due le figure, più il resoconto a video.
// Da rifare dopo ogni modifica a pesi, perni, limiti o gesti (prepara-livelli*.py, avatar.js).
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "..", "..", "uniqaia");
const OUT = path.resolve(process.argv[2] || path.join(HERE, "qa"));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"))); }

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.startsWith("/show/")) p = p.slice(5);
  let f = path.join(SITE, p); if (!f.startsWith(SITE)) { res.writeHead(403).end(); return; }
  if (p.endsWith("/")) f = path.join(f, "index.html");
  try { const b = await readFile(f); res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }).end(b); } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });

// le prove: [etichetta, azione]. Azione: gesto (si guarda al culmine), posa fissata (estremi), occhi/bocca
const LIBERA = [
  ["riposo", null], ["hello", "hello"], ["open", "open"], ["present", "present"], ["listen", "listen"], ["think", "think"], ["accento", "beat:1"],
  ["spalla a dx (img) su", { arm: -0.17, shrugR: 4 }], ["spalla a sx (img) su", { loupe: 0.17, shrugL: 4 }],
  ["gomito a dx (img) al limite", { arm: -0.17, foreR: -0.27 }], ["gomito a sx (img) al limite", { loupe: 0.17, foreL: 0.27 }],
  ["braccia dentro", { arm: 0.04, loupe: -0.04, foreR: 0.05, foreL: -0.05 }],
  ["peso a dx (img)", { hip: 11, knee: -5, drop: 3.5, lean: 0.03 }], ["peso a sx (img)", { hip: -11, knee: 5, drop: 3.5, lean: -0.03 }],
  ["busto ruotato", { twist: 5 }], ["occhi chiusi, bocca 3", "faccia"],
];
const DIAMANTE = [
  ["riposo", null], ["hello", "hello"], ["show", "show"], ["loupe", "loupe"], ["lean", "lean"], ["occhi chiusi, bocca 3", "faccia"],
];

async function sheet(fig, tests) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => { try { sessionStorage.setItem("uqa-q", "preview"); } catch (e) {} window.UQA_TEMPO_VIRTUALE = true; });
  await page.goto(`${BASE}/join/?avatar=preview&figura=${fig}&seme=7`);
  await page.addStyleTag({ content: ".uqa{grid-template-columns:540px minmax(0,1fr)!important}.uqa-niche{height:880px!important}" });
  await page.waitForFunction(() => window.UQAvatar && UQAvatar.state && UQAvatar.state().webgl && UQAvatar.state().started, null, { timeout: 15000 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(400);
  const png = await page.evaluate(async (tests) => {
    const step = (ms) => { for (let t = 0; t < ms; t += 40) UQAvatar._step(40); };
    step(2600); document.querySelector(".uqa-pp").click(); step(1600);
    const shots = [];
    for (const [label, act] of tests) {
      UQAvatar._pose(null); UQAvatar.mouth(null); UQAvatar._blink(null);
      if (act === null) step(600);
      else if (typeof act === "string" && act.startsWith("beat:")) { UQAvatar.beat(+act.slice(5)); step(220); }
      else if (act === "faccia") { UQAvatar.mouth(3); UQAvatar._blink(1); step(40); }
      else if (typeof act === "string") { UQAvatar.gesture(act); step(act === "hello" ? 900 : 1100); }
      else { UQAvatar._pose(act); step(40); }
      const im = new Image(); im.src = document.querySelector(".uqa-cv").toDataURL("image/png");
      await im.decode(); shots.push([label, im]);
      step(1200);                                  // si torna a riposo prima della prova dopo
    }
    UQAvatar._pose(null); UQAvatar.mouth(null); UQAvatar._blink(null);
    const W = 270, H = Math.round(W * shots[0][1].height / shots[0][1].width), cols = 6, rows = Math.ceil(shots.length / cols);
    const c = document.createElement("canvas"); c.width = cols * W; c.height = rows * (H + 30);
    const x = c.getContext("2d"); x.fillStyle = "#F8F1DF"; x.fillRect(0, 0, c.width, c.height);
    shots.forEach(([label, im], i) => {
      const cx = (i % cols) * W, cy = Math.floor(i / cols) * (H + 30);
      x.drawImage(im, cx, cy + 30, W, H);
      x.fillStyle = "#1D1A1F"; x.font = "600 17px system-ui, sans-serif"; x.fillText(label, cx + 10, cy + 21);
    });
    return c.toDataURL("image/png");
  }, tests);
  await writeFile(path.join(OUT, `rig-${fig}.png`), Buffer.from(png.split(",")[1], "base64"));
  await ctx.close();
  return errs;
}

// ripetibilità: la stessa sequenza, con lo stesso seme, due volte → fotogrammi identici
async function repeatable(fig) {
  const runs = [];
  for (let r = 0; r < 2; r++) {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 } });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rr) => rr.abort());
    await page.addInitScript(() => { try { sessionStorage.setItem("uqa-q", "preview"); } catch (e) {} window.UQA_TEMPO_VIRTUALE = true; });
    await page.goto(`${BASE}/join/?avatar=preview&figura=${fig}&seme=99`);
    await page.waitForFunction(() => window.UQAvatar && UQAvatar.state && UQAvatar.state().webgl && UQAvatar.state().started, null, { timeout: 15000 });
    runs.push(await page.evaluate(() => {
      const out = [];
      for (let k = 0; k < 200; k++) { if (k === 80) UQAvatar.gesture("hello"); UQAvatar._step(40); if (k % 25 === 0) out.push(document.querySelector(".uqa-cv").toDataURL("image/png")); }
      return out;
    }));
    await ctx.close();
  }
  return runs[0].every((f, i) => f === runs[1][i]);
}

const report = [];
for (const [fig, tests] of [["libera", LIBERA], ["diamante", DIAMANTE]]) {
  const errs = await sheet(fig, tests);
  const same = await repeatable(fig);
  report.push(`${fig}: foglio rig-${fig}.png · errori nella pagina: ${errs.length ? errs.join(" | ") : "nessuno"} · ripetibile con lo stesso seme: ${same ? "sì" : "NO"}`);
}
await browser.close(); server.close();
console.log(report.join("\n"));

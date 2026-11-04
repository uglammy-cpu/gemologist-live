// Gira i video dell'avatar di Elena, fotogramma per fotogramma, dal motore vero della pagina /join.
//
// Uso:  node ops/avatar/gira-video.mjs [cartella di uscita]      (predefinita: ops/avatar/video)
// Serve: playwright con Chromium, ffmpeg.
//
// Escono, per ogni scena, due file:
//   <scena>.webm  sfondo trasparente (VP9 con canale alfa): da mettere sopra qualsiasi grafica
//   <scena>.mp4   sfondo avorio Uniqaia (H.264): pronto da pubblicare o da montare
// Le scene sono qui sotto (SCENE). Ogni scena dice: passo del copione da cui partire, lingua, durata, gesti.
// La bocca dice il testo del fumetto, in silenzio: per un video con la voce si monta sopra la registrazione di Elena
// (o la voce sintetica che lei avrà approvato) e la bocca va rifatta sull'audio (UQAvatar.say).
// Regole dell'avatar (claude/avatar/elena.md nel progetto): ogni testo approvato da Elena, sempre dichiarato come avatar.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SITE = path.join(ROOT, "uniqaia");
const OUT = path.resolve(process.argv[2] || path.join(HERE, "video"));
const FPS = 25;
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"))); }

// scena: id, lingua, passo di partenza, secondi, parla (bocca che dice il testo), gesti [secondo, nome]
const SCENE = [
  { id: "elena-saluto-it", lang: "it", step: 0, sec: 8, talk: true, gestures: [[0.1, "hello"]] },
  { id: "elena-lente-it", lang: "it", step: 3, sec: 7, talk: true, gestures: [[0.2, "loupe"]] },
  { id: "elena-diamante-it", lang: "it", step: 6, sec: 8, talk: true, gestures: [[0.2, "show"], [5.2, "show"]] },
  { id: "elena-attesa", lang: "it", step: 0, sec: 8, talk: false, gestures: [[1.0, "hello"], [4.5, "show"]] },
];

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.startsWith("/show/")) p = p.slice(5);          // le immagini sono chiamate /show/img/...
  let f = path.join(SITE, p);
  if (!f.startsWith(SITE)) { res.writeHead(403).end(); return; }
  if (p.endsWith("/")) f = path.join(f, "index.html");
  try { const b = await readFile(f); res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }).end(b); }
  catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
for (const S of SCENE) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // niente richieste fuori dal sito (font, servizi): non servono per l'avatar
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => { try { sessionStorage.setItem("uqa-q", "preview"); } catch (e) {} });
  await page.goto(`${BASE}/join/?avatar=preview&lang=${S.lang}`);
  // nicchia grande, senza cornice: si riprende solo il canvas
  await page.addStyleTag({ content: ".uqa{grid-template-columns:540px minmax(0,1fr)!important}.uqa-niche{height:880px!important}" });
  await page.waitForFunction(() => window.UQAvatar && UQAvatar.state && UQAvatar.state().webgl, null, { timeout: 15000 });
  await page.waitForTimeout(2600);                     // l'ingresso finisce, poi si gira a tempo virtuale
  await page.evaluate((S) => {
    window.dispatchEvent(new Event("resize"));
    const dot = document.querySelector('.uqa-dots button[data-i="' + S.step + '"]');
    if (dot) dot.click();
    if (!S.talk) document.querySelector(".uqa-pp").click();   // in pausa: si muove ma non parla
  }, S);
  await page.waitForTimeout(300);
  const dir = path.join(OUT, "_f-" + S.id);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const n = Math.round(S.sec * FPS);
  const gs = S.gestures.map(([t, g]) => [Math.round(t * FPS), g]);
  let size = null;
  for (let k = 0; k < n; k++) {
    const g = gs.filter(([f]) => f === k).map(([, g]) => g);
    const url = await page.evaluate(({ g, ms }) => {
      g.forEach((x) => UQAvatar.gesture(x));
      UQAvatar._step(ms);
      return document.querySelector(".uqa-cv").toDataURL("image/png");
    }, { g, ms: 1000 / FPS });
    const buf = Buffer.from(url.split(",")[1], "base64");
    if (!size) size = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    await writeFile(path.join(dir, String(k).padStart(4, "0") + ".png"), buf);
  }
  await ctx.close();
  const inp = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "%04d.png")];
  execFileSync("ffmpeg", [...inp, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-auto-alt-ref", "0", path.join(OUT, S.id + ".webm")]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0xF8F1DF:s=${size[0]}x${size[1]}:r=${FPS}`, "-framerate", String(FPS), "-i", path.join(dir, "%04d.png"),
    "-filter_complex", "[0][1]overlay=shortest=1,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", path.join(OUT, S.id + ".mp4")]);
  await rm(dir, { recursive: true, force: true });
  console.log(S.id, size.join("×"), S.sec + " s");
}
await browser.close();
server.close();

// Gira i video dell'avatar di Elena, fotogramma per fotogramma, dal motore vero della pagina /join.
//
// Uso:
//   node ops/avatar/gira-video.mjs [cartella di uscita]            tutte le scene qui sotto (predefinita: ops/avatar/video)
//   node ops/avatar/gira-video.mjs --solo elena-libera-attesa,…    solo le scene nominate
//   node ops/avatar/gira-video.mjs --audio voce.mp3 --id nome [--figura libera|diamante] [--lingua it]
//                                  [--gesti "0.2:hello,3.5:open"] [--out cartella]
//        una scena nuova con la voce di Elena: la bocca segue la registrazione (tre aperture, come «Ascolta» sul sito)
//        e l'audio entra nei file. Dura quanto l'audio, più mezzo secondo.
// Serve: playwright con Chromium, ffmpeg.
//
// Escono, per ogni scena, tre file:
//   <scena>.webm       sfondo trasparente (VP9 con canale alfa): da mettere sopra qualsiasi grafica
//   <scena>.mp4        sfondo avorio Uniqaia (H.264): pronto da pubblicare o da montare
//   <scena>-9x16.mp4   1080 × 1920 su avorio a 30 fps, per Instagram Reels e TikTok: figura in basso, spazio sopra per i testi
// Due figure: «diamante» (lente e diamante) e «libera» (mani libere, dal 6 novembre 2026).
// Gesti: hello, lean, nod, tilt, beat per tutte e due; show e loupe per il diamante; open e present per le mani libere.
// Senza --audio la bocca dice il testo del fumetto, in silenzio: per un video con la voce si gira con --audio
// sulla registrazione di Elena (o sulla voce sintetica che lei avrà approvato).
// Regole dell'avatar (claude/avatar/elena.md nel progetto): ogni testo approvato da Elena, sempre dichiarato come avatar.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SITE = path.join(ROOT, "uniqaia");
const FPS = 25;
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"))); }

// argomenti
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
  else if (!opt.out) opt.out = argv[i];
}
const OUT = path.resolve(opt.out || path.join(HERE, "video"));

// scena: id, figura, lingua, passo di partenza, secondi, parla (bocca che dice il testo), gesti [secondo, nome]
const SCENE = [
  { id: "elena-saluto-it", figura: "diamante", lang: "it", step: 0, sec: 8, talk: true, gestures: [[0.1, "hello"]] },
  { id: "elena-lente-it", figura: "diamante", lang: "it", step: 3, sec: 7, talk: true, gestures: [[0.2, "loupe"]] },
  { id: "elena-diamante-it", figura: "diamante", lang: "it", step: 6, sec: 8, talk: true, gestures: [[0.2, "show"], [5.2, "show"]] },
  { id: "elena-attesa", figura: "diamante", lang: "it", step: 0, sec: 8, talk: false, gestures: [[1.0, "hello"], [4.5, "show"]] },
  // mani libere (6 novembre 2026)
  { id: "elena-libera-saluto-it", figura: "libera", lang: "it", step: 0, sec: 8, talk: true, gestures: [[0.1, "hello"], [4.8, "open"]] },
  { id: "elena-libera-saluto-en", figura: "libera", lang: "en", step: 0, sec: 8, talk: true, gestures: [[0.1, "hello"], [4.8, "open"]] },
  { id: "elena-libera-presenta-it", figura: "libera", lang: "it", step: 6, sec: 8, talk: true, gestures: [[0.2, "open"], [4.6, "present"]] },
  { id: "elena-libera-attesa", figura: "libera", lang: "it", step: 0, sec: 8, talk: false, gestures: [[1.0, "hello"], [4.5, "open"]] },
];

let scenes = SCENE;
if (opt.audio) {
  const gestures = String(opt.gesti || "0.2:hello").split(",").filter(Boolean).map((g) => { const [t, n] = g.split(":"); return [parseFloat(t), n.trim()]; });
  scenes = [{ id: String(opt.id || path.basename(opt.audio).replace(/\.[^.]+$/, "")), figura: String(opt.figura || "libera"), lang: String(opt.lingua || "it"), step: 0, talk: false, gestures, audio: path.resolve(String(opt.audio)) }];
} else if (opt.solo) {
  const want = String(opt.solo).split(",");
  scenes = SCENE.filter((S) => want.includes(S.id));
  if (!scenes.length) { console.error("nessuna scena con questi nomi:", want.join(", ")); process.exit(1); }
}

// apertura della bocca dalla registrazione, un valore per fotogramma: come audioMouth() di avatar.js
// (ampiezza efficace con controllo automatico del livello: 0 chiusa, 1–3 aperture)
function mouthFromAudio(file) {
  const RATE = 16000;
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
  const smp = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const sec = smp.length / RATE, n = Math.ceil(sec * FPS), half = Math.round(RATE * 0.02), out = [];
  let peak = 0.08;
  for (let k = 0; k < n; k++) {
    const c = Math.round((k / FPS) * RATE); let s = 0, m = 0;
    for (let j = Math.max(0, c - half); j < Math.min(smp.length, c + half); j++) { const v = smp[j] / 32768; s += v * v; m++; }
    const rms = m ? Math.sqrt(s / m) : 0;
    peak = Math.max(rms, peak * 0.988, 0.02);
    const v = rms / peak;
    out.push(v > 0.66 ? 3 : v > 0.4 ? 2 : v > 0.15 ? 1 : 0);
  }
  return { sec, levels: out };
}

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
for (const S of scenes) {
  let mouth = null;
  if (S.audio) { const m = mouthFromAudio(S.audio); mouth = m.levels; S.sec = m.sec + 0.5; }
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // niente richieste fuori dal sito (font, servizi): non servono per l'avatar
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => { try { sessionStorage.setItem("uqa-q", "preview"); } catch (e) {} });
  await page.goto(`${BASE}/join/?avatar=preview&figura=${S.figura || "diamante"}&lang=${S.lang}`);
  // nicchia grande, senza cornice: si riprende solo il canvas
  await page.addStyleTag({ content: ".uqa{grid-template-columns:540px minmax(0,1fr)!important}.uqa-niche{height:880px!important}" });
  await page.waitForFunction(() => window.UQAvatar && UQAvatar.state && UQAvatar.state().webgl, null, { timeout: 15000 });
  const fig = await page.evaluate(() => UQAvatar.state().figura || "diamante");
  if (fig !== (S.figura || "diamante")) throw new Error(S.id + ": la pagina ha caricato la figura " + fig);
  await page.waitForTimeout(2600);                     // l'ingresso finisce, poi si gira a tempo virtuale
  await page.evaluate((S) => {
    window.dispatchEvent(new Event("resize"));
    const dot = document.querySelector('.uqa-dots button[data-i="' + S.step + '"]');
    if (dot) dot.click();
    if (!S.talk) document.querySelector(".uqa-pp").click();   // in pausa: si muove ma non parla da sola
  }, S);
  await page.waitForTimeout(300);
  const dir = path.join(OUT, "_f-" + S.id);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const n = Math.round(S.sec * FPS);
  const gs = S.gestures.map(([t, g]) => [Math.round(t * FPS), g]);
  let size = null;
  for (let k = 0; k < n; k++) {
    const g = gs.filter(([f]) => f === k).map(([, g]) => g);
    const lv = mouth ? (k < mouth.length ? mouth[k] : 0) : null;
    const url = await page.evaluate(({ g, ms, lv }) => {
      g.forEach((x) => UQAvatar.gesture(x));
      if (lv != null) UQAvatar.mouth(lv);
      UQAvatar._step(ms);
      return document.querySelector(".uqa-cv").toDataURL("image/png");
    }, { g, ms: 1000 / FPS, lv });
    const buf = Buffer.from(url.split(",")[1], "base64");
    if (!size) size = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    await writeFile(path.join(dir, String(k).padStart(4, "0") + ".png"), buf);
  }
  await ctx.close();
  const frames = ["-framerate", String(FPS), "-i", path.join(dir, "%04d.png")];
  const aIn = S.audio ? ["-i", S.audio] : [];
  const q = ["-y", "-loglevel", "error"];
  // trasparente
  execFileSync("ffmpeg", [...q, ...frames, ...aIn, "-map", "0:v", ...(S.audio ? ["-map", "1:a", "-c:a", "libopus", "-b:a", "128k"] : []),
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-auto-alt-ref", "0", path.join(OUT, S.id + ".webm")]);
  // su avorio, alla misura della ripresa
  execFileSync("ffmpeg", [...q, "-f", "lavfi", "-i", `color=c=0xF8F1DF:s=${size[0]}x${size[1]}:r=${FPS}`, ...frames, ...aIn,
    "-filter_complex", "[0][1]overlay=shortest=1,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]", "-map", "[v]", ...(S.audio ? ["-map", "2:a", "-c:a", "aac", "-b:a", "160k"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", path.join(OUT, S.id + ".mp4")]);
  // 9:16 per Reels e TikTok: figura in basso al centro, spazio libero sopra per titoli e sottotitoli
  execFileSync("ffmpeg", [...q, "-f", "lavfi", "-i", `color=c=0xF8F1DF:s=1080x1920:r=${FPS}`, ...frames, ...aIn,
    "-filter_complex", "[1]scale=w='min(1080,iw)':h=-2[f];[0][f]overlay=x=(W-w)/2:y=H-h:shortest=1,fps=30,format=yuv420p[v]", "-map", "[v]", ...(S.audio ? ["-map", "2:a", "-c:a", "aac", "-b:a", "160k"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", path.join(OUT, S.id + "-9x16.mp4")]);
  await rm(dir, { recursive: true, force: true });
  console.log(S.id, fig, size.join("×"), S.sec.toFixed(1) + " s" + (S.audio ? ", con la voce" : ""));
}
await browser.close();
server.close();

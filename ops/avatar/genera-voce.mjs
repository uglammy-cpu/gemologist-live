// Voce dell'avatar di Elena (pagina /join): prepara i file audio dei passi e accende «Ascolta».
//
// Due strade, stesso risultato (un MP3 per passo in show/img/avatar/voce/<lingua>/<id>.mp3):
//
//  A. Registrazione di Elena — la più autentica. Si legge il copione (avatar-copione.json) una frase per file,
//     si salvano gli MP3 con il nome del passo (saluto.mp3, account.mp3, …, fine.mp3) e poi:
//        node ops/avatar/genera-voce.mjs --controlla
//
//  B. Voce sintetica con ElevenLabs (anche con la voce di Elena clonata, utile per russo e arabo):
//        ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… node ops/avatar/genera-voce.mjs --lingue it,en,fr,ru,ar
//     Opzioni: --modello eleven_multilingual_v2 (predefinito) · --sovrascrivi (rigenera anche i file già presenti)
//
// In entrambi i casi lo script controlla che ogni lingua abbia tutti i passi e aggiorna VOICE_LANGS in
// show/_src/avatar.js: solo le lingue complete fanno comparire il pulsante «Ascolta». Poi si rigenera il sito
// (node show/_src/build.mjs) e si pubblica. La bocca segue l'audio da sola, qualunque sia la voce.
//
// Non provato contro il servizio vero (4 novembre 2026): serve un account ElevenLabs con chiave API.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const COPIONE = JSON.parse(fs.readFileSync(path.join(ROOT, "show", "_src", "avatar-copione.json"), "utf8"));
const AVATAR_JS = path.join(ROOT, "show", "_src", "avatar.js");
const VOCE = path.join(ROOT, "show", "img", "avatar", "voce");
const LINGUE = Object.keys(COPIONE).filter((k) => !k.startsWith("_"));

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
const soloControllo = !!arg("controlla", false);
const scelte = String(arg("lingue", LINGUE.join(","))).split(",").map((s) => s.trim()).filter(Boolean);
const modello = String(arg("modello", "eleven_multilingual_v2"));
const sovrascrivi = !!arg("sovrascrivi", false);

for (const l of scelte) if (!COPIONE[l]) { console.error(`Lingua sconosciuta: ${l} (ci sono: ${LINGUE.join(", ")})`); process.exit(1); }

async function sintetizza(testo, file) {
  const key = process.env.ELEVENLABS_API_KEY, voce = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voce) throw new Error("Mancano ELEVENLABS_API_KEY ed ELEVENLABS_VOICE_ID nell'ambiente.");
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voce)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: testo, model_id: modello, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

if (!soloControllo) {
  for (const l of scelte) {
    for (const p of COPIONE[l].steps) {
      const file = path.join(VOCE, l, p.id + ".mp3");
      if (fs.existsSync(file) && !sovrascrivi) { console.log(`= ${l}/${p.id}.mp3 c'è già`); continue; }
      process.stdout.write(`… ${l}/${p.id}.mp3 `);
      await sintetizza(p.s, file);
      console.log(`${Math.round(fs.statSync(file).size / 1024)} KB`);
    }
  }
}

// lingue complete → VOICE_LANGS
const complete = LINGUE.filter((l) => COPIONE[l].steps.every((p) => { const f = path.join(VOCE, l, p.id + ".mp3"); return fs.existsSync(f) && fs.statSync(f).size > 1000; }));
for (const l of LINGUE) {
  const manca = COPIONE[l].steps.filter((p) => !fs.existsSync(path.join(VOCE, l, p.id + ".mp3"))).map((p) => p.id);
  console.log(`${l}: ${manca.length ? "mancano " + manca.join(", ") : "completa"}`);
}
const js = fs.readFileSync(AVATAR_JS, "utf8");
const nuovo = js.replace(/var VOICE_LANGS = \[[^\]]*\];/, "var VOICE_LANGS = " + JSON.stringify(complete) + ";");
if (nuovo === js && !/var VOICE_LANGS = /.test(js)) { console.error("Non trovo VOICE_LANGS in avatar.js"); process.exit(1); }
fs.writeFileSync(AVATAR_JS, nuovo);
console.log(`VOICE_LANGS = ${JSON.stringify(complete)} — ora: node show/_src/build.mjs`);

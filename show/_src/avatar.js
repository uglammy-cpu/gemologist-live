/* Uniqaia · Avatar di Elena per la pagina /join (4 novembre 2026)
 *
 * Elena, in versione illustrata, entra nella sezione e spiega in sei passi come si entra in Uniqaia:
 * account, candidatura, valutazione entro 24 ore, link di pagamento, palinsesto, diretta.
 *
 * Parla: mentre il fumetto si riempie, la bocca dice le parole (sillaba per sillaba, a ritmo di voce), in silenzio
 * finché non ci sono le registrazioni. La voce vera è già predisposta:
 *  - con i file audio in img/avatar/voce/<lingua>/<passo>.mp3 e la lingua aggiunta a VOICE_LANGS,
 *    compare «Ascolta» e la bocca segue l'audio (lip sync dall'ampiezza, tre aperture);
 *  - con ?avatar=voce si prova subito la sincronia con la voce del browser (solo anteprima).
 * Si muove: respira, sposta il peso, piega appena il busto, muove la testa e i capelli, alza il diamante e la lente
 * nei passi giusti (il saluto, la valutazione, la diretta).
 *
 * Animazione: WebGL. Una sola immagine scontornata, deformata da una griglia (respiro, testa, capelli,
 * avambraccio con il diamante, oscillazione del corpo), più un atlante con gli occhi chiusi e tre aperture della
 * bocca, e un riflesso che ogni tanto accende il diamante. Quanto ogni punto segue la testa, le punte dei capelli
 * o l'avambraccio sta in una piccola mappa di pesi (avatar-geometria.json, scritta da ops/avatar/prepara-livelli.py
 * e inserita da build.mjs al posto del commento GEOMETRIA).
 * Senza WebGL, o con «riduci animazioni», resta l'immagine ferma e il testo si legge passo per passo.
 *
 * Testi: avatar-copione.json, inserito da build.mjs al posto del commento COPIONE qui sotto.
 *
 * Due figure (6 novembre 2026), stesso motore:
 *  - «diamante» (predefinita): lente 10x in una mano, diamante nell'altra; geometria in avatar-geometria.json;
 *  - «libera»: tutte e due le mani libere (prima illustrazione senza la pochette); geometria in
 *    avatar-geometria-libera.json (ops/avatar/prepara-livelli-libera.py). Le braccia girano sulle spalle.
 * Si sceglie con data-figura="libera" sul contenitore, con mount(slot, lingua, { figura: "libera" }) o, per le prove,
 * con ?figura=libera. Gesti: hello, lean, nod, tilt, beat per tutte e due; show e loupe per la figura col diamante;
 * open (apre le braccia) e present (indica il fumetto) per quella a mani libere. Sulla figura a mani libere show
 * diventa open e loupe diventa present, così il racconto di /join funziona con tutte e due.
 */
(function () {
  "use strict";
  if (window.UQAvatar) return;

  // ---------------------------------------------------------------- visibilità
  // "anteprima": solo con ?avatar=preview (o ?avatar=voce); "pubblico": per tutti; "spento": per nessuno.
  var MODE = "anteprima";
  var QS = new URLSearchParams(location.search), q = (QS.get("avatar") || "").toLowerCase();
  try { if (q) sessionStorage.setItem("uqa-q", q); else q = sessionStorage.getItem("uqa-q") || ""; } catch (e) {}
  var NOOP = { mount: function () {}, say: function () { return Promise.resolve(); }, gesture: function () {}, mouth: function () {} };
  if (MODE === "spento" || q === "off" || (MODE === "anteprima" && q !== "preview" && q !== "voce")) { window.UQAvatar = NOOP; return; }
  var TTS_PREVIEW = q === "voce";

  var ASSET = "/show/img/avatar/";
  // Lingue per cui esistono i file audio registrati (img/avatar/voce/<lingua>/<id>.mp3). Vuoto = l'avatar non parla.
  // Lo aggiorna da solo ops/avatar/genera-voce.mjs; per una registrazione fatta a mano basta aggiungere la lingua.
  var VOICE_LANGS = [];
  var TXT = /*COPIONE*/{};

  // Geometria dell'illustrazione (1254 × 1254), in pixel dell'illustrazione: ritaglio di elena.webp, riquadri di occhi
  // e bocca e loro posto nell'atlante, inquadratura, perni (collo, gomito, piedi), riflessi, griglia e mappa dei pesi.
  // Una per figura: «diamante» (lente e diamante) e «libera» (mani libere).
  var FIGS = { diamante: /*GEOMETRIA*/null, libera: /*GEOMETRIA_LIBERA*/null };
  var FIG = "diamante", G = null;
  function pick(f) {
    f = String(f || "").toLowerCase();
    FIG = FIGS[f] ? f : FIGS.diamante ? "diamante" : "libera";
    G = FIGS[FIG];
  }
  pick(QS.get("figura") || ((document.getElementById("uqaSlot") || {}).getAttribute ? document.getElementById("uqaSlot").getAttribute("data-figura") : ""));
  if (!G) { window.UQAvatar = NOOP; return; }

  var RM = false; try { RM = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var VT = { on: false, t: 0 };        // tempo virtuale (solo per girare i video)
  var now = function () { return VT.on ? VT.t : (window.performance && performance.now) ? performance.now() : Date.now(); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

  // ---------------------------------------------------------------- stile
  var CSS = [
    ".uqa{display:grid;grid-template-columns:268px minmax(0,1fr);gap:20px;align-items:end;margin:8px 0 6px}",
    ".uqa-niche{position:relative;height:440px;border-radius:134px 134px 18px 18px;overflow:hidden;isolation:isolate;border:1px solid #EDD596;",
    "background:radial-gradient(120% 62% at 50% 30%,#FFFDF8 0,#F8F1DF 64%,#F1E4C2 100%)}",
    ".uqa-niche::before{content:'';position:absolute;inset:7px;border-radius:127px 127px 13px 13px;border:1px solid rgba(203,164,79,.38);pointer-events:none;z-index:2}",
    ".uqa-niche::after{content:'';position:absolute;left:0;right:0;bottom:0;height:16%;background:linear-gradient(rgba(241,228,194,0),#F1E4C2 88%);pointer-events:none;z-index:1}",
    ".uqa-fig{position:absolute;inset:0;will-change:transform}",
    ".uqa-fig img,.uqa-fig canvas{position:absolute;display:block;max-width:none}",
    ".uqa-fig canvas{left:0;top:0;width:100%;height:100%}",
    ".uqa-fig.pre{opacity:0}",
    ".uqa-talk{display:flex;flex-direction:column;gap:12px;min-width:0;padding-bottom:4px}",
    ".uqa-bub{position:relative;background:#fff;border:1px solid #E7E4DC;border-radius:18px;padding:16px 18px 18px;box-shadow:0 12px 32px rgba(28,20,6,.08);display:flex;flex-direction:column;gap:6px}",
    ".uqa-bub::before{content:'';position:absolute;width:16px;height:16px;background:#fff;border-left:1px solid #E7E4DC;border-bottom:1px solid #E7E4DC;left:-9px;bottom:64px;transform:rotate(45deg)}",
    "[dir=rtl] .uqa-bub::before{left:auto;right:-9px;transform:rotate(-135deg)}",
    ".uqa-eb{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:#8C6A2B;font-weight:500}",
    ".uqa-t{font-family:var(--display,'Bodoni Moda',Georgia,serif);font-weight:400;font-size:24px;line-height:1.15;margin:0;color:#16181D}",
    ".uqa-s{font-size:15.5px;line-height:1.55;color:#2B2E35;margin:2px 0 0}",
    ".uqa-s span{transition:opacity .22s ease}",
    ".uqa-s span.h{opacity:0}",
    ".uqa-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:-1px}",
    ".uqa-end{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:8px}",
    ".uqa-end[hidden]{display:none}",
    ".uqa-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
    ".uqa-dots{display:flex;gap:5px}",
    ".uqa-dots button{width:27px;height:27px;border-radius:50%;border:1px solid #EDD596;background:#fff;color:#8C6A2B;font:500 12px/1 var(--body,'Jost',system-ui,sans-serif);cursor:pointer;padding:0}",
    ".uqa-dots button.done{background:#F8F1DF}",
    ".uqa-dots button.on{background:#1C1406;border-color:#1C1406;color:#EDD596}",
    ".uqa-btns{display:flex;gap:6px;margin-inline-start:auto}",
    ".uqa-ib{width:36px;height:36px;border-radius:50%;border:1px solid #E7E4DC;background:#fff;color:#16181D;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}",
    ".uqa-ib svg{width:18px;height:18px}",
    ".uqa-ib.wide{width:auto;padding:0 14px 0 11px;gap:7px;border-radius:999px;font:500 12px/1 var(--body,'Jost',system-ui,sans-serif);letter-spacing:.12em;text-transform:uppercase}",
    ".uqa-ib.wide.on{background:#1C1406;color:#EDD596;border-color:#1C1406}",
    ".uqa-ib[hidden]{display:none}",
    ".uqa-ib:disabled{opacity:.35;cursor:default}",
    ".uqa-ib:focus-visible,.uqa-dots button:focus-visible{outline:2px solid #CBA44F;outline-offset:2px}",
    "[dir=rtl] .uqa-flip{transform:scaleX(-1)}",
    ".uqa-note{font-size:12.5px;color:#5B606A;margin:0}",
    ".uqa-note[hidden]{display:none}",
    "@media (max-width:640px){.uqa{grid-template-columns:minmax(0,1fr);gap:14px}",
    ".uqa-niche{height:330px;width:min(100%,340px);justify-self:center;border-radius:150px 150px 18px 18px}",
    ".uqa-niche::before{border-radius:143px 143px 13px 13px}",
    ".uqa-bub::before,[dir=rtl] .uqa-bub::before{left:50%;right:auto;bottom:auto;top:-9px;margin-left:-8px;transform:rotate(135deg)}",
    ".uqa-t{font-size:22px}.uqa-ib{width:42px;height:42px}.uqa-dots button{width:32px;height:32px}}",
    "@media (prefers-reduced-motion:reduce){.uqa-s span{transition:none}}"
  ].join("");

  var ICON = {
    prev: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="uqa-flip"><path d="M14.5 6 8.5 12l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="uqa-flip"><path d="m9.5 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.4" height="12" rx="1" fill="currentColor"/><rect x="13.6" y="6" width="3.4" height="12" rx="1" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" class="uqa-flip"><path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.8l8.4-5.8c.6-.4.6-1.2 0-1.6l-8.4-5.8c-.7-.5-1.6 0-1.6.8Z" fill="currentColor"/></svg>',
    again: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 4.5V8h3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    voice: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  // ---------------------------------------------------------------- motore WebGL
  function f1(v) { return (+v).toFixed(1); }
  function v2(p) { return "vec2(" + f1(p[0]) + ", " + f1(p[1]) + ")"; }
  function vertexShader() { return [
    "attribute vec2 aP;",
    "attribute vec3 aW;",        // pesi: testa, punte dei capelli, avambraccio alzato (diamante)
    "attribute vec2 aV;",        // pesi: busto, avambraccio con la lente
    "uniform vec4 uView;",       // x, y, w, h dell'inquadratura (px dell'illustrazione)
    "uniform vec4 uCrop;",       // posizione e misura della texture di base
    "uniform vec4 uEye;", "uniform vec4 uMouth;",
    "uniform float uBreath;",
    "uniform vec4 uHead;",       // rotazione (rad), dx, dy, cenno (px)
    "uniform float uSway;",
    "uniform vec2 uHair;",       // spostamento delle punte dei capelli: sinistra, destra (px)
    "uniform float uArm;",       // rotazione dell'avambraccio col diamante sul gomito (rad)
    "uniform float uLoupe;",     // rotazione della mano con la lente sul polso (rad)
    "uniform float uLean;",      // busto che si piega di lato sui fianchi (rad)
    "varying vec2 vUv; varying vec2 vE; varying vec2 vM; varying vec2 vP;",
    "vec2 rot(vec2 p, vec2 c, float a){ float s = sin(a), k = cos(a); p -= c; return c + vec2(k*p.x - s*p.y, s*p.x + k*p.y); }",
    "void main(){",
    "  vec2 p = aP;",
    "  vP = p;",
    "  vUv = (p - uCrop.xy) / uCrop.zw;",
    "  vE = (p - uEye.xy) / (uEye.zw - uEye.xy);",
    "  vM = (p - uMouth.xy) / (uMouth.zw - uMouth.xy);",
    // testa, con la parte alta dei capelli; le ciocche lunghe la seguono sempre meno verso le punte (dalla mappa)
    "  vec2 nk = " + v2(G.neck) + ";",
    "  vec2 hp = rot(p, nk, uHead.x) + uHead.yz;",
    "  hp.y += uHead.w * clamp((nk.y - p.y) / nk.y, 0.0, 1.0);",
    "  vec2 q = mix(p, hp, aW.x);",
    // l'avambraccio con la mano e il diamante gira appena sul gomito
    "  q += (rot(p, " + v2(G.elbow) + ", uArm) - p) * aW.z;",
    "  q += (rot(p, " + v2(G.lwrist) + ", uLoupe) - p) * aV.y;",
    // respiro: si alza il busto, il petto si allarga appena (solo il torso: le braccia restano intere)
    "  q.y -= 2.6 * uBreath * (1.0 - smoothstep(" + f1(G.breath[0]) + ", " + f1(G.breath[1]) + ", p.y));",
    "  float chest = smoothstep(" + f1(G.chest[0]) + ", " + f1(G.chest[1]) + ", p.y) * (1.0 - smoothstep(" + f1(G.chest[2]) + ", " + f1(G.chest[3]) + ", p.y));",
    "  float dx = p.x - " + f1(G.faceX) + ";",
    "  q.x += dx * 0.010 * uBreath * chest * (1.0 - smoothstep(110.0, 170.0, abs(dx)));",
    // punte dei capelli
    "  q.x += mix(uHair.x, uHair.y, step(" + f1(G.faceX) + ", p.x)) * aW.y;",
    // il busto si piega sui fianchi; poi tutto il corpo oscilla sui piedi (spostamento del peso)
    "  q = mix(q, rot(q, " + v2(G.hips) + ", uLean), aV.x);",
    "  q = rot(q, " + v2(G.sway) + ", uSway);",
    "  vec2 n = (q - uView.xy) / uView.zw;",
    "  gl_Position = vec4(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);",
    "}"
  ].join("\n"); }
  var FS_BODY = [
    "uniform sampler2D uBase; uniform sampler2D uFx;",
    "uniform vec4 uEyeA;",       // atlante: origine e misura del riquadro occhi (uv)
    "uniform vec4 uMouthA;",     // atlante: origine e misura del riquadro bocca per l'apertura corrente (uv)
    "uniform float uBlink; uniform float uMouthOn;",
    "uniform vec4 uGlint;",      // riflesso sul diamante: x, y (px dell'illustrazione), intensità, rotazione
    "varying vec2 vUv; varying vec2 vE; varying vec2 vM; varying vec2 vP;",
    "float bm(vec2 s, vec2 f){ vec2 a = smoothstep(vec2(0.0), f, s) * (1.0 - smoothstep(vec2(1.0) - f, vec2(1.0), s)); return a.x * a.y; }",
    "void main(){",
    "  vec4 c = texture2D(uBase, vUv);",
    "  if (uBlink > 0.002) { float w = -0.12 + 1.3 * uBlink - 0.38 * (vE.x - 0.5); float m = bm(vE, vec2(0.024, 0.075)) * (1.0 - smoothstep(w - 0.05, w + 0.03, vE.y)); vec3 e = texture2D(uFx, uEyeA.xy + vE * uEyeA.zw).rgb; c.rgb = mix(c.rgb, e * c.a, m); }",
    "  if (uMouthOn > 0.5) { float m = bm(vM, vec2(0.04, 0.05)); vec3 e = texture2D(uFx, uMouthA.xy + vM * uMouthA.zw).rgb; c.rgb = mix(c.rgb, e * c.a, m); }",
    // stella a quattro punte, più un alone: si somma alla luce (alfa premoltiplicato)
    "  if (uGlint.z > 0.002) { vec2 d = vP - uGlint.xy; float s = sin(uGlint.w), k = cos(uGlint.w); d = vec2(k*d.x - s*d.y, s*d.x + k*d.y);",
    "    float r2 = dot(d, d); float ray = exp(-abs(d.x) * 1.1) * exp(-abs(d.y) / 10.0) + exp(-abs(d.y) * 1.1) * exp(-abs(d.x) / 10.0);",
    "    float g = uGlint.z * clamp(0.85 * ray + exp(-r2 / 5.0) + 0.22 * exp(-r2 / 60.0), 0.0, 1.0);",
    "    c = vec4(c.rgb * (1.0 - 0.15 * g) + vec3(g), max(c.a, g)); }",
    "  gl_FragColor = c;",
    "}"
  ].join("\n");

  function Engine(canvas, wpx) {
    var gl = null;
    try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: "low-power" }) || canvas.getContext("experimental-webgl"); } catch (e) {}
    if (!gl) return null;
    var hp = gl.getShaderPrecisionFormat ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT) : null;
    var FS = "precision " + (hp && hp.precision > 0 ? "highp" : "mediump") + " float;\n" + FS_BODY;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader"); return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "precision highp float;\n" + vertexShader())); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(pr);
    var U = {}; ["uView", "uCrop", "uEye", "uMouth", "uBreath", "uHead", "uSway", "uHair", "uArm", "uLoupe", "uLean", "uBase", "uFx", "uEyeA", "uMouthA", "uBlink", "uMouthOn", "uGlint"].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    // griglia sulla texture di base, con i pesi di ogni nodo. Mappa: un pixel per nodo, due metà affiancate;
    // a sinistra rosso testa, verde punte dei capelli, blu braccio del diamante; a destra rosso busto, verde braccio della lente
    var cols = G.grid[0], rows = G.grid[1], x0 = G.crop[0], y0 = G.crop[1], cw = G.crop[2], ch = G.crop[3];
    var nv = (cols + 1) * (rows + 1), v = new Float32Array(nv * 2), wt = new Float32Array(nv * 3), wt2 = new Float32Array(nv * 2), k = 0, i, j;
    for (j = 0; j <= rows; j++) for (i = 0; i <= cols; i++) { v[k++] = x0 + cw * i / cols; v[k++] = y0 + ch * j / rows; }
    if (wpx) for (j = 0; j <= rows; j++) for (i = 0; i <= cols; i++) {
      k = j * (cols + 1) + i; var a1 = (j * (cols + 1) * 2 + i) * 4, a2 = a1 + (cols + 1) * 4;
      wt[k * 3] = wpx[a1] / 255; wt[k * 3 + 1] = wpx[a1 + 1] / 255; wt[k * 3 + 2] = wpx[a1 + 2] / 255;
      wt2[k * 2] = wpx[a2] / 255; wt2[k * 2 + 1] = wpx[a2 + 1] / 255;
    }
    var idx = new Uint16Array(cols * rows * 6); k = 0;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) { var a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "aP"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var wb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, wb); gl.bufferData(gl.ARRAY_BUFFER, wt, gl.STATIC_DRAW);
    var lw = gl.getAttribLocation(pr, "aW"); gl.enableVertexAttribArray(lw); gl.vertexAttribPointer(lw, 3, gl.FLOAT, false, 0, 0);
    var wb2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, wb2); gl.bufferData(gl.ARRAY_BUFFER, wt2, gl.STATIC_DRAW);
    var lv = gl.getAttribLocation(pr, "aV"); gl.enableVertexAttribArray(lv); gl.vertexAttribPointer(lv, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(U.uCrop, G.crop[0], G.crop[1], G.crop[2], G.crop[3]);
    gl.uniform4f(U.uEye, G.eye[0], G.eye[1], G.eye[2], G.eye[3]);
    gl.uniform4f(U.uMouth, G.mouth[0], G.mouth[1], G.mouth[2], G.mouth[3]);
    var AW = G.atlas[0], AH = G.atlas[1];
    gl.uniform4f(U.uEyeA, G.eyeAt[0] / AW, G.eyeAt[1] / AH, (G.eye[2] - G.eye[0]) / AW, (G.eye[3] - G.eye[1]) / AH);
    gl.uniform1i(U.uBase, 0); gl.uniform1i(U.uFx, 1);
    var tex = [gl.createTexture(), gl.createTexture()], scaled = -1;
    function upload(unit, img, s) {
      // ridimensionamento nel browser alla risoluzione che serve: niente mipmap, niente sfarfallio
      var w = Math.max(2, Math.round(img.naturalWidth * s)), h = Math.max(2, Math.round(img.naturalHeight * s)), src = img;
      if (s < 0.98) { var c2 = document.createElement("canvas"); c2.width = w; c2.height = h; var x = c2.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h); src = c2; }
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex[unit]);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return {
      gl: gl,
      textures: function (base, fx, s) {
        s = clamp(Math.ceil(s * 8) / 8, 0.25, 1);   // a gradini, per non ricaricare a ogni pixel di ridimensionamento
        if (s === scaled) return; scaled = s; upload(0, base, s); upload(1, fx, s);
      },
      draw: function (V, st) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform4f(U.uView, V.x, V.y, V.w, V.h);
        gl.uniform1f(U.uBreath, st.breath); gl.uniform4f(U.uHead, st.roll, st.dx, st.dy, st.nod);
        gl.uniform1f(U.uSway, st.sway); gl.uniform2f(U.uHair, st.hairL, st.hairR); gl.uniform1f(U.uArm, st.arm); gl.uniform1f(U.uLoupe, st.loupe); gl.uniform1f(U.uLean, st.lean);
        gl.uniform4f(U.uGlint, st.gx, st.gy, st.glint, st.grot);
        gl.uniform1f(U.uBlink, st.blink);
        var m = st.mouth | 0;
        gl.uniform1f(U.uMouthOn, m > 0 ? 1 : 0);
        if (m > 0) { var at = G.mouthAt[Math.min(m, 3) - 1]; gl.uniform4f(U.uMouthA, at[0] / AW, at[1] / AH, (G.mouth[2] - G.mouth[0]) / AW, (G.mouth[3] - G.mouth[1]) / AH); }
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[0]);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[1]);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }
    };
  }

  // ---------------------------------------------------------------- stato
  var el = {}, eng = null, imgs = { base: null, fx: null }, ready = false, built = false;
  var lang = "it", T = null;
  var V = null;                       // inquadratura corrente
  var A = {                           // animazione
    run: false, raf: 0, last: 0, t: 0,
    entered: false, entering: false, enterT0: 0, enterDur: 1400, x: 0, vx: 0,
    hairL: 0, hairR: 0, hvL: 0, hvR: 0,
    roll: 0, rollV: 0, rollTarget: 0, rollUntil: 0, lastRoll: 0,
    nods: [],                         // cenni in corso: {t0, amp, dur}
    blink: 0, nextBlink: 2.2, blinkT0: -1, dbl: false,
    arm: 0, armV: 0, armTarget: 0, armUntil: 0,                  // avambraccio con il diamante (molla)
    loupe: 0, loupeV: 0, loupeTarget: 0, loupeUntil: 0,          // mano con la lente (molla)
    lean: 0, leanV: 0, leanTarget: 0, leanUntil: 0,              // busto (molla)
    glintT0: -1, nextGlint: 1.6, glintP: [0, 0], glintDur: 0.75,  // riflesso sul diamante
    mouth: 0, mouthFix: null, mouthSrc: null,  // funzione che restituisce l'apertura (0–3) quando la voce è attiva
    talk: false                       // senza voce: la bocca dice il testo mentre compare
  };
  var P = {                           // racconto
    i: 0, started: false, playing: !RM, clock: 0, dur: 8000, reveal: 4000, shown: -1, words: [], hover: false, plan: [],
    visible: false, voice: false, speaking: false, ended: false, endClock: 0
  };

  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); }
  function wheelOpen() { return document.documentElement.classList.contains("uqw-lock"); }
  function steps() { return T.steps; }
  function nSteps() { return T.steps.length - 2; }   // i passi numerati (esclusi saluto e chiusura)

  // ---------------------------------------------------------------- costruzione
  function build() {
    if (built) return; built = true;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var s = document.createElement("section"); s.className = "uqa uqa-" + FIG; s.setAttribute("role", "region");
    s.innerHTML =
      '<div class="uqa-niche"><div class="uqa-fig pre"><img class="uqa-img" alt="" decoding="async"><canvas class="uqa-cv" aria-hidden="true"></canvas></div></div>' +
      '<div class="uqa-talk">' +
        '<div class="uqa-bub"><span class="uqa-eb"></span><h2 class="uqa-t"></h2><p class="uqa-s" aria-hidden="true"></p><p class="uqa-sr"></p>' +
          '<div class="uqa-end" hidden><button type="button" class="btn dark uqa-cta"></button><button type="button" class="lnk uqa-again"></button></div></div>' +
        '<div class="uqa-bar"><div class="uqa-dots"></div><div class="uqa-btns">' +
          '<button type="button" class="uqa-ib wide uqa-voice" hidden>' + ICON.voice + '<span></span></button>' +
          '<button type="button" class="uqa-ib uqa-prev">' + ICON.prev + '</button>' +
          '<button type="button" class="uqa-ib uqa-pp"></button>' +
          '<button type="button" class="uqa-ib uqa-next">' + ICON.next + '</button></div></div>' +
        '<p class="uqa-note" hidden></p>' +
      '</div>';
    el.root = s; el.niche = s.querySelector(".uqa-niche"); el.fig = s.querySelector(".uqa-fig");
    el.img = s.querySelector(".uqa-img"); el.cv = s.querySelector(".uqa-cv");
    el.bub = s.querySelector(".uqa-bub"); el.eb = s.querySelector(".uqa-eb"); el.t = s.querySelector(".uqa-t"); el.s = s.querySelector(".uqa-s"); el.sr = s.querySelector(".uqa-sr");
    el.end = s.querySelector(".uqa-end"); el.cta = s.querySelector(".uqa-cta"); el.again = s.querySelector(".uqa-again");
    el.dots = s.querySelector(".uqa-dots"); el.prev = s.querySelector(".uqa-prev"); el.next = s.querySelector(".uqa-next"); el.pp = s.querySelector(".uqa-pp");
    el.voice = s.querySelector(".uqa-voice"); el.note = s.querySelector(".uqa-note");
    if (TTS_PREVIEW && window.speechSynthesis) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener("voiceschanged", function () {}); } catch (e) {} }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); });

    el.prev.addEventListener("click", function () { go(P.i - 1, true); });
    el.next.addEventListener("click", function () { go(P.i + 1, true); });
    el.pp.addEventListener("click", function () { setPlaying(!P.playing); });
    el.again.addEventListener("click", function () { setPlaying(true); go(0, true); });
    el.cta.addEventListener("click", toAccount);
    el.voice.addEventListener("click", toggleVoice);
    el.dots.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) go(+b.getAttribute("data-i"), true); });
    el.bub.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") P.hover = true; });
    el.bub.addEventListener("pointerleave", function () { P.hover = false; });

    // immagini
    imgs.base = new Image(); imgs.base.decoding = "async"; imgs.base.src = ASSET + (G.img || "elena.webp");
    el.img.src = imgs.base.src;
    var waits = [loadImg(imgs.base)];
    if (!RM) {
      imgs.fx = new Image(); imgs.fx.src = ASSET + (G.fx || "elena-fx.webp"); waits.push(loadImg(imgs.fx));
      imgs.w = new Image(); imgs.w.src = G.weights; waits.push(loadImg(imgs.w));
    }
    Promise.all(waits).then(function () {
      ready = true;
      if (!RM) { try { eng = Engine(el.cv, weights(imgs.w)); } catch (e) { eng = null; } }
      if (!eng) el.cv.style.display = "none";
      layout(); measure(); maybeStart();
    }, function () { el.root.style.display = "none"; });

    window.addEventListener("resize", debounce(function () { layout(); measure(); }, 120));
    document.addEventListener("visibilitychange", loop);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { P.visible = es[0].intersectionRatio >= 0.3; if (P.visible) maybeStart(); loop(); }, { threshold: [0, 0.3, 0.6] }).observe(el.niche);
    } else P.visible = true;
    new MutationObserver(function () { maybeStart(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    el.cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); eng = null; el.cv.style.display = "none"; el.img.style.visibility = ""; });
  }
  function weights(im) {
    var c = document.createElement("canvas"); c.width = (G.grid[0] + 1) * 2; c.height = G.grid[1] + 1;
    var x = c.getContext("2d"); x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  }
  function loadImg(im) { return new Promise(function (ok, ko) { if (im.complete && im.naturalWidth) return ok(); im.onload = function () { ok(); }; im.onerror = ko; }); }
  function debounce(f, ms) { var t; return function () { clearTimeout(t); t = setTimeout(f, ms); }; }

  // ---------------------------------------------------------------- inquadratura
  function layout() {
    if (!el.niche) return;
    var w = el.niche.clientWidth, h = el.niche.clientHeight; if (!w || !h) return;
    var bottom = w / h > 0.8 ? G.bottomWide : G.bottomTall;   // nicchia larga (telefono): fino alla lente; alta: figura intera
    var vh = bottom - G.top, vw = vh * w / h;
    V = { x: G.cx - vw / 2, y: G.top, w: vw, h: vh, pw: w, ph: h };
    var k = w / vw;                                // px CSS per px dell'originale
    var st = el.img.style;
    st.left = ((G.crop[0] - V.x) * k) + "px"; st.top = ((G.crop[1] - V.y) * k) + "px"; st.width = (G.crop[2] * k) + "px"; st.height = (G.crop[3] * k) + "px";
    if (eng) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.cv.width = Math.round(w * dpr); el.cv.height = Math.round(h * dpr);
      eng.textures(imgs.base, imgs.fx, k * dpr * 1.15);
      drawFrame();
    }
  }

  // ---------------------------------------------------------------- avvio
  function maybeStart() {
    if (!ready || !T || P.started || !P.visible || wheelOpen()) return;
    if (!V) layout(); if (!V) return;
    P.started = true;
    if (eng && !RM) {
      A.entering = true; A.enterT0 = now(); A.x = enterDir() * 0.78 * V.pw;
      el.fig.style.transform = "translate3d(" + (enterDir() * 0.78 * V.pw).toFixed(1) + "px,0,0)";
    } else { A.entered = true; }
    el.fig.classList.remove("pre");
    loop();
    go(0, false);
  }

  // ---------------------------------------------------------------- ciclo
  function loop() {
    var want = ready && P.started && P.visible && !document.hidden;
    if (want && !A.run) { A.run = true; A.last = now(); A.raf = requestAnimationFrame(tick); }
    else if (!want && A.run) { A.run = false; cancelAnimationFrame(A.raf); }
  }
  function tick() {
    if (!A.run) return;
    var t = now(), dt = Math.min(0.05, (t - A.last) / 1000); A.last = t; A.t += dt;
    animate(dt, t);
    story(dt * 1000);
    drawFrame();
    A.raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- animazione
  var ST = { breath: 0, roll: 0, dx: 0, dy: 0, nod: 0, sway: 0, hairL: 0, hairR: 0, arm: 0, loupe: 0, lean: 0, blink: 0, mouth: 0, gx: 0, gy: 0, glint: 0, grot: 0 };
  function enterDir() { return document.documentElement.dir === "rtl" ? 1 : -1; }
  function animate(dt, t) {
    if (!V) return;
    var tt = A.t, dir = enterDir();
    // ingresso: entra di lato nella nicchia, con due passi accennati
    var x = 0, y = 0;
    if (A.entering) {
      var p = clamp((t - A.enterT0) / A.enterDur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      x = dir * 0.78 * V.pw * (1 - e);
      y = -Math.abs(Math.sin(p * Math.PI * 3)) * 5 * (1 - p);
      if (p >= 1) { A.entering = false; A.entered = true; gesture("hello"); }
    }
    A.vx = dt > 0 ? (x - A.x) / dt : 0; A.x = x;
    el.fig.style.transform = (x || y) ? "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)" : "";
    var vxSrc = A.vx * (V.w / V.pw);               // velocità in px dell'originale al secondo
    // respiro
    var breath = Math.sin(tt * 2 * Math.PI / 4.4);
    // testa: deriva lenta + gesti (molla)
    if (A.rollUntil && t > A.rollUntil) { A.rollTarget = 0; A.rollUntil = 0; }
    var kR = 38, cR = 9;
    A.rollV += (kR * (A.rollTarget - A.roll) - cR * A.rollV) * dt; A.roll += A.rollV * dt;
    var roll = 0.016 * Math.sin(tt * 0.31) + 0.008 * Math.sin(tt * 0.83 + 1.3) + A.roll - clamp(vxSrc * 0.000012, -0.03, 0.03);
    var dx = 2.6 * Math.sin(tt * 0.27 + 0.5), dy = 1.4 * Math.sin(tt * 0.41 + 2.1) - 0.8 * breath;
    var nod = 0;
    A.nods = A.nods.filter(function (n) { var u = (t - n.t0) / n.dur; if (u >= 1) return false; if (u > 0) nod += n.amp * Math.sin(Math.PI * u) * (1 - 0.35 * u); return true; });
    var rollVel = (roll - A.lastRoll) / Math.max(dt, 1e-3); A.lastRoll = roll;
    // capelli: molle che inseguono un'onda leggera e reagiscono al movimento
    var tgL = 2.0 * Math.sin(tt * 1.05 + 0.3) - vxSrc * 0.010 - rollVel * 26;
    var tgR = 2.0 * Math.sin(tt * 1.05 + 1.9) - vxSrc * 0.010 - rollVel * 26;
    var kH = 26, cH = 4.2;
    A.hvL += (kH * (tgL - A.hairL) - cH * A.hvL) * dt; A.hairL += A.hvL * dt;
    A.hvR += (kH * (tgR - A.hairR) - cH * A.hvR) * dt; A.hairR += A.hvR * dt;
    // peso che passa da un piede all'altro, e il busto che compensa appena
    var sway = 0.0042 * Math.sin(tt * 0.45) + 0.0016 * Math.sin(tt * 1.13 + 0.7) + clamp(vxSrc * 0.000005, -0.012, 0.012);
    // battito di ciglia
    if (A.blinkT0 < 0 && tt >= A.nextBlink && !A.entering) { A.blinkT0 = tt; }
    var blink = 0;
    if (A.blinkT0 >= 0) {
      var b = (tt - A.blinkT0) * 1000;
      blink = b < 65 ? b / 65 : b < 115 ? 1 : b < 215 ? 1 - (b - 115) / 100 : 0;
      if (b >= 215) { A.blinkT0 = -1; A.dbl = !A.dbl && Math.random() < 0.18; A.nextBlink = tt + (A.dbl ? 0.16 : 2.4 + Math.random() * 3.4); }
    }
    // avambraccio: un'oscillazione appena percettibile, più i gesti (molla)
    if (A.armUntil && t > A.armUntil) { A.armTarget = 0; A.armUntil = 0; }
    A.armV += (30 * (A.armTarget - A.arm) - 8 * A.armV) * dt; A.arm += A.armV * dt;
    var arm = A.arm + 0.010 * Math.sin(tt * 0.62 + 0.4) + 0.004 * Math.sin(tt * 1.37) - 0.25 * sway;
    if (A.loupeUntil && t > A.loupeUntil) { A.loupeTarget = 0; A.loupeUntil = 0; }
    A.loupeV += (22 * (A.loupeTarget - A.loupe) - 6 * A.loupeV) * dt; A.loupe += A.loupeV * dt;
    var loupe = A.loupe + 0.010 * Math.sin(tt * 0.47 + 2.0) + 0.5 * sway;                 // la mano che pende segue il peso
    if (A.leanUntil && t > A.leanUntil) { A.leanTarget = 0; A.leanUntil = 0; }
    A.leanV += (18 * (A.leanTarget - A.lean) - 6.5 * A.leanV) * dt; A.lean += A.leanV * dt;
    var lean = A.lean - 0.9 * sway + 0.003 * Math.sin(tt * 0.83 + 1.1) + (A.talk ? 0.0025 * Math.sin(tt * 2.1) : 0);
    // riflesso sul diamante: ogni tanto, su una faccetta diversa
    if (A.glintT0 < 0 && tt >= A.nextGlint && !A.entering && G.glints && G.glints.length) { A.glintT0 = tt; A.glintP = G.glints[(Math.random() * G.glints.length) | 0]; }
    var glint = 0, grot = 0;
    if (A.glintT0 >= 0) {
      var gu = (tt - A.glintT0) / A.glintDur;
      if (gu >= 1) { A.glintT0 = -1; A.nextGlint = tt + 3.2 + Math.random() * 3.6; }
      else { glint = Math.pow(Math.sin(Math.PI * gu), 2) * 0.95; grot = 0.25 + 0.5 * gu; }
    }
    // bocca
    var m = 0;
    if (A.mouthFix != null) m = A.mouthFix | 0;
    else if (A.mouthSrc) { try { m = A.mouthSrc() | 0; } catch (e) { m = 0; } }
    else if (A.talk) m = planMouth(P.plan, P.clock);
    ST.breath = breath; ST.roll = roll; ST.dx = dx; ST.dy = dy + nod * 0.5; ST.nod = nod; ST.sway = sway;
    ST.hairL = clamp(A.hairL, -9, 9); ST.hairR = clamp(A.hairR, -9, 9); ST.blink = A.blinkFix != null ? A.blinkFix : blink; ST.mouth = m;
    var ar = G.armRange || [-0.10, 0.08], lr = G.loupeRange || [-0.06, 0.16];
    ST.arm = A.armFix != null ? A.armFix : clamp(arm, ar[0], ar[1]);
    ST.loupe = clamp(loupe, lr[0], lr[1]); ST.lean = clamp(lean, -0.03, 0.03);
    ST.gx = A.glintP[0]; ST.gy = A.glintP[1]; ST.glint = glint; ST.grot = grot;
  }
  function drawFrame() {
    if (!eng || !V) return;
    eng.draw(V, ST);
    if (el.img.style.visibility !== "hidden") el.img.style.visibility = "hidden";
  }
  function side() { return document.documentElement.dir === "rtl" ? -1 : 1; }   // verso il fumetto
  // figura a mani libere: il braccio verso il fumetto è quello a destra nell'immagine («arm», apre con angoli negativi);
  // con l'arabo il fumetto sta a sinistra e lavora l'altro («loupe», apre con angoli positivi)
  function reach(t, amount, ms) {
    if (side() > 0) { A.armTarget = -amount; A.armUntil = t + ms; } else { A.loupeTarget = amount; A.loupeUntil = t + ms; }
  }
  function gestureFree(name, t) {
    if (name === "show") name = "open"; else if (name === "loupe") name = "present";
    if (name === "hello") { A.rollTarget = 0.04 * side(); A.rollUntil = t + 900; A.nods.push({ t0: t + 120, amp: 5, dur: 650 }); reach(t, 0.12, 1000); A.leanTarget = 0.008 * side(); A.leanUntil = t + 900; }
    else if (name === "open") { A.armTarget = -0.085; A.armUntil = t + 1300; A.loupeTarget = 0.085; A.loupeUntil = t + 1300; A.nods.push({ t0: t + 200, amp: 3, dur: 600 }); }
    else if (name === "present") { reach(t, 0.10, 1500); A.leanTarget = 0.012 * side(); A.leanUntil = t + 1500; A.rollTarget = 0.02 * side(); A.rollUntil = t + 1300; }
    else return false;
    return true;
  }
  function gesture(name) {
    var t = now();
    if (FIG === "libera" && gestureFree(name, t)) return;
    if (name === "hello") { A.rollTarget = 0.045; A.rollUntil = t + 900; A.nods.push({ t0: t + 120, amp: 5, dur: 650 }); A.armTarget = -0.06; A.armUntil = t + 800; A.nextGlint = A.t + 0.5; A.leanTarget = 0.01 * side(); A.leanUntil = t + 900; }
    else if (name === "show" && FIG !== "libera") { A.armTarget = -0.075; A.armUntil = t + 1100; A.nextGlint = A.t + 0.35; A.leanTarget = 0.008 * side(); A.leanUntil = t + 1200; }
    else if (name === "loupe" && FIG !== "libera") { A.loupeTarget = 0.11; A.loupeUntil = t + 1500; A.nods.push({ t0: t + 250, amp: 3, dur: 600 }); }
    else if (name === "lean") { A.leanTarget = 0.014 * side(); A.leanUntil = t + 1600; A.rollTarget = 0.02 * side(); A.rollUntil = t + 1300; }
    else if (name === "nod") { A.nods.push({ t0: t, amp: 4, dur: 520 }); }
    else if (name === "beat") { A.nods.push({ t0: t, amp: 1.8, dur: 380 }); }
    else if (name === "blink") { A.nextBlink = A.t; A.blinkT0 = -1; }
    else if (name === "tilt") { A.rollTarget = (Math.random() < 0.5 ? -1 : 1) * (0.018 + Math.random() * 0.016); A.rollUntil = t + 1500 + Math.random() * 900; }
  }

  // ---------------------------------------------------------------- racconto
  function renderStep() {
    var S = steps()[P.i], n = nSteps(), num = P.i >= 1 && P.i <= n;
    el.eb.textContent = T.ui.eyebrow + (num ? " · " + fmt(T.ui.stepOf, { n: P.i, t: n }) : "");
    el.t.textContent = S.t;
    var words = S.s.split(/(\s+)/), h = "", pos = 0; P.words = [];
    for (var k = 0; k < words.length; k++) {
      var w = words[k]; if (!w) continue;
      if (/^\s+$/.test(w)) { h += w; pos += w.length; continue; }
      pos += w.length; P.words.push({ end: pos, p: /[.!?:;]$/.test(w) ? 2 : /,$/.test(w) ? 1 : 0 });
      h += '<span class="h">' + esc(w) + '</span>';
    }
    el.s.innerHTML = h; P.spans = el.s.querySelectorAll("span"); P.shown = -1; P.chars = S.s.length;
    el.sr.textContent = S.t + ". " + S.s;
    el.end.hidden = P.i !== steps().length - 1;
    el.cta.textContent = T.ui.cta; el.again.textContent = T.ui.replay;
    var d = "";
    for (var j = 1; j <= n; j++) d += '<button type="button" data-i="' + j + '" class="' + (j === P.i ? "on" : j < P.i ? "done" : "") + '"' + (j === P.i ? ' aria-current="step"' : "") + ' aria-label="' + esc(fmt(T.ui.stepOf, { n: j, t: n }) + ": " + steps()[j].t) + '">' + j + '</button>';
    el.dots.innerHTML = d;
    el.prev.disabled = P.i === 0; el.next.disabled = P.i === steps().length - 1;
    el.prev.setAttribute("aria-label", T.ui.prev); el.next.setAttribute("aria-label", T.ui.next);
    syncButtons();
    if (RM || !A.run) revealTo(P.chars);
  }
  function syncButtons() {
    el.pp.innerHTML = P.playing ? ICON.pause : ICON.play;
    el.pp.setAttribute("aria-label", P.playing ? T.ui.pause : T.ui.play);
    el.pp.disabled = P.i === steps().length - 1 && !P.playing;
    var hasVoice = TTS_PREVIEW ? !!window.speechSynthesis : VOICE_LANGS.indexOf(lang) >= 0;
    el.voice.hidden = !hasVoice;
    el.voice.classList.toggle("on", P.voice);
    el.voice.querySelector("span").textContent = P.voice ? T.ui.stopVoice : T.ui.listen;
    el.voice.setAttribute("aria-pressed", P.voice ? "true" : "false");
    el.note.hidden = !(TTS_PREVIEW && P.voice); el.note.textContent = T.ui.voicePreview;
    el.sr.setAttribute("aria-live", P.playing ? "off" : "polite");
  }
  function revealTo(chars) {
    var n = 0; while (n < P.words.length && P.words[n].end <= chars) n++;
    if (chars >= P.chars) n = P.words.length;
    if (n - 1 === P.shown) return;
    for (var k = P.shown + 1; k < n; k++) {
      P.spans[k].classList.remove("h");
      // il corpo accompagna le pause del discorso (anche senza voce)
      if (A.entered && !P.voice && P.words[k].p === 2) gesture("beat");
    }
    for (var k2 = n; k2 <= P.shown; k2++) P.spans[k2].classList.add("h");
    P.shown = n - 1;
  }
  function go(i, user) {
    i = clamp(i, 0, steps().length - 1);
    stopVoice();
    P.i = i; P.clock = 0; P.ended = false; P.endClock = 0;
    var len = steps()[i].s.length;
    P.reveal = Math.max(900, len * 60);      // il testo compare a ritmo di voce, e la bocca lo dice…
    P.dur = P.reveal + 1500;                 // …poi resta il tempo di finire di leggerlo
    P.plan = ttsPlan(steps()[i].s, 0, P.reveal / Math.max(1, len), true);
    if (i === steps().length - 1) { P.playing = false; }
    renderStep();
    var gs = { saluto: "", valutazione: "loupe", palinsesto: "lean", "in-onda": "show", fine: "show" }[steps()[i].id];
    if (A.entered && i > 0) gesture(gs || (Math.random() < 0.6 ? "nod" : "tilt"));
    if (P.voice) speak();
    if (user) el.sr.setAttribute("aria-live", "polite");
  }
  function setPlaying(on) {
    P.playing = on;
    if (on && P.i === steps().length - 1) { go(0, true); return; }
    if (!on) pauseVoice(); else if (P.voice) resumeVoice();
    syncButtons();
  }
  function story(ms) {
    if (!T || !A.entered) { A.talk = false; return; }
    var last = steps().length - 1;
    if (P.voice) A.talk = false;
    if (P.voice) {
      if (!P.playing) { revealTo(P.chars); return; }
      if (P.speaking) { revealTo(Math.round(voiceProgress() * P.chars)); return; }
      if (P.ended) {
        revealTo(P.chars); P.endClock += ms;
        if (P.endClock > 700 && P.i < last && !wheelOpen()) go(P.i + 1, false);
      }
      return;
    }
    A.talk = false;
    if (!P.playing) { revealTo(P.chars); return; }
    if (P.hover) { P.clock = Math.max(P.clock, P.reveal); revealTo(P.chars); return; }   // chi legge con il mouse sopra non viene incalzato
    if (wheelOpen()) return;
    P.clock += ms;
    A.talk = P.clock < P.reveal;
    revealTo(Math.round(P.chars * clamp(P.clock / P.reveal, 0, 1)));
    if (P.clock >= P.dur && P.i < last) go(P.i + 1, false);
  }
  function toAccount() {
    var box = document.getElementById("acct");
    setPlaying(false);
    if (!box) return;
    box.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
    setTimeout(function () { var f = box.querySelector("#aEmail") || box.querySelector("input:not([type=hidden])") || box.querySelector("button"); if (f) f.focus({ preventScroll: true }); }, RM ? 0 : 650);
  }

  // ---------------------------------------------------------------- voce
  var AU = { ctx: null, el: null, an: null, buf: null, peak: 0.08, lvl: 0, hold: 0 };
  function toggleVoice() {
    if (P.voice) { P.voice = false; stopVoice(); syncButtons(); return; }
    P.voice = true; P.playing = true;
    if (!TTS_PREVIEW) ensureAudio();
    syncButtons();
    go(P.i === steps().length - 1 ? 0 : P.i, true);
  }
  function ensureAudio() {
    if (AU.el) { if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume(); return; }
    AU.el = new Audio(); AU.el.preload = "auto";
    AU.el.addEventListener("ended", function () { P.speaking = false; P.ended = true; P.endClock = 0; A.mouthSrc = null; });
    AU.el.addEventListener("error", function () { P.speaking = false; P.ended = true; A.mouthSrc = null; });
    try {
      var C = window.AudioContext || window.webkitAudioContext; AU.ctx = new C();
      var src = AU.ctx.createMediaElementSource(AU.el); AU.an = AU.ctx.createAnalyser(); AU.an.fftSize = 1024;
      src.connect(AU.an); AU.an.connect(AU.ctx.destination); AU.buf = new Float32Array(AU.an.fftSize);
    } catch (e) { AU.ctx = null; AU.an = null; }
  }
  // apertura della bocca dall'ampiezza dell'audio, con controllo automatico del livello e tenuta minima
  function audioMouth() {
    if (!AU.an) return Math.random() < 0.5 ? 2 : 1;
    AU.an.getFloatTimeDomainData(AU.buf);
    var s = 0; for (var k = 0; k < AU.buf.length; k++) s += AU.buf[k] * AU.buf[k];
    var rms = Math.sqrt(s / AU.buf.length);
    AU.peak = Math.max(rms, AU.peak * 0.995, 0.02);
    var v = rms / AU.peak, l = v > 0.66 ? 3 : v > 0.4 ? 2 : v > 0.15 ? 1 : 0;
    var t = now(); if (l !== AU.lvl && t > AU.hold) { AU.lvl = l; AU.hold = t + 55; }
    return AU.lvl;
  }
  function speak() {
    var S = steps()[P.i];
    P.speaking = true; P.ended = false; P.endClock = 0;
    if (TTS_PREVIEW) return ttsSpeak(S.s);
    ensureAudio();
    AU.el.src = ASSET + "voce/" + lang + "/" + S.id + ".mp3";
    A.mouthSrc = audioMouth;
    var pl = AU.el.play(); if (pl && pl.catch) pl.catch(function () { P.voice = false; P.speaking = false; A.mouthSrc = null; syncButtons(); });
  }
  function voiceProgress() {
    if (TTS_PREVIEW) return TTS.progress();
    if (!AU.el || !AU.el.duration) return 0;
    return clamp(AU.el.currentTime / AU.el.duration * 1.08, 0, 1);
  }
  function stopVoice() {
    P.speaking = false; P.ended = false; A.mouthSrc = null;
    if (AU.el) { try { AU.el.pause(); } catch (e) {} }
    if (TTS_PREVIEW && window.speechSynthesis) { TTS.gen++; speechSynthesis.cancel(); }
  }
  function pauseVoice() { if (!P.voice) return; if (AU.el && !TTS_PREVIEW) AU.el.pause(); if (TTS_PREVIEW) { stopVoice(); } A.mouthSrc = null; }
  function resumeVoice() {
    if (!P.voice) return;
    if (TTS_PREVIEW) { speak(); return; }
    if (AU.el && AU.el.src && !P.ended) { A.mouthSrc = audioMouth; AU.el.play(); } else speak();
  }

  // Anteprima con la voce del browser: la bocca segue il testo (sillabe e vocali), non l'audio.
  var TTS = {
    gen: 0, t0: 0, est: 1, plan: [],
    progress: function () { if (!this.t0) return 0; return clamp((now() - this.t0) / this.est, 0, 1); },
    mouth: function () {
      var t = now() - this.t0, p = this.plan;
      for (var k = 0; k < p.length; k++) if (t >= p[k][0] && t < p[k][1]) return p[k][2];
      return 0;
    }
  };
  function planMouth(p, t) {
    for (var k = 0; k < p.length; k++) { if (t < p[k][0]) return 0; if (t < p[k][1]) return p[k][2]; }
    return 0;
  }
  function ttsPlan(text, offsetMs, msPerChar, even) {
    // per ogni sillaba: bocca aperta secondo la vocale, poi un attimo chiusa
    var out = [], t = offsetMs, re = /[^\s]+|\s+/g, m;
    while ((m = re.exec(text))) {
      var w = m[0];
      if (/^\s+$/.test(w)) { t += msPerChar * w.length; continue; }
      var dur = msPerChar * w.length, syl = w.toLowerCase().match(/[aeiouàèéìòóùyаеёиоуыэюяاوي]+/g) || ["e"], sd = dur / syl.length;
      for (var k = 0; k < syl.length; k++) {
        var v = syl[k], o = /[aàаا]/.test(v) ? 3 : /[eèéoòóеёэоو]/.test(v) ? 2 : 1;
        out.push([t + k * sd, t + k * sd + sd * 0.72, o]);
      }
      t += dur; if (!even && /[.,;:!?]$/.test(w)) t += msPerChar * 4;
    }
    return out;
  }
  function ttsSpeak(text) {
    var ss = window.speechSynthesis, gen = ++TTS.gen, mpc = 62, u = null;
    TTS.t0 = 0; TTS.est = text.length * mpc; TTS.plan = [];
    function begin() { if (gen !== TTS.gen || TTS.t0) return; TTS.t0 = now(); TTS.plan = ttsPlan(text, 0, mpc); A.mouthSrc = function () { return TTS.mouth(); }; }
    function finish() { if (gen !== TTS.gen) return; TTS.gen++; P.speaking = false; P.ended = true; P.endClock = 0; A.mouthSrc = null; }
    // senza voci nel browser, o se la voce non parte entro 1,5 secondi, la bocca segue lo stesso il testo, in silenzio
    function simulate() {
      if (gen !== TTS.gen || TTS.t0) return;
      if (u) { u.onstart = u.onend = u.onerror = u.onboundary = null; try { ss.cancel(); } catch (e) {} }
      begin(); setTimeout(finish, TTS.est + 300);
    }
    setTimeout(simulate, ss ? 1500 : 0);
    if (!ss) return;
    try { ss.cancel(); } catch (e) {}
    u = new SpeechSynthesisUtterance(text);
    var L = { it: "it-IT", en: "en-GB", fr: "fr-FR", ru: "ru-RU", ar: "ar-SA" }[lang] || "it-IT";
    u.lang = L; u.rate = 1;
    var vs = ss.getVoices().filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(L.slice(0, 2)) === 0; });
    var fem = vs.filter(function (v) { return /female|donna|alice|elsa|federica|paola|samantha|amelie|audrey|milena|google/i.test(v.name); });
    if (fem.length || vs.length) u.voice = fem[0] || vs[0];
    u.onstart = begin;
    u.onboundary = function (e) {
      if (gen !== TTS.gen || e.name === "sentence" || !TTS.t0) return;
      // risincronizza il piano sulla parola che il browser sta pronunciando
      var t = now() - TTS.t0, rest = text.slice(e.charIndex);
      TTS.plan = TTS.plan.filter(function (x) { return x[1] < t; }).concat(ttsPlan(rest, t, mpc));
      TTS.est = t + rest.length * mpc;
    };
    u.onend = u.onerror = function () { if (TTS.t0) finish(); else simulate(); };
    ss.speak(u);
  }

  // ---------------------------------------------------------------- misura del fumetto (niente salti fra un passo e l'altro)
  function measure() {
    if (!el.bub || !T) return;
    el.bub.style.minHeight = "";
    if (getComputedStyle(el.root).gridTemplateColumns.split(" ").length > 1) return;   // due colonne: l'altezza la dà la nicchia
    var c = el.bub.cloneNode(true); c.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;width:" + el.bub.offsetWidth + "px;min-height:0";
    c.querySelector(".uqa-end").hidden = false;
    el.bub.parentNode.appendChild(c);
    var max = 0, cs = c.querySelector(".uqa-s"), ct = c.querySelector(".uqa-t"), ce = c.querySelector(".uqa-eb");
    steps().forEach(function (S, i) {
      ce.textContent = T.ui.eyebrow + " · " + fmt(T.ui.stepOf, { n: 6, t: 6 }); ct.textContent = S.t; cs.textContent = S.s;
      c.querySelector(".uqa-end").hidden = i !== steps().length - 1;
      max = Math.max(max, c.offsetHeight);
    });
    c.parentNode.removeChild(c);
    el.bub.style.minHeight = max + "px";
  }

  // ---------------------------------------------------------------- API
  function mount(slot, l, opts) {
    if (!slot) return;
    // la figura si sceglie al primo mount (poi resta quella): opzione, data-figura sul contenitore, ?figura= per le prove
    if (!built) { var f0 = (opts && opts.figura) || slot.getAttribute("data-figura") || QS.get("figura"); if (f0) pick(f0); }
    build();
    var nl = TXT[l] ? l : (TXT[lang] ? lang : "it"), changed = nl !== lang || !T;
    lang = nl; T = TXT[lang];
    if (!T) return;
    if (el.root.parentNode !== slot) slot.appendChild(el.root);
    el.root.setAttribute("aria-label", T.ui.region);
    el.img.alt = T.ui.alt;
    if (changed) { if (P.started) go(P.i, false); else renderStep(); }
    requestAnimationFrame(function () { layout(); measure(); });
    maybeStart();
  }
  window.UQAvatar = {
    mount: mount,
    gesture: gesture,
    // per prove e integrazioni future: apertura della bocca 0–3 (null = torna automatica)
    mouth: function (lv) { A.mouthFix = lv == null ? null : lv; },
    // fa dire all'avatar una frase con un file audio: la bocca segue l'audio
    say: function (url) { ensureAudio(); AU.el.src = url; A.mouthSrc = audioMouth; return AU.el.play(); },
    _blink: function (v) { A.blinkFix = v == null ? null : +v; },   // solo per i collaudi
    // per girare i video fotogramma per fotogramma: ferma il ciclo e avanza di ms millisecondi a ogni chiamata
    _step: function (ms) {
      if (A.run) { A.run = false; cancelAnimationFrame(A.raf); }
      if (!VT.on) { VT.t = performance.now(); VT.on = true; }
      VT.t += ms; A.t += ms / 1000; animate(ms / 1000, VT.t); story(ms); drawFrame();
    },
    state: function () { return { step: P.i, playing: P.playing, voice: P.voice, webgl: !!eng, lang: lang, figura: FIG }; }
  };
  var slot0 = document.getElementById("uqaSlot");
  if (slot0) mount(slot0, document.documentElement.lang || "it");
})();

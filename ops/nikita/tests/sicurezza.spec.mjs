// Sicurezza vista dall'esterno, senza test intrusivi: nessuna chiave riservata nelle pagine, pannelli chiusi senza la chiave giusta.
import { test, expect, controllo, prepara, prova } from "./_aiuti.mjs";

const PAGINE = ["/", "/join/", "/pay/", "/admin/", "/wheel-admin/", "/rossi/panel/", "/marchetti/profile/", "/marchetti/", "/_panel.html", "/_viewer.html", "/_landing.html", "/_profile.html", "/sw.js"];

function payloadJwt(t) {
  try { return JSON.parse(Buffer.from(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { return null; }
}

test("[e2e.sicurezza.segreti] Nessuna chiave riservata nelle pagine pubblicate", async ({ request, baseURL }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.sicurezza.segreti", { area: "sicurezza", gravita: "P0", impatto: "Una chiave riservata nel codice delle pagine dà accesso completo a chiunque.", correzione: "Togliere la chiave dalla pagina e RUOTARLA subito (Supabase, Stripe, Resend, LiveKit)." });
  const trovati = [];
  let n = 0;
  for (const p of PAGINE) {
    const r = await request.get(baseURL + p);
    if (r.status() !== 200) continue;
    const testo = await r.text(); n++;
    const regole = [
      [/sk_live_[0-9A-Za-z]{10,}/, "chiave Stripe di produzione"], [/sk_test_[0-9A-Za-z]{10,}/, "chiave Stripe di prova"],
      [/whsec_[0-9A-Za-z]{10,}/, "segreto del webhook Stripe"], [/sb_secret_[0-9A-Za-z_-]{10,}/, "chiave segreta Supabase"],
      [/\bre_[0-9A-Za-z]{8,}_[0-9A-Za-z]{8,}/, "chiave Resend"], [/service_role/, "riferimento alla chiave service_role"],
      [/LIVEKIT_API_SECRET|MAILER_SECRET|STRIPE_SECRET_KEY/, "nome di un segreto con possibile valore"],
    ];
    for (const [re, nome] of regole) if (re.test(testo)) trovati.push(`${p}: ${nome}`);
    for (const m of testo.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
      const pl = payloadJwt(m[0]);
      if (pl && pl.role && pl.role !== "anon") trovati.push(`${p}: token con ruolo ${pl.role}`);
    }
  }
  prova(`${n} pagine esaminate`);
  expect(n).toBeGreaterThan(5);
  expect(trovati, "chiavi riservate esposte").toEqual([]);
});

test("[e2e.sicurezza.pannelli] Pannelli chiusi senza la chiave giusta", async ({ page }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.sicurezza.pannelli", { area: "sicurezza", gravita: "P0", impatto: "Pannelli di regia o di amministrazione accessibili senza autorizzazione.", correzione: "Controllare staff_check / is_gemologist e i template dei pannelli." });
  const falsa = "deadbeefdeadbeefdeadbeefdeadbeef";
  const st = await prepara(page);

  // regia del venditore: senza chiave e con chiave falsa → «Accesso non valido», nessun dato
  for (const q of ["", `?k=${falsa}`]) {
    await page.goto(`/rossi/panel/${q}`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const app = await page.locator("#app").isVisible();
    expect(app, `regia aperta con «${q || "nessuna chiave"}»`).toBe(false);
  }
  await expect(page.locator("#denied")).toBeVisible();

  // ruota: pannello della gemmologa con chiave falsa
  await page.goto(`/wheel-admin/?k=${falsa}`, { waitUntil: "load" });
  await expect(page.locator("#app")).toContainText(/non valid|Token|chiave|invalid/i, { timeout: 10_000 });
  await expect(page.locator("#goLive, #saveCfg")).toHaveCount(0);

  // pannello candidature e pagamenti con chiave falsa
  await page.goto(`/admin/?k=${falsa}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const testo = await page.locator("#app").innerText().catch(() => "");
  prova(`/admin con chiave falsa: «${testo.slice(0, 120)}»`);
  expect(await page.locator("#app [data-id], #app table tr td").count(), "nessun dato di candidature o seller").toBe(0);
  expect(st.errori).toEqual([]);
});

test("[e2e.sicurezza.pagamento] /pay con un link falso non apre nessun pagamento", async ({ page }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.sicurezza.pagamento", { area: "abbonamenti", gravita: "P1", impatto: "Un link di pagamento falso apre una pagina di pagamento.", correzione: "Controllare la funzione billing (azione checkout)." });
  const st = await prepara(page);
  let stripe = false;
  page.on("request", (r) => { if (/checkout\.stripe\.com|buy\.stripe\.com/.test(r.url())) stripe = true; });
  for (const q of ["", "?t=00000000000000000000000000000000"]) {
    await page.goto(`/pay/${q}`, { waitUntil: "load" });
    await expect(page.locator("#box h1"), "la pagina deve spiegare cosa succede").not.toBeEmpty({ timeout: 10_000 });
  }
  expect(stripe, "nessun reindirizzamento a Stripe con un link falso").toBe(false);
  prova(`messaggio: «${(await page.locator("#box h1").innerText()).slice(0, 80)}»`);
  expect(st.errori).toEqual([]);
});

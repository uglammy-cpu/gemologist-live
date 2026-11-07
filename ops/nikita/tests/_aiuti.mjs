// Strumenti comuni del collaudo di Nikita.
//
// REGOLA: i test non scrivono mai nei dati veri. Ogni chiamata che scriverebbe (statistiche della ruota, ingressi in diretta,
// richieste sui pezzi, «abbonami», account) viene intercettata qui: il test verifica che la pagina la faccia, con i dati giusti,
// e riceve una risposta finta. Le letture passano, così il test vede la piattaforma vera.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";

export { test, expect };

export const SUPABASE = "https://itoxzepuukyvdxxtfetf.supabase.co";
export const ANON = "sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk";
export const DEMO = ["rossi", "ferri", "lombardi", "marchetti", "pietrerare"];

// RPC di sola lettura che lasciamo passare
const LETTURE = new Set(["wheel_state", "list_nights", "list_template", "site_terms", "my_payment_links", "get_application_by_token", "account_me",
  "staff_check", "is_gemologist", "wheel_admin_get", "seller_admin_list", "list_outbox", "list_applications", "list_sellers", "list_declarations"]);
const MARCA = { "x-nikita": "intercettata" };

/** Dichiara a quale controllo del registro corrisponde il test. */
export function controllo(id, { area, gravita, impatto, correzione } = {}) {
  const a = test.info().annotations;
  a.push({ type: "check", description: id });
  if (area) a.push({ type: "area", description: area });
  if (gravita) a.push({ type: "severity", description: gravita });
  if (impatto) a.push({ type: "impact", description: impatto });
  if (correzione) a.push({ type: "fix", description: correzione });
}

/** Esito degradato ma non rotto (lento, parziale): il test passa e il registro lo segna come «parziale». */
export function parziale(motivo) { test.info().annotations.push({ type: "parziale", description: motivo }); }
/** Prova da allegare all'esito (numeri, misure). */
export function prova(testo) { test.info().annotations.push({ type: "prova", description: String(testo).slice(0, 300) }); }
/** Non verificabile: finisce nel registro come NOT TESTED, non come superato. */
export function nonTestato(motivo) { test.info().annotations.push({ type: "non_testato", description: motivo }); test.skip(true, motivo); }

/**
 * Prepara la pagina: intercetta le scritture, raccoglie errori JavaScript, errori di console e risposte fallite.
 * Restituisce un oggetto con gli elenchi da controllare a fine test.
 */
export async function prepara(page, { ignora = [] } = {}) {
  const st = { scritture: [], errori: [], console: [], fallite: [], premi: [], fughe: [] };
  page.on("pageerror", (e) => st.errori.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") st.console.push(m.text()); });
  page.on("response", (r) => {
    const u = r.url();
    // rete di sicurezza: una scrittura arrivata al database vero senza passare dall'intercettazione fa fallire il test
    const req = r.request(), rpcN = (u.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/) || [])[1];
    const scrive = /supabase\.co\/(rest|auth)\/v1\//.test(u) && req.method() !== "GET" && req.method() !== "HEAD" && req.method() !== "OPTIONS" && !(rpcN && LETTURE.has(rpcN));
    if (scrive && r.headers()["x-nikita"] !== "intercettata") st.fughe.push(`${req.method()} ${u.split("?")[0]}`);
    if (r.status() >= 400 && /uniqaia\.com|supabase\.co|livekit\.cloud/.test(u) && !ignora.some((x) => u.includes(x))) st.fallite.push(`${r.status()} ${u.split("?")[0]}`);
  });
  await page.route(/supabase\.co\/(rest\/v1|auth\/v1)\//, async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    const rpc = (url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/) || [])[1];
    const auth = url.includes("/auth/v1/");
    const lettura = !auth && (m === "GET" || m === "HEAD" || m === "OPTIONS" || LETTURE.has(rpc));
    if (lettura) {
      if (rpc === "wheel_state") {
        const resp = await route.fetch(); const j = await resp.json().catch(() => null);
        if (j && Array.isArray(j.prizes)) st.premi = j.prizes;
        return route.fulfill({ response: resp, json: j });
      }
      return route.continue();
    }
    let corpo = null; try { corpo = req.postDataJSON(); } catch {}
    st.scritture.push({ rpc: rpc || url.replace(SUPABASE, "").split("?")[0], corpo });
    if (auth) return route.fulfill({ status: 400, headers: MARCA, json: { error: "bloccato_da_nikita", error_description: "Prova di Nikita: nessun account creato.", msg: "Prova di Nikita: nessun account creato." } });
    if (rpc === "wheel_spin") {
      const p = st.premi[0] || { code: "silver", name: "Silver", kind: "discount", first_month_cents: 12900 };
      return route.fulfill({ headers: MARCA, json: { id: crypto.randomUUID(), mode: "demo", prize_code: p.code, prize_name: p.name, kind: p.kind, first_month_cents: p.first_month_cents, status: "provisional", created_at: new Date().toISOString(), linked: false } });
    }
    if (rpc === "create_request3" || rpc === "create_request2" || rpc === "create_request") return route.fulfill({ headers: MARCA, json: crypto.randomUUID() });
    if (rpc === "like_show") return route.fulfill({ headers: MARCA, json: 1 });
    if (rpc === "follow") return route.fulfill({ headers: MARCA, json: true });
    return route.fulfill({ status: 200, headers: MARCA, contentType: "application/json", body: "null" });
  });
  return st;
}

/** A fine test: niente errori JavaScript e niente risorse della piattaforma fallite. */
export function nessunErrore(st, { console: anche = false } = {}) {
  expect(st.fughe, "SCRITTURE ARRIVATE AL DATABASE VERO (il test doveva intercettarle)").toEqual([]);
  expect(st.errori, "errori JavaScript nella pagina").toEqual([]);
  expect(st.fallite, "richieste fallite verso la piattaforma").toEqual([]);
  if (anche) expect(st.console, "errori nella console").toEqual([]);
}

/** Legge dal database (sola lettura, chiave pubblica) come farebbe la pagina. */
export async function leggi(request, path) {
  const r = await request.get(`${SUPABASE}/rest/v1/${path}`, { headers: { apikey: ANON } });
  expect(r.status(), `lettura ${path}`).toBe(200);
  return r.json();
}

/** Una diretta pubblica non conclusa di un venditore (preferendo quelle in programma). */
export async function unaDiretta(request, { stato } = {}) {
  const filtro = stato ? `&status=eq.${stato}` : "&status=neq.ended";
  const righe = await leggi(request, `shows?select=id,slug,status,scheduled_at,jewelers!inner(slug,is_public)&visibility=eq.public&jewelers.is_public=eq.true${filtro}&order=scheduled_at.asc&limit=20`);
  return righe.map((r) => ({ id: r.id, slug: r.slug, status: r.status, seller: r.jewelers.slug }));
}

/** Apre la vetrina come un visitatore: alla prima visita compare il benvenuto («Entra»), su iPhone l'invito a installare l'app. */
export async function entra(page, path = "/") {
  // l'invito a installare l'app (iPhone, dopo 3 secondi) si prova a parte: qui non deve coprire i pulsanti
  // la ruota di benvenuto (pubblica dal 4/11) si apre da sola alla prima visita: si prova in ruota.spec.mjs, qui non deve coprire i pulsanti
  await page.addInitScript(() => { try { localStorage.setItem("uniqaia-install", "no"); sessionStorage.setItem("uqw-closed", "1"); } catch (e) {} });
  await page.goto(path, { waitUntil: "load" });
  const benvenuto = page.locator("#welcome");
  if (await benvenuto.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false)) {
    await page.locator("#wGo").click();
    await expect(benvenuto, "il pulsante «Entra» deve chiudere il benvenuto").toBeHidden();
  }
  const installa = page.locator("#install");
  if (await installa.isVisible().catch(() => false)) await page.locator("#installX").click();
}

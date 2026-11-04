// The Jeweler's Wheel e pagina per i gioiellieri. In anteprima (?wheel=preview) il premio lo decide il server:
// qui la chiamata wheel_spin viene intercettata (nessun giro registrato, statistiche del Marketing pulite)
// e si verifica tutto il resto: apertura, chiusura, animazione, risultato, collegamento alla registrazione.
import { test, expect, controllo, prepara, nessunErrore, nonTestato, prova } from "./_aiuti.mjs";

test("[e2e.ruota] Ruota in anteprima: si apre, gira, assegna il premio e porta alla registrazione", async ({ page }, info) => {
  controllo(`e2e.ruota.${info.project.name}`, { area: "ruota", gravita: "P1", impatto: "La ruota non si apre, non gira o non porta alla registrazione.", correzione: "Controllare wheel.js e la funzione wheel_state." });
  const st = await prepara(page);
  await page.goto("/join/?wheel=preview", { waitUntil: "load" });
  const card = page.locator(".uqw-card[role=dialog]");
  await page.waitForTimeout(800);
  if (!(await card.isVisible())) {
    const modo = await page.evaluate(async ({ url, key }) => (await (await fetch(url + "/rest/v1/rpc/wheel_state", { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: '{"p_device":null}' })).json()).mode, { url: "https://itoxzepuukyvdxxtfetf.supabase.co", key: "sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk" });
    if (modo === "off") nonTestato("ruota spenta dal pannello");
  }
  await expect(card, "il pop-up deve aprirsi subito").toBeVisible({ timeout: 8000 });
  await expect(card, "il prezzo standard deve essere visibile nel pop-up").toContainText("149");

  // su telefono il pop-up sta nello schermo e la X si tocca bene
  const vp = page.viewportSize();
  const box = await card.boundingBox();
  expect(box.x, "il pop-up esce dallo schermo a sinistra").toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, "il pop-up esce dallo schermo a destra").toBeLessThanOrEqual(vp.width + 1);
  const x = page.locator(".uqw-x");
  const bx = await x.boundingBox();
  expect(Math.min(bx.width, bx.height), "la X di chiusura deve misurare almeno 44 px").toBeGreaterThanOrEqual(43);

  // chiusura con la X, riapertura dal pulsante regalo, chiusura con Esc
  await x.click();
  await expect(card).toBeHidden();
  const fab = page.locator(".uqw-fab");
  await expect(fab, "dopo la chiusura resta il pulsante YOUR WELCOME GIFT").toBeVisible();
  await fab.click();
  await expect(card).toBeVisible();
  if (info.project.name === "computer") {
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await fab.click();
    await expect(card).toBeVisible();
  }

  // giro: il server (intercettato) decide, la pagina anima e mostra il risultato
  await page.locator("#uqw-spin").click();
  await expect(page.getByText("YOUR WELCOME OFFER IS RESERVED!")).toBeVisible({ timeout: 15_000 });
  expect(st.scritture.some((s) => s.rpc === "wheel_spin"), "il premio deve essere chiesto al server").toBe(true);
  const apply = page.locator("#uqw-apply");
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(card).toBeHidden();
  await expect(page.locator("#acct")).toBeInViewport({ timeout: 5000 });

  const eventi = st.scritture.filter((s) => s.rpc === "wheel_track").map((s) => s.corpo && s.corpo.p_event);
  prova(`eventi statistici intercettati: ${eventi.join(", ")}`);
  expect(eventi, "le statistiche della ruota devono registrare il giro e il clic").toEqual(expect.arrayContaining(["spin_click", "prize_shown", "claim_click"]));
  nessunErrore(st);
});

test("[e2e.ruota.nascosta] In modalità demo la ruota non compare al pubblico", async ({ page }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.ruota.nascosta", { area: "ruota", gravita: "P1", impatto: "Premi dimostrativi mostrati al pubblico prima della verifica legale (DPR 430/2001).", correzione: "Rimettere la ruota in demo dal pannello /wheel-admin/." });
  const st = await prepara(page);
  await page.goto("/join/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const modo = await page.evaluate(async () => (await (await fetch("https://itoxzepuukyvdxxtfetf.supabase.co/rest/v1/rpc/wheel_state", { method: "POST", headers: { apikey: "sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk", "Content-Type": "application/json" }, body: '{"p_device":null}' })).json()).mode);
  prova(`modalità della ruota: ${modo}`);
  if (modo === "public") nonTestato("la ruota è pubblica: questo controllo vale solo in demo");
  await expect(page.locator(".uqw-card[role=dialog]"), "in demo il pop-up si vede solo con ?wheel=preview").toBeHidden();
  nessunErrore(st);
});

test("[e2e.join] Pagina per i gioiellieri: il modulo dell'account controlla i dati e non invia campi vuoti", async ({ page }, info) => {
  controllo(`e2e.join.${info.project.name}`, { area: "interfaccia", gravita: "P1", impatto: "I gioiellieri non riescono a creare l'account.", correzione: "Controllare join.html (renderAcct) e Supabase Auth." });
  const st = await prepara(page);
  await page.goto("/join/", { waitUntil: "load" });
  await expect(page.locator("#acct")).toBeVisible();
  const invia = page.locator("#aSend");
  await expect(invia, "pulsante di registrazione").toBeVisible({ timeout: 10_000 });
  await invia.click();
  await page.waitForTimeout(800);
  const authTentate = st.scritture.filter((s) => String(s.rpc).includes("/auth/v1/"));
  expect(authTentate, "con i campi vuoti non deve partire nessuna richiesta di registrazione").toEqual([]);
  const segnalato = await page.evaluate(() => {
    const msg = document.querySelector("#acct .amsg");
    const inv = document.querySelector("#acct input:invalid");
    return !!((msg && msg.textContent.trim()) || inv);
  });
  expect(segnalato, "l'utente deve capire cosa manca (messaggio o campo evidenziato)").toBe(true);
  // email sbagliata
  await page.locator("#aEmail").fill("non-una-email");
  await page.locator("#aPass").fill("x");
  await invia.click();
  await page.waitForTimeout(800);
  expect(st.scritture.filter((s) => String(s.rpc).includes("/auth/v1/")), "un'email non valida non deve arrivare al server").toEqual([]);
  nessunErrore(st);
});

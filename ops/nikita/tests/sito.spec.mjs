// Vetrina e pagine pubbliche: si caricano, i pulsanti fanno quello che promettono, i link portano dove devono.
import { test, expect, controllo, prepara, nessunErrore, parziale, prova } from "./_aiuti.mjs";

test("[e2e.home] La vetrina si carica con contenuti visibili e senza errori", async ({ page }, info) => {
  controllo(`e2e.home.${info.project.name}`, { area: "interfaccia", gravita: "P0", impatto: "Chi apre uniqaia.com vede una pagina rotta o vuota." });
  const st = await prepara(page);
  await page.goto("/", { waitUntil: "load" });
  await expect(page).toHaveTitle(/Uniqaia/);
  await expect(page.locator("#tabs")).toBeVisible();
  // il contenuto vero arriva dal database: almeno una scheda tra dirette, categorie o venditori
  await expect(page.locator("#gridLive a, #gridSoon a, #tiles a, #shopsRow a, #cats a").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  nessunErrore(st);
});

test("[e2e.home.schede] Le schede Live, In programma, Categorie, Chi trasmette rispondono", async ({ page }, info) => {
  controllo(`e2e.home.schede.${info.project.name}`, { area: "interfaccia", gravita: "P2" });
  const st = await prepara(page);
  await page.goto("/", { waitUntil: "load" });
  const schede = page.locator("#tabs button.tab");
  await expect(schede).toHaveCount(4);
  for (const dest of ["soon", "browse", "shops", "live"]) {
    const b = page.locator(`#tabs button[data-to="${dest}"]`);
    await b.click();
    await expect(b, `la scheda «${dest}» si accende al clic`).toHaveClass(/\bon\b/, { timeout: 5000 });
  }
  nessunErrore(st);
});

test("[e2e.home.carosello] Le frecce del carosello cambiano slide", async ({ page }, info) => {
  test.skip(info.project.name === "iphone", "su telefono il carosello si scorre con il dito");
  controllo("e2e.home.carosello", { area: "interfaccia", gravita: "P3" });
  const st = await prepara(page);
  await page.goto("/", { waitUntil: "load" });
  const pallini = page.locator("#dots > *");
  await expect(pallini.first()).toBeVisible({ timeout: 15_000 });
  const n = await pallini.count();
  test.skip(n < 2, "una sola slide: niente da far scorrere");
  const attivo = () => page.locator("#dots > *").evaluateAll((els) => els.findIndex((e) => e.classList.contains("on")));
  const prima = await attivo();
  await page.locator("#nextSlide").click();
  await expect.poll(attivo, { message: "la freccia › deve passare alla slide successiva" }).toBe((prima + 1) % n);
  await page.locator("#prevSlide").click();
  await expect.poll(attivo, { message: "la freccia ‹ deve tornare indietro" }).toBe(prima);
  nessunErrore(st);
});

test("[e2e.home.lingue] Il cambio lingua funziona, arabo da destra a sinistra", async ({ page }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.home.lingue", { area: "interfaccia", gravita: "P2" });
  const st = await prepara(page);
  await page.goto("/", { waitUntil: "load" });
  await page.locator("#langCur").click();
  await expect(page.locator("#langMenu")).toBeVisible();
  await page.locator('#langMenu [data-lang="ar"]').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dir || document.dir)).toBe("rtl");
  await page.locator("#langCur").click();
  await page.locator('#langMenu [data-lang="it"]').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dir || document.dir || "ltr")).not.toBe("rtl");
  nessunErrore(st);
});

test("[e2e.home.link] Tutti i link della vetrina portano a una pagina esistente", async ({ page, request }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.home.link", { area: "interfaccia", gravita: "P1", impatto: "Un link porta a una pagina che non esiste.", correzione: "Correggere il link nel template o nei dati (slide, categorie, venditori)." });
  await prepara(page);
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("#tabs")).toBeVisible();
  await page.waitForTimeout(2500);
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.href));
  const base = new URL(page.url()).origin;
  const nostri = [...new Set(hrefs.filter((h) => h.startsWith("https://uniqaia.com") || h.startsWith(base)).map((h) => h.split("#")[0]))].slice(0, 120);
  expect(nostri.length, "la vetrina deve contenere link").toBeGreaterThan(5);
  const rotti = [];
  for (const h of nostri) {
    const r = await request.get(h, { maxRedirects: 5 }).catch((e) => ({ status: () => 0, e }));
    if (r.status() >= 400 || r.status() === 0) rotti.push(`${r.status()} ${h}`);
  }
  prova(`${nostri.length} link provati`);
  expect(rotti, "link che portano a pagine inesistenti").toEqual([]);
});

test("[e2e.home.categoria] Una categoria del carosello apre la vetrina filtrata", async ({ page }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.home.categoria", { area: "interfaccia", gravita: "P2" });
  const st = await prepara(page);
  await page.goto("/?c=perle", { waitUntil: "load" });
  await expect(page.locator("#tabs")).toBeVisible();
  // la categoria scelta deve risultare evidenziata o il titolo deve parlare di perle
  await expect(page.locator("body")).toContainText(/Perle|Pearls/i, { timeout: 15_000 });
  nessunErrore(st);
});

test("[e2e.profilo] La scheda di un venditore si apre e «abbonami» chiede l'email", async ({ page }, info) => {
  controllo(`e2e.profilo.${info.project.name}`, { area: "interfaccia", gravita: "P2" });
  const st = await prepara(page);
  await page.goto("/marchetti/profile/", { waitUntil: "load" });
  await expect(page.locator("#page")).toBeVisible();
  await expect(page.locator("#page")).toContainText(/Marchetti/, { timeout: 15_000 });
  const segui = page.locator("#followBtn");
  if (await segui.count()) {
    await segui.click();
    await expect(page.locator("#fEmail")).toBeVisible();
    await page.locator("#fEmail").fill("nikita.test@uniqaia.com");
    await page.locator("#ff").evaluate((f) => f.requestSubmit ? f.requestSubmit() : f.submit());
    await expect.poll(() => st.scritture.some((s) => s.rpc === "follow"), { message: "il modulo deve inviare la richiesta «follow»" }).toBe(true);
    const c = st.scritture.find((s) => s.rpc === "follow").corpo;
    expect(c.p_email).toBe("nikita.test@uniqaia.com");
  } else parziale("pulsante «abbonami» non presente");
  nessunErrore(st);
});

test("[e2e.prestazioni] La vetrina si apre in tempi ragionevoli su telefono", async ({ page }, info) => {
  test.skip(info.project.name !== "iphone", "si misura sul telefono");
  controllo("e2e.prestazioni.iphone", { area: "prestazioni", gravita: "P2", impatto: "Su telefono la vetrina è lenta: chi arriva dai social se ne va.", correzione: "Ridurre peso dell'HTML (immagini dentro la pagina) e script non necessari." });
  await prepara(page);
  const t0 = Date.now();
  await page.goto("/", { waitUntil: "load" });
  const carico = Date.now() - t0;
  const peso = await page.evaluate(() => performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), 0) + (performance.getEntriesByType("navigation")[0]?.transferSize || 0));
  prova(`caricamento ${carico} ms, ${(peso / 1024).toFixed(0)} KB trasferiti`);
  expect(carico, "oltre 10 secondi la pagina è da considerare non funzionante").toBeLessThan(10_000);
  if (carico > 4000) parziale(`lenta: ${carico} ms (obiettivo 4000)`);
});

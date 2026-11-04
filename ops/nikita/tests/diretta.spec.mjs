// Dirette: pagina pubblica nelle cinque lingue, pagina dello spettatore, porta d'ingresso, connessione video da spettatore.
import { test, expect, controllo, prepara, nessunErrore, nonTestato, prova, unaDiretta, SUPABASE } from "./_aiuti.mjs";

test("[e2e.diretta.pagina] La pagina di una diretta esiste in 5 lingue con i link giusti", async ({ page, request }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.diretta.pagina", { area: "interfaccia", gravita: "P1", impatto: "Le pagine delle dirette da condividere sui social non funzionano." });
  const dirette = await unaDiretta(request, { stato: "scheduled" });
  const d = dirette.find((x) => true);
  if (!d) nonTestato("nessuna diretta in programma");
  const st = await prepara(page);
  for (const [lang, dir] of [["", "ltr"], ["en/", "ltr"], ["fr/", "ltr"], ["ru/", "ltr"], ["ar/", "rtl"]]) {
    const r = await page.goto(`/${d.seller}/${d.slug}/${lang}`, { waitUntil: "domcontentloaded" });
    expect(r.status(), `pagina ${lang || "it/"}`).toBe(200);
    await expect(page).toHaveTitle(/Uniqaia/);
    expect(await page.evaluate(() => document.documentElement.dir || "ltr"), `direzione del testo in ${lang || "it"}`).toBe(dir);
  }
  await page.goto(`/${d.seller}/${d.slug}/`, { waitUntil: "load" });
  const partecipa = page.locator(`a[href*="?s=${d.id}"]`).first();
  await expect(partecipa, "pulsante «Partecipa alla diretta»").toBeVisible();
  expect((await request.get(await partecipa.getAttribute("href"))).status()).toBe(200);
  const cal = await page.locator('a[href^="data:text/calendar"]').first().getAttribute("href");
  expect(decodeURIComponent(cal || ""), "«Ricordamelo» deve creare un evento di calendario valido").toMatch(/BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T\d{6}Z[\s\S]*END:VEVENT/);
  const wa = await page.locator('a[href^="https://wa.me/"]').first().getAttribute("href");
  expect(decodeURIComponent(wa || ""), "la condivisione WhatsApp deve contenere l'indirizzo della diretta").toContain(`/${d.seller}/${d.slug}/`);
  nessunErrore(st);
});

test("[e2e.diretta.spettatore] La pagina dello spettatore si apre e «Mi interessa» invia la richiesta", async ({ page, request }, info) => {
  controllo(`e2e.diretta.spettatore.${info.project.name}`, { area: "interfaccia", gravita: "P1", impatto: "Gli spettatori non possono manifestare interesse per un pezzo: richieste commerciali perse." });
  const dirette = await unaDiretta(request, { stato: "scheduled" });
  const d = dirette[0];
  if (!d) nonTestato("nessuna diretta in programma");
  const st = await prepara(page, { ignora: ["/functions/v1/live/"] });
  await page.goto(`/${d.seller}/?s=${d.id}`, { waitUntil: "load" });
  await expect(page.locator("#jname")).not.toBeEmpty({ timeout: 15_000 });
  const interesse = page.locator("#interest");
  await expect(interesse, "pulsante «Mi interessa»").toBeVisible();
  await interesse.click();
  const modale = page.locator("#modal");
  await expect(modale).toBeVisible();
  // primo passo: nome e contatto
  await expect(page.locator("#cf")).toBeVisible();
  await page.locator("#nameIn").fill("Nikita prova");
  await page.locator("#contactIn").fill("nikita.test@uniqaia.com");
  await page.locator("#cf button[type=submit]").click();
  // secondo passo (diretta non in onda con più pezzi): quale pezzo
  const pezzo = page.locator("#modal [data-p]").first();
  if (await pezzo.isVisible({ timeout: 3000 }).catch(() => false)) await pezzo.click();
  await expect.poll(() => st.scritture.some((s) => /^create_request/.test(s.rpc)), { message: "la richiesta deve partire verso il database", timeout: 8000 }).toBe(true);
  const c = st.scritture.find((s) => /^create_request/.test(s.rpc)).corpo;
  expect(c.p_show).toBe(d.id);
  expect(c.p_type).toBe("interest");
  prova(`richiesta intercettata: ${JSON.stringify({ ...c, p_contact: "…" })}`);
  nessunErrore(st);
});

test("[e2e.diretta.porta] Diretta in onda: porta d'ingresso con consenso marketing NON pre-spuntato", async ({ page, request }, info) => {
  controllo(`e2e.diretta.porta.${info.project.name}`, { area: "interfaccia", gravita: "P1", impatto: "Il consenso marketing pre-spuntato renderebbe inutilizzabile la lista (GDPR).", correzione: "Controllare viewer.html (porta d'ingresso)." });
  const live = await unaDiretta(request, { stato: "live" });
  const d = live[0];
  if (!d) nonTestato("nessuna diretta in onda in questo momento");
  const st = await prepara(page, { ignora: ["/functions/v1/live/"] });
  await page.goto(`/${d.seller}/?s=${d.id}`, { waitUntil: "load" });
  const porta = page.locator("#gate");
  await expect(porta, "a diretta in corso compare la porta d'ingresso").toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#gateCons"), "il consenso marketing deve partire NON spuntato").not.toBeChecked();
  await page.locator("#gateName").fill("Nikita prova");
  await page.locator("#gateMail").fill("nikita.test@uniqaia.com");
  await page.locator("#gateGo").click();
  await expect.poll(() => st.scritture.some((s) => s.rpc === "enter_show"), { message: "l'ingresso deve essere registrato" }).toBe(true);
  const c = st.scritture.find((s) => s.rpc === "enter_show").corpo;
  expect(c.p_consent, "senza spunta il consenso deve risultare negato").toBe(false);
  await expect(porta).toBeHidden({ timeout: 8000 });
  nessunErrore(st);
});

test("[e2e.livekit.spettatore] Connessione video reale a LiveKit come spettatore, senza permesso di trasmettere", async ({ page, request }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.livekit.spettatore", { area: "livekit", gravita: "P0", impatto: "Gli spettatori non riescono a vedere le dirette.", correzione: "Controllare LiveKit Cloud (stato, limiti del piano gratuito) e la funzione live." });
  const dirette = await unaDiretta(request);
  const d = dirette.find((x) => x.status === "live") || dirette[0];
  if (!d) nonTestato("nessuna diretta non conclusa su cui provare");
  const tr = await request.get(`${SUPABASE}/functions/v1/live/${d.seller}/token?show=${d.id}&name=Nikita%20prova`);
  expect(tr.status(), "rilascio del token video").toBe(200);
  const { url, token, role } = await tr.json();
  expect(role).toBe("viewer");
  await prepara(page);
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.LivekitClient, null, { timeout: 15_000 });
  const esito = await page.evaluate(async ({ url, token }) => {
    const t0 = performance.now();
    const room = new LivekitClient.Room();
    try {
      await room.connect(url, token, { autoSubscribe: true });
      const ms = Math.round(performance.now() - t0);
      const perm = room.localParticipant.permissions || {};
      let pubblicato = false;
      try { await room.localParticipant.publishData(new TextEncoder().encode("prova"), { reliable: true }); pubblicato = true; } catch (e) {}
      const r = { stato: room.state, ms, canPublish: !!perm.canPublish, canPublishData: !!perm.canPublishData, pubblicato, partecipanti: room.numParticipants, nome: room.name };
      await room.disconnect();
      return r;
    } catch (e) { return { errore: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; }
  }, { url, token });
  prova(JSON.stringify(esito));
  expect(esito.errore, "connessione alla stanza video").toBeUndefined();
  expect(esito.stato).toBe("connected");
  expect(esito.nome).toBe(`show-${d.id}`);
  expect(esito.canPublish, "lo spettatore non deve poter trasmettere").toBe(false);
  expect(esito.canPublishData, "lo spettatore non deve poter inviare dati nella stanza").toBe(false);
  // publishData senza permesso non solleva errori nel browser: il server scarta il messaggio. Qui conta che il token non lo permetta.
});

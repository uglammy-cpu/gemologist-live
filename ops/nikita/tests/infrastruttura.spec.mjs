// Certificati HTTPS: scadenza vicina = sito irraggiungibile per i browser.
import tls from "node:tls";
import { test, expect, controllo, prova, parziale } from "./_aiuti.mjs";

function certificato(host) {
  return new Promise((ok, ko) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const c = s.getPeerCertificate(); const autorizzato = s.authorized; s.end();
      ok({ scade: new Date(c.valid_to), autorizzato, errore: s.authorizationError });
    });
    s.on("error", ko); s.on("timeout", () => { s.destroy(); ko(new Error("timeout")); });
  });
}

test("[e2e.tls] Certificati HTTPS validi e lontani dalla scadenza", async ({}, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.tls", { area: "cloudflare", gravita: "P1", impatto: "Con il certificato scaduto i browser bloccano il sito.", correzione: "Controllare i certificati in Cloudflare (SSL/TLS → Edge Certificates)." });
  const esiti = [];
  let minimo = Infinity;
  for (const h of ["uniqaia.com", "www.uniqaia.com", "uniquaia.com", "live.gemsandjewelrytechlab.com"]) {
    const c = await certificato(h);
    const giorni = Math.round((c.scade - Date.now()) / 86_400_000);
    esiti.push(`${h}: ${giorni} giorni${c.autorizzato ? "" : " (NON valido: " + c.errore + ")"}`);
    expect(c.autorizzato, `certificato di ${h}`).toBe(true);
    minimo = Math.min(minimo, giorni);
  }
  prova(esiti.join("; "));
  expect(minimo, "un certificato scade entro 7 giorni").toBeGreaterThan(7);
  if (minimo < 21) parziale(`un certificato scade tra ${minimo} giorni`);
});

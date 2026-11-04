// Controlli sul codice pubblicato: errori che un clic non mostra subito ma che rompono una funzione.
// Il 4/11/2026 Nikita ha trovato espressioni regolari che avevano perso le barre rovesciate (\d, \s, \.) nella generazione delle pagine.
import vm from "node:vm";
import { test, expect, controllo, prova } from "./_aiuti.mjs";

const PAGINE = ["/", "/join/", "/pay/", "/admin/", "/wheel-admin/", "/_panel.html", "/_viewer.html", "/_profile.html", "/_landing.html"];
// segni tipici di una barra rovesciata persa: [^d…] (\d), (d{1,2}) (\d), [^@s] (\s), /s+/ (\s)
const SOSPETTI = [/\[\^d[.,\]]/, /\(d\{\d/, /\[\^@s\]/, /\/s\+\/g/, /\/d\+\/g/, /\[\^w/];

test("[e2e.codice.regex] Nessuna espressione regolare rovinata nelle pagine pubblicate", async ({ request, baseURL }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.codice.regex", { area: "interfaccia", gravita: "P1", impatto: "Controlli di email, prezzi o numeri di telefono che non funzionano come dovrebbero.", correzione: "Rimettere le barre rovesciate (\\d, \\s, \\.) nelle espressioni regolari dei template in show/_src/tpl e rigenerare le pagine." });
  const trovati = [];
  for (const p of PAGINE) {
    const r = await request.get(baseURL + p);
    if (r.status() !== 200) continue;
    const t = await r.text();
    for (const rx of SOSPETTI) for (const m of t.matchAll(new RegExp(rx.source, "g"))) {
      const riga = t.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, " ");
      trovati.push(`${p}: …${riga}…`);
    }
  }
  prova(`${trovati.length} espressioni sospette`);
  expect(trovati, "espressioni regolari che hanno perso le barre rovesciate").toEqual([]);
});

test("[e2e.pannello.prezzi] Il pannello di regia capisce i prezzi scritti dal venditore", async ({ request, baseURL }, info) => {
  test.skip(info.project.name === "iphone", "basta su un dispositivo");
  controllo("e2e.pannello.prezzi", { area: "interfaccia", gravita: "P1", impatto: "Il venditore non riesce a mettere il prezzo a un pezzo né l'importo di un link di pagamento.", correzione: "In panel.html la funzione centesimi() usa /[^d.,]/ e /(d{1,2})/: vanno riscritte con \\d." });
  const t = await (await request.get(baseURL + "/_panel.html")).text();
  const i = t.indexOf("function centesimi(s)");
  expect(i, "funzione centesimi() non trovata nel pannello").toBeGreaterThan(0);
  const fine = t.indexOf("\n  }\n", i);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(t.slice(i, fine + 4) + "; this.centesimi = centesimi;", ctx);
  const casi = { "4200": 420000, "4.200": 420000, "4200,50": 420050, "€ 4.200,50": 420050, "14800": 1480000 };
  const sbagliati = Object.entries(casi).filter(([k, v]) => ctx.centesimi(k) !== v).map(([k, v]) => `«${k}» → ${ctx.centesimi(k)} invece di ${v}`);
  prova(Object.keys(casi).map((k) => `«${k}» → ${ctx.centesimi(k)}`).join("; "));
  expect(sbagliati, "prezzi letti male dal pannello").toEqual([]);
});

// Consegna gli esiti del collaudo al registro di Nikita (Supabase, funzione «nikita»).
// Su GitHub Actions si presenta con il token firmato da GitHub (OIDC): nessuna password salvata da nessuna parte.
// Uso: node consegna.mjs risultati/playwright.json [risultati/autotest.json]
import fs from "node:fs";

const FUNZIONE = "https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/nikita/ingest";
const STATI = { expected: "pass", unexpected: "fail", flaky: "partial", skipped: "not_tested" };
const pulisci = (s) => String(s || "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+\n/g, "\n").trim();

function esitiPlaywright(file) {
  const rep = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  const visita = (suite) => {
    for (const s of suite.suites || []) visita(s);
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const ann = [...(t.annotations || []), ...((t.results || []).flatMap((r) => r.annotations || []))];
        const val = (k) => (ann.find((a) => a.type === k) || {}).description;
        const id = val("check");
        if (!id) continue;
        let status = STATI[t.status] || "error";
        const ultimo = (t.results || []).at(-1) || {};
        let reason = "";
        if (status === "fail") reason = pulisci(ultimo.error && (ultimo.error.message || ultimo.error.value)).split("\n").slice(0, 6).join(" · ");
        if (status === "partial") reason = "superato solo al secondo tentativo (instabile)";
        if (status === "not_tested") reason = val("non_testato") || (ann.find((a) => a.type === "skip") || {}).description || "saltato";
        if (status === "pass" && val("parziale")) { status = "partial"; reason = val("parziale"); }
        if (status === "pass") reason = spec.title.replace(/^\[[^\]]+\]\s*/, "");
        out.push({
          check: id, title: spec.title.replace(/^\[[^\]]+\]\s*/, "") + (/\.(computer|iphone)$/.test(id) ? ` (${t.projectName})` : ""),
          area: val("area"), severity: val("severity"), impact: val("impact"), fix: val("fix"),
          status, ms: ultimo.duration, reason: reason.slice(0, 600), project: t.projectName,
          evidence: ann.filter((a) => a.type === "prova").map((a) => a.description),
        });
      }
    }
  };
  visita(rep);
  // un controllo provato due volte (stesso id) tiene l'esito peggiore
  const ordine = { fail: 0, partial: 1, error: 2, not_tested: 3, pass: 4 };
  const per = new Map();
  for (const e of out) { const v = per.get(e.check); if (!v || ordine[e.status] < ordine[v.status]) per.set(e.check, e); }
  return [...per.values()];
}

async function tokenGitHub() {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: u, ACTIONS_ID_TOKEN_REQUEST_TOKEN: t } = process.env;
  if (!u || !t) throw new Error("Token OIDC non disponibile: la consegna funziona solo dentro GitHub Actions con id-token: write.");
  const r = await fetch(`${u}&audience=uniqaia-nikita`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`OIDC ${r.status}`);
  return (await r.json()).value;
}

const [, , file, extra] = process.argv;
const risultati = esitiPlaywright(file);
if (extra && fs.existsSync(extra)) risultati.push(...JSON.parse(fs.readFileSync(extra, "utf8")));
const conteggio = risultati.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log("Esiti da consegnare:", JSON.stringify(conteggio));
for (const r of risultati.filter((x) => x.status !== "pass")) console.log(`  ${r.status.toUpperCase().padEnd(10)} ${r.check} — ${r.reason}`);

if (process.env.NIKITA_DRY) { console.log(JSON.stringify(risultati, null, 1)); process.exit(0); }
const corpo = { run: { started_at: process.env.NIKITA_STARTED || new Date().toISOString(), base: process.env.NIKITA_BASE || "https://uniqaia.com", motivo: process.env.NIKITA_MOTIVO || "" }, results: risultati };
const r = await fetch(FUNZIONE, { method: "POST", headers: { Authorization: `Bearer ${await tokenGitHub()}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const testo = await r.text();
console.log(`Registro di Nikita: HTTP ${r.status} ${testo}`);
if (!r.ok) process.exit(1);

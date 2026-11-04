// Edge function "nikita": riceve gli esiti del collaudo con il browser (GitHub Actions) e li registra nel registro di Nikita.
// Accetta SOLO richieste firmate da GitHub (token OIDC) per il repository uglammy-cpu/gemologist-live,
// workflow .github/workflows/nikita.yml, ramo main. Nessun segreto da custodire: la prova è la firma di GitHub.
// Pubblicata con verify_jwt disattivato (l'autenticazione è la verifica OIDC qui sotto).
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const REPO = "uglammy-cpu/gemologist-live";
const REPO_ID = "1437299438";
const OWNER_ID = "231917155";
const AUDIENCE = "uniqaia-nikita";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/nikita/, "").replace(/\/+$/, "");
  if ((req.method === "GET" || req.method === "HEAD") && (path === "" || path === "/health")) return json({ ok: true, servizio: "nikita" });
  if (req.method !== "POST" || path !== "/ingest") return json({ error: "non trovato" }, 404);

  const auth = req.headers.get("authorization") ?? "";
  const tok = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!tok) return json({ error: "firma di GitHub mancante" }, 401);
  let c: Record<string, unknown>;
  try {
    ({ payload: c } = await jwtVerify(tok, JWKS, { issuer: ISSUER, audience: AUDIENCE }));
  } catch (_e) {
    return json({ error: "firma di GitHub non valida o scaduta" }, 401);
  }
  if (c.repository !== REPO || String(c.repository_id) !== REPO_ID || String(c.repository_owner_id) !== OWNER_ID) return json({ error: "repository non autorizzato" }, 403);
  if (c.ref !== "refs/heads/main" || !String(c.workflow_ref ?? "").startsWith(`${REPO}/.github/workflows/nikita.yml@`)) return json({ error: "workflow non autorizzato" }, 403);

  if (Number(req.headers.get("content-length") ?? "0") > 1_000_000) return json({ error: "esiti troppo grandi" }, 413);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  body.run = { ...((body.run as Record<string, unknown>) ?? {}), sha: c.sha, event: c.event_name, run_id: c.run_id, actor: c.actor,
               url: `https://github.com/${REPO}/actions/runs/${c.run_id}` };

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nikita_ingest`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p: body }),
  });
  const out = await r.text();
  if (!r.ok) return json({ error: "registrazione non riuscita", dettaglio: out.slice(0, 400) }, 500);
  return new Response(out, { headers: { "content-type": "application/json; charset=utf-8" } });
});

// Edge function "finance-livekit": il contatore FINANCE delle dirette.
// Riceve i webhook di LiveKit Cloud (ingressi e uscite dalle stanze) e li registra nello schema `finance`
// tramite public.finance_livekit_ingest, eseguibile solo con la chiave di servizio.
// Accetta solo chiamate firmate da LiveKit: JWT HS256 con la chiave API del progetto (iss) e lo sha256 del corpo.
// Non salva nomi, metadati o attributi dei partecipanti: solo identità tecniche (staff:/viewer:/agent-) e orari.
// Installata il 6 novembre 2026 con l'autorizzazione di Elena. Verify JWT di Supabase disattivato: la firma la controlla questa funzione.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const enc = new TextEncoder();
const dec = new TextDecoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${name}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Stessa configurazione usata dalla funzione "live" (chiave e segreto LiveKit, letti solo con la chiave di servizio)
type LkConfig = { url: string; api_key: string; api_secret: string };
let cfgCache: { cfg: LkConfig; at: number } | null = null;
async function livekitConfig(): Promise<LkConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 5 * 60_000) return cfgCache.cfg;
  const rows = (await rpc("livekit_config", {})) as LkConfig[];
  const cfg = rows?.[0];
  if (!cfg?.api_key || !cfg.api_secret) throw new Error("LiveKit non configurato");
  cfgCache = { cfg, at: Date.now() };
  return cfg;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
const normB64 = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");

// Restituisce null se la firma è valida, altrimenti il motivo (solo per i log)
async function verify(token: string, body: string, cfg: LkConfig): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return "formato";
  const header = JSON.parse(dec.decode(b64urlToBytes(parts[0])));
  if (header?.alg !== "HS256") return "algoritmo";
  const key = await crypto.subtle.importKey("raw", enc.encode(cfg.api_secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(parts[2]) as BufferSource, enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return "firma";
  const claims = JSON.parse(dec.decode(b64urlToBytes(parts[1])));
  if (claims?.iss !== cfg.api_key) return "chiave";
  const now = Date.now() / 1000;
  if (typeof claims.exp === "number" && now > claims.exp + 60) return "scaduto";
  if (typeof claims.nbf === "number" && now < claims.nbf - 60) return "non ancora valido";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(body)));
  if (normB64(String(claims.sha256 ?? "")) !== normB64(bytesToB64(digest))) return "corpo";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.text();
  if (body.length > 256_000) return json({ error: "richiesta troppo grande" }, 413);
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!auth) return json({ error: "firma mancante" }, 401);

  let cfg: LkConfig;
  try { cfg = await livekitConfig(); } catch (e) { console.error("config", String(e)); return json({ error: "configurazione" }, 500); }

  let bad: string | null;
  try { bad = await verify(auth, body, cfg); } catch { bad = "formato"; }
  if (bad) { console.warn("firma rifiutata:", bad); return json({ error: "firma non valida" }, 401); }

  // deno-lint-ignore no-explicit-any
  let ev: any;
  try { ev = JSON.parse(body); } catch { return json({ error: "json non valido" }, 400); }

  // Si tiene solo quello che serve al conteggio: niente nomi, metadati o attributi
  const pt = ev?.participant;
  const slim = {
    id: ev?.id ?? null,
    event: ev?.event ?? null,
    createdAt: ev?.createdAt ?? ev?.created_at ?? null,
    room: ev?.room ? { sid: ev.room.sid ?? null, name: ev.room.name ?? null } : null,
    participant: pt ? {
      sid: pt.sid ?? null,
      identity: pt.identity ?? null,
      kind: pt.kind ?? null,
      joinedAt: pt.joinedAt ?? pt.joined_at ?? null,
      joinedAtMs: pt.joinedAtMs ?? pt.joined_at_ms ?? null,
    } : null,
  };

  try {
    const r = await rpc("finance_livekit_ingest", { p: slim });
    return json(r);
  } catch (e) {
    // 500: LiveKit ritenta l'invio qualche volta
    console.error("registrazione", String(e));
    return json({ error: "registrazione non riuscita" }, 500);
  }
});

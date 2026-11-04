// Edge function "live": renderer delle pagine (template in tabella app_pages) + token LiveKit.
// Rotte: /live (vetrina) · /live/join · /live/<slug> (viewer) · /live/<slug>/panel?k= · /live/<slug>/token
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_BASE = Deno.env.get("PUBLIC_BASE") ?? "";
const PLATFORM_NAME = Deno.env.get("PLATFORM_NAME") ?? "Nome piattaforma";
// Le pagine HTML vivono sul sito statico (su *.supabase.co le pagine HTML vengono servite come testo): qui si fa solo redirect.
// Vuoto = servi le pagine da qui (solo con un dominio personalizzato Supabase).
const PUBLIC_SITE = Deno.env.get("PUBLIC_SITE") ?? "https://live.gemsandjewelrytechlab.com/show";

const SLUG = /^[a-z0-9-]{2,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RESERVED = new Set(["join", "admin", "api", "token", "panel", "vetrina", "live", "www", "app", "static"]);
const LANGS = ["it", "en", "fr"];

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "SAMEORIGIN", "referrer-policy": "no-referrer" },
  });
}
function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });
}
function json(body: unknown, status = 200): Response {
  // CORS: le pagine stanno su un altro dominio (sito statico) e leggono qui il token video
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// ---- Database access (PostgREST) ----
async function rest(path: string, init: RequestInit = {}, key = ANON_KEY): Promise<unknown> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`db ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
const rpc = (name: string, args: Record<string, unknown>, key = ANON_KEY) => rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) }, key);

// ---- Template pagine (tabella app_pages, cache 60 s) ----
type Pages = Record<string, string>;
let pageCache: { pages: Pages; at: number } | null = null;
async function loadPages(): Promise<Pages> {
  if (pageCache && Date.now() - pageCache.at < 60_000) return pageCache.pages;
  try {
    const rows = (await rest("app_pages?select=name,body", {}, SERVICE_KEY)) as { name: string; body: string }[];
    const pages: Pages = {};
    for (const r of rows) pages[r.name] = r.body;
    pageCache = { pages, at: Date.now() };
    return pages;
  } catch (e) {
    if (pageCache) return pageCache.pages; // tengo la versione precedente se il DB non risponde
    throw e;
  }
}
function render(pages: Pages, name: string, vars: Record<string, string>): string {
  let b = pages[name];
  if (!b) throw new Error(`template mancante: ${name}`);
  b = b.split("{{HEAD}}").join(pages.head ?? "").split("{{CSS}}").join(pages.css ?? "")
    .split("{{LKJS}}").join(pages.lkjs ?? "").split("{{ART}}").join(pages.art ?? "{}").split("{{T}}").join(pages.t ?? "{}");
  for (const [k, v] of Object.entries(vars)) b = b.split(`{{${k}}}`).join(v);
  return b;
}
// Valore sicuro sia dentro attributi HTML sia dentro stringhe JS tra doppi apici
const safe = (s: string) => s.replace(/[<>"'\\]/g, "").replace(/[\r\n\t]/g, " ").trim().slice(0, 60);

function notFound(pages: Pages | null, msg = "Pagina non trovata."): Response {
  const head = pages?.head ?? '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  const css = pages?.css ?? "";
  return html(`<!doctype html><html lang="it"><head>${head}<title>Non trovata</title><style>${css}</style></head><body><main class="wrap"><div class="col"><p class="hint" style="padding:60px 0">${escapeHtml(msg)}</p></div></main></body></html>`, 404);
}

// ---- LiveKit ----
type LkConfig = { url: string; api_key: string; api_secret: string };
let lkCache: { cfg: LkConfig; at: number } | null = null;
async function livekitConfig(): Promise<LkConfig> {
  if (lkCache && Date.now() - lkCache.at < 5 * 60_000) return lkCache.cfg;
  const rows = (await rpc("livekit_config", {}, SERVICE_KEY)) as LkConfig[];
  const cfg = rows?.[0];
  if (!cfg?.url || !cfg.api_key || !cfg.api_secret) throw new Error("LiveKit non configurato");
  lkCache = { cfg, at: Date.now() };
  return cfg;
}
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function livekitToken(cfg: LkConfig, o: { identity: string; name: string; room: string; publish: boolean; metadata?: string }, ttlSec = 6 * 3600): Promise<string> {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({
    iss: cfg.api_key, sub: o.identity, name: o.name, nbf: now - 30, exp: now + ttlSec, jti: crypto.randomUUID(), metadata: o.metadata ?? "",
    video: { room: o.room, roomJoin: true, canPublish: o.publish, canSubscribe: true, canPublishData: o.publish, canUpdateOwnMetadata: false },
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(cfg.api_secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

async function tokenRoute(slug: string, url: URL): Promise<Response> {
  const showId = url.searchParams.get("show") ?? "";
  if (!UUID.test(showId)) return json({ error: "show non valido" }, 400);
  const staffKey = (url.searchParams.get("k") ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64);
  const inviteTok = (url.searchParams.get("t") ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64);
  const rawName = (url.searchParams.get("name") ?? "").replace(/[<>]/g, "").trim().slice(0, 60);

  const jewelers = (await rest(`jewelers?slug=eq.${slug}&select=id,name`)) as { id: string; name: string }[];
  const jeweler = jewelers[0];
  if (!jeweler) return json({ error: "gioielleria non trovata" }, 404);
  const shows = (await rest(`shows?id=eq.${showId}&jeweler_id=eq.${jeweler.id}&select=id,status`)) as { id: string; status: string }[];
  const show = shows[0];
  if (!show) return json({ error: "diretta non trovata" }, 404);

  const room = `show-${show.id}`;
  const cfg = await livekitConfig();
  const short = crypto.randomUUID().slice(0, 8);

  if (staffKey) {
    const rows = (await rpc("staff_check", { p_token: staffKey, p_show: show.id })) as { role: string; display_name: string }[];
    const staff = rows[0];
    if (!staff) return json({ error: "chiave non valida" }, 403);
    const identity = `staff:${staff.role}:${short}`;
    const token = await livekitToken(cfg, { identity, name: staff.display_name, room, publish: true, metadata: JSON.stringify({ role: staff.role }) });
    return json({ url: cfg.url, token, identity, role: staff.role });
  }

  if (show.status === "ended") return json({ error: "diretta terminata" }, 410);
  let name = rawName || "Ospite";
  if (inviteTok) {
    const rows = (await rpc("join_show", { p_token: inviteTok })) as { invite_id: string; client_name: string; show_id: string }[];
    if (rows[0] && rows[0].show_id === show.id) name = rows[0].client_name;
  }
  const identity = `viewer:${short}`;
  const token = await livekitToken(cfg, { identity, name, room, publish: false });
  return json({ url: cfg.url, token, identity, role: "viewer" });
}

function pickLang(url: URL, req: Request): string {
  const q = (url.searchParams.get("lang") ?? "").toLowerCase();
  if (LANGS.includes(q)) return q;
  const al = (req.headers.get("accept-language") ?? "").toLowerCase();
  const m = al.match(/\b(it|en|fr)\b/);
  return m ? m[1] : "it";
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  // Path visto dalla funzione: "/live[/join | /<slug>[/panel|/token]]" (con o senza prefisso "/functions/v1")
  let path = url.pathname.replace(/^\/functions\/v1/, "").replace(/\/+$/, "");
  path = path.replace(/^\/live/, "");
  const parts = path.split("/").filter(Boolean);

  // Dietro il proxy di Supabase la richiesta arriva in http: i link pubblici devono essere https (altrimenti mixed content)
  const proto = /^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? url.protocol : "https:";
  const base = PUBLIC_BASE || (url.hostname.endsWith(".supabase.co") ? `${proto}//${url.host}/functions/v1` : `${proto}//${url.host}`);
  const common = { URL: SUPABASE_URL, KEY: ANON_KEY, BASE: base, NAME: safe(PLATFORM_NAME), LANG: pickLang(url, req) };
  let pages: Pages | null = null;

  try {
    if (parts.length === 2 && parts[1] === "token" && SLUG.test(parts[0])) return await tokenRoute(parts[0], url);

    if (PUBLIC_SITE) {
      // Redirect ai nuovi indirizzi, conservando i parametri (?s= ?t= ?k= ?lang=)
      const q = url.search;
      if (parts.length === 0) return redirect(`${PUBLIC_SITE}/${q}`);
      if (parts.length === 1 && parts[0] === "join") return redirect(`${PUBLIC_SITE}/join/${q}`);
      if (SLUG.test(parts[0]) && !RESERVED.has(parts[0])) {
        if (parts.length === 1) return redirect(`${PUBLIC_SITE}/${parts[0]}/${q}`);
        if (parts.length === 2 && parts[1] === "panel") return redirect(`${PUBLIC_SITE}/${parts[0]}/panel/${q}`);
      }
      return redirect(`${PUBLIC_SITE}/`);
    }

    pages = await loadPages();
    if (parts.length === 0) return html(render(pages, "vetrina", common));
    if (parts.length === 1 && parts[0] === "join") return html(render(pages, "join", common));

    const slug = parts[0];
    if (!SLUG.test(slug) || RESERVED.has(slug)) return notFound(pages);
    const tokenUrl = `${base}/live/${slug}/token`;

    if (parts.length === 1) {
      const token = (url.searchParams.get("t") ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64);
      const showId = UUID.test(url.searchParams.get("s") ?? "") ? (url.searchParams.get("s") as string) : "";
      const q = (url.searchParams.get("lang") ?? "").toLowerCase();
      const lang = LANGS.includes(q) ? q : "";
      return html(render(pages, "viewer", { ...common, LANG: lang || common.LANG, SLUG: slug, TOKEN: token, SHOWID: showId, TOKENURL: tokenUrl }));
    }
    if (parts.length === 2 && parts[1] === "panel") {
      const token = (url.searchParams.get("k") ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64);
      if (!token) return notFound(pages, "Manca la chiave del pannello.");
      return html(render(pages, "panel", { ...common, SLUG: slug, TOKEN: token, TOKENURL: tokenUrl }));
    }
  } catch (e) {
    console.error(e);
    return json({ error: "errore interno" }, 500);
  }
  return notFound(pages);
});

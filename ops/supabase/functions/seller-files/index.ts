// Edge function "seller-files": caricamento sicuro di logo e foto delle candidature, e visione per la gemmologa.
// Il bucket "applications" e' privato: si carica solo con un indirizzo firmato valido pochi minuti,
// nella cartella provvisoria drafts/<uuid>/ con nomi fissi (logo, photo1, photo2).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const KINDS = new Set(["logo", "photo1", "photo2"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo non ammesso" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "richiesta non valida" }, 400); }

  try {
    if (b.action === "upload") {
      const kind = String(b.kind ?? ""), type = String(b.type ?? "");
      if (!KINDS.has(kind)) return json({ error: "tipo di file non previsto" }, 400);
      const ext = EXT[type];
      if (!ext) return json({ error: "Formato non accettato: usa PNG, JPG o WebP." }, 400);
      const size = Number(b.size ?? 0);
      if (!(size > 0) || size > 10 * 1024 * 1024) return json({ error: "Il file supera 10 MB." }, 400);
      const draft = typeof b.draft === "string" && UUID.test(b.draft) ? b.draft : crypto.randomUUID();
      // al massimo tre file per cartella provvisoria: logo e due foto
      const { data: list } = await sb.storage.from("applications").list(`drafts/${draft}`, { limit: 10 });
      const others = (list ?? []).filter((o) => !o.name.startsWith(kind + "."));
      if (others.length >= 3) return json({ error: "troppi file" }, 429);
      // un solo file per tipo: si sostituisce il precedente anche se l'estensione cambia
      const old = (list ?? []).filter((o) => o.name.startsWith(kind + ".")).map((o) => `drafts/${draft}/${o.name}`);
      if (old.length) await sb.storage.from("applications").remove(old);
      const path = `drafts/${draft}/${kind}.${ext}`;
      const { data, error } = await sb.storage.from("applications").createSignedUploadUrl(path, { upsert: true });
      if (error) throw error;
      return json({ draft, path, token: data.token, signedUrl: data.signedUrl });
    }

    if (b.action === "view") {
      const key = String(b.key ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64), id = String(b.id ?? "");
      if (!UUID.test(id)) return json({ error: "candidatura non valida" }, 400);
      const { data: ok } = await sb.rpc("is_gemologist", { p_token: key });
      if (ok !== true) return json({ error: "chiave non valida" }, 403);
      const { data: a } = await sb.from("applications").select("logo_path, photo_paths").eq("id", id).maybeSingle();
      const paths = [a?.logo_path, ...(a?.photo_paths ?? [])].filter(Boolean) as string[];
      if (!paths.length) return json({ files: [] });
      const { data, error } = await sb.storage.from("applications").createSignedUrls(paths, 3600);
      if (error) throw error;
      return json({ files: (data ?? []).map((f, i) => ({ kind: i === 0 ? "logo" : "photo" + i, url: f.signedUrl })) });
    }
    return json({ error: "azione sconosciuta" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "errore interno" }, 500);
  }
});

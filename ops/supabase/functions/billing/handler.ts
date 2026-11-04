// Logica della edge function "billing", separata da Deno per poterla collaudare.
//
//   POST /billing            {action:"checkout", token}  pagina di pagamento Stripe del seller approvato
//   POST /billing            {action:"health"}           Stripe è configurato?
//   POST /billing/webhook                                 eventi Stripe (firma verificata)
//
// Regole: il prezzo e lo sconto li decide il database (billing_checkout_start); qui si traducono
// in un prezzo ricorrente da 149 €/mese e in un buono "once" che vale solo sulla prima fattura.
// Nessuna attivazione senza un evento Stripe firmato e della modalità giusta (test o live).

import { ensureCoupon, ensurePrice, form, StripeCall, StripeError, verifyStripeSignature } from "./stripe.ts";

export type Deps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
  stripe: StripeCall | null;          // null se manca la chiave segreta
  secretKey: string;                  // per capire se è una chiave di prova o di produzione
  webhookSecret: string;
  siteBase: string;                   // https://uniqaia.com
  now?: () => number;
  log?: (...a: unknown[]) => void;
};

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
const keyMode = (k: string) => (k.startsWith("sk_live_") || k.startsWith("rk_live_") ? "live" : k.startsWith("sk_test_") || k.startsWith("rk_test_") ? "test" : "none");
const LOCALES = new Set(["it", "en", "fr", "ru"]);

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo non ammesso" }, 405);
  const url = new URL(req.url);
  if (url.pathname.endsWith("/webhook")) return webhook(req, d);

  let b: any; try { b = await req.json(); } catch { return json({ error: "richiesta non valida" }, 400); }

  if (b?.action === "health") {
    const mode = await d.rpc("billing_mode_get", {}).catch(() => null);
    return json({ key: keyMode(d.secretKey), webhook: !!d.webhookSecret, billing_mode: mode });
  }

  if (b?.action === "checkout") {
    const token = String(b.token ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64);
    if (!token) return json({ state: "invalid" });
    // la chiave deve corrispondere alla modalità scelta da Elena: mai una chiave di prova in produzione o viceversa.
    // Si controlla prima di toccare il database, così una configurazione incompleta non cambia nulla.
    const mode = await d.rpc("billing_mode_get", {});
    if (mode !== "off" && (!d.stripe || keyMode(d.secretKey) !== mode || !d.webhookSecret)) return json({ state: "not_configured" });
    const ctx = await d.rpc("billing_checkout_start", { p_token: token });
    if (ctx.state !== "create") return json(ctx.state === "open" ? { state: "open", url: ctx.url } : { state: ctx.state });
    if (!d.stripe || keyMode(d.secretKey) !== ctx.mode || !d.webhookSecret) return json({ state: "not_configured" });
    // la pagina precedente resta registrata finché non è sicuramente chiusa: se qualcosa va storto la si ritrova al clic dopo
    let prevPending: string | null = ctx.previous_session ?? null;
    const keepPrev = () => prevPending
      ? d.rpc("billing_checkout_saved", { p_sub: ctx.subscription_id, p_generation: ctx.generation, p_session: prevPending, p_url: null, p_expires: null, p_customer: null }).catch(() => null)
      : null;
    try {
      // la pagina precedente (scaduta o quasi) si chiude su Stripe; se nel frattempo è stata pagata, non se ne apre un'altra
      if (prevPending) {
        const prev = await d.stripe("GET", `/v1/checkout/sessions/${prevPending}`);
        if (prev?.status === "open") {
          const closed = await d.stripe("POST", `/v1/checkout/sessions/${prevPending}/expire`, {}).catch(() => null);
          const now = closed ?? await d.stripe("GET", `/v1/checkout/sessions/${prevPending}`);
          if (now?.status === "complete") { await keepPrev(); return json({ state: "success" }); }
          if (now?.status !== "expired") throw new Error("pagina precedente non chiusa");
        } else if (prev?.status === "complete") { await keepPrev(); return json({ state: "success" }); }
        prevPending = null;   // scaduta: si può aprire la nuova
      }
      const price = await ensurePrice(d.stripe, ctx.standard_cents);
      const coupon = ctx.discount_cents > 0 ? await ensureCoupon(d.stripe, ctx.discount_cents) : null;
      const base = d.siteBase.replace(/\/$/, "");
      const params = {
        mode: "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": 1,
        "discounts[0][coupon]": coupon,
        "payment_method_types[0]": "card",
        client_reference_id: ctx.jeweler_id,
        customer: ctx.customer || null,
        customer_email: ctx.customer ? null : ctx.email,
        "metadata[uniqaia_subscription]": ctx.subscription_id,
        "subscription_data[metadata][uniqaia_subscription]": ctx.subscription_id,
        "subscription_data[metadata][jeweler_id]": ctx.jeweler_id,
        "subscription_data[description]": `Uniqaia — ${ctx.brand ?? ""}`.slice(0, 200),
        locale: LOCALES.has(ctx.lang) ? ctx.lang : "auto",
        expires_at: ctx.expires_at,      // fissata dal database: due clic insieme fanno la stessa identica richiesta
        success_url: `${base}/pay/?status=success`,
        cancel_url: `${base}/pay/?t=${ctx.pay_token}&status=cancel`,
      };
      const key = `uq-checkout-${ctx.subscription_id}-${ctx.generation}`;
      let session: any;
      try { session = await d.stripe("POST", "/v1/checkout/sessions", params, key); }
      catch (e) {
        // l'altra richiesta identica è ancora in corso su Stripe: si aspetta un attimo e si rilegge la stessa risposta
        if (!(e instanceof StripeError) || e.status !== 409) throw e;
        await new Promise((r) => setTimeout(r, 1500));
        session = await d.stripe("POST", "/v1/checkout/sessions", params, key);
      }
      await d.rpc("billing_checkout_saved", {
        p_sub: ctx.subscription_id, p_generation: ctx.generation, p_session: session.id, p_url: session.url,
        p_expires: new Date(session.expires_at * 1000).toISOString(), p_customer: session.customer ?? null,
      });
      return json({ state: "open", url: session.url });
    } catch (e) {
      d.log?.("checkout", e);
      await keepPrev();
      return json({ state: "error" }, 502);
    }
  }
  return json({ error: "azione sconosciuta" }, 400);
}

async function webhook(req: Request, d: Deps): Promise<Response> {
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), d.webhookSecret, 300, (d.now ? d.now() : Date.now()) / 1000);
  if (!ok) return new Response("firma non valida", { status: 400 });
  let event: any; try { event = JSON.parse(raw); } catch { return new Response("json non valido", { status: 400 }); }
  // ogni evento firmato arriva al database, anche con i pagamenti spenti: è lui a confrontare la modalità
  // (prova o produzione) con quella dell'abbonamento, così nessun rinnovo o disdetta va perso
  let result: string;
  try { result = await d.rpc("billing_apply_event", { p_event: event }); }
  catch (e) { d.log?.("webhook", e); return new Response("errore", { status: 500 }); }  // Stripe riprova
  // secondo abbonamento pagato per errore: si annulla e si rimborsa, il primo resta valido
  if (typeof result === "string" && result.startsWith("duplicate:")) {
    const id = result.slice("duplicate:".length);
    // si annulla solo con la chiave della stessa modalità dell'evento (prova o produzione)
    if (!d.stripe || keyMode(d.secretKey) !== (event.livemode === true ? "live" : "test")) result += " da annullare e rimborsare a mano su Stripe";
    else try {
      const sub = await d.stripe("GET", `/v1/subscriptions/${id}`, { "expand[]": "latest_invoice" });
      if (sub.status !== "canceled") await d.stripe("DELETE", `/v1/subscriptions/${id}`, {}, `uq-cancel-${id}`);
      const pi = await paymentIntentOf(d.stripe, sub.latest_invoice);
      if (pi) await d.stripe("POST", "/v1/refunds", { payment_intent: pi }, `uq-refund-${id}`);
      result += pi ? " annullato e rimborsato" : " annullato (rimborso da controllare su Stripe)";
    } catch (e) { d.log?.("duplicate", e); result += " da annullare a mano"; }
    await d.rpc("billing_event_note", { p_id: event.id, p_note: result }).catch(() => null);
  }
  return new Response(JSON.stringify({ received: true, result }), { status: 200, headers: { "content-type": "application/json" } });
}

// il pagamento di una fattura: campo "payment_intent" nelle versioni API fino al 2025,
// lista "payments" (InvoicePayment) dalla versione "basil" in poi
async function paymentIntentOf(stripe: StripeCall, inv: any): Promise<string | null> {
  if (!inv) return null;
  const id = (x: any) => (typeof x === "string" ? x : x?.id ?? null);
  if (inv.payment_intent) return id(inv.payment_intent);
  const fromList = (list: any) => {
    const p = (list?.data ?? []).find((x: any) => x?.status === "paid" && x?.payment?.payment_intent) ?? (list?.data ?? []).find((x: any) => x?.payment?.payment_intent);
    return p ? id(p.payment.payment_intent) : null;
  };
  if (inv.payments?.data) return fromList(inv.payments);
  const invId = id(inv);
  if (!invId) return null;
  const list = await stripe("GET", "/v1/invoice_payments", { invoice: invId, limit: 10 }).catch(() => null);
  return fromList(list);
}

export { form };
